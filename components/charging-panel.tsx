'use client';
import { useEffect, useRef, useState } from 'react';
import { PlugZap, RefreshCw } from 'lucide-react';
import {
  CONNECTOR_URL,
  ConnectorError,
  readChargingStation,
  type ConnectorSession,
} from '@/lib/local-connector';
import type {
  ChargingPort,
  ChargingResponse,
  ChargingStation,
  ChargingStationResponse,
} from '@/lib/charging';
import type { CampusId } from '@/lib/campuses';
import { chargingPortState, CHARGING_LABELS } from '@/lib/charging-state';
export function portSessionLabel(port: ChargingPort) {
  if (port.inSession === true)
    return port.sessionEvidence === 'session'
      ? 'Session active'
      : 'In use · session inferred';
  return port.inSession === false ? 'Available' : 'Session status unknown';
}
export default function ChargingPanel({
  station,
  inventory,
  session,
  onSessionEnded,
  campusId,
}: {
  campusId: CampusId;
  station?: ChargingStation;
  inventory: ChargingResponse | null;
  session: ConnectorSession;
  onSessionEnded: () => void;
}) {
  const ended = useRef(onSessionEnded);
  useEffect(() => {
    ended.current = onSessionEnded;
  }, [onSessionEnded]);
  const [data, setData] = useState<ChargingStationResponse | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0),
    [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);
  const stationId = station?.id;
  useEffect(() => {
    if (!stationId) return;
    const life = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      setBusy(true);
      try {
        const next = await readChargingStation(
          session,
          stationId,
          life.signal,
          campusId,
        );
        if (!life.signal.aborted) {
          setData(next);
          setError('');
        }
      } catch (error) {
        if (!life.signal.aborted) {
          if (error instanceof ConnectorError && error.status === 401) {
            life.abort();
            ended.current();
            return;
          }
          setError(
            'Connection interrupted. Displayed observations may be stale.',
          );
        }
      } finally {
        if (!life.signal.aborted) {
          setBusy(false);
          timer = setTimeout(poll, 60_000);
        }
      }
    };
    queueMicrotask(() => {
      if (!life.signal.aborted) {
        setError('');
        void poll();
      }
    });
    return () => {
      life.abort();
      clearTimeout(timer);
    };
  }, [session, stationId, retry, campusId]);
  const useDetail =
    data &&
    (!inventory ||
      Date.parse(data.observedAt) >= Date.parse(inventory.observedAt));
  const current = useDetail ? data.station || station : station;
  const observedAt = useDetail ? data.observedAt : inventory?.observedAt;
  const stale = !!observedAt && clock - Date.parse(observedAt) > 120_000;
  return (
    <section className="energy-panel">
      <div className="section-heading">
        <PlugZap size={18} />
        <h3>EV charging</h3>
        <button
          className="refresh-button"
          disabled={busy || !station}
          onClick={() => setRetry((n) => n + 1)}
          aria-label="Refresh charging readings"
        >
          <RefreshCw size={15} className={busy ? 'spin' : ''} />
        </button>
      </div>
      {inventory?.status === 'not_configured' ? (
        <div className="energy-empty">
          <strong>Add your ChargePoint credentials</strong>
          <p>Use the local setup form. Credentials stay on this Mac.</p>
          <a
            className="connector-link"
            href={CONNECTOR_URL + '/chargepoint/setup'}
            target="_blank"
            rel="noreferrer"
          >
            Open local ChargePoint setup
          </a>
        </div>
      ) : !station ? (
        <p className="muted">
          {inventory?.message || 'Loading stations from your local connector…'}{' '}
          Select a station from the EV charging list or the map.
        </p>
      ) : (
        <>
          <p
            className={
              'connection-line ' +
              (!stale && data?.status === 'connected' ? 'connected' : '')
            }
          >
            <span className="live-dot" />
            {stale
              ? 'Stale observation'
              : busy && !data
                ? 'Reading station…'
                : data?.status === 'connected'
                  ? 'ChargePoint connected · 60 s polling'
                  : data?.status === 'partial'
                    ? 'Some station data unavailable'
                    : data?.status === 'unavailable'
                      ? 'Station unavailable'
                      : 'Station status loaded'}
          </p>
          {error && <output className="connection-error">{error}</output>}
          {current?.ports.map((port) => (
            <div
              className={'meter-card ev-' + chargingPortState(port, stale)}
              key={port.number}
            >
              <div className="meter-title">
                Port {port.number}{' '}
                <span
                  className={'ev-state ev-' + chargingPortState(port, stale)}
                >
                  {CHARGING_LABELS[chargingPortState(port, stale)]}
                </span>
              </div>
              <div className="reading">
                <strong>
                  {port.powerKw === null
                    ? '—'
                    : port.powerKw.toLocaleString('en-CA', {
                        maximumFractionDigits: 2,
                      })}
                </strong>
                <span>kW</span>
              </div>
              <p className="port-session">
                {stale ? 'Last observed: ' : ''}
                {portSessionLabel(port)}
              </p>
              <div className="channel-meta">
                {port.status === 'UNREACHABLE'
                  ? 'Station unreachable'
                  : port.powerKw !== null && port.powerKw > 0
                    ? 'Power flowing'
                    : port.powerKw === 0
                      ? 'No power flowing at observation'
                      : 'Power unavailable'}
              </div>
              {port.lastCommunicationAt && (
                <div className="channel-meta">
                  Last station communication:{' '}
                  {new Date(port.lastCommunicationAt).toLocaleString('en-CA', {
                    timeZone: 'America/Vancouver',
                  })}
                </div>
              )}
            </div>
          ))}
          {observedAt && (
            <p className="sample-note">
              Retrieved{' '}
              {new Date(observedAt).toLocaleTimeString('en-CA', {
                timeZone: 'America/Vancouver',
              })}{' '}
              Vancouver time. Power sample time is not supplied by the API.
            </p>
          )}
          <p className="sample-note">
            {data?.message || 'Per-port availability from ChargePoint.'}{' '}
            Overstay means an active session drawing zero kW, with no grace
            period. “In use” is an inference from port status.
          </p>
        </>
      )}
      <p className="sample-note">
        Locations and readings are loaded privately for this paired tab.{' '}
        <a
          className="connector-link"
          href={CONNECTOR_URL + '/chargepoint/setup'}
          target="_blank"
          rel="noreferrer"
        >
          Local API settings
        </a>
      </p>
    </section>
  );
}
