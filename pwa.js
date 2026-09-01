let deferredInstallPrompt = null;
let inventoryActionLocked = false;

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

function loadInventoryGuards() {
  if (window.KansanInventoryGuards) return Promise.resolve(window.KansanInventoryGuards);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = './inventory-guards.js';
    script.onload = () => resolve(window.KansanInventoryGuards);
    script.onerror = () => reject(new Error('İşlem koruma modülü yüklenemedi'));
    document.head.appendChild(script);
  });
}

function rollbackInventory(snapshot, message) {
  state.stock = snapshot.stock;
  state.movements = snapshot.movements;
  state.pendingCode = snapshot.pendingCode;
  save();
  renderPage();
  toast(message || 'Stok bütünlük kontrolü başarısız. İşlem geri alındı.', 'err');
}

function patchInventoryAction(name, buildValidation, expectedDelta) {
  const original = window[name];
  if (typeof original !== 'function' || original.__kansanGuarded) return;

  const wrapped = function (...args) {
    if (inventoryActionLocked) {
      toast('Önceki stok işlemi tamamlanıyor', 'err');
      return;
    }
    const guards = window.KansanInventoryGuards;
    if (!guards) {
      toast('İşlem koruma modülü hazır değil', 'err');
      return;
    }

    const validationInput = buildValidation();
    const checked = validationInput.type === 'transfer'
      ? guards.validateTransfer(validationInput.data)
      : validationInput.type === 'machine'
        ? guards.validateMachine(validationInput.data)
        : guards.validateEntry(validationInput.data);
    if (!checked.ok) {
      toast(checked.error, 'err');
      return;
    }

    const code = String(validationInput.data.code || '').trim();
    const snapshot = {
      stock: state.stock.map(row => ({ ...row })),
      movements: state.movements.map(row => ({ ...row })),
      pendingCode: state.pendingCode
    };
    const beforeTotal = guards.totalFor(state, code);
    const beforeMoves = state.movements.length;
    inventoryActionLocked = true;
    try {
      original.apply(this, args);
      const integrity = guards.validateState(state);
      const afterTotal = guards.totalFor(state, code);
      const delta = afterTotal - beforeTotal;
      const movementDelta = state.movements.length - beforeMoves;
      if (!integrity.ok || Math.abs(delta - expectedDelta(checked.qty)) > guards.EPS || movementDelta !== 1) {
        rollbackInventory(snapshot, integrity.ok ? 'Stok matematiği doğrulanamadı. İşlem geri alındı.' : `${integrity.error}. İşlem geri alındı.`);
      }
    } catch (error) {
      rollbackInventory(snapshot, 'İşlem sırasında hata oluştu. Stok geri alındı.');
      console.error(error);
    } finally {
      setTimeout(() => { inventoryActionLocked = false; }, 400);
    }
  };
  wrapped.__kansanGuarded = true;
  window[name] = wrapped;
}

function enableInventoryGuards() {
  const guards = window.KansanInventoryGuards;
  const initial = guards.validateState(state);
  if (!initial.ok) {
    console.warn('Başlangıç stok bütünlüğü uyarısı:', initial.error);
  }

  patchInventoryAction('entrySave', () => ({
    type: 'entry',
    data: {
      code: document.getElementById('eCode')?.value,
      shelf: document.getElementById('eShelf')?.value,
      qty: document.getElementById('eQty')?.value,
      state
    }
  }), qty => qty);

  patchInventoryAction('placePending', () => ({
    type: 'entry',
    data: {
      code: state.pendingCode,
      shelf: document.getElementById('npShelf')?.value,
      qty: document.getElementById('npQty')?.value,
      state
    }
  }), qty => qty);

  patchInventoryAction('transferSave', () => {
    const code = document.getElementById('tCode')?.value;
    const from = document.getElementById('tFrom')?.value;
    return {
      type: 'transfer',
      data: {
        code,
        from,
        to: document.getElementById('tTo')?.value,
        qty: document.getElementById('tQty')?.value,
        state,
        available: qtyAt(String(code || '').trim(), String(from || '').trim().toUpperCase())
      }
    };
  }, () => 0);

  patchInventoryAction('machineSave', () => {
    const code = document.getElementById('mCode')?.value;
    const from = document.getElementById('mFrom')?.value;
    return {
      type: 'machine',
      data: {
        code,
        machine: document.getElementById('mMachine')?.value,
        from,
        qty: document.getElementById('mQty')?.value,
        state,
        available: qtyAt(String(code || '').trim(), String(from || '').trim().toUpperCase())
      }
    };
  }, qty => -qty);
}

window.addEventListener('load', async () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  renderInstallButton();
  try {
    await loadInventoryGuards();
    enableInventoryGuards();
  } catch (error) {
    console.error(error);
  }
});

window.installKansanApp = installKansanApp;
