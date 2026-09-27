"""Acquire public exterior geometry only. Raw responses stay in ignored data/raw.
Run with Python 3; no credentials or operational source is accessed.
"""
import concurrent.futures, datetime, hashlib, json, pathlib, urllib.parse, urllib.request
from acquire_multicampus_config import BOUNDS

ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw/multicampus'
RAW.mkdir(parents=True, exist_ok=True)
SFU = 'https://viewsfu-prd.its.sfu.ca/fsgis/rest/services/Vertisee/Vertisee_BuildingFloorplan_P_2020/MapServer/66'
SURREY = 'https://services5.arcgis.com/YRpe0VKTJytZSSIB/arcgis/rest/services/Building%20Footprnts/FeatureServer/0'
VAN = 'https://opendata.vancouver.ca/api/explore/v2.1/catalog/datasets/'
# Extents include the nine Vancouver sites and the SFU Surrey city-centre/hospital sites.

def fetch(url):
    with urllib.request.urlopen(url, timeout=60) as response:
        data = response.read()
    parsed = json.loads(data)
    if isinstance(parsed, dict) and parsed.get('error'):
        raise RuntimeError('Public map query failed: ' + url.split('?')[0])
    return parsed

def save(name, value, url, **extra):
    data = json.dumps(value, separators=(',', ':')).encode()
    (RAW / (name + '.json')).write_bytes(data)
    return dict(id=name, url=url, retrievedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(), sha256=hashlib.sha256(data).hexdigest(), **extra)

def arcgis(name, url, params):
    query = url + '/query?'
    ids = fetch(query + urllib.parse.urlencode({**params, 'f':'json', 'returnIdsOnly':'true'}))['objectIds'] or []
    features = []
    for start in range(0, len(ids), 100):
        data = fetch(query + urllib.parse.urlencode(dict(objectIds=','.join(map(str, sorted(ids)[start:start+100])), outFields='*', outSR=26910, f='geojson')))
        if data.get('exceededTransferLimit'): raise RuntimeError('Truncated geometry response')
        features.extend(data['features'])
    assert len(features) == len(ids)
    return save(name, dict(type='FeatureCollection', features=features), url, crs='EPSG:26910', features=len(features))

def vancouver(name, dataset):
    url = VAN + dataset + '/exports/geojson'
    # API spatial filters use geographic coordinates, output is transformed by build-multicampus.py.
    query = dict(where="intersects(geom, GEOM'POLYGON((-123.123 49.279,-123.088 49.279,-123.088 49.290,-123.123 49.290,-123.123 49.279))')")
    data = fetch(url + '?' + urllib.parse.urlencode(query))
    return save(name, data, url + '?' + urllib.parse.urlencode(query), crs='EPSG:4326', features=len(data['features']))

def central_city_tower():
    url='https://api.openstreetmap.org/api/0.6/way/450312789/full.json'
    data=fetch(url)
    return save('central-city-osm',data,url,crs='EPSG:4326',attribution='© OpenStreetMap contributors',licence='https://opendatacommons.org/licenses/odbl/1-0/')

def gallery():
    url = 'https://geocoder.api.gov.bc.ca/addresses.geojson?' + urllib.parse.urlencode(dict(addressString='639 Hornby Street, Vancouver, BC', maxResults=1, outputSRS=4326))
    data = fetch(url)
    assert data['features'][0]['properties']['score'] >= 95
    return save('gallery-address', data, url, crs='EPSG:4326')

jobs = [
    lambda: arcgis('sfu-footprints', SFU, dict(where="Campus IN ('Vancouver','Surrey')")),
    lambda: arcgis('surrey-buildings', SURREY, dict(where='1=1', geometry=','.join(map(str,BOUNDS['surrey'])), geometryType='esriGeometryEnvelope', inSR=26910, spatialRel='esriSpatialRelIntersects')),
    lambda: vancouver('vancouver-heights-2009', 'building-footprints-2009'),
    lambda: vancouver('vancouver-footprints-2015', 'building-footprints-2015'),
    gallery,
    central_city_tower,
]
if __name__ == '__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        sources = list(pool.map(lambda job: job(), jobs))
    (RAW / 'sources.json').write_text(json.dumps(sources, indent=2))
    print(json.dumps([{k:v for k,v in s.items() if k in ('id','features')} for s in sources]))
