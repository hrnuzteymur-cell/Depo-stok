let deferredInstallPrompt = null;
let inventoryActionLocked = false;
let lastIntegrityAudit = null;

function renderIntegrityStatus() {
  const target = document.getElementById('topbarExtra');
  if (!target || !lastIntegrityAudit) return;
  target.querySelector('#stockIntegrityBtn')?.remove();
  const button = document.createElement('button');
  button.id = 'stockIntegrityBtn';
  button.className = lastIntegrityAudit.ok ? 'btn btn-secondary' : 'btn btn-danger';
  button.style.cssText = 'font-size:11px;padding:7px 10px;margin-left:6px';
  button.textContent = lastIntegrityAudit.ok
    ? (lastIntegrityAudit.warnings?.length ? `Stok ✓ · ${lastIntegrityAudit.warnings.length} uyarı` : 'Stok ✓')
    : `Stok ⚠ · ${lastIntegrityAudit.issues?.length || 1} hata`;
  button.title = 'Stok tutarlılık kontrolünü yeniden çalıştır';
  button.addEventListener('click', () => runStockConsistencyCheck({ silent: false }));
  target.appendChild(button);
}

function renderInstallButton() {
  const target = document.getElementById('topbarExtra');
  if (!target) return;
  target.querySelector('#installAppBtn')?.remove();
  if (deferredInstallPrompt) {
    const button = document.createElement('button');
    button.className = 'btn btn-primary';
    button.id = 'installAppBtn';
    button.style.cssText = 'font-size:11px;padding:7px 12px';
    button.textContent = '📲 Uygulamayı Yükle';
    button.addEventListener('click', installKansanApp);
    target.prepend(button);
  }
  renderIntegrityStatus();
}

async function installKansanApp() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  renderInstallButton();
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  renderInstallButton();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  renderInstallButton();
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

function runStockConsistencyCheck({ silent = false } = {}) {
  const guards = window.KansanInventoryGuards;
  if (!guards?.auditState) {
    if (!silent) toast('Stok tutarlılık modülü hazır değil', 'err');
    return null;
  }

  const audit = guards.auditState(state);
  lastIntegrityAudit = {
    ...audit,
    checkedAt: new Date().toISOString()
  };

  try {
    localStorage.setItem('kansan-depo-v3-integrity', JSON.stringify(lastIntegrityAudit));
  } catch {}

  renderIntegrityStatus();

  if (!silent) {
    if (!audit.ok) {
      toast(audit.issues[0]?.message || 'Stok tutarlılık hatası bulundu', 'err');
    } else if (audit.warnings.length) {
      toast(`Stok tutarlı; ${audit.warnings.length} düzenleme uyarısı var`, 'info');
    } else {
      toast(`Stok tutarlı ✓ Toplam ${audit.summary.totalQty.toLocaleString('tr-TR')} birim`, 'ok');
    }
  }
  return audit;
}
window.runStockConsistencyCheck = runStockConsistencyCheck;

function rollbackInventory(snapshot, message) {
  state.stock = snapshot.stock;
  state.movements = snapshot.movements;
  state.pendingCode = snapshot.pendingCode;
  save();
  renderPage();
  runStockConsistencyCheck({ silent: true });
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
      } else {
        runStockConsistencyCheck({ silent: true });
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
    runStockConsistencyCheck({ silent: true });
  } catch (error) {
    console.error(error);
  }
});

window.installKansanApp = installKansanApp;
