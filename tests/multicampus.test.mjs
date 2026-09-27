import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { createCampusModel } from '../lib/model.ts';
import { CAMPUSES } from '../lib/campuses.ts';
import {
  withinCampus,
  projectChargingLocation,
} from '../lib/charging-location.ts';
for (const [id, count] of [
  ['vancouver', 9],
  ['surrey', 5],
])
  test(`${id} geometry, georeferencing, occupied-site notes and exported model are consistent`, () => {
    const directory = `public/${CAMPUSES[id].directory}`;
    const campus = JSON.parse(fs.readFileSync(directory + '/campus.json')),
      terrain = JSON.parse(fs.readFileSync(directory + '/terrain.json'));
    const sites = campus.buildings.filter((b) => b.source === 'sfu');
    assert.equal(campus.campusId, id);
    assert.equal(sites.length, count);
    assert.deepEqual(campus.origin, terrain.origin);
    assert.deepEqual(terrain.bounds, CAMPUSES[id].bounds);
    assert.equal(
      new Set(campus.buildings.map((b) => b.id)).size,
      campus.buildings.length,
    );
    assert.equal(terrain.heights.length, terrain.width * terrain.depth);
    assert(terrain.heights.every(Number.isFinite));
    for (const b of campus.buildings) {
      assert(b.heightM > 0 && Number.isFinite(b.heightM));
      assert(b.center.every(Number.isFinite));
      assert(b.polygons.length > 0);
      assert(
        b.polygons.every(
          (p) =>
            p.length > 0 &&
            p.every(
              (r) =>
                r.length >= 4 &&
                r.every((xy) => xy.length === 2 && xy.every(Number.isFinite)),
            ),
        ),
      );
    }
    for (const b of sites) {
      assert(
        b.occupancy &&
          b.sourceUrl.startsWith('https://www.sfu.ca/') &&
          b.geometrySource,
      );
      assert(withinCampus(...b.coordinates, id));
      assert(!withinCampus(...b.coordinates, 'burnaby'));
      const [x, y] = projectChargingLocation(...b.coordinates);
      assert(Math.abs(x - campus.origin[0] - b.center[0]) < 0.1);
      assert(Math.abs(campus.origin[1] - y - b.center[2]) < 0.1);
    }
    if (id === 'surrey') {
      assert.equal(sites.find((b) => b.kind === 'plaza').heightM, 0.2);
      const central = sites.find((b) => b.id === 'sfu-71');
      assert.equal(central.heightM, 111.27);
      assert.deepEqual(
        central.parts.map((p) => p.heightM),
        [32.82, 111.27],
      );
    } else
      assert.equal(
        sites.find((b) => b.id === 'sfu-van-gallery').buildingCode,
        null,
      );
    const { root, land } = createCampusModel(campus, terrain);
    assert.equal(root.userData.campusId, id);
    assert.equal(
      land.geometry.attributes.position.count,
      terrain.heights.length,
    );
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const p = o.geometry.attributes.position;
        assert(Array.from(p.array).every(Number.isFinite));
        assert.equal((o.geometry.index?.count ?? p.count) % 3, 0);
      }
      if (o.geometry) o.geometry.dispose();
      if (o.material)
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
          m.dispose(),
        );
    });
    const glb = fs.readFileSync(`${directory}/sfu-${id}.glb`);
    assert.equal(glb.toString('ascii', 0, 4), 'glTF');
    assert.equal(glb.readUInt32LE(8), glb.length);
    const doc = JSON.parse(glb.toString('utf8', 20, 20 + glb.readUInt32LE(12))),
      meta = doc.nodes.find((n) => n.extras?.campusId === id)?.extras;
    assert(meta);
    assert.deepEqual(meta.origin, campus.origin);
    assert.equal(meta.crs, 'EPSG:26910');
    assert.equal(
      doc.nodes.filter((n) => n.extras?.source === 'sfu').length,
      count,
    );
  });
