"""Build approximate Vancouver/Surrey exteriors from public archived sources.
Requires numpy, scipy, shapely, pyproj. No network or operational data access.
"""
import json, pathlib, math
import numpy as np
from shapely import set_precision
from shapely.geometry import shape, box, Point, Polygon, mapping
from shapely.ops import transform, unary_union, triangulate
from scipy.interpolate import LinearNDInterpolator, NearestNDInterpolator
from pyproj import Transformer
from acquire_multicampus_config import BOUNDS

ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw/multicampus'
OUT = ROOT / 'public/data'
load = lambda name: json.loads((RAW / (name + '.json')).read_text())
project = Transformer.from_crs(4326,26910,always_xy=True).transform
unproject = Transformer.from_crs(26910,4326,always_xy=True).transform
sites = json.loads((ROOT/'data/campus-sites.json').read_text())
official = {f['properties']['OBJECTID']:f for f in load('sfu-footprints')['features']}
sources = load('sources')
# A mapped building part distinguishes the tower from the much larger city footprint.
osm = load('central-city-osm')
osm_nodes = {e['id']:(e['lon'],e['lat']) for e in osm['elements'] if e['type']=='node'}
osm_way = next(e for e in osm['elements'] if e['type']=='way' and e['id']==450312789)
tower_geographic = Polygon([osm_nodes[n] for n in osm_way['nodes']])
central_tower = transform(project,tower_geographic).buffer(0)
assert 1500<central_tower.area<3000


def polygons(g, ox, oy, tolerance=.25, precision=2):
    result=[]
    g=set_precision(g,10**(-precision))
    for part in [g] if g.geom_type=='Polygon' else g.geoms:
        if part.geom_type!='Polygon' or part.area<1: continue
        p=part.simplify(tolerance,preserve_topology=True)
        result.append([[[round(x-ox,precision),round(oy-y,precision)] for x,y,*_ in ring.coords] for ring in [p.exterior,*p.interiors]])
    return result

for campus in ['vancouver','surrey']:
    bounds=BOUNDS[campus]; west,south,east,north=bounds; extent=box(*bounds)
    ox,oy=(west+east)/2,(south+north)/2
    rows=load('vancouver-heights-2009' if campus=='vancouver' else 'surrey-buildings')['features']
    city=[]
    for row in rows:
        g=shape(row['geometry']).buffer(0)
        if campus=='vancouver': g=transform(project,g)
        if g.is_empty or not g.intersects(extent) or g.area<8:continue
        p=row['properties']; height=p.get('hgt_agl') if campus=='vancouver' else p.get('BUILDING_HEIGHT')
        ground=p.get('baseelev_m') if campus=='vancouver' else p.get('GROUND_ELEVATION')
        city.append(dict(geometry=g, height=height if isinstance(height,(int,float)) and 1<height<300 else None,
                         ground=ground if isinstance(ground,(int,float)) and 0<=ground<200 else None,
                         objectId=p.get('id',p.get('OBJECTID'))))
    harbour_tower=None
    if campus=='vancouver':
        official_tower=shape(official[77]['geometry']).buffer(0)
        tower_roofs=[c['geometry'] for c in city if c['height'] and c['height']>90 and c['geometry'].intersection(official_tower).area/c['geometry'].area>=.5]
        harbour_tower=unary_union([official_tower,*tower_roofs])
    points=np.array([[c['geometry'].centroid.x,c['geometry'].centroid.y,c['ground']] for c in city if c['ground'] is not None])
    _, unique=np.unique(np.round(points[:,:2],1),axis=0,return_index=True); points=points[unique]
    assert len(points)>20
    linear=LinearNDInterpolator(points[:,:2],points[:,2]); nearest=NearestNDInterpolator(points[:,:2],points[:,2])
    def elevation(coords):
        xy=np.asarray(coords); z=linear(xy); bad=np.isnan(z); z[bad]=nearest(xy[bad]); return z
    oz=round(float(np.median(points[:,2])))
    xs=np.linspace(west,east,math.ceil((east-west)/15)+1); ys=np.linspace(north,south,math.ceil((north-south)/15)+1)
    xx,yy=np.meshgrid(xs,ys); heights=elevation(np.c_[xx.ravel(),yy.ravel()])
    terrain=dict(width=len(xs),depth=len(ys),bounds=bounds,heights=np.round(heights,2).tolist(),origin=[ox,oy,oz],crs='EPSG:26910',verticalDatum='Municipal building-base elevations; vertical datum not verified',label='Estimated ground · building-base interpolation')
    buildings=[]; official_shapes=[]
    def component(g,h,ground,label,source_id=None):
        return dict(name=label, heightM=round(h,2), groundM=round(ground,2), polygons=polygons(g,ox,oy,0,4), sourceObjectId=source_id)
    def ground_surface(g,offset):
        # Clip against the exact triangles used by Three's terrain mesh; a flat plaza
        # at its centroid elevation can disappear under sloping ground.
        result=[]
        z=np.asarray(terrain['heights']).reshape(len(ys),len(xs))
        for row in range(len(ys)-1):
            for col in range(len(xs)-1):
                if not box(xs[col],ys[row+1],xs[col+1],ys[row]).intersects(g):continue
                a=(xs[col],ys[row],z[row,col]);b=(xs[col],ys[row+1],z[row+1,col]);c=(xs[col+1],ys[row+1],z[row+1,col+1]);d=(xs[col+1],ys[row],z[row,col+1])
                for tri in [(a,b,d),(b,c,d)]:
                    clipped=Polygon([(v[0],v[1]) for v in tri]).intersection(g)
                    if clipped.is_empty or clipped.area<.001:continue
                    plane=np.linalg.solve(np.array([[x,y,1] for x,y,_ in tri]),np.array([v[2] for v in tri]))
                    for t in triangulate(clipped):
                        if not clipped.covers(t.representative_point()):continue
                        pts=[[round(x-ox,4),round(float(plane@[x,y,1])-oz+offset,4),round(oy-y,4)] for x,y in list(t.exterior.coords)[:3]]
                        # Reverse projected XY winding so the scene-space normal points up.
                        if np.cross(np.array(pts[1])-pts[0],np.array(pts[2])-pts[0])[1]<0:pts.reverse()
                        result.extend(pts)
        return result

    for site in sites[campus]:
        if site['objectId'] is not None:
            f=official[site['objectId']]; p=f['properties']; g=shape(f['geometry']).buffer(0)
            ident='sfu-'+str(site['objectId']); code=p['bl_id']; abbr=p['Abbr']; geometry_source='SFU Facilities Services · exterior footprint layer 66'
        else:
            address=load('gallery-address')['features'][0]['geometry']['coordinates']; point=Point(*project(*address))
            footprints=[(f,transform(project,shape(f['geometry'])).buffer(0)) for f in load('vancouver-footprints-2015')['features']]
            f,g=min(footprints,key=lambda pair:pair[1].distance(point))
            assert g.distance(point)<30,'Gallery address could not be matched to a municipal footprint'
            ident=site['id'];code=None;abbr=site['abbr'];geometry_source='City of Vancouver · 2015 footprint matched to BC address point'
        candidates=sorted([(g.intersection(c['geometry']).area,c) for c in city if c['height'] is not None and g.intersects(c['geometry'])],key=lambda item:(item[0],-abs(item[1]['geometry'].area-g.area)),reverse=True)
        # A matched roof belongs to the building as a whole, including roof overhang
        # beyond the registry footprint. Leaving that remainder in context creates
        # grey slices through an otherwise red selected tower.
        render_shape=g
        if campus=='vancouver':
            roof_extents=[c['geometry'] for area,c in candidates if area>=max(8,g.area*.005) and area/c['geometry'].area>=.5]
            render_shape=unary_union([g,*roof_extents])
            if site['objectId']==65:render_shape=render_shape.difference(harbour_tower.buffer(.02))
            if site['objectId']==77:render_shape=harbour_tower
            geometry_source+=' · exterior roof sections from municipal 2009 LiDAR'
        official_shapes.append(render_shape)

        matched=candidates[0][1] if candidates and candidates[0][0]/g.area>=.25 else None
        # Central City contains a tower and mall/podium; do not extrude the whole campus to tower height.
        if site['objectId']==71:
            matched=next((c for area,c in candidates if c['objectId']==103104 and area/g.area>.15),None)
        h=matched['height'] if matched else site.get('fallbackHeightM',12)
        field=('hgt_agl' if campus=='vancouver' else 'BUILDING_HEIGHT') if matched else None
        height_note=('Estimated from historical 2009 city LiDAR' if campus=='vancouver' else 'City height · approximate footprint match') if matched else site.get('fallbackHeightNote','Estimated · 12 m placeholder')
        if site.get('kind')=='plaza':h=.2;field=None;height_note='Terrain-following surface · 0.2 m offset'

        center=g.centroid; ground=float(elevation([[center.x,center.y]])[0])
        parts=None
        if site['objectId']==71:
            assert matched is not None, 'Central City podium height unavailable'
            tower_source=next(c for c in city if c['objectId']==1665)
            tower_height=tower_source['height']
            assert tower_height>90
            # Keep the podium at 32.82 m and give the narrow tower its own 111.27 m mass.
            parts=[component(g.difference(central_tower),h,ground,'Central City podium',matched['objectId']),
                   component(central_tower,tower_height,ground,'Central City office tower',tower_source['objectId'])]
            parts[1].update(geometrySource='© OpenStreetMap contributors · way 450312789',licence='https://opendatacommons.org/licenses/odbl/1-0/')
            official_shapes.append(central_tower)
            h=tower_height
            height_note='Separate podium and tower · city heights; approximate roof massing'
        elif campus=='vancouver':
            # Retain mapped changes in roof height instead of flattening a whole
            # complex to the largest intersecting roof component's height.
            remaining=render_shape
            parts=[]
            for area,c in sorted(candidates,key=lambda item:item[1]['height'],reverse=True):
                if area<max(8,g.area*.005):continue
                part=remaining.intersection(c['geometry'])
                if part.area<8 or part.area/c['geometry'].area<.5:continue
                parts.append(component(part,c['height'],ground,'Historical roof section',c['objectId']))
                remaining=remaining.difference(part)
            if remaining.area>=1:parts.append(component(remaining,h,ground,'Estimated infill',matched['objectId'] if matched else None))
            h=max(part['heightM'] for part in parts)
            # Each rendered roof region has one owner; selection must not compete
            # with duplicate triangles belonging to another campus feature.
            regions=[unary_union([Polygon(p[0],p[1:]) for p in part['polygons']]) for part in parts]
            for i,region in enumerate(regions):
                assert all(region.intersection(other).area<3 for other in regions[i+1:]), 'Overlapping roof sections'
            height_note='Historical 2009 city roof sections · approximate height matches'
        buildings.append(dict(id=ident,name=site['name'],abbr=abbr,buildingCode=code,source='sfu',areaM2=round(g.area),heightM=round(h,2),heightStatus=height_note,heightField=field,heightMatchOverlap=round(g.intersection(matched['geometry']).area/g.area,3) if matched else 0,heightObjectId=matched['objectId'] if matched else None,groundM=round(ground,2),center=[round(center.x-ox,2),round(ground-oz,2),round(oy-center.y,2)],coordinates=list(unproject(center.x,center.y)),polygons=polygons(g,ox,oy),address=site['address'],occupancy=site['occupancy'],sourceUrl=site['url'],geometrySource=geometry_source,kind=site.get('kind','building'),**({'parts':parts} if parts else {}),**({'surfacePositions':ground_surface(render_shape,.2)} if site.get('kind')=='plaza' else {})))
    rendered=[]
    for building in buildings:
        geometry=unary_union([Polygon(p[0],p[1:]) for part in building.get('parts',[building]) for p in part['polygons']])
        assert geometry.is_valid
        assert all(geometry.intersection(other).area<.1 for other in rendered), 'Campus sections have competing owners'
        rendered.append(geometry)
    occupied=unary_union(official_shapes)
    for c in city:
        # Clip surrounding exteriors against SFU footprints so context cannot hide the selected campus geometry.
        g=c['geometry'].intersection(extent).difference(occupied.buffer(.3))
        if g.is_empty or g.area<15 or g.geom_type not in ['Polygon','MultiPolygon']:continue
        center=g.centroid; ground=float(elevation([[center.x,center.y]])[0]); h=c['height'] or 9
        # This city footprint spans the entire north podium, not just its tower.
        # The tower is modelled separately above, including the section outside SFU's polygon.
        if campus=='surrey' and c['objectId']==1665:h=next(b for b in buildings if b['id']=='sfu-71')['parts'][0]['heightM']
        buildings.append(dict(id=campus+'-'+str(c['objectId']),name='Surrounding building '+str(c['objectId']),abbr=str(c['objectId']),buildingCode=None,source=campus,areaM2=round(g.area),heightM=round(h,2),heightStatus='Estimated Central City podium · tower separated' if campus=='surrey' and c['objectId']==1665 else ('Historical 2009 city LiDAR' if campus=='vancouver' else 'Municipal building height') if c['height'] else 'Estimated · 9 m placeholder',heightField=('hgt_agl' if campus=='vancouver' else 'BUILDING_HEIGHT') if c['height'] else None,heightMatchOverlap=1,groundM=round(ground,2),center=[round(center.x-ox,2),round(ground-oz,2),round(oy-center.y,2)],coordinates=list(unproject(center.x,center.y)),polygons=polygons(g,ox,oy)))
    limitations=[
        'Approximate exterior massing. Shared buildings do not identify SFU floor, lease or ownership boundaries.',
        'Flat roofs and simplified heights; façades, interiors and surveyed roof shapes are not reconstructed.',
        'Ground is interpolated from municipal building-base elevations, not a surveyed terrain model. Vertical datum is unverified.',
        'Vancouver heights and surrounding buildings use historical 2009 LiDAR and may predate redevelopment.' if campus=='vancouver' else 'Surrey city heights are spatial estimates for the mapped exteriors. Central City has separate podium and tower parts; the plaza follows the modelled terrain.',
        'No aerial imagery is included for this campus. Heights remain approximate, even where separate roof sections are modelled.',
        'Public location listings can include affiliated sites and shared premises. New facilities without verified footprints are not represented.'
    ]
    manifest=dict(campusId=campus,name='SFU '+campus.title()+' Campus',retrievedAt='2026-09-27',crs='EPSG:26910',origin=[ox,oy,oz],bounds=bounds,buildings=buildings,limitations=limitations,stats=dict(campusFeatures=len(sites[campus]),contextFeatures=len(buildings)-len(sites[campus]),terrainVertices=len(heights),estimatedHeights=sum(b['heightField'] is None for b in buildings)))
    directory=OUT/campus;directory.mkdir(exist_ok=True)
    if campus=='surrey':
        tower_data=dict(type='Feature',geometry=mapping(tower_geographic),properties=dict(name='Central City Office Tower',source='https://www.openstreetmap.org/way/450312789',attribution='© OpenStreetMap contributors',licence='https://opendatacommons.org/licenses/odbl/1-0/'))
        (directory/'central-city-tower.geojson').write_text(json.dumps(tower_data,separators=(',',':')))
        manifest['attributions']=[dict(text='© OpenStreetMap contributors',url='https://www.openstreetmap.org/copyright',licence='https://opendatacommons.org/licenses/odbl/1-0/',scope='Central City tower footprint')]
    for filename,data in [('campus.json',manifest),('terrain.json',terrain),('sources.json',dict(sources=[s for s in sources if s['id']=='sfu-footprints' or campus in s['id'] or campus=='vancouver' and s['id']=='gallery-address' or campus=='surrey' and s['id']=='central-city-osm'],locations=sites[campus],attribution='Contains information licensed under the Open Government Licence – '+('Vancouver' if campus=='vancouver' else 'City of Surrey'),licence='https://opendata.vancouver.ca/pages/licence/' if campus=='vancouver' else 'https://data.surrey.ca/pages/open-government-licence-surrey'))]:
        (directory/filename).write_text(json.dumps(data,separators=(',',':'),allow_nan=False))
    print(campus,manifest['stats'])
    for b in buildings[:len(sites[campus])]:print(' ',b['name'],b['heightM'],b['heightStatus'])
