"""Download public source data with reproducible spatial queries. No credentials needed."""
import json, pathlib, urllib.request, urllib.parse, hashlib, datetime, concurrent.futures

ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW = ROOT / 'data' / 'raw'
RAW.mkdir(parents=True, exist_ok=True)
SFU = 'https://viewsfu-prd.its.sfu.ca/fsgis/rest/services/Vertisee/'
BBY = 'https://gis.burnaby.ca/arcgis/rest/services/'
BBOX = '504800,5457550,507150,5458900'

def fetch(url):
    with urllib.request.urlopen(url, timeout=90) as r:
        return r.read()

def layer(name, url, where='1=1'):
    params = dict(where=where, geometry=BBOX, geometryType='esriGeometryEnvelope', inSR=26910, spatialRel='esriSpatialRelIntersects', f='json', returnIdsOnly='true')
    query = url + '/query?'
    ids = json.loads(fetch(query + urllib.parse.urlencode(params)))
    if 'error' in ids: raise RuntimeError(ids['error'])
    ids = sorted(ids.get('objectIds') or [])
    features = []
    for start in range(0, len(ids), 75):
        p = dict(objectIds=','.join(map(str,ids[start:start+75])),outFields='*',outSR=26910,f='geojson',returnGeometry='true')
        d = json.loads(fetch(query + urllib.parse.urlencode(p)))
        if 'error' in d or d.get('exceededTransferLimit'): raise RuntimeError(d)
        features.extend(d['features'])
    if len(features) != len(ids): raise RuntimeError(f'{name}: incomplete response')
    data = json.dumps(dict(type='FeatureCollection',crs={'type':'name','properties':{'name':'EPSG:26910'}},features=features),separators=(',',':')).encode()
    (RAW / f'{name}.geojson').write_bytes(data)
    metadata = json.loads(fetch(url+'?f=json'))
    (RAW / f'{name}.metadata.json').write_text(json.dumps(metadata,indent=2))
    print(f'{name}: {len(features)} features, {len(data):,} bytes',flush=True)
    return dict(id=name,url=url,queryBounds=BBOX,crs='EPSG:26910',retrievedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),features=len(features),sha256=hashlib.sha256(data).hexdigest())

jobs = [
    ('sfu-buildings', SFU+'Vertisee_BuildingFloorplan_P_2020/MapServer/1'),
    ('sfu-contours-2018', SFU+'Vertisee_Contour2018/MapServer/0'),
    ('burnaby-buildings', BBY+'OpenData/OpenData4/MapServer/18'),
    ('burnaby-contours-2018', BBY+'OpenData/OpenData3/MapServer/14', 'METRE_CODE=5'),
]
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    sources = list(pool.map(lambda args: layer(*args),jobs))
(RAW/'sources.json').write_text(json.dumps(sources,indent=2))
