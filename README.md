# SFU Burnaby Campus Twin

An interactive 3D campus model with optional private live energy readings. The static viewer is hosted on [GitHub Pages](https://makonin.com/SFU-DigitalTwin/). A separate read-only connector on the viewer’s computer uses its SFU campus or VPN connection.

The model contains 77 official SFU features, 127 surrounding footprints, contour-derived terrain and Burnaby 2025 aerial imagery. Heights and roofs are approximate exterior massing. The supplied official SFU logo is in `public/brand/`.

## Run the complete local twin

Use Node 22.13+ and pnpm, and connect to the SFU VPN when off campus. The existing private connection settings are stored in `.private/foreseer.json`; never copy them into `public`, source control or a hosted environment.

```sh
pnpm install --frozen-lockfile
pnpm start:twin
```

If Node and pnpm are not on PATH on this computer, run `sh scripts/start-local.sh`; it can use the bundled local runtime.

Open the viewer at **http://127.0.0.1:4173/SFU-DigitalTwin/**. Select **Connect live data**, open the local connector page, copy its temporary code and choose **Pair this tab**. Pairing opens a small local connection window. Minimize that window and keep it open. Select a building to see its configured readings. Stop the terminal process with Ctrl+C to stop both services.

The code is single-use and expires after 10 minutes. A paired session lasts up to eight hours, stays in that tab’s memory and clears on reload. **Disconnect live data** immediately removes displayed readings and revokes the session. The connector must remain running, and its computer must retain SFU network access.

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
```

See [the unsent data request](docs/SFU-DATA-REQUEST-DRAFT.md) for obtaining the surveyed detail needed for a more complete digital twin.
