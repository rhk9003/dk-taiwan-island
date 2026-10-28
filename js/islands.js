import * as THREE from 'three';
import { rng } from './util.js';

// 台灣島由一格一格的六角形拼起來（尖角朝南北）
export const HEX_R = 1;
export const LAND_H = 0.7; // 平地高度，建築都站在這個高度
const BEACH_H = 0.42;
const SQ3 = Math.sqrt(3);
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

// ---- 經緯度 → 島上座標：1 格約 2 公里，北方是 -z ----
const KM_PER_UNIT = 2;
const LAT0 = 23.7;
const LNG0 = 120.95;
const KX = (111.32 * Math.cos((LAT0 * Math.PI) / 180)) / KM_PER_UNIT;
const KZ = 110.57 / KM_PER_UNIT;
export const project = ([lat, lng]) => ({ x: (lng - LNG0) * KX, z: -(lat - LAT0) * KZ });

// 台灣海岸線（順時針，從富貴角開始），簡化到一格幾公里看得出形狀就好
const COAST = [
  [25.30, 121.54], [25.29, 121.60], [25.21, 121.68], [25.15, 121.76], [25.13, 121.85], [25.02, 122.00],
  [24.94, 121.90], [24.84, 121.84], [24.70, 121.82], [24.59, 121.87], [24.38, 121.76], [24.15, 121.66],
  [23.98, 121.62], [23.70, 121.53], [23.40, 121.46], [23.10, 121.39], [22.85, 121.23], [22.75, 121.15],
  [22.55, 121.00], [22.35, 120.90], [22.10, 120.88], [21.90, 120.85], [21.95, 120.71], [22.10, 120.70],
  [22.30, 120.62], [22.46, 120.45], [22.60, 120.28], [22.75, 120.22], [22.99, 120.14], [23.15, 120.08],
  [23.35, 120.11], [23.55, 120.13], [23.78, 120.17], [23.95, 120.30], [24.10, 120.40], [24.27, 120.49],
  [24.45, 120.62], [24.62, 120.75], [24.80, 120.90], [24.95, 121.00], [25.06, 121.12], [25.12, 121.28],
  [25.17, 121.40], [25.25, 121.47],
];

// 離島。parts 是組成小島的圓 [緯度, 經度, 半徑公里]；金門、馬祖實際離太遠，整組搬到 show 的位置並加虛線框（地圖常見的「示意位置」）
const ISLETS = [
  { name: '龜山島', parts: [[24.843, 121.951, 2.2]] },
  { name: '綠島', parts: [[22.660, 121.490, 3.2]], landmark: 'lighthouse' },
  { name: '蘭嶼', parts: [[22.045, 121.548, 4.6]], landmark: 'lighthouse' },
  { name: '小琉球', parts: [[22.340, 120.370, 2.4]], landmark: 'lighthouse' },
  {
    name: '澎湖',
    parts: [[23.57, 119.60, 6.5], [23.64, 119.55, 4], [23.62, 119.49, 3.2], [23.70, 119.62, 3], [23.36, 119.50, 2.4], [23.24, 119.43, 2.2]],
    landmark: 'windmill',
  },
  { name: '金門', parts: [[24.45, 118.38, 5.5], [24.44, 118.30, 4], [24.43, 118.23, 2.6]], show: [24.30, 119.50], landmark: 'house' },
  { name: '馬祖', parts: [[26.16, 119.95, 3], [26.23, 119.99, 2.4], [26.29, 120.10, 1.6]], show: [25.42, 120.42], landmark: 'lighthouse' },
];

// 山脈沿折線隆起；width 是半寬（公里），height 是最高點高出平地多少
const RIDGES = [
  { // 中央山脈
    line: [[24.55, 121.55], [24.35, 121.30], [24.10, 121.20], [23.80, 121.10], [23.47, 120.96], [23.10, 120.88], [22.70, 120.78], [22.30, 120.75]],
    width: 26,
    height: 2.6,
  },
  { // 海岸山脈
    line: [[23.95, 121.55], [23.40, 121.42], [23.10, 121.33], [22.80, 121.17]],
    width: 8,
    height: 1.1,
  },
].map((rd) => ({ pts: rd.line.map(project), width: rd.width / KM_PER_UNIT, height: rd.height }));

// 門市沒填 latlng 時的替代位置
const CITY_CENTER = {
  台北市: [25.04, 121.54], 新北市: [25.01, 121.46], 基隆市: [25.13, 121.74], 桃園市: [24.99, 121.30],
  新竹縣: [24.83, 121.01], 新竹市: [24.80, 120.97], 苗栗縣: [24.56, 120.82], 台中市: [24.15, 120.67],
  彰化縣: [24.08, 120.54], 南投縣: [23.91, 120.68], 雲林縣: [23.71, 120.54], 嘉義市: [23.48, 120.45],
  嘉義縣: [23.46, 120.29], 台南市: [22.99, 120.20], 高雄市: [22.63, 120.30], 屏東縣: [22.67, 120.49],
  宜蘭縣: [24.75, 121.75], 花蓮縣: [23.98, 121.60], 台東縣: [22.76, 121.14],
};

const GRASS = ['#9fd16f', '#93c867', '#a9d77c', '#b6dc86'];
const HILL = ['#7fbf5f', '#74b656'];
const FOREST = ['#5f9f50', '#56964a'];
const ROCK = ['#bdb5a6', '#c9c2b4'];
const PAVE = '#ece3cf';
const PLAZA = '#f3e7d2';
const STREET = ['#d8d1c4', '#ddd6c9'];
const TOWN = '#e7e0d1';
const APRON = '#cfd5d3';
const SAND = '#f2e0b4';
const EARTH = '#c49466';
const ROCK_SIDE = '#a88a6a';
const SAND_SIDE = '#e3c995';
const SHALLOW = '#a3dfdf';
const DIM = new THREE.Color('#e4ebe6');

const key = (q, r) => `${q},${r}`;

function axialToXZ(q, r) {
  return { x: HEX_R * SQ3 * (q + r / 2), z: HEX_R * 1.5 * r };
}

function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

function distToSegment(px, pz, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - a.x - t * dx, pz - a.z - t * dz);
}

function mountainAt(x, z) {
  let m = 0;
  for (const rd of RIDGES) {
    let d = Infinity;
    for (let i = 1; i < rd.pts.length; i++) d = Math.min(d, distToSegment(x, z, rd.pts[i - 1], rd.pts[i]));
    const f = 1 - d / rd.width;
    if (f > 0) m = Math.max(m, rd.height * Math.pow(f, 1.4));
  }
  return m;
}

/** 排出整座台灣島：格子、山、離島、景點、門市位置、商圈、分區（只算資料，不建 3D 物件） */
export function layoutTaiwan(regions, stores, landmarks, service, warn) {
  const coast = COAST.map(project);
  // 客服任務島也當成一座離島來鋪格子
  const isletDefs = service?.center
    ? [...ISLETS, { name: service.name, parts: [[...service.center, service.radiusKm || 9]], service: true }]
    : ISLETS;
  const islets = isletDefs.map((il) => {
    const base = project(il.parts[0]);
    const center = il.show ? project(il.show) : base;
    const circles = il.parts.map(([lat, lng, r]) => {
      const p = project([lat, lng]);
      return { x: p.x + center.x - base.x, z: p.z + center.z - base.z, r: r / KM_PER_UNIT };
    });
    return { ...il, center, circles, inset: Boolean(il.show), tiles: [] };
  });
  const xs = [...coast.map((p) => p.x), ...islets.flatMap((i) => i.circles.flatMap((c) => [c.x - c.r, c.x + c.r]))];
  const zs = [...coast.map((p) => p.z), ...islets.flatMap((i) => i.circles.flatMap((c) => [c.z - c.r, c.z + c.r]))];
  const [minX, maxX, minZ, maxZ] = [Math.min(...xs) - 2, Math.max(...xs) + 2, Math.min(...zs) - 2, Math.max(...zs) + 2];

  const tiles = new Map();
  for (let r = Math.floor(minZ / 1.5); r <= Math.ceil(maxZ / 1.5); r++) {
    for (let q = Math.floor(minX / SQ3 - r / 2) - 1; q <= Math.ceil(maxX / SQ3 - r / 2) + 1; q++) {
      const { x, z } = axialToXZ(q, r);
      const islet = pointInPoly(x, z, coast) ? null : islets.find((i) => i.circles.some((c) => Math.hypot(x - c.x, z - c.z) <= c.r));
      if (islet === undefined) continue;
      const t = { q, r, x, z, store: null, plaza: false, regionId: null, islet };
      tiles.set(key(q, r), t);
      islet?.tiles.push(t);
    }
  }
  const all = [...tiles.values()];
  const neighbors = (t) => DIRS.map(([dq, dr]) => tiles.get(key(t.q + dq, t.r + dr))).filter(Boolean);

  for (const t of all) {
    const rand = rng(`tile-${t.q},${t.r}`);
    t.edge = neighbors(t).length < 6;
    t.m = t.edge || t.islet ? 0 : mountainAt(t.x, t.z);
    t.kind = t.edge ? 'beach' : t.m > 0.3 ? 'mountain' : 'land';
    t.h = t.kind === 'beach' ? BEACH_H : LAND_H + (t.kind === 'mountain' ? t.m * (0.75 + rand() * 0.45) : 0);
  }

  const nearest = (p, ok) => {
    let best = null;
    let bd = Infinity;
    for (const t of all) {
      if (!ok(t)) continue;
      const d = (t.x - p.x) ** 2 + (t.z - p.z) ** 2;
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  };

  const info = new Map(regions.map((r) => [r.id, {
    region: r,
    anchor: project(r.anchor || [LAT0, LNG0]),
    tiles: [],
    plazaTile: null,
  }]));
  const islandsRegion = regions.find((r) => r.role === 'islands')?.id ?? null;
  const serviceRegion = regions.find((r) => r.role === 'service')?.id ?? null;

  // 活動廣場：把 anchor 附近一圈整平鋪地
  for (const ri of info.values()) {
    if (ri.region.role !== 'plaza') continue;
    const c = nearest(ri.anchor, (t) => t.kind !== 'beach' && !t.islet);
    if (!c) continue;
    for (const t of [c, ...neighbors(c)]) {
      if (t.kind !== 'beach') Object.assign(t, { kind: 'land', h: LAND_H, m: 0, plaza: true });
    }
    ri.plazaTile = c;
  }

  // 景點、機場：先占好位置，門市和商圈會避開。footprint 1 = 連旁邊一圈都整平（機場跑道）
  const spots = [];
  for (const lm of landmarks) {
    const t = nearest(project(lm.latlng), (c) => !c.plaza && !c.reserved && !c.islet);
    if (!t) continue;
    const area = lm.footprint ? [t, ...neighbors(t)] : [t];
    for (const c of area) {
      c.reserved = lm.id;
      if (lm.footprint) Object.assign(c, { kind: 'land', h: LAND_H, m: 0, apron: true });
    }
    if (lm.model === 'lake') t.h = Math.max(LAND_H, t.h - 0.5); // 湖在山谷裡，比周圍低一點
    spots.push({ landmark: lm, tile: t });
  }
  // 客服任務島：中央放任務看板和客服氣球人，四個站照 offset 排在四周
  let serviceLayout = null;
  const serviceIslet = islets.find((il) => il.service);
  if (serviceIslet) {
    const onIsland = (c) => c.islet === serviceIslet && !c.edge && !c.reserved;
    const centerTile = nearest(serviceIslet.center, onIsland);
    if (centerTile) {
      centerTile.reserved = 'service-center';
      const stations = [];
      for (const mission of service.missions || []) {
        const [ox, oz] = mission.offset || [0, 0];
        const t = nearest({ x: centerTile.x + ox * 2.6, z: centerTile.z + oz * 2.6 }, onIsland);
        if (!t) continue;
        t.reserved = `mission-${mission.id}`;
        stations.push({ mission, tile: t });
      }
      serviceLayout = { centerTile, stations };
    }
  }

  for (const il of islets) {
    if (!il.landmark) continue;
    const t = nearest(il.center, (c) => c.islet === il && !c.edge) ?? nearest(il.center, (c) => c.islet === il);
    if (t) {
      t.reserved = `islet-${il.name}`;
      il.landmarkTile = t;
    }
  }

  // 門市：照經緯度放到最近、還沒被占用的平地；和別間門市至少隔一條街
  const BESIDE = 100; // 緊貼別間店：幾乎不可能
  const NEAR = 6; // 只隔一條街：可以，但能再遠一點更好
  for (const s of stores) {
    let ll = s.latlng;
    if (!Array.isArray(ll) || ll.length !== 2) {
      const city = Object.keys(CITY_CENTER).find((c) => String(s.address || '').startsWith(c));
      ll = city ? CITY_CENTER[city] : info.get(s.region)?.region.anchor ?? [LAT0, LNG0];
      warn(`${s.name} 沒有 latlng，先放在${city || '分區'}中心附近`);
    }
    const p = project(ll);
    let t = null;
    let best = Infinity;
    for (const c of all) {
      if (c.kind !== 'land' || c.store || c.plaza || c.reserved || c.islet) continue;
      const cost = (c.x - p.x) ** 2 + (c.z - p.z) ** 2 + (c.besideStore ? BESIDE : c.nearStore ? NEAR : 0);
      if (cost < best) { best = cost; t = c; }
    }
    if (!t) {
      warn(`${s.name} 找不到空地可以放`);
      continue;
    }
    t.store = s;
    t.h = LAND_H;
    for (const n of neighbors(t)) {
      n.besideStore = true;
      for (const n2 of neighbors(n)) n2.nearStore = true;
    }
    info.get(s.region)?.tiles.push(t);
  }

  // 商圈：門市旁邊一圈是街道（氣球人走的路），再外一圈蓋店面和房子
  const open = (t) => t.kind === 'land' && !t.store && !t.plaza && !t.reserved;
  for (const t of all) if (t.store) for (const n of neighbors(t)) if (open(n)) n.street = true;
  for (const t of all) {
    if (!t.street) continue;
    for (const n of neighbors(t)) {
      if (!open(n) || n.street || n.town) continue;
      const rand = rng(`town-${n.q},${n.r}`);
      n.town = true;
      n.houses = rand() < 0.8 ? (rand() < 0.45 ? 2 : 1) : 0;
    }
  }
  const streets = all.filter((t) => t.street);
  for (const t of streets) t.links = neighbors(t).filter((n) => n.street);

  // 分區：每一格歸給最近的門市（或分區名牌）所屬的區；離島另外歸一區
  const seeds = [];
  for (const t of all) if (t.store) seeds.push({ x: t.x, z: t.z, id: t.store.region });
  for (const ri of info.values()) if (ri.region.role !== 'islands') seeds.push({ x: ri.anchor.x, z: ri.anchor.z, id: ri.region.id });
  for (const t of all) {
    if (t.islet?.service && serviceRegion) {
      t.regionId = serviceRegion;
      continue;
    }
    if (t.islet && islandsRegion) {
      t.regionId = islandsRegion;
      continue;
    }
    let bd = Infinity;
    for (const s of seeds) {
      const d = (t.x - s.x) ** 2 + (t.z - s.z) ** 2;
      if (d < bd) { bd = d; t.regionId = s.id; }
    }
  }

  for (const ri of info.values()) {
    let pts = [...ri.tiles, ri.plazaTile, ri.anchor].filter(Boolean);
    if (ri.region.role === 'islands') pts = all.filter((t) => t.islet && !t.islet.service);
    if (ri.region.role === 'service') pts = all.filter((t) => t.islet?.service);
    if (!pts.length) pts = [ri.anchor];
    const px = pts.map((p) => p.x);
    const pz = pts.map((p) => p.z);
    ri.box = { minX: Math.min(...px), maxX: Math.max(...px), minZ: Math.min(...pz), maxZ: Math.max(...pz) };
    ri.center = new THREE.Vector3((ri.box.minX + ri.box.maxX) / 2, LAND_H, (ri.box.minZ + ri.box.maxZ) / 2);
    const under = nearest(ri.anchor, () => true);
    const lift = ri.region.role === 'plaza' ? 7.6 : 2.4;
    ri.labelPos = new THREE.Vector3(ri.anchor.x, (under?.h ?? LAND_H) + lift, ri.anchor.z);
  }

  const bounds = new THREE.Box3(
    new THREE.Vector3(Math.min(...all.map((t) => t.x)) - 1, 0, Math.min(...all.map((t) => t.z)) - 1),
    new THREE.Vector3(Math.max(...all.map((t) => t.x)) + 1, 0, Math.max(...all.map((t) => t.z)) + 1),
  );
  // 本島範圍（不含離島），手機直式的全景用
  const mainBounds = new THREE.Box3(
    new THREE.Vector3(Math.min(...coast.map((p) => p.x)), 0, Math.min(...coast.map((p) => p.z))),
    new THREE.Vector3(Math.max(...coast.map((p) => p.x)), 0, Math.max(...coast.map((p) => p.z))),
  );
  return { tiles: all, regions: info, bounds, mainBounds, streets, landmarks: spots, islets, service: serviceLayout };
}

/** 把整座島建成 3D 物件（同類物件用 InstancedMesh，手機也跑得動） */
export function buildIsland(layout) {
  const group = new THREE.Group();
  const tiles = layout.tiles;
  const n = tiles.length;
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  const dimmables = [];

  const tileMat = new THREE.MeshStandardMaterial({ roughness: 0.92, flatShading: true });
  const bodyGeo = new THREE.CylinderGeometry(HEX_R * 0.97, HEX_R * 0.97, 1, 6).translate(0, 0.5, 0);
  const capGeo = new THREE.CylinderGeometry(HEX_R * 0.97, HEX_R * 0.97, 0.1, 6).translate(0, -0.05, 0);
  const body = new THREE.InstancedMesh(bodyGeo, tileMat, n);
  const cap = new THREE.InstancedMesh(capGeo, tileMat, n);
  body.receiveShadow = cap.receiveShadow = true;
  body.castShadow = cap.castShadow = true;

  const pick = (list, rand) => list[Math.floor(rand() * list.length)];
  const capBase = [];
  tiles.forEach((t, i) => {
    const rand = rng(`color-${t.q},${t.r}`);
    m.makeScale(1, t.h - 0.1 + 1.2, 1).setPosition(t.x, -1.2, t.z);
    body.setMatrixAt(i, m);
    body.setColorAt(i, c.set(t.kind === 'beach' ? SAND_SIDE : t.kind === 'mountain' ? ROCK_SIDE : EARTH));
    m.makeTranslation(t.x, t.h, t.z);
    cap.setMatrixAt(i, m);
    let color;
    if (t.plaza) color = PLAZA;
    else if (t.store) color = PAVE;
    else if (t.apron) color = APRON;
    else if (t.street) color = pick(STREET, rand);
    else if (t.town && t.houses) color = TOWN;
    else if (t.kind === 'beach') color = SAND;
    else if (t.kind === 'mountain') color = t.m > 2.25 && rand() < 0.4 ? pick(ROCK, rand) : t.m > 1.1 ? pick(FOREST, rand) : pick(HILL, rand);
    else color = pick(GRASS, rand);
    cap.setColorAt(i, c.set(color));
    capBase.push(new THREE.Color(color));
  });
  const tileRegion = tiles.map((t) => t.regionId);
  body.userData.tileRegion = cap.userData.tileRegion = tileRegion;
  dimmables.push({ mesh: cap, regions: tileRegion, base: capBase });
  group.add(body, cap);

  // 沿海一圈淺灘
  const coastTiles = tiles.filter((t) => t.edge);
  const shallow = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(1.75, 1.75, 0.04, 6),
    new THREE.MeshBasicMaterial({ color: SHALLOW }),
    coastTiles.length,
  );
  coastTiles.forEach((t, i) => {
    m.makeTranslation(t.x, 0.02, t.z);
    shallow.setMatrixAt(i, m);
  });
  group.add(shallow);

  const trees = buildTrees(tiles);
  group.add(trees.group);
  dimmables.push(...trees.dimmables);

  // 聚焦某一區時，把其他區的地淡化
  function highlight(regionId) {
    for (const d of dimmables) {
      d.base.forEach((base, i) => {
        c.copy(base);
        if (regionId && d.regions[i] !== regionId) c.lerp(DIM, 0.5);
        d.mesh.setColorAt(i, c);
      });
      d.mesh.instanceColor.needsUpdate = true;
    }
  }

  return { group, pickables: [cap, body], highlight };
}

const SOUTH_Z = project([23.5, 121]).z;

function buildTrees(tiles) {
  const trees = [];
  for (const t of tiles) {
    if (t.store || t.plaza || t.street || t.houses || t.reserved) continue;
    const rand = rng(`trees-${t.q},${t.r}`);
    let count = 0;
    let kind = 'lowland';
    if (t.kind === 'mountain') {
      kind = 'mountain';
      count = 1 + Math.floor(rand() * (t.m > 2.0 ? 1.6 : 2.6));
    } else if (t.town) {
      count = 1;
    } else if (t.kind === 'land') {
      count = rand() < 0.6 ? 1 + Math.floor(rand() * 2) : 0;
    } else {
      kind = t.z > SOUTH_Z ? 'palm' : 'bush';
      count = rand() < (kind === 'palm' ? 0.25 : 0.12) ? 1 : 0;
    }
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2;
      const dist = count === 1 ? rand() * 0.3 : 0.25 + rand() * 0.3;
      let type = 'round';
      if (kind === 'mountain') type = 'pine';
      else if (kind === 'palm') type = 'palm';
      else if (kind === 'lowland') type = rand() < 0.45 ? 'pine' : 'round';
      trees.push({
        type,
        mountain: kind === 'mountain',
        x: t.x + Math.cos(a) * dist,
        y: t.h,
        z: t.z + Math.sin(a) * dist,
        s: (kind === 'bush' || kind === 'palm' ? 0.75 : 0.85) + rand() * 0.4,
        blossom: type === 'round' && rand() < 0.12,
        shade: rand(),
        regionId: t.regionId,
      });
    }
  }

  const g = new THREE.Group();
  const dimmables = [];
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true });
  const make = (geo, list, place, color) => {
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(list.length, 1));
    mesh.count = list.length;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const m = new THREE.Matrix4();
    const base = [];
    list.forEach((tr, i) => {
      place(m, tr);
      mesh.setMatrixAt(i, m);
      const c = new THREE.Color(color(tr));
      mesh.setColorAt(i, c);
      base.push(c);
    });
    g.add(mesh);
    if (list.length) dimmables.push({ mesh, regions: list.map((tr) => tr.regionId), base });
  };

  const trunkGeo = new THREE.CylinderGeometry(0.045, 0.07, 1, 5).translate(0, 0.5, 0);
  const pineGeo = new THREE.ConeGeometry(0.3, 0.7, 6).translate(0, 0.35, 0);
  const roundGeo = new THREE.IcosahedronGeometry(0.28, 0);
  const palmGeo = new THREE.ConeGeometry(0.44, 0.16, 6);

  const S = new THREE.Vector3();
  const P = new THREE.Vector3();
  const Q = new THREE.Quaternion();
  const UP = new THREE.Vector3(0, 1, 0);
  const trunkH = (tr) => (tr.type === 'palm' ? 0.75 : tr.type === 'pine' ? 0.22 : 0.3) * tr.s;

  make(trunkGeo, trees, (m, tr) => {
    const k = tr.type === 'palm' ? 0.8 : 1;
    m.compose(P.set(tr.x, tr.y, tr.z), Q.identity(), S.set(tr.s * k, trunkH(tr), tr.s * k));
  }, () => '#8a5a3b');

  make(pineGeo, trees.filter((t) => t.type === 'pine'), (m, tr) => {
    m.compose(P.set(tr.x, tr.y + trunkH(tr), tr.z), Q.identity(), S.setScalar(tr.s));
  }, (tr) => {
    if (tr.mountain) return tr.shade < 0.5 ? '#3f8a4f' : '#4b9658';
    return tr.shade < 0.5 ? '#4f9a5a' : '#5aa765';
  });

  make(roundGeo, trees.filter((t) => t.type === 'round'), (m, tr) => {
    Q.setFromAxisAngle(UP, tr.shade * 6);
    m.compose(P.set(tr.x, tr.y + trunkH(tr) + 0.2 * tr.s, tr.z), Q, S.setScalar(tr.s));
  }, (tr) => (tr.blossom ? '#f4b3c2' : tr.shade < 0.5 ? '#7cc25a' : '#8fcf62'));

  make(palmGeo, trees.filter((t) => t.type === 'palm'), (m, tr) => {
    Q.setFromAxisAngle(UP, tr.shade * 6);
    m.compose(P.set(tr.x, tr.y + trunkH(tr) + 0.05, tr.z), Q, S.setScalar(tr.s));
  }, () => '#5fae4f');

  return { group: g, dimmables };
}
