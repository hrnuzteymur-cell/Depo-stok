function reportMovementCounts() {
  const labels = { GIRIS: 'Giriş', CIKIS: 'Çıkış', TRANSFER: 'Transfer', MAKINE: 'Makine', SAYIM: 'Sayım' };
  return Object.entries(labels).map(([type, label]) => ({
    type,
    label,
    count: state.movements.filter(m => m.type === type).length
  }));
}

function renderReports() {
  const critical = typeof criticalStockItems === 'function' ? criticalStockItems() : [];
  const stockedProducts = state.products.filter(p => totalQty(p.productCode) > 0).length;
  const emptyProducts = state.products.length - stockedProducts;
  const shelfRows = state.shelves.map(shelf => {
    const rows = state.stock.filter(s => s.location === shelf && s.qty > 0);
    return {
      shelf,
      productCount: new Set(rows.map(r => r.barcode)).size,
      stockRows: rows.length
    };
  }).sort((a, b) => b.productCount - a.productCount || a.shelf.localeCompare(b.shelf, 'tr'));
  const productRows = state.products.map(product => ({
    product,
    qty: totalQty(product.productCode),
    locations: new Set(state.stock.filter(s => s.barcode === product.productCode && s.qty > 0).map(s => s.location)).size
  })).sort((a, b) => a.product.description.localeCompare(b.product.description, 'tr'));
  const movementCounts = reportMovementCounts();

  return `
  <div class="stat-grid">
    <div class="stat"><div class="stat-value">${state.products.length}</div><div class="stat-label">Toplam Ürün</div></div>
    <div class="stat"><div class="stat-value">${stockedProducts}</div><div class="stat-label">Stoklu Ürün</div></div>
    <div class="stat"><div class="stat-value">${emptyProducts}</div><div class="stat-label">Stoksuz Ürün</div></div>
    <div class="stat"><div class="stat-value" style="color:${critical.length ? 'var(--red)' : 'var(--green)'}">${critical.length}</div><div class="stat-label">Kritik Stok</div></div>
  </div>

  <div class="card">
    <div class="card-title">Hareket Özeti</div>
    <div class="stat-grid">
      ${movementCounts.map(item => `<div class="stat"><div class="stat-value">${item.count}</div><div class="stat-label">${item.label}</div></div>`).join('')}
    </div>
  </div>

  <div class="card">
    <div class="card-title">Raf Doluluk Özeti (${state.shelves.length})</div>
    ${shelfRows.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Raf</th><th>Farklı Ürün</th><th>Stok Kaydı</th></tr></thead>
      <tbody>${shelfRows.map(row => `<tr><td><b>${esc(row.shelf)}</b></td><td>${row.productCount}</td><td>${row.stockRows}</td></tr>`).join('')}</tbody>
    </table></div>` : '<div class="empty-state">Henüz raf tanımlanmadı.</div>'}
  </div>

  <div class="card">
    <div class="card-title">Ürün Stok Raporu (${productRows.length})</div>
    ${productRows.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Ürün Kodu</th><th>Ürün</th><th>Toplam Stok</th><th>Bulunduğu Raf</th><th>Kritik Seviye</th></tr></thead>
      <tbody>${productRows.map(row => {
        const product = row.product;
        const minimum = typeof criticalMinOf === 'function' ? criticalMinOf(product) : 0;
        const isCritical = minimum > 0 && row.qty <= minimum;
        return `<tr>
          <td><b>${esc(product.productCode)}</b></td>
          <td>${esc(product.description)}</td>
          <td><b style="color:${isCritical ? 'var(--red)' : 'var(--brand)'}">${row.qty.toLocaleString('tr-TR')} ${esc(product.unit || 'Adet')}</b></td>
          <td>${row.locations}</td>
          <td>${minimum ? minimum.toLocaleString('tr-TR') : '—'}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>` : '<div class="empty-state">Henüz ürün kaydı yok.</div>'}
  </div>`;
}

window.renderReports = renderReports;
