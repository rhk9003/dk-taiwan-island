import { h, shortName } from './util.js';

const INTRO_KEY = 'dk-island-intro-v1';

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

  const storeRow = (s) => {
    const m = data.modules[s.module];
    return h('button', { type: 'button', class: 'store-row', style: `--c:${m.color}`, onclick: () => handlers.onStore(s.id) },
      h('i'), h('b', { text: shortName(s.name) }), h('small', { text: m.name }));
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
        h('em', { text: r.role === 'plaza' ? '廣場' : `${stores.length} 間` })),
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

  function showStore(id) {
    const s = data.storeById.get(id);
    const r = regionById.get(s.region);
    const m = data.modules[s.module];
    current = { region: s.region, store: id };
    renderList();
    if (!isMobile()) storeNodes.get(id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

    const tel = (s.phone || '').replace(/[^\d]/g, '');
    const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address)}`;
    const products = s.products.map((pid) => data.products.get(pid)).filter(Boolean);

    fillCard(
      head(`${r.no} ${r.name}・STORE`, s.name),
      h('p', { class: 'addr', text: s.address }),
      h('div', { class: 'links' },
        tel ? h('a', { href: `tel:${tel}`, text: s.phone }) : null,
        h('a', { href: maps, target: '_blank', rel: 'noopener', text: 'Google 地圖 ↗' })),
      h('section', { class: 'mod', style: `--c:${m.color}` },
        h('p', { class: 'label', text: '這間店的玩法' }),
        h('h4', { text: m.name }),
        m.desc ? h('p', { text: m.desc }) : null,
        m.cta ? h('button', { type: 'button', class: 'cta', disabled: !m.url, onclick: () => openModule(m) }, m.url ? `${m.cta} →` : m.cta) : null),
      h('section', { class: 'quote' },
        h('p', { class: 'label' }, '店長的話', s.sample ? h('span', { class: 'tag', text: '範例' }) : null),
        s.quote
          ? [h('blockquote', { text: `「${s.quote}」` }), h('p', { class: 'by', text: `— ${s.manager || `${shortName(s.name)}店長`}` })]
          : h('p', { class: 'empty', text: '店長的話蒐集中，敬請期待。' })),
      h('section', { class: 'picks' },
        h('p', { class: 'label' }, '店長推薦', s.sample && products.length ? h('span', { class: 'tag', text: '範例' }) : null),
        products.length
          ? h('ul', {}, products.map((p) => h('li', {},
            h('a', { href: p.url, target: '_blank', rel: 'noopener' },
              p.image ? h('img', { src: p.image, alt: '', loading: 'lazy' }) : h('span', { class: 'noimg' }),
              h('span', {}, h('b', { text: p.name }), h('small', { text: [p.code, p.color].filter(Boolean).join('・') })),
              h('i', { text: '›' })))))
          : h('p', { class: 'empty', text: '店長推薦蒐集中。' })),
    );
  }

  function showNone() {
    current = { region: null, store: null };
    renderList();
    hideCard();
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
    else if (!card.hidden) handlers.onCloseCard();
  });

  return { showRegion, showStore, showNone, maybeShowIntro };
}
