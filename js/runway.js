// 整個中央山脈就是我的伸展台：客人上傳穿 DK 鞋的穿搭照，審核通過掛上中央山脈，大家投票。
// 後端是獨立的 Apps Script（apps-script/runway.gs），照片存在 Google Drive；site.json 的 runway.url 沒填就不出現。
import { h } from './util.js';
import { cleanText, safeText, textProblem } from './textrules.js';
import { track } from './track.js';

const MINE_KEY = 'dk-island-runway-mine';   // 這台裝置上傳過的照片 [{id, at, mini}]，mini 是給自己看的小縮圖
const VOTE_KEY = 'dk-island-runway-votes';  // 今天投過哪幾張 {day, ids}
const ID = /^[A-Za-z0-9-]{16,64}$/;
const FILE_ID = /^[A-Za-z0-9_-]{10,100}$/;

const readJson = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
};
const writeJson = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 無痕模式存不了，只影響這台裝置的紀錄 */ }
};
const taipeiDay = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);

/** 手機照片縮小、轉 JPEG：畫到 canvas 再輸出，拍照地點（GPS）等 EXIF 資訊也就一起拿掉了 */
async function shrink(file, max, quality) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * k);
    canvas.height = Math.round(img.naturalHeight * k);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function createRunway(cfg, post) {
  const url = cfg.url;
  const max = Math.max(1, Math.round(Number(cfg.maxUploads)) || 3);
  const state = { photos: [], sharing: false, loaded: false, status: {} };
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn());
  let mine = (readJson(MINE_KEY, []) || []).filter((m) => ID.test(m?.id || ''));
  const votes = () => {
    const v = readJson(VOTE_KEY, null);
    return v?.day === taipeiDay() && Array.isArray(v.ids) ? v.ids : [];
  };

  async function load() {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.message || '讀不到伸展台');
      state.sharing = json.sharing === true;
      state.photos = (Array.isArray(json.photos) ? json.photos : [])
        .filter((p) => ID.test(p?.id || '') && FILE_ID.test(p.full || '') && FILE_ID.test(p.thumb || ''))
        .map((p) => ({
          id: p.id,
          nickname: safeText(String(p.nickname || '').slice(0, 10), 'nickname') || '島上的模特兒',
          shoe: safeText(String(p.shoe || '').slice(0, 20)),
          text: safeText(String(p.text || '').slice(0, 30)),
          votes: Math.max(0, Number(p.votes) || 0),
          at: String(p.at || ''),
          full: p.full,
          thumb: p.thumb,
        }))
        .sort((a, b) => b.votes - a.votes || a.at.localeCompare(b.at));
    } catch (e) {
      console.warn('[DK 台灣島] 伸展台讀不到：', e.message);
    }
    state.loaded = true;
    emit();
  }

  // 自己上傳的照片審核到哪了
  async function refreshStatus() {
    if (!mine.length) return;
    try {
      const res = await fetch(`${url}?status=${mine.map((m) => m.id).join(',')}`, { cache: 'no-store' });
      const json = await res.json();
      if (json?.ok && json.status) state.status = json.status;
    } catch { /* 讀不到就先顯示審核中 */ }
    emit();
  }

  // 照片：Drive 可以公開連結就直接用縮圖網址，不行就向後端拿（存起來不重拿）
  const dataCache = new Map();
  function fillImg(img, p, size = 'thumb') {
    img.alt = `${p.nickname} 的穿搭`;
    img.referrerPolicy = 'no-referrer';
    if (state.sharing) {
      img.src = `https://drive.google.com/thumbnail?id=${size === 'full' ? p.full : p.thumb}&sz=${size === 'full' ? 'w1200' : 'w400'}`;
      return img;
    }
    const key = `${size}:${p.id}`;
    if (!dataCache.has(key)) {
      dataCache.set(key, fetch(`${url}?photo=${p.id}&size=${size}`).then((r) => r.json()).then((j) => (j?.ok && /^data:image\/jpeg;base64,/.test(j.data) ? j.data : '')).catch(() => ''));
    }
    dataCache.get(key).then((src) => { if (src) img.src = src; });
    return img;
  }

  async function vote(id) {
    if (votes().includes(id)) return { ok: false, message: '今天已經投過這張了，明天再來！' };
    const res = await post(url, { role: 'vote', photoId: id });
    if (res.ok || /投過/.test(res.message || '')) writeJson(VOTE_KEY, { day: taipeiDay(), ids: [...votes(), id] });
    if (!res.ok) return res;
    const p = state.photos.find((x) => x.id === id);
    if (p) p.votes = Math.max(p.votes + 1, Number(res.data.votes) || 0);
    state.photos.sort((a, b) => b.votes - a.votes || a.at.localeCompare(b.at));
    track('runway_vote', { photo: id });
    emit();
    return { ok: true };
  }

  async function upload(file, fields) {
    if (mine.length >= max) return { ok: false, message: `每人最多上傳 ${max} 張喔！` };
    let image = await shrink(file, 1080, 0.82);
    if (image.length > 1500000) image = await shrink(file, 900, 0.72);
    const thumb = await shrink(file, 400, 0.78);
    const mini = await shrink(file, 160, 0.7);
    const res = await post(url, { role: 'upload', ...fields, agree: true, image, thumb });
    if (!res.ok) return res;
    if (res.data.id) {
      mine = [...mine, { id: res.data.id, at: new Date().toISOString(), mini }];
      writeJson(MINE_KEY, mine);
      state.status[res.data.id] = 'pending';
    }
    track('runway_upload');
    emit();
    return { ok: true };
  }

  return {
    cfg,
    max,
    state,
    load,
    refreshStatus,
    fillImg,
    vote,
    upload,
    mine: () => mine,
    voted: (id) => votes().includes(id),
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

/**
 * 卡片內容：排行榜、上傳表單、我的投稿；點照片看大圖和投票。
 * onPhoto(id) 讓鏡頭飛到那張照片在山上的位置。回傳一個 section，資料更新時自己重畫。
 */
export function runwayView(rw, { photoId = null, onPhoto } = {}) {
  const root = h('section', { class: 'rw' });
  let showing = photoId;
  let formOpen = false;
  let draft = null; // 上傳表單打到一半時重畫要保留
  const rankOf = (id) => rw.state.photos.findIndex((p) => p.id === id) + 1;

  function photoTile(p, rank) {
    return h('button', { type: 'button', class: 'rw-tile', onclick: () => { showing = p.id; onPhoto?.(p.id); render(); } },
      rw.fillImg(h('img', { loading: 'lazy' }), p),
      h('b', { class: 'rw-rank', text: rank === 1 ? '👑 1' : String(rank) }),
      h('span', { class: 'rw-meta' }, h('em', { text: p.nickname }), h('small', { text: `♥ ${p.votes}` })));
  }

  function detail(p) {
    const status = h('p', { class: 'note-status', role: 'status' });
    const voted = rw.voted(p.id);
    const btn = h('button', { type: 'button', class: 'cta rw-vote', disabled: voted || undefined }, voted ? `今天投過了・♥ ${p.votes}` : `♥ 投一票（${p.votes}）`);
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      status.textContent = '投票中…';
      const res = await rw.vote(p.id);
      status.textContent = res.ok ? '投好了！明天還可以再投一次。' : res.message;
      if (!res.ok) btn.disabled = rw.voted(p.id);
    });
    const rank = rankOf(p.id);
    return [
      h('button', { type: 'button', class: 'rw-back', onclick: () => { showing = null; render(); } }, '← 回伸展台'),
      h('figure', { class: 'rw-photo' }, rw.fillImg(h('img'), p, 'full')),
      h('p', { class: 'rw-who' }, h('b', { text: rank === 1 ? '👑 第 1 名' : `第 ${rank} 名` }), ` ${p.nickname}`),
      p.shoe ? h('p', { class: 'rw-shoe', text: `穿 ${p.shoe}` }) : null,
      p.text ? h('p', { class: 'rw-text', text: `「${p.text}」` }) : null,
      btn,
      status,
    ];
  }

  function uploadForm() {
    const left = rw.max - rw.mine().length;
    if (left <= 0) return h('p', { class: 'hint', text: `你已經上傳 ${rw.max} 張了，謝謝參加！` });
    if (!formOpen) {
      return h('button', { type: 'button', class: 'cta rw-open', onclick: () => { formOpen = true; render(); } }, `📸 上傳我的穿搭（還可以傳 ${left} 張）`);
    }
    const status = h('p', { class: 'note-status', role: 'status' });
    const preview = h('img', { class: 'rw-preview', alt: '', hidden: true });
    let file = draft?.file || null;
    const pick = h('input', { type: 'file', accept: 'image/*', class: 'rw-file' });
    const showPreview = () => {
      if (!file) return;
      preview.src = URL.createObjectURL(file);
      preview.hidden = false;
    };
    pick.addEventListener('change', () => {
      const f = pick.files?.[0];
      if (!f) return;
      if (!/^image\//.test(f.type) || f.size > 30 * 1024 * 1024) {
        status.textContent = '請選一張照片（30MB 以內）。';
        return;
      }
      file = f;
      status.textContent = '';
      showPreview();
    });
    const nickname = h('input', { name: 'nickname', maxlength: '10', placeholder: '暱稱（選填，10 字內）', value: draft?.nickname || '' });
    const shoe = h('input', { name: 'shoe', maxlength: '20', placeholder: '穿哪雙 DK（選填）', value: draft?.shoe || '' });
    const text = h('input', { name: 'text', maxlength: '30', placeholder: '一句話（選填，30 字內）', value: draft?.text || '' });
    const agree = h('input', { type: 'checkbox', name: 'agree' });
    agree.checked = Boolean(draft?.agree);
    const honeypot = h('input', { name: 'website', class: 'hp', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' });
    const submit = h('button', { type: 'submit', class: 'cta' }, '上傳 →');
    const form = h('form', { class: 'rw-form', novalidate: true },
      h('label', { class: 'rw-drop' }, pick, preview, h('span', { text: '點這裡選照片（全身照、要看得到腳上的 DK 鞋）' })),
      nickname, shoe, text,
      h('label', { class: 'rw-agree' }, agree, h('span', { text: rw.cfg.consent || '我同意照片公開展示在 DK 台灣島，照片是我本人拍攝或已取得照片中人物同意。' })),
      honeypot,
      h('div', { class: 'note-actions' }, h('button', { type: 'button', class: 'rw-cancel', onclick: () => { formOpen = false; draft = null; render(); } }, '取消'), submit),
      status);
    form.addEventListener('input', () => { draft = { file, nickname: nickname.value, shoe: shoe.value, text: text.value, agree: agree.checked }; });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fields = { nickname: cleanText(nickname.value), shoe: cleanText(shoe.value), text: cleanText(text.value), website: honeypot.value };
      const problem = !file ? '先選一張照片吧！'
        : !agree.checked ? '請先勾選同意照片公開展示。'
          : textProblem(fields.nickname, 'nickname') || textProblem(fields.shoe) || textProblem(fields.text);
      if (problem) {
        status.textContent = problem;
        return;
      }
      submit.disabled = true;
      status.textContent = '照片上傳中，大概要幾秒鐘…';
      let res;
      try {
        res = await rw.upload(file, fields);
      } catch {
        res = { ok: false, message: '這張照片讀不出來，換一張試試看。' };
      }
      submit.disabled = false;
      if (!res.ok) {
        status.textContent = res.message;
        return;
      }
      formOpen = false;
      draft = null;
      render();
      root.querySelector('.rw-mine')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    queueMicrotask(showPreview);
    return form;
  }

  function myUploads() {
    const list = rw.mine();
    if (!list.length) return null;
    const label = { pending: '審核中', approved: '已上牆', hidden: '沒有通過' };
    return h('section', { class: 'rw-mine' },
      h('p', { class: 'me-label', text: '我的投稿' }),
      h('div', { class: 'rw-mine-list' }, list.map((m) => {
        const st = rw.state.status[m.id] || 'pending';
        const p = rw.state.photos.find((x) => x.id === m.id);
        return h('button', { type: 'button', class: `rw-mine-item ${st}`, disabled: !p || undefined, onclick: () => { if (p) { showing = p.id; onPhoto?.(p.id); render(); } } },
          h('img', { src: /^data:image\/jpeg;base64,/.test(m.mini || '') ? m.mini : '', alt: '' }),
          h('small', { text: p ? `第 ${rankOf(p.id)} 名・♥ ${p.votes}` : label[st] }));
      })),
      h('p', { class: 'hint', text: '審核通過就會掛上中央山脈，通常 1 天內。' }));
  }

  function render() {
    const p = showing && rw.state.photos.find((x) => x.id === showing);
    if (p) {
      root.replaceChildren(...detail(p).filter(Boolean));
      return;
    }
    showing = null;
    const photos = rw.state.photos;
    root.replaceChildren(...[
      rw.cfg.intro ? h('p', { class: 'lead', text: rw.cfg.intro }) : null,
      Array.isArray(rw.cfg.rules) && rw.cfg.rules.length ? h('ul', { class: 'rw-rules' }, rw.cfg.rules.map((r) => h('li', { text: r }))) : null,
      uploadForm(),
      myUploads(),
      h('p', { class: 'me-label', text: '排行榜' }),
      !rw.state.loaded ? h('p', { class: 'hint', text: '讀取中…' })
        : photos.length ? h('div', { class: 'rw-grid' }, photos.map((x, i) => photoTile(x, i + 1)))
          : h('p', { class: 'hint', text: '還沒有照片上榜，第一名就是你！' }),
    ].filter(Boolean));
  }

  const stop = rw.onChange(() => {
    if (!root.isConnected) return stop();
    if (!root.querySelector('.rw-form')) render(); // 正在填上傳表單時不要重畫，免得檔案選擇被清掉
  });
  render();
  rw.refreshStatus();
  return root;
}
