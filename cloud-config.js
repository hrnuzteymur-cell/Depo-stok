const CLOUD_CONFIG_KEY = 'kansan-cloud-config-v1';

function getCloudConfig() {
  try { return JSON.parse(localStorage.getItem(CLOUD_CONFIG_KEY)) || {}; }
  catch { return {}; }
}

function isUnsafeSupabaseKey(key) {
  const value = String(key || '').trim();
  if (value.startsWith('sb_secret_')) return true;
  const parts = value.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.role === 'service_role';
  } catch { return false; }
}

function validateCloudConfig(config) {
  let url;
  try { url = new URL(String(config.url || '').trim()); }
  catch { return { ok: false, error: 'Geçerli Supabase proje adresi girin' }; }
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co')) {
    return { ok: false, error: 'Adres https://...supabase.co biçiminde olmalı' };
  }
  const key = String(config.key || '').trim();
  if (!key) return { ok: false, error: 'Publishable veya anon anahtarı gerekli' };
  if (isUnsafeSupabaseKey(key)) return { ok: false, error: 'Secret/service_role anahtarı tarayıcıda kullanılamaz' };
  const workspaceId = String(config.workspaceId || '').trim();
  if (workspaceId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(workspaceId)) {
    return { ok: false, error: 'Çalışma alanı kimliği geçerli UUID biçiminde olmalı' };
  }
  return { ok: true, data: { url: url.origin, key, workspaceId } };
}

function saveCloudConfig() {
  const checked = validateCloudConfig({
    url: document.getElementById('cloudUrl')?.value,
    key: document.getElementById('cloudKey')?.value,
    workspaceId: document.getElementById('cloudWorkspace')?.value
  });
  if (!checked.ok) { toast(checked.error, 'err'); return; }
  localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(checked.data));
  toast('Bulut bağlantı ayarları kaydedildi');
  renderPage();
}

function injectCloudConfigUI() {
  const settings = document.querySelector('.page-settings');
  if (!settings || settings.querySelector('[data-cloud-config]')) return;
  const config = getCloudConfig();
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.cloudConfig = '1';
  card.innerHTML = `
    <div class="card-title">Çok Kullanıcılı Bulut Bağlantısı</div>
    <div class="card-sub">Supabase projesi hazır olduğunda ortak veri eşitlemesi bu ayarlarla etkinleştirilecek.</div>
    <div class="alert alert-info">Yalnızca Publishable veya eski Anon anahtarını kullanın. Secret/service_role anahtarını hiçbir zaman buraya girmeyin.</div>
    <div class="fgrid g2">
      <div class="field"><label>Supabase Proje Adresi</label><input id="cloudUrl" value="${esc(config.url || '')}" placeholder="https://proje.supabase.co"></div>
      <div class="field"><label>Publishable / Anon Anahtarı</label><input id="cloudKey" type="password" value="${esc(config.key || '')}" placeholder="sb_publishable_... veya anon anahtarı"></div>
      <div class="field"><label>Çalışma Alanı Kimliği</label><input id="cloudWorkspace" value="${esc(config.workspaceId || '')}" placeholder="Supabase kurulunca oluşacak UUID"></div>
    </div>
    <div class="btn-row"><button class="btn btn-primary" onclick="saveCloudConfig()">Bağlantı Ayarlarını Kaydet</button></div>
  `;
  settings.appendChild(card);
}

const cloudObserver = new MutationObserver(injectCloudConfigUI);
window.addEventListener('DOMContentLoaded', () => {
  const page = document.getElementById('page');
  if (page) cloudObserver.observe(page, { childList: true, subtree: true });
  injectCloudConfigUI();
});

window.getCloudConfig = getCloudConfig;
window.validateCloudConfig = validateCloudConfig;
window.saveCloudConfig = saveCloudConfig;
