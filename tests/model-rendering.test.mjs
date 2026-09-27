import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { createCampusModel, styleBuildingSelection } from '../lib/model.ts';
function model(campus) {
  const data = JSON.parse(fs.readFileSync(`public/data/${campus}/campus.json`));
  const terrain = JSON.parse(
    fs.readFileSync(`public/data/${campus}/terrain.json`),
  );
  const model = createCampusModel(data, terrain);
  model.root.updateMatrixWorld(true);
  return { ...model, data, terrain };
}
function dispose(model) {
  model.root.traverse((o) => {
    o.geometry?.dispose();
    if (o.material)
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
        m.dispose(),
      );
  });
}
function meshes(group) {
  return group.children.filter((c) => c instanceof THREE.Mesh);
}
test('Central City retains a narrow tall tower and lower podium in rendering and export', () => {
  const m = model('surrey'),
    group = m.buildings.children.find((g) => g.userData.id === 'sfu-71');
  const tower = meshes(group).find(
    (g) => g.name === 'Central City office tower',
  );
  assert(tower);
  const bounds = new THREE.Box3().setFromObject(tower),
    size = bounds.getSize(new THREE.Vector3());
  assert(Math.abs(size.y - 111.27) < 0.001);
  assert(
    size.x < 50 && size.z < 80,
    'Tower must not extrude the whole campus footprint',
  );
  const podium = meshes(group).find((g) => g.name === 'Central City podium');
  assert(podium);
  assert(
    Math.abs(
      new THREE.Box3().setFromObject(podium).getSize(new THREE.Vector3()).y -
        32.82,
    ) < 0.001,
  );
  const ray = new THREE.Raycaster(
    new THREE.Vector3(-221, 250, -568),
    new THREE.Vector3(0, -1, 0),
  );
  assert.equal(
    ray
      .intersectObject(group, true)
      .filter((h) => h.object instanceof THREE.Mesh)[0].object,
    tower,
  );
  const context = m.data.buildings.find((b) => b.id === 'surrey-1665');
  assert(
    context.heightM < 40,
    'The broad north podium must not use the tower height',
  );
  const glb = fs.readFileSync('public/data/surrey/sfu-surrey.glb');
  const doc = JSON.parse(glb.toString('utf8', 20, 20 + glb.readUInt32LE(12)));
  assert(
    doc.nodes.some(
      (n) =>
        n.name === 'Central City office tower' && n.extras?.heightM === 111.27,
    ),
  );
  dispose(m);
});
test('multi-part selection highlights every section and restores previous selection without disabling depth', () => {
  const m = model('surrey'),
    id = 'sfu-71',
    group = m.buildings.children.find((g) => g.userData.id === id);
  styleBuildingSelection(m.buildings, id, true);
  for (const mesh of meshes(group)) {
    assert.equal(mesh.userData.id, id);
    assert.equal(mesh.material.color.getHexString(), 'ea534e');
    assert(mesh.material.polygonOffset);
    assert(mesh.material.depthTest);
    assert(mesh.material.depthWrite);
  }
  styleBuildingSelection(m.buildings, 'sfu-78', false);
  for (const mesh of meshes(group)) {
    assert.equal(mesh.material.color.getHexString(), 'c8ddd9');
    assert(!mesh.material.polygonOffset);
  }
  assert(group.visible);
  assert(
    m.buildings.children
      .filter((g) => g.userData.source !== 'sfu')
      .every((g) => !g.visible),
  );
  dispose(m);
});
test('Surrey plaza stays above the actual terrain triangles across its full surface', () => {
  const m = model('surrey'),
    group = m.buildings.children.find((g) => g.userData.id === 'sfu-72'),
    mesh = meshes(group)[0];
  const p = mesh.geometry.attributes.position,
    n = mesh.geometry.attributes.normal;
  assert(p.count > 6);
  const ray = new THREE.Raycaster();
  for (let i = 0; i < p.count; i += 3) {
    const center = new THREE.Vector3();
    for (let j = 0; j < 3; j++)
      center.add(new THREE.Vector3().fromBufferAttribute(p, i + j));
    center.divideScalar(3);
    ray.set(
      center.clone().add(new THREE.Vector3(0, 10, 0)),
      new THREE.Vector3(0, -1, 0),
    );
    const land = ray.intersectObject(m.land)[0];
    assert(land);
    const clearance = center.y - land.point.y;
    assert(
      clearance > 0.19 && clearance < 0.21,
      `Plaza clearance ${clearance}`,
    );
    assert(n.getY(i) > 0);
  }
  dispose(m);
});
test('Harbour Centre base does not cover or duplicate the separate tower selection', () => {
  const m = model('vancouver'),
    base = m.buildings.children.find((g) => g.userData.id === 'sfu-65'),
    tower = m.buildings.children.find((g) => g.userData.id === 'sfu-77');
  const building = m.data.buildings.find((b) => b.id === 'sfu-77'),
    center = new THREE.Vector3(...building.center);
  center.y = 400;
  const ray = new THREE.Raycaster(center, new THREE.Vector3(0, -1, 0));
  assert(
    ray
      .intersectObject(tower, true)
      .some((h) => h.object instanceof THREE.Mesh),
  );
  assert(
    !ray
      .intersectObject(base, true)
      .some((h) => h.object instanceof THREE.Mesh),
  );
  assert(m.data.buildings.find((b) => b.id === 'sfu-65').heightM < 60);
  // Public city roof coordinate outside the SFU registry polygon: this used to
  // remain a grey context slice through the selected tower.
  ray.set(
    new THREE.Vector3(-474.7664, 400, -140.1728),
    new THREE.Vector3(0, -1, 0),
  );
  const hit = ray
    .intersectObject(m.buildings, true)
    .find((h) => h.object instanceof THREE.Mesh);
  assert.equal(hit?.object.userData.id, 'sfu-77');
  assert(
    !m.data.buildings.some((b) =>
      ['vancouver-155387', 'vancouver-148582', 'vancouver-148358'].includes(
        b.id,
      ),
    ),
  );

  styleBuildingSelection(m.buildings, 'sfu-65', true);
  assert(
    meshes(base).every((m) => m.material.color.getHexString() === 'ea534e'),
  );
  assert(
    meshes(tower).every((m) => m.material.color.getHexString() === 'c8ddd9'),
  );
  dispose(m);
});
