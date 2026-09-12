const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, 'financeiro_lo-');
const port = Number(process.env.PORT || 8080);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

const server = http.createServer((request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    return response.end();
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    response.writeHead(400);
    return response.end('Endereço inválido');
  }

  const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!file.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403);
    return response.end('Acesso não permitido');
  }

  fs.readFile(file, (error, content) => {
    response.writeHead(error ? 404 : 200, {
      'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : error ? 'Arquivo não encontrado' : content);
  });
});

server.on('error', error => {
  console.error(error.code === 'EADDRINUSE'
    ? `A porta ${port} já está em uso. Feche o outro servidor ou escolha outra porta pela variável PORT.`
    : error.message);
  process.exitCode = 1;
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Gestor disponível em http://127.0.0.1:${port}`);
  console.log('Mantenha este terminal aberto. Use Ctrl+C para encerrar.');
});
