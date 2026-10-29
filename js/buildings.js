import * as THREE from 'three';
import { rng, hashSeed } from './util.js';

// 建築全部用程式拼出來（不用 3D 模型檔）。每個造型的原點在格子頂面中央，正面朝南（+z，對著鏡頭）
const WALL = '#fbf5ec';
const DOOR = '#5b3a2e';
const GLASS = '#bfe3f0';
const WOOD = '#7a5236';
const WINE = '#8B2332';
const GOLD = '#e9a23b';
export const MASCOT = ['#9cd0f2', '#a6dcbf', '#fbd88a', '#f7a99a']; // DKEC 氣球人：D 藍、K 綠、E 黃、C 粉

const mats = new Map();
export function mat(color) {
  if (!mats.has(color)) mats.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true }));
  return mats.get(color);
}

const geos = new Map();
const geo = (k, make) => {
  if (!geos.has(k)) geos.set(k, make());
  return geos.get(k);
};

function place(geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, typeof material === 'string' ? mat(material) : material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// 以下 y 都是物件「底部」的高度（ball 例外，是球心）
const box = (w, h, d, c, x, y, z) =>
  place(geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0)), c, x, y, z);
const cyl = (rt, rb, h, seg, c, x, y, z) =>
  place(geo(`c${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg).translate(0, h / 2, 0)), c, x, y, z);
const cone = (r, h, seg, c, x, y, z) =>
  place(geo(`k${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg).translate(0, h / 2, 0)), c, x, y, z);
const ball = (r, c, x, y, z, detail = 1) =>
  place(geo(`s${r},${detail}`, () => new THREE.IcosahedronGeometry(r, detail)), c, x, y, z);

// 三角形屋頂，屋脊沿南北向；right=true 是鋸齒屋頂用的直角三角形
function prism(w, h, d, c, x, y, z, right = false) {
  const g = geo(`p${w},${h},${d},${right}`, () => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0);
    s.lineTo(w / 2, 0);
    s.lineTo(right ? w / 2 : 0, h);
    s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2);
  });
  return place(g, c, x, y, z);
}

// 景點造型（landmarks.js）也用同一組積木
export const kit = { box, cyl, cone, ball, prism, place, geo, sign };

// DK DR.KAO 招牌（酒紅底白字，比例 1.6:1）。拿到官方 logo 圖檔後可以改成貼圖
let signMat = null;
function sign(w, h, x, y, z) {
  if (!signMat) {
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 160;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = WINE;
    ctx.fillRect(0, 0, 256, 160);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, 236, 140);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = '700 80px Didot, "Bodoni 72", "Times New Roman", Georgia, serif';
    ctx.fillText('DK', 128, 98);
    ctx.font = '600 22px Georgia, "Times New Roman", serif';
    ctx.letterSpacing = '6px';
    ctx.fillText('DR.KAO', 131, 132);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    signMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 });
  }
  const m = new THREE.Mesh(geo(`plane${w},${h}`, () => new THREE.PlaneGeometry(w, h)), signMat);
  m.position.set(x, y, z);
  return m;
}

// 立在門口的招牌（建築正面沒地方掛時用）
function signBoard(x, z, rot = 0) {
  const g = new THREE.Group();
  g.add(box(0.03, 0.42, 0.03, WOOD, 0, 0, 0));
  g.add(box(0.34, 0.22, 0.03, '#5e1520', 0, 0.26, 0));
  g.add(sign(0.3, 0.19, 0, 0.37, 0.017));
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  return g;
}

// 每間店固定配一位 DKEC 氣球人（島上門口那位、進店後櫃台那位是同一個）
export const mascotIndex = (storeId) => hashSeed(storeId) % MASCOT.length;

const TEMPLATES = {
  // 一般門市：白牆、酒紅屋頂、DK 招牌
  shop(color) {
    const g = new THREE.Group();
    g.add(box(0.86, 0.5, 0.66, WALL));
    g.add(prism(0.98, 0.32, 0.78, WINE, 0, 0.5, 0));
    g.add(box(0.9, 0.05, 0.22, color, 0, 0.36, 0.42));
    g.add(box(0.22, 0.3, 0.02, DOOR, 0, 0, 0.335));
    g.add(box(0.2, 0.16, 0.02, GLASS, -0.27, 0.13, 0.335), box(0.2, 0.16, 0.02, GLASS, 0.27, 0.13, 0.335));
    g.add(sign(0.3, 0.19, 0, 0.6, 0.395));
    return g;
  },

  // 小遊戲：遊樂帳篷＋飄著的氣球
  carnival(color, anims) {
    const g = new THREE.Group();
    g.add(cyl(0.62, 0.64, 0.06, 12, '#f3e6c9'));
    g.add(cyl(0.42, 0.42, 0.36, 10, WALL, 0, 0.06, 0));
    g.add(cone(0.56, 0.44, 10, color, 0, 0.42, 0));
    g.add(cyl(0.012, 0.012, 0.22, 4, WOOD, 0, 0.84, 0));
    g.add(box(0.14, 0.08, 0.01, '#ffd34d', 0.07, 0.98, 0));
    g.add(box(0.2, 0.26, 0.02, DOOR, 0, 0.06, 0.41));
    [[-0.5, -0.25], [0.5, -0.3], [0.44, 0.4]].forEach(([x, z], i) => {
      const top = 1.0 + i * 0.12;
      g.add(cyl(0.006, 0.006, top - 0.06, 3, '#ffffff', x, 0.06, z));
      const b = ball(0.13, MASCOT[i], x, top + 0.1, z);
      b.scale.y = 1.15;
      anims.push({ obj: b, kind: 'bob', base: b.position.y, phase: i * 1.7 });
      g.add(b);
    });
    g.add(signBoard(-0.42, 0.44, 0.25));
    return g;
  },

  // 小氣球下樓梯：歡樂玩具塔，彩色台階一圈圈繞著往下，塔頂飄著一顆氣球
  toytower(color, anims) {
    const g = new THREE.Group();
    g.add(cyl(0.5, 0.54, 0.08, 10, '#f3e6c9'));
    g.add(cyl(0.07, 0.08, 1.3, 8, WALL, 0, 0.08, 0));
    const steps = [MASCOT[3], MASCOT[2], MASCOT[1], MASCOT[0], color, MASCOT[3]];
    steps.forEach((c, i) => {
      const a = i * 1.15;
      const step = box(0.3, 0.06, 0.16, c, Math.cos(a) * 0.26, 1.18 - i * 0.2, Math.sin(a) * 0.26);
      step.rotation.y = -a;
      g.add(step);
    });
    g.add(cone(0.12, 0.12, 8, color, 0, 1.38, 0));
    g.add(cyl(0.005, 0.005, 0.3, 3, '#ffffff', 0, 1.5, 0));
    const b = ball(0.15, MASCOT[3], 0, 1.95, 0);
    b.scale.y = 1.15;
    anims.push({ obj: b, kind: 'bob', base: 1.95, phase: 0.6, amp: 0.06 });
    g.add(b);
    g.add(signBoard(-0.44, 0.42, 0.25));
    return g;
  },

  // 小教室：藍屋頂校舍、鐘塔、門口黑板
  classroom(color) {
    const g = new THREE.Group();
    const wall = '#fff1d6';
    g.add(box(0.96, 0.46, 0.6, wall));
    g.add(prism(1.06, 0.3, 0.7, color, 0, 0.46, 0));
    g.add(box(0.18, 0.2, 0.18, wall, 0, 0.66, 0));
    const spire = cone(0.17, 0.18, 4, color, 0, 0.86, 0);
    spire.rotation.y = Math.PI / 4;
    g.add(spire);
    g.add(box(0.2, 0.28, 0.02, DOOR, 0, 0, 0.305));
    g.add(box(0.18, 0.15, 0.02, GLASS, -0.3, 0.18, 0.305), box(0.18, 0.15, 0.02, GLASS, 0.3, 0.18, 0.305));
    g.add(box(0.03, 0.08, 0.03, WOOD, 0.3, 0, 0.5), box(0.03, 0.08, 0.03, WOOD, 0.54, 0, 0.5));
    g.add(box(0.3, 0.2, 0.03, '#2f5d4a', 0.42, 0.06, 0.5));
    g.add(box(0.18, 0.015, 0.005, '#ffffff', 0.42, 0.17, 0.517));
    g.add(cyl(0.012, 0.012, 0.72, 4, '#9a9a9a', -0.44, 0, 0.44));
    g.add(box(0.16, 0.1, 0.01, color, -0.36, 0.6, 0.44));
    g.add(sign(0.3, 0.19, 0, 0.55, 0.356));
    return g;
  },

  // 抽鞋籤：紅牆金頂的小廟
  temple(color) {
    const g = new THREE.Group();
    g.add(box(0.96, 0.08, 0.78, '#d8c7a6'));
    g.add(box(0.72, 0.36, 0.5, color, 0, 0.08, 0));
    const r1 = cyl(0.22, 0.64, 0.2, 4, GOLD, 0, 0.44, 0);
    r1.rotation.y = Math.PI / 4;
    g.add(r1);
    g.add(box(0.36, 0.16, 0.26, color, 0, 0.64, 0));
    const r2 = cyl(0.06, 0.34, 0.16, 4, GOLD, 0, 0.8, 0);
    r2.rotation.y = Math.PI / 4;
    g.add(r2);
    g.add(ball(0.06, GOLD, 0, 1.0, 0, 0));
    g.add(box(0.22, 0.26, 0.02, '#5b2a1e', 0, 0.08, 0.255));
    for (const x of [-0.27, 0.27]) {
      const lantern = ball(0.055, '#ff5a3c', x, 0.36, 0.34, 0);
      lantern.scale.y = 1.25;
      g.add(lantern);
    }
    g.add(cyl(0.09, 0.07, 0.12, 6, '#a8742c', 0, 0, 0.55));
    g.add(sign(0.24, 0.15, 0, 0.72, 0.135));
    return g;
  },

  // 留言板：貼滿便利貼的佈告欄＋長椅
  board(color) {
    const g = new THREE.Group();
    g.add(box(0.05, 0.66, 0.05, WOOD, -0.38, 0, 0), box(0.05, 0.66, 0.05, WOOD, 0.38, 0, 0));
    g.add(box(0.82, 0.42, 0.05, '#dcb68a', 0, 0.2, 0));
    g.add(prism(0.96, 0.16, 0.2, color, 0, 0.64, 0));
    ['#ffe08a', '#ffc2cf', '#bfe0ff', '#c7efd6', '#ffe08a', '#ffc2cf'].forEach((c, i) => {
      g.add(box(0.13, 0.1, 0.012, c, -0.27 + (i % 3) * 0.27, 0.27 + Math.floor(i / 3) * 0.16, 0.03));
    });
    g.add(box(0.5, 0.04, 0.14, '#a8754e', 0, 0.13, 0.44));
    g.add(box(0.04, 0.13, 0.12, WOOD, -0.2, 0, 0.44), box(0.04, 0.13, 0.12, WOOD, 0.2, 0, 0.44));
    g.add(signBoard(-0.5, 0.38, 0.3));
    return g;
  },

  // 手工做鞋：鋸齒屋頂工坊、冒煙的煙囪、門口一隻大鞋
  workshop(color, anims) {
    const g = new THREE.Group();
    g.add(box(1.0, 0.46, 0.68, '#f4ece2'));
    g.add(prism(0.5, 0.26, 0.72, color, -0.25, 0.46, 0, true), prism(0.5, 0.26, 0.72, color, 0.25, 0.46, 0, true));
    g.add(cyl(0.07, 0.08, 0.5, 6, '#b5654a', 0.38, 0.46, -0.22));
    for (let i = 0; i < 2; i++) {
      const puff = ball(0.09, '#ffffff', 0.38, 1.0, -0.22, 0);
      puff.castShadow = false;
      anims.push({ obj: puff, kind: 'smoke', base: 0.98, phase: i * 0.5 });
      g.add(puff);
    }
    g.add(box(0.3, 0.3, 0.02, DOOR, -0.22, 0, 0.345));
    g.add(box(0.2, 0.14, 0.02, GLASS, 0.2, 0.12, 0.345));
    g.add(sign(0.24, 0.15, 0.05, 0.385, 0.346));
    const shoe = new THREE.Group();
    shoe.add(box(0.44, 0.07, 0.19, '#fdfbf7'));
    shoe.add(box(0.26, 0.14, 0.17, WINE, -0.07, 0.07, 0));
    const toe = ball(0.1, WINE, 0.08, 0.1, 0, 0);
    toe.scale.set(1.3, 0.8, 0.85);
    shoe.add(toe);
    shoe.position.set(0.24, 0, 0.52);
    shoe.rotation.y = -0.5;
    g.add(shoe);
    return g;
  },
};

export const BUILDING_TYPES = Object.keys(TEMPLATES);

export function createBuilding(type, color) {
  const anims = [];
  const make = TEMPLATES[type] || TEMPLATES.shop;
  const g = make(color, anims);
  g.userData.anims = anims;
  return g;
}

/** 花東的活動廣場：DK 熱氣球＋集點兌獎攤位 */
export function createPlaza() {
  const anims = [];
  const g = new THREE.Group();

  const balloon = new THREE.Group();
  const envelope = ball(1.15, WINE, 0, 0, 0, 1);
  envelope.scale.y = 1.12;
  balloon.add(envelope);
  const band = place(geo('band1', () => new THREE.TorusGeometry(1.16, 0.07, 4, 24)), '#ffffff');
  band.rotation.x = Math.PI / 2;
  const band2 = place(geo('band2', () => new THREE.TorusGeometry(1.05, 0.05, 4, 24)), GOLD, 0, 0.55, 0);
  band2.rotation.x = Math.PI / 2;
  balloon.add(band, band2);
  balloon.add(cyl(0.55, 0.25, 0.4, 8, WINE, 0, -1.62, 0));
  balloon.add(box(0.46, 0.32, 0.46, '#b98a56', 0, -2.55, 0));
  for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
    balloon.add(cyl(0.01, 0.01, 0.61, 3, WOOD, x, -2.23, z));
  }
  balloon.add(sign(0.9, 0.45, 0, 0.1, 1.2));
  balloon.position.set(0, 4.6, 0);
  anims.push({ obj: balloon, kind: 'bob', base: 4.6, phase: 0, amp: 0.25, spin: 0.15 });
  g.add(balloon);

  const booth = new THREE.Group();
  booth.add(box(0.8, 0.42, 0.5, WALL));
  for (const [x, z] of [[-0.38, -0.22], [0.38, -0.22], [-0.38, 0.22], [0.38, 0.22]]) {
    booth.add(box(0.04, 0.2, 0.04, WOOD, x, 0.42, z));
  }
  booth.add(box(0.9, 0.05, 0.6, '#E07A2E', 0, 0.62, 0));
  booth.add(box(0.3, 0.06, 0.3, WINE, 0, 0.67, 0));
  booth.add(cyl(0.05, 0.06, 0.2, 6, WOOD, 0, 0.73, 0));
  booth.add(ball(0.08, WOOD, 0, 0.97, 0, 0));
  booth.position.set(1.73, 0, 0);
  booth.rotation.y = -0.3;
  g.add(booth);

  const rand = rng('plaza-flowers');
  for (const [x, z] of [[-1.73, 0], [-0.87, 1.5], [0.87, -1.5], [-0.87, -1.5]]) {
    g.add(cyl(0.42, 0.45, 0.12, 8, '#c9b48e', x, 0, z));
    for (let i = 0; i < 6; i++) {
      const a = rand() * Math.PI * 2;
      const r = rand() * 0.3;
      g.add(ball(0.07, ['#ff8fa3', '#ffd166', '#ffffff', '#c9a0ff'][i % 4], x + Math.cos(a) * r, 0.17, z + Math.sin(a) * r, 0));
    }
  }

  const spots = [[0.9, 1.1], [-0.6, 0.9], [1.2, -0.9], [-1.2, -0.4]].map(([x, z], i) => ({
    x, z, color: MASCOT[i], shoe: SHOE_FALLBACK[i], phase: i * 1.3, rot: rand() - 0.5,
  }));
  return { group: g, anims, spots };
}

// 氣球人腳上的 DK 鞋：商品顏色名稱 → 鞋面色。products.json 可以用 shoeColor 直接指定
const SHOE_COLORS = [
  ['黑', '#2e2b2a'], ['白', '#f2efe8'], ['米', '#efe6d3'], ['灰', '#9b9a98'], ['杏', '#e2cba6'],
  ['可可', '#7a5743'], ['咖啡', '#6f4e37'], ['卡其', '#c2a878'], ['紫', '#9a86c6'], ['粉', '#f1b6c4'],
  ['紅', '#b8333a'], ['藍', '#5b80b8'], ['綠', '#6fa37a'], ['黃', '#f0cf6a'],
];
export const SHOE_FALLBACK = ['#2e2b2a', '#f2efe8', '#e2cba6', WINE, '#9b9a98'];

export function shoeColorOf(product) {
  if (!product) return null;
  if (product.shoeColor) return product.shoeColor;
  const name = product.color || '';
  return SHOE_COLORS.find(([k]) => name.includes(k))?.[1] ?? null;
}

export function createClouds(bounds, count = 9) {
  const rand = rng('clouds');
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true, transparent: true, opacity: 0.9 });
  const clouds = [];
  for (let i = 0; i < count; i++) {
    const c = new THREE.Group();
    const puffs = 3 + Math.floor(rand() * 2);
    for (let j = 0; j < puffs; j++) {
      const r = 0.9 + rand() * 0.8;
      const m = new THREE.Mesh(geo(`cloud${j}`, () => new THREE.IcosahedronGeometry(1, 0)), material);
      m.scale.set(r, r * 0.7, r);
      m.position.set(j * 1.3 - puffs * 0.6, rand() * 0.4, (rand() - 0.5) * 0.8);
      c.add(m);
    }
    c.position.set(
      bounds.min.x - 10 + rand() * (bounds.max.x - bounds.min.x + 20),
      11 + rand() * 4,
      bounds.min.z + rand() * (bounds.max.z - bounds.min.z),
    );
    clouds.push({ obj: c, speed: 0.4 + rand() * 0.5 });
    group.add(c);
  }
  function update(dt) {
    for (const cl of clouds) {
      cl.obj.position.x += cl.speed * dt;
      if (cl.obj.position.x > bounds.max.x + 14) cl.obj.position.x = bounds.min.x - 14;
    }
  }
  return { group, update, material };
}

/** 門市窗戶的玻璃（晚上會亮燈） */
export const windowGlass = () => mat(GLASS);

/** 選中門市時地上的光圈 */
export function createRing() {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(0.78, 0.92, 6),
    new THREE.MeshBasicMaterial({ color: '#E0673A', transparent: true, opacity: 0.9, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = Math.PI / 2;
  m.visible = false;
  return m;
}
