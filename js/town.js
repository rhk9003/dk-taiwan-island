import * as THREE from 'three';
import { rng } from './util.js';

// 門市周圍的商圈：外圈的店面／房子、街道上的夜市小攤和路燈。全部用 InstancedMesh，數量多也不卡
const WALLS = ['#f6efe3', '#fde2c8', '#d9ecf2', '#f3d9e2', '#e3f0d6', '#fff1c4', '#e9e4f5'];
const ROOFS = ['#c9583e', '#4f7fae', '#5f9a68', '#8a6a9e', '#d08a3a', '#7b6e66'];
const AWNINGS = ['#e0673a', '#3f7fbf', '#3e9a6a', '#c8452f', '#e9a23b', '#8b2332', '#e86f8a'];
const GLASS = '#a9d3e3';
// 六角格的六個角（街上的路只走格子中心連到邊的中點，攤子和路燈放在角落就不會擋路）
const CORNERS = [0, 1, 2, 3, 4, 5].map((k) => Math.PI / 6 + (k * Math.PI) / 3);
// 都市感：北部的樓蓋高一點
const CITY = { north: 1.7, central: 1.3, kaoping: 1.3, taozhumiao: 1.15 };

export function buildTown(tiles) {
  const houses = [];
  const stalls = [];
  const lamps = [];

  for (const t of tiles) {
    if (t.houses) {
      const rand = rng(`house-${t.q},${t.r}`);
      const pick = (list) => list[Math.floor(rand() * list.length)];
      const city = CITY[t.regionId] ?? 1;
      const dir = rand() * Math.PI;
      for (let i = 0; i < t.houses; i++) {
        const off = t.houses === 2 ? (i ? 0.3 : -0.3) : 0;
        const tall = rand() < 0.3 * city;
        houses.push({
          x: t.x + Math.cos(dir) * off,
          z: t.z + Math.sin(dir) * off,
          y: t.h,
          w: t.houses === 2 ? 0.4 + rand() * 0.1 : 0.55 + rand() * 0.2,
          d: 0.42 + rand() * 0.18,
          h: tall ? (0.7 + rand() * 0.6) * city : 0.32 + rand() * 0.3,
          rot: (rand() - 0.5) * 0.4,
          tall,
          wall: pick(WALLS),
          roof: pick(ROOFS),
          awning: pick(AWNINGS),
        });
      }
    }
    if (t.street) {
      const rand = rng(`street-${t.q},${t.r}`);
      const first = Math.floor(rand() * 6);
      const corner = (k, r) => {
        const a = CORNERS[(first + k) % 6];
        return { x: t.x + Math.cos(a) * r, z: t.z + Math.sin(a) * r, y: t.h, a };
      };
      if (rand() < 0.4) {
        const c = corner(0, 0.68);
        // 攤子正面朝向格子中心（街道）
        stalls.push({ ...c, rot: Math.atan2(t.x - c.x, t.z - c.z), color: AWNINGS[Math.floor(rand() * AWNINGS.length)] });
      }
      if (rand() < 0.45) lamps.push(corner(3, 0.8));
    }
  }

  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true });
  const P = new THREE.Vector3();
  const Q = new THREE.Quaternion();
  const S = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  const add = (geo, list, place, color, mat = material) => {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    list.forEach((item, i) => {
      place(m, item);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.set(color(item)));
    });
    group.add(mesh);
  };
  const local = (item, x, y, z) => P.set(x, y, z).applyAxisAngle(UP, item.rot).add(new THREE.Vector3(item.x, item.y, item.z));

  const unitBox = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, 0);
  shape.lineTo(0.5, 0);
  shape.lineTo(0, 1);
  shape.closePath();
  const unitPrism = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5);

  // 店面和房子
  add(unitBox, houses, (m, it) => {
    m.compose(P.set(it.x, it.y, it.z), Q.setFromAxisAngle(UP, it.rot), S.set(it.w, it.h, it.d));
  }, (it) => it.wall);

  const windows = houses.flatMap((it) => (it.tall ? [0.35, 0.6, 0.85] : [0.62]).map((f) => ({ ...it, f })));
  add(unitBox, windows, (m, it) => {
    m.compose(P.set(it.x, it.y + it.h * it.f, it.z), Q.setFromAxisAngle(UP, it.rot), S.set(it.w + 0.012, 0.07, it.d + 0.012));
  }, () => GLASS);

  add(unitBox, houses.filter((it) => it.tall), (m, it) => {
    m.compose(P.set(it.x, it.y + it.h, it.z), Q.setFromAxisAngle(UP, it.rot), S.set(it.w + 0.05, 0.05, it.d + 0.05));
  }, (it) => it.roof);

  add(unitPrism, houses.filter((it) => !it.tall), (m, it) => {
    m.compose(P.set(it.x, it.y + it.h, it.z), Q.setFromAxisAngle(UP, it.rot), S.set(it.w + 0.08, 0.22, it.d + 0.08));
  }, (it) => it.roof);

  // 一樓店面的遮雨棚
  add(unitBox, houses, (m, it) => {
    m.compose(local(it, 0, Math.min(0.24, it.h * 0.5), it.d / 2 + 0.07), Q.setFromAxisAngle(UP, it.rot), S.set(it.w * 0.85, 0.035, 0.16));
  }, (it) => it.awning);

  // 夜市小攤：木頭攤車＋彩色棚子
  add(unitBox, stalls, (m, it) => {
    m.compose(P.set(it.x, it.y, it.z), Q.setFromAxisAngle(UP, it.rot), S.set(0.26, 0.16, 0.18));
  }, () => '#c79a6a');
  const posts = stalls.flatMap((it) => [-0.11, 0.11].map((x) => ({ ...it, px: x })));
  add(unitBox, posts, (m, it) => {
    m.compose(local(it, it.px, 0, 0.08), Q.setFromAxisAngle(UP, it.rot), S.set(0.02, 0.32, 0.02));
  }, () => '#7a5236');
  add(unitBox, stalls, (m, it) => {
    m.compose(local(it, 0, 0.32, 0.02), Q.setFromAxisAngle(UP, it.rot), S.set(0.32, 0.03, 0.26));
  }, (it) => it.color);

  // 路燈
  add(new THREE.CylinderGeometry(0.018, 0.024, 1, 5).translate(0, 0.5, 0), lamps, (m, it) => {
    m.compose(P.set(it.x, it.y, it.z), Q.identity(), S.set(1, 0.62, 1));
  }, () => '#4a4a52');
  const bulb = new THREE.MeshStandardMaterial({ roughness: 0.4, emissive: '#ffcf6b', emissiveIntensity: 0.55 });
  add(new THREE.IcosahedronGeometry(0.055, 1), lamps, (m, it) => {
    m.compose(P.set(it.x, it.y + 0.66, it.z), Q.identity(), S.setScalar(1));
  }, () => '#fff0c2', bulb);

  return group;
}
