import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { layoutTaiwan, buildIsland, LAND_H } from './islands.js';
import { createBuilding, createPlaza, createGreeters, createClouds, createRing, MASCOT, SHOE_FALLBACK, shoeColorOf } from './buildings.js';
import { easeInOutCubic, clamp, h, rng, shortName } from './util.js';

const VIEW_POLAR = 0.9; // 鏡頭和正上方的夾角（弧度），越大越斜
const SEA = '#7fcbd8';
const SKY = '#cdebf1';
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const SUN_DIR = new THREE.Vector3(-30, 60, 35).normalize();

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
  const layout = layoutTaiwan(data.regions, data.stores, data.warn);
  const island = buildIsland(layout);
  const bounds = layout.bounds;
  const maxDim = Math.max(...bounds.getSize(new THREE.Vector3()).toArray());
  // 全景以台灣本島置中；看的點往南（靠鏡頭那側）偏一點，抵銷透視讓近處變大的效果
  const mapSize = layout.mainBounds.getSize(new THREE.Vector3());
  const mapCenter = layout.mainBounds.getCenter(new THREE.Vector3()).setY(LAND_H);
  mapCenter.z += mapSize.z * 0.06;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, maxDim * 1.8, maxDim * 3.6);
  scene.add(island.group);

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
    storeObjs.set(s.id, { group: g, tile: t, region: s.region, label });
    // 門口站一個氣球人，穿的是這間店店長推薦的那雙鞋（還沒推薦就隨機配一雙）
    const door = new THREE.Vector3(0.46, 0, 0.6).applyAxisAngle(Y_AXIS, g.rotation.y);
    const shoe = shoeColorOf(data.products.get(s.products[0])) ?? SHOE_FALLBACK[Math.floor(rand() * SHOE_FALLBACK.length)];
    spots.push({ x: t.x + door.x, y: t.h, z: t.z + door.z, color: MASCOT[spots.length % 4], shoe, phase: rand() * 6, rot: g.rotation.y });
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

  const greeters = createGreeters(spots);
  scene.add(greeters.group);
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
    h('em', { text: r.role === 'plaza' ? '廣場' : `${ri.tiles.length} 間` }));
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
  controls.minDistance = 3.5;
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
    tween = {
      fromT: controls.target.clone(),
      fromP: camera.position.clone(),
      toT: target.clone(),
      toP: new THREE.Vector3().setFromSphericalCoords(dist, polar, az).add(target),
      t0: performance.now(),
      duration,
    };
  }
  controls.addEventListener('start', () => { tween = null; });

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
      for (let o = hit.object; o; o = o.parent) {
        if (o.userData.storeId) return { store: o.userData.storeId };
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

  // 鏡頭拉近時，自動顯示正在看的那一區的門市名稱
  function detectNear() {
    const dist = camera.position.distanceTo(controls.target);
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
      }
    }
    greeters.update(t);
    clouds.update(dt);

    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
    requestAnimationFrame(loop);
  }

  // 開場：從高空俯衝到全景
  controls.target.copy(mapCenter);
  camera.position.setFromSphericalCoords(fitDistance(mapSize.x, mapSize.z) * 1.5, 0.4, 0.3).add(mapCenter);
  requestAnimationFrame(loop);

  return {
    overview() {
      // 直式手機螢幕寬度不夠：允許切到一點東北角外海，並往西南（離鏡頭近、看起來比較大）挪一點
      const portrait = W < H;
      const target = portrait ? mapCenter.clone().add(new THREE.Vector3(-mapSize.x * 0.06, 0, 0)) : mapCenter;
      flyTo(target, fitDistance(portrait ? mapSize.x * 0.88 : mapSize.x, mapSize.z), VIEW_POLAR, 1400, 0); // 全景一律北方朝上
    },
    focusRegion(id) {
      const ri = layout.regions.get(id);
      if (!ri) return;
      const w = ri.box.maxX - ri.box.minX + 6;
      const d = ri.box.maxZ - ri.box.minZ + 6;
      flyTo(ri.center, Math.max(fitDistance(w, d), 16));
    },
    focusStore(id) {
      const o = storeObjs.get(id);
      if (!o) return;
      flyTo(new THREE.Vector3(o.tile.x, o.tile.h + 0.3, o.tile.z), W < 600 ? 13 : 10.5, 0.95);
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
  };
}
