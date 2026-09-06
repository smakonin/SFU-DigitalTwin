import * as THREE from 'three';
import type { Campus, Terrain } from './campus-types';
export function createCampusModel(data:Campus, terrain:Terrain) {
 const root=new THREE.Group();root.name='SFU Burnaby Campus';root.userData={crs:data.crs,origin:data.origin,limitations:data.limitations};
 const geometry=new THREE.PlaneGeometry(terrain.bounds[2]-terrain.bounds[0],terrain.bounds[3]-terrain.bounds[1],terrain.width-1,terrain.depth-1);
 geometry.rotateX(-Math.PI/2);
 const position=geometry.attributes.position;
 for(let i=0;i<position.count;i++) {position.setX(i,position.getX(i)+(terrain.bounds[0]+terrain.bounds[2])/2-terrain.origin[0]);position.setY(i,terrain.heights[i]-terrain.origin[2]);position.setZ(i,position.getZ(i)+terrain.origin[1]-(terrain.bounds[1]+terrain.bounds[3])/2);}
 geometry.computeVertexNormals();
 const land=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:'#466d68',roughness:1,side:THREE.DoubleSide}));land.name='Terrain · 2018 contours';land.receiveShadow=true;root.add(land);
 const buildings=new THREE.Group();buildings.name='Buildings';root.add(buildings);
 for(const b of data.buildings){
  const group=new THREE.Group();group.name=b.name;group.userData={id:b.id,buildingCode:b.buildingCode,heightStatus:b.heightStatus,source:b.source};
  for(const rings of b.polygons){
   const outer=rings[0].map(p=>new THREE.Vector2(p[0],-p[1]));
   const shape=new THREE.Shape(outer);
   for(const r of rings.slice(1))shape.holes.push(new THREE.Path(r.map(p=>new THREE.Vector2(p[0],-p[1]))));
   const geo=new THREE.ExtrudeGeometry(shape,{depth:b.heightM,bevelEnabled:false,steps:1,curveSegments:1});geo.rotateX(-Math.PI/2);geo.translate(0,b.groundM-terrain.origin[2],0);
   const color=b.source==='sfu'?'#c8ddd9':'#778c8b';
   const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color,roughness:0.8}));mesh.userData={id:b.id};mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
   const edges=new THREE.LineSegments(new THREE.EdgesGeometry(geo,25),new THREE.LineBasicMaterial({color:'#345455',transparent:true,opacity:.45}));edges.userData={decoration:true};group.add(edges);
  } buildings.add(group);
 }
 const contour=new THREE.Group();contour.name='Contour grid';contour.visible=false;root.add(contour);
 return {root,land,buildings};
}
