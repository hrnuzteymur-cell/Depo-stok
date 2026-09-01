(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.KansanInventoryGuards = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const EPS = 1e-9;

  function positiveQty(value) {
    const qty = Number(value);
    return Number.isFinite(qty) && qty > EPS
      ? { ok: true, qty }
      : { ok: false, error: 'Miktar sıfırdan büyük ve geçerli bir sayı olmalı' };
  }

  function validateState(state) {
    if (!state || typeof state !== 'object') return { ok: false, error: 'Uygulama durumu geçersiz' };
    const products = Array.isArray(state.products) ? state.products : [];
    const stock = Array.isArray(state.stock) ? state.stock : [];
    const shelves = new Set((Array.isArray(state.shelves) ? state.shelves : []).map(v => String(v).trim().toUpperCase()));
    const productCodes = new Set();

    for (const product of products) {
      const code = String(product?.productCode || product?.barcode || product?.code || '').trim();
      if (!code) return { ok: false, error: 'Ürün kodu boş kayıt bulundu' };
      if (productCodes.has(code)) return { ok: false, error: `Tekrarlanan ürün kodu: ${code}` };
      productCodes.add(code);
    }

    for (const row of stock) {
      const code = String(row?.barcode || row?.productCode || '').trim();
      const location = String(row?.location || '').trim().toUpperCase();
      const qty = Number(row?.qty);
      if (!productCodes.has(code)) return { ok: false, error: `Kayıtsız ürüne ait stok bulundu: ${code || '?'}` };
      if (!shelves.has(location)) return { ok: false, error: `Kayıtsız rafta stok bulundu: ${location || '?'}` };
      if (!Number.isFinite(qty) || qty <= EPS) return { ok: false, error: `Geçersiz stok miktarı: ${code}` };
    }
    return { ok: true };
  }

  function validateEntry({ code, shelf, qty, state }) {
    const q = positiveQty(qty);
    if (!q.ok) return q;
    if (!String(code || '').trim()) return { ok: false, error: 'Ürün kodu gerekli' };
    if (!state.products.some(p => String(p.productCode || '').trim() === String(code).trim())) return { ok: false, error: 'Ürün kayıtlı değil' };
    if (!state.shelves.includes(String(shelf || '').trim().toUpperCase())) return { ok: false, error: 'Raf kayıtlı değil' };
    return { ok: true, qty: q.qty };
  }

  function validateTransfer({ code, from, to, qty, state, available }) {
    const base = validateEntry({ code, shelf: from, qty, state });
    if (!base.ok) return base;
    const target = String(to || '').trim().toUpperCase();
    if (!state.shelves.includes(target)) return { ok: false, error: 'Hedef raf kayıtlı değil' };
    if (String(from).trim().toUpperCase() === target) return { ok: false, error: 'Kaynak ve hedef raf aynı olamaz' };
    if (Number(available) + EPS < base.qty) return { ok: false, error: 'Kaynak rafta yeterli stok yok' };
    return { ok: true, qty: base.qty };
  }

  function validateMachine({ code, machine, from, qty, state, available }) {
    const base = validateEntry({ code, shelf: from, qty, state });
    if (!base.ok) return base;
    if (!state.machines.includes(String(machine || '').trim().toUpperCase())) return { ok: false, error: 'Makine kayıtlı değil' };
    if (Number(available) + EPS < base.qty) return { ok: false, error: 'Çıkış rafında yeterli stok yok' };
    return { ok: true, qty: base.qty };
  }

  function totalFor(state, code) {
    return (state.stock || []).filter(s => s.barcode === code).reduce((sum, s) => sum + Number(s.qty || 0), 0);
  }

  return { EPS, positiveQty, validateState, validateEntry, validateTransfer, validateMachine, totalFor };
});
