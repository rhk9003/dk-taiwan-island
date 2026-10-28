import { h, shortName } from './util.js';
import { mascotIndex } from './buildings.js';
import { shippingStation, returnsStation, comingSoonStation } from './service.js';
import { RESIDENT_OPTIONS } from './residents.js';
import { stampSvg, stampDate, STAMPER_SVG } from './stamps.js';
import { cleanText, textProblem } from './textrules.js';

const INVITE_KEY = 'dk-island-invite-v1'; // 登島邀請函看過了沒、登島證號碼
const MISSION_KEY = 'dk-island-missions'; // 這台裝置完成過哪些客服任務
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
    return h('button', { type: 'button', class: handlers.stamps?.has(s.id) ? 'store-row stamped' : 'store-row', style: `--c:${m.color}`, onclick: () => handlers.onStore(s.id) },
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
        li.firstChild.classList.toggle('stamped', Boolean(handlers.stamps?.has(s.id)));
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
      r.plaza ? h('section', { class: 'plaza' },
        h('p', { class: 'label', text: r.plaza.title }),
        h('p', { text: r.plaza.body }),
        handlers.stamps ? h('button', { type: 'button', class: 'cta', onclick: () => handlers.onStampBook() }, `打開集章冊（${stampCount()}）→`) : null) : null,
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
    const picks = [...(s.picks || []), ...products];
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
          h('div', { class: !s.quote ? 'bubble empty' : [...s.quote].length > 32 ? 'bubble long' : 'bubble' },
            s.quote ? `「${s.quote}」` : '店長的話還在準備中，下次來就聽得到囉！',
            sampleTag),
          h('img', { class: 'mascot', src: `assets/mascot-${MASCOT_LETTERS[mascotIndex(s.id)]}.png`, alt: '' }),
          h('div', { class: 'counter' },
            h('span', { class: 'nameplate', text: s.manager || `${shortName(s.name)}店長` }))),
        stampDesk(s, m),
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
    shop.classList.remove('opening', 'is-station');
    void shop.offsetWidth; // 重新觸發開門動畫
    shop.classList.add('opening');
    shopInner.scrollTop = 0;
    shopInner.focus({ preventScroll: true });
  }

  function closeShop() {
    shop.hidden = true;
    shop.classList.remove('opening', 'is-station');
  }

  // ---- 有買鞋煩惱的路人：聽他說煩惱，從四雙鞋裡幫他挑 ----
  const shuffle = (list) => {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  function showShopper(c, slot) {
    const { shoes } = data.shoppers;
    current = { region: null, store: null };
    renderList();
    closeShop();
    const others = shuffle([...shoes.keys()].filter((id) => !c.answer.includes(id)));
    const options = shuffle([c.answer[0], ...others.slice(0, 3)]);
    const feedback = h('div', { class: 'q-feedback', role: 'status' });
    let solved = false;

    const buttons = options.map((id) => {
      const s = shoes.get(id);
      const btn = h('button', { type: 'button', class: 'q-option' },
        h('span', { class: 'q-img' },
          s.image
            ? h('img', { src: s.image, alt: '', loading: 'lazy', onerror: (e) => e.target.replaceWith(h('span', { class: 'shoe-box', text: 'DK' })) })
            : h('span', { class: 'shoe-box', text: 'DK' })),
        h('small', { text: s.tag }),
        h('b', { text: s.name }),
        s.points.length ? h('ul', {}, s.points.slice(0, 2).map((pt) => h('li', { text: pt }))) : null);
      btn.addEventListener('click', () => pick(id, btn));
      return btn;
    });

    function pick(id, btn) {
      if (solved) return;
      const s = shoes.get(id);
      const right = c.answer.includes(id);
      const also = !right && (c.also || []).includes(id);
      if (!right && !also) {
        btn.disabled = true;
        btn.classList.add('wrong');
        feedback.className = 'q-feedback no';
        feedback.replaceChildren(
          h('p', { class: 'q-say', text: `${c.who}：「這雙很好，可是我最在意的是${c.need}……」` }),
          h('p', { text: '再挑一次看看吧！' }));
        return;
      }
      solved = true;
      buttons.forEach((b) => { b.disabled = true; });
      btn.classList.add('right');
      const count = handlers.onShopperSolved(slot, c);
      const best = shoes.get(c.answer[0]);
      const shoeLink = (shoe, label) => (shoe.url
        ? h('a', { class: 'cta', style: '--c:#8B2332', href: shoe.url, target: '_blank', rel: 'noopener' }, label)
        : null);
      feedback.className = 'q-feedback yes';
      feedback.replaceChildren(...[
        h('p', { class: 'q-say', text: `${c.who}：「${right ? c.thanks || '就是這雙，謝謝你！' : '這雙也不錯耶！'}」` }),
        h('p', { text: also ? c.alsoNote || c.why : c.why }),
        helpReward(count),
        h('div', { class: 'q-actions' },
          shoeLink(s, `看${s.name} ↗`),
          also ? shoeLink(best, `看${best.name} ↗`) : null,
          h('button', { type: 'button', class: 'cta q-next', onclick: () => handlers.onNextShopper(slot) }, '去幫下一位路人 →')),
        h('p', { class: 'q-count', text: `你已經幫 ${count} 位路人挑到鞋` }),
      ].filter(Boolean));
    }

    // 幫到第 reward.after 位就送優惠券；每台裝置領一次
    function helpReward(count) {
      const reward = data.shoppers.reward;
      if (!reward) return null;
      if (handlers.helpCoupon.claimedAt) return h('p', { class: 'q-count', text: '你已經領過優惠券囉，謝謝你繼續幫忙！' });
      if (count < reward.after) return h('p', { class: 'q-reward-left', text: `再幫 ${reward.after - count} 位路人挑到鞋，就能領優惠券！` });
      const status = h('p', { class: 'note-status', role: 'status' });
      return h('section', { class: 'q-reward' },
        h('span', { class: 'q-gift', 'aria-hidden': 'true', text: '🎁' }),
        h('b', { text: reward.title || '謝謝你幫忙挑鞋！' }),
        reward.desc ? h('p', { text: reward.desc }) : null,
        reward.code ? h('div', { class: 'reward-code' },
          h('code', { text: reward.code }),
          h('button', {
            type: 'button',
            onclick: async () => {
              try {
                await navigator.clipboard.writeText(reward.code);
                status.textContent = '優惠碼複製好了！';
              } catch {
                status.textContent = '複製不了，請長按優惠碼自己複製。';
              }
              handlers.onClaimHelpCoupon();
            },
          }, '複製')) : null,
        reward.url ? h('a', { class: 'cta coupon-cta', href: reward.url, target: '_blank', rel: 'noopener', onclick: () => handlers.onClaimHelpCoupon() }, `${reward.cta || '領取優惠券'} →`) : null,
        status);
    }

    fillCard(
      head('SHOE HELP・路人的買鞋煩惱', c.who),
      h('div', { class: 'q-bubble', text: `「${c.says}」` }),
      h('p', { class: 'q-prompt' }, '你會推薦哪一雙？',
        data.shoppers.reward && !handlers.helpCoupon.claimedAt ? h('span', { class: 'q-offer', text: '🎁 挑對了就送優惠券！' }) : null),
      h('div', { class: 'q-options' }, buttons),
      feedback,
      handlers.helped.size ? h('p', { class: 'q-count', text: `你已經幫 ${handlers.helped.size} 位路人挑到鞋` }) : null);
  }

  // ---- 門市集章：櫃台旁的蓋章台 ----
  const stampCount = () => {
    const b = handlers.stamps;
    return b.count >= b.goal ? `${b.count} 章・已集滿` : `${b.count} / ${b.goal} 章`;
  };

  function stampDesk(s, m) {
    const book = handlers.stamps;
    if (!book) return null;
    const slot = h('span', { class: 'stamp-slot' });
    const stamper = h('span', { class: 'stamper', style: `color:${m.color}` });
    stamper.innerHTML = STAMPER_SVG;
    const msg = h('p', { class: 'stamp-msg' });
    const btn = h('button', { type: 'button', class: 'cta stamp-btn', style: `--c:${m.color}` });
    const progress = h('div', { class: 'stamp-progress' });

    const drawSlot = (fresh) => {
      if (!book.has(s.id)) {
        slot.replaceChildren(h('span', { class: 'stamp-empty', text: '蓋在這裡' }));
        return;
      }
      slot.innerHTML = stampSvg(s, m.color, book.dateOf(s.id));
      slot.classList.toggle('fresh', fresh);
    };
    const drawText = () => {
      const has = book.has(s.id);
      const left = book.goal - book.count;
      const ready = book.full && !book.claimedAt;
      btn.disabled = has;
      btn.textContent = has ? '這間店蓋過了 ✓' : '蓋章！';
      msg.textContent = !has
        ? `在${shortName(s.name)}蓋一個章。集滿 ${book.goal} 間不同門市的章，就能領一張優惠券！`
        : left > 0 ? `再到 ${left} 間不同的 DK 蓋章，就能領優惠券。`
          : ready ? `集滿 ${book.goal} 章了！打開集章冊領優惠券。` : '你已經集滿、領過優惠券了，謝謝你逛遍 DK！';
      progress.replaceChildren(
        h('span', { class: 'stamp-bar', style: `--p:${Math.min(1, book.count / book.goal)}` }, h('i')),
        h('b', { text: stampCount() }),
        h('button', { type: 'button', class: ready ? 'stamp-open ready' : 'stamp-open', onclick: () => handlers.onStampBook() },
          ready ? '領優惠券 →' : '集章冊 →'));
    };

    btn.addEventListener('click', () => {
      if (book.has(s.id) || stamper.classList.contains('pressing')) return;
      handlers.onStamp(s.id); // 先記下來，動畫只是好看
      btn.disabled = true;
      stamper.classList.add('pressing');
      setTimeout(() => drawSlot(true), 560); // 印章抬起來的時候露出印子
      setTimeout(() => {
        stamper.classList.remove('pressing');
        drawText();
        if (book.full && !book.claimedAt) progress.classList.add('cheer');
      }, 1000);
    });
    drawSlot(false);
    drawText();

    return h('section', { class: 'shop-stamp', style: `--c:${m.color}` },
      h('p', { class: 'shop-label', text: data.stamps.title || '門市集章' }),
      h('div', { class: 'stamp-paper' }, slot, stamper),
      msg,
      btn,
      progress);
  }

  // ---- 集章冊：蓋過的章依序排好，集滿就能領優惠券 ----
  function showStampBook() {
    const book = handlers.stamps;
    const cfg = data.stamps;
    const reward = cfg.reward;
    current = { region: null, store: null };
    renderList();
    closeShop();
    const list = book.list();
    const cells = Array.from({ length: Math.max(book.goal, list.length) }, (_, i) => {
      const item = list[i];
      if (!item) return h('li', { class: 'stamp-cell empty' }, h('span', { text: i + 1 }));
      const s = data.storeById.get(item.id);
      const btn = h('button', { type: 'button', title: `${s.name}・${stampDate(item.at)}`, 'aria-label': s.name, onclick: () => handlers.onStore(s.id) });
      btn.innerHTML = stampSvg(s, data.modules[s.module].color, item.at);
      return h('li', { class: 'stamp-cell' }, btn);
    });

    let tail;
    if (book.full) {
      const status = h('p', { class: 'note-status', role: 'status' });
      tail = h('section', { class: 'stamp-reward' },
        h('p', { class: 'label', text: reward.title || `集滿 ${book.goal} 章！` }),
        reward.desc ? h('p', { text: reward.desc }) : null,
        reward.code ? h('div', { class: 'reward-code' },
          h('code', { text: reward.code }),
          h('button', {
            type: 'button',
            onclick: async () => {
              try {
                await navigator.clipboard.writeText(reward.code);
                status.textContent = '優惠碼複製好了！';
              } catch {
                status.textContent = '複製不了，請長按優惠碼自己複製。';
              }
              handlers.onClaim();
            },
          }, '複製')) : null,
        reward.url
          ? h('a', { class: 'cta coupon-cta', href: reward.url, target: '_blank', rel: 'noopener', onclick: () => handlers.onClaim() }, `${reward.cta || '領取優惠券'} →`)
          : reward.code ? null : h('button', { type: 'button', class: 'cta', disabled: true }, '優惠券準備中'),
        status,
        book.claimedAt ? h('small', { class: 'muted', text: `你在 ${stampDate(book.claimedAt)} 領過了。` }) : null);
    } else {
      const todo = data.stores.filter((s) => !book.has(s.id));
      tail = h('div', { class: 'stamp-next' },
        h('p', { text: `還差 ${book.goal - book.count} 章。走進任何一間 DK，在櫃台旁按「蓋章！」。` }),
        h('button', { type: 'button', class: 'cta', onclick: () => handlers.onStore(todo[Math.floor(Math.random() * todo.length)].id) }, '帶我去一間還沒蓋的店 →'));
    }

    fillCard(
      head('STAMP RALLY・集章冊', cfg.title || 'DK 門市集章'),
      cfg.desc ? h('p', { class: 'lead', text: cfg.desc }) : null,
      h('div', { class: 'stamp-progress' },
        h('span', { class: 'stamp-bar', style: `--p:${Math.min(1, book.count / book.goal)}` }, h('i')),
        h('b', { text: stampCount() })),
      h('ol', { class: 'stamp-grid' }, cells),
      tail,
    );
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

  // ---- 留言牆（不審核、直接貼上牆；不適當的到試算表勾「隱藏」）----
  const NOTE_COLORS = ['#ffe08a', '#ffc2cf', '#bfe0ff', '#c7efd6', '#fff3b0', '#e6d7ff'];
  const pending = new Map(); // 後端還是「先審再上牆」的舊版時，自己送出、還在審核的留言（只有自己看得到）
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
      const nickname = cleanText(form.nickname.value);
      const text = cleanText(form.text.value);
      if ([...text].length < 2) {
        status.textContent = '再多寫幾個字吧！';
        return;
      }
      const problem = textProblem(text) || textProblem(nickname, 'nickname');
      if (problem) {
        status.textContent = problem;
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
      const mine = { nickname: nickname || '路過的客人', text };
      if (res.data?.published) {
        s.messages = [mine, ...(s.messages || [])].slice(0, 12);
        status.textContent = '貼上去了！';
      } else {
        pending.set(s.id, [mine, ...(pending.get(s.id) || [])]);
        status.textContent = '收到了！店員看過後就會貼上牆。';
      }
      form.text.value = '';
      count.textContent = '0/60';
      renderNotes(s, cork);
    });

    return h('section', { class: 'shop-board' },
      h('p', { class: 'shop-label' }, '留言牆', h('span', { class: 'note-hint', text: '請友善留言，不能放網址或聯絡方式' })),
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

  // 領優惠券的金色氣球人：說明＋領券按鈕
  function showCoupon() {
    const c = data.site.coupon;
    current = { region: null, store: null };
    renderList();
    closeShop();
    fillCard(
      head('COUPON・領優惠券', c.title || '優惠券氣球人'),
      c.desc ? h('p', { class: 'lead', text: c.desc }) : null,
      c.url ? h('a', { class: 'cta coupon-cta', href: c.url, target: '_blank', rel: 'noopener' }, `${c.cta || '去領優惠券'} →`) : null,
    );
  }

  function showLandmark(id) {
    const lm = data.landmarks.find((l) => l.id === id);
    current = { region: null, store: null };
    renderList();
    closeShop();
    const airport = lm.model === 'airport';
    const temple = lm.type === 'temple';
    const cinema = lm.type === 'cinema';
    const near = data.stores
      .filter((s) => Array.isArray(s.latlng))
      .map((s) => ({ s, km: distanceKm(lm.latlng, s.latlng) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, 3);
    fillCard(
      head(airport ? 'AIRPORT・機場' : temple ? 'TEMPLE・在地公廟' : cinema ? 'CINEMA・DK 電影院' : 'SPOT・台灣景點', lm.name),
      lm.deity ? h('p', { class: 'deity', text: `主祀　${lm.deity}` }) : null,
      lm.desc ? h('p', { class: 'lead', text: lm.desc }) : null,
      lm.url ? h('button', { type: 'button', class: 'cta', style: '--c:#8B2332', onclick: () => openModule({ name: lm.name, url: lm.url, aspect: lm.aspect }) }, `${lm.cta || '打開'} →`) : null,
      near.length ? h('p', { class: 'hint', text: airport ? '下了飛機，最近的 DK 在這裡：' : temple ? '拜拜完，順路逛逛附近的 DK：' : '逛完順路去最近的 DK：' }) : null,
      near.length ? h('ul', { class: 'card-stores' }, near.map(({ s, km }) =>
        h('li', {}, storeRow(s, km < 1.5 ? '就在附近' : `約 ${Math.round(km)} 公里`)))) : null,
    );
  }

  // ---- 客服任務島 ----
  const readStamps = () => {
    try { return JSON.parse(localStorage.getItem(MISSION_KEY) || '{}'); } catch { return {}; }
  };
  const stamp = (id) => {
    const all = readStamps();
    all[id] = new Date().toISOString().slice(0, 10);
    try { localStorage.setItem(MISSION_KEY, JSON.stringify(all)); } catch { /* 存不了就只是這次看不到打勾 */ }
  };

  function showServiceMenu() {
    const svc = data.service;
    const done = readStamps();
    current = { region: 'service', store: null };
    renderList();
    closeShop();
    fillCard(
      head('SERVICE・客服任務島', '你今天想解決什麼？'),
      svc.npc?.greeting ? h('p', { class: 'lead', text: svc.npc.greeting }) : null,
      h('ul', { class: 'missions' }, svc.missions.map((m) => h('li', {},
        h('button', { type: 'button', class: 'mission', style: `--c:${m.color || '#8B2332'}`, onclick: () => handlers.onMission(m.id) },
          h('i'),
          h('span', {}, h('b', { text: m.question }), h('small', { text: `前往${m.station}` })),
          m.comingSoon ? h('em', { class: 'soon', text: '即將開放' }) : done[m.id] ? h('em', { class: 'stamped', text: '已完成' }) : h('em', { text: '›' }))))),
    );
  }

  function openStation(id) {
    const svc = data.service;
    const m = svc.missions.find((x) => x.id === id);
    const onDone = (mid) => {
      stamp(mid);
      handlers.onServiceBack();
    };
    let body;
    if (m.comingSoon) body = comingSoonStation(m);
    else if (id === 'shipping') body = shippingStation(svc, onDone);
    else if (id === 'returns') body = returnsStation(svc, onDone);
    else body = comingSoonStation(m);

    current = { region: 'service', store: null };
    renderList();
    hideCard();
    shopInner.replaceChildren(
      h('header', { class: 'shop-sign station-sign', style: `--c:${m.color || '#8B2332'}` },
        h('div', { class: 'shop-title' },
          h('p', { class: 'eyebrow', text: `客服任務・${m.station}` }),
          h('h2', { id: 'shop-name', text: m.question })),
        h('button', { type: 'button', class: 'shop-exit', onclick: () => handlers.onServiceBack() }, '← 回任務選單')),
      h('div', { class: 'station-body' }, body),
      svc.source ? h('footer', { class: 'shop-info' },
        h('span', { text: `內容整理自${svc.source.title}（${svc.source.checkedAt} 確認）` }),
        h('a', { href: svc.source.url, target: '_blank', rel: 'noopener', text: '看原文 ↗' })) : null,
    );
    shop.hidden = false;
    shop.classList.add('is-station');
    shop.classList.remove('opening');
    void shop.offsetWidth;
    shop.classList.add('opening');
    shopInner.focus({ preventScroll: true });
  }

  // ---- 島民角色：捏一個氣球人放上島 ----
  function showResidentEditor(me) {
    current = { region: null, store: null };
    renderList();
    closeShop();
    const O = RESIDENT_OPTIONS;
    const choice = {
      body: me?.look.body || 'k',
      hat: me?.look.hat || 'cap',
      acc: me?.look.acc || 'none',
      shoe: me?.look.shoe || O.shoe[0],
      mode: me?.mode || 'loop',
    };
    const labelOf = (key, id) => O[key].find((o) => o.id === id)?.label || '';
    const preview = h('div', { class: 'me-preview' });
    const drawPreview = () => preview.replaceChildren(
      h('img', { src: `assets/mascot-${choice.body}.png`, alt: '' }),
      h('ul', {},
        h('li', { text: `帽子：${labelOf('hat', choice.hat)}` }),
        h('li', { text: `配件：${labelOf('acc', choice.acc)}` }),
        h('li', {}, '鞋子：', h('i', { class: 'swatch', style: `background:${choice.shoe}` })),
        h('li', { text: `移動：${labelOf('mode', choice.mode)}` })),
    );
    drawPreview();

    const group = (key, title, items, render) => {
      const buttons = items.map((item) => {
        const id = item.id ?? item;
        const btn = h('button', { type: 'button', class: 'me-option', 'aria-pressed': String(choice[key] === id) }, render(item));
        btn.addEventListener('click', () => {
          choice[key] = id;
          buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
          drawPreview();
        });
        return btn;
      });
      return h('div', { class: `me-group me-${key}` }, h('p', { class: 'me-label', text: title }), h('div', { class: 'me-options' }, buttons));
    };

    const nickname = h('input', { class: 'me-name', maxlength: '10', placeholder: '最多 10 個字（選填）', value: me?.nickname || '' });
    const honeypot = h('input', { class: 'hp', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' });
    const status = h('p', { class: 'note-status', role: 'status' });
    const submit = h('button', { type: 'button', class: 'cta', style: '--c:#8B2332' }, me ? '更新我的島民 →' : '放上島 →');
    submit.addEventListener('click', async () => {
      const problem = textProblem(nickname.value, 'nickname');
      if (problem) {
        status.textContent = problem;
        return;
      }
      submit.disabled = true;
      status.textContent = '放上島中…';
      const res = await handlers.onSaveResident({
        look: { body: choice.body, hat: choice.hat, acc: choice.acc, shoe: choice.shoe },
        mode: choice.mode,
        nickname: cleanText(nickname.value),
        website: honeypot.value,
      });
      submit.disabled = false;
      status.textContent = res.ok
        ? (res.pending ? '上島了！暱稱審核通過後，大家就看得到你的名字。' : '上島了！快去找找你的島民。')
        : res.message;
    });

    fillCard(
      head('ISLANDER・島民', me ? '我的島民' : '捏一個你的島民'),
      h('p', { class: 'lead', text: '選造型和移動方式，放上島之後大家都看得到。一台裝置一個島民，之後可以回來改。' }),
      preview,
      group('body', '身體', O.body, (b) => h('img', { src: `assets/mascot-${b.id}.png`, alt: b.label, title: b.label })),
      group('hat', '帽子', O.hat, (o) => o.label),
      group('acc', '配件', O.acc, (o) => o.label),
      group('shoe', '鞋子顏色', O.shoe, (c) => h('i', { class: 'swatch', style: `background:${c}`, title: c })),
      group('mode', '移動模式', O.mode, (o) => o.label),
      h('div', { class: 'me-group' }, h('p', { class: 'me-label' }, '暱稱', h('span', { class: 'note-hint', text: '不能放網址、聯絡方式或官方字樣' })), nickname, honeypot),
      submit,
      status,
      me ? h('button', { type: 'button', class: 'me-find', onclick: () => handlers.onFindMe() }, '看我的島民走到哪了 →') : null,
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

  // ---- 開場：登島邀請函 ----
  // 第一次來：信封 → 拆開 → 信紙＋登島證；按「?」直接再看一次信
  const intro = $('intro');
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FEATURES = {
    stamps: () => Boolean(handlers.stamps),
    residents: () => Boolean(data.site.residents && data.site.managerPicksUrl),
    service: () => Boolean(data.service),
    shoppers: () => Boolean(data.shoppers),
  };
  const MARK_COLORS = ['#8B2332', '#E07A2E', '#3F7FBF', '#3E9A6A', '#7A5BA6', '#d6578c'];
  const fillIn = (text) => String(text || '').replaceAll('{stores}', data.stores.length).replaceAll('{goal}', data.stamps?.goal ?? 10);
  const zhDate = (iso) => {
    const d = new Date(iso);
    return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
  };

  // 每台裝置第一次打開時發一張登島證（號碼和日期），之後都用同一張
  function visitorPass() {
    let pass = null;
    try { pass = JSON.parse(localStorage.getItem(INVITE_KEY) || 'null'); } catch { /* 無痕模式存不了，就每次發一張新的 */ }
    if (!pass?.no) {
      pass = { no: String(100000 + Math.floor(Math.random() * 900000)), at: new Date().toISOString(), seen: false };
      try { localStorage.setItem(INVITE_KEY, JSON.stringify(pass)); } catch { /* 同上 */ }
    }
    return pass;
  }

  function inviteLetter(again) {
    const inv = data.site.invite || {};
    const pass = visitorPass();
    const postmark = h('span', { class: 'postmark', 'aria-hidden': 'true' });
    postmark.innerHTML = stampSvg({ id: 'invite-postmark', name: inv.postmark || '台灣島郵局' }, '#8B2332', pass.at);
    const shown = (inv.highlights || []).filter((it) => it?.title && (!it.needs || FEATURES[it.needs]?.()));
    const featured = shown.filter((it) => it.featured);
    const items = shown.filter((it) => !it.featured);
    return h('div', { class: 'invite-wrap' },
      h('div', { class: 'invite-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'invite-title' },
        h('article', { class: 'letter' },
          h('div', { class: 'postage', 'aria-hidden': 'true' }, h('b', { text: 'DK' }), h('small', { text: '台灣島' }), h('em', { text: 'NT$0' })),
          postmark,
          h('header', { class: 'letter-head' },
            h('p', { class: 'letter-kicker' }, h('i', { text: 'Invitation' }), '登島邀請函'),
            h('h2', { id: 'invite-title', text: fillIn(inv.title || `歡迎登上 ${data.site.title}`) })),
          h('div', { class: 'letter-body' },
            h('p', { class: 'greet', text: inv.greeting || '親愛的旅人：' }),
            [].concat(inv.body || []).map((t) => h('p', { class: 'para', text: fillIn(t) }))),
          // 想讓大家一登島就去玩的功能：做成黃色任務單貼在信上
          featured.map((it) => h('section', { class: 'letter-feature' },
            h('span', { class: 'lf-mark', 'aria-hidden': 'true', text: it.mark || '!' }),
            h('div', {},
              it.kicker ? h('p', { class: 'lf-kicker', text: it.kicker }) : null,
              h('b', { text: fillIn(it.title) }),
              it.text ? h('p', { text: fillIn(it.text) }) : null,
              it.cta ? h('button', {
                type: 'button',
                class: 'lf-go',
                onclick: () => {
                  closeIntro();
                  setTimeout(() => handlers.onInviteGo?.(it.needs), 480); // 信收起來之後再飛過去
                },
              }, `${it.cta} →`) : null))),
          items.length ? h('ul', { class: 'letter-list' }, items.map((it, i) => h('li', {},
            h('span', { class: 'mark', style: `--c:${MARK_COLORS[i % MARK_COLORS.length]};--r:${((i * 7) % 15) - 9}deg`, 'aria-hidden': 'true', text: it.mark || '★' }),
            h('span', {}, h('b', { text: fillIn(it.title) }), it.text ? h('small', { text: fillIn(it.text) }) : null)))) : null,
          inv.tip ? h('p', { class: 'letter-tip', text: inv.tip }) : null,
          h('p', { class: 'letter-sign' }, inv.sign || `${data.site.title} 島主　敬邀`, h('small', { text: zhDate(pass.at) }))),
        h('footer', { class: 'pass' },
          h('div', {},
            h('p', { class: 'pass-kicker', text: 'BOARDING PASS・登島證' }),
            h('div', { class: 'pass-route' }, h('b', { text: inv.from || '你家' }), h('i', { 'aria-hidden': 'true' }), h('b', { text: data.site.title })),
            h('p', { class: 'pass-meta', text: `No. ${pass.no}・${stampDate(pass.at)}` })),
          h('button', { type: 'button', class: 'pass-go', onclick: closeIntro }, `${again ? '回到島上' : inv.cta || '收下邀請，登島'} →`))));
  }

  function showIntro({ envelope = true } = {}) {
    const inv = data.site.invite;
    if (!inv) return;
    intro.classList.remove('leaving');
    intro.hidden = false;
    const openLetter = () => {
      intro.replaceChildren(inviteLetter(!envelope));
      intro.querySelector('.pass-go').focus({ preventScroll: true });
    };
    if (!envelope || reduceMotion()) {
      openLetter();
      return;
    }
    const env = h('button', { type: 'button', class: 'envelope', 'aria-label': '拆開登島邀請函' },
      h('span', { class: 'env-back' }),
      h('span', { class: 'env-paper' }),
      h('span', { class: 'env-front' }, h('b', { text: inv.to || '致 親愛的旅人' }), h('small', { text: `${data.site.title} 寄` })),
      h('span', { class: 'env-flap' }),
      h('span', { class: 'wax-seal', text: 'DK' }));
    const stage = h('div', { class: 'invite-stage' }, env, h('p', { class: 'invite-hint', text: '點一下，拆開邀請函' }));
    env.addEventListener('click', () => {
      if (env.classList.contains('opening')) return;
      env.classList.add('opening');
      setTimeout(() => stage.classList.add('done'), 1150); // 信紙抽出來之後，信封退場
      setTimeout(() => { if (stage.isConnected) openLetter(); }, 1500);
    });
    intro.replaceChildren(stage);
    env.focus({ preventScroll: true });
  }

  function closeIntro() {
    if (intro.hidden || intro.classList.contains('leaving')) return;
    try { localStorage.setItem(INVITE_KEY, JSON.stringify({ ...visitorPass(), seen: true })); } catch { /* 無痕模式存不了，下次再收一次信也無妨 */ }
    const done = () => {
      intro.hidden = true;
      intro.classList.remove('leaving');
      intro.replaceChildren();
    };
    if (reduceMotion()) return done();
    intro.classList.add('leaving');
    setTimeout(done, 450);
  }

  function maybeShowIntro() {
    if (!visitorPass().seen) showIntro();
  }

  // ---- 工具列與鍵盤 ----
  $('btn-overview').addEventListener('click', () => handlers.onOverview());
  $('btn-help').addEventListener('click', () => showIntro({ envelope: false }));
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

  return { showRegion, showLandmark, showCoupon, showServiceMenu, openStation, showResidentEditor, showStampBook, showShopper, markStamps: renderList, selectStore, openShop, showNone, maybeShowIntro, refresh };
}
