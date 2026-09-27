import * as THREE from 'three';
import type { Campus, Terrain } from './campus-types';

export function styleBuildingSelection(
  buildings: THREE.Group,
  selected: string,
  showContext: boolean,
) {
  for (const group of buildings.children) {
    const active = group.userData.id === selected;
    const campus = group.userData.source === 'sfu';
    group.visible = campus || showContext;
    for (const child of group.children) {
      if (child instanceof THREE.Mesh) {
        const material = child.material as THREE.MeshStandardMaterial;
        material.color.set(active ? '#ea534e' : campus ? '#c8ddd9' : '#778c8b');
        material.emissive.set(active ? '#36120e' : '#000000');
        // A small depth bias stabilizes selected surfaces at shared roof seams,
        // while normal depth testing still lets taller buildings occlude them.
        material.polygonOffset = active;
        material.polygonOffsetFactor = active ? -1 : 0;
        material.polygonOffsetUnits = active ? -1 : 0;
      }
      if (child instanceof THREE.LineSegments) {
        const material = child.material as THREE.LineBasicMaterial;
        material.color.set(active ? '#9f2927' : '#345455');
      }
    }
  }
}

export function createCampusModel(data: Campus, terrain: Terrain) {
  const root = new THREE.Group();
  root.name = data.name || 'SFU Burnaby Campus';
  root.userData = {
    campusId: data.campusId || 'burnaby',
    crs: data.crs,
    origin: data.origin,
    limitations: data.limitations,
    ...(data.attributions ? { attributions: data.attributions } : {}),
  };
  const geometry = new THREE.PlaneGeometry(
    terrain.bounds[2] - terrain.bounds[0],
    terrain.bounds[3] - terrain.bounds[1],
    terrain.width - 1,
    terrain.depth - 1,
  );
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    position.setX(
      i,
      position.getX(i) +
        (terrain.bounds[0] + terrain.bounds[2]) / 2 -
        terrain.origin[0],
    );
    position.setY(i, terrain.heights[i] - terrain.origin[2]);
    position.setZ(
      i,
      position.getZ(i) +
        terrain.origin[1] -
        (terrain.bounds[1] + terrain.bounds[3]) / 2,
    );
  }
  geometry.computeVertexNormals();
  const land = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: '#466d68',
      roughness: 1,
      side: THREE.DoubleSide,
    }),
  );
  land.name = terrain.label || 'Terrain · 2018 contours';
  land.receiveShadow = true;
  root.add(land);
  const buildings = new THREE.Group();
  buildings.name = 'Buildings';
  root.add(buildings);
  for (const b of data.buildings) {
    const group = new THREE.Group();
    group.name = b.name;
    group.userData = {
      id: b.id,
      buildingCode: b.buildingCode,
      heightStatus: b.heightStatus,
      source: b.source,
      ...(b.occupancy
        ? {
            occupancy: b.occupancy,
            address: b.address,
            geometrySource: b.geometrySource,
            kind: b.kind,
          }
        : {}),
    };
    const addMesh = (
      geo: THREE.BufferGeometry,
      name: string,
      metadata: Record<string, unknown> = {},
    ) => {
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({
          color: b.source === 'sfu' ? '#c8ddd9' : '#778c8b',
          roughness: 0.8,
        }),
      );
      mesh.name = name;
      mesh.userData = { id: b.id, ...metadata };
      mesh.castShadow = b.kind !== 'plaza';
      mesh.receiveShadow = true;
      group.add(mesh);
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo, 25),
        new THREE.LineBasicMaterial({
          color: '#345455',
          transparent: true,
          opacity: 0.45,
        }),
      );
      edges.userData = { decoration: true };
      group.add(edges);
    };
    if (b.surfacePositions) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(b.surfacePositions.flat(), 3),
      );
      geo.computeVertexNormals();
      addMesh(geo, b.name + ' · terrain-following surface');
    } else {
      const parts = b.parts || [
        {
          name: b.name,
          heightM: b.heightM,
          groundM: b.groundM,
          polygons: b.polygons,
        },
      ];
      for (const part of parts)
        for (const rings of part.polygons) {
          const shape = new THREE.Shape(
            rings[0].map((p) => new THREE.Vector2(p[0], -p[1])),
          );
          for (const ring of rings.slice(1))
            shape.holes.push(
              new THREE.Path(ring.map((p) => new THREE.Vector2(p[0], -p[1]))),
            );
          const geo = new THREE.ExtrudeGeometry(shape, {
            depth: part.heightM,
            bevelEnabled: false,
            steps: 1,
            curveSegments: 1,
          });
          geo.rotateX(-Math.PI / 2);
          geo.translate(0, part.groundM - terrain.origin[2], 0);
          addMesh(geo, part.name, {
            heightM: part.heightM,
            ...('geometrySource' in part
              ? { geometrySource: part.geometrySource, licence: part.licence }
              : {}),
            ...('sourceObjectId' in part
              ? { sourceObjectId: part.sourceObjectId }
              : {}),
          });
        }
    }
    buildings.add(group);
  }
  const contour = new THREE.Group();
  contour.name = 'Contour grid';
  contour.visible = false;
  root.add(contour);
  return { root, land, buildings };
}
