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

window.renderCount = renderCount;
window.onCountChange = onCountChange;
window.reconcileCount = reconcileCount;
window.countSave = countSave;
