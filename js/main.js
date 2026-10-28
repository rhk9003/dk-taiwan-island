import { createWorld } from './world.js';
import { createUI } from './ui.js';
import { BUILDING_TYPES, shoeColorOf } from './buildings.js';
import { LANDMARK_MODELS } from './landmarks.js';
import { h } from './util.js';

const FILES = ['site', 'regions', 'modules', 'stores', 'products', 'landmarks', 'service'];
const OPTIONAL = new Set(['landmarks', 'service']); // 沒有這些檔也能跑
const $ = (id) => document.getElementById(id);

async function loadData() {
  const entries = await Promise.all(FILES.map(async (name) => {
    const res = await fetch(`data/${name}.json`, { cache: 'no-cache' });
    if (!res.ok && OPTIONAL.has(name)) return [name, {}];
    if (!res.ok) throw new Error(`讀不到 data/${name}.json（${res.status}）`);
    const text = await res.text();
    try {
      return [name, JSON.parse(text)];
    } catch (e) {
      throw new Error(`data/${name}.json 格式有誤：${e.message}`);
    }
  }));
  return Object.fromEntries(entries);
}

// 檢查資料、補上預設值；有問題的地方記成提醒，不讓整座島掛掉
function normalize(raw) {
  const warnings = [];
  const warn = (msg) => {
    warnings.push(msg);
    console.warn(`[DK 台灣島] ${msg}`);
  };

  const regions = raw.regions.regions || [];
  const modules = raw.modules.modules || {};
  if (!modules.shop) modules.shop = { name: 'DK 門市', building: 'shop', color: '#8B2332', desc: '', url: null, cta: null };
  for (const [id, m] of Object.entries(modules)) {
    if (!BUILDING_TYPES.includes(m.building)) warn(`模組 ${id} 的 building「${m.building}」不存在，先用一般門市造型`);
  }
  const products = new Map((raw.products.products || []).map((p) => [String(p.id), p]));
  const landmarks = [];
  for (const lm of raw.landmarks.landmarks || []) {
    if (!lm.id || landmarks.some((l) => l.id === lm.id) || !Array.isArray(lm.latlng) || lm.latlng.length !== 2) {
      warn(`景點「${lm.name || lm.id}」缺少 id 或 latlng（或 id 重複），已略過`);
      continue;
    }
    if (lm.model && !LANDMARK_MODELS.includes(lm.model)) warn(`景點「${lm.name}」的 model「${lm.model}」不存在，先用紀念碑造型`);
    landmarks.push(lm);
  }
  const regionIds = new Set(regions.map((r) => r.id));
  const cityToRegion = new Map(regions.flatMap((r) => (r.cities || []).map((c) => [c, r.id])));

  const seen = new Set();
  const stores = [];
  for (const s of raw.stores.stores || []) {
    if (!s.id || seen.has(s.id)) {
      warn(`門市 id 重複或空白：${s.name || s.id}，已略過`);
      continue;
    }
    seen.add(s.id);
    let region = s.region;
    if (!regionIds.has(region)) {
      const city = [...cityToRegion.keys()].find((c) => String(s.address || '').startsWith(c));
      if (!city) {
        warn(`${s.name} 找不到所屬的島（region: ${s.region}），已略過`);
        continue;
      }
      region = cityToRegion.get(city);
      warn(`${s.name} 的 region「${s.region}」不存在，依地址放到 ${region}`);
    }
    let module = s.module;
    if (!modules[module]) {
      if (module) warn(`${s.name} 的 module「${module}」不存在，先當一般門市`);
      module = 'shop';
    }
    const productIds = (s.products || []).map(String).filter((id) => {
      if (products.has(id)) return true;
      warn(`${s.name} 推薦的商品 ${id} 不在 products.json`);
      return false;
    });
    stores.push({ ...s, region, module, products: productIds, quote: (s.quote || '').trim(), manager: (s.manager || '').trim() });
  }

  // 接了試算表，就不在公開網站上秀範例內容
  if (raw.site.managerPicksUrl) {
    for (const s of stores) {
      if (s.sample) Object.assign(s, { quote: '', manager: '', products: [], sample: false });
    }
  }

  return {
    site: raw.site,
    regions,
    landmarks,
    service: raw.service?.missions?.length ? raw.service : null,
    modules,
    products,
    stores,
    storeById: new Map(stores.map((s) => [s.id, s])),
    warnings,
    warn,
  };
}

// 讀「店長的話蒐集」試算表（Apps Script 的 doGet），讀不到就算了，島照常運作
async function loadManagerPicks(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json?.ok || !json.stores || typeof json.stores !== 'object') throw new Error(json?.message || '回傳格式不對');
    return json;
  } finally {
    clearTimeout(timer);
  }
}

// 店長有填的店，一句話和推薦商品以試算表為準；留言牆放已上牆的留言。回傳要換鞋色的門市
function applyPicks(data, picks) {
  const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const shoes = new Map();
  for (const s of data.stores) {
    const p = picks.stores[s.id];
    s.messages = (Array.isArray(p?.messages) ? p.messages : [])
      .slice(0, 12)
      .map((m) => ({ nickname: text(m?.nickname, 12) || '路過的客人', text: text(m?.text, 60) }))
      .filter((m) => m.text);
    if (!p?.filled) continue;
    s.quote = text(p.quote, 80) || s.quote;
    s.manager = text(p.managerName, 30) || s.manager;
    const name = text(p.product?.name, 60);
    if (!name) continue;
    const id = /^\d{1,12}$/.test(String(p.product.salePageId || '')) ? String(p.product.salePageId) : '';
    const known = id ? data.products.get(id) : null;
    s.pick = {
      name,
      reason: text(p.product.reason, 120),
      url: id ? `https://www.dk-shoes.com.tw/SalePage/Index/${id}` : '',
      image: known?.image || (id ? `https://img.91app.com/webapi/imagesV3/Cropped/SalePage/${id}/0/0?v=1` : ''),
      code: known?.code || '',
      color: known?.color || '',
    };
    const shoe = shoeColorOf(known) ?? shoeColorOf({ color: name });
    if (shoe) shoes.set(s.id, shoe);
  }
  return shoes;
}

// 這台裝置的代號，給後端擋「同一個人連續狂留言」用；存不了就每次開頁面換一個
function deviceId() {
  const fresh = () => crypto.randomUUID().replace(/-/g, '');
  try {
    let id = localStorage.getItem('dk-island-device');
    if (!id) localStorage.setItem('dk-island-device', (id = fresh()));
    return id;
  } catch {
    return fresh();
  }
}

// 留言送到試算表（先審再上牆），回傳 { ok, message }
async function sendNote(url, storeId, nickname, text, website) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        role: 'message',
        submissionId: crypto.randomUUID(),
        storeId,
        nickname,
        text,
        deviceId: deviceId(),
        website,
        version: 'island-1',
      }),
    });
    const json = await res.json();
    return json?.ok ? { ok: true } : { ok: false, message: json?.message || '暫時送不出去，請稍後再試。' };
  } catch {
    return { ok: false, message: '網路好像不太穩，請稍後再試。' };
  }
}

function showError(message) {
  const box = $('loading');
  box.classList.add('error');
  box.hidden = false;
  box.replaceChildren(
    h('b', { text: '島沒辦法浮出來' }),
    h('p', { text: message }),
    h('small', {
      text: location.protocol === 'file:'
        ? '直接雙擊 index.html 會讀不到資料，要放在 GitHub Pages 或用本機伺服器開。'
        : '如果剛改過 data 資料夾裡的 JSON，多半是少了逗號、引號，或最後一項多了逗號。',
    }),
  );
}

async function boot() {
  let data;
  try {
    data = normalize(await loadData());
  } catch (e) {
    showError(e.message);
    return;
  }

  const state = { region: null, store: null, mission: null };
  let world = null;

  const setHash = (value) => history.replaceState(null, '', value ? `#${value}` : location.pathname + location.search);

  const app = {
    overview() {
      clearTimeout(enterTimer);
      Object.assign(state, { region: null, store: null, mission: null });
      ui.showNone();
      world.setFocus(null);
      world.setSelected(null);
      world.overview();
      setHash('');
    },
    region(id) {
      if (!data.regions.some((r) => r.id === id)) return app.overview();
      if (data.regions.find((r) => r.id === id).role === 'service' && data.service) return app.service();
      clearTimeout(enterTimer);
      Object.assign(state, { region: id, store: null, mission: null });
      ui.showRegion(id);
      world.setFocus(id);
      world.setSelected(null);
      world.focusRegion(id);
      setHash(`region/${id}`);
    },
    // 進店：鏡頭先降到店門口，到了再開門
    // 客服任務島：任務選單
    service() {
      if (!data.service) return app.overview();
      clearTimeout(enterTimer);
      Object.assign(state, { region: 'service', store: null, mission: null });
      ui.showServiceMenu();
      world.setFocus(data.regions.some((r) => r.id === 'service') ? 'service' : null);
      world.setSelected(null);
      world.focusService();
      setHash('service');
    },
    // 客服任務：鏡頭先飛到那一站，到了再打開站點畫面
    mission(id) {
      const m = data.service?.missions.find((x) => x.id === id);
      if (!m) return app.service();
      clearTimeout(enterTimer);
      Object.assign(state, { region: 'service', store: null, mission: id });
      world.setSelected(null);
      world.focusMission(id);
      enterTimer = setTimeout(() => { if (state.mission === id) ui.openStation(id); }, 900);
      setHash(`mission/${id}`);
    },
    coupon() {
      if (!data.site.coupon) return app.overview();
      clearTimeout(enterTimer);
      Object.assign(state, { region: null, store: null, mission: null });
      ui.showCoupon();
      world.setFocus(null);
      world.setSelected(null);
      world.focusCoupon();
      setHash('coupon');
    },
    landmark(id) {
      if (!data.landmarks.some((l) => l.id === id)) return app.overview();
      clearTimeout(enterTimer);
      Object.assign(state, { region: null, store: null, mission: null });
      ui.showLandmark(id);
      world.setFocus(null);
      world.setSelected(null);
      world.focusLandmark(id);
      setHash(`spot/${id}`);
    },
    store(id) {
      const s = data.storeById.get(id);
      if (!s) return app.overview();
      Object.assign(state, { region: s.region, store: id, mission: null });
      ui.selectStore(id);
      world.setFocus(s.region);
      world.setSelected(id);
      world.focusStore(id);
      clearTimeout(enterTimer);
      enterTimer = setTimeout(() => { if (state.store === id) ui.openShop(id); }, 1000);
      setHash(`store/${encodeURIComponent(id)}`);
    },
  };
  let enterTimer = 0;

  const ui = createUI(data, {
    onRegion: app.region,
    onStore: app.store,
    onOverview: app.overview,
    onCloseCard: () => (state.store ? app.region(state.region) : app.overview()),
    onCloseShop: () => (state.mission ? app.service() : app.region(state.region)),
    onMission: (id) => app.mission(id),
    onServiceBack: () => app.service(),
    onPostMessage: data.site.managerPicksUrl && data.site.messageBoard
      ? (storeId, nickname, text, website) => sendNote(data.site.managerPicksUrl, storeId, nickname, text, website)
      : null,
    onInsets: (ins) => world?.setInsets(ins),
  });

  try {
    world = createWorld($('stage'), data, { onRegion: app.region, onStore: app.store, onLandmark: app.landmark, onCoupon: app.coupon, onMission: app.mission, onService: app.service });
  } catch (e) {
    console.error(e);
    showError(`這個瀏覽器沒辦法顯示 3D 畫面（${e.message}）`);
    return;
  }
  $('loading').hidden = true;
  const serviceBtn = $('btn-service');
  if (data.service) serviceBtn.addEventListener('click', () => app.service());
  else serviceBtn.hidden = true;

  if (data.site.managerPicksUrl) {
    loadManagerPicks(data.site.managerPicksUrl)
      .then((picks) => {
        for (const [id, color] of applyPicks(data, picks)) world.setShoe(id, color);
        ui.refresh();
      })
      .catch((e) => console.warn(`[DK 台灣島] 讀不到店長的話試算表，先不顯示：${e.message}`));
  }

  if (data.warnings.length) {
    const badge = $('warn-badge');
    badge.textContent = `資料提醒 ${data.warnings.length} 則（按 F12 看 Console）`;
    badge.hidden = false;
  }

  // 網址可以直接指到某間店，例如 …/#store/頂好
  const m = decodeURIComponent(location.hash.slice(1)).match(/^(store|region|spot)\/(.+)$/);
  if (m?.[1] === 'store') app.store(m[2]);
  else if (m?.[1] === 'spot') app.landmark(m[2]);
  else if (location.hash === '#coupon') app.coupon();
  else if (location.hash === '#service') app.service();
  else if (decodeURIComponent(location.hash).startsWith('#mission/')) app.mission(decodeURIComponent(location.hash).slice(9));
  else if (m?.[1] === 'region') app.region(m[2]);
  else {
    app.overview();
    ui.maybeShowIntro();
  }
}

boot();
