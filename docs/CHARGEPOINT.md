# ChargePoint EV charging

ChargePoint station locations, per-port power and session status use the same paired local connection window as building energy data. The public website contains the interface only. The connector authenticates directly to ChargePoint over HTTPS and passes a limited response to the paired viewer.

## Add credentials on this Mac

1. Start the local twin with `sh scripts/start-local.sh` (or `pnpm start:twin`).
2. Open [local ChargePoint setup](http://127.0.0.1:8787/chargepoint/setup).
3. Enter the **Web Services API license key and password**. Select the account's region: **Canada** for the SFU account, with API **5.1**. Optionally provide a station group ID to narrow access and reduce API requests.
4. Choose **Save credentials on this Mac**. Existing saved credentials are replaced; they are never displayed again or returned by the API.
5. Open the [local viewer](http://127.0.0.1:4173/SFU-DigitalTwin/), pair it with the local connector and select **EV charging**. Keep the connection window open or minimized.

The settings file on macOS is `~/Library/Application Support/SFU-DigitalTwin/chargepoint.json`. It is outside the repository and iCloud Drive. The directory is restricted to its owner (0700) and the file is owner-readable/writable (0600). Writes replace the file atomically. Credentials are not GitHub Actions secrets, frontend environment variables, URL parameters or browser storage. Updating credentials does not require a connector restart.

The setup page accepts a write only from its own loopback origin, with a setup token and JSON content. It denies framing and cross-origin access and uses a restrictive Content Security Policy. The credential file is local JSON protected by filesystem permissions; it is not a Keychain item.

ChargePoint has separate production endpoints for Canada (`webservices-ca.chargepoint.com`), North America (`webservices.chargepoint.com`) and Europe (`webservices-eu.chargepoint.com`). The region must match the account; it is not selected automatically from the user's physical location or VPN. A Canadian key can be rejected as `InvalidSecurity` by the other North American endpoint. Only these fixed HTTPS hosts are permitted, and redirects are refused. Existing configuration without a region retains its previous `na` behavior until explicitly updated. Canada uses the documented 5.1 endpoint.

## Map and colour rules

The connector searches the account's accessible stations in Burnaby and retains those whose coordinates fall within the existing campus model extent. Missing or out-of-bounds coordinates are excluded. ChargePoint coordinates are projected into the campus NAD83 / UTM zone 10N coordinate system and placed on the interpolated terrain. Markers indicate reported locations, not surveyed equipment dimensions or parking-floor elevations.

| Colour | Per-port rule |
| --- | --- |
| Green | No active session, inferred from `AVAILABLE` status |
| Yellow | Active session and reported power greater than zero kW |
| Red | Active session and reported power exactly zero kW: **Overstay** |
| Grey | Missing/unknown session or power, unreachable station, or stale observation |

Overstay is the requested operational rule, without a grace period. An API session identifier confirms an active session, but the identifier itself is discarded. When it is absent, `INUSE` is explicitly labelled **session inferred**. Zero power alone never proves a session ended. A last-communication timestamp or browser observation older than two minutes makes the colour unknown. Missing last-communication time remains explicitly unavailable; power sample time is not supplied by the API.

For a station with multiple ports, its marker prioritizes red, then yellow, then grey, then green. Selecting the station shows each port separately, with text labels as well as colour. Unknown values are shown as a dash, never a fabricated zero. Disconnecting or reloading removes private locations and readings from the viewer. They are not included in the exported GLB.

## API behavior and privacy

The adapter supports three read-only Web Services operations: `getStations`, `getStationStatus`, and `getLoad`. It cannot send load-shedding, charging control, user-management or billing commands. It does not request charging-session history. API permissions determine whether the account can read station load and status; a valid login alone does not guarantee either permission.

If ChargePoint explicitly reports that the Cloud Plan does not permit `getLoad`, the viewer keeps available station/session status and explains why power is missing. Active sessions stay grey until live power is available; they are never assigned a zero or an overstay from a denied request. The connector backs off plan-denied load requests for 60 seconds. A successful empty station search is reported as an empty inventory, not an authentication failure.

Station inventory is cached in memory for 15 minutes; status and power for 60 seconds. Status reads are batched by station IDs. With a configured station group, one group load request is used; otherwise load is fetched per displayed station. Upstream concurrency is limited to four, with eight-second individual timeouts and a 22-second snapshot deadline. Incomplete results are marked partial. A selected station has an independent 60-second cache.

Only station display name, coordinates, an opaque local station key, port number, bounded status, power in kW, observation/communication times and a session boolean/evidence label are passed to the browser. Raw SOAP, API credentials, upstream station IDs, session IDs, user/driver details, vehicle identifiers, card identifiers and payment data are excluded. Provider errors are replaced with generic messages. Readings are not written to disk or logged.

- `GET /v1/charging`: authenticated campus station snapshot.
- `GET /v1/charging/station?id=ev-…`: authenticated per-station reading, restricted to the local inventory.
- `/chargepoint/setup`: local-only setup form; no credential read-back route.

Both read routes require the existing paired session and origin checks. A disconnected session cannot receive a pending response. The local connection window only exposes these fixed operations; the browser cannot choose provider endpoints, SOAP operations or raw station IDs.

## Verification

Synthetic tests cover credential validation/storage, fixed HTTPS destination, XML escaping and unsafe XML rejection, pagination, campus filtering, caching, response minimization, partial failures, zero-power active sessions, colour priority, stale/unknown state handling, local setup CSRF checks, and authenticated relay access. Live account validation requires credentials entered through the local form; synthetic tests do not establish account permissions or actual station availability.

Protocol references: [ChargePoint 5.1 WSDL](https://webservices.chargepoint.com/cp_api_5.1.wsdl), [deployed Web Services operations](https://webservices.chargepoint.com/webservices/chargepoint/services/5.1), and [official API setup guide](https://na.chargepoint.com/UI/s3docs/docs/help/SetupWebServicesAPI.pdf).
