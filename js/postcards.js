import * as THREE from 'three';
import { createLandmark } from './landmarks.js';
import { createResidents } from './residents.js';
import { nightOf, taipeiHour } from './seasons.js';
import { rng } from './util.js';

// 島民寄來的明信片：照上島時間，每 12 小時從它去過的景點寄一張回來（不用連網，每台裝置算出來都一樣）。
// 去哪裡看移動方式：泳渡日月潭寄日月潭、爬山寄山上、北中南東各寄那一區的景點，環島和逛商圈全島都去
const EVERY = 12 * 3600000;
const KEEP = 30; // 最多留最新的 30 張

const isEast = ([lat, lng]) => lng >= 121.45 && lat < 24.9;
const AREA = {
  north: (ll) => ll[0] >= 24.6 && !isEast(ll),
  central: (ll) => ll[0] >= 23.7 && ll[0] < 24.6 && !isEast(ll),
  south: (ll) => ll[0] < 23.7 && !isEast(ll),
  east: isEast,
};
const MOUNTAIN_MODELS = ['peak', 'train', 'gorge'];

// 去哪裡寄：自己的「主場」（泳渡日月潭→日月潭、爬山→山上）六成，那一區的景點三成，那一區的廟一成。
// 環島、逛商圈全島的景點都去（不寄廟，不然廟太多會洗版）
const HOME = {
  lake: (l) => l.model === 'lake',
  mountain: (l) => MOUNTAIN_MODELS.includes(l.model),
};
const AREAS_OF = { lake: ['central'], mountain: [], north: ['north'], central: ['central'], south: ['south'], east: ['east'] };
function placesFor(mode, landmarks) {
  const ok = landmarks.filter((l) => l.model !== 'airport' && Array.isArray(l.latlng));
  const areas = AREAS_OF[mode];
  const inAreas = (l) => !areas || areas.some((a) => AREA[a](l.latlng));
  return {
    home: HOME[mode] ? ok.filter(HOME[mode]) : [],
    sights: ok.filter((l) => l.type !== 'temple' && inAreas(l)),
    temples: areas ? ok.filter((l) => l.type === 'temple' && inAreas(l)) : [],
    all: ok,
  };
}
function pickPlace(places, rand) {
  const r = rand();
  const list = (r < 0.6 && places.home.length && places.home)
    || (r < 0.9 && places.sights.length && places.sights)
    || (places.temples.length && places.temples)
    || (places.sights.length && places.sights)
    || (places.home.length && places.home)
    || places.all;
  return list[Math.floor(rand() * list.length)];
}

const LINES = [
  (n) => `今天走到${n}，穿著 DK 腳一點都不累！`,
  (n) => `在${n}拍了一張照，寄給你看～`,
  (n) => `${n}好熱鬧，下次一起來！`,
  (n) => `到${n}了！風景好美，想你喔。`,
  (n) => `${n}的風好舒服，今天也走了好多路。`,
];
const MODE_LINES = {
  lake: (n) => `今天又泳渡了一趟${n}，水好涼！`,
  mountain: (n) => `爬上${n}了！空氣好新鮮。`,
};

/** 這個島民到現在寄過幾張（total），和最新的最多 30 張（新的在前） */
export function postcardsOf(resident, landmarks, now = Date.now()) {
  const at = Date.parse(resident?.since || '');
  if (!at || !resident.id) return { total: 0, cards: [] };
  const total = Math.max(0, Math.floor((now - at) / EVERY));
  const places = placesFor(resident.mode, landmarks);
  if (!places.all.length) return { total: 0, cards: [] };
  const cards = [];
  for (let k = Math.max(1, total - KEEP + 1); k <= total; k++) {
    const rand = rng(`postcard-${resident.id}-${k}`);
    const landmark = pickPlace(places, rand);
    const special = HOME[resident.mode]?.(landmark) ? MODE_LINES[resident.mode] : null;
    const line = special && rand() < 0.7 ? special : LINES[Math.floor(rand() * LINES.length)];
    cards.push({ k, at: at + k * EVERY, landmark, text: line(landmark.name) });
  }
  return { total, cards: cards.reverse() };
}

// ---- 明信片上的 3D 合照：島民站在景點前面。拍過的存起來，同一張不用再拍 ----
const shots = new Map();
const W = 360;
const H = 240;

/** 打開明信片冊時建一台相機，拍完記得 dispose */
export function createPostcardCamera(eventHat = null) {
  let renderer = null;
  const camera = new THREE.PerspectiveCamera(32, W / H, 0.1, 50);

  return {
    /** 拍一張：回傳圖片網址（data URL） */
    shoot(card, resident) {
      const key = `${resident.id}-${card.k}-${JSON.stringify(resident.look)}-${eventHat || ''}`;
      if (shots.has(key)) return shots.get(key);
      if (!renderer) {
        renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        renderer.setPixelRatio(1);
        renderer.setSize(W, H, false);
      }
      const n = nightOf(taipeiHour(card.at)); // 晚上寄的明信片，天空是晚上的
      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#cdebf1').lerp(new THREE.Color('#25335a'), n);
      scene.add(new THREE.HemisphereLight('#fffaf0', '#9cc7a0', 2 - 1.1 * n));
      const sun = new THREE.DirectionalLight(n > 0.5 ? '#aabbff' : '#fff1dc', 2.2 - 1.4 * n);
      sun.position.set(-2, 4, 3);
      scene.add(sun);
      const ground = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.1, 24).translate(0, -0.05, 0), new THREE.MeshStandardMaterial({ color: '#9fd27a', roughness: 1 }));
      scene.add(ground);

      const { group } = createLandmark(card.landmark.model);
      const size = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());
      group.scale.setScalar(Math.min(1.5 / Math.max(size.y, 0.1), 2.2 / Math.max(size.x, size.z, 0.1), 1.4));
      group.position.set(-0.25, 0, -0.35);
      scene.add(group);
      // 鏡頭對著景點的中段：扁的景點（湖）拉近一點、高的景點（101）往上看
      const top = new THREE.Box3().setFromObject(group).max.y;
      const aim = Math.min(Math.max(top * 0.42, 0.28), 0.62);
      camera.position.set(0.35, aim + 0.5, 2.6 + top * 0.45);
      camera.lookAt(0.1, aim, 0);

      // 照片裡的島民是寄明信片那天的樣子（以前的明信片比較小隻）
      const fig = createResidents([{ ...resident, nickname: '' }], () => (p) => {
        p.rot = -0.35;
        return 0;
      }, null, eventHat, card.at);
      fig.update(1, 0);
      fig.group.position.set(0.6, 0, 0.6);
      scene.add(fig.group);

      renderer.render(scene, camera);
      const url = renderer.domElement.toDataURL('image/jpeg', 0.85);
      fig.dispose();
      ground.geometry.dispose();
      ground.material.dispose();
      shots.set(key, url);
      return url;
    },
    dispose() {
      if (!renderer) return;
      renderer.dispose();
      renderer.forceContextLoss();
      renderer = null;
    },
  };
}
