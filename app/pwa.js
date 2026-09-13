'use strict';

(() => {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const nativeApp = location.hostname === 'appassets.androidplatform.net';
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const android = /android/i.test(navigator.userAgent);
  let deferredPrompt = null;

  const installDialog = document.createElement('dialog');
  installDialog.id = 'install-dialog';
  installDialog.setAttribute('aria-labelledby', 'install-title');
  installDialog.innerHTML = `
    <div class="dialog-heading">
      <h2 id="install-title">Gestor no celular</h2>
      <button type="button" class="icon-button" aria-label="Fechar instruções">×</button>
    </div>
    <div class="install-body"></div>
    <p class="offline-state" role="status">Preparando uso sem internet…</p>
  `;
  document.body.appendChild(installDialog);
  installDialog.querySelector('button').onclick = () => installDialog.close();

  const body = installDialog.querySelector('.install-body');
  const status = installDialog.querySelector('.offline-state');

  function installCopy() {
    if (nativeApp) {
      return '<p class="field-hint">Você já está no aplicativo Android. Os registros ficam neste celular. Use <strong>Baixar backup</strong> antes de trocar de aparelho.</p>';
    }
    if (standalone) {
      return '<p class="field-hint">O Gestor já está instalado neste dispositivo. Os registros ficam aqui e não são sincronizados com o computador ou outro celular.</p>';
    }
    if (ios) {
      return `
        <ol class="install-steps">
          <li>Abra este endereço no <strong>Safari</strong>.</li>
          <li>Toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.</li>
          <li>Se aparecer, ative <strong>Abrir como App da Web</strong> e toque em <strong>Adicionar</strong>.</li>
          <li>Abra o Gestor pelo novo ícone, ainda com internet, e aguarde <strong>Pronto para usar sem internet</strong>.</li>
        </ol>
        <p class="field-hint">Crie seu perfil dentro do aplicativo instalado. Os registros deste iPhone não são transferidos automaticamente do computador.</p>`;
    }
    if (deferredPrompt || android) {
      return `
        <ol class="install-steps">
          <li>Toque em <strong>Instalar agora</strong> se o botão aparecer, ou abra o menu do Chrome e escolha <strong>Instalar aplicativo</strong>.</li>
          <li>Confirme a instalação e abra o ícone <strong>Gestor</strong> na tela inicial.</li>
          <li>Com internet, aguarde <strong>Pronto para usar sem internet</strong> antes de desconectar.</li>
        </ol>
        <p class="field-hint">No Android você também pode instalar o arquivo APK publicado nas Actions do GitHub. Os dados ficam neste aparelho.</p>
        ${deferredPrompt ? '<button type="button" class="primary wide install-now">Instalar agora</button>' : ''}`;
    }
    return `
      <ol class="install-steps">
        <li>No celular, abra este endereço em <strong>Chrome</strong> (Android) ou <strong>Safari</strong> (iPhone).</li>
        <li>Instale pela opção do navegador ou use o APK Android das Actions do GitHub.</li>
        <li>Crie o perfil dentro do aplicativo instalado neste aparelho.</li>
      </ol>`;
  }

  function renderInstall() {
    body.innerHTML = installCopy();
    const now = body.querySelector('.install-now');
    if (now) {
      now.onclick = async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        renderInstall();
        installDialog.close();
      };
    }
  }

  renderInstall();
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    renderInstall();
    for (const button of document.querySelectorAll('.install-button')) {
      button.textContent = 'Instalar aplicativo ↗';
    }
  });

  const buttonLabel = nativeApp || standalone
    ? 'Aplicativo e uso offline'
    : ios
      ? 'Instalar no iPhone ↗'
      : android
        ? 'Instalar no Android ↗'
        : 'Instalar no celular ↗';

  for (const parent of [document.querySelector('.auth-card'), document.querySelector('.main-footer')]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'text-button install-button';
    button.textContent = buttonLabel;
    button.onclick = () => {
      renderInstall();
      installDialog.showModal();
    };
    parent.appendChild(button);
  }

  const badge = document.createElement('p');
  badge.className = 'offline-badge';
  badge.setAttribute('role', 'status');
  document.querySelector('.auth-card').appendChild(badge);

  function setStatus(message) {
    status.textContent = badge.textContent = message;
  }

  if (nativeApp) {
    setStatus('Aplicativo Android com os arquivos neste aparelho.');
    return;
  }

  if (!window.isSecureContext || !('serviceWorker' in navigator)) {
    setStatus('A instalação e o uso offline precisam de um endereço HTTPS e um navegador compatível.');
    return;
  }

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
      if (registration.waiting) {
        setStatus('Atualização pronta. Feche todas as janelas do Gestor e abra novamente.');
        return;
      }

      const worker = registration.installing;
      if (worker) {
        worker.addEventListener('statechange', () => {
          if (worker.state === 'redundant') setStatus('Não foi possível preparar o uso offline. Confira a conexão e abra o aplicativo novamente.');
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            setStatus('Atualização pronta. Feche todas as janelas do Gestor e abra novamente.');
          }
        });
      }
      await navigator.serviceWorker.ready;
      if (!registration.waiting) setStatus('Pronto para usar sem internet');
    } catch {
      setStatus('O uso offline ainda não está pronto. Confira a conexão e abra o aplicativo novamente.');
    }
  });
})();
