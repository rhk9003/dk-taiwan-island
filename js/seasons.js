import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// 島跟著真實時間變：台灣時間的日夜、events.json 的節日與季節裝飾

/** 台灣時間現在幾點（小數，例如 18.5 = 18:30）。override 是網址 ?time= 指定的時間（測試用） */
export function taipeiHour(now = Date.now(), override = null) {
  if (override != null) return override;
  return ((now / 3600000 + 8) % 24 + 24) % 24;
}

/** 天黑的程度：0 白天、1 晚上。17:30～19:00 慢慢變暗，05:00～06:30 慢慢天亮 */
export function nightOf(hour) {
  if (hour >= 19 || hour < 5) return 1;
  if (hour >= 17.5) return (hour - 17.5) / 1.5;
  if (hour < 6.5) return 1 - (hour - 5) / 1.5;
  return 0;
}

/** 今天（台灣日期）有哪個節日；同一天有好幾個時用列表裡最前面的。forced 是網址 ?event= 指定的節日 id */
export function activeEvent(events, now = Date.now(), forced = null) {
  const list = Array.isArray(events) ? events : [];
  if (forced) return list.find((e) => e.id === forced) || null;
  const d = new Date(now + 8 * 3600000); // 用 UTC 的欄位讀台灣日期
  const year = String(d.getUTCFullYear());
  const md = `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  const ymd = `${year}-${md}`;
  return list.find((e) => {
    if (e.dates) {
      const range = e.dates[year];
      return Array.isArray(range) && ymd >= range[0] && ymd <= range[1];
    }
    if (!e.from || !e.to) return false;
    return e.from <= e.to ? md >= e.from && md <= e.to : md >= e.from || md <= e.to; // 跨年（例如 12-20 到 01-02）
  }) || null;
}

// ---- 節日裝飾：每間門市門口（或海邊）放一樣，全部用 InstancedMesh ----
const glow = (color, emissive, intensity) => new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity, roughness: 0.6, flatShading: true });
const plain = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true });

// 每種裝飾：放在門市的哪裡（門市座標，正面朝 +z）、由哪些零件組成
const DECOR = {
  // 萬聖節：門口左邊一顆南瓜燈（晚上會亮）
  pumpkin: {
    at: 'door',
    local: [[-0.36, 0, 0.6]],
    parts: () => [
      [new THREE.SphereGeometry(0.08, 10, 8).scale(1.15, 0.8, 1.15).translate(0, 0.065, 0), glow('#f08a24', '#ff7a00', 0.35)],
      [new THREE.CylinderGeometry(0.012, 0.016, 0.05, 5).translate(0, 0.14, 0), plain('#4d7a35')],
    ],
  },
  // 聖誕節：門口左邊一棵小聖誕樹，頂端一顆星
  christmas: {
    at: 'door',
    local: [[-0.38, 0, 0.58]],
    parts: () => [
      [new THREE.CylinderGeometry(0.02, 0.025, 0.06, 6).translate(0, 0.03, 0), plain('#7a5236')],
      [new THREE.ConeGeometry(0.13, 0.2, 8).translate(0, 0.15, 0), plain('#2f7a45')],
      [new THREE.ConeGeometry(0.1, 0.16, 8).translate(0, 0.25, 0), plain('#3a8c52')],
      [new THREE.OctahedronGeometry(0.03).translate(0, 0.35, 0), glow('#ffd34d', '#ffc21a', 0.8)],
    ],
  },
  // 農曆新年：遮雨棚下掛兩顆紅燈籠
  lantern: {
    at: 'door',
    local: [[-0.3, 0.24, 0.5], [0.3, 0.24, 0.5]],
    parts: () => [
      [new THREE.SphereGeometry(0.05, 10, 8).scale(1, 1.2, 1).translate(0, 0.0, 0), glow('#e8473a', '#ff3b20', 0.6)],
      [new THREE.CylinderGeometry(0.022, 0.022, 0.016, 8).translate(0, 0.063, 0), plain('#e9a23b')],
      [new THREE.CylinderGeometry(0.003, 0.003, 0.07, 3).translate(0, 0.105, 0), plain('#3a2a20')],
    ],
  },
  // 夏天：海邊插遮陽傘
  parasol: {
    at: 'beach',
    local: [[0, 0, 0]],
    parts: () => [
      [new THREE.CylinderGeometry(0.012, 0.012, 0.42, 5).translate(0, 0.21, 0), plain('#f5f1e8')],
      [new THREE.ConeGeometry(0.26, 0.1, 8).translate(0, 0.44, 0), plain('#ffffff'), ['#e8473a', '#3F7FBF', '#e9a23b', '#3E9A6A']],
    ],
  },
};

/**
 * 建立節日裝飾。spots.door = 每間門市 {x, y, z, rot}；spots.beach = 海邊格子 {x, y, z}。
 * 沒有這種裝飾就回傳空的 group
 */
export function createDecorations(kind, spots) {
  const group = new THREE.Group();
  const d = DECOR[kind];
  if (!d) return group;
  const frames = d.at === 'beach' ? spots.beach : spots.door;
  const places = [];
  const v = new THREE.Vector3();
  for (const f of frames) {
    for (const [x, y, z] of d.local) {
      v.set(x, y, z).applyAxisAngle(THREE.Object3D.DEFAULT_UP, f.rot || 0);
      places.push({ x: f.x + v.x, y: f.y + v.y, z: f.z + v.z, rot: f.rot || 0, id: f.id });
    }
  }
  if (!places.length) return group;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const c = new THREE.Color();
  for (const [geometry, material, colors] of d.parts()) {
    const mesh = new THREE.InstancedMesh(geometry, material, places.length);
    mesh.userData.placeIds = places.map((p) => p.id); // 門口的裝飾點了就進那間店
    mesh.userData.decor = kind;
    places.forEach((p, i) => {
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, p.rot);
      mesh.setMatrixAt(i, m.compose(v.set(p.x, p.y, p.z), q, one));
      if (colors) mesh.setColorAt(i, c.set(colors[i % colors.length]));
    });
    mesh.castShadow = true;
    group.add(mesh);
  }
  return group;
}

export const DECOR_KINDS = Object.keys(DECOR);

// ---- 萬聖節特效（events.json 的 fx）：商圈上空的蝙蝠、街上飄浮的南瓜燈、一顆大月亮 ----
const rand01 = (seed) => {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};

// 蝙蝠翅膀的外形（從肩膀往外是 +x，頭朝 +y，畫完轉成水平）：前緣到手腕再到最長的指尖，
// 後緣是三根手指之間往內凹的膜，這個鋸齒狀的邊才看得出是蝙蝠（方形翅膀會像蒼蠅）
const WING = { shoulder: [0.02, 0.05], wrist: [0.17, 0.1], tips: [[0.43, -0.01], [0.34, -0.15], [0.21, -0.2]], leg: [0.03, -0.12] };
function wingPiece(points, origin) {
  const [ox, oy] = origin;
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0] - ox, points[0][1] - oy);
  for (let i = 1; i < points.length; i++) {
    const [x, y, scallop] = points[i];
    const [px, py] = points[i - 1];
    if (!scallop) { shape.lineTo(x - ox, y - oy); continue; }
    // 兩根指尖之間的膜往手腕方向凹進去
    const mx = (px + x) / 2;
    const my = (py + y) / 2;
    const [wx, wy] = WING.wrist;
    shape.quadraticCurveTo(mx + (wx - mx) * 0.55 - ox, my + (wy - my) * 0.55 - oy, x - ox, y - oy);
  }
  return new THREE.ShapeGeometry(shape, 6).rotateX(-Math.PI / 2); // 畫在 XY，轉成水平（+y → -z，所以頭朝 -z）
}
// 翅膀上的骨頭（深色細棍）：從 from 拉到每個 to，座標跟 wingPiece 一樣以 origin 為原點
function wingBones(from, tos, origin) {
  const at = ([x, y]) => new THREE.Vector3(x - origin[0], 0.004, -(y - origin[1]));
  const a = at(from);
  return mergeGeometries(tos.map((to) => {
    const b = at(to);
    const dir = b.clone().sub(a);
    const g = new THREE.CylinderGeometry(0.0045, 0.008, dir.length(), 4);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
    return g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  }));
}

/** 萬聖節蝙蝠：在門市上空繞圈。翅膀分內外兩段、外段晚一點拍，晚上眼睛會發光。全部蝙蝠合成幾個 InstancedMesh，draw call 很少 */
export function createBats(spots, count = 36) {
  const rand = rand01(1031);
  const group = new THREE.Group();
  if (!spots.length) return { group, update() {} };
  const skin = new THREE.MeshStandardMaterial({ color: '#2a2233', emissive: '#6b3fa0', emissiveIntensity: 0.14, roughness: 0.8, flatShading: true });
  const membrane = new THREE.MeshStandardMaterial({ color: '#3a2c4a', emissive: '#6b3fa0', emissiveIntensity: 0.12, roughness: 0.9, side: THREE.DoubleSide });
  const glow = new THREE.MeshStandardMaterial({ color: '#ffcf5a', emissive: '#ffb52e', emissiveIntensity: 1.2 });

  // 身體：圓胖的身體＋頭＋兩隻尖耳朵（頭朝 -z，跟翅膀一致）
  const bodyGeo = mergeGeometries([
    new THREE.SphereGeometry(0.075, 10, 8).scale(1, 0.85, 1.35).translate(0, 0, 0.02),
    new THREE.SphereGeometry(0.055, 10, 8).translate(0, 0.02, -0.1),
    new THREE.ConeGeometry(0.022, 0.075, 4).rotateX(-0.25).translate(-0.03, 0.08, -0.11),
    new THREE.ConeGeometry(0.022, 0.075, 4).rotateX(-0.25).translate(0.03, 0.08, -0.11),
  ]);
  const eyeGeo = mergeGeometries([
    new THREE.SphereGeometry(0.012, 6, 4).translate(-0.022, 0.03, -0.15),
    new THREE.SphereGeometry(0.012, 6, 4).translate(0.022, 0.03, -0.15),
  ]);
  const { shoulder, wrist, tips, leg } = WING;
  // 內段：肩膀 → 手腕 → 最內側的指尖，再凹到腳；外段：手腕 → 三根指尖（中間兩段凹進去）→ 回手腕。外段以手腕為軸
  const innerGeo = wingPiece([shoulder, wrist, tips[2], [...leg, true]], shoulder);
  const outerGeo = wingPiece([wrist, tips[0], [...tips[1], true], [...tips[2], true]], wrist);
  const innerBones = wingBones(shoulder, [wrist], shoulder); // 前臂
  const outerBones = wingBones(wrist, tips, wrist); // 三根手指
  const mirror = (g) => g.clone().scale(-1, 1, 1);
  const meshes = [
    [bodyGeo, skin], [eyeGeo, glow],
    [innerGeo, membrane], [mirror(innerGeo), membrane],
    [outerGeo, membrane], [mirror(outerGeo), membrane],
    [innerBones, skin], [mirror(innerBones), skin],
    [outerBones, skin], [mirror(outerBones), skin],
  ].map(([g, m]) => {
    const mesh = new THREE.InstancedMesh(g, m, count);
    mesh.frustumCulled = false; // 蝙蝠飛遍全島，用原點算的包圍球會被誤判成看不到
    group.add(mesh);
    return mesh;
  });

  // 每隻蝙蝠用一組不放進場景的 Object3D 算位置，再把矩陣抄進 InstancedMesh
  const SCALE = 2.4;
  const wristX = wrist[0] - shoulder[0];
  const wristZ = -(wrist[1] - shoulder[1]);
  const bats = Array.from({ length: count }, () => {
    const rig = new THREE.Object3D();
    const parts = [new THREE.Object3D(), new THREE.Object3D()];
    const wings = [-1, 1].map((side) => {
      const inner = new THREE.Object3D();
      inner.position.set(side * shoulder[0], 0, -shoulder[1]);
      const outer = new THREE.Object3D();
      outer.position.set(side * wristX, 0, wristZ);
      inner.add(outer);
      rig.add(inner);
      return { inner, outer, side };
    });
    rig.add(...parts);
    rig.scale.setScalar(SCALE);
    const home = spots[Math.floor(rand() * spots.length)];
    return {
      rig, parts, wings,
      cx: home.x + (rand() - 0.5) * 2,
      cz: home.z + (rand() - 0.5) * 2,
      r: 0.8 + rand() * 2.2,
      y: home.y + 2.2 + rand() * 2,
      speed: (0.6 + rand() * 0.6) * (rand() < 0.5 ? -1 : 1),
      phase: rand() * Math.PI * 2,
    };
  });
  const write = (mesh, i, obj) => mesh.setMatrixAt(i, obj.matrixWorld);

  return {
    group,
    update(t) {
      bats.forEach((it, i) => {
        const a = it.phase + t * it.speed;
        it.rig.position.set(it.cx + Math.cos(a) * it.r, it.y + Math.sin(t * 2 + it.phase) * 0.3, it.cz + Math.sin(a) * it.r);
        // 頭朝 -z：繞圈時讓 -z 對準前進方向
        it.rig.rotation.y = it.speed > 0 ? Math.PI - a : -a;
        // 拍翅：每隔幾秒滑翔一下（翅膀微微上揚、不拍）
        const glide = Math.sin(t * 0.7 + it.phase * 3) > 0.75;
        const beat = t * 11 + it.phase;
        const flap = glide ? 0.18 : Math.sin(beat) * 0.75 + 0.1;
        const tip = glide ? 0.08 : Math.sin(beat - 0.9) * 0.55;
        for (const w of it.wings) {
          w.inner.rotation.z = w.side * flap;
          w.outer.rotation.z = w.side * tip;
        }
        it.rig.updateMatrixWorld(true);
        write(meshes[0], i, it.parts[0]);
        write(meshes[1], i, it.parts[1]);
        write(meshes[2], i, it.wings[1].inner);
        write(meshes[3], i, it.wings[0].inner);
        write(meshes[4], i, it.wings[1].outer);
        write(meshes[5], i, it.wings[0].outer);
        write(meshes[6], i, it.wings[1].inner);
        write(meshes[7], i, it.wings[0].inner);
        write(meshes[8], i, it.wings[1].outer);
        write(meshes[9], i, it.wings[0].outer);
      });
      for (const m of meshes) m.instanceMatrix.needsUpdate = true;
    },
  };
}

/** 街上飄浮的南瓜燈：在商圈街道上空慢慢繞圈、上下飄、輕輕轉身，晚上會發光 */
export function createFloatingPumpkins(tiles, count = 30) {
  const rand = rand01(2207);
  const group = new THREE.Group();
  if (!tiles.length) return { group, update() {} };
  const skin = new THREE.MeshStandardMaterial({ color: '#f08a24', emissive: '#ff7a00', emissiveIntensity: 0.3, roughness: 0.6, flatShading: true });
  const stem = new THREE.MeshStandardMaterial({ color: '#4d7a35', roughness: 0.8 });
  const face = new THREE.MeshStandardMaterial({ color: '#ffd86b', emissive: '#ffb52e', emissiveIntensity: 0.9, roughness: 0.8 }); // 刻出來的臉，裡面點著燈
  const eye = (x) => new THREE.ConeGeometry(0.028, 0.045, 3).translate(x, 0.02, 0.112);
  const parts = [
    [new THREE.SphereGeometry(0.13, 12, 9).scale(1.15, 0.85, 1.05), skin],
    [new THREE.CylinderGeometry(0.014, 0.02, 0.07, 5).translate(0, 0.13, 0), stem],
    [eye(-0.05), face],
    [eye(0.05), face],
    [new THREE.BoxGeometry(0.1, 0.022, 0.02).translate(0, -0.035, 0.115), face],
  ].map(([g, m]) => new THREE.InstancedMesh(g, m, count));
  group.add(...parts);
  const pumpkins = Array.from({ length: count }, () => {
    const t = tiles[Math.floor(rand() * tiles.length)];
    return { x: t.x, z: t.z, y: t.h, r: 0.2 + rand() * 0.4, speed: (0.3 + rand() * 0.4) * (rand() < 0.5 ? -1 : 1), phase: rand() * Math.PI * 2, size: 0.9 + rand() * 0.5 };
  });
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  return {
    group,
    update(t) {
      pumpkins.forEach((g, i) => {
        const a = g.phase + t * g.speed;
        p.set(g.x + Math.cos(a) * g.r, g.y + 0.7 + Math.sin(t * 1.8 + g.phase) * 0.12, g.z + Math.sin(a) * g.r);
        q.setFromAxisAngle(up, Math.sin(t * 0.8 + g.phase) * 0.6); // 臉大致朝鏡頭（南方），輕輕左右轉
        m.compose(p, q, s.setScalar(g.size));
        for (const mesh of parts) mesh.setMatrixAt(i, m);
      });
      for (const mesh of parts) mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

/**
 * 一顆大月亮。鏡頭是往下看島的，3D 的天空拍不到，所以月亮畫在畫面左上角（HTML），
 * 亮度跟著天黑程度（world 會更新 CSS 變數 --night）
 */
export function createMoon(container) {
  const moon = document.createElement('div');
  moon.className = 'moon';
  moon.setAttribute('aria-hidden', 'true');
  container.appendChild(moon);
  return moon;
}
