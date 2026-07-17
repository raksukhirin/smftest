/* ============================================================================
 * frmSFContainerPlan — 3D Viewer (Three.js, ES module)
 * ----------------------------------------------------------------------------
 * - กล่องทึบจริง (ไม่ใช่ wireframe แบนแบบ demo Python เดิม)
 * - InstancedMesh ต่อ SKU → เรนเดอร์ 600+ กล่องลื่น
 * - OrbitControls: หมุน/ซูม/แพน · คลิกกล่องเพื่อดูรายละเอียด
 * - สไลเดอร์ "ตัดชั้น" (maxZ) เพื่อมองทะลุเข้าไปข้างใน
 *
 * แกน: three(X)=ยาว(L) · three(Y)=สูง(H) · three(Z)=กว้าง(W) — หน่วยเมตร (mm/1000)
 * export: window.CTNView3D  แล้วยิง event 'ctn3d-ready' (app.js รอฟัง)
 * ==========================================================================*/
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const S = 1000;                 // mm → m
const GAP = 8;                  // ย่อกล่องด้านละ (mm) ให้เห็นรอยต่อ

let renderer, scene, camera, controls, host;
let meshes = [];                // InstancedMesh[] (ต่อ SKU)
let boxRef = [];                // [{mesh, boxes:[]}] map instanceId → box
let raycaster, pointer, onPick = null;
let curResult = null, curMaxZ = Infinity;

function init(el) {
  host = el;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf1f5f9);

  const w = el.clientWidth || 800, h = el.clientHeight || 420;
  camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 200);
  camera.position.set(9, 6, 9);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  el.innerHTML = '';
  el.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const dir = new THREE.DirectionalLight(0xffffff, 0.85);
  dir.position.set(8, 14, 6); scene.add(dir);
  const dir2 = new THREE.DirectionalLight(0xffffff, 0.3);
  dir2.position.set(-6, 5, -8); scene.add(dir2);

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  renderer.domElement.addEventListener('click', handleClick);

  new ResizeObserver(() => {
    if (!host.clientWidth) return;
    camera.aspect = host.clientWidth / host.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(host.clientWidth, host.clientHeight);
  }).observe(host);

  (function loop() { requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); })();
}

function clearScene() {
  for (const m of meshes) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
  meshes = []; boxRef = [];
  // ลบ helper เดิม (เก็บเฉพาะไฟ)
  [...scene.children].forEach((o) => { if (o.userData.helper) scene.remove(o); });
}

// ---- วาดโครงตู้ + โซนประตู ----------------------------------------------
function addContainer(r) {
  const { L, W, H } = r.container;
  const g = new THREE.BoxGeometry(L / S, H / S, W / S);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(g),
    new THREE.LineBasicMaterial({ color: 0x334155, linewidth: 2 })
  );
  edges.position.set(L / S / 2, H / S / 2, W / S / 2);
  edges.userData.helper = true; scene.add(edges);
  g.dispose();

  // พื้น
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(L / S, W / S),
    new THREE.MeshBasicMaterial({ color: 0xe2e8f0, side: THREE.DoubleSide })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(L / S / 2, 0, W / S / 2);
  floor.userData.helper = true; scene.add(floor);

  // โซนประตู
  const dz = r.cfg.doorZoneMm;
  if (dz > 0) {
    const dm = new THREE.Mesh(
      new THREE.PlaneGeometry(dz / S, W / S),
      new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.16, side: THREE.DoubleSide })
    );
    dm.rotation.x = -Math.PI / 2;
    const dx = r.cfg.doorAt === 'FRONT' ? dz / S / 2 : (L - dz / 2) / S;
    dm.position.set(dx, 0.002, W / S / 2);
    dm.userData.helper = true; scene.add(dm);
  }
}

// ---- วาดกล่อง (InstancedMesh ต่อ SKU) -----------------------------------
function addBoxes(r, maxZ) {
  const bySku = {};
  for (const b of r.boxes) {
    if (b.z > maxZ) continue;                    // ตัดชั้น
    (bySku[b.sku] = bySku[b.sku] || []).push(b);
  }
  const unit = new THREE.BoxGeometry(1, 1, 1);
  for (const sku of Object.keys(bySku)) {
    const list = bySku[sku];
    const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(list[0].color) });
    const im = new THREE.InstancedMesh(unit.clone(), mat, list.length);
    const m = new THREE.Matrix4();
    list.forEach((b, i) => {
      const sx = Math.max(b.l - GAP, 1) / S, sy = Math.max(b.h - GAP, 1) / S, sz = Math.max(b.w - GAP, 1) / S;
      m.makeScale(sx, sy, sz);
      m.setPosition((b.x + b.l / 2) / S, (b.z + b.h / 2) / S, (b.y + b.w / 2) / S);
      im.setMatrixAt(i, m);
    });
    im.instanceMatrix.needsUpdate = true;
    scene.add(im); meshes.push(im);
    boxRef.push({ mesh: im, boxes: list });
  }
  unit.dispose();
}

function handleClick(e) {
  if (!onPick) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(meshes, false);
  if (!hits.length) { onPick(null); return; }
  const h = hits[0];
  const ref = boxRef.find((x) => x.mesh === h.object);
  onPick(ref ? ref.boxes[h.instanceId] : null);
}

// ---- public API ---------------------------------------------------------
function render(result, opts) {
  opts = opts || {};
  curResult = result;
  curMaxZ = opts.maxZ != null ? opts.maxZ : Infinity;
  clearScene();
  addContainer(result);
  addBoxes(result, curMaxZ);
  if (opts.resetView !== false) resetView();
}

function setMaxZ(z) { if (curResult) { clearScene(); addContainer(curResult); addBoxes(curResult, z); curMaxZ = z; } }

function resetView() {
  if (!curResult) return;
  const { L, W, H } = curResult.container;
  controls.target.set(L / S / 2, H / S / 2, W / S / 2);
  const d = Math.max(L, W) / S;
  camera.position.set(L / S / 2 + d * 0.55, H / S + d * 0.42, W / S / 2 + d * 0.75);
  controls.update();
}

function setPickHandler(fn) { onPick = fn; }

window.CTNView3D = { init, render, setMaxZ, resetView, setPickHandler };
window.dispatchEvent(new Event('ctn3d-ready'));
