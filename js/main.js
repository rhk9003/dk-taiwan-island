import { createWorld } from './world.js';
import { createUI } from './ui.js';
import { BUILDING_TYPES, shoeColorOf } from './buildings.js';
import { LANDMARK_MODELS } from './landmarks.js';
import { cleanResident, residentIdOf, ageOf } from './residents.js';
import { postcardsOf } from './postcards.js';
import { createStampBook } from './stamps.js';
import { activeEvent } from './seasons.js';
import { h, shortName } from './util.js';
import { safeText } from './textrules.js';

const FILES = ['site', 'regions', 'modules', 'stores', 'products', 'landmarks', 'service', 'picks', 'shoppers', 'events'];
const OPTIONAL = new Set(['landmarks', 'service', 'picks', 'shoppers', 'events']); // 沒有這些檔也能跑

// 官網商品頁序號 → 商品頁網址和商品圖
function salePage(salePageId) {
  const id = /^\d{1,12}$/.test(String(salePageId || '')) ? String(salePageId) : '';
  return {
    url: id ? `https://www.dk-shoes.com.tw/SalePage/Index/${id}` : '',
    image: id ? `https://img.91app.com/webapi/imagesV3/Cropped/SalePage/${id}/0/0?v=1` : '',
  };
}
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

  // 店長的話和推薦：只用整理過的 picks.json（店長在表單填的原文不直接上島）
  const curated = raw.picks?.stores || {};
  const storeIds = new Set(stores.map((s) => s.id));
  for (const [id, c] of Object.entries(curated)) {
    if (!storeIds.has(id)) warn(`picks.json 的「${id}」不是門市 id，已略過`);
  }
  const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  for (const s of stores) {
    const c = curated[s.id];
    if (!c) continue;
    s.curatedAt = text(c.source, 40);
    s.quote = text(c.quote, 80) || s.quote;
    s.manager = text(c.manager, 30) || s.manager;
    s.picks = (Array.isArray(c.products) ? c.products : []).filter((p) => text(p?.name, 60)).map((p) => ({
      name: text(p.name, 60),
      reason: text(p.reason, 120),
      code: text(p.code, 30),
      color: text(p.color, 12),
      ...salePage(p.salePageId),
    }));
  }

  // 有買鞋煩惱的路人：煩惱裡的答案要對得到 shoes 裡的鞋
  let shoppers = null;
  if (raw.shoppers?.customers?.length) {
    const shoes = new Map();
    for (const sh of raw.shoppers.shoes || []) {
      if (!sh?.id || !sh.name || shoes.has(sh.id)) {
        warn(`shoppers.json 有一雙鞋缺少 id 或 name（或 id 重複）：${sh?.name || sh?.id}`);
        continue;
      }
      shoes.set(sh.id, { ...sh, points: Array.isArray(sh.points) ? sh.points : [], ...salePage(sh.salePageId) });
    }
    const customers = raw.shoppers.customers.filter((c) => {
      const answer = Array.isArray(c?.answer) ? c.answer : [];
      const missing = [...answer, ...(Array.isArray(c?.also) ? c.also : [])].filter((id) => !shoes.has(id));
      if (c?.id && c.who && c.says && answer.length && !missing.length) return true;
      warn(`shoppers.json 的「${c?.who || c?.id}」缺少 id／who／says／answer，或答案不在 shoes 裡（${missing.join('、')}），已略過`);
      return false;
    });
    const slots = Math.round(Number(raw.shoppers.slots) || 3);
    // 幫路人挑到鞋送的優惠券：要有領券網址或優惠碼才送
    const r = raw.shoppers.reward;
    const reward = r && (r.url || r.code) ? { ...r, after: Math.max(1, Math.round(Number(r.after) || 1)) } : null;
    if (customers.length && shoes.size >= 4) shoppers = { slots: Math.min(6, Math.max(1, slots)), shoes, customers, reward };
    else warn('shoppers.json 至少要有 4 雙鞋和 1 個路人，先不放「!」');
  }

  // 集點蓋章：集滿幾間不同門市的章才能領獎（不能比門市還多）
  let stamps = null;
  if (raw.site.stamps?.enabled) {
    let goal = Math.round(Number(raw.site.stamps.goal));
    if (!(goal >= 1 && goal <= stores.length)) {
      warn(`site.json 的 stamps.goal「${raw.site.stamps.goal}」要是 1～${stores.length} 的整數，先用 ${Math.min(10, stores.length)}`);
      goal = Math.min(10, stores.length);
    }
    const reward = raw.site.stamps.reward || {};
    if (!reward.url && !reward.code) warn('site.json 的 stamps.reward 沒有 url 也沒有 code，集滿了會顯示「優惠券準備中」');
    stamps = { ...raw.site.stamps, goal, reward };
  }

  // 節日與日夜：網址 ?event=christmas 直接看某個節日、?time=21 看晚上 9 點的島（測試用）
  const params = new URLSearchParams(location.search);
  const events = (raw.events?.events || []).filter((e) => {
    if (e?.id && e.name && (e.dates || (e.from && e.to))) return true;
    warn(`events.json 有一個節日缺少 id／name 或日期：${e?.name || e?.id}`);
    return false;
  });
  const event = activeEvent(events, Date.now(), params.get('event'));
  // 節日小遊戲（萬聖節「不給糖就搗蛋」）：每間門市拿一顆糖，集滿 goal 顆送優惠券
  let treat = null;
  if (event?.treat) {
    const goal = Math.round(Number(event.treat.goal)) || 5;
    const reward = event.treat.reward || {};
    if (!reward.url && !reward.code) warn(`events.json 的「${event.name}」treat.reward 沒有 url 也沒有 code，集滿了會顯示「優惠券準備中」`);
    treat = { title: event.treat.title || '不給糖就搗蛋', goal: Math.min(Math.max(goal, 1), stores.length), reward, key: `dk-island-treat-${event.id}-${new Date().getFullYear()}` };
  }
  const time = params.get('time')?.match(/^(\d{1,2})(?::(\d{2}))?$/);
  const clockOverride = time ? (Number(time[1]) % 24) + Number(time[2] || 0) / 60 : null;

  return {
    site: raw.site,
    event,
    treat,
    clockOverride,
    stamps,
    shoppers,
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

// 試算表：留言牆放沒被隱藏的留言。店長填的原文不上島，只提醒哪些店有新填寫、還沒整理進 picks.json
function applyPicks(data, picks) {
  const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  for (const s of data.stores) {
    const p = picks.stores[s.id];
    s.messages = (Array.isArray(p?.messages) ? p.messages : [])
      .slice(0, 12)
      // 顯示前再用文字規則過一次：繞過前端直接打後端的冒充客服、聯絡方式不會上島
      .map((m) => ({ nickname: safeText(text(m?.nickname, 12), 'nickname') || '路過的客人', text: safeText(text(m?.text, 60)), at: text(m?.at, 40) }))
      .filter((m) => m.text);
    if (!p?.filled) continue;
    const at = Date.parse(p.submittedAt || '');
    if (!s.curatedAt) data.warn(`${s.name} 店長填了表單，還沒整理進 picks.json`);
    else if (at > Date.parse(s.curatedAt)) data.warn(`${s.name} 店長在 ${p.submittedAt} 重填了，picks.json 要重新整理`);
  }
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

// 送資料到試算表（留言、島民角色），回傳 { ok, message, data }
async function postSheet(url, payload) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ submissionId: crypto.randomUUID(), deviceId: deviceId(), version: 'island-1', ...payload }),
    });
    const json = await res.json();
    return json?.ok ? { ok: true, data: json } : { ok: false, message: json?.message || '暫時送不出去，請稍後再試。' };
  } catch {
    return { ok: false, message: '網路好像不太穩，請稍後再試。' };
  }
}

// 留言（後端回 published: true 就直接上牆；舊版後端是先審再上牆）
const sendNote = (url, storeId, nickname, text, website) => postSheet(url, { role: 'message', storeId, nickname, text, website });

// 自己的島民存在這台裝置，打開網站就看得到，不用等試算表
const ME_KEY = 'dk-island-me';
function loadMe() {
  try {
    const me = JSON.parse(localStorage.getItem(ME_KEY) || 'null');
    return me && cleanResident(me) ? me : null;
  } catch {
    return null;
  }
}
function saveMe(me) {
  try { localStorage.setItem(ME_KEY, JSON.stringify(me)); } catch { /* 存不了就只是下次要重捏 */ }
}

// 節日的糖果袋：在哪幾間店拿過糖、什麼時候領的優惠券（存在這台裝置，每個節日每年一份）
function createTreatBag(key, goal) {
  let bag = { stores: {}, claimedAt: null };
  try { bag = { ...bag, ...JSON.parse(localStorage.getItem(key) || '{}') }; } catch { /* 讀不到就從空的開始 */ }
  const save = () => {
    try { localStorage.setItem(key, JSON.stringify(bag)); } catch { /* 存不了就只算這次 */ }
  };
  return {
    goal,
    get count() { return Object.keys(bag.stores).length; },
    get full() { return Object.keys(bag.stores).length >= goal; },
    get claimedAt() { return bag.claimedAt; },
    has: (id) => Boolean(bag.stores[id]),
    ids: () => Object.keys(bag.stores),
    add(id) {
      if (bag.stores[id]) return false;
      bag.stores[id] = new Date().toISOString();
      save();
      return true;
    },
    claim() {
      if (bag.claimedAt) return;
      bag.claimedAt = new Date().toISOString();
      save();
    },
  };
}

// 看過幾張明信片、看過哪些節日（島嶼快報用來判斷有沒有新的）
const POSTCARD_KEY = 'dk-island-postcards-seen';
const EVENTS_KEY = 'dk-island-events-seen';
function readNumber(key) {
  try { return Number(localStorage.getItem(key)) || 0; } catch { return 0; }
}
function seenEvents() {
  try { return JSON.parse(localStorage.getItem(EVENTS_KEY) || '[]') || []; } catch { return []; }
}
function markEventSeen(id) {
  const seen = seenEvents();
  if (seen.includes(id)) return;
  try { localStorage.setItem(EVENTS_KEY, JSON.stringify([...seen, id].slice(-20))); } catch { /* 存不了就下次再說一次 */ }
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

  // 島民角色：後端（店長表單的 Apps Script）部署好、site.json 的 residents 打開才啟用
  const residentsOn = Boolean(data.site.residents && data.site.managerPicksUrl);
  let me = residentsOn ? loadMe() : null;
  let mineId = null;
  let serverResidents = [];
  const placeResidents = () => {
    const list = serverResidents.filter((r) => r.id !== mineId);
    if (me && mineId) list.unshift({ ...cleanResident({ ...me, id: mineId }), pending: me.pending });
    world.setResidents(list, mineId);
  };
  async function saveResident({ code: wanted, ...choice }) {
    // 新島民先登記自己取的島民證代號：被別人用了就先不放上島，請客人換一個
    let code = '';
    if (islanderUrl && wanted) {
      const claim = await postSheet(islanderUrl, {
        role: 'issue',
        code: wanted,
        resident: { id: mineId, look: choice.look, mode: choice.mode, nickname: choice.nickname, since: me?.since || '' },
      });
      if (!claim.ok) return { ...claim, field: 'code' };
      code = claim.data.code;
    }
    const res = await postSheet(data.site.managerPicksUrl, { role: 'resident', ...choice });
    if (!res.ok) return res;
    me = {
      id: mineId,
      look: choice.look,
      mode: choice.mode,
      nickname: choice.nickname,
      pending: Boolean(choice.nickname) && res.data.nicknamePending !== false,
      since: res.data.since || me?.since || '', // 上島時間：重新捏不會變，島民照這個時間長大
      code: code || me?.code || '',
    };
    saveMe(me);
    $('btn-me').textContent = '我的島民';
    placeResidents();
    world.focusResident();
    issueCard(); // 島民證順便更新造型快照
    return { ok: true, pending: me.pending };
  }

  // 島民留言：點開島民名片時才讀（店長表單的 Apps Script，doGet?resident=角色ID）；島民的主人可以隱藏收到的留言
  const notesUrl = residentsOn ? data.site.managerPicksUrl : '';
  async function loadNotes(id) {
    const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
    try {
      const res = await fetch(`${notesUrl}?resident=${encodeURIComponent(id)}`, { cache: 'no-store' });
      const json = await res.json();
      return (Array.isArray(json?.notes) ? json.notes : [])
        .map((n) => ({ id: text(n.id, 80), nickname: safeText(text(n.nickname, 12), 'nickname') || '路過的客人', text: safeText(text(n.text, 60)), at: text(n.at, 40) }))
        .filter((n) => n.id && n.text);
    } catch {
      return [];
    }
  }

  // 島民證：另一個 Apps Script 專案（site.json 的 islanderUrl），沒設定就不出現。
  // 換手機或清掉瀏覽器資料時，輸入號碼就改用原本的裝置代號，變回原本的島民
  const islanderUrl = residentsOn ? data.site.islanderUrl || '' : '';
  // wanted：客人想改成的代號（不帶就是維持原本的號碼，順便更新造型快照）
  async function issueCard(wanted = '') {
    if (!islanderUrl || !me || !mineId) return { ok: false, message: '還沒有島民。' };
    const res = await postSheet(islanderUrl, {
      role: 'issue',
      ...(wanted ? { code: wanted } : {}),
      resident: { id: mineId, look: me.look, mode: me.mode, nickname: me.nickname, since: me.since || '' },
    });
    if (res.ok && res.data.code) {
      me.code = res.data.code;
      saveMe(me);
    }
    return res.ok ? { ok: true, code: me.code } : res;
  }
  async function reclaim(code) {
    const res = await postSheet(islanderUrl, { role: 'reclaim', code });
    if (!res.ok) return res;
    try {
      localStorage.setItem('dk-island-device', res.data.deviceId);
    } catch {
      return { ok: false, message: '這個瀏覽器存不了資料（可能是無痕模式），沒辦法接回島民。' };
    }
    const id = await residentIdOf(res.data.deviceId);
    const r = cleanResident({ ...(res.data.resident || {}), id });
    // 快照壞掉也沒關係：重新整理後會從島上的島民名單認出自己
    saveMe(r ? { ...r, code: res.data.code, pending: false } : null);
    location.reload();
    return { ok: true };
  }
  let world = null;

  // 有買鞋煩惱的路人：每個「!」（slot）配一個煩惱；幫過哪些人存在這台裝置
  const HELP_KEY = 'dk-island-helped';
  const HELP_COUPON_KEY = 'dk-island-help-coupon'; // 幫路人挑鞋送的優惠券，什麼時候領的（每台裝置一次）
  const helpCoupon = { claimedAt: null };
  try { helpCoupon.claimedAt = localStorage.getItem(HELP_COUPON_KEY); } catch { /* 讀不到就當還沒領 */ }
  function claimHelpCoupon() {
    if (helpCoupon.claimedAt) return;
    helpCoupon.claimedAt = new Date().toISOString();
    try { localStorage.setItem(HELP_COUPON_KEY, helpCoupon.claimedAt); } catch { /* 存不了就只是下次還會看到領券按鈕 */ }
    drawShopperBtn();
  }
  const helped = new Set();
  try { (JSON.parse(localStorage.getItem(HELP_KEY) || '[]') || []).forEach((id) => helped.add(id)); } catch { /* 讀不到就從 0 開始 */ }
  const slotCustomer = [];
  function nextCustomer() {
    const busy = new Set(slotCustomer.map((c) => c?.id));
    const pool = data.shoppers.customers.filter((c) => !busy.has(c.id));
    const fresh = pool.filter((c) => !helped.has(c.id)); // 先排還沒幫過的
    const list = fresh.length ? fresh : pool.length ? pool : data.shoppers.customers;
    return list[Math.floor(Math.random() * list.length)];
  }
  function shopperSolved(slot, customer) {
    helped.add(customer.id);
    try { localStorage.setItem(HELP_KEY, JSON.stringify([...helped])); } catch { /* 存不了就只算這次 */ }
    slotCustomer[slot] = null; // 「!」換到別人頭上時，換一個新的煩惱
    world.cheerShopper(slot);
    drawShopperBtn();
    return helped.size;
  }
  // 右下角「幫路人挑鞋」：輪流飛到每個「!」
  const shopperBtn = $('btn-shoppers');
  let shopperCursor = -1;
  const nextShopperSlot = () => (shopperCursor = (shopperCursor + 1) % data.shoppers.slots);
  function drawShopperBtn() {
    // 還沒領優惠券時寫「送優惠券」吸引人，領過之後顯示幫過幾位
    const offer = data.shoppers.reward && !helpCoupon.claimedAt;
    const after = data.shoppers.reward?.after ?? 1;
    const offerText = after > 1 ? `送優惠券 ${Math.min(helped.size, after)}/${after}` : '送優惠券';
    const count = offer ? [h('em', { text: offerText })] : helped.size ? [h('em', { text: `已幫 ${helped.size} 位` })] : [];
    shopperBtn.replaceChildren(h('i', { 'aria-hidden': 'true', text: '!' }), '幫路人挑鞋', ...count);
  }

  // 集點蓋章：蓋章紀錄存在這台裝置
  const book = data.stamps ? createStampBook(new Set(data.stores.map((s) => s.id)), data.stamps.goal) : null;
  const stampBtn = $('btn-stamps');
  const drawStampBtn = () => {
    if (!book) return;
    const ready = book.full && !book.claimedAt;
    stampBtn.classList.toggle('ready', ready);
    stampBtn.replaceChildren(h('i', { 'aria-hidden': 'true', text: '章' }), ready ? '集滿了！領優惠券' : `集章 ${Math.min(book.count, book.goal)}/${book.goal}`);
  };
  function addStamp(id) {
    if (!book?.add(id)) return false;
    world.setStamped(book.ids());
    ui.markStamps();
    drawStampBtn();
    return true;
  }

  // 萬聖節糖果袋（events.json 的 treat）：右下角的南瓜按鈕顯示拿了幾顆
  const candy = data.treat ? createTreatBag(data.treat.key, data.treat.goal) : null;
  const treatBtn = $('btn-treat');
  const drawTreatBtn = () => {
    if (!candy) return;
    const ready = candy.full && !candy.claimedAt;
    treatBtn.classList.toggle('ready', ready);
    treatBtn.replaceChildren(h('i', { 'aria-hidden': 'true', text: '🎃' }), ready ? '糖果集滿了！領優惠券' : `${data.treat.title} ${Math.min(candy.count, candy.goal)}/${candy.goal}`);
  };

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
    // 島民角色：捏一個或修改自己的
    me() {
      if (!residentsOn) return app.overview();
      clearTimeout(enterTimer);
      Object.assign(state, { region: null, store: null, mission: null });
      ui.showResidentEditor(me);
      world.setFocus(null);
      world.setSelected(null);
      if (me) world.focusResident();
      setHash('me');
    },
    // 集章冊：看蓋了哪些店、集滿領優惠券
    stamps() {
      if (!book) return app.overview();
      clearTimeout(enterTimer);
      Object.assign(state, { region: null, store: null, mission: null });
      ui.showStampBook();
      world.setFocus(null);
      world.setSelected(null);
      // 鏡頭飛到花東的集章兌獎廣場
      const plaza = data.regions.find((r) => r.role === 'plaza');
      if (plaza) world.focusRegion(plaza.id);
      else world.overview();
      setHash('stamps');
    },
    // 點了島上的島民：他停下來，鏡頭跟過去，卡片是他的名片
    resident(id) {
      const r = id === mineId && me ? cleanResident({ ...me, id: mineId }) : serverResidents.find((x) => x.id === id);
      if (!residentsOn || !r) return;
      clearTimeout(enterTimer);
      Object.assign(state, { region: null, store: null, mission: null });
      ui.showResident(r, id === mineId);
      world.setFocus(null);
      world.setSelected(null);
      world.holdResident(id);
      world.focusResident(id);
      setHash('');
    },
    // 萬聖節糖果袋：拿了哪幾間店的糖、集滿領優惠券
    treat() {
      if (!candy) return app.overview();
      clearTimeout(enterTimer);
      Object.assign(state, { region: null, store: null, mission: null });
      ui.showTreatBag();
      world.setFocus(null);
      world.setSelected(null);
      world.overview();
      setHash('treat');
    },
    // 點了頭上有「!」的路人：他停下來，卡片上是他的煩惱和幾雙鞋
    shopper(slot) {
      if (!data.shoppers) return app.overview();
      clearTimeout(enterTimer);
      Object.assign(state, { region: null, store: null, mission: null });
      slotCustomer[slot] ||= nextCustomer();
      ui.showShopper(slotCustomer[slot], slot);
      world.setFocus(null);
      world.setSelected(null);
      world.focusShopper(slot);
      setHash('');
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
  // 去看別的地方時，停下來的路人繼續走
  for (const key of Object.keys(app)) {
    const go = app[key];
    app[key] = (...args) => {
      if (key !== 'shopper') world?.releaseShoppers();
      if (key !== 'resident') world?.releaseResidents();
      return go(...args);
    };
  }

  const ui = createUI(data, {
    onRegion: app.region,
    onStore: app.store,
    onOverview: app.overview,
    onCloseCard: () => (state.store ? app.region(state.region) : app.overview()),
    onCloseShop: () => (state.mission ? app.service() : app.region(state.region)),
    onMission: (id) => app.mission(id),
    onServiceBack: () => app.service(),
    onSaveResident: (choice) => saveResident(choice),
    onFindMe: () => world.focusResident(),
    islander: Boolean(islanderUrl),
    onIslanderCard: () => issueCard(),
    onMe: () => app.me(),
    hasMe: () => Boolean(me),
    loadResidentNotes: notesUrl ? (id) => loadNotes(id) : null,
    onResidentNote: (id, nickname, text, website) => postSheet(notesUrl, { role: 'resident-note', residentId: id, nickname, text, website }),
    onHideNote: (noteId) => postSheet(notesUrl, { role: 'resident-note-hide', noteId }),
    onChangeCode: (code) => issueCard(code),
    onReclaim: (code) => reclaim(code),
    onPostcardsSeen: (total) => {
      try { localStorage.setItem(POSTCARD_KEY, String(total)); } catch { /* 存不了就下次再提醒一次 */ }
    },
    onReportGo: (go) => {
      if (go === 'me') app.me();
      else if (go?.startsWith('store:')) app.store(go.slice(6));
    },
    stamps: book,
    helped,
    helpCoupon,
    onShopperSolved: shopperSolved,
    onClaimHelpCoupon: claimHelpCoupon,
    onNextShopper: () => app.shopper(nextShopperSlot()),
    onInviteGo: (feature) => { if (feature === 'shoppers' && data.shoppers) app.shopper(nextShopperSlot()); },
    onStamp: addStamp,
    onStampBook: () => app.stamps(),
    candy,
    onTreat: (id) => {
      const fresh = candy.add(id);
      drawTreatBtn();
      return fresh;
    },
    onTreatBag: () => app.treat(),
    onClaimTreat: () => {
      candy.claim();
      drawTreatBtn();
    },
    onClaim: () => { book.claim(); drawStampBtn(); },
    onPostMessage: data.site.managerPicksUrl && data.site.messageBoard
      ? (storeId, nickname, text, website) => sendNote(data.site.managerPicksUrl, storeId, nickname, text, website)
      : null,
    onInsets: (ins) => world?.setInsets(ins),
  });

  try {
    world = createWorld($('stage'), data, { onRegion: app.region, onStore: app.store, onLandmark: app.landmark, onCoupon: app.coupon, onMission: app.mission, onService: app.service, onShopper: app.shopper, onResident: (id) => app.resident(id) });
  } catch (e) {
    console.error(e);
    showError(`這個瀏覽器沒辦法顯示 3D 畫面（${e.message}）`);
    return;
  }
  $('loading').hidden = true;
  if (data.shoppers) {
    world.setShoppers(data.shoppers.slots);
    drawShopperBtn();
    shopperBtn.hidden = false;
    shopperBtn.addEventListener('click', () => app.shopper(nextShopperSlot()));
  }
  // 門口店員穿整理過的店長推薦第一雙鞋的顏色
  for (const s of data.stores) {
    const shoe = shoeColorOf({ color: s.picks?.[0]?.color || '' });
    if (shoe) world.setShoe(s.id, shoe);
  }
  if (book) {
    world.setStamped(book.ids());
    drawStampBtn();
    stampBtn.hidden = false;
    stampBtn.addEventListener('click', () => app.stamps());
  }
  if (candy) {
    drawTreatBtn();
    treatBtn.hidden = false;
    treatBtn.addEventListener('click', () => app.treat());
  }
  // ---- 島民角色 ----
  const meBtn = $('btn-me');
  if (residentsOn) {
    mineId = await residentIdOf(deviceId());
    if (me) me.id = mineId;
    meBtn.textContent = me ? '我的島民' : '＋ 成為島民';
    meBtn.hidden = false;
    meBtn.addEventListener('click', () => app.me());
    placeResidents();
    if (me && !me.code) issueCard(); // 以前捏的島民，補發島民證
  }
  const serviceBtn = $('btn-service');
  if (data.service) serviceBtn.addEventListener('click', () => app.service());
  else serviceBtn.hidden = true;

  // ---- 上次來是什麼時候：隔一天以上回來，先給一張「島嶼快報」（網址加 ?report 隨時看得到）----
  const LAST_KEY = 'dk-island-last-visit';
  const AWAY = 20 * 3600000;
  const forceReport = new URLSearchParams(location.search).has('report');
  let lastVisit = 0;
  try {
    lastVisit = Number(localStorage.getItem(LAST_KEY)) || 0;
    localStorage.setItem(LAST_KEY, String(Date.now()));
  } catch { /* 存不了就不出快報 */ }
  if (forceReport && !lastVisit) lastVisit = Date.now() - 3 * 86400000;
  const reportDue = Boolean(lastVisit) && (forceReport || Date.now() - lastVisit >= AWAY);

  function buildReport(myNotes = []) {
    const items = [];
    const after = (iso) => Date.parse(iso || '') > lastVisit;
    const freshNotes = myNotes.filter((n) => after(n.at)).length;
    if (freshNotes) items.push({ icon: '💬', text: `有人留言給你的島民，共 ${freshNotes} 則新留言。`, go: 'me', label: '看留言' });
    if (me?.since) {
      const was = ageOf(me.since, lastVisit);
      const now = ageOf(me.since);
      items.push(now.index > was.index
        ? { icon: '🎈', text: `你的島民長大了，現在是「${now.title}」！`, go: 'me', label: '看我的島民' }
        : { icon: '🎈', text: `你的島民上島第 ${now.days + 1} 天了${now.next ? `，再 ${now.next.inDays} 天就是「${now.next.title}」` : ''}。`, go: 'me', label: '看我的島民' });
      const { total } = postcardsOf({ ...me, id: mineId }, data.landmarks);
      const fresh = total - readNumber(POSTCARD_KEY);
      if (fresh > 0) items.push({ icon: '💌', text: `你的島民寄來 ${fresh} 張明信片。`, go: 'me', label: '看明信片' });
    }
    const newcomers = serverResidents.filter((r) => r.id !== mineId && after(r.since)).length;
    if (newcomers) items.push({ icon: '👋', text: `島上多了 ${newcomers} 位新島民。` });
    // 新留言：蓋過章的店優先
    const stamped = new Set(book ? book.ids() : []);
    const walls = data.stores
      .map((s) => ({ s, n: (s.messages || []).filter((msg) => after(msg.at)).length }))
      .filter((w) => w.n)
      .sort((a, b) => b.n - a.n);
    const mine = walls.filter((w) => stamped.has(w.s.id));
    if (mine.length) {
      const more = mine.length > 1 ? `，另外還有 ${mine.length - 1} 間也有` : '';
      items.push({ icon: '📝', text: `你蓋過章的${shortName(mine[0].s.name)}有 ${mine[0].n} 則新留言${more}。`, go: `store:${mine[0].s.id}`, label: '去看看' });
    } else if (walls.length) {
      items.push({ icon: '📝', text: `${shortName(walls[0].s.name)}等 ${walls.length} 間店有新留言。`, go: `store:${walls[0].s.id}`, label: '去看看' });
    }
    if (data.event?.news && (forceReport || !seenEvents().includes(data.event.id))) items.push({ icon: '🎉', text: data.event.news });
    return items;
  }
  async function showReport() {
    if (!reportDue) return;
    // 自己的島民收到的留言（最多等 4 秒，讀不到就算了）
    const myNotes = me && mineId && notesUrl
      ? await Promise.race([loadNotes(mineId), new Promise((r) => setTimeout(() => r([]), 4000))])
      : [];
    // 客人已經自己點去別的地方，就不打擾
    if (state.region || state.store || state.mission || !$('card').hidden || !$('intro').hidden) return;
    const items = buildReport(myNotes);
    if (!items.length) return;
    if (data.event) markEventSeen(data.event.id);
    ui.showReport(items, Math.max(1, Math.round((Date.now() - lastVisit) / 86400000)));
  }

  if (data.site.managerPicksUrl) {
    loadManagerPicks(data.site.managerPicksUrl)
      .then((picks) => {
        applyPicks(data, picks);
        showWarnings();
        ui.refresh();
        if (residentsOn) {
          serverResidents = (Array.isArray(picks.residents) ? picks.residents : []).map(cleanResident).filter(Boolean);
          const mine = serverResidents.find((r) => r.id === mineId);
          if (!me && mine) {
            // 這台裝置在島上有島民，但瀏覽器裡的紀錄不見了（例如剛用島民證接回來）：從名單認回來
            me = { ...mine, pending: false };
            saveMe(me);
            meBtn.textContent = '我的島民';
            issueCard();
          } else if (me && mine) {
            // 試算表回傳的暱稱跟自己的一樣，就拿掉「審核中」；也補上上島時間
            if (me.pending && mine.nickname && mine.nickname === me.nickname) me.pending = false;
            if (!me.since && mine.since) me.since = mine.since;
            saveMe(me);
          }
          placeResidents();
        }
      })
      .catch((e) => console.warn(`[DK 台灣島] 讀不到店長的話試算表，先不顯示：${e.message}`))
      .finally(showReport);
  } else {
    setTimeout(showReport, 0);
  }

  showWarnings();
  function showWarnings() {
    // 資料提醒只給改資料的人看：網址加 ?debug 才顯示（Console 一律會印）
    if (!data.warnings.length || !new URLSearchParams(location.search).has('debug')) return;
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
  else if (location.hash === '#me') app.me();
  else if (location.hash === '#stamps') app.stamps();
  else if (location.hash === '#treat') app.treat();
  else if (decodeURIComponent(location.hash).startsWith('#mission/')) app.mission(decodeURIComponent(location.hash).slice(9));
  else if (m?.[1] === 'region') app.region(m[2]);
  else {
    app.overview();
    ui.maybeShowIntro();
  }
}

boot();
