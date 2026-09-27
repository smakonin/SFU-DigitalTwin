'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { assetPath } from '@/lib/runtime-mode';
import { createCampusModel, styleBuildingSelection } from '@/lib/model';
import { CAMPUSES, type CampusId } from '@/lib/campuses';
import type { Campus, Terrain } from '@/lib/campus-types';
import type { ChargingStation } from '@/lib/charging';
import { chargingPosition } from '@/lib/charging-location';
import { chargingStationState, CHARGING_COLOURS } from '@/lib/charging-state';
type Props = {
  campusId: CampusId;
  chargingClock: number;
  chargingStale: boolean;
  chargingStations: ChargingStation[];
  showCharging: boolean;
  campus: Campus;
  selected: string;
  selectionRevision: number;
  onSelect: (id: string) => void;
  aerial: boolean;
  context: boolean;
  view: string;
  reset: number;
};
type ViewerApi = {
  style: () => void;
  markers: () => void;
  focus: () => void;
  overview: () => void;
};
export default function CampusViewer(props: Props) {
  const {
    campus,
    campusId,
    selected,
    selectionRevision,
    aerial,
    context,
    view,
    reset,
    chargingStations,
    showCharging,
    chargingStale,
    chargingClock,
  } = props;
  const host = useRef<HTMLDivElement>(null),
    api = useRef<ViewerApi | null>(null),
    latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  }, [props]);
  const [error, setError] = useState('');
  useEffect(() => {
    const life = new AbortController();
    let frame = 0;
    const el = host.current!;
    let dispose = () => {};
    const definition = CAMPUSES[campusId];
    fetch(assetPath(`${definition.directory}/terrain.json`), {
      signal: life.signal,
    })
      .then((r) => {
        if (!r.ok) throw Error('Terrain could not load.');
        return r.json() as Promise<Terrain>;
      })
      .then((terrain) => {
        if (life.signal.aborted) return;
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        renderer.setClearColor('#0d1c24');
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        el.appendChild(renderer.domElement);
        renderer.domElement.setAttribute(
          'aria-label',
          `Interactive SFU ${definition.name} campus model. Select buildings in the list for keyboard access.`,
        );
        const scene = new THREE.Scene();
        scene.fog = new THREE.Fog('#0d1c24', 5000, 10000);
        const camera = new THREE.PerspectiveCamera(42, 1, 1, 20000);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.minDistance = 35;
        controls.maxDistance = 6500;
        controls.maxPolarAngle = Math.PI / 2.07;
        scene.add(new THREE.HemisphereLight('#e8f6ff', '#3b5752', 2.4));
        const sun = new THREE.DirectionalLight('#fff0d8', 3);
        sun.position.set(-700, 1800, 500);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        Object.assign(sun.shadow.camera, {
          left: -1600,
          right: 1600,
          top: 1600,
          bottom: -1600,
          far: 5000,
        });
        sun.shadow.bias = -0.0003;
        scene.add(sun);
        const model = createCampusModel(campus, terrain);
        scene.add(model.root);
        const markers = new THREE.Group();
        scene.add(markers);
        const buildingById = new Map(campus.buildings.map((b) => [b.id, b]));
        let texture: THREE.Texture | null = null;
        const disposeObject = (object: THREE.Object3D) =>
          object.traverse((o) => {
            if (
              o instanceof THREE.Mesh ||
              o instanceof THREE.Sprite ||
              o instanceof THREE.LineSegments
            ) {
              o.geometry?.dispose();
              for (const m of Array.isArray(o.material)
                ? o.material
                : [o.material]) {
                if ('map' in m) (m.map as THREE.Texture | null)?.dispose();
                m.dispose();
              }
            }
          });
        const clearMarkers = () => {
          for (const child of markers.children.slice()) {
            disposeObject(child);
            markers.remove(child);
          }
        };
        const updateMarkers = () => {
          clearMarkers();
          if (!latest.current.showCharging) return;
          for (const station of latest.current.chargingStations) {
            const group = new THREE.Group();
            group.position.set(
              ...chargingPosition(station.longitude, station.latitude, terrain),
            );
            group.userData.id = station.id;
            const color =
              CHARGING_COLOURS[
                chargingStationState(station, latest.current.chargingStale)
              ];
            const stem = new THREE.Mesh(
              new THREE.CylinderGeometry(1.5, 1.5, 30, 6),
              new THREE.MeshBasicMaterial({ color }),
            );
            stem.position.y = 15;
            stem.userData.id = station.id;
            group.add(stem);
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 128;
            const ctx = canvas.getContext('2d')!;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(64, 64, 58, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#10242d';
            ctx.font = 'bold 48px system-ui';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('EV', 64, 66);
            const sprite = new THREE.Sprite(
              new THREE.SpriteMaterial({
                map: new THREE.CanvasTexture(canvas),
                depthTest: false,
              }),
            );
            sprite.scale.set(36, 36, 1);
            sprite.position.y = 40;
            sprite.userData.id = station.id;
            sprite.renderOrder = 2;
            group.add(sprite);
            markers.add(group);
          }
        };
        const style = () => {
          const p = latest.current,
            mat = model.land.material as THREE.MeshStandardMaterial;
          mat.map = p.aerial ? texture : null;
          mat.color.set(p.aerial && texture ? '#ffffff' : '#466d68');
          mat.needsUpdate = true;
          styleBuildingSelection(model.buildings, p.selected, p.context);
        };
        const overview = () => {
          const [west, south, east, north] = terrain.bounds;
          const target = new THREE.Vector3(
            (west + east) / 2 - terrain.origin[0],
            20,
            terrain.origin[1] - (south + north) / 2,
          );
          const distance =
            Math.max(
              (east - west) / Math.max(camera.aspect, 0.45),
              north - south,
            ) * 1.55;
          controls.target.copy(target);
          camera.position
            .copy(target)
            .add(
              latest.current.view === 'plan'
                ? new THREE.Vector3(0, distance, 0.1)
                : new THREE.Vector3(0.5, 0.75, 0.8)
                    .normalize()
                    .multiplyScalar(distance),
            );
          controls.update();
        };
        const focus = () => {
          const p = latest.current,
            station = p.showCharging
              ? p.chargingStations.find((s) => s.id === p.selected)
              : undefined;
          const building = buildingById.get(p.selected);
          if (!station && !building) return;
          const center = new THREE.Vector3(
            ...(station
              ? chargingPosition(station.longitude, station.latitude, terrain)
              : building!.center),
          );
          const distance = station
            ? 230
            : Math.max(
                130,
                building!.heightM * 2,
                Math.sqrt(building!.areaM2) * 2.3,
              ) / Math.min(1, camera.aspect);
          if (building) center.y += building.heightM * 0.3;
          controls.target.copy(center);
          camera.position
            .copy(center)
            .add(
              p.view === 'plan'
                ? new THREE.Vector3(0, distance * 1.7, 0.1)
                : new THREE.Vector3(0.7, 0.85, 1).multiplyScalar(distance),
            );
          controls.update();
        };
        const grid = new THREE.GridHelper(6000, 60, '#29414b', '#192e38');
        grid.position.y = Math.min(...terrain.heights) - terrain.origin[2] - 12;
        scene.add(grid);
        const ray = new THREE.Raycaster(),
          mouse = new THREE.Vector2();
        let down = [0, 0];
        const pointerDown = (e: PointerEvent) => {
          down = [e.clientX, e.clientY];
        };
        const pointerUp = (e: PointerEvent) => {
          if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
          const rect = el.getBoundingClientRect();
          mouse.set(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            (-(e.clientY - rect.top) / rect.height) * 2 + 1,
          );
          ray.setFromCamera(mouse, camera);
          const marker = ray.intersectObjects(markers.children, true)[0];
          if (marker) {
            latest.current.onSelect(marker.object.userData.id);
            return;
          }
          const hit = ray
            .intersectObjects(model.buildings.children, true)
            .find(
              (h) => h.object instanceof THREE.Mesh && h.object.parent?.visible,
            );
          if (hit) latest.current.onSelect(hit.object.userData.id);
        };
        renderer.domElement.addEventListener('pointerdown', pointerDown);
        renderer.domElement.addEventListener('pointerup', pointerUp);
        const resize = () => {
          camera.aspect = el.clientWidth / Math.max(el.clientHeight, 1);
          camera.updateProjectionMatrix();
          renderer.setSize(el.clientWidth, el.clientHeight);
        };
        const observer = new ResizeObserver(resize);
        observer.observe(el);
        resize();
        api.current = { style, markers: updateMarkers, focus, overview };
        style();
        updateMarkers();
        overview();
        if (definition.aerial)
          new THREE.TextureLoader().load(
            assetPath(definition.aerial),
            (t) => {
              if (life.signal.aborted) {
                t.dispose();
                return;
              }
              t.colorSpace = THREE.SRGBColorSpace;
              t.anisotropy = renderer.capabilities.getMaxAnisotropy();
              texture = t;
              style();
            },
            undefined,
            () => {
              if (!life.signal.aborted)
                setError(
                  'Aerial imagery unavailable; the terrain model remains usable.',
                );
            },
          );
        const render = () => {
          controls.update();
          renderer.render(scene, camera);
          frame = requestAnimationFrame(render);
        };
        render();
        dispose = () => {
          observer.disconnect();
          controls.dispose();
          renderer.domElement.removeEventListener('pointerdown', pointerDown);
          renderer.domElement.removeEventListener('pointerup', pointerUp);
          clearMarkers();
          disposeObject(scene);
          texture?.dispose();
          renderer.dispose();
          renderer.forceContextLoss();
          renderer.domElement.remove();
          api.current = null;
        };
      })
      .catch((e) => {
        if (!life.signal.aborted)
          setError(
            e.message ||
              'WebGL is unavailable. Enable hardware acceleration in your browser.',
          );
      });
    return () => {
      life.abort();
      cancelAnimationFrame(frame);
      dispose();
    };
  }, [campus, campusId]);
  useEffect(() => {
    api.current?.style();
  }, [selected, aerial, context]);
  useEffect(() => {
    api.current?.markers();
  }, [chargingStations, showCharging, chargingStale, chargingClock]);
  useEffect(() => {
    api.current?.focus();
  }, [selected, selectionRevision]);
  useEffect(() => {
    api.current?.overview();
  }, [view, reset]);
  return (
    <div className="model-host" ref={host}>
      {error && <output className="model-error">{error}</output>}
    </div>
  );
}
