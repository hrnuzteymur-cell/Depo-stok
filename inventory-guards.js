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

  function auditState(state) {
    const issues = [];
    const warnings = [];
    if (!state || typeof state !== 'object') {
      return {
        ok: false,
        issues: [{ code: 'INVALID_STATE', message: 'Uygulama durumu geçersiz' }],
        warnings,
        summary: { products: 0, stockRows: 0, shelves: 0, machines: 0, movements: 0, totalQty: 0 }
      };
    }

    const products = Array.isArray(state.products) ? state.products : [];
    const stock = Array.isArray(state.stock) ? state.stock : [];
    const shelvesRaw = Array.isArray(state.shelves) ? state.shelves : [];
    const machinesRaw = Array.isArray(state.machines) ? state.machines : [];
    const movements = Array.isArray(state.movements) ? state.movements : [];

    const productCodes = new Set();
    const shelfCodes = new Set();
    const machineCodes = new Set();
    const stockKeys = new Set();
    let totalQty = 0;

    for (const shelf of shelvesRaw) {
      const code = String(shelf || '').trim().toUpperCase();
      if (!code) {
        issues.push({ code: 'EMPTY_SHELF', message: 'Boş raf kodu bulundu' });
        continue;
      }
      if (shelfCodes.has(code)) warnings.push({ code: 'DUPLICATE_SHELF', message: `Tekrarlanan raf kodu: ${code}` });
      shelfCodes.add(code);
    }

    for (const machine of machinesRaw) {
      const code = String(machine || '').trim().toUpperCase();
      if (!code) {
        issues.push({ code: 'EMPTY_MACHINE', message: 'Boş makine kodu bulundu' });
        continue;
      }
      if (machineCodes.has(code)) warnings.push({ code: 'DUPLICATE_MACHINE', message: `Tekrarlanan makine kodu: ${code}` });
      machineCodes.add(code);
    }

    for (const product of products) {
      const code = String(product?.productCode || product?.barcode || product?.code || '').trim();
      if (!code) {
        issues.push({ code: 'EMPTY_PRODUCT', message: 'Ürün kodu boş kayıt bulundu' });
        continue;
      }
      if (productCodes.has(code)) issues.push({ code: 'DUPLICATE_PRODUCT', message: `Tekrarlanan ürün kodu: ${code}` });
      productCodes.add(code);
    }

    for (const row of stock) {
      const code = String(row?.barcode || row?.productCode || '').trim();
      const location = String(row?.location || '').trim().toUpperCase();
      const qty = Number(row?.qty);
      if (!productCodes.has(code)) issues.push({ code: 'UNKNOWN_PRODUCT_STOCK', message: `Kayıtsız ürüne ait stok bulundu: ${code || '?'}` });
      if (!shelfCodes.has(location)) issues.push({ code: 'UNKNOWN_SHELF_STOCK', message: `Kayıtsız rafta stok bulundu: ${location || '?'}` });
      if (!Number.isFinite(qty) || qty <= EPS) {
        issues.push({ code: 'INVALID_QTY', message: `Geçersiz stok miktarı: ${code || '?'}` });
      } else {
        totalQty += qty;
      }

      const key = `${code}\u0000${location}`;
      if (stockKeys.has(key)) {
        warnings.push({ code: 'DUPLICATE_STOCK_ROW', message: `Aynı ürün ve raf için birden fazla stok satırı var: ${code || '?'} / ${location || '?'}` });
      }
      stockKeys.add(key);
    }

    if (!Number.isFinite(totalQty) || totalQty < -EPS) {
      issues.push({ code: 'INVALID_TOTAL', message: 'Toplam stok matematiği geçersiz' });
    }

    return {
      ok: issues.length === 0,
      issues,
      warnings,
      summary: {
        products: products.length,
        stockRows: stock.length,
        shelves: shelvesRaw.length,
        machines: machinesRaw.length,
        movements: movements.length,
        totalQty
      }
    };
  }

  function validateState(state) {
    const audit = auditState(state);
    return audit.ok
      ? { ok: true }
      : { ok: false, error: audit.issues[0]?.message || 'Stok bütünlüğü geçersiz' };
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

  return { EPS, positiveQty, auditState, validateState, validateEntry, validateTransfer, validateMachine, totalFor };
});
