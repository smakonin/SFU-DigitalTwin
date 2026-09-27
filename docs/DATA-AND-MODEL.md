# SFU campus twin — source and modeling record

Prepared September 5, 2026. This is an operational prototype with approximate exterior massing, not a completed survey-grade digital twin.

## Recovered official mapping endpoints

The public ViewSFU application still works at https://viewsfu.its.sfu.ca/apps/vertisee/public/. Its LocalLayer configuration exposes these working public services:

- Building overview: https://viewsfu-prd.its.sfu.ca/fsgis/rest/services/Vertisee/Vertisee_BuildingFloorplan_P_2020/MapServer/1
- One-metre contours (2018): https://viewsfu-prd.its.sfu.ca/fsgis/rest/services/Vertisee/Vertisee_Contour2018/MapServer/0

The service name includes 2020, but its current records include Gibson Art Museum and First Peoples Gathering House. Do not infer individual feature survey dates from the service name. The query retrieved 77 SFU features, including multiple structures sharing a building code. A feature is not necessarily one independently operated building.

The public application labels laser scanning, LiDAR hillshade, survey data and utilities as admin-only placeholders. Those layers were not accessed. SFU confirms it maintains these datasets at https://www.sfu.ca/fs/campus-maps/mapping-services.html. Key plans require a valid ID: https://www.sfu.ca/fs/campus-maps/key-plans.html.

## Secondary data

- Burnaby building footprints and height fields: https://gis.burnaby.ca/arcgis/rest/services/OpenData/OpenData4/MapServer/18
- Burnaby 2018 five-metre contours: https://gis.burnaby.ca/arcgis/rest/services/OpenData/OpenData3/MapServer/14
- Burnaby 2025 orthophoto: https://gis.burnaby.ca/arcgis/rest/services/Burnaby_Ortho_2025/MapServer
- Burnaby licence: https://data.burnaby.ca/pages/open-government-licence

Contains information licensed under the Open Government Licence – City of Burnaby. SFU data are credited to SFU Facilities Services; public access alone does not establish an open redistribution licence. Public code and model assets are delivered through GitHub Pages; operational configuration and readings remain local.

Raw spatial queries, SHA-256 hashes and retrieval times are in data/raw/sources.json and public/data/sources.json. Raw geographic downloads remain local and can be reproduced with scripts/acquire-data.py.

## Geometry construction

- Working CRS: NAD83 / UTM zone 10N, EPSG:26910. Coordinates are converted by the source ArcGIS services.
- Extent: easting 504800–507150 m; northing 5457550–5458900 m. Context is a rectangular study area, not a surveyed campus boundary.
- Model origin: easting 506000 m, northing 5458225 m, elevation 300 m. Scene X is east, Y is up and Z is south. All scene units are metres. The GLB carries this origin in its root node extras; it is not automatically georeferenced by every GLB reader.
- Terrain: 10 m mesh from SFU one-metre contour vertices, supplemented with city five-metre contours. Contours are clipped with a 50 m margin and simplified by 1 m before linear interpolation; nearest-neighbour fills the convex-hull edge. It is a contour-derived surface, not a LiDAR DTM. Vertical datum is not specified by the queried service metadata and remains unconfirmed.
- Buildings: SFU footprints with courtyard holes retained; city footprints provide surrounding context. City polygons with substantial SFU overlap are excluded from context to reduce duplication.
- Heights: largest overlapping city footprint with at least 25% overlap supplies HEIGHT_2018, then HEIGHT as fallback. Metres are an assumption pending confirmation; stored raw fields, join overlap and source object IDs support review. A 9 m placeholder is explicitly marked where a usable height is absent. Heights are not inferred from floor labels.
- Each mass sits at its centroid's interpolated ground elevation and has a flat roof. Stepped slabs, terrain intersections, raised structures, actual roof forms, façade openings, interiors, structural detail, underground networks and accessibility routes are not reconstructed.
- Export: GLB includes terrain, buildings and source metadata. The orthophoto is used in the interactive viewer; it is omitted from the portable GLB. The file is a massing model, not a textured photogrammetric reconstruction.

## Private energy integration

The read-only connector is adapted from the supplied legacy energy client. Its private source address and meter mappings are held in `.private/foreseer.json`, outside the static build. See [the local connector guide](LOCAL-CONNECTOR.md) for setup and access controls.

- A paired browser requests only its selected building. The connector caches a response for 60 seconds and limits upstream concurrency. No control, acknowledgement or configuration commands are exposed.
- Each channel must return the configured device, demand measurement name and kW units. Mismatches, blank and non-finite values become unavailable rather than zero. Non-Normal quality is flagged.
- The UI keeps up to 60 observations per channel in tab memory. Foreseer does not provide a sensor sample timestamp through this interface: `observedAt` is the retrieval time and `sampledAt` stays null. Observations older than two minutes are marked stale.
- Readings are never summed into building or campus totals because the electrical hierarchy and coverage are not yet validated.
- The static host does not receive operational readings. A paired local window relays readings to the viewer using checked window messages, supporting Safari without HTTPS-to-HTTP fetches. The VPN runs on the connector’s computer.

## Validation

The model checks cover finite coordinates, terrain dimensions, official feature count, unique IDs, AQ courtyard retention and GLB georeferencing metadata. Connector tests cover pairing expiry/reuse, origin and Host restrictions, preflight headers, session expiry/revocation, read-only requests, caching and source failures. See [the connector guide](LOCAL-CONNECTOR.md) for browser-test results and remaining compatibility limits. Survey accuracy and electrical coverage are not certified by these checks.

## Next work for a detailed operational twin

1. Obtain permissioned SFU LAS/LAZ scans, DTM/DSM, roof breaklines, georeferenced IFC/Revit/DWG and published CRS/vertical datum/accuracy metadata. Prioritize AQ, Library, Convocation Mall and the central service corridors.
2. Replace block massing with surveyed roofs and façade detail, then register the model to known survey control. Define horizontal and vertical tolerances before acceptance.
3. Validate every meter-to-building alias with Facilities; map parent/child electrical feeds, units, CT/PT multipliers, generator feeds and net import/export. Confirm authoritative sample timestamps and historian access.
4. Operate a read-only gateway inside SFU's approved network, with authenticated access, retention, monitoring and an approved outbound transport to the hosted twin. Do not expose Foreseer directly to the public internet.
5. Add a time-series store, trend queries, freshness SLAs and quality-aware alarms only after the electrical semantics are confirmed. A trustworthy building or campus total is then possible.


## Vancouver and Surrey — September 27, 2026

The public [SFU exterior footprint layer 66](https://viewsfu-prd.its.sfu.ca/fsgis/rest/services/Vertisee/Vertisee_BuildingFloorplan_P_2020/MapServer/66) contains eight Vancouver and five Surrey features, with official three-digit building codes. The site registry in `data/campus-sites.json` combines these with SFU’s [Vancouver locations](https://www.sfu.ca/vancouver/about/our-locations.html) and [Surrey locations](https://www.sfu.ca/surrey/about/our-locations.html). The ninth Vancouver location, the SFU collection at Bill Reid Gallery, uses a municipal 2015 footprint matched to the BC Geocoder’s public address point. It has no invented SFU building code or meter mapping. This is host-building massing; gallery rooms, SFU floors and ownership boundaries are not identified.

Surrey includes Central City, University Drive, WearTech Labs in City Centre 2, SFU imaging space at Surrey Memorial Hospital, and the outdoor plaza. The plaza is a surface following the terrain mesh with a 0.2 m display offset. Central City separates a 32.82 m podium from a 111.27 m office tower. The tower footprint comes from [OpenStreetMap way 450312789](https://www.openstreetmap.org/way/450312789), credited to OpenStreetMap contributors under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Its reusable source geometry is included as `public/data/surrey/central-city-tower.geojson`. Both heights come from the municipal dataset and remain approximate. Shared buildings are labelled individually in the inspector. New sites without a verified footprint are not included.

Sources and methods:

- [Vancouver 2009 building footprints](https://opendata.vancouver.ca/explore/dataset/building-footprints-2009/): segmented LiDAR massing, `hgt_agl` heights and `baseelev_m` building-base elevations. This historical dataset can predate redevelopment; it is not current roof geometry. [2015 footprints](https://opendata.vancouver.ca/explore/dataset/building-footprints-2015/) supply the gallery’s host footprint. [City licence](https://opendata.vancouver.ca/pages/licence/).
- [Surrey building footprints](https://services5.arcgis.com/YRpe0VKTJytZSSIB/arcgis/rest/services/Building%20Footprnts/FeatureServer/0): `BUILDING_HEIGHT` (metres) and `GROUND_ELEVATION`. [City licence](https://data.surrey.ca/pages/open-government-licence-surrey).
- Baseline footprint matching chooses the largest intersection exceeding 25% of the SFU footprint. Central City uses distinct podium and tower parts; the broad north podium context no longer inherits the tower height. Vancouver assigns complete historical roof sections to a campus building when at least half of the city section matches its footprint; the original registry area remains unchanged. Matched roof overhangs are removed from city context so they highlight with the rest of the building; small intersections with neighbouring towers are rejected. Harbour Centre’s base is cut around its separate tower and matched tower roof extent to prevent duplicate selection surfaces. Unmatched heights use explicit placeholders. Every campus feature records its height method, overlap and source geometry; multi-part features include section heights and source object IDs, and their displayed height is the maximum; no field is a survey certification.
- Surrounding city geometry is clipped against the study extent and campus footprints to avoid obscuring campus exteriors. Vancouver context contains historical roof components, not one record per building.
- Ground is a 15 m grid interpolated from municipal building-base points with nearest-neighbour edge fill. It is not a surveyed DTM; its vertical datum is unverified. No aerial imagery is provided for these campuses.
- Both use EPSG:26910. Vancouver extent: `[491100, 5458550, 493500, 5459400]`, origin `[492300, 5458975, 17]`. Surrey extent: `[510600, 5446750, 511750, 5448800]`, origin `[511175, 5447775, 78]`. Coordinates are metres; scene X is east, Y is up, Z is south.
- Each `public/data/<campus>/sources.json` records retrieval URLs, dates and source hashes. The companion GLB contains public geometry and provenance only.

Facilities Metering continues to request official building codes from the existing private configuration. No private mappings are inferred, created or published by this model extension. EV discovery, station detail caches and browser observations are isolated by campus. Account permissions determine available stations and power readings.


### Rendering corrections

Building sections share one selectable asset ID, so selecting Central City highlights its podium and tower together. Harbour Centre and its separately listed tower retain separate selections without overlapping base geometry. Selected materials keep depth testing and receive a small depth bias to stabilize coincident roof seams. Plaza vertices follow the exact terrain triangles rather than a single centroid elevation. Regression checks verify tower proportions and height, exported tower geometry, selection/reset across all sections, Harbour Centre separation, and plaza clearance above the ground. These checks address rendering consistency, not surveyed accuracy.
