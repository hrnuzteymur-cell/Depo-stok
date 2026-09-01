function renderCount() {
  return `
  <div class="card">
    <div class="card-title">Stok Sayımı</div>
    <div class="card-sub">Fiziksel sayımı sistem stoğuyla karşılaştırır. Onaylanan fark stokta uygulanır ve hareket geçmişine kaydedilir.</div>
    <div class="fgrid g2">
      <div class="field">
        <label>Ürün Kodu *</label>
        <div class="scan-row">
          <div class="field"><input id="cCode" placeholder="Kod veya tara" autocomplete="off" oninput="onCountChange()"></div>
          <button class="btn-scan" onclick="scanToInput('cCode', onCountChange)" title="Tara">📷</button>
        </div>
      </div>
      <div class="field"><label>Raf *</label><select id="cShelf" onchange="onCountChange()">${shelfOpts()}</select></div>
    </div>
    <div id="cInfo" class="alert alert-info" style="margin-top:10px;display:none"></div>
    <div class="fgrid g2" style="margin-top:12px">
      <div class="field"><label>Sistem Miktarı</label><input id="cSystem" type="text" value="—" readonly></div>
      <div class="field"><label>Fiziksel Sayım *</label><input id="cActual" type="number" min="0" step="0.01" placeholder="0" oninput="onCountChange()"></div>
    </div>
    <div id="cDiff" class="alert alert-info" style="margin-top:10px;display:none"></div>
    <div class="field" style="margin-top:12px"><label>Not</label><input id="cNote" placeholder="İsteğe bağlı"></div>
    <div class="btn-row"><button class="btn btn-primary" onclick="countSave()">Sayımı Onayla</button></div>
  </div>`;
}

function onCountChange() {
  const code = document.getElementById('cCode')?.value.trim() || '';
  const shelf = document.getElementById('cShelf')?.value || '';
  const actualRaw = document.getElementById('cActual')?.value ?? '';
  const info = document.getElementById('cInfo');
  const diffEl = document.getElementById('cDiff');
  const systemEl = document.getElementById('cSystem');
  if (!info || !diffEl || !systemEl) return;
  if (!code) { info.style.display = 'none'; diffEl.style.display = 'none'; systemEl.value = '—'; return; }
  const p = pBy(code);
  if (!p) { info.className = 'alert alert-warn'; info.textContent = 'Ürün kayıtlı değil.'; info.style.display = ''; diffEl.style.display = 'none'; systemEl.value = '—'; return; }
  if (!shelf) { info.className = 'alert alert-info'; info.textContent = `✓ ${p.description} · Raf seçin.`; info.style.display = ''; diffEl.style.display = 'none'; systemEl.value = '—'; return; }
  const systemQty = qtyAt(code, shelf);
  const unit = p.unit || 'Adet';
  systemEl.value = `${systemQty} ${unit}`;
  info.className = 'alert alert-success';
  info.textContent = `✓ ${p.description} · ${shelf} rafında sistemde ${systemQty} ${unit}`;
  info.style.display = '';
  if (actualRaw === '') { diffEl.style.display = 'none'; return; }
  const actual = Number(actualRaw);
  if (!Number.isFinite(actual) || actual < 0) { diffEl.className = 'alert alert-error'; diffEl.textContent = 'Fiziksel sayım 0 veya daha büyük olmalı.'; diffEl.style.display = ''; return; }
  const diff = actual - systemQty;
  diffEl.className = diff === 0 ? 'alert alert-success' : 'alert alert-warn';
  diffEl.textContent = diff === 0 ? '✓ Sayım sistem stoğuyla eşleşiyor.' : `Fark: ${diff > 0 ? '+' : ''}${diff} ${unit}`;
  diffEl.style.display = '';
}

function reconcileCount(code, shelf, counted) {
  const EPS = 1e-9;
  if (!pBy(code)) return { ok: false, error: 'Ürün kayıtlı değil' };
  if (!state.shelves.includes(shelf)) return { ok: false, error: 'Raf kayıtlı değil' };
  if (!Number.isFinite(counted) || counted < 0) return { ok: false, error: 'Sayım miktarı 0 veya daha büyük olmalı' };
  const before = qtyAt(code, shelf);
  const totalBefore = totalQty(code);
  const diff = counted - before;
  const snapshot = state.stock.map(row => ({ ...row }));
  if (diff > EPS) addStock(code, shelf, diff);
  else if (diff < -EPS && !remStock(code, shelf, -diff)) return { ok: false, error: 'Sayım düzeltmesi uygulanamadı' };
  const after = qtyAt(code, shelf);
  const totalAfter = totalQty(code);
  const valid = Math.abs(after - counted) <= EPS && Math.abs(totalAfter - (totalBefore + diff)) <= EPS;
  if (!valid) { state.stock = snapshot; return { ok: false, error: 'Sayım stok kontrolü başarısız. İşlem geri alındı.' }; }
  return { ok: true, before, counted, diff, totalBefore, totalAfter };
}

function countSave() {
  const code = document.getElementById('cCode').value.trim();
  const shelf = document.getElementById('cShelf').value;
  const actualRaw = document.getElementById('cActual').value;
  const note = document.getElementById('cNote')?.value.trim() || '';
  if (!code) { toast('Ürün kodu girin', 'err'); return; }
  if (!shelf) { toast('Raf seçin', 'err'); return; }
  if (actualRaw === '') { toast('Fiziksel sayım miktarını girin', 'err'); return; }
  const counted = Number(actualRaw);
  const result = reconcileCount(code, shelf, counted);
  if (!result.ok) { toast(result.error, 'err'); return; }
  const unit = pBy(code)?.unit || 'Adet';
  const sign = result.diff > 0 ? '+' : '';
  const countNote = `Sistem: ${result.before} ${unit} | Sayım: ${result.counted} ${unit} | Fark: ${sign}${result.diff} ${unit}${note ? ' | ' + note : ''}`;
  logMovement('SAYIM', code, Math.abs(result.diff), shelf, '', '', countNote);
  save();
  toast(result.diff === 0 ? 'Sayım doğru, fark yok' : `Sayım uygulandı: ${sign}${result.diff} ${unit}`);
  document.getElementById('cCode').value = '';
  document.getElementById('cActual').value = '';
  document.getElementById('cNote').value = '';
  onCountChange();
}

// ─── v24 / Aşama 6: Kritik Stok Seviyesi ────────────────────────────────────
function criticalMinOf(product) {
  const value = Number(product?.minStock);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function criticalStockItems() {
  return state.products
    .map(product => {
      const minStock = criticalMinOf(product);
      const currentStock = totalQty(product.productCode);
      return { product, minStock, currentStock };
    })
    .filter(item => item.minStock > 0 && item.currentStock <= item.minStock)
    .sort((a, b) => (a.currentStock - a.minStock) - (b.currentStock - b.minStock));
}

function setCriticalStockLevel(code, minimum) {
  const product = pBy(code);
  const value = Number(minimum);
  if (!product) return { ok: false, error: 'Ürün kayıtlı değil' };
  if (!Number.isFinite(value) || value < 0) return { ok: false, error: 'Kritik seviye 0 veya daha büyük olmalı' };

  const stockBefore = JSON.stringify(state.stock);
  const movementCountBefore = state.movements.length;
  product.minStock = value;

  if (JSON.stringify(state.stock) !== stockBefore || state.movements.length !== movementCountBefore) {
    return { ok: false, error: 'Kritik seviye kaydı stok verisini değiştirdi. İşlem iptal edildi.' };
  }
  return { ok: true, minimum: value, currentStock: totalQty(code), critical: value > 0 && totalQty(code) <= value };
}

function criticalProductOptions() {
  if (!state.products.length) return '<option value="">— Önce ürün ekleyin —</option>';
  return '<option value="">— Ürün seçin —</option>' + state.products
    .map(p => `<option value="${esc(p.productCode)}">${esc(p.productCode)} · ${esc(p.description)}</option>`)
    .join('');
}

function criticalListHtml(items) {
  if (!items.length) return '<div class="alert alert-success">✓ Kritik seviyenin altında ürün yok.</div>';
  return `<div class="stock-locs">${items.map(item => {
    const p = item.product;
    const unit = p.unit || 'Adet';
    return `<div class="stock-loc-row"><span class="loc-name">⚠ ${esc(p.description)} <span style="color:var(--muted);font-weight:600">(${esc(p.productCode)})</span></span><span class="loc-qty" style="color:var(--red)">${item.currentStock.toLocaleString('tr-TR')} / min ${item.minStock.toLocaleString('tr-TR')} ${esc(unit)}</span></div>`;
  }).join('')}</div>`;
}

function updateCriticalEditor() {
  const code = document.getElementById('criticalProduct')?.value || '';
  const input = document.getElementById('criticalMin');
  const info = document.getElementById('criticalInfo');
  if (!input || !info) return;
  if (!code) { input.value = ''; info.style.display = 'none'; return; }
  const p = pBy(code);
  if (!p) { input.value = ''; info.style.display = 'none'; return; }
  input.value = criticalMinOf(p) || 0;
  const unit = p.unit || 'Adet';
  const current = totalQty(code);
  info.className = 'alert alert-info';
  info.textContent = `Mevcut stok: ${current} ${unit}. 0 değeri kritik stok takibini kapatır.`;
  info.style.display = '';
}

function saveCriticalStockLevel() {
  const code = document.getElementById('criticalProduct')?.value || '';
  const raw = document.getElementById('criticalMin')?.value ?? '';
  if (!code) { toast('Ürün seçin', 'err'); return; }
  if (raw === '') { toast('Kritik stok seviyesini girin', 'err'); return; }
  const result = setCriticalStockLevel(code, Number(raw));
  if (!result.ok) { toast(result.error, 'err'); return; }
  save();
  toast(result.minimum === 0 ? 'Kritik stok takibi kapatıldı' : `Kritik stok seviyesi ${result.minimum} olarak kaydedildi`);
  renderPage();
}

function injectCriticalStockUI() {
  const dashboard = document.querySelector('.page-dashboard');
  if (dashboard && !dashboard.querySelector('[data-critical-dashboard]')) {
    const items = criticalStockItems();
    if (items.length) {
      const card = document.createElement('div');
      card.className = 'card';
      card.dataset.criticalDashboard = '1';
      card.style.borderColor = '#fecaca';
      card.innerHTML = `<div class="card-title" style="color:var(--red)">⚠ Kritik Stok (${items.length})</div>${criticalListHtml(items)}`;
      const actions = dashboard.querySelector('.action-grid');
      if (actions) dashboard.insertBefore(card, actions);
      else dashboard.appendChild(card);
    }
  }

  const products = document.querySelector('.page-products');
  if (products && !products.querySelector('[data-critical-manager]')) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.criticalManager = '1';
    card.innerHTML = `
      <div class="card-title">Kritik Stok Seviyesi</div>
      <div class="card-sub">Ürün toplam stoğu bu seviyeye veya altına düştüğünde ana sayfada uyarı gösterilir. 0 = takip kapalı.</div>
      <div class="fgrid g2">
        <div class="field"><label>Ürün</label><select id="criticalProduct" onchange="updateCriticalEditor()">${criticalProductOptions()}</select></div>
        <div class="field"><label>Minimum Stok</label><input id="criticalMin" type="number" min="0" step="0.01" placeholder="0"></div>
      </div>
      <div id="criticalInfo" class="alert alert-info" style="display:none"></div>
      <div class="btn-row"><button class="btn btn-primary" onclick="saveCriticalStockLevel()">Kritik Seviyeyi Kaydet</button></div>
      <div class="divider"></div>
      <div class="card-title" style="margin-bottom:8px">Şu An Kritik Olanlar</div>
      ${criticalListHtml(criticalStockItems())}`;
    const first = products.firstElementChild;
    if (first?.nextSibling) products.insertBefore(card, first.nextSibling);
    else products.appendChild(card);
  }
}

function startCriticalStockObserver() {
  injectCriticalStockUI();
  const page = document.getElementById('page');
  if (!page || page.dataset.criticalObserver === '1') return;
  page.dataset.criticalObserver = '1';
  const observer = new MutationObserver(() => requestAnimationFrame(injectCriticalStockUI));
  observer.observe(page, { childList: true, subtree: true });
}

window.renderCount = renderCount;
window.onCountChange = onCountChange;
window.reconcileCount = reconcileCount;
window.countSave = countSave;
window.criticalMinOf = criticalMinOf;
window.criticalStockItems = criticalStockItems;
window.setCriticalStockLevel = setCriticalStockLevel;
window.updateCriticalEditor = updateCriticalEditor;
window.saveCriticalStockLevel = saveCriticalStockLevel;
window.injectCriticalStockUI = injectCriticalStockUI;

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startCriticalStockObserver);
else setTimeout(startCriticalStockObserver, 0);
