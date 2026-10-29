import * as THREE from 'three';
import { kit, mat, MASCOT } from './buildings.js';

// 台灣景點、機場、離島地標的低多邊形造型。原點在格子頂面中央，正面朝南（+z）
const { box, cyl, cone, ball, prism, place, geo, sign } = kit;
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

// 泳渡日月潭的氣球人：戴泳帽、後面拖著橘色浮具，兩隻手輪流划水，從這岸游到對岸再游回來
function swimmer(anims) {
  const s = new THREE.Group();
  const skin = MASCOT[2];
  const body = cyl(0.05, 0.05, 0.13, 10, skin, 0, 0, 0);
  body.rotation.x = Math.PI / 2 - 0.35;
  body.position.set(0, 0.035, -0.09);
  s.add(body);
  s.add(ball(0.06, skin, 0, 0.1, 0.07, 2));
  const cap = ball(0.063, '#e8473a', 0, 0.108, 0.065, 2);
  cap.scale.y = 0.7;
  s.add(cap);
  const arms = [-1, 1].map((side) => {
    const arm = new THREE.Group();
    arm.position.set(side * 0.065, 0.075, 0.05);
    arm.add(cyl(0.018, 0.018, 0.1, 6, skin, 0, -0.1, 0));
    s.add(arm);
    return arm;
  });
  s.add(ball(0.03, '#ff8a1f', 0, 0.07, -0.17, 1)); // 浮具
  [-0.03, 0.03].forEach((x) => s.add(ball(0.022, '#ffffff', x, 0.065, -0.1, 1))); // 打水的水花
  anims.push({ obj: s, kind: 'swim', from: [-0.6, 0.6], to: [0.6, 0.6], y: 0.02, speed: 0.08, phase: 0.3, arms });
  return s;
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
    tower.position.set(-0.76, 0, -0.62); // 慈恩塔在湖岸邊
    g.add(tower);
    const boat = box(0.18, 0.06, 0.08, '#f2f2f2', 0.35, 0.06, 0.3);
    anims.push({ obj: boat, kind: 'bob', base: 0.06, phase: 1, amp: 0.015 });
    g.add(boat);
    g.add(swimmer(anims));
    return g;
  },

  // 阿里山：森林小火車在鐵軌上來回，旁邊一棵神木
  // 阿里山：千年神木（紅檜）站在中間，旁邊幾棵小樹，森林小火車在前面來回
  train(anims) {
    const g = new THREE.Group();
    g.add(box(1.5, 0.02, 0.04, '#6b5a4a', 0, 0, 0.42), box(1.5, 0.02, 0.04, '#6b5a4a', 0, 0, 0.56));
    const train = new THREE.Group();
    train.add(box(0.26, 0.18, 0.16, '#c0392b', 0, 0.02, 0.49), box(0.28, 0.03, 0.18, '#2b2b2b', 0, 0.2, 0.49));
    train.add(box(0.24, 0.16, 0.16, '#c0392b', -0.3, 0.02, 0.49), box(0.26, 0.03, 0.18, '#2b2b2b', -0.3, 0.18, 0.49));
    anims.push({ obj: train, kind: 'slide', base: 0, amp: 0.45, speed: 0.5 });
    g.add(train);
    // 神木：又粗又高的紅褐色樹幹、往外抓地的樹根，上面一層一層的針葉
    const trunk = '#7a3f26';
    g.add(cyl(0.17, 0.27, 1.35, 9, trunk, 0, 0, -0.12));
    for (let i = 0; i < 5; i++) {
      const root = cyl(0.03, 0.09, 0.32, 5, '#6b3520', Math.cos((i / 5) * Math.PI * 2) * 0.22, 0, -0.12 + Math.sin((i / 5) * Math.PI * 2) * 0.22);
      root.rotation.set(Math.sin((i / 5) * Math.PI * 2) * 0.9, 0, -Math.cos((i / 5) * Math.PI * 2) * 0.9);
      g.add(root);
    }
    g.add(cyl(0.05, 0.07, 0.4, 5, trunk, 0.18, 0.95, -0.12));
    [[0.66, 0.62, 0.9, '#2d6a3e'], [0.54, 0.55, 1.28, '#357545'], [0.4, 0.5, 1.62, '#3f824f'], [0.24, 0.42, 1.92, '#4c925b']]
      .forEach(([r, h, y, c]) => g.add(cone(r, h, 8, c, 0, y, -0.12)));
    // 旁邊的小樹，襯出神木有多大
    g.add(cyl(0.05, 0.08, 0.35, 6, '#7a5236', -0.62, 0, -0.32), cone(0.26, 0.7, 7, '#3f7d4a', -0.62, 0.25, -0.32));
    g.add(cyl(0.05, 0.07, 0.3, 6, '#7a5236', 0.6, 0, -0.38), cone(0.22, 0.6, 7, '#4a8a55', 0.6, 0.22, -0.38));
    return g;
  },

  // 玉山：主峰加兩側較矮的山峰，山頂積雪，山腰一圈慢慢繞的雲海
  peak(anims) {
    const g = new THREE.Group();
    g.add(cyl(0.85, 1.05, 0.6, 7, '#7f858c', 0, -0.6, 0)); // 往地下延伸的山腳：放大後旁邊的格子比較低，也不會看到山浮在半空
    g.add(cone(0.85, 1.3, 7, '#8e949b'));
    g.add(cone(0.36, 0.56, 7, '#ffffff', 0, 0.74, 0));
    g.add(cone(0.55, 0.8, 6, '#9aa0a6', -0.62, 0, 0.18), cone(0.2, 0.3, 6, '#ffffff', -0.62, 0.5, 0.18));
    g.add(cone(0.5, 0.7, 6, '#a3a8ad', 0.6, 0, -0.22), cone(0.18, 0.26, 6, '#ffffff', 0.6, 0.44, -0.22));
    const clouds = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      clouds.add(ball(0.15 + (i % 2) * 0.05, '#ffffff', Math.cos(a) * 1.0, 0.4 + (i % 3) * 0.07, Math.sin(a) * 1.0));
    }
    anims.push({ obj: clouds, kind: 'turn', speed: 0.12 });
    g.add(clouds);
    g.userData.summit = { radius: 0.85, height: 1.3 }; // 主峰的大小：登山客沿著山坡爬到這個尖頂
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

  // DK 電影院：酒紅色外牆、會閃的跑馬燈招牌、正面的大銀幕和兩張海報
  cinema(anims) {
    const g = new THREE.Group();
    g.add(box(1.1, 0.7, 0.8, '#5e1520'));
    g.add(box(1.16, 0.06, 0.86, '#e9a23b', 0, 0.7, 0));
    // 正面的大銀幕
    g.add(box(0.7, 0.36, 0.02, '#1d1f24', 0, 0.26, 0.405));
    g.add(place(geo('cinemaScreen', () => new THREE.PlaneGeometry(0.62, 0.3)), glow('#bfe3f0', '#7fc1e3', 0.6), 0, 0.44, 0.418));
    // 海報
    g.add(box(0.14, 0.22, 0.02, '#E07A2E', -0.46, 0.1, 0.405), box(0.14, 0.22, 0.02, '#3F7FBF', 0.46, 0.1, 0.405));
    // 跑馬燈招牌：DK 招牌兩邊一圈燈泡，輪流亮
    g.add(box(0.8, 0.26, 0.06, WINE, 0, 0.76, 0.3));
    g.add(sign(0.36, 0.22, 0, 0.89, 0.335));
    for (let i = 0; i < 10; i++) {
      const bulb = place(geo('cinemaBulb', () => new THREE.SphereGeometry(0.025, 8, 6)), glow('#fff3c4', '#ffd36b', 0.9), -0.36 + i * 0.08, 0.78, 0.34);
      anims.push({ obj: bulb, kind: 'blink', phase: i % 2 });
      g.add(bulb);
    }
    // 屋頂的膠卷
    const reel = place(geo('cinemaReel', () => new THREE.CylinderGeometry(0.18, 0.18, 0.05, 14).rotateX(Math.PI / 2)), mat('#2b2b2b'), 0.3, 0.98, -0.1);
    anims.push({ obj: reel, kind: 'spin', speed: 1.2 });
    g.add(reel);
    return g;
  },

  // ---- 客服任務島的四座站和中央看板 ----

  // 物流港口：碼頭、黃色吊車、疊起來的貨櫃、靠港的貨輪
  port(anims) {
    const g = new THREE.Group();
    g.add(box(1.5, 0.08, 1.1, '#9aa3a8'));
    const colors = ['#c0392b', '#3F7FBF', '#e9a23b', '#3E9A6A', '#7A5BA6', '#E07A2E'];
    [[-0.45, 0, -0.25], [-0.45, 0.16, -0.25], [-0.1, 0, -0.25], [-0.45, 0, 0.05], [-0.1, 0, 0.05], [-0.1, 0.16, -0.25]].forEach(([x, y, z], i) => {
      g.add(box(0.32, 0.16, 0.18, colors[i % colors.length], x, 0.08 + y, z));
    });
    // 吊車
    g.add(box(0.06, 1.1, 0.06, '#f2b134', 0.35, 0.08, -0.35), box(0.06, 1.1, 0.06, '#f2b134', 0.55, 0.08, -0.35));
    g.add(box(0.06, 0.06, 1.2, '#f2b134', 0.45, 1.12, 0.1));
    g.add(box(0.26, 0.06, 0.08, '#f2b134', 0.45, 1.12, -0.35));
    g.add(cyl(0.006, 0.006, 0.55, 3, '#333333', 0.45, 0.58, 0.5));
    g.add(box(0.3, 0.14, 0.17, '#c0392b', 0.45, 0.44, 0.5));
    // 貨輪
    const ship = new THREE.Group();
    ship.add(box(1.3, 0.18, 0.36, '#2f4a6d'));
    ship.add(box(1.3, 0.04, 0.37, '#c0392b', 0, 0.02, 0));
    ship.add(box(0.26, 0.26, 0.28, '#ffffff', -0.45, 0.18, 0));
    ship.add(box(0.3, 0.14, 0.26, '#3F7FBF', 0.05, 0.18, 0), box(0.3, 0.14, 0.26, '#e9a23b', 0.4, 0.18, 0));
    ship.position.set(0.05, 0, 0.85);
    anims.push({ obj: ship, kind: 'bob', base: -0.02, phase: 0.3, amp: 0.03 });
    g.add(ship);
    return g;
  },

  // 退換貨中心：郵局風的建築、屋頂上的大紙箱、門口輸送帶上的箱子
  returnCenter(anims) {
    const g = new THREE.Group();
    g.add(box(1.0, 0.5, 0.66, '#fbf5ec'));
    g.add(prism(1.1, 0.26, 0.76, '#E07A2E', 0, 0.5, 0));
    g.add(box(0.3, 0.32, 0.02, '#5b3a2e', -0.2, 0, 0.335));
    g.add(box(0.26, 0.16, 0.02, '#bfe3f0', 0.25, 0.16, 0.335));
    // 屋頂的大紙箱（封著 DK 膠帶）
    g.add(box(0.42, 0.3, 0.36, '#c89a64', 0.05, 0.66, -0.05));
    g.add(box(0.43, 0.04, 0.08, WINE, 0.05, 0.94, -0.05));
    // 輸送帶和在上面跑的小箱子
    g.add(box(0.9, 0.06, 0.18, '#4a4f55', 0, 0.08, 0.52));
    for (let i = 0; i < 3; i++) {
      const parcel = box(0.14, 0.1, 0.12, '#c89a64', 0, 0.14, 0.52);
      anims.push({ obj: parcel, kind: 'belt', from: -0.38, to: 0.38, speed: 0.25, phase: i / 3 });
      g.add(parcel);
    }
    return g;
  },

  // 選鞋研究所：白色圓頂實驗室、彩色燒瓶、望遠鏡
  lab() {
    const g = new THREE.Group();
    g.add(cyl(0.5, 0.52, 0.32, 14, '#f4f6f8'));
    g.add(place(geo('labDome', () => new THREE.SphereGeometry(0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.32, 0)), mat('#e6edf2')));
    g.add(box(0.26, 0.26, 0.02, '#3E9A6A', 0, 0, 0.5));
    [['#7fd3a8', -0.62, 0.25], ['#f7a99a', -0.58, 0.48], ['#9cd0f2', 0.62, 0.35]].forEach(([c, x, z]) => {
      g.add(place(geo('flask', () => new THREE.SphereGeometry(0.12, 12, 8).translate(0, 0.12, 0)), glow(c, c, 0.25), x, 0, z));
      g.add(cyl(0.035, 0.035, 0.16, 8, '#e6edf2', x, 0.2, z));
    });
    const scope = cyl(0.04, 0.06, 0.5, 8, '#3a3f45', 0.18, 0.62, 0.05);
    scope.rotation.z = -0.7;
    g.add(scope);
    return g;
  },

  // 鞋子高度探索站：紅白刻度的高塔、塔頂觀景台
  heightTower() {
    const g = new THREE.Group();
    g.add(cyl(0.45, 0.5, 0.1, 10, '#d9d2c3'));
    for (let i = 0; i < 8; i++) g.add(cyl(0.16, 0.16, 0.2, 10, i % 2 ? '#ffffff' : '#7A5BA6', 0, 0.1 + i * 0.2, 0));
    g.add(cyl(0.34, 0.3, 0.1, 12, '#ffffff', 0, 1.7, 0));
    g.add(cyl(0.34, 0.34, 0.16, 12, '#bfe3f0', 0, 1.8, 0));
    g.add(cone(0.38, 0.26, 12, '#7A5BA6', 0, 1.96, 0));
    // 塔旁邊一把大尺
    g.add(box(0.08, 1.2, 0.03, '#f2b134', 0.4, 0.1, 0.25));
    for (let i = 0; i < 6; i++) g.add(box(0.1, 0.02, 0.035, '#3a3f45', 0.39, 0.25 + i * 0.18, 0.25));
    return g;
  },

  // 島中央的任務看板
  kiosk() {
    const g = new THREE.Group();
    g.add(cyl(0.55, 0.6, 0.08, 12, '#f3e7d2'));
    g.add(box(0.05, 0.9, 0.05, WINE, -0.3, 0.08, -0.2), box(0.05, 0.9, 0.05, WINE, 0.3, 0.08, -0.2));
    g.add(box(0.72, 0.46, 0.05, '#fffaf2', 0, 0.5, -0.2));
    g.add(box(0.8, 0.1, 0.08, WINE, 0, 0.96, -0.2));
    ['#3F7FBF', '#E07A2E', '#3E9A6A', '#7A5BA6'].forEach((c, i) => {
      g.add(box(0.14, 0.14, 0.02, c, -0.24 + i * 0.16, 0.66, -0.17));
    });
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

// 飛機拖的活動彩帶：布條會飄，而且會繞著飛行方向轉，盡量正對鏡頭讓字看得到
export function createBanner(text, color = WINE, textColor = '#ffffff') {
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d');
  const font = '900 92px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
  ctx.font = font;
  cv.width = Math.ceil(ctx.measureText(text).width + 180);
  cv.height = 170;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(0, 10, cv.width, 8);
  ctx.fillRect(0, cv.height - 18, cv.width, 8);
  ctx.font = font;
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cv.width / 2, cv.height / 2 + 4);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;

  const h = 1.7;
  const w = (h * cv.width) / cv.height;
  const geom = new THREE.PlaneGeometry(w, h, 24, 1);
  const base = geom.attributes.position.array.slice();
  const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  mesh.userData.length = w;

  const x = new THREE.Vector3();
  const y = new THREE.Vector3();
  const z = new THREE.Vector3();
  const basis = new THREE.Matrix4();

  // plane：拖彩帶的飛機；dir：飛行方向；camPos：鏡頭位置；rope：繩長
  function update(t, plane, dir, camPos, rope) {
    x.copy(dir).negate(); // 彩帶往飛機後面拖
    mesh.position.copy(plane.position).addScaledVector(x, rope + w / 2);
    z.copy(camPos).sub(mesh.position).normalize();
    z.addScaledVector(x, -z.dot(x));
    if (z.lengthSq() < 1e-4) z.set(0, 1, 0);
    z.normalize();
    y.crossVectors(z, x);
    let tailSign = 1;
    if (y.y < 0) { // 字不要倒過來：讓「上」永遠朝上
      x.negate();
      y.crossVectors(z, x);
      tailSign = -1;
    }
    mesh.quaternion.setFromRotationMatrix(basis.makeBasis(x, y, z));
    // 布條波浪：越靠尾巴飄得越大
    const pos = geom.attributes.position.array;
    for (let i = 0; i < pos.length; i += 3) {
      const lx = base[i];
      const tail = (lx / w + 0.5) * tailSign + (tailSign < 0 ? 1 : 0);
      pos[i + 2] = Math.sin(lx * 1.3 - t * 7) * 0.28 * tail;
    }
    geom.attributes.position.needsUpdate = true;
  }

  return { mesh, update, length: w };
}

// 領優惠券專用的金色氣球人：比一般氣球人大很多，手上拿著優惠券，身邊有閃光繞著轉
export function createCouponMascot() {
  const anims = [];
  const g = new THREE.Group();
  const body = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: '#f6c343', roughness: 0.3, metalness: 0.25 });
  body.add(place(geo('cmBody', () => new THREE.CapsuleGeometry(0.1, 0.08, 4, 16).translate(0, 0.14, 0)), gold));
  body.add(place(geo('cmHead', () => new THREE.SphereGeometry(0.1, 24, 16).translate(0, 0.37, 0)), gold));
  for (const side of [-1, 1]) {
    const arm = place(geo('cmArm', () => new THREE.CapsuleGeometry(0.03, 0.08, 3, 8)), gold, side * 0.11, 0.2, 0.04);
    arm.rotation.z = side * 0.9;
    arm.rotation.x = -0.6;
    body.add(arm);
  }
  // 斜背的酒紅色彩帶
  const sash = place(geo('cmSash', () => new THREE.TorusGeometry(0.105, 0.012, 6, 24)), WINE, 0, 0.17, 0);
  sash.rotation.set(Math.PI / 2, 0.55, 0);
  body.add(sash);
  // 手上的大票券
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 150;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff8ec';
  ctx.fillRect(0, 0, 256, 150);
  ctx.setLineDash([10, 8]);
  ctx.strokeStyle = WINE;
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, 236, 130);
  ctx.fillStyle = WINE;
  ctx.textAlign = 'center';
  ctx.font = '700 26px Georgia, serif';
  ctx.fillText('COUPON', 128, 52);
  ctx.font = '900 50px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
  ctx.fillText('優惠券', 128, 112);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const ticket = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.15, 0.012), [
    mat('#fff8ec'), mat('#fff8ec'), mat('#fff8ec'), mat('#fff8ec'),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }), mat('#fff8ec'),
  ]);
  ticket.position.set(0, 0.2, 0.15);
  ticket.rotation.x = -0.15;
  body.add(ticket);
  body.scale.setScalar(14); // 比一般氣球人大很多，全景也看得到
  g.add(body);

  // 閃光
  const sparkle = glow('#fff6c8', '#ffd36b', 1);
  for (let i = 0; i < 5; i++) {
    const s = place(geo('spark', () => new THREE.OctahedronGeometry(0.16, 0)), sparkle);
    s.castShadow = false;
    s.scale.setScalar(1.5);
    anims.push({ obj: s, kind: 'orbit', radius: 3.0 + (i % 2) * 0.6, height: 1.5 + i * 0.9, speed: 0.8 + i * 0.1, phase: (i * Math.PI * 2) / 5 });
    g.add(s);
  }
  anims.push({ obj: body, kind: 'sway', speed: 0.6, amp: 0.35 });
  return { group: g, anims };
}

// 客服任務島的客服小氣球：比一般氣球人大一點，戴耳機麥克風、穿紫色 polo
export function createServiceNpc() {
  const anims = [];
  const g = new THREE.Group();
  const body = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: '#9cd0f2', roughness: 0.45 });
  const polo = new THREE.MeshStandardMaterial({ color: '#501f7f', roughness: 0.7 });
  body.add(place(geo('npcBody', () => new THREE.CapsuleGeometry(0.1, 0.08, 3, 12).translate(0, 0.14, 0)), skin));
  body.add(place(geo('npcHead', () => new THREE.SphereGeometry(0.1, 16, 12).translate(0, 0.37, 0)), skin));
  body.add(place(geo('npcShirt', () => new THREE.CylinderGeometry(0.104, 0.11, 0.15, 14).translate(0, 0.145, 0)), polo));
  // 耳機：頭頂一圈＋兩邊耳罩＋麥克風
  const band = place(geo('npcBand', () => new THREE.TorusGeometry(0.105, 0.012, 6, 18, Math.PI)), '#2b2b2b', 0, 0.37, 0);
  body.add(band);
  for (const side of [-1, 1]) body.add(place(geo('npcCup', () => new THREE.CylinderGeometry(0.035, 0.035, 0.03, 10).rotateZ(Math.PI / 2)), mat('#2b2b2b'), side * 0.1, 0.37, 0));
  const mic = cyl(0.006, 0.006, 0.1, 4, '#2b2b2b', 0.09, 0.3, 0.04);
  mic.rotation.set(0.9, 0, 0.6);
  body.add(mic);
  body.add(ball(0.014, '#2b2b2b', 0.06, 0.31, 0.1, 0));
  body.scale.setScalar(2.2);
  anims.push({ obj: body, kind: 'bob', base: 0, phase: 0.8, amp: 0.04 });
  g.add(body);
  return { group: g, anims };
}

// 中央山脈上爬山的氣球人：登山帽、酒紅色背包、登山杖、DK 鞋；沿 +z 方向走
export function createHiker(color) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color, roughness: 0.45 });
  body.add(place(geo('hikerBody', () => new THREE.CapsuleGeometry(0.1, 0.08, 3, 12).translate(0, 0.19, 0)), skin));
  body.add(place(geo('hikerHead', () => new THREE.SphereGeometry(0.1, 16, 12).translate(0, 0.42, 0)), skin));
  body.add(box(0.15, 0.17, 0.09, WINE, 0, 0.12, -0.13));
  body.add(box(0.15, 0.03, 0.09, '#f2b134', 0, 0.25, -0.13));
  body.add(cyl(0.13, 0.13, 0.012, 14, '#e9a23b', 0, 0.48, 0));
  body.add(cyl(0.07, 0.085, 0.07, 12, '#e9a23b', 0, 0.48, 0));
  const stick = cyl(0.007, 0.007, 0.42, 4, '#7a5236', 0.14, 0, 0.08);
  stick.rotation.x = 0.25;
  body.add(stick);
  for (const x of [-0.055, 0.055]) {
    body.add(box(0.08, 0.025, 0.15, '#fbfaf6', x, 0, 0.02));
    body.add(box(0.075, 0.04, 0.1, '#2e2b2a', x, 0.025, 0));
  }
  body.scale.setScalar(1.6);
  g.add(body);
  g.userData.body = body;
  return g;
}

// DK 物流車：酒紅色貨箱兩側掛 DK 招牌、白色車頭，沿 +z 方向開
// 萬聖節的幽靈物流車：半透明、發著綠光、沒有輪子飄在路上，車頂載一顆大南瓜燈，車尾拖著光點
const GHOST = new THREE.MeshStandardMaterial({ color: '#eafff5', emissive: '#7dffc8', emissiveIntensity: 0.45, transparent: true, opacity: 0.62, roughness: 0.4, depthWrite: false });
const GHOST_EYE = glow('#b9ffdf', '#5dff9e', 1.2);
const PUMPKIN = glow('#f08a24', '#ff7a00', 0.35);
function ghostTruck() {
  const g = new THREE.Group();
  g.add(box(0.36, 0.3, 0.6, GHOST, 0, 0.1, -0.08));
  for (const side of [-1, 1]) {
    const s = sign(0.32, 0.2, side * 0.182, 0.26, -0.08);
    s.rotation.y = side * Math.PI / 2;
    g.add(s);
  }
  g.add(box(0.34, 0.22, 0.2, GHOST, 0, 0.1, 0.32));
  for (const x of [-0.1, 0.1]) g.add(ball(0.035, GHOST_EYE, x, 0.2, 0.425)); // 兩顆綠色車燈像眼睛
  // 車頂載一顆南瓜燈：橘色南瓜、綠色蒂頭、會發光的眼睛和笑臉，跟著車子搖來搖去
  const rider = new THREE.Group();
  const body = ball(0.16, PUMPKIN, 0, 0.13, 0, 2);
  body.scale.set(1.15, 0.85, 1.05);
  rider.add(body, cyl(0.016, 0.022, 0.08, 5, '#4d7a35', 0, 0.25, 0));
  for (const x of [-0.06, 0.06]) rider.add(ball(0.026, GHOST_EYE, x, 0.16, 0.15, 0));
  rider.add(box(0.12, 0.022, 0.02, GHOST_EYE, 0, 0.08, 0.15));
  rider.position.set(0, 0.4, -0.12);
  g.add(rider);
  g.userData.rider = rider;
  // 車尾拖著三團光點，越後面越小
  [0.06, 0.045, 0.03].forEach((r, i) => g.add(ball(r, GHOST, 0, 0.12 + i * 0.03, -0.46 - i * 0.12, 1)));
  g.userData.ghost = true;
  g.scale.setScalar(1.6);
  return g;
}

/** style 是 'ghost' 時是萬聖節的幽靈車 */
export function createDeliveryTruck(style = null) {
  if (style === 'ghost') return ghostTruck();
  const g = new THREE.Group();
  g.add(box(0.36, 0.3, 0.6, WINE, 0, 0.1, -0.08));
  for (const side of [-1, 1]) {
    const s = sign(0.32, 0.2, side * 0.182, 0.26, -0.08);
    s.rotation.y = side * Math.PI / 2;
    g.add(s);
  }
  g.add(box(0.34, 0.22, 0.2, '#fbf5ec', 0, 0.1, 0.32));
  g.add(box(0.3, 0.1, 0.02, '#bfe3f0', 0, 0.2, 0.42));
  for (const [x, z] of [[-0.17, -0.25], [0.17, -0.25], [-0.17, 0.3], [0.17, 0.3]]) {
    const w = cyl(0.06, 0.06, 0.04, 10, '#2b2b2b', x, 0.06, z);
    w.rotation.z = Math.PI / 2;
    w.position.y = 0.06;
    g.add(w);
  }
  g.scale.setScalar(1.6);
  return g;
}

// 山頂的小旗子
export function createSummitFlag(color = WINE) {
  const g = new THREE.Group();
  g.add(cyl(0.015, 0.015, 0.7, 5, '#e6e6e6'));
  g.add(box(0.26, 0.16, 0.01, color, 0.13, 0.52, 0));
  return g;
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
