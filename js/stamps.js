import { hashSeed, shortName } from './util.js';

// 集點蓋章：蓋過哪些店、什麼時候蓋的，存在這台裝置的瀏覽器
const STAMP_KEY = 'dk-island-stamps';

const ymd = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};

export function createStampBook(storeIds, goal) {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(STAMP_KEY) || '{}') || {};
  } catch { /* 讀不到就從空的集章冊開始 */ }
  // 門市被拿掉了，那個章就不算
  const stamps = new Map(Object.entries(saved.stamps && typeof saved.stamps === 'object' ? saved.stamps : {})
    .filter(([id, at]) => storeIds.has(id) && typeof at === 'string'));
  let claimedAt = typeof saved.claimedAt === 'string' ? saved.claimedAt : null;
  const save = () => {
    try {
      localStorage.setItem(STAMP_KEY, JSON.stringify({ stamps: Object.fromEntries(stamps), claimedAt }));
    } catch { /* 存不了就只是這次開頁面有效 */ }
  };

  return {
    goal,
    has: (id) => stamps.has(id),
    dateOf: (id) => stamps.get(id),
    get count() { return stamps.size; },
    get full() { return stamps.size >= goal; },
    get claimedAt() { return claimedAt; },
    ids: () => [...stamps.keys()],
    // 照蓋章的先後排
    list: () => [...stamps].sort((a, b) => a[1].localeCompare(b[1])).map(([id, at]) => ({ id, at })),
    add(id) {
      if (stamps.has(id) || !storeIds.has(id)) return false;
      stamps.set(id, new Date().toISOString());
      save();
      return true;
    },
    claim() {
      if (claimedAt) return;
      claimedAt = new Date().toISOString();
      save();
    },
  };
}

export const stampDate = ymd;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// 印泥的斑駁感：整頁共用一個 SVG 濾鏡
function ensureInkFilter() {
  if (document.getElementById('stamp-ink')) return;
  document.body.insertAdjacentHTML('beforeend', `<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <filter id="stamp-ink" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise"/>
    <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -3.2 2.75" result="mask"/>
    <feComposite in="SourceGraphic" in2="mask" operator="in" result="speckled"/>
    <feDisplacementMap in="speckled" in2="noise" scale="1.8"/>
  </filter>
</svg>`);
}

/** 一間店的圓形印章：外圈店名、中間 DK、下面蓋章日期；顏色用那間店玩法的顏色 */
export function stampSvg(store, ink, at) {
  ensureInkFilter();
  const seed = hashSeed(store.id);
  const name = shortName(store.name);
  const size = name.length <= 4 ? 15 : name.length <= 6 ? 13 : 10;
  const arc = `stamp-arc-${seed}`;
  return `<svg class="stamp-svg" viewBox="0 0 120 120" style="color:${esc(ink)};--r:${(seed % 19) - 9}deg" aria-hidden="true">
  <defs><path id="${arc}" d="M 28 62 A 32 32 0 0 1 92 62"/></defs>
  <g filter="url(#stamp-ink)" fill="currentColor" stroke="currentColor">
    <circle cx="60" cy="60" r="55" fill="none" stroke-width="4.5"/>
    <circle cx="60" cy="60" r="48" fill="none" stroke-width="1.4"/>
    <text font-size="${size}" font-weight="900" stroke="none" letter-spacing="2"><textPath href="#${arc}" startOffset="50%" text-anchor="middle">${esc(name)}</textPath></text>
    <text x="60" y="80" text-anchor="middle" font-size="30" font-weight="900" stroke="none" font-family="Georgia, 'Times New Roman', serif">DK</text>
    <path d="M 36 87 H 84" fill="none" stroke-width="1.2"/>
    <text x="60" y="99" text-anchor="middle" font-size="9" font-weight="700" stroke="none" letter-spacing="0.5">${esc(ymd(at))}</text>
  </g>
</svg>`;
}

// 側面看的木頭印章（蓋章動畫用），印面是那間店的顏色
export const STAMPER_SVG = `<svg viewBox="0 0 112 120" aria-hidden="true">
  <ellipse cx="56" cy="18" rx="17" ry="15" fill="#8a5a3c"/>
  <ellipse cx="51" cy="13" rx="6" ry="4" fill="#b07a54"/>
  <rect x="48" y="30" width="16" height="34" rx="4" fill="#a7744c"/>
  <rect x="10" y="62" width="92" height="38" rx="8" fill="#c99260"/>
  <rect x="10" y="62" width="92" height="9" rx="4" fill="#d9a676"/>
  <rect x="14" y="100" width="84" height="12" rx="3" fill="currentColor"/>
</svg>`;
