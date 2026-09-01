let deferredInstallPrompt = null;

function renderInstallButton() {
  const target = document.getElementById('topbarExtra');
  if (!target || !deferredInstallPrompt) return;
  target.innerHTML = '<button class="btn btn-primary" id="installAppBtn" style="font-size:11px;padding:7px 12px">📲 Uygulamayı Yükle</button>';
  document.getElementById('installAppBtn')?.addEventListener('click', installKansanApp);
}

async function installKansanApp() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  const target = document.getElementById('topbarExtra');
  if (target) target.innerHTML = '';
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  renderInstallButton();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  const target = document.getElementById('topbarExtra');
  if (target) target.innerHTML = '';
});

window.addEventListener('load', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  renderInstallButton();
});

window.installKansanApp = installKansanApp;
