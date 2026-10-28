import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { layoutTaiwan, buildIsland, LAND_H, project } from './islands.js';
import { createBuilding, createPlaza, createClouds, createRing, MASCOT, SHOE_FALLBACK, shoeColorOf, mascotIndex } from './buildings.js';
import { buildTown } from './town.js';
import { createPeople } from './people.js';
import { createMovers, createResidents } from './residents.js';
import { createLandmark, createPlane, createBanner, createCouponMascot, createServiceNpc, createHiker, createSummitFlag, createDeliveryTruck } from './landmarks.js';
import { easeInOutCubic, clamp, h, rng, shortName } from './util.js';

const VIEW_POLAR = 0.9; // 鏡頭和正上方的夾角（弧度），越大越斜
const SEA = '#7fcbd8';
const SKY = '#cdebf1';
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const SUN_DIR = new THREE.Vector3(-30, 60, 35).normalize();
// 優惠券氣球人預設的巡迴路線：繞台灣一圈 [緯度, 經度]
const COUPON_ROUTE = [
  [25.05, 121.52], [25.13, 121.74], [24.75, 121.75], [23.98, 121.60], [22.76, 121.14], [22.00, 120.80],
  [22.63, 120.30], [23.00, 120.20], [23.48, 120.45], [24.08, 120.54], [24.15, 120.67], [24.80, 120.97], [24.99, 121.30],
];

/** 建立整個 3D 世界；handlers.onRegion / onStore 在使用者點分區或點門市時被呼叫 */
export function createWorld(container, data, handlers) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = 'label-layer';
  container.appendChild(labelRenderer.domElement);

  // ---- 島 ----
  const layout = layoutTaiwan(data.regions, data.stores, data.landmarks, data.service, data.warn);
  const island = buildIsland(layout);
  const bounds = layout.bounds;
  const maxDim = Math.max(...bounds.getSize(new THREE.Vector3()).toArray());
  // 全景含離島；看的點往南（靠鏡頭那側）偏一點，抵銷透視讓近處變大的效果
  const mapSize = bounds.getSize(new THREE.Vector3());
  const mapCenter = bounds.getCenter(new THREE.Vector3()).setY(LAND_H);
  mapCenter.z += mapSize.z * 0.06;
  const islandsRegion = data.regions.find((r) => r.role === 'islands')?.id ?? null;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, maxDim * 1.8, maxDim * 3.6);
  scene.add(island.group);
  scene.add(buildTown(layout.tiles));

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(maxDim * 14, maxDim * 14),
    new THREE.MeshStandardMaterial({ color: SEA, roughness: 0.55 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.receiveShadow = true;
  scene.add(sea);

  // ---- 光：太陽跟著鏡頭走，拉近看時影子比較清楚 ----
  scene.add(new THREE.HemisphereLight('#fffaf0', '#6fb6c4', 1.7));
  const sun = new THREE.DirectionalLight('#fff1dc', 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 260;
  scene.add(sun, sun.target);
  let shadowHalf = 0;

  // ---- 門市建築與標籤 ----
  const storeObjs = new Map();
  const anims = [];
  const spots = [];
  const pickables = [...island.pickables];
  let hoverId = null;

  for (const t of layout.tiles) {
    if (!t.store) continue;
    const s = t.store;
    const mod = data.modules[s.module];
    const g = createBuilding(mod.building, mod.color);
    const rand = rng(`${s.id}-place`);
    g.rotation.y = (rand() - 0.5) * 0.5;
    g.position.set(t.x, t.h, t.z);
    g.userData.storeId = s.id;
    scene.add(g);
    pickables.push(g);
    anims.push(...g.userData.anims);
    const top = new THREE.Box3().setFromObject(g).max.y;
    const label = storeLabel(s, mod);
    label.position.set(0, top - t.h + 0.32, 0);
    g.add(label);
    storeObjs.set(s.id, { group: g, tile: t, region: s.region, label, spot: spots.length });
    // 門口站一個氣球人，穿的是這間店店長推薦的那雙鞋（還沒推薦就隨機配一雙）
    const door = new THREE.Vector3(0.46, 0, 0.6).applyAxisAngle(Y_AXIS, g.rotation.y);
    const shoe = shoeColorOf(data.products.get(s.products[0])) ?? SHOE_FALLBACK[Math.floor(rand() * SHOE_FALLBACK.length)];
    spots.push({ x: t.x + door.x, y: t.h, z: t.z + door.z, color: MASCOT[mascotIndex(s.id)], shoe, phase: rand() * 6, rot: g.rotation.y, staff: true });
  }

  for (const ri of layout.regions.values()) {
    if (!ri.plazaTile) continue;
    const p = createPlaza();
    p.group.position.set(ri.plazaTile.x, LAND_H, ri.plazaTile.z);
    p.group.userData.regionId = ri.region.id;
    scene.add(p.group);
    pickables.push(p.group);
    anims.push(...p.anims);
    for (const sp of p.spots) spots.push({ ...sp, x: sp.x + ri.plazaTile.x, y: LAND_H, z: sp.z + ri.plazaTile.z });
  }

  // ---- 景點、機場、離島 ----
  const landmarkObjs = new Map();
  const extraLabels = []; // 景點和離島的名牌：拉近才顯示
  const smallLabel = (cls, text, onclick) => {
    const obj = new CSS2DObject(h('button', { class: cls, type: 'button', onclick: (e) => { e.stopPropagation(); onclick(); } }, h('i'), text));
    obj.visible = false;
    extraLabels.push(obj);
    return obj;
  };

  for (const { landmark: lm, tile: t } of layout.landmarks) {
    const { group: g, anims: a } = createLandmark(lm.model);
    g.position.set(t.x, t.h, t.z);
    g.userData.landmarkId = lm.id;
    scene.add(g);
    pickables.push(g);
    anims.push(...a);
    const top = new THREE.Box3().setFromObject(g).max.y;
    const kind = lm.model === 'airport' ? ' airport' : lm.type === 'temple' ? ' temple' : lm.type === 'cinema' ? ' cinema' : '';
    const label = smallLabel(`llabel${kind}`, lm.name, () => handlers.onLandmark?.(lm.id));
    label.position.set(t.x, top + 0.35, t.z);
    scene.add(label);
    landmarkObjs.set(lm.id, { group: g, tile: t, landmark: lm, height: top - t.h });
  }

  for (const il of layout.islets) {
    if (il.service) continue; // 客服任務島另外處理
    const toIslands = () => islandsRegion && handlers.onRegion(islandsRegion);
    if (il.landmarkTile) {
      const { group: g, anims: a } = createLandmark(il.landmark);
      g.position.set(il.landmarkTile.x, il.landmarkTile.h, il.landmarkTile.z);
      if (islandsRegion) g.userData.regionId = islandsRegion;
      scene.add(g);
      pickables.push(g);
      anims.push(...a);
    }
    const label = smallLabel('ilabel', il.name, toIslands);
    label.position.set(il.center.x, LAND_H + 1.8, il.center.z + 1.2);
    scene.add(label);
    // 金門、馬祖不在真實位置：用虛線框標成「示意位置」
    if (il.inset) {
      const xs = il.tiles.map((t) => t.x);
      const zs = il.tiles.map((t) => t.z);
      const [x0, x1, z0, z1] = [Math.min(...xs) - 2, Math.max(...xs) + 2, Math.min(...zs) - 2, Math.max(...zs) + 2];
      const frame = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints([[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => new THREE.Vector3(x, 0.06, z))),
        new THREE.LineDashedMaterial({ color: '#ffffff', dashSize: 0.8, gapSize: 0.5, transparent: true, opacity: 0.8 }),
      );
      frame.computeLineDistances();
      scene.add(frame);
    }
  }

  // ---- 客服任務島：中央任務看板＋客服小氣球，四周四個站 ----
  const missionObjs = new Map();
  if (layout.service) {
    const { centerTile: c, stations } = layout.service;
    const { group: kiosk, anims: ka } = createLandmark('kiosk');
    kiosk.position.set(c.x, c.h, c.z);
    kiosk.userData.service = true;
    const npc = createServiceNpc();
    npc.group.position.set(c.x + 0.45, c.h, c.z + 0.45);
    npc.group.userData.service = true;
    scene.add(kiosk, npc.group);
    pickables.push(kiosk, npc.group);
    anims.push(...ka, ...npc.anims);
    const askLabel = smallLabel('llabel service-ask', data.service.npc?.name ? `問${data.service.npc.name}` : '客服任務', () => handlers.onService?.());
    askLabel.position.set(c.x + 0.45, c.h + 1.5, c.z + 0.45);
    scene.add(askLabel);
    for (const { mission, tile } of stations) {
      const { group: g, anims: a } = createLandmark(mission.model);
      g.position.set(tile.x, tile.h, tile.z);
      g.userData.missionId = mission.id;
      scene.add(g);
      pickables.push(g);
      anims.push(...a);
      const top = new THREE.Box3().setFromObject(g).max.y;
      const label = smallLabel('llabel service', mission.station, () => handlers.onMission?.(mission.id));
      label.position.set(tile.x, top + 0.35, tile.z);
      scene.add(label);
      missionObjs.set(mission.id, { group: g, tile, height: top - tile.h });
    }
  }

  // ---- 中央山脈：三條登山步道，各有一位氣球人一直爬上爬下 ----
  const TRAILS = [
    { name: '玉山', from: [23.488, 120.885], to: [23.47, 120.957], color: MASCOT[0] },
    { name: '雪山', from: [24.398, 121.315], to: [24.383, 121.232], color: MASCOT[3] },
    { name: '合歡山', from: [24.105, 121.205], to: [24.142, 121.272], color: MASCOT[2] },
  ];
  const nearestTile = (p) => {
    let best = null;
    let bd = Infinity;
    for (const t of layout.tiles) {
      const d = (t.x - p.x) ** 2 + (t.z - p.z) ** 2;
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  };
  const hikers = TRAILS.map((trail, i) => {
    const a = project(trail.from);
    const b = project(trail.to);
    const steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.5));
    const pts = [];
    for (let k = 0; k <= steps; k++) {
      const t = nearestTile({ x: a.x + ((b.x - a.x) * k) / steps, z: a.z + ((b.z - a.z) * k) / steps });
      if (t && pts[pts.length - 1] !== t) pts.push(t);
    }
    const path = pts.map((t) => new THREE.Vector3(t.x, t.h, t.z));
    // 山頂那格如果有景點（玉山的岩峰），就爬到造型的尖頂上，不要走進岩石裡
    const peak = [...landmarkObjs.values()].find((o) => o.tile === pts[pts.length - 1]);
    if (peak) path[path.length - 1].y += peak.height - 0.05;
    const dist = [0];
    for (let k = 1; k < path.length; k++) dist.push(dist[k - 1] + path[k].distanceTo(path[k - 1]));
    const hiker = createHiker(trail.color);
    scene.add(hiker);
    const summit = path[path.length - 1];
    const flag = createSummitFlag();
    flag.position.set(summit.x + (peak ? 0.08 : 0.35), summit.y, summit.z - (peak ? 0.05 : 0.2));
    scene.add(flag);
    return { hiker, path, dist, length: dist[dist.length - 1], speed: 0.35, phase: i * 7 };
  });
  const hikePos = new THREE.Vector3();
  const hikeAhead = new THREE.Vector3();
  function pointAt(hk, d, out) {
    let k = 1;
    while (k < hk.dist.length - 1 && hk.dist[k] < d) k++;
    const seg = hk.dist[k] - hk.dist[k - 1] || 1;
    return out.lerpVectors(hk.path[k - 1], hk.path[k], Math.min(1, Math.max(0, (d - hk.dist[k - 1]) / seg)));
  }

  // ---- 島民角色：訪客自己捏的氣球人（setResidents 換一批）----
  // 東區只有羅東一圈街道，把花東廣場也連成可以走的路
  const tileByKey = new Map(layout.tiles.map((t) => [`${t.q},${t.r}`, t]));
  const AXIAL = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const plazaWalk = layout.tiles.filter((t) => t.plaza);
  for (const t of plazaWalk) t.links = AXIAL.map(([dq, dr]) => tileByKey.get(`${t.q + dq},${t.r + dr}`)).filter((n) => n?.plaza);
  const loopCurve = new THREE.CatmullRomCurve3(COUPON_ROUTE.map((ll) => {
    const p = project(ll);
    return new THREE.Vector3(p.x, 0, p.z);
  }), true, 'centripetal');
  const loopPoints = loopCurve.getSpacedPoints(Math.round(loopCurve.getLength() / 0.5)).map((v) => {
    const t = nearestTile(v);
    return new THREE.Vector3(v.x, t ? Math.max(t.h, LAND_H) : LAND_H, v.z);
  });
  const makeMover = createMovers({
    streets: [...layout.streets, ...plazaWalk],
    loop: loopPoints,
    trails: hikers.map((hk) => ({ path: hk.path, dist: hk.dist, length: hk.length })),
  });
  // DK 物流車：沿著環島公路送貨
  const trucks = [0, 0.25, 0.5, 0.75].map((offset, i) => {
    const truck = createDeliveryTruck();
    scene.add(truck);
    return { truck, i: offset * loopPoints.length, dir: i % 2 ? -1 : 1, speed: 2.6 };
  });
  let residents = null;
  let mineId = null;
  const followAt = new THREE.Vector3();

  // DK 航空：飛機在機場之間來回飛，後面拖著目前活動的彩帶（site.json 的 banners，每飛一趟換下一個）
  const campaigns = (data.site.banners || []).filter((b) => b?.text);
  const airports = layout.landmarks.filter((s) => s.landmark.model === 'airport').map((s) => s.tile);
  const flights = [];
  for (let i = 0; i < Math.floor(airports.length / 2); i++) {
    const a = airports[i];
    const b = airports[airports.length - 1 - i]; // 頭尾配對：桃園↔小港、松山↔清泉崗
    const plane = createPlane();
    plane.scale.setScalar(1.6);
    scene.add(plane);
    const banners = campaigns.map((c) => {
      const bn = createBanner(c.text, c.color, c.textColor);
      bn.mesh.visible = false;
      bn.mesh.userData.bannerUrl = c.url || '';
      scene.add(bn.mesh);
      pickables.push(bn.mesh);
      return bn;
    });
    const rope = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: '#5b5b5b' }),
    );
    rope.visible = false;
    scene.add(rope);
    flights.push({ plane, banners, rope, index: i, a: new THREE.Vector3(a.x, LAND_H, a.z), b: new THREE.Vector3(b.x, LAND_H, b.z), phase: i * 0.37 });
  }
  const flightDir = new THREE.Vector3();
  const ROPE = 1.4;

  // 領優惠券的金色氣球人：沿著 route 在全島上空快速巡迴（site.json 的 coupon）
  let coupon = null;
  if (data.site.coupon) {
    const route = Array.isArray(data.site.coupon.route) && data.site.coupon.route.length >= 3 ? data.site.coupon.route : COUPON_ROUTE;
    const curve = new THREE.CatmullRomCurve3(route.map((ll) => {
      const p = project(ll);
      return new THREE.Vector3(p.x, 0, p.z);
    }), true, 'centripetal');
    const { group: g, anims: a } = createCouponMascot();
    g.userData.coupon = true;
    scene.add(g);
    pickables.push(g);
    anims.push(...a);
    const label = new CSS2DObject(h('button', {
      class: 'clabel',
      type: 'button',
      onclick: (e) => { e.stopPropagation(); handlers.onCoupon?.(); },
    }, h('span', {}, h('i'), data.site.coupon.label || '領優惠券'))); // 動畫放在內層，外層的 transform 是 3D 定位用的
    label.position.set(0, 7.9, 0);
    g.add(label);
    coupon = { group: g, curve, lap: Number(data.site.coupon.lapSeconds) || 50 };
  }
  const couponPos = new THREE.Vector3();
  const followWant = new THREE.Vector3();
  let follow = null; // 鏡頭一路跟著飛的對象（回傳位置的函式）：優惠券氣球人、自己的島民
  const flightPos = new THREE.Vector3();
  const flightNext = new THREE.Vector3();
  function flightAt(f, u, out) {
    // u 0→1 去程、1→2 回程；中段飛高，兩端貼近跑道
    const back = u > 1;
    const k = back ? u - 1 : u;
    out.lerpVectors(back ? f.b : f.a, back ? f.a : f.b, k);
    out.y = LAND_H + 0.3 + Math.sin(Math.PI * k) * 9;
    return out;
  }

  const people = createPeople(spots, layout.streets);
  scene.add(people.group);
  const clouds = createClouds(bounds, 14);
  scene.add(clouds.group);
  const ring = createRing();
  scene.add(ring);

  const regionLabels = new Map();
  for (const ri of layout.regions.values()) {
    const r = ri.region;
    const el = h('button', {
      class: 'rlabel',
      type: 'button',
      onclick: (e) => { e.stopPropagation(); handlers.onRegion(r.id); },
    },
    h('b', { text: r.no }),
    h('span', { text: r.name }),
    h('em', { text: r.badge || (r.role === 'plaza' ? '廣場' : `${ri.tiles.length} 間`) }));
    const obj = new CSS2DObject(el);
    obj.position.copy(ri.labelPos);
    scene.add(obj);
    regionLabels.set(r.id, obj);
  }

  function storeLabel(s, mod) {
    const el = h('button', {
      class: 'slabel',
      type: 'button',
      style: `--c:${mod.color}`,
      onclick: (e) => { e.stopPropagation(); handlers.onStore(s.id); },
      onmouseenter: () => { hoverId = s.id; },
      onmouseleave: () => { if (hoverId === s.id) hoverId = null; },
    }, h('i'), shortName(s.name));
    const obj = new CSS2DObject(el);
    obj.visible = false;
    return obj;
  }

  // ---- 鏡頭 ----
  const camera = new THREE.PerspectiveCamera(32, 1, 0.5, maxDim * 6);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 3.2;
  controls.maxDistance = maxDim * 2.6;
  controls.minPolarAngle = 0.25;
  controls.maxPolarAngle = 1.2;
  controls.screenSpacePanning = false;
  controls.zoomToCursor = true;
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };

  let W = 1;
  let H = 1;
  const inset = { left: 0, bottom: 0 };
  const insetTarget = { left: 0, bottom: 0 };

  function applyViewOffset() {
    camera.aspect = W / H;
    if (inset.left < 0.5 && inset.bottom < 0.5) camera.clearViewOffset();
    else camera.setViewOffset(W, H, -inset.left / 2, inset.bottom / 2, W, H);
    camera.updateProjectionMatrix();
  }

  function resize() {
    const r = container.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    renderer.setSize(W, H);
    labelRenderer.setSize(W, H);
    applyViewOffset();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  // 算出要多遠才裝得下 w × d 的地面範圍（扣掉被卡片擋住的部分）
  function fitDistance(w, d, polar = VIEW_POLAR) {
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const visW = Math.max(W - insetTarget.left, W * 0.35);
    const visH = Math.max(H - insetTarget.bottom, H * 0.35);
    const tv = tanHalf * (visH / H);
    const th = tanHalf * (visW / H);
    const depth = d * Math.cos(polar) + 1.5;
    return Math.max(depth / 2 / tv, w / 2 / th) * 1.22; // 透視會讓近處看起來比較大，多留一點邊
  }

  let tween = null;
  function flyTo(target, dist, polar = VIEW_POLAR, duration = 1100, az = controls.getAzimuthalAngle()) {
    follow = null; // 換去看別的地方就不再跟著
    tween = {
      fromT: controls.target.clone(),
      fromP: camera.position.clone(),
      toT: target.clone(),
      toP: new THREE.Vector3().setFromSphericalCoords(dist, polar, az).add(target),
      t0: performance.now(),
      duration,
    };
  }
  controls.addEventListener('start', () => { tween = null; follow = null; });

  function clampTarget() {
    const t = controls.target;
    const pad = 6;
    const x = clamp(t.x, bounds.min.x - pad, bounds.max.x + pad);
    const z = clamp(t.z, bounds.min.z - pad, bounds.max.z + pad);
    camera.position.x += x - t.x;
    camera.position.z += z - t.z;
    t.x = x;
    t.z = z;
  }

  function updateSun() {
    const dist = camera.position.distanceTo(controls.target);
    sun.target.position.copy(controls.target);
    sun.position.copy(controls.target).addScaledVector(SUN_DIR, 120);
    const half = clamp(Math.round(dist * 0.7), 14, Math.ceil(maxDim / 2) + 6);
    if (half !== shadowHalf) {
      shadowHalf = half;
      Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half });
      sun.shadow.camera.updateProjectionMatrix();
    }
  }

  // ---- 點擊與滑過 ----
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pick(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    for (const hit of raycaster.intersectObjects(pickables, true)) {
      if (!hit.object.visible) continue; // 收起來的彩帶點不到
      for (let o = hit.object; o; o = o.parent) {
        if (o.userData.storeId) return { store: o.userData.storeId };
        if (o.userData.landmarkId) return { landmark: o.userData.landmarkId };
        if (o.userData.bannerUrl !== undefined) return { banner: o.userData.bannerUrl };
        if (o.userData.coupon) return { coupon: true };
        if (o.userData.missionId) return { mission: o.userData.missionId };
        if (o.userData.service) return { service: true };
        if (o.userData.regionId) return { region: o.userData.regionId };
      }
      const tileRegion = hit.object.userData.tileRegion;
      if (tileRegion && hit.instanceId != null) return { region: tileRegion[hit.instanceId] };
    }
    return null;
  }

  const dom = renderer.domElement;
  let down = null;
  let pendingMove = null;
  dom.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  dom.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const quick = performance.now() - down.t < 600;
    down = null;
    if (moved > 6 || !quick) return;
    const hit = pick(e.clientX, e.clientY);
    if (hit?.store) handlers.onStore(hit.store);
    else if (hit?.landmark) handlers.onLandmark?.(hit.landmark);
    else if (hit?.banner !== undefined) { if (hit.banner) window.open(hit.banner, '_blank', 'noopener'); }
    else if (hit?.coupon) handlers.onCoupon?.();
    else if (hit?.mission) handlers.onMission?.(hit.mission);
    else if (hit?.service) handlers.onService?.();
    else if (hit?.region) handlers.onRegion(hit.region);
  });
  dom.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') pendingMove = e; });
  dom.addEventListener('pointerleave', () => { pendingMove = null; hoverId = null; dom.style.cursor = ''; });

  // ---- 標籤顯示 ----
  let focusId = null;
  let nearId = null;
  let selectedId = null;

  function updateLabels() {
    for (const [id, obj] of regionLabels) obj.visible = id !== focusId && id !== nearId;
    for (const [id, o] of storeObjs) {
      const active = id === selectedId;
      o.label.visible = active || o.region === focusId || o.region === nearId;
      o.label.element.classList.toggle('is-active', active);
    }
  }

  // 名牌疊在一起時，只留離鏡頭近的（選中、滑過的優先），其他先藏起來，拉近就會出現
  function declutter() {
    const items = [];
    for (const [id, o] of storeObjs) {
      if (!o.label.visible) continue;
      const rect = o.label.element.getBoundingClientRect();
      if (!rect.width) continue;
      const pri = id === selectedId ? 0 : id === hoverId ? 1 : 2;
      items.push({ el: o.label.element, rect, pri, d: camera.position.distanceToSquared(o.group.position) });
    }
    for (const obj of [...extraLabels, ...(residents?.labels || [])]) {
      if (!obj.visible) continue;
      const rect = obj.element.getBoundingClientRect();
      if (rect.width) items.push({ el: obj.element, rect, pri: 3, d: camera.position.distanceToSquared(obj.position) });
    }
    items.sort((a, b) => a.pri - b.pri || a.d - b.d);
    const kept = [];
    for (const it of items) {
      const r = it.rect;
      const hit = kept.some((k) => r.left < k.right + 2 && r.right > k.left - 2 && r.top < k.bottom + 1 && r.bottom > k.top - 1);
      it.el.classList.toggle('is-hidden', hit);
      if (!hit) kept.push(r);
    }
  }

  // 鏡頭拉近時，自動顯示正在看的那一區的門市名稱
  function detectNear() {
    const dist = camera.position.distanceTo(controls.target);
    const showExtra = dist < 95; // 景點、離島名牌：全景時太擠，拉近一點才出現
    for (const obj of extraLabels) obj.visible = showExtra;
    for (const obj of residents?.labels || []) obj.visible = obj.userData.mine || dist < 30;
    let best = null;
    if (dist < 40) {
      let bestD = Infinity;
      for (const ri of layout.regions.values()) {
        if (!ri.tiles.length) continue;
        const b = ri.box;
        const dx = Math.max(b.minX - controls.target.x, 0, controls.target.x - b.maxX);
        const dz = Math.max(b.minZ - controls.target.z, 0, controls.target.z - b.maxZ);
        const d = Math.hypot(dx, dz);
        if (d < 6 && d < bestD) { bestD = d; best = ri.region.id; }
      }
    }
    if (best !== nearId) {
      nearId = best;
      updateLabels();
    }
  }

  // ---- 每一格畫面 ----
  const clock = new THREE.Clock();
  let frame = 0;
  function loop() {
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.elapsedTime;
    frame++;

    if (tween) {
      const k = easeInOutCubic(Math.min(1, (performance.now() - tween.t0) / tween.duration));
      controls.target.lerpVectors(tween.fromT, tween.toT, k);
      camera.position.lerpVectors(tween.fromP, tween.toP, k);
      if (k >= 1) tween = null;
    }
    if (Math.abs(inset.left - insetTarget.left) > 0.5 || Math.abs(inset.bottom - insetTarget.bottom) > 0.5) {
      inset.left += (insetTarget.left - inset.left) * 0.15;
      inset.bottom += (insetTarget.bottom - inset.bottom) * 0.15;
      applyViewOffset();
    } else if (inset.left !== insetTarget.left || inset.bottom !== insetTarget.bottom) {
      Object.assign(inset, insetTarget);
      applyViewOffset();
    }
    controls.update();
    if (!tween) clampTarget();
    updateSun();
    if (frame % 12 === 0) detectNear();

    if (pendingMove) {
      const e = pendingMove;
      pendingMove = null;
      const hit = e.buttons ? null : pick(e.clientX, e.clientY);
      hoverId = hit?.store ?? null;
      dom.style.cursor = hit ? 'pointer' : '';
    }

    for (const [id, o] of storeObjs) {
      const lift = id === hoverId || id === selectedId ? 0.14 : 0;
      o.group.position.y += (o.tile.h + lift - o.group.position.y) * 0.18;
    }
    if (selectedId) {
      const o = storeObjs.get(selectedId);
      ring.position.set(o.tile.x, o.tile.h + 0.02, o.tile.z);
      ring.scale.setScalar(1 + Math.sin(t * 3) * 0.05);
    }

    for (const a of anims) {
      if (a.kind === 'bob') {
        a.obj.position.y = a.base + Math.sin(t * 1.6 + a.phase) * (a.amp ?? 0.05);
        if (a.spin) a.obj.rotation.y = t * a.spin;
      } else if (a.kind === 'smoke') {
        const k = (t * 0.35 + a.phase) % 1;
        a.obj.position.y = a.base + k * 0.55;
        a.obj.scale.setScalar(Math.sin(k * Math.PI) * 1.1 + 0.01);
      } else if (a.kind === 'spin') {
        a.obj.rotation.z = t * a.speed;
      } else if (a.kind === 'slide') {
        a.obj.position.x = a.base + Math.sin(t * a.speed) * a.amp;
      } else if (a.kind === 'orbit') {
        const ang = t * a.speed + a.phase;
        a.obj.position.set(Math.cos(ang) * a.radius, a.height + Math.sin(t * 2 + a.phase) * 0.2, Math.sin(ang) * a.radius);
        a.obj.rotation.y = t * 2;
      } else if (a.kind === 'sway') {
        a.obj.rotation.y = Math.sin(t * a.speed) * a.amp;
      } else if (a.kind === 'blink') {
        a.obj.material.emissiveIntensity = (Math.floor(t * 3) + a.phase) % 2 ? 1.2 : 0.15;
      } else if (a.kind === 'belt') {
        a.obj.position.x = a.from + ((t * a.speed + a.phase) % 1) * (a.to - a.from);
      }
    }
    // 爬山：上山 → 山頂開心跳 3 秒 → 下山 → 山腳休息 2 秒，一直循環
    for (const hk of hikers) {
      const leg = hk.length / hk.speed;
      const cycle = leg * 2 + 5;
      const c = (t + hk.phase) % cycle;
      const body = hk.hiker.userData.body;
      let d;
      let dir = 1;
      body.position.y = 0;
      if (c < leg) d = (c / leg) * hk.length;
      else if (c < leg + 3) { d = hk.length; body.position.y = Math.abs(Math.sin((c - leg) * 6)) * 0.25; }
      else if (c < leg * 2 + 3) { d = (1 - (c - leg - 3) / leg) * hk.length; dir = -1; }
      else d = 0;
      pointAt(hk, d, hikePos);
      pointAt(hk, Math.min(hk.length, Math.max(0, d + dir * 0.3)), hikeAhead);
      const walking = (c < leg) || (c >= leg + 3 && c < leg * 2 + 3);
      hk.hiker.position.set(hikePos.x, hikePos.y + (walking ? Math.abs(Math.sin(t * 7)) * 0.04 : 0), hikePos.z);
      if (hikeAhead.distanceToSquared(hikePos) > 1e-4) hk.hiker.rotation.y = Math.atan2(hikeAhead.x - hikePos.x, hikeAhead.z - hikePos.z);
    }
    if (coupon) {
      // 沿路線快速巡迴、一路彈跳，身體一直轉向鏡頭讓優惠券被看到
      const g = coupon.group;
      coupon.curve.getPointAt((t / coupon.lap) % 1, couponPos);
      g.position.set(couponPos.x, LAND_H + 4.5 + Math.abs(Math.sin(t * 3)) * 0.9, couponPos.z);
      g.rotation.y = Math.atan2(camera.position.x - g.position.x, camera.position.z - g.position.z);
    }
    residents?.update(t, dt);
    for (const tr of trucks) {
      const n = loopPoints.length;
      tr.i = (tr.i + tr.dir * tr.speed * dt * 2 + n) % n;
      const a = loopPoints[Math.floor(tr.i)];
      const b = loopPoints[(Math.floor(tr.i) + 1) % n];
      const k = tr.i % 1;
      const dx = (b.x - a.x) * tr.dir; // 車頭朝行進方向
      const dz = (b.z - a.z) * tr.dir;
      const len = Math.hypot(dx, dz) || 1;
      const lane = 0.45; // 靠右開，兩個方向各走一個車道
      tr.truck.position.set(a.x + (b.x - a.x) * k - (dz / len) * lane, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k + (dx / len) * lane);
      tr.truck.rotation.y = Math.atan2(dx, dz);
    }
    if (follow && !tween) {
      const want = follow();
      if (want) {
        followWant.copy(want).sub(controls.target).multiplyScalar(0.12);
        controls.target.add(followWant);
        camera.position.add(followWant);
      }
    }
    for (const f of flights) {
      const raw = t * 0.04 + f.phase;
      const u = raw % 2;
      f.plane.position.copy(flightAt(f, u, flightPos));
      f.plane.lookAt(flightAt(f, (u + 0.01) % 2, flightNext));
      // 彩帶：起降時收起來，飛高了才拉出來；每飛完一趟換下一個活動
      if (f.banners.length) {
        const k = u > 1 ? u - 1 : u;
        const flying = Math.sin(Math.PI * k) > 0.3;
        const active = (f.index + Math.floor(raw)) % f.banners.length;
        f.banners.forEach((bn, i) => { bn.mesh.visible = flying && i === active; });
        f.rope.visible = flying;
        if (flying) {
          flightDir.subVectors(flightNext, flightPos).normalize();
          const bn = f.banners[active];
          bn.update(t, f.plane, flightDir, camera.position, ROPE);
          const pts = f.rope.geometry.attributes.position;
          pts.setXYZ(0, f.plane.position.x, f.plane.position.y, f.plane.position.z);
          const end = flightPos.copy(f.plane.position).addScaledVector(flightDir, -ROPE);
          pts.setXYZ(1, end.x, end.y, end.z);
          pts.needsUpdate = true;
        }
      }
    }
    people.update(t, dt);
    clouds.update(dt);

    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
    if (frame % 6 === 0) declutter();
    requestAnimationFrame(loop);
  }

  // 開場：從高空俯衝到全景
  controls.target.copy(mapCenter);
  camera.position.setFromSphericalCoords(fitDistance(mapSize.x, mapSize.z) * 1.5, 0.4, 0.3).add(mapCenter);
  requestAnimationFrame(loop);

  return {
    overview() {
      // 橫式螢幕連離島一起放進來；直式手機寬度不夠，只框台灣本島，往西南（離鏡頭近、看起來比較大）挪一點
      if (W < H) {
        const size = layout.mainBounds.getSize(new THREE.Vector3());
        const target = layout.mainBounds.getCenter(new THREE.Vector3()).setY(LAND_H);
        target.z += size.z * 0.06;
        target.x -= size.x * 0.06;
        flyTo(target, fitDistance(size.x * 0.88, size.z), VIEW_POLAR, 1400, 0);
      } else {
        flyTo(mapCenter, fitDistance(mapSize.x, mapSize.z), VIEW_POLAR, 1400, 0); // 全景一律北方朝上
      }
    },
    // 換一批島民（從試算表讀到的，加上自己剛捏好的）
    setResidents(list, mine) {
      if (residents) {
        scene.remove(residents.group);
        residents.dispose();
      }
      mineId = mine;
      residents = createResidents(list, makeMover, mine);
      scene.add(residents.group);
    },
    // 鏡頭飛到自己的島民，然後一路跟著
    focusResident(id = mineId) {
      const p = residents?.positionOf(id);
      if (!p) return;
      flyTo(new THREE.Vector3(p.x, p.y + 0.4, p.z), W < 600 ? 9 : 7, 1.05);
      follow = () => {
        const q = residents?.positionOf(id);
        return q ? followAt.set(q.x, q.y + 0.4, q.z) : null;
      };
    },
    focusService() {
      const ri = layout.regions.get('service');
      if (ri) this.focusRegion('service');
    },
    focusMission(id) {
      const o = missionObjs.get(id);
      if (!o) return;
      flyTo(new THREE.Vector3(o.tile.x, o.tile.h + o.height * 0.4, o.tile.z), W < 600 ? 10 : 8, 1.05);
    },
    focusCoupon() {
      if (!coupon) return;
      const p = coupon.group.position;
      flyTo(new THREE.Vector3(p.x, p.y + 2, p.z), W < 600 ? 40 : 32, 1.05);
      follow = () => followAt.set(coupon.group.position.x, coupon.group.position.y + 2, coupon.group.position.z); // 飛到之後一路跟著它
    },
    focusLandmark(id) {
      const o = landmarkObjs.get(id);
      if (!o) return;
      // 越高的景點（101、85 大樓）鏡頭退越遠，整棟才看得到
      const far = o.landmark.footprint ? 12 : clamp(o.height * 3.4, 8, 15);
      flyTo(new THREE.Vector3(o.tile.x, o.tile.h + o.height * 0.4, o.tile.z), W < 600 ? far + 3 : far, 1.0);
    },
    focusRegion(id) {
      const ri = layout.regions.get(id);
      if (!ri) return;
      const w = ri.box.maxX - ri.box.minX + 3;
      const d = ri.box.maxZ - ri.box.minZ + 3;
      flyTo(ri.center, Math.max(fitDistance(w, d) * 0.85, 14));
    },
    // 進店前：鏡頭降到店門口、正對招牌
    focusStore(id) {
      const o = storeObjs.get(id);
      if (!o) return;
      flyTo(new THREE.Vector3(o.tile.x, o.tile.h + 0.35, o.tile.z), 3.8, 1.18, 1000, o.group.rotation.y);
    },
    setFocus(regionId) {
      focusId = regionId;
      island.highlight(regionId);
      updateLabels();
    },
    setSelected(id) {
      selectedId = id;
      ring.visible = Boolean(id);
      updateLabels();
    },
    setInsets({ left = 0, bottom = 0 }) {
      insetTarget.left = left;
      insetTarget.bottom = bottom;
    },
    setShoe(storeId, color) {
      const o = storeObjs.get(storeId);
      if (o) people.setShoe(o.spot, color);
    },
  };
}
