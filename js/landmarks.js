import * as THREE from 'three';
import { kit, mat } from './buildings.js';

// 台灣景點、機場、離島地標的低多邊形造型。原點在格子頂面中央，正面朝南（+z）
const { box, cyl, cone, ball, prism, place, geo } = kit;
const WINE = '#8B2332';

const glow = (color, emissive, intensity = 0.7) =>
  new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity, roughness: 0.5 });
const LANTERN = glow('#e8473a', '#ff3b20');
const LIGHT = glow('#fff3c4', '#ffd36b', 0.9);
const WATER = new THREE.MeshStandardMaterial({ color: '#4fb3d1', roughness: 0.25, metalness: 0.1 });

// 四角錐台（轉 45 度讓邊對齊）
function squareFrustum(rTop, rBottom, h, c, y) {
  const m = cyl(rTop, rBottom, h, 4, c, 0, y, 0);
  m.rotation.y = Math.PI / 4;
  return m;
}

const MODELS = {
  // 台北 101：一節一節往上開的竹節
  tower101() {
    const g = new THREE.Group();
    g.add(box(0.9, 0.25, 0.9, '#cfd8d6'));
    g.add(squareFrustum(0.36, 0.42, 0.3, '#8fbfb6', 0.25));
    for (let i = 0; i < 8; i++) g.add(squareFrustum(0.36, 0.27, 0.3, i % 2 ? '#7aa9a1' : '#86b7ae', 0.55 + i * 0.3));
    g.add(squareFrustum(0.16, 0.2, 0.24, '#9cc9c0', 2.95));
    g.add(cyl(0.015, 0.035, 0.7, 5, '#d9dee0', 0, 3.19, 0));
    return g;
  },

  // 高雄 85：像「高」字的雙腳大樓
  tower85() {
    const g = new THREE.Group();
    const glass = '#5f86a6';
    g.add(box(0.26, 1.4, 0.38, glass, -0.24, 0, 0), box(0.26, 1.4, 0.38, glass, 0.24, 0, 0));
    g.add(box(0.76, 0.32, 0.38, '#d9e2e8', 0, 1.4, 0));
    g.add(box(0.3, 1.0, 0.32, glass, 0, 1.72, 0));
    g.add(squareFrustum(0.06, 0.2, 0.22, '#d9e2e8', 2.72));
    g.add(cyl(0.012, 0.025, 0.45, 5, '#d9dee0', 0, 2.94, 0));
    return g;
  },

  // 九份：沿山坡疊上去的老屋和紅燈籠
  lanterns() {
    const g = new THREE.Group();
    [[-0.32, 0.3, 0], [0.05, 0.15, 0.18], [0.36, 0, 0.36]].forEach(([x, y, z]) => {
      g.add(box(0.36, 0.3 + y, 0.3, '#6b4a3a', x, 0, z - 0.2));
      g.add(prism(0.44, 0.16, 0.36, '#4a4f55', x, 0.3 + y, z - 0.2));
      for (const dx of [-0.12, 0.12]) {
        const l = place(geo('lantern', () => new THREE.IcosahedronGeometry(0.05, 1)), LANTERN, x + dx, 0.22 + y, z - 0.03);
        l.scale.y = 1.3;
        g.add(l);
      }
    });
    return g;
  },

  // 野柳女王頭：細脖子撐著一顆頭的奇岩
  queen() {
    const g = new THREE.Group();
    const rock = '#c9a77a';
    const base = ball(0.35, rock, 0, 0.12, 0, 0);
    base.scale.set(1.3, 0.5, 1);
    g.add(base);
    g.add(cyl(0.07, 0.11, 0.45, 6, '#b8956a', 0, 0.2, 0));
    const head = ball(0.17, rock, 0.03, 0.75, 0, 1);
    head.scale.set(1.35, 1, 0.8);
    head.rotation.z = -0.25;
    g.add(head);
    return g;
  },

  // 日月潭：一池湖水、拉魯島、湖邊的慈恩塔、一艘遊湖船
  lake(anims) {
    const g = new THREE.Group();
    g.add(place(geo('lakeWater', () => new THREE.CylinderGeometry(0.9, 0.9, 0.06, 24).translate(0, 0.03, 0)), WATER));
    g.add(cyl(0.12, 0.14, 0.06, 8, '#7cc25a', 0.1, 0.04, -0.05));
    const tower = new THREE.Group();
    [0.16, 0.13, 0.1, 0.07].forEach((r, i) => {
      tower.add(cyl(r, r, 0.14, 8, '#f6efe3', 0, i * 0.17, 0));
      tower.add(cone(r + 0.05, 0.05, 8, '#d08a3a', 0, i * 0.17 + 0.14, 0));
    });
    tower.position.set(-0.68, 0.06, -0.5);
    g.add(tower);
    const boat = box(0.18, 0.06, 0.08, '#f2f2f2', 0.35, 0.06, 0.3);
    anims.push({ obj: boat, kind: 'bob', base: 0.06, phase: 1, amp: 0.015 });
    g.add(boat);
    return g;
  },

  // 阿里山：森林小火車在鐵軌上來回，旁邊一棵神木
  train(anims) {
    const g = new THREE.Group();
    g.add(box(1.4, 0.02, 0.04, '#6b5a4a', 0, 0, 0.18), box(1.4, 0.02, 0.04, '#6b5a4a', 0, 0, 0.3));
    const train = new THREE.Group();
    train.add(box(0.26, 0.18, 0.16, '#c0392b', 0, 0.02, 0.24), box(0.28, 0.03, 0.18, '#2b2b2b', 0, 0.2, 0.24));
    train.add(box(0.24, 0.16, 0.16, '#c0392b', -0.3, 0.02, 0.24), box(0.26, 0.03, 0.18, '#2b2b2b', -0.3, 0.18, 0.24));
    anims.push({ obj: train, kind: 'slide', base: 0, amp: 0.4, speed: 0.5 });
    g.add(train);
    g.add(cyl(0.08, 0.13, 0.7, 6, '#7a5236', 0.2, 0, -0.35));
    g.add(cone(0.42, 1.0, 7, '#3f7d4a', 0.2, 0.55, -0.35));
    return g;
  },

  // 玉山：積雪的山頂
  peak() {
    const g = new THREE.Group();
    g.add(cone(0.85, 1.3, 7, '#9fa3a8'));
    g.add(cone(0.36, 0.56, 7, '#ffffff', 0, 0.74, 0));
    return g;
  },

  // 太魯閣：大理石峽谷、溪水和紅色吊橋
  gorge() {
    const g = new THREE.Group();
    g.add(box(0.36, 1.1, 1.5, '#d8d3c8', -0.44, 0, 0), box(0.36, 0.95, 1.5, '#cfc9bd', 0.44, 0, 0));
    g.add(place(geo('river', () => new THREE.BoxGeometry(0.52, 0.04, 1.7).translate(0, 0.02, 0)), WATER));
    g.add(box(0.56, 0.05, 0.16, '#c0392b', 0, 0.78, 0.1));
    return g;
  },

  // 燈塔（鵝鑾鼻、綠島、蘭嶼、小琉球、馬祖）
  lighthouse() {
    const g = new THREE.Group();
    g.add(cyl(0.3, 0.32, 0.08, 10, '#d9d2c3'));
    g.add(cyl(0.13, 0.19, 0.9, 10, '#ffffff', 0, 0.08, 0));
    g.add(cyl(0.135, 0.15, 0.1, 10, '#c0392b', 0, 0.55, 0));
    g.add(place(geo('lampRoom', () => new THREE.CylinderGeometry(0.11, 0.11, 0.14, 10).translate(0, 0.07, 0)), LIGHT, 0, 0.98, 0));
    g.add(cone(0.14, 0.14, 10, '#2b2b2b', 0, 1.12, 0));
    return g;
  },

  // 赤崁樓：紅牆、深色燕尾屋頂的兩座樓閣
  pavilion() {
    const g = new THREE.Group();
    g.add(box(0.98, 0.12, 0.72, '#b3a48a'));
    for (const x of [-0.24, 0.24]) {
      g.add(box(0.36, 0.3, 0.32, '#b83a2a', x, 0.12, 0));
      g.add(prism(0.48, 0.18, 0.44, '#3f4a45', x, 0.42, 0));
      g.add(box(0.22, 0.16, 0.2, '#b83a2a', x, 0.56, 0));
      g.add(prism(0.32, 0.14, 0.3, '#3f4a45', x, 0.72, 0));
    }
    return g;
  },

  // 機場：跑道、航廈、塔台，停機坪上一架飛機
  airport() {
    const g = new THREE.Group();
    g.add(box(3.6, 0.03, 0.46, '#4b4f55', 0, 0, 0.35));
    for (let i = -6; i <= 6; i++) g.add(box(0.14, 0.035, 0.03, '#ffffff', i * 0.26, 0, 0.35));
    g.add(box(1.1, 0.3, 0.46, '#f2f4f5', -0.2, 0, -0.75));
    g.add(box(1.12, 0.08, 0.48, '#7fc1e3', -0.2, 0.15, -0.75));
    g.add(cyl(0.06, 0.08, 0.85, 6, '#e8ecef', 0.85, 0, -0.85));
    g.add(cyl(0.16, 0.13, 0.14, 8, '#7fc1e3', 0.85, 0.85, -0.85));
    const plane = createPlane();
    plane.scale.setScalar(0.7);
    plane.position.set(-0.3, 0.12, -0.2);
    plane.rotation.y = Math.PI / 2;
    g.add(plane);
    return g;
  },

  // 澎湖：海邊兩支會轉的風車
  windmill(anims) {
    const g = new THREE.Group();
    for (const [x, z, s] of [[-0.25, 0, 1], [0.35, 0.3, 0.8]]) {
      const w = new THREE.Group();
      w.add(cyl(0.025, 0.045, 1.3, 6, '#f4f4f4'));
      w.add(box(0.08, 0.08, 0.16, '#f4f4f4', 0, 1.26, 0));
      const rotor = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const blade = box(0.035, 0.48, 0.012, '#ffffff', 0, 0, 0);
        blade.rotation.z = (i * Math.PI * 2) / 3;
        rotor.add(blade);
      }
      rotor.position.set(0, 1.3, 0.1);
      anims.push({ obj: rotor, kind: 'spin', speed: 1.4 + x });
      w.add(rotor);
      w.position.set(x, 0, z);
      w.scale.setScalar(s);
      g.add(w);
    }
    return g;
  },

  // 金門：紅磚閩南厝
  house() {
    const g = new THREE.Group();
    g.add(box(0.56, 0.28, 0.4, '#c8553d', -0.12, 0, 0));
    g.add(prism(0.66, 0.2, 0.48, '#8f3b2c', -0.12, 0.28, 0));
    g.add(box(0.3, 0.22, 0.3, '#c8553d', 0.35, 0, 0.2));
    g.add(prism(0.38, 0.16, 0.36, '#8f3b2c', 0.35, 0.22, 0.2));
    return g;
  },

  // 在地公廟：石台、紅牆紅柱、兩層金色燕尾屋頂、廟前大香爐冒著煙
  shrine(anims) {
    const g = new THREE.Group();
    const RED = '#c0392b';
    const GOLD = '#e0a23b';
    const ridge = (w, h, d, y) => {
      const roof = prism(d, h, w, GOLD, 0, y, -0.06);
      roof.rotation.y = Math.PI / 2; // 屋脊左右向
      return roof;
    };
    g.add(box(1.0, 0.1, 0.86, '#cdbf9f'));
    g.add(box(0.86, 0.34, 0.5, RED, 0, 0.1, -0.06));
    for (const x of [-0.34, -0.12, 0.12, 0.34]) g.add(cyl(0.024, 0.024, 0.34, 6, '#8e1f16', x, 0.1, 0.22));
    g.add(ridge(1.04, 0.2, 0.66, 0.44));
    g.add(box(0.5, 0.14, 0.34, RED, 0, 0.56, -0.06));
    g.add(ridge(0.68, 0.18, 0.46, 0.7));
    // 燕尾：屋脊兩端翹起來
    for (const side of [-1, 1]) {
      const tail = cone(0.035, 0.16, 5, GOLD, side * 0.34, 0.82, -0.06);
      tail.rotation.z = side * -0.9;
      g.add(tail);
    }
    g.add(ball(0.045, '#f6d365', 0, 0.92, -0.06, 0));
    for (const x of [-0.3, 0.3]) {
      const l = place(geo('lantern', () => new THREE.IcosahedronGeometry(0.05, 1)), LANTERN, x, 0.36, 0.26);
      l.scale.y = 1.3;
      g.add(l);
    }
    g.add(cyl(0.12, 0.1, 0.14, 8, '#8a6a2c', 0, 0.1, 0.36));
    for (let i = 0; i < 2; i++) {
      const puff = ball(0.06, '#f4f1ea', 0, 0.3, 0.36, 0);
      puff.castShadow = false;
      anims.push({ obj: puff, kind: 'smoke', base: 0.26, phase: i * 0.5 });
      g.add(puff);
    }
    return g;
  },

  // 認不得的造型：一座小紀念碑
  monument() {
    const g = new THREE.Group();
    g.add(box(0.5, 0.1, 0.5, '#d9d2c3'));
    g.add(squareFrustum(0.06, 0.14, 0.9, '#efe8da', 0.1));
    return g;
  },
};

export const LANDMARK_MODELS = Object.keys(MODELS);

export function createLandmark(model) {
  const anims = [];
  const g = (MODELS[model] || MODELS.monument)(anims);
  return { group: g, anims };
}

// DK 航空（白色機身、酒紅色尾翼），沿 +z 方向飛
export function createPlane() {
  const g = new THREE.Group();
  const body = place(geo('fuselage', () => new THREE.CylinderGeometry(0.07, 0.07, 0.8, 8).rotateX(Math.PI / 2)), mat('#ffffff'));
  g.add(body);
  const nose = place(geo('nose', () => new THREE.ConeGeometry(0.07, 0.16, 8).rotateX(Math.PI / 2).translate(0, 0, 0.48)), mat('#ffffff'));
  g.add(nose);
  g.add(box(0.9, 0.02, 0.2, '#e9edf0', 0, -0.02, 0.02));
  g.add(box(0.3, 0.02, 0.1, '#e9edf0', 0, 0.02, -0.34));
  g.add(box(0.02, 0.2, 0.14, WINE, 0, 0.04, -0.34));
  g.add(box(0.16, 0.02, 0.02, WINE, 0, 0.05, 0.1));
  return g;
}
