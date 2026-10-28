import { h } from './util.js';

// 客服任務島各站的互動內容（物流港口、退換貨中心、即將開放的站）。內容文字都來自 data/service.json

const WEEKDAY = '日一二三四五六';
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const md = (d) => `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAY[d.getDay()]}）`;
const isWorkday = (d, holidays) => d.getDay() !== 0 && d.getDay() !== 6 && !holidays.has(ymd(d));

function addWorkdays(start, n, holidays) {
  const d = new Date(start);
  for (let added = 0; added < n;) {
    d.setDate(d.getDate() + 1);
    if (isWorkday(d, holidays)) added++;
  }
  return d;
}

// start 隔天起到 end（含）之間有幾個工作天
function workdaysBetween(start, end, holidays) {
  let n = 0;
  for (const d = new Date(start); d < end;) {
    d.setDate(d.getDate() + 1);
    if (d <= end && isWorkday(d, holidays)) n++;
  }
  return n;
}

// 靜態的小圖示（內容是寫死的 SVG，不含任何使用者資料）
const ICONS = {
  shoe: '<path d="M3 15h18v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM4 15l1-7h4l2 3 5 1c2 .4 4 1.6 4 3"/>',
  bag: '<path d="M6 8h12l-1 12H7zM9 8a3 3 0 0 1 6 0"/>',
  carton: '<path d="M3 8l9-4 9 4v9l-9 4-9-4zM3 8l9 4 9-4M12 12v9"/>',
  tape: '<circle cx="10" cy="12" r="6"/><circle cx="10" cy="12" r="2.5"/><path d="M16 12h6"/>',
  sticker: '<path d="M5 4h14v10l-6 6H5zM13 20v-6h6"/>',
  scissors: '<circle cx="6" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M8.5 7.5L20 18M8.5 16.5L20 6"/>',
  ship: '<path d="M3 15h18l-3 5H6zM6 15V9h9l3 6M9 9V5h3"/>',
  warehouse: '<path d="M3 21V9l9-5 9 5v12M7 21v-7h10v7M7 17h10"/>',
  house: '<path d="M4 11l8-7 8 7v9H4zM10 20v-5h4v5"/>',
};
function icon(name) {
  const span = document.createElement('span');
  span.className = 'st-icon';
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  return span;
}

const section = (no, title, ...children) =>
  h('section', { class: 'st-section' }, h('h3', {}, h('b', { text: no }), title), ...children);

const list = (items) => h('ul', { class: 'st-list' }, items.map((t) => h('li', { text: t })));

function contactLinks(svc) {
  const c = svc.contact || {};
  const tel = (c.phone || '').replace(/[^\d]/g, '');
  return h('p', { class: 'st-contact' },
    '還是有問題？',
    tel ? h('a', { href: `tel:${tel}`, text: `客服電話 ${c.phone}` }) : null,
    c.hours ? h('span', { text: `（${c.hours}）` }) : null,
    c.messageUrl ? h('a', { href: c.messageUrl, target: '_blank', rel: 'noopener', text: '線上客服留言 ↗' }) : null);
}

/** 物流港口：輸入付款日，算出預計到貨區間，並畫出包裹現在走到哪 */
export function shippingStation(svc, onDone) {
  const rules = svc.shipping;
  const holidays = new Set(rules.holidays || []);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const input = h('input', { type: 'date', value: ymd(today), max: ymd(today) });
  const result = h('p', { class: 'st-result' });
  const note = h('p', { class: 'st-note' });
  // DK 物流車：從倉庫沿著公路開到你家，車子停在包裹現在走到的位置
  const stages = ['付款完成', '倉庫出貨', '物流車配送中', '送到你家'];
  const dots = stages.map((s) => h('li', {}, h('i'), h('span', { text: s })));
  const truck = document.createElement('div');
  truck.className = 'st-truck';
  truck.innerHTML = `<svg viewBox="0 0 64 36" aria-hidden="true">
    <rect x="2" y="6" width="38" height="20" rx="3" fill="#8B2332"/>
    <text x="21" y="20.5" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="11" fill="#fff">DK</text>
    <path d="M40 12h11l7 8v6H40z" fill="#fbf5ec" stroke="#8B2332" stroke-width="1.5"/>
    <path d="M43 14h7l4 5h-11z" fill="#bfe3f0"/>
    <g class="wheel"><circle cx="13" cy="28" r="5" fill="#2b2b2b"/><circle cx="13" cy="28" r="1.8" fill="#ddd"/></g>
    <g class="wheel"><circle cx="49" cy="28" r="5" fill="#2b2b2b"/><circle cx="49" cy="28" r="1.8" fill="#ddd"/></g>
  </svg>`;
  const parcel = h('span', { class: 'st-parcel' }, icon('carton'));
  const road = h('div', { class: 'st-road' },
    h('span', { class: 'st-road-end start' }, icon('warehouse'), 'DK 倉庫'),
    h('span', { class: 'st-road-end finish' }, icon('house'), '你家', parcel),
    truck);
  const track = h('div', { class: 'st-track' }, road, h('ol', {}, dots));

  function update() {
    const [y, m, d] = input.value.split('-').map(Number);
    if (!y) return;
    const paid = new Date(y, m - 1, d);
    const from = addWorkdays(paid, rules.minDays, holidays);
    const to = addWorkdays(paid, rules.maxDays, holidays);
    result.textContent = `預計 ${md(from)} ～ ${md(to)} 之間到貨`;
    const elapsed = paid > today ? 0 : workdaysBetween(paid, today, holidays);
    const stage = elapsed <= 0 ? 0 : elapsed < rules.minDays - 3 ? 1 : elapsed < rules.minDays ? 2 : 3;
    dots.forEach((li, i) => li.classList.toggle('on', i <= stage));
    // 車子位置：付款日在倉庫，出貨後上路，到貨區間開到家門口
    const progress = stage === 0 ? 0 : Math.min(1, elapsed / rules.minDays);
    truck.style.left = `calc(${progress} * (100% - 140px) + 44px)`;
    truck.classList.toggle('driving', stage === 1 || stage === 2);
    parcel.classList.toggle('show', stage === 3);
    note.classList.toggle('warn', elapsed > rules.maxDays);
    note.textContent = elapsed > rules.maxDays
      ? `已經過了 ${elapsed} 個工作天還沒收到嗎？先到訂單查詢看貨態，或直接聯絡客服。`
      : elapsed > 0 ? `從付款日到今天，已經過了 ${elapsed} 個工作天。` : '付款完成後，隔天開始算工作天。';
  }
  input.addEventListener('input', update);
  update();

  return [
    h('p', { class: 'st-lead', text: rules.rule }),
    section('1', '算算看我的包裹哪天到',
      h('label', { class: 'st-field' }, h('span', { text: '付款完成（帳款確認）的日期' }), input),
      result, track, note),
    section('2', '配送小提醒', list(rules.notes || [])),
    section('3', '查我的訂單',
      h('p', { class: 'st-text', text: '實際出貨、配送進度，在官網「我的帳戶 > 訂單查詢」看得最清楚。' }),
      svc.contact?.ordersUrl ? h('a', { class: 'cta', href: svc.contact.ordersUrl, target: '_blank', rel: 'noopener', style: '--c:#3F7FBF' }, '到訂單查詢 →') : null,
      contactLinks(svc)),
    h('button', { type: 'button', class: 'st-done', onclick: () => onDone('shipping') }, '我知道了，完成任務！'),
  ];
}

/** 退換貨中心：先確認能不能退換 → 打包小遊戲 → 照步驟申請 */
export function returnsStation(svc, onDone) {
  const r = svc.returns;

  // 1. 能不能退換
  const verdict = h('p', { class: 'st-result' });
  const boxes = r.checklist.map((text) => h('input', { type: 'checkbox' }));
  const checkUpdate = () => {
    const ok = boxes.filter((b) => b.checked).length;
    verdict.classList.toggle('warn', ok !== boxes.length);
    if (ok === boxes.length) verdict.textContent = '條件都符合，可以申請退換貨！';
    else verdict.textContent = `還有 ${boxes.length - ok} 項沒打勾。如果有一項不符合，可能無法受理，建議先聯絡客服確認。`;
  };
  boxes.forEach((b) => b.addEventListener('change', checkUpdate));
  checkUpdate();
  const checklist = h('ul', { class: 'st-checks' }, r.checklist.map((text, i) => h('li', {}, h('label', {}, boxes[i], h('span', { text })))));

  const ruleBox = h('div', { class: 'st-rules' });
  const tabs = [['return', '我要退貨', r.returnRules], ['exchange', '我要換貨', r.exchangeRules]];
  const tabButtons = tabs.map(([id, label, rules]) => h('button', {
    type: 'button',
    class: 'st-tab',
    onclick: () => {
      tabButtons.forEach((b) => b.classList.toggle('on', b.dataset.id === id));
      ruleBox.replaceChildren(list(rules));
    },
    'data-id': id,
  }, label));
  tabButtons[0].click();

  // 2. 打包小遊戲：照順序點卡片
  const p = r.packing;
  const cards = [...p.steps.map((s) => ({ ...s, kind: 'step' })), ...p.traps.map((s) => ({ ...s, kind: 'trap' }))]
    .map((c) => ({ c, k: Math.random() }))
    .sort((a, b) => a.k - b.k)
    .map(({ c }) => c);
  let next = 0;
  const stage = h('ol', { class: 'pack-stage' });
  const status = h('p', { class: 'pack-status', text: '從第一步開始：要先做什麼？' });
  const doneBtn = h('button', { type: 'button', class: 'st-done', disabled: true, onclick: () => onDone('returns') }, '打包完成，完成任務！');
  const cardEls = cards.map((card) => {
    const btn = h('button', { type: 'button', class: 'pack-card' }, icon(card.icon), h('span', { text: card.label }));
    btn.addEventListener('click', () => {
      if (next >= p.steps.length) return;
      const shake = (msg) => {
        status.textContent = msg;
        status.classList.add('warn');
        btn.classList.remove('shake');
        void btn.offsetWidth;
        btn.classList.add('shake');
      };
      if (card.kind === 'trap') return shake(`不行喔！${card.hint}`);
      if (card.id !== p.steps[next].id) return shake(`順序不對喔！提示：下一步是「${p.steps[next].label}」。`);
      btn.disabled = true;
      btn.classList.add('done');
      stage.append(h('li', {}, icon(card.icon), h('span', { text: card.label })));
      next++;
      status.classList.remove('warn');
      if (next === p.steps.length) {
        status.textContent = '打包完成！這樣寄回去最安全，宅配人員來收就交給他。';
        stage.classList.add('sealed');
        doneBtn.disabled = false;
      } else {
        status.textContent = `做得好！下一步呢？（${next}/${p.steps.length}）`;
      }
    });
    return btn;
  });

  return [
    section('1', '先確認能不能退換', checklist, verdict, h('div', { class: 'st-tabs' }, tabButtons), ruleBox),
    section('2', '打包小遊戲', h('p', { class: 'st-text', text: p.intro }), h('div', { class: 'pack-cards' }, cardEls), status, stage),
    section('3', '照步驟申請',
      h('ol', { class: 'st-steps' }, r.apply.map((t) => h('li', { text: t }))),
      svc.contact?.ordersUrl ? h('a', { class: 'cta', href: svc.contact.ordersUrl, target: '_blank', rel: 'noopener', style: '--c:#E07A2E' }, '到訂單查詢申請 →') : null,
      contactLinks(svc)),
    doneBtn,
  ];
}

/** 還沒做好的站 */
export function comingSoonStation(mission) {
  return [
    h('div', { class: 'st-soon' },
      h('p', { class: 'st-lead', text: mission.teaser || '' }),
      h('p', { class: 'st-text', text: `${mission.station}正在準備中，敬請期待！` })),
  ];
}
