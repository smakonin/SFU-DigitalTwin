# Local live-data connector

The same static frontend can be served locally or from GitHub Pages. Its browser sends private requests to a connector on the same computer, which uses that computer’s SFU network/VPN access. GitHub does not need a VPN and does not process the readings.

```mermaid
flowchart LR
  Host[Static website host] -->|Interface and public model|Browser[Browser]
  Browser <-->|Paired local session|Connector[127.0.0.1 connector]
  Connector <-->|Read-only requests through SFU VPN|Source[Private SFU energy source]
```

## Start and pair

1. Connect this computer to the SFU network or VPN.
2. Run `pnpm start:twin`, or `sh scripts/start-local.sh` when using the bundled runtime on this computer.
3. Open `http://127.0.0.1:4173/SFU-DigitalTwin/` and choose **Connect live data**.
4. Open the local connector page at `http://127.0.0.1:8787/`. Copy its temporary pairing code and paste it into the viewer.
5. Choose **Pair this tab** and allow local network access if prompted. Select a building with a configured private meter mapping.

Each pairing code expires after 10 minutes and works once. **New code** on the local connector page generates a replacement. Sessions expire after eight hours, clear from the browser on reload and can be revoked with **Disconnect live data**. Restarting the connector ends all sessions. No token is saved in browser storage or sent in a URL.

## Private configuration

The working configuration is already in `.private/foreseer.json`. It contains the upstream `baseUrl` and a `meters` array of `{buildingCode, channelId, device}` entries. Keep this file and the supplied legacy energy files private. They are not copied into the static build or the hosted app.

Optional `.private/connector.json` can replace the viewer origin allowlist:

```json
{
  "allowedOrigins": [
    "https://smakonin.github.io",
    "http://127.0.0.1:4173"
  ]
}
```

An origin includes the scheme, hostname and port, with no path or trailing slash. GitHub Pages project paths share the account’s origin. Pair only the intended viewer; origin checking is combined with a random session token. Configuration changes require restarting the connector.

The default list permits the intended GitHub Pages origin and loopback development/preview origins on ports 3000 and 4173. Additional remote origins must use HTTPS. The connector itself always binds to `127.0.0.1:8787`; it does not listen on LAN or VPN interfaces.

## Browser behavior

The viewer uses an explicit loopback destination, CORS and browser local-network permission where supported. It sends no cookies, disables request caching, rejects redirects and holds the session token in memory. The static page restricts network destinations to its own origin and the loopback connector using Content Security Policy.

Connecting a VPN supplies network reachability; it does not override browser rules. See [MDN CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS) and [local network access](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Local_network_access). Do not disable browser security protections to make a connection work.

If pairing fails:

- **Cannot reach connector:** confirm the connector is running on this same computer and check local-network permission.
- **Website not allowed:** add the exact viewer origin to the private allowlist and restart the connector.
- **Invalid or expired code:** open the local connector page and generate a new code.
- **SFU source unreachable:** check the VPN and the source service. Pairing with the local connector does not prove the upstream source is reachable.
- **No meter mapping:** the selected public building code has no private mapping. No values are invented.

## API and privacy controls

- `POST /v1/session` exchanges a one-use pairing code for an origin-bound token.
- `GET /v1/energy?code=004` reads that building’s configured private meters with `Authorization: Bearer …`.
- `DELETE /v1/session` revokes the current session.
- The pairing management page is available only through direct loopback navigation. It denies embedding and does not enable CORS.
- Host validation protects against requests addressed to other hostnames. All data requests require an explicitly allowed Origin and valid token. Preflights permit only the expected methods and headers.
- Client requests cannot choose upstream addresses, channel IDs or write commands. Responses use `Cache-Control: no-store`; connector logs contain no private source configuration, tokens or readings.
- Recent reads are cached in connector memory for 60 seconds. The UI keeps up to 60 observations in memory per selected meter. There is no operational database, telemetry upload or history export.
- Demand remains individual meter readings. Electrical coverage and hierarchy are unverified, so the app does not calculate building or campus totals. Source sample timestamps are unavailable and remain explicitly marked as such.

## Verification record — September 6, 2026

Automated tests cover pairing reuse/expiry, session origin binding and expiry, disconnection during a pending read, missing authentication, unapproved origins, Host validation, allowed preflight headers, read caching, forbidden upstream parameters, pairing rate limits and source failure handling.

The static production build was tested in the Codex in-app browser on loopback: invalid pairing was rejected; valid pairing displayed live Library and Blusson Hall readings over SFU VPN; changing to an unmapped building removed prior readings and displayed an explicit missing-mapping message. Automatic polling produced changing values and session charts. Disconnecting removed the readings, and reloading returned to the unpaired state. The official logo and 3D model rendered correctly.

Testing from the intended GitHub Pages HTTPS origin follows the local tests. Browser compatibility must be verified from that deployed origin; passing a local test alone does not establish remote-to-local network compatibility.

The public-artifact check scans the static assets and GLB/JSON metadata for operational fields and known private source values. Existing private Git history is outside this check and must be replaced with a reviewed clean history before any public source push.
