from pathlib import Path
import re

p = Path('index.html')
s = p.read_text(encoding='utf-8')
s = re.sub(r'<script id="KANSAN_RAF_URUN_AKIS_V1">.*?</script>', '', s, flags=re.S)

patch = r'''<script id="KANSAN_RAF_URUN_AKIS_V1">
(function(){
  if(!Array.isArray(state.shelves)) state.shelves=[];
  state.stock.forEach(function(x){
    const r=String(x.location||'').trim().toUpperCase();
    if(r && !state.shelves.includes(r)) state.shelves.push(r);
  });
  if(typeof state.pendingPlacementBarcode!=='string') state.pendingPlacementBarcode='';
  save();

  function shelfOptions(selected){
    const current=String(selected||'').toUpperCase();
    if(!state.shelves.length) return '<option value="">Önce Raf bölümünden raf ekleyin</option>';
    return '<option value="">Raf seçiniz</option>'+state.shelves.slice().sort().map(function(r){
      return '<option value="'+esc(r)+'" '+(r===current?'selected':'')+'>'+esc(r)+'</option>';
    }).join('');
  }
  window.shelfOptions=shelfOptions;

  products=function(){
    const pending=state.pendingPlacementBarcode;
    const pp=pending?pBy(pending):null;
    const place=pp?`<div class="panel" style="border:2px solid #dce7e3"><div class="title">Rafa Yerleştir</div><div class="note" style="margin-bottom:12px"><b>${esc(pp.name)}</b> kaydedildi. Aynı ekrandan ilk stok yerleşimini yapabilirsin.</div><div class="grid g4"><div class="field"><label>Ürün Barkodu</label><input id="npBarcode" value="${esc(pp.barcode)}" readonly></div><div class="field"><label>Kayıtlı Raf</label><select id="npShelf">${shelfOptions('')}</select></div><div class="field"><label>Miktar</label><input id="npQty" type="number" min="0" step="0.01" placeholder="Miktar"></div><div class="field"><label>Not</label><input id="npNote" placeholder="İsteğe bağlı"></div></div><div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn" onclick="placeNewProduct()">Rafa Yerleştir / Stoka Al</button><button class="btn sec" onclick="cancelNewPlacement()">Daha Sonra</button></div></div>`:'';
    return `<div class="head"><span class="ey">ÜRÜN YÖNETİMİ</span><h2>Ürün Kartları</h2><p>Yeni ürün ekle, ardından aynı ekranda kayıtlı bir rafa yerleştir.</p></div><div class="panel"><div class="title">Yeni Ürün Ekle</div><div class="grid g4"><div class="field"><label>Barkod</label><div class="scanrow"><input id="pBarcode" placeholder="Ürün barkodu"><button class="scanbtn" type="button" onclick="scanTo('pBarcode')">📷</button></div></div><div class="field"><label>Ürün Kodu</label><div class="scanrow"><input id="pCode" placeholder="Kodu okut veya yaz"><button class="scanbtn" type="button" onclick="scanTo('pCode')">📷</button></div></div><div class="field"><label>Ürün Adı</label><input id="pName"></div><div class="field"><label>Birim</label><select id="pUnit"><option>Adet</option><option>Kg</option><option>Bobin</option><option>Palet</option><option>Koli</option></select></div></div><div style="margin-top:12px"><button class="btn" onclick="addProduct()">Ürünü Kaydet ve Rafa Yerleştir</button></div></div>${place}<div class="panel"><div class="title">Kayıtlı Ürünler (${state.products.length})</div>${state.products.length?`<div class="table"><table><thead><tr><th>Barkod</th><th>Kod</th><th>Ürün</th><th>Birim</th><th>Stok</th></tr></thead><tbody>${state.products.map(p=>`<tr><td>${esc(p.barcode)}</td><td>${esc(p.code)}</td><td>${esc(p.name)}</td><td>${esc(p.unit)}</td><td>${qty(p.barcode)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Henüz ürün yok.</div>'}</div>`;
  };

  addProduct=function(){
    const b=pBarcode.value.trim(),c=pCode.value.trim(),n=pName.value.trim(),u=pUnit.value;
    if(!b||!n)return alert('Barkod ve ürün adı zorunlu.');
    if(pBy(b))return alert('Bu barkod zaten kayıtlı.');
    state.products.push({id:uid(),barcode:b,code:c,name:n,unit:u});
    state.pendingPlacementBarcode=b; save(); render();
  };

  window.placeNewProduct=function(){
    const b=state.pendingPlacementBarcode;
    const shelf=String(document.getElementById('npShelf')?.value||'').trim().toUpperCase();
    const q=num(document.getElementById('npQty')?.value);
    const note=String(document.getElementById('npNote')?.value||'').trim();
    if(!b||!pBy(b))return alert('Ürün bulunamadı.');
    if(!shelf)return alert('Kayıtlı bir raf seç.');
    if(!state.shelves.includes(shelf))return alert('Bu raf kayıtlı değil. Önce Raf bölümünden ekle.');
    if(q<=0)return alert('Miktarı gir.');
    addStock(b,shelf,q); move('GIRIS',b,q,'',shelf,'',note);
    state.pendingPlacementBarcode=''; save(); alert('Ürün rafa yerleştirildi ve stok kaydı oluşturuldu.'); render();
  };
  window.cancelNewPlacement=function(){state.pendingPlacementBarcode='';save();render();};

  window.addShelf=function(){
    const v=String(document.getElementById('newShelf')?.value||'').trim().toUpperCase();
    if(!v)return alert('Raf numarasını yaz.');
    if(state.shelves.includes(v))return alert('Bu raf zaten kayıtlı.');
    state.shelves.push(v); save(); render();
  };
  window.removeShelf=function(v){
    v=String(v||'').toUpperCase();
    if(state.stock.some(s=>String(s.location).toUpperCase()===v && s.qty>0))return alert('Bu rafta stok var. Önce stokları başka rafa transfer et.');
    if(!confirm(v+' rafı silinsin mi?'))return;
    state.shelves=state.shelves.filter(r=>r!==v); save(); render();
  };

  raf=function(){
    const chips=state.shelves.length?`<div class="chips">${state.shelves.slice().sort().map(r=>`<span class="chip"><b>${esc(r)}</b><button onclick="removeShelf('${String(r).replace(/'/g,"\\'")}')">×</button></span>`).join('')}</div>`:'<div class="note" style="margin-top:10px">Henüz kayıtlı raf yok.</div>';
    return `<div class="panel"><div class="title">Raf Tanımları</div><div class="note" style="margin-bottom:10px">Depodaki raf numaralarını burada bir kez kaydet.</div><div class="scan"><div class="scanrow"><input id="newShelf" placeholder="Örn. 1A.1.1"><button class="scanbtn" type="button" onclick="scanTo('newShelf')">📷</button></div><button class="btn sec" onclick="addShelf()">Raf Ekle</button></div>${chips}</div><div class="panel"><div class="title">Raf Sorgula</div><div class="scan"><div class="scanrow"><input id="lQuery" placeholder="Raf kodu"><button class="scanbtn" type="button" onclick="scanTo('lQuery')">📷</button></div><button class="btn" onclick="doRaf()">Sorgula</button></div><div id="lResult" style="margin-top:13px"></div></div>`;
  };

  entry=function(){
    return `<div class="panel"><div class="title">Stok Girişi</div><div class="grid g4"><div class="field"><label>Ürün Barkodu</label><div class="scanrow"><input id="eBarcode"><button class="scanbtn" type="button" onclick="scanTo('eBarcode')">📷</button></div></div><div class="field"><label>Raf / Lokasyon</label><select id="eLocation">${shelfOptions('')}</select></div><div class="field"><label>Miktar</label><input id="eQty" type="number" min="0"></div><div class="field"><label>Not</label><input id="eNote"></div></div><div style="margin-top:12px"><button class="btn" onclick="entrySave()">Stoka Al</button></div></div>`;
  };

  transfer=function(){
    return `<div class="panel"><div class="title">Raf Transferi</div><div class="grid g4"><div class="field"><label>Ürün Barkodu</label><div class="scanrow"><input id="tBarcode"><button class="scanbtn" type="button" onclick="scanTo('tBarcode')">📷</button></div></div><div class="field"><label>Kaynak Raf</label><select id="tFrom">${shelfOptions('')}</select></div><div class="field"><label>Hedef Raf</label><select id="tTo">${shelfOptions('')}</select></div><div class="field"><label>Miktar</label><input id="tQty" type="number"></div></div><div style="margin-top:12px"><button class="btn" onclick="transferSave()">Transfer Et</button></div></div>`;
  };

  render();
})();
</script>'''

s = s.replace('</body>', patch + '\n</body>', 1)
p.write_text(s, encoding='utf-8')
print('patched')
