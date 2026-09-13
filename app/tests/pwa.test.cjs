const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

function worker(overrides = {}) {
  const handlers = {};
  const context = vm.createContext({
    URL, Set,
    self: {
      registration: { scope: 'https://example.test/gestor/' },
      clients: { claim: async () => {} },
      addEventListener: (name, callback) => handlers[name] = callback,
    },
    caches: { open: async () => ({ addAll: async () => {}, match: async () => undefined }), keys: async () => [], delete: async () => {} },
    fetch: async () => { throw new Error('Sem internet'); },
    ...overrides,
  });
  vm.runInContext(source, context);
  return { handlers, context };
}

test('todos os arquivos do cache offline existem no pacote', () => {
  const { context } = worker();
  for (const relative of vm.runInContext('PRECACHE', context)) {
    assert.ok(fs.existsSync(path.resolve(root, relative)), relative);
  }
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(html.includes('apple-touch-icon'));
  assert.ok(html.includes('viewport-fit=cover'));
  assert.ok(!/src="https:/.test(html));
  const pwa = fs.readFileSync(path.join(root, 'pwa.js'), 'utf8');
  assert.match(pwa, /beforeinstallprompt/);
  assert.match(pwa, /Adicionar à Tela de Início/);
  assert.match(pwa, /Instalar no Android/);
  assert.match(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), /GestorAndroid/);
  assert.ok(!fs.readFileSync(path.join(root, 'vendor/fonts.css'), 'utf8').includes('https:'));
});

test('manifest usa escopo relativo e ícones PNG existentes', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest')));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  for (const icon of manifest.icons) {
    const png = fs.readFileSync(path.join(root, icon.src));
    const size = Number(icon.sizes.split('x')[0]);
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
});

test('a instalação não se completa com arquivos faltando', async () => {
  const { handlers } = worker({ caches: { open: async () => ({ addAll: async () => { throw Error('Download interrompido'); } }) } });
  let promise;
  handlers.install({ waitUntil: p => promise = p });
  await assert.rejects(promise, /Download interrompido/);
});

test('navegação offline devolve o aplicativo do cache mesmo com parâmetros', async () => {
  const cached = { body: 'Gestor offline' };
  let requested;
  const { handlers } = worker({ caches: { open: async () => ({ match: async key => { requested = key; return cached; } }) } });
  let response;
  handlers.fetch({ request: { method: 'GET', mode: 'navigate', url: 'https://example.test/gestor/?origem=icone' }, respondWith: p => response = p });
  assert.equal(await response, cached);
  assert.equal(requested, 'https://example.test/gestor/index.html');
});

test('arquivos SQLite são servidos do cache sem conexão', async () => {
  const cached = { bytes: 'wasm' };
  const { handlers } = worker({ caches: { open: async () => ({ match: async () => cached }) } });
  let response;
  handlers.fetch({ request: { method: 'GET', url: 'https://example.test/gestor/vendor/sql-wasm.wasm' }, respondWith: p => response = p });
  assert.equal(await response, cached);
});

test('o cache não intercepta envios, outros sites ou rotas de autenticação', () => {
  const { handlers } = worker();
  for (const request of [
    { method: 'POST', url: 'https://example.test/gestor/' },
    { method: 'GET', url: 'https://another.test/' },
    { method: 'GET', mode: 'navigate', url: 'https://example.test/auth/callback' },
  ]) handlers.fetch({ request, respondWith: () => assert.fail('Requisição indevidamente interceptada') });
});

test('atualização remove apenas versões antigas do cache do aplicativo', async () => {
  const deleted = [];
  const { handlers } = worker({ caches: { keys: async () => ['gestor-shell-old', 'other-app', 'gestor-shell-development-v1'], delete: async name => deleted.push(name) } });
  let promise;
  handlers.activate({ waitUntil: p => promise = p });
  await promise;
  assert.deepEqual(deleted, ['gestor-shell-old']);
});

test('SQLite inicializa com arquivos locais e reabre registros exportados', async () => {
  const initialize = require('../vendor/sql-wasm.js');
  const SQL = await initialize({ locateFile: name => path.join(root, 'vendor', name) });
  const db = new SQL.Database();
  db.run('CREATE TABLE transactions (description TEXT, amount REAL)');
  db.run('INSERT INTO transactions VALUES (?, ?)', ['Teste offline', 33.34]);
  const restored = new SQL.Database(db.export());
  assert.deepEqual(restored.exec('SELECT * FROM transactions')[0].values, [['Teste offline', 33.34]]);
  restored.close(); db.close();
});
