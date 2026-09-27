# SFU Campus Twin

Interactive 3D models of SFU Burnaby, Vancouver and Surrey campuses with optional private live energy readings. The static viewer is hosted on [GitHub Pages](https://makonin.com/SFU-DigitalTwin/). A separate read-only connector on the viewer’s computer uses its SFU campus or VPN connection.

The EV charging layer supports ChargePoint locations, per-port power, session status and overstay colours through the local connector. Enter API credentials only in the [local setup form](http://127.0.0.1:8787/chargepoint/setup); they are stored outside the project in this Mac's private application settings. See [ChargePoint setup and colour rules](docs/CHARGEPOINT.md).

Use the **Campus** selector to switch between Burnaby (77 campus features), Vancouver (nine listed locations) and Surrey (four building locations and the outdoor plaza). Each campus has surrounding buildings and its own downloadable GLB model. Burnaby includes contour-derived terrain and 2025 aerial imagery. Vancouver and Surrey use estimated ground from municipal building-base elevations; no aerial imagery is included for them. Vancouver heights/context use historical 2009 data and may predate redevelopment. Heights and roofs are approximate exterior massing. The supplied official SFU logo is in `public/brand/`.

## Use the hosted viewer

Open **https://makonin.com/SFU-DigitalTwin/** in Safari. On this computer, keep the SFU VPN connected and start the connector with `pnpm connector` (or run the complete local twin below). Choose **Connect live data**, copy a code from the local connector page and pair the tab. Minimize the resulting local connection window and keep it open.

The hosted Safari flow was verified with live SFU readings on September 6, 2026. Code and model assets are public; private settings and operational data remain local.

## Run the complete local twin

Use Node 22.13+ and pnpm, and connect to the SFU VPN when off campus. The existing private connection settings are stored in `.private/foreseer.json`; never copy them into `public`, source control or a hosted environment.

```sh
pnpm install --frozen-lockfile
pnpm start:twin
```

If Node and pnpm are not on PATH on this computer, run `sh scripts/start-local.sh`; it can use the bundled local runtime.

Open the viewer at **http://127.0.0.1:4173/SFU-DigitalTwin/**. Select **Connect live data**, open the local connector page, copy its temporary code and choose **Pair this tab**. Pairing opens a small local connection window. Minimize that window and keep it open. Select a building to see its configured readings. Stop the terminal process with Ctrl+C to stop both services.

The code is single-use and expires after 10 minutes. A paired session lasts up to eight hours, stays in that tab’s memory and clears on reload. **Disconnect live data** immediately removes displayed readings and revokes the session. The connector must remain running, and its computer must retain SFU network access.

Choose **Layers** beside the 3D/Plan controls, or open **Layers & sources**, to show or hide **Facilities Metering** and **EV Charging** independently. Facilities Metering controls meter readings and demand charts; EV Charging controls station markers, the station list, port details and the colour legend. Hidden layers stop polling and discard their displayed readings. Showing a layer resumes reads through the existing pairing. Switching campus preserves pairing and layer preferences, clears displayed observations, and requests only the selected campus’s inventory. Facilities readings use existing private mappings for official building codes; adding geometry does not establish meter coverage. Both layers start shown when the viewer opens. Campus geometry stays visible; aerial imagery and surrounding buildings have separate controls.

## Run components separately

```sh
pnpm connector
```

In another terminal:

```sh
pnpm build:pages
pnpm preview:pages
```

For development with the existing server framework, use `pnpm dev --host 127.0.0.1` alongside `pnpm connector`. The hosted `/api/energy` route always refuses operational requests; all live reads use the authenticated loopback connector.

## Public interface, private connection

The static output in `dist-pages/` contains geometry, source metadata and frontend code. Internal source addresses, device mappings, pairing codes and readings are not build inputs. The viewer opens a local connection window at `http://127.0.0.1:8787`. That window makes same-origin requests to the connector and passes results to its paired opener using messages checked against the viewer origin, window identity and connection nonce. This works with Safari’s HTTPS restrictions; the web host never relays energy requests.

The connector binds only to `127.0.0.1`. It checks the HTTP Host, viewer origin and session token. It serves a fixed read-only energy operation for a public building code; clients cannot select source URLs, arbitrary channels or write commands. Responses use `Cache-Control: no-store`. Sessions and recent readings are held in memory, and request bodies, tokens, source names and readings are not logged.

See [connector setup and browser compatibility](docs/LOCAL-CONNECTOR.md) and [source and modeling record](docs/DATA-AND-MODEL.md).

## Validate

```sh
pnpm exec tsc --noEmit
pnpm test
pnpm build:pages
pnpm check:public
pnpm build
```

The public-artifact check inspects JSON/GLB metadata and compares output against known private source values when the private configuration exists locally. It is a release safeguard, not a certification that arbitrary future changes are safe. Public releases use a clean `main` history. The original private prototype is preserved only in the local `private-legacy` branch; never push that branch or use `git push --all`.

## Reproduce geometry

Python dependencies: numpy, scipy, shapely, pyproj. Geometry generation uses public spatial data and does not require the legacy energy project.

```sh
python3 scripts/acquire-data.py
python3 scripts/build-model.py
node --experimental-strip-types scripts/export-model.mjs

# Vancouver and Surrey
python3 scripts/acquire-multicampus.py
python3 scripts/build-multicampus.py
node --experimental-strip-types scripts/export-model.mjs vancouver
node --experimental-strip-types scripts/export-model.mjs surrey
```

See [the unsent data request](docs/SFU-DATA-REQUEST-DRAFT.md) for obtaining the surveyed detail needed for a more complete digital twin.
