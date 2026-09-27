'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Building2,
  Search,
  RotateCcw,
  ArrowUpRight,
  Download,
  Map,
  Box,
  Database,
  ChevronRight,
  Mountain,
  PlugZap,
  RefreshCw,
  Layers,
} from 'lucide-react';
import { useCampusTools } from '@/hooks/use-campus-tools';
import { assetPath } from '@/lib/runtime-mode';
import LiveConnection from '@/components/live-connection';
import { type ConnectorSession } from '@/lib/local-connector';
import EnergyPanel from '@/components/energy-panel';
import CampusViewer from '@/components/campus-viewer';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  CAMPUSES,
  CAMPUS_IDS,
  isCampusId,
  type CampusId,
} from '@/lib/campuses';
import type { Campus } from '@/lib/campus-types';
import { useCharging } from '@/hooks/use-charging';
import ChargingPanel from '@/components/charging-panel';
import { chargingStationState, CHARGING_LABELS } from '@/lib/charging-state';
export default function Home() {
  const [campusId, setCampusId] = useState<CampusId>('burnaby');
  const definition = CAMPUSES[campusId];
  const [loaded, setLoaded] = useState<{ id: CampusId; data: Campus } | null>(
    null,
  );
  const campus = loaded?.id === campusId ? loaded.data : null;
  const [error, setError] = useState(''),
    [selected, setSelected] = useState('sfu-55'),
    [selectionRevision, setSelectionRevision] = useState(0),
    [query, setQuery] = useState(''),
    [aerial, setAerial] = useState(true),
    [context, setContext] = useState(true),
    [facilitiesMetering, setFacilitiesMetering] = useState(true),
    [evCharging, setEvCharging] = useState(true),
    [inspectorTab, setInspectorTab] = useState('inspect'),
    [view, setView] = useState('orbit'),
    [reset, setReset] = useState(0);
  const detailsPanel = useRef<HTMLElement>(null);
  const openLayers = () => {
    setInspectorTab('layers');
    detailsPanel.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });
  };
  useEffect(() => {
    const life = new AbortController();
    document.title = `SFU ${definition.name} · Campus Twin`;
    fetch(assetPath(`${definition.directory}/campus.json`), {
      signal: life.signal,
    })
      .then((r) => {
        if (!r.ok) throw Error('Campus data unavailable');
        return r.json() as Promise<Campus>;
      })
      .then((data) => {
        if (!life.signal.aborted) setLoaded({ id: campusId, data });
      })
      .catch((e) => {
        if (!life.signal.aborted) setError(e.message);
      });
    return () => life.abort();
  }, [campusId, definition]);
  useCampusTools(campus, setSelected);
  const [session, setSession] = useState<ConnectorSession | null>(null),
    [connectionMessage, setConnectionMessage] = useState('');
  const updateSession = (next: ConnectorSession | null) => {
    setSession(next);
    setConnectionMessage('');
  };
  const expireSession = () => {
    setSession(null);
    setConnectionMessage(
      'Your connection has ended. Pair this tab again to resume live readings.',
    );
  };
  const [assetMode, setAssetMode] = useState('buildings');
  const charging = useCharging(
    evCharging ? session : null,
    expireSession,
    campusId,
  );
  const changeCampus = (id: string) => {
    if (!isCampusId(id)) return;
    setCampusId(id);
    setSelected(CAMPUSES[id].initialBuilding);
    setAssetMode('buildings');
    setQuery('');
    setError('');
    setReset((n) => n + 1);
  };
  const stations = evCharging ? charging.data?.stations || [] : [];
  const station = stations.find((s) => s.id === selected);
  const toggleEvCharging = (show: boolean) => {
    setEvCharging(show);
    if (!show && assetMode === 'charging') {
      setAssetMode('buildings');
      setQuery('');
    }
    if (!show && selected.startsWith('ev-'))
      setSelected(definition.initialBuilding);
  };
  const chooseBuilding = (id: string) => {
    if (id.startsWith('ev-') && !evCharging) return;
    setSelected(id);
    setSelectionRevision((n) => n + 1);
    setAssetMode(id.startsWith('ev-') ? 'charging' : 'buildings');
    setInspectorTab('inspect');
  };
  const building = campus?.buildings.find((b) => b.id === selected);
  const visible =
    campus?.buildings.filter(
      (b) =>
        b.source === 'sfu' &&
        (b.name + ' ' + b.abbr + ' ' + b.buildingCode)
          .toLowerCase()
          .includes(query.toLowerCase()),
    ) || [];
  return (
    <main className="twin-app">
      <header className="topbar">
        <div className="brand">
          <img
            className="sfu-mark"
            src={assetPath('brand/SFU_block_colour_rgb_1000px.png')}
            alt="Simon Fraser University"
            width={1000}
            height={500}
          />
          <div>
            <strong>
              {definition.name}
              <span className="brand-separator">/</span>Campus twin
            </strong>
            <small>SIMON FRASER UNIVERSITY · EXPLORATORY MODEL</small>
          </div>
        </div>
        <div className="top-actions">
          <span className="status-badge">
            <i />{' '}
            {session
              ? 'Local connector paired'
              : 'Campus model · live data disconnected'}
          </span>
          <a
            className="quiet-button"
            href={assetPath(`${definition.directory}/sfu-${campusId}.glb`)}
            download
          >
            <Download size={16} /> Export model
          </a>
        </div>
      </header>
      <div className="workspace">
        <aside className="asset-panel">
          <label className="campus-picker" htmlFor="campus-select">
            <span className="eyebrow">CAMPUS</span>
            <select
              id="campus-select"
              value={campusId}
              onChange={(event) => changeCampus(event.target.value)}
            >
              {CAMPUS_IDS.map((id) => (
                <option key={id} value={id}>
                  {CAMPUSES[id].name}
                  {id === 'vancouver' ? ' · Downtown' : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">CAMPUS EXPLORER</span>
              <h1>{assetMode === 'charging' ? 'EV charging' : 'Buildings'}</h1>
            </div>
            <span className="count">
              {assetMode === 'charging'
                ? stations.length
                : (campus?.stats.campusFeatures ?? '—')}
            </span>
          </div>
          <div className="asset-modes">
            <button
              aria-pressed={assetMode === 'buildings'}
              onClick={() => {
                setAssetMode('buildings');
                setQuery('');
                if (selected.startsWith('ev-'))
                  setSelected(definition.initialBuilding);
              }}
            >
              <Building2 size={15} />
              Buildings
            </button>
            <button
              aria-pressed={assetMode === 'charging'}
              disabled={!evCharging}
              title={
                !evCharging ? 'Show EV Charging in Layers & sources' : undefined
              }
              onClick={() => {
                setAssetMode('charging');
                setQuery('');
                if (!selected.startsWith('ev-') && stations[0])
                  setSelected(stations[0].id);
              }}
            >
              <PlugZap size={15} />
              EV charging
            </button>
          </div>
          <label className="search">
            <Search size={17} />
            <input
              placeholder={
                assetMode === 'charging'
                  ? 'Find a station…'
                  : 'Find a building or code…'
              }
              aria-label="Find a campus asset"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="asset-summary">
            <span>
              {assetMode === 'charging'
                ? 'Private ChargePoint inventory'
                : 'SFU building registry'}
            </span>
            <span>
              {assetMode === 'charging' ? (
                <button
                  onClick={charging.refresh}
                  disabled={charging.busy || !session}
                  aria-label="Refresh charging stations"
                >
                  <RefreshCw size={14} />
                </button>
              ) : (
                `${visible.length} features`
              )}
            </span>
          </div>
          <div className="asset-list">
            {assetMode === 'charging' ? (
              <>
                {!session && (
                  <p className="empty">
                    Pair the local connector to load station locations and live
                    status.
                  </p>
                )}
                {charging.busy && !charging.data && (
                  <p className="empty">Loading ChargePoint stations…</p>
                )}
                {charging.error && (
                  <output className="empty block">{charging.error}</output>
                )}
                {charging.data &&
                  (charging.data.status !== 'connected' ||
                    !stations.length) && (
                    <p className="empty">{charging.data.message}</p>
                  )}
                {charging.stale && (
                  <p className="empty">Station observations are stale.</p>
                )}
                {stations
                  .filter((s) =>
                    s.name.toLowerCase().includes(query.toLowerCase()),
                  )
                  .map((s) => (
                    <button
                      key={s.id}
                      className={
                        'asset-row ' + (selected === s.id ? 'selected' : '')
                      }
                      onClick={() => chooseBuilding(s.id)}
                    >
                      <span className="building-icon">
                        <PlugZap size={17} />
                      </span>
                      <span>
                        <strong>{s.name}</strong>
                        <small>
                          {s.ports.length} ports ·{' '}
                          <span
                            className={
                              'ev-state ev-' +
                              chargingStationState(s, charging.stale)
                            }
                          >
                            {
                              CHARGING_LABELS[
                                chargingStationState(s, charging.stale)
                              ]
                            }
                          </span>
                        </small>
                      </span>
                      <ChevronRight size={14} />
                    </button>
                  ))}
              </>
            ) : (
              visible.map((b) => (
                <button
                  key={b.id}
                  className={
                    'asset-row ' + (selected === b.id ? 'selected' : '')
                  }
                  onClick={() => chooseBuilding(b.id)}
                >
                  <span className="building-icon">
                    <Building2 size={17} />
                  </span>
                  <span>
                    <strong>{b.name}</strong>
                    <small>
                      {b.abbr}
                      {b.buildingCode
                        ? ` · ${b.buildingCode}`
                        : ' · Affiliated site'}
                      {b.kind === 'plaza' ? ' · Outdoor plaza' : ''}
                    </small>
                  </span>
                  <ChevronRight size={14} />
                </button>
              ))
            )}
            {assetMode === 'buildings' && query && !visible.length && (
              <p className="empty">No matching campus buildings.</p>
            )}
            {error && (
              <p className="empty" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="registry-note">
            <Database size={16} />
            <span>
              {assetMode === 'charging'
                ? 'ChargePoint · private connection'
                : definition.registry}
              <br />
              <small>
                {assetMode === 'charging'
                  ? '60 s polling · this paired tab'
                  : `Retrieved ${definition.retrieved}`}
              </small>
            </span>
          </div>
        </aside>
        <section className="model-panel" aria-label="3D campus model">
          <div className="scene-heading">
            <span className="eyebrow">{definition.heading}</span>
            <h2>A campus, in context.</h2>
            <p>{definition.coordinates}</p>
          </div>
          {campus ? (
            <CampusViewer
              key={campusId}
              campusId={campusId}
              campus={campus}
              selected={selected}
              selectionRevision={selectionRevision}
              onSelect={chooseBuilding}
              chargingStations={stations}
              chargingStale={charging.stale}
              chargingClock={charging.clock}
              showCharging={evCharging && !!session}
              aerial={aerial && !!definition.aerial}
              context={context}
              view={view}
              reset={reset}
            />
          ) : (
            <div className="model-loading">
              {error || 'Loading campus geometry…'}
            </div>
          )}
          <div className="scene-tools">
            <button
              className={view === 'orbit' ? 'active' : ''}
              onClick={() => setView('orbit')}
            >
              <Box size={16} />
              3D
            </button>
            <button
              className={view === 'plan' ? 'active' : ''}
              onClick={() => setView('plan')}
            >
              <Map size={16} />
              Plan
            </button>
            <button
              className={inspectorTab === 'layers' ? 'active' : ''}
              aria-expanded={inspectorTab === 'layers'}
              aria-controls="campus-layers"
              onClick={openLayers}
            >
              <Layers size={16} />
              Layers
            </button>
            <button
              title="Reset campus view"
              aria-label="Reset campus view"
              onClick={() => setReset((n) => n + 1)}
            >
              <RotateCcw size={16} />
            </button>
          </div>
          <div className="scene-footer">
            {session && evCharging && (
              <div className="ev-legend" aria-label="EV station colours">
                <span className="ev-available">● No session</span>
                <span className="ev-charging">● Charging</span>
                <span className="ev-overstay">● Overstay</span>
                <span className="ev-unknown">● Unknown</span>
              </div>
            )}
            <span>Drag to orbit · Scroll to zoom · Right-drag to pan</span>
            <span>Flat-roof massing · True horizontal scale</span>
          </div>
        </section>
        <aside className="details-panel" ref={detailsPanel}>
          <Tabs
            value={inspectorTab}
            onValueChange={(value) => setInspectorTab(String(value))}
          >
            <TabsList className="inspector-tabs">
              <TabsTrigger value="inspect">Inspect</TabsTrigger>
              <TabsTrigger value="layers">Layers & sources</TabsTrigger>
            </TabsList>
            <TabsContent value="inspect" keepMounted>
              <div className="inspector-content">
                <span className="eyebrow">
                  {station
                    ? 'CHARGEPOINT STATION'
                    : building && assetMode === 'buildings'
                      ? building.kind === 'plaza'
                        ? 'SELECTED PLAZA'
                        : 'SELECTED BUILDING'
                      : 'CAMPUS OPERATIONS'}
                </span>
                <h2>
                  {station?.name ||
                    (assetMode === 'charging'
                      ? 'EV charging'
                      : building?.name) ||
                    'Connect place to performance.'}
                </h2>
                <p className="muted">
                  {station
                    ? `${station.latitude.toFixed(5)}° N · ${Math.abs(station.longitude).toFixed(5)}° W`
                    : assetMode === 'charging'
                      ? 'Private station locations, status and power.'
                      : building
                        ? `${building.abbr}${building.buildingCode ? ` · Building ${building.buildingCode}` : ' · Affiliated site'}`
                        : 'Select a building to inspect its geometry and source information.'}
                </p>
                {assetMode === 'buildings' && building?.occupancy && (
                  <div className="site-note">
                    <strong>{building.address}</strong>
                    <p>{building.occupancy}</p>
                    <a
                      href={building.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      SFU location details <ArrowUpRight size={13} />
                    </a>
                  </div>
                )}
                {assetMode === 'buildings' && (
                  <div className="metric-grid">
                    <div>
                      <small>
                        {building ? 'Footprint' : 'Campus features'}
                      </small>
                      <strong>
                        {building
                          ? building.areaM2.toLocaleString()
                          : (campus?.stats.campusFeatures ?? '—')}
                        <em>{building ? 'm²' : ''}</em>
                      </strong>
                    </div>
                    <div>
                      <small>
                        {building
                          ? building.kind === 'plaza'
                            ? 'Surface offset'
                            : building.parts && building.parts.length > 1
                              ? 'Maximum model height'
                              : 'Model height'
                          : 'Context features'}
                      </small>
                      <strong>
                        {building
                          ? building.heightM
                          : (campus?.stats.contextFeatures ?? '—')}
                        <em>{building ? 'm' : ''}</em>
                      </strong>
                    </div>
                  </div>
                )}
                {assetMode === 'buildings' && building && (
                  <div className="data-note">
                    <Mountain size={17} />
                    <span>
                      {building.heightStatus}
                      {building.parts && building.parts.length > 1 && (
                        <small>
                          {building.parts.length} roof sections ·{' '}
                          {Math.min(...building.parts.map((p) => p.heightM))}–
                          {building.heightM} m
                        </small>
                      )}
                      <small>
                        Ground {building.groundM} m · {definition.groundLabel}
                      </small>
                    </span>
                  </div>
                )}
                <LiveConnection
                  session={session}
                  onChange={updateSession}
                  message={connectionMessage}
                />
                {session && evCharging && assetMode === 'charging' && (
                  <ChargingPanel
                    key={campusId + session.token + station?.id}
                    campusId={campusId}
                    station={station}
                    inventory={charging.data}
                    session={session}
                    onSessionEnded={expireSession}
                  />
                )}
                {session && facilitiesMetering && assetMode === 'buildings' && (
                  <EnergyPanel
                    key={campusId + session.token + building?.id}
                    building={building}
                    session={session}
                    onSessionEnded={expireSession}
                  />
                )}
                {!facilitiesMetering && assetMode === 'buildings' && (
                  <div className="layer-hidden-note">
                    <p>Facilities Metering is hidden.</p>
                    <button onClick={openLayers}>Manage data layers</button>
                  </div>
                )}
                <div className="quality-note">
                  <span className="eyebrow">MODEL CONFIDENCE</span>
                  <p>
                    {campusId === 'burnaby'
                      ? 'Official footprints. Interpolated terrain. Approximate heights. Roof details and façades need LiDAR or BIM.'
                      : 'Public SFU and city footprints. Approximate exterior heights and ground. Shared buildings include space occupied by other tenants.'}
                  </p>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="layers" id="campus-layers">
              <div className="inspector-content">
                <span className="eyebrow">DATA LAYERS</span>
                <h2>Choose what to show.</h2>
                <p className="muted">
                  Show or hide each layer independently. Hidden layers pause
                  their live updates.
                </p>
                <label className="layer-row" htmlFor="layer-facilities">
                  <span>
                    <strong>Facilities Metering</strong>
                    <small>Meter readings and demand charts</small>
                    <small className="layer-visibility">
                      {facilitiesMetering ? 'Shown' : 'Hidden'}
                    </small>
                  </span>
                  <Switch
                    id="layer-facilities"
                    aria-label="Facilities Metering"
                    checked={facilitiesMetering}
                    onCheckedChange={setFacilitiesMetering}
                  />
                </label>
                <label className="layer-row" htmlFor="layer-charging">
                  <span>
                    <strong>EV Charging</strong>
                    <small>Station locations, status and power</small>
                    <small className="layer-visibility">
                      {evCharging ? 'Shown' : 'Hidden'}
                    </small>
                  </span>
                  <Switch
                    id="layer-charging"
                    aria-label="EV Charging"
                    checked={evCharging}
                    onCheckedChange={toggleEvCharging}
                  />
                </label>
                {!session && (
                  <p className="sample-note">
                    Pair the local connector to load live data for the layers
                    you show.
                  </p>
                )}
                <h3 className="layer-group-heading">BASE MAP</h3>
                <label className="layer-row" htmlFor="layer-aerial">
                  <span>
                    <strong>Aerial imagery</strong>
                    <small>{definition.imageryLabel}</small>
                  </span>
                  <Switch
                    id="layer-aerial"
                    aria-label="Aerial imagery"
                    checked={aerial && !!definition.aerial}
                    disabled={!definition.aerial}
                    onCheckedChange={setAerial}
                  />
                </label>
                <label className="layer-row" htmlFor="layer-context">
                  <span>
                    <strong>Surrounding buildings</strong>
                    <small>
                      {definition.city} open data
                      {campusId === 'vancouver' ? ' · historical 2009' : ''}
                    </small>
                  </span>
                  <Switch
                    id="layer-context"
                    aria-label="Surrounding buildings"
                    checked={context}
                    onCheckedChange={setContext}
                  />
                </label>
                <div className="source-links">
                  <a
                    href="https://www.sfu.ca/fs/campus-maps/mapping-services.html"
                    target="_blank"
                    rel="noreferrer"
                  >
                    SFU mapping services
                    <ArrowUpRight size={16} />
                  </a>
                  <a href={definition.mapUrl} target="_blank" rel="noreferrer">
                    Campus locations
                    <ArrowUpRight size={16} />
                  </a>
                  <a
                    href={assetPath(`${definition.directory}/sources.json`)}
                    target="_blank"
                  >
                    Source manifest
                    <ArrowUpRight size={16} />
                  </a>
                </div>
                <div className="quality-note">
                  <h3>Geometry limitations</h3>
                  {campus?.limitations.map((s) => (
                    <p key={s}>{s}</p>
                  ))}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </aside>
      </div>
      <footer className="bottom-bar">
        <span>
          <span className="live-dot" />{' '}
          {session
            ? 'Private data connection · this browser only'
            : 'Public campus geometry'}
        </span>
        <span>
          SFU Facilities Services · {definition.attribution}
          {campus?.attributions?.map((source) => (
            <span key={source.url}>
              {' '}
              ·{' '}
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.text}
              </a>
            </span>
          ))}
        </span>
      </footer>
    </main>
  );
}
