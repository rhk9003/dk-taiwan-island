import * as THREE from 'three';
import { mat, MASCOT, SHOE_FALLBACK } from './buildings.js';
import { rng } from './util.js';

// 島上的 DKEC 氣球人：門口站著呼吸的店長（greeters），和在商圈街道上逛街的路人（walkers）。
// 每個人腳上都穿一雙 DK 空氣鞋；全部共用同一組 InstancedMesh。島民角色（residents.js）也用這裡的身體和走路方式。
const SIZE = 0.9;
const SHOE = 1.4; // 鞋子刻意做大一點（卡通比例），遠看也認得出是鞋
export const LIFT = 0.075 * SHOE; // 身體踩在鞋子上
const WALKER_SHOES = [...SHOE_FALLBACK, '#9a86c6', '#5b80b8', '#f1b6c4'];
const POLO = '#501f7f'; // 店員制服的紫色 polo 衫

const UP = new THREE.Vector3(0, 1, 0);

/** n 個氣球人的身體、頭和一雙 DK 鞋（共用 InstancedMesh） */
export function createFigures(n) {
  const size = Math.max(n, 1);
  const material = new THREE.MeshStandardMaterial({ roughness: 0.45 });
  const bodies = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.1, 0.08, 3, 10).translate(0, 0.14 + LIFT, 0), material, size);
  const heads = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.1, 2).translate(0, 0.37 + LIFT, 0), material, size);
  // 一隻鞋 = 深色大底 + 白色氣墊中底 + 鞋面 + 鞋頭
  const shoeMat = new THREE.MeshStandardMaterial({ roughness: 0.6, flatShading: true });
  const parts = [
    [new THREE.BoxGeometry(0.09, 0.016, 0.18).translate(0, 0.008, 0.03), mat('#7d746b')],
    [new THREE.BoxGeometry(0.086, 0.032, 0.172).translate(0, 0.032, 0.03), mat('#fbfaf6')],
    [new THREE.BoxGeometry(0.078, 0.05, 0.09).translate(0, 0.073, -0.01), shoeMat],
    [new THREE.IcosahedronGeometry(0.042, 1).scale(0.92, 0.72, 1.15).translate(0, 0.055, 0.06), shoeMat],
  ].map(([g, m]) => new THREE.InstancedMesh(g.scale(SHOE, SHOE, SHOE), m, 2 * size));
  bodies.count = heads.count = n;
  for (const mesh of parts) mesh.count = 2 * n;
  const meshes = [bodies, heads, ...parts];
  for (const mesh of meshes) mesh.castShadow = true;

  const c = new THREE.Color();
  const fig = new THREE.Matrix4();
  const feet = new THREE.Matrix4();
  const foot = new THREE.Matrix4();
  const out = new THREE.Matrix4();
  const P = new THREE.Vector3();
  const Q = new THREE.Quaternion();
  const S = new THREE.Vector3();

  return {
    meshes,
    setColor(i, color) {
      bodies.setColorAt(i, c.set(color));
      heads.setColorAt(i, c);
    },
    setShoe(i, color) {
      c.set(color);
      for (const k of [i * 2, i * 2 + 1]) {
        parts[2].setColorAt(k, c);
        parts[3].setColorAt(k, c);
      }
      parts[2].instanceColor.needsUpdate = true;
      parts[3].instanceColor.needsUpdate = true;
    },
    // 擺好第 i 個人：身體會呼吸，走路時兩隻腳一前一後（往前的那隻稍微抬起來）。回傳身體的矩陣，上衣、帽子這些配件跟著它
    pose(i, p, t, swing = 0, bob = 0) {
      const b = Math.sin(t * 2.2 + p.phase);
      Q.setFromAxisAngle(UP, p.rot);
      fig.compose(P.set(p.x, p.y + bob, p.z), Q, S.set(SIZE * (1 + 0.05 * b), SIZE * (1 + 0.025 * b), SIZE * (1 + 0.05 * b)));
      bodies.setMatrixAt(i, fig);
      heads.setMatrixAt(i, fig);
      feet.compose(P.set(p.x, p.y, p.z), Q, S.setScalar(SIZE));
      [-1, 1].forEach((side, j) => {
        const stride = side * swing * 0.05;
        foot.makeRotationY(side * 0.12).setPosition(side * 0.06 * SHOE, Math.max(0, stride) * 0.5, stride);
        out.multiplyMatrices(feet, foot);
        for (const mesh of parts) mesh.setMatrixAt(i * 2 + j, out);
      });
      return fig;
    },
    commit() {
      for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

/** 跟著身體走的配件（上衣、帽子…）：同一個造型 n 份 */
export function createWearable(geometry, material, n) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(n, 1));
  mesh.count = n;
  mesh.castShadow = true;
  return mesh;
}

/** 在街道（格子之間的連線）上走一步；p.walk = { from, to, k, speed, ox, oz, step } */
export function stepWalker(p, dt) {
  const w = p.walk;
  let dx = w.to.x - w.from.x;
  let dz = w.to.z - w.from.z;
  w.k += (w.speed * dt) / (Math.hypot(dx, dz) || 1);
  if (w.k >= 1) {
    w.k -= 1;
    const options = w.to.links.filter((t) => t !== w.from);
    const next = options.length ? options[Math.floor(Math.random() * options.length)] : w.from;
    w.from = w.to;
    w.to = next;
    dx = w.to.x - w.from.x;
    dz = w.to.z - w.from.z;
  }
  p.x = w.from.x + dx * w.k + w.ox;
  p.y = w.from.h + (w.to.h - w.from.h) * w.k;
  p.z = w.from.z + dz * w.k + w.oz;
  turnToward(p, dx, dz, dt);
  w.step += dt * w.speed * 16;
}

// 轉身轉得順一點，不要瞬間轉向
export function turnToward(p, dx, dz, dt) {
  if (!dx && !dz) return;
  const target = Math.atan2(dx, dz);
  const diff = Math.atan2(Math.sin(target - p.rot), Math.cos(target - p.rot));
  p.rot += diff * Math.min(1, dt * 8);
}

export function createPeople(greeters, streets) {
  const rand = rng('walkers');
  const walkable = streets.filter((t) => t.links.length);
  const people = greeters.map((g) => ({ ...g }));
  const count = Math.min(240, Math.round(walkable.length / 2.2));
  for (let i = 0; i < count; i++) {
    const from = walkable[Math.floor(rand() * walkable.length)];
    const to = from.links[Math.floor(rand() * from.links.length)];
    people.push({
      x: from.x,
      y: from.h,
      z: from.z,
      rot: 0,
      color: MASCOT[i % 4],
      shoe: WALKER_SHOES[Math.floor(rand() * WALKER_SHOES.length)],
      phase: rand() * 6,
      walk: {
        from,
        to,
        k: rand(),
        speed: 0.4 + rand() * 0.35,
        ox: (rand() - 0.5) * 0.24, // 每個人走在路的不同位置，不會疊在一起
        oz: (rand() - 0.5) * 0.24,
        step: rand() * 6,
      },
    });
  }

  const figures = createFigures(people.length);
  people.forEach((p, i) => {
    figures.setColor(i, p.color);
    figures.setShoe(i, p.shoe);
  });

  // 門口的店員穿紫色 polo 衫（DK 制服）：上衣、polo 領、白色門襟，跟著身體一起呼吸
  const staff = people.map((p, i) => (p.staff ? i : -1)).filter((i) => i >= 0);
  const polo = new THREE.MeshStandardMaterial({ color: POLO, roughness: 0.7 });
  const uniform = [
    [new THREE.CylinderGeometry(0.104, 0.11, 0.15, 14).translate(0, LIFT + 0.145, 0), polo],
    [new THREE.TorusGeometry(0.074, 0.018, 6, 14).rotateX(Math.PI / 2).translate(0, LIFT + 0.225, 0), polo],
    [new THREE.BoxGeometry(0.016, 0.065, 0.008).translate(0, LIFT + 0.18, 0.107), mat('#f4eefa')],
  ].map(([g, m]) => createWearable(g, m, staff.length));
  const staffSlot = new Map(staff.map((pi, k) => [pi, k]));

  const group = new THREE.Group();
  group.add(...figures.meshes, ...uniform);

  function update(t, dt) {
    people.forEach((p, i) => {
      let swing = 0;
      if (p.walk) {
        stepWalker(p, dt);
        swing = Math.sin(p.walk.step);
      }
      const body = figures.pose(i, p, t, swing, Math.abs(swing) * 0.035);
      const k = staffSlot.get(i);
      if (k !== undefined) for (const mesh of uniform) mesh.setMatrixAt(k, body);
    });
    figures.commit();
    for (const mesh of uniform) mesh.instanceMatrix.needsUpdate = true;
  }

  // 店長換了推薦鞋，第 i 個人（門口的店長）就換鞋色
  return { group, update, setShoe: (i, color) => figures.setShoe(i, color) };
}
