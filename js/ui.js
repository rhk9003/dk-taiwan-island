import { h, shortName } from './util.js';
import { mascotIndex } from './buildings.js';

const INTRO_KEY = 'dk-island-intro-v1';
const MASCOT_LETTERS = ['d', 'k', 'e', 'c']; // assets/mascot-?.png，順序跟島上氣球人的顏色一樣

/** 介面：右側門市清單、門市／區域卡、遊戲視窗、開場導覽 */
export function createUI(data, handlers) {
  const $ = (id) => document.getElementById(id);
  const card = $('card');
  const index = $('index');
  const list = $('region-list');
  const search = $('search');
  const chips = $('chips');
  const modal = $('modal');
  const frame = $('modal-frame');
  const shop = $('shop');
  const shopInner = $('shop-inner');
  const isMobile = () => window.matchMedia('(max-width: 820px)').matches;
  const regionById = new Map(data.regions.map((r) => [r.id, r]));
  const storesIn = (rid) => data.stores.filter((s) => s.region === rid);

  document.title = `${data.site.title}｜${data.site.subtitle}`;
  $('brand-eyebrow').textContent = data.site.eyebrow || '';
  $('brand-title').textContent = data.site.title;
  $('brand-sub').textContent = data.site.subtitle || '';
  $('index-title').textContent = data.site.indexTitle || '';
  const moduleIds = Object.keys(data.modules).filter((id) => data.stores.some((s) => s.module === id));
  $('index-stats').textContent = `${data.regions.length} 個分區・${data.stores.length} 間門市・${moduleIds.length} 種玩法`;

  // ---- 清單 ----
  let moduleFilter = null;
  let query = '';
  let current = { region: null, store: null };

  for (const id of moduleIds) {
    const m = data.modules[id];
    const n = data.stores.filter((s) => s.module === id).length;
    chips.append(h('button', {
      type: 'button',
      class: 'chip',
      'data-id': id,
      style: `--c:${m.color}`,
      onclick: () => { moduleFilter = moduleFilter === id ? null : id; renderList(); },
    }, h('i'), m.name, h('em', { text: n })));
  }

  const storeRow = (s, note) => {
    const m = data.modules[s.module];
    return h('button', { type: 'button', class: 'store-row', style: `--c:${m.color}`, onclick: () => handlers.onStore(s.id) },
      h('i'), h('b', { text: shortName(s.name) }), h('small', { text: note ?? m.name }));
  };

  const regionNodes = new Map();
  const storeNodes = new Map();
  for (const r of data.regions) {
    const stores = storesIn(r.id);
    const ul = h('ul', { class: 'store-list' }, stores.map((s) => {
      const li = h('li', {}, storeRow(s));
      storeNodes.set(s.id, li);
      return li;
    }));
    const li = h('li', { class: 'region' },
      h('button', { type: 'button', class: 'region-row', onclick: () => handlers.onRegion(r.id) },
        h('i', { text: r.no }), h('span', { text: r.name }),
        h('em', { text: r.badge || (r.role === 'plaza' ? '廣場' : `${stores.length} 間`) })),
      ul);
    regionNodes.set(r.id, { li, stores });
    list.append(li);
  }

  function renderList() {
    const q = query.trim().toLowerCase();
    const filtering = Boolean(q || moduleFilter);
    chips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c.dataset.id === moduleFilter));
    for (const [rid, node] of regionNodes) {
      let shown = 0;
      for (const s of node.stores) {
        const text = `${s.name}${s.address}${data.modules[s.module].name}`.toLowerCase();
        const ok = (!moduleFilter || s.module === moduleFilter) && (!q || text.includes(q));
        const li = storeNodes.get(s.id);
        li.hidden = !ok;
        li.firstChild.classList.toggle('active', s.id === current.store);
        if (ok) shown++;
      }
      node.li.hidden = filtering && shown === 0;
      node.li.classList.toggle('open', filtering ? shown > 0 : rid === current.region);
      node.li.classList.toggle('active', rid === current.region);
    }
  }
  search.addEventListener('input', () => { query = search.value; renderList(); });
  renderList();

  // ---- 卡片 ----
  function fillCard(...nodes) {
    card.replaceChildren(
      h('button', { type: 'button', class: 'card-close', 'aria-label': '關閉', onclick: () => handlers.onCloseCard() }, '×'),
      ...nodes.flat().filter(Boolean),
    );
    card.hidden = false;
    card.scrollTop = 0;
    if (isMobile()) index.classList.remove('open');
    reportInsets();
  }

  function hideCard() {
    card.hidden = true;
    reportInsets();
  }

  const head = (eyebrow, title) => [h('p', { class: 'eyebrow', text: eyebrow }), h('h3', { text: title })];

  function showRegion(id) {
    const r = regionById.get(id);
    const stores = storesIn(id);
    current = { region: id, store: null };
    closeShop();
    renderList();
    const counts = moduleIds
      .map((mid) => [data.modules[mid], stores.filter((s) => s.module === mid).length])
      .filter(([, n]) => n);
    fillCard(
      head(`REGION ${r.no}`, r.name),
      r.tagline ? h('p', { class: 'lead', text: r.tagline }) : null,
      r.plaza ? h('section', { class: 'plaza' }, h('p', { class: 'label', text: r.plaza.title }), h('p', { text: r.plaza.body })) : null,
      counts.length ? h('div', { class: 'pills' }, counts.map(([m, n]) => h('span', { class: 'pill', style: `--c:${m.color}` }, h('i'), `${m.name} ${n}`))) : null,
      stores.length ? h('p', { class: 'hint', text: '點這一區的建築，看店長的一句話和推薦。' }) : null,
      stores.length && isMobile() ? h('ul', { class: 'card-stores' }, stores.map((s) => h('li', {}, storeRow(s)))) : null,
    );
  }

  // ---- 進店 ----
  // 點門市：先在清單標出來、收起區域卡；鏡頭飛到門口後再開門進店（openShop）
  function selectStore(id) {
    const s = data.storeById.get(id);
    current = { region: s.region, store: id };
    renderList();
    if (!isMobile()) storeNodes.get(id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    index.classList.remove('open');
    hideCard();
  }

  // 鞋牆上的一雙推薦鞋；有官網網址就整塊可點
  function shelfItem(p) {
    const body = [
      h('span', { class: 'shoe-img' },
        p.image
          ? h('img', { src: p.image, alt: '', loading: 'lazy', onerror: (e) => e.target.replaceWith(h('span', { class: 'shoe-box', text: 'DK' })) })
          : h('span', { class: 'shoe-box', text: 'DK' })),
      h('span', { class: 'shoe-tag' },
        h('b', { text: p.name }),
        p.reason ? h('small', { text: p.reason }) : p.code || p.color ? h('small', { text: [p.code, p.color].filter(Boolean).join('・') }) : null),
    ];
    return p.url ? h('a', { class: 'shoe', href: p.url, target: '_blank', rel: 'noopener' }, body) : h('div', { class: 'shoe' }, body);
  }

  function openShop(id, { refresh = false } = {}) {
    const s = data.storeById.get(id);
    const r = regionById.get(s.region);
    const m = data.modules[s.module];
    const tel = (s.phone || '').replace(/[^\d]/g, '');
    const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address)}`;
    const products = s.products.map((pid) => data.products.get(pid)).filter(Boolean);
    const picks = s.pick ? [s.pick, ...products] : products;
    const sampleTag = s.sample ? h('span', { class: 'tag', text: '範例' }) : null;
    // 試算表資料晚到而重畫時，保留捲動位置和正在打的留言
    const oldRoom = shopInner.querySelector('.shop-room');
    const scroll = oldRoom?.scrollTop ?? 0;
    const oldForm = oldRoom?.querySelector('.note-form');
    const draft = oldForm ? { nickname: oldForm.nickname.value, text: oldForm.text.value } : null;

    shopInner.replaceChildren(
      h('header', { class: 'shop-sign' },
        h('div', { class: 'shop-logo', 'aria-hidden': 'true' }, h('b', { text: 'DK' }), h('small', { text: 'DR.KAO' })),
        h('div', { class: 'shop-title' },
          h('p', { class: 'eyebrow', text: `${r.no} ${r.name}・歡迎光臨` }),
          h('h2', { id: 'shop-name', text: s.name })),
        h('button', { type: 'button', class: 'shop-exit', onclick: () => handlers.onCloseShop() }, '← 離開門市')),
      h('div', { class: 'shop-awning', style: `--c:${m.color}` }),
      h('div', { class: 'shop-room' },
        h('section', { class: 'shop-counter' },
          h('div', { class: s.quote ? 'bubble' : 'bubble empty' },
            s.quote ? `「${s.quote}」` : '店長的話還在準備中，下次來就聽得到囉！',
            sampleTag),
          h('img', { class: 'mascot', src: `assets/mascot-${MASCOT_LETTERS[mascotIndex(s.id)]}.png`, alt: '' }),
          h('div', { class: 'counter' },
            h('span', { class: 'nameplate', text: s.manager || `${shortName(s.name)}店長` }))),
        h('section', { class: 'shop-wall' },
          h('p', { class: 'shop-label' }, '店長推薦', s.sample && products.length ? h('span', { class: 'tag', text: '範例' }) : null),
          h('div', { class: 'shelves' },
            picks.length
              ? picks.map(shelfItem)
              : [0, 1].map(() => h('div', { class: 'shoe waiting' },
                h('span', { class: 'shoe-img' }, h('span', { class: 'shoe-box', text: 'DK' })),
                h('span', { class: 'shoe-tag' }, h('b', { text: '即將上架' })))))),
        h('section', { class: 'shop-corner', style: `--c:${m.color}` },
          h('p', { class: 'shop-label', text: '店內玩法' }),
          h('h3', { text: m.name }),
          m.desc ? h('p', { text: m.desc }) : null,
          cornerAction(m, maps)),
        noteBoard(s)),
      h('footer', { class: 'shop-info' },
        h('span', { text: s.address }),
        tel ? h('a', { href: `tel:${tel}`, text: s.phone }) : null,
        h('a', { href: maps, target: '_blank', rel: 'noopener', text: 'Google 地圖 ↗' })),
    );

    if (refresh) {
      const room = shopInner.querySelector('.shop-room');
      room.scrollTop = scroll;
      const form = room.querySelector('.note-form');
      if (form && draft) {
        form.nickname.value = draft.nickname;
        form.text.value = draft.text;
        form.text.dispatchEvent(new Event('input'));
      }
      return;
    }
    shop.hidden = false;
    shop.classList.remove('opening');
    void shop.offsetWidth; // 重新觸發開門動畫
    shop.classList.add('opening');
    shopInner.scrollTop = 0;
    shopInner.focus({ preventScroll: true });
  }

  function closeShop() {
    shop.hidden = true;
    shop.classList.remove('opening');
  }

  // 玩法角落的按鈕：有遊戲就開遊戲；留言板玩法就捲到留言牆；一般門市就導去 Google 地圖
  function cornerAction(m, maps) {
    if (m.scrollTo === 'board') {
      return h('button', {
        type: 'button',
        class: 'cta',
        onclick: () => {
          const board = shopInner.querySelector('.shop-board');
          board?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          board?.querySelector('textarea')?.focus({ preventScroll: true });
        },
      }, `${m.cta} ↓`);
    }
    if (m.cta) return h('button', { type: 'button', class: 'cta', disabled: !m.url, onclick: () => openModule(m) }, m.url ? `${m.cta} →` : m.cta);
    return h('a', { class: 'cta', href: maps, target: '_blank', rel: 'noopener' }, '來門市試穿 →');
  }

  // ---- 留言牆（先審再上牆）----
  const NOTE_COLORS = ['#ffe08a', '#ffc2cf', '#bfe0ff', '#c7efd6', '#fff3b0', '#e6d7ff'];
  const pending = new Map(); // 這次開頁面自己送出、還在審核的留言（只有自己看得到）
  let cooldownUntil = 0;

  function note(m, i, extra = '') {
    const rot = ((i * 37) % 7) - 3;
    return h('figure', { class: `note ${extra}`, style: `--r:${rot}deg;--n:${NOTE_COLORS[i % NOTE_COLORS.length]}` },
      extra === 'pending' ? h('span', { class: 'note-flag', text: '審核中' }) : null,
      h('blockquote', { text: m.text }),
      h('figcaption', { text: `— ${m.nickname}` }));
  }

  function renderNotes(s, cork) {
    const mine = pending.get(s.id) || [];
    const list = s.messages || [];
    const notes = [...mine.map((m, i) => note(m, i + 3, 'pending')), ...list.map((m, i) => note(m, i))];
    if (!notes.length) {
      notes.push(h('figure', { class: 'note ghost', style: '--r:-2deg;--n:#fffdf6' }, h('blockquote', { text: '還沒有人留言，當第一個吧！' })));
    }
    cork.replaceChildren(...notes);
  }

  function noteBoard(s) {
    const cork = h('div', { class: 'cork' });
    renderNotes(s, cork);
    if (!handlers.onPostMessage) {
      return h('section', { class: 'shop-board' }, h('p', { class: 'shop-label', text: '留言牆' }), cork, h('p', { class: 'note-status', text: '留言板即將開放。' }));
    }

    const count = h('span', { class: 'note-count', text: '0/60' });
    const status = h('p', { class: 'note-status', role: 'status' });
    const submit = h('button', { type: 'submit', class: 'note-submit' }, '貼上去');
    const form = h('form', { class: 'note-form', novalidate: true },
      h('input', { name: 'nickname', maxlength: '12', placeholder: '你的暱稱（選填）', autocomplete: 'nickname' }),
      h('textarea', {
        name: 'text',
        maxlength: '60',
        rows: '2',
        placeholder: `想對${shortName(s.name)}說什麼？`,
        oninput: (e) => { count.textContent = `${e.target.value.length}/60`; },
      }),
      // 機器人才會填的隱藏欄位
      h('input', { name: 'website', class: 'hp', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' }),
      h('div', { class: 'note-actions' }, count, submit),
      status);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nickname = form.nickname.value.trim();
      const text = form.text.value.trim();
      if (text.length < 2) {
        status.textContent = '再多寫幾個字吧！';
        return;
      }
      if (Date.now() < cooldownUntil) {
        status.textContent = '留言太快了，休息一下再留吧！';
        return;
      }
      submit.disabled = true;
      status.textContent = '貼上去中…';
      const res = await handlers.onPostMessage(s.id, nickname, text, form.website.value);
      submit.disabled = false;
      if (!res.ok) {
        status.textContent = res.message;
        return;
      }
      cooldownUntil = Date.now() + 30000;
      pending.set(s.id, [{ nickname: nickname || '路過的客人', text }, ...(pending.get(s.id) || [])]);
      form.text.value = '';
      count.textContent = '0/60';
      status.textContent = '收到了！店員看過後就會貼上牆。';
      renderNotes(s, cork);
    });

    return h('section', { class: 'shop-board' },
      h('p', { class: 'shop-label' }, '留言牆', h('span', { class: 'note-hint', text: '店員看過後會貼上牆' })),
      cork,
      form);
  }

  // 試算表的資料晚一點才到：店裡正開著就重畫
  function refresh() {
    if (current.store && !shop.hidden) openShop(current.store, { refresh: true });
  }

  // 景點／機場卡：簡介＋離它最近的三間門市
  const distanceKm = ([lat1, lng1], [lat2, lng2]) => {
    const dx = (lng2 - lng1) * 111.32 * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
    return Math.hypot(dx, (lat2 - lat1) * 110.57);
  };

  function showLandmark(id) {
    const lm = data.landmarks.find((l) => l.id === id);
    current = { region: null, store: null };
    renderList();
    closeShop();
    const airport = lm.model === 'airport';
    const temple = lm.type === 'temple';
    const near = data.stores
      .filter((s) => Array.isArray(s.latlng))
      .map((s) => ({ s, km: distanceKm(lm.latlng, s.latlng) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, 3);
    fillCard(
      head(airport ? 'AIRPORT・機場' : temple ? 'TEMPLE・在地公廟' : 'SPOT・台灣景點', lm.name),
      lm.deity ? h('p', { class: 'deity', text: `主祀　${lm.deity}` }) : null,
      lm.desc ? h('p', { class: 'lead', text: lm.desc }) : null,
      near.length ? h('p', { class: 'hint', text: airport ? '下了飛機，最近的 DK 在這裡：' : temple ? '拜拜完，順路逛逛附近的 DK：' : '逛完順路去最近的 DK：' }) : null,
      near.length ? h('ul', { class: 'card-stores' }, near.map(({ s, km }) =>
        h('li', {}, storeRow(s, km < 1.5 ? '就在附近' : `約 ${Math.round(km)} 公里`)))) : null,
    );
  }

  function showNone() {
    current = { region: null, store: null };
    renderList();
    hideCard();
    closeShop();
  }

  // 告訴 3D 場景哪裡被卡片擋住，讓鏡頭把門市擺在看得到的地方
  function reportInsets() {
    const ins = { left: 0, bottom: 0 };
    if (isMobile()) {
      if (!card.hidden) ins.bottom = card.offsetHeight;
      else if (index.classList.contains('open')) ins.bottom = index.offsetHeight;
    } else if (!card.hidden) {
      ins.left = card.offsetWidth + 16;
    }
    handlers.onInsets(ins);
  }
  new ResizeObserver(reportInsets).observe(card);
  window.addEventListener('resize', reportInsets);

  // ---- 遊戲視窗 ----
  function openModule(m) {
    $('modal-title').textContent = m.name;
    $('modal-open').href = m.url;
    // 直式遊戲（例如 5:7）照遊戲比例開視窗，兩邊不會空一大塊
    const box = modal.querySelector('.modal-box');
    box.classList.toggle('portrait', Boolean(m.aspect));
    box.style.setProperty('--aspect', m.aspect || 'auto');
    frame.src = m.url;
    modal.hidden = false;
  }
  function closeModal() {
    modal.hidden = true;
    frame.src = 'about:blank';
  }
  $('modal-close').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  // ---- 開場導覽 ----
  function showIntro(step = 0) {
    const steps = data.site.intro || [];
    if (!steps.length) return;
    const s = steps[step];
    const last = step === steps.length - 1;
    $('intro-box').replaceChildren(
      h('p', { class: 'eyebrow', text: s.kicker || '' }),
      h('h2', { text: s.title }),
      h('p', { text: s.body }),
      h('div', { class: 'intro-actions' },
        h('button', { type: 'button', class: 'ghost', onclick: closeIntro }, '略過'),
        h('span', { class: 'dots' }, steps.map((_, i) => h('i', { class: i === step ? 'on' : '' }))),
        h('button', { type: 'button', class: 'primary', onclick: () => (last ? closeIntro() : showIntro(step + 1)) },
          last ? '走進島上 →' : '下一步 →')),
    );
    $('intro').hidden = false;
  }
  function closeIntro() {
    $('intro').hidden = true;
    try { localStorage.setItem(INTRO_KEY, '1'); } catch { /* 無痕模式存不了，下次再看一次導覽也無妨 */ }
  }
  function maybeShowIntro() {
    let seen = false;
    try { seen = localStorage.getItem(INTRO_KEY) === '1'; } catch { /* 同上 */ }
    if (!seen) showIntro(0);
  }

  // ---- 工具列與鍵盤 ----
  $('btn-overview').addEventListener('click', () => handlers.onOverview());
  $('btn-help').addEventListener('click', () => showIntro(0));
  $('btn-list').addEventListener('click', () => {
    const open = index.classList.toggle('open');
    if (open) card.hidden = true;
    reportInsets();
  });
  $('index-close').addEventListener('click', () => {
    index.classList.remove('open');
    reportInsets();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!modal.hidden) closeModal();
    else if (!$('intro').hidden) closeIntro();
    else if (!shop.hidden) handlers.onCloseShop();
    else if (!card.hidden) handlers.onCloseCard();
  });

  return { showRegion, showLandmark, selectStore, openShop, showNone, maybeShowIntro, refresh };
}
