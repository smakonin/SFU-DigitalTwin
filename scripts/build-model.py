"""Build local-metre model data from archived source geometry.
Run with numpy, scipy, shapely, and pyproj installed. No network calls.
"""
import json, pathlib, csv, hashlib, datetime
import numpy as np
from shapely.geometry import shape, box, mapping
from scipy.interpolate import LinearNDInterpolator, NearestNDInterpolator
from pyproj import Transformer

ROOT=pathlib.Path(__file__).resolve().parents[1]
RAW=ROOT/'data/raw'; OUT=ROOT/'public/data'; OUT.mkdir(parents=True,exist_ok=True)
WEST,SOUTH,EAST,NORTH=504800,5457550,507150,5458900
OX,ON,OZ=506000,5458225,300
extent=box(WEST,SOUTH,EAST,NORTH)
load=lambda name:json.loads((RAW/(name+'.geojson')).read_text())['features']
points=[]
for source in ['sfu-contours-2018','burnaby-contours-2018']:
 for f in load(source):
  geom=shape(f['geometry']).intersection(extent.buffer(50)).simplify(1)
  lines=[geom] if geom.geom_type=='LineString' else getattr(geom,'geoms',[])
  for line in lines:
   if line.geom_type=='LineString':
    for x,y,*_ in line.coords: points.append([x,y,float(f['properties']['Elevation'])])
points=np.array(points)
_,idx=np.unique(np.round(points[:,:2],1),axis=0,return_index=True)
points=points[np.sort(idx)]
linear=LinearNDInterpolator(points[:,:2],points[:,2]); nearest=NearestNDInterpolator(points[:,:2],points[:,2])
def elevation(xy):
 xy=np.array(xy); z=linear(xy); bad=np.isnan(z); z[bad]=nearest(xy[bad]); return z
xs=np.linspace(WEST,EAST,236); ns=np.linspace(NORTH,SOUTH,136)
xx,nn=np.meshgrid(xs,ns); grid=elevation(np.c_[xx.ravel(),nn.ravel()])
terrain={'width':len(xs),'depth':len(ns),'bounds':[WEST,SOUTH,EAST,NORTH],'heights':np.round(grid,2).tolist(),'cellSizeM':10,'origin':[OX,ON,OZ],'crs':'EPSG:26910','verticalDatum':'Source contour elevations; vertical datum not specified in service metadata'}
official=load('sfu-buildings'); city=load('burnaby-buildings')
city_shapes=[shape(f['geometry']).buffer(0) for f in city]
official_shapes=[shape(f['geometry']).buffer(0) for f in official]
to_wgs=Transformer.from_crs(26910,4326,always_xy=True)
buildings=[]
def make(f,g,source,related=None):
 p=f['properties']; center=g.centroid; ground=float(elevation([[center.x,center.y]])[0])
 match=None; confidence=0
 if source=='sfu':
  candidates=[(g.intersection(c).area,i) for i,c in enumerate(city_shapes) if g.intersects(c)]
  if candidates:
   overlap,i=max(candidates); confidence=overlap/g.area
   if confidence>=0.25: match=city[i]
 else: match=f
 mp=match['properties'] if match else {}
 h=mp.get('HEIGHT_2018') or mp.get('HEIGHT') or 0
 reported=0<h<120
 height=float(h) if reported else 9.0
 components=[g] if g.geom_type=='Polygon' else list(g.geoms)
 polys=[]
 for polygon in components:
  if polygon.geom_type!='Polygon': continue
  simple=polygon.simplify(0.2,preserve_topology=True)
  rings=[simple.exterior,*simple.interiors]
  polys.append([[[round(x-OX,2),round(ON-y,2)] for x,y,*_ in ring.coords] for ring in rings])
 name=p.get('Name') if source=='sfu' else 'Context building '+str(p['OBJECTID'])
 abbreviation=p.get('Abbr') or str(p['OBJECTID'])
 name=name or p.get('Building') or abbreviation
 buildings.append(dict(id=('sfu-' if source=='sfu' else 'bby-')+str(p['OBJECTID']),name=name,abbr=abbreviation,buildingCode=p.get('bl_id'),source=source,areaM2=round(g.area),heightM=height,heightStatus='City height field · assumed metres' if reported else 'Estimated · 9 m placeholder',heightField=('HEIGHT_2018' if mp.get('HEIGHT_2018') else 'HEIGHT') if reported else None,heightMatchOverlap=round(confidence,3) if source=='sfu' else 1,heightObjectId=mp.get('OBJECTID'),groundM=round(ground,2),center=[round(center.x-OX,2),round(ground-OZ,2),round(ON-center.y,2)],coordinates=list(to_wgs.transform(center.x,center.y)),polygons=polys))
for f,g in zip(official,official_shapes):
 if not g.is_empty and g.intersects(extent): make(f,g,'sfu')
for f,g in zip(city,city_shapes):
 if not g.is_empty and extent.contains(g) and not any(g.intersection(o).area/max(g.area,1)>0.15 for o in official_shapes): make(f,g,'burnaby')

manifest={'retrievedAt':'2026-09-05','origin':[OX,ON,OZ],'crs':'EPSG:26910','sceneAxes':'X east; Y up; Z south. All scene coordinates in metres relative to origin.','buildings':buildings,'stats':{'campusFeatures':sum(b['source']=='sfu' for b in buildings),'contextFeatures':sum(b['source']=='burnaby' for b in buildings),'terrainVertices':len(grid),'estimatedHeights':sum(b['heightField'] is None for b in buildings)},'limitations':['Footprint extrusions with flat roofs, not surveyed roof or facade geometry.','Building height units inferred as metres, pending source confirmation; spatial joins are approximate.','Terrain interpolated at 10 m from 2018 contours; source vertical datum unconfirmed.','Building service name contains 2020 but includes newer buildings; exact per-feature survey dates unavailable.']}
(OUT/'campus.json').write_text(json.dumps(manifest,separators=(',',':')))
(OUT/'terrain.json').write_text(json.dumps(terrain,separators=(',',':')))
sources=json.loads((RAW/'sources.json').read_text())
im=OUT/'aerial-2025.jpg'
if im.exists(): sources.append({'id':'burnaby-orthophoto-2025','url':'https://gis.burnaby.ca/arcgis/rest/services/Burnaby_Ortho_2025/MapServer','queryBounds':','.join(map(str,[WEST,SOUTH,EAST,NORTH])),'crs':'EPSG:26910','size':[4096,2353],'retrievedAt':datetime.datetime.fromtimestamp(im.stat().st_mtime,datetime.timezone.utc).isoformat(),'sha256':hashlib.sha256(im.read_bytes()).hexdigest()})
(OUT/'sources.json').write_text(json.dumps(sources,indent=2))
print(json.dumps(manifest['stats'],indent=2));print('Terrain elevation',float(grid.min()),float(grid.max()),'m')
