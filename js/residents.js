import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { mat, MASCOT } from './buildings.js';
import { createFigures, createWearable, stepWalker, turnToward, LIFT, EVENT_HATS } from './people.js';
import { rng, h } from './util.js';

// 島民角色：訪客自己捏的氣球人。選項要跟後端（店長表單的 Apps Script）檢查的清單一致
export const RESIDENT_OPTIONS = {
  body: [
    { id: 'd', label: 'D 藍', color: MASCOT[0] },
    { id: 'k', label: 'K 綠', color: MASCOT[1] },
    { id: 'e', label: 'E 黃', color: MASCOT[2] },
    { id: 'c', label: 'C 粉', color: MASCOT[3] },
  ],
  hat: [
    { id: 'none', label: '不戴' },
    { id: 'cap', label: '鴨舌帽' },
    { id: 'beanie', label: '毛帽' },
    { id: 'straw', label: '草帽' },
    { id: 'crown', label: '皇冠' },
  ],
  acc: [
    { id: 'none', label: '不帶' },
    { id: 'backpack', label: '背包' },
    { id: 'scarf', label: '圍巾' },
    { id: 'glasses', label: '墨鏡' },
  ],
  shoe: ['#2e2b2a', '#f2efe8', '#e2cba6', '#8B2332', '#9b9a98', '#9a86c6', '#5b80b8', '#f1b6c4'],
  mode: [
    { id: 'loop', label: '環島' },
    { id: 'north', label: '北區' },
    { id: 'central', label: '中區' },
    { id: 'south', label: '南區' },
    { id: 'east', label: '東區' },
    { id: 'street', label: '逛商圈' },
    { id: 'mountain', label: '爬山' },
    { id: 'lake', label: '泳渡日月潭' },
  ],
};

// 從試算表讀到的資料，不在選項裡的一律丟掉。since 是上島時間（算島民長多大），沒有就是空字串
export function cleanResident(r) {
  const ok = (key, v) => RESIDENT_OPTIONS[key].some((o) => (o.id ?? o) === v);
  const look = r?.look || {};
  if (typeof r?.id !== 'string' || !/^[0-9a-f]{6,64}$/i.test(r.id)) return null;
  if (!ok('body', look.body) || !ok('hat', look.hat) || !ok('acc', look.acc) || !ok('shoe', look.shoe) || !ok('mode', r.mode)) return null;
  return {
    id: r.id,
    look: { body: look.body, hat: look.hat, acc: look.acc, shoe: look.shoe },
    mode: r.mode,
    nickname: typeof r.nickname === 'string' ? r.nickname.trim().slice(0, 10) : '',
    since: typeof r.since === 'string' && Date.parse(r.since) ? r.since : '',
  };
}

// 島民照真實時間長大：從上島那天起算，不用每天來。老島民留白鬍子，耆老再拄一根拐杖
export const AGE_STAGES = [
  { days: 0, title: '新島民', scale: 0.85 },
  { days: 3, title: '島民', scale: 0.93 },
  { days: 7, title: '資深島民', scale: 1 },
  { days: 30, title: '老島民', scale: 1.05, beard: true },
  { days: 60, title: '島上耆老', scale: 1.08, beard: true, cane: true },
];
const DAY = 86400000;

/** 上島幾天、現在是哪個階段、下一個階段還要幾天。不知道上島時間就照一般大小、沒有頭銜 */
export function ageOf(since, now = Date.now()) {
  const at = Date.parse(since || '');
  if (!at) return { known: false, days: 0, index: -1, title: '', scale: 1 };
  const days = Math.max(0, Math.floor((now - at) / DAY));
  let index = 0;
  while (index + 1 < AGE_STAGES.length && days >= AGE_STAGES[index + 1].days) index++;
  const next = AGE_STAGES[index + 1];
  return { ...AGE_STAGES[index], known: true, days, index, next: next ? { title: next.title, inDays: next.days - days } : null };
}

// 角色 ID：裝置代號做 SHA-256 取前 12 碼（後端用同一個算法）
export async function residentIdOf(deviceId) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(deviceId));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
}

// ---- 帽子、配件的造型（頭頂大約在 LIFT + 0.47）----
const Y = LIFT + 0.44;
const HATS = {
  cap: () => mergeGeometries([
    new THREE.CylinderGeometry(0.1, 0.104, 0.06, 14).translate(0, Y + 0.01, 0),
    new THREE.BoxGeometry(0.13, 0.012, 0.09).translate(0, Y - 0.015, 0.1),
  ]),
  beanie: () => mergeGeometries([
    new THREE.SphereGeometry(0.106, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, Y - 0.04, 0),
    new THREE.SphereGeometry(0.03, 8, 6).translate(0, Y + 0.075, 0),
  ]),
  straw: () => mergeGeometries([
    new THREE.CylinderGeometry(0.19, 0.19, 0.012, 20).translate(0, Y - 0.01, 0),
    new THREE.CylinderGeometry(0.08, 0.095, 0.07, 14).translate(0, Y + 0.025, 0),
  ]),
  crown: () => mergeGeometries([
    new THREE.CylinderGeometry(0.075, 0.075, 0.05, 10).translate(0, Y + 0.03, 0),
    ...[0, 1, 2, 3, 4].map((i) => new THREE.ConeGeometry(0.02, 0.05, 5).translate(Math.cos((i * Math.PI * 2) / 5) * 0.065, Y + 0.08, Math.sin((i * Math.PI * 2) / 5) * 0.065)),
  ]),
};
const HAT_COLORS = { cap: '#3F7FBF', beanie: '#c0392b', straw: '#e6c27a', crown: '#f6c343' };
const ACCS = {
  backpack: () => new THREE.BoxGeometry(0.13, 0.15, 0.08).translate(0, LIFT + 0.15, -0.12),
  scarf: () => mergeGeometries([
    new THREE.TorusGeometry(0.085, 0.022, 6, 16).rotateX(Math.PI / 2).translate(0, LIFT + 0.26, 0),
    new THREE.BoxGeometry(0.04, 0.09, 0.015).translate(0.04, LIFT + 0.2, 0.095),
  ]),
  glasses: () => mergeGeometries([
    new THREE.BoxGeometry(0.05, 0.03, 0.012).translate(-0.035, LIFT + 0.39, 0.097),
    new THREE.BoxGeometry(0.05, 0.03, 0.012).translate(0.035, LIFT + 0.39, 0.097),
    new THREE.BoxGeometry(0.03, 0.006, 0.01).translate(0, LIFT + 0.395, 0.1),
  ]),
};
const ACC_COLORS = { backpack: '#E07A2E', scarf: '#8B2332', glasses: '#1d1f24' };
// 長大以後才有的：白鬍子、拐杖
const BEARD = () => new THREE.SphereGeometry(0.06, 10, 8).scale(1.15, 0.85, 0.6).translate(0, LIFT + 0.315, 0.072);
const CANE = () => mergeGeometries([
  new THREE.CylinderGeometry(0.011, 0.011, 0.3, 6).translate(0.155, 0.15, 0.05),
  new THREE.TorusGeometry(0.028, 0.01, 6, 10, Math.PI).translate(0.127, 0.3, 0.05),
]);

/**
 * 移動方式。places 由 world 給：streets（依分區分好的街道格子）、loop（環島路線上一連串的點）、trails（登山步道）
 * 每個角色拿到一個 mover，step(p, dt) 會更新 p 的位置、方向，回傳走路的擺動
 */
export function createMovers(places) {
  const REGIONS = { north: ['north'], central: ['taozhumiao', 'central'], south: ['yunjianan', 'kaoping'], east: ['yilan', 'huadong'] };
  const all = places.streets.filter((t) => t.links.length);
  const pool = (mode) => {
    if (mode === 'street') return all;
    const ids = REGIONS[mode];
    const tiles = ids ? all.filter((t) => ids.includes(t.regionId)) : [];
    return tiles.length ? tiles : all;
  };

  return function make(mode, seed) {
    const rand = rng(`resident-${seed}`);
    if (mode === 'loop' && places.loop.length > 1) {
      const pts = places.loop;
      const st = { i: rand() * pts.length, speed: 1.6 + rand() * 0.8, side: (rand() - 0.5) * 0.8, step: rand() * 6 };
      return (p, dt) => {
        st.i = (st.i + st.speed * dt * 2) % pts.length; // loop 每 0.5 單位一個點
        const a = pts[Math.floor(st.i)];
        const b = pts[(Math.floor(st.i) + 1) % pts.length];
        const k = st.i % 1;
        p.x = a.x + (b.x - a.x) * k + st.side;
        p.y = a.y + (b.y - a.y) * k;
        p.z = a.z + (b.z - a.z) * k + st.side;
        turnToward(p, b.x - a.x, b.z - a.z, dt);
        st.step += dt * st.speed * 10;
        return Math.sin(st.step);
      };
    }
    if (mode === 'mountain' && places.trails.length) {
      const trail = places.trails[Math.floor(rand() * places.trails.length)];
      const st = { d: rand() * trail.length, dir: rand() < 0.5 ? 1 : -1, speed: 0.3 + rand() * 0.15, step: rand() * 6, off: (rand() - 0.5) * 0.5 };
      const at = (d) => {
        let k = 1;
        while (k < trail.dist.length - 1 && trail.dist[k] < d) k++;
        const seg = trail.dist[k] - trail.dist[k - 1] || 1;
        const f = Math.min(1, Math.max(0, (d - trail.dist[k - 1]) / seg));
        const a = trail.path[k - 1];
        const b = trail.path[k];
        return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f };
      };
      return (p, dt) => {
        st.d += st.dir * st.speed * dt;
        if (st.d > trail.length) { st.d = trail.length; st.dir = -1; }
        if (st.d < 0) { st.d = 0; st.dir = 1; }
        const now = at(st.d);
        const ahead = at(Math.min(trail.length, Math.max(0, st.d + st.dir * 0.3)));
        p.x = now.x + st.off;
        p.y = now.y;
        p.z = now.z + st.off;
        turnToward(p, ahead.x - now.x, ahead.z - now.z, dt);
        st.step += dt * st.speed * 16;
        return Math.sin(st.step);
      };
    }
    // 泳渡日月潭：從湖的這岸游到對岸再游回來，身體一半泡在水裡
    if (mode === 'lake' && places.lake) {
      const L = places.lake;
      const R = L.r * 0.8;
      const a = rand() * Math.PI * 2;
      const off = (rand() - 0.5) * R; // 每個人游的路線錯開一點
      const half = Math.sqrt(R * R - off * off);
      const ux = Math.cos(a);
      const uz = Math.sin(a);
      const from = { x: L.x - uz * off + ux * half, z: L.z + ux * off + uz * half };
      const to = { x: L.x - uz * off - ux * half, z: L.z + ux * off - uz * half };
      const st = { k: rand(), dir: rand() < 0.5 ? 1 : -1, speed: (0.22 + rand() * 0.08) / (2 * half), step: rand() * 6 };
      return (p, dt) => {
        st.k += st.dir * st.speed * dt;
        if (st.k > 1) { st.k = 1; st.dir = -1; }
        if (st.k < 0) { st.k = 0; st.dir = 1; }
        st.step += dt * 5;
        p.x = from.x + (to.x - from.x) * st.k;
        p.z = from.z + (to.z - from.z) * st.k;
        p.y = L.y - 0.24 + Math.sin(st.step) * 0.015;
        turnToward(p, (to.x - from.x) * st.dir, (to.z - from.z) * st.dir, dt);
        return Math.sin(st.step);
      };
    }
    // 在某一區（或全島）的商圈街道上逛
    const tiles = pool(mode);
    const from = tiles[Math.floor(rand() * tiles.length)];
    const walker = { walk: { from, to: from.links[Math.floor(rand() * from.links.length)], k: rand(), speed: 0.45 + rand() * 0.3, ox: (rand() - 0.5) * 0.24, oz: (rand() - 0.5) * 0.24, step: rand() * 6 }, rot: 0 };
    return (p, dt) => {
      walker.rot = p.rot;
      stepWalker(walker, dt);
      p.x = walker.x;
      p.y = walker.y;
      p.z = walker.z;
      p.rot = walker.rot;
      return Math.sin(walker.walk.step);
    };
  };
}

/**
 * 把一批島民放上島。list 已經清過（cleanResident），mine 是這台裝置自己的角色 ID。
 * eventHat：節日帽子（EVENT_HATS 的 key），沒戴帽子的島民會戴上；now 用來算島民長多大
 */
export function createResidents(list, makeMover, mineId, eventHat = null, now = Date.now()) {
  const people = list.map((r) => {
    const age = ageOf(r.since, now);
    return {
      ...r,
      mine: r.id === mineId,
      age,
      scale: age.scale,
      hat: r.look.hat === 'none' && EVENT_HATS[eventHat] ? 'event' : r.look.hat,
      x: 0, y: 0, z: 0, rot: 0,
      phase: rng(`phase-${r.id}`)() * 6,
      step: makeMover(r.mode, r.id),
    };
  });
  const figures = createFigures(people.length);
  people.forEach((p, i) => {
    figures.setColor(i, RESIDENT_OPTIONS.body.find((b) => b.id === p.look.body).color);
    figures.setShoe(i, p.look.shoe);
  });

  const group = new THREE.Group();
  group.add(...figures.meshes);
  // 每一種配件：誰戴、造型、材質（沒人戴就不建）
  const wear = [];
  const addWear = (who, geometry, material) => {
    const idx = people.map((p, i) => (who(p) ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) {
      geometry.dispose();
      return;
    }
    const mesh = createWearable(geometry, material, idx.length);
    group.add(mesh);
    wear.push({ mesh, slot: new Map(idx.map((pi, k) => [pi, k])) });
  };
  for (const [type, make] of Object.entries(HATS)) {
    const material = type === 'crown'
      ? new THREE.MeshStandardMaterial({ color: HAT_COLORS[type], roughness: 0.3, metalness: 0.4 })
      : mat(HAT_COLORS[type]);
    addWear((p) => p.hat === type, make(), material);
  }
  for (const [type, make] of Object.entries(ACCS)) addWear((p) => p.look.acc === type, make(), mat(ACC_COLORS[type]));
  if (EVENT_HATS[eventHat]) for (const [g, c] of EVENT_HATS[eventHat]()) addWear((p) => p.hat === 'event', g, mat(c));
  addWear((p) => p.age.beard, BEARD(), mat('#f4f1ea'));
  addWear((p) => p.age.cane, CANE(), mat('#7a5236'));

  // 名牌：公開的暱稱，和自己的「我」
  const labels = [];
  people.forEach((p) => {
    if (!p.nickname && !p.mine) return;
    const text = p.mine ? `我${p.nickname ? `・${p.nickname}` : ''}${p.pending ? '（暱稱審核中）' : ''}` : p.nickname;
    const obj = new CSS2DObject(h('span', { class: p.mine ? 'nlabel me' : 'nlabel' }, text));
    obj.visible = false;
    obj.userData.mine = p.mine;
    group.add(obj);
    labels.push({ obj, p });
  });

  function update(t, dt) {
    people.forEach((p, i) => {
      const swing = p.step(p, dt);
      const body = figures.pose(i, p, t, swing, Math.abs(swing) * 0.035);
      for (const w of wear) {
        const k = w.slot.get(i);
        if (k !== undefined) w.mesh.setMatrixAt(k, body);
      }
    });
    figures.commit();
    for (const w of wear) w.mesh.instanceMatrix.needsUpdate = true;
    for (const { obj, p } of labels) obj.position.set(p.x, p.y + 0.85 * p.scale, p.z);
  }

  return {
    group,
    labels: labels.map((l) => l.obj),
    update,
    positionOf: (id) => people.find((p) => p.id === id),
    dispose() {
      group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
      for (const { obj } of labels) obj.element.remove();
    },
  };
}

/** 捏島民時的預覽：小畫布上一個原地踏步、慢慢轉圈的氣球人，造型跟島上的一模一樣（含節日帽、長大的樣子）。畫布離開畫面就自己收掉 */
export function createResidentPreview(canvas, eventHat = null) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fffaf0', '#d8c6b4', 2.2));
  const sun = new THREE.DirectionalLight('#fff1dc', 2.2);
  sun.position.set(1, 2, 2);
  scene.add(sun);
  scene.add(new THREE.Mesh(new THREE.CircleGeometry(0.2, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.08 })));
  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 10);
  camera.position.set(0, 0.45, 1.3);
  camera.lookAt(0, 0.27, 0);

  let fig = null;
  let rot = 0.5;
  let walk = 0;
  const spin = () => (p, dt) => {
    rot += dt * 0.8;
    walk += dt * 5;
    p.rot = rot;
    return Math.sin(walk) * 0.5;
  };
  let last = performance.now();
  requestAnimationFrame(function frame(now) {
    if (!canvas.isConnected) {
      if (fig) fig.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      return;
    }
    const w = canvas.clientWidth;
    const hgt = canvas.clientHeight;
    if (w && hgt && (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(hgt * renderer.getPixelRatio()))) {
      renderer.setSize(w, hgt, false);
      camera.aspect = w / hgt;
      camera.updateProjectionMatrix();
    }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    fig?.update(now / 1000, dt);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  });

  return {
    set(look, since = '') {
      if (fig) {
        scene.remove(fig.group);
        fig.dispose();
      }
      fig = createResidents([{ id: 'preview', look, mode: 'street', nickname: '', since }], spin, null, eventHat);
      scene.add(fig.group);
    },
  };
}
