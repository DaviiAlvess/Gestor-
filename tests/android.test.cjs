const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const activity = path.join(root, 'android/app/src/main/java/com/davialvess/gestor/MainActivity.java');

test('o pacote Android empacota o aplicativo local e os fluxos de arquivo', () => {
  const source = fs.readFileSync(activity, 'utf8');
  assert.match(source, /WebViewAssetLoader/);
  assert.match(source, /GestorAndroid/);
  assert.match(source, /onShowFileChooser/);
  assert.match(source, /ACTION_CREATE_DOCUMENT/);
  assert.ok(fs.existsSync(path.join(root, 'android/app/src/main/AndroidManifest.xml')));
  assert.ok(fs.existsSync(path.join(root, 'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png')));
  assert.ok(fs.existsSync(path.join(root, 'scripts/sync-android.cjs')));
});
