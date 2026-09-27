'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ConnectorError,
  readCharging,
  type ConnectorSession,
} from '@/lib/local-connector';
import type { CampusId } from '@/lib/campuses';
import type { ChargingResponse } from '@/lib/charging';
export function useCharging(
  session: ConnectorSession | null,
  onSessionEnded: () => void,
  campusId: CampusId = 'burnaby',
) {
  const ended = useRef(onSessionEnded);
  useEffect(() => {
    ended.current = onSessionEnded;
  }, [onSessionEnded]);
  const [result, setResult] = useState<{
      token: string;
      campusId: CampusId;
      data: ChargingResponse;
    } | null>(null),
    [failure, setFailure] = useState<{
      token: string;
      campusId: CampusId;
      message: string;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(0);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!session) {
      let cancelled = false;
      queueMicrotask(() => {
        if (!cancelled) {
          setResult(null);
          setFailure(null);
          setBusy(false);
        }
      });
      return () => {
        cancelled = true;
      };
    }
    const life = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      setBusy(true);
      try {
        const data = await readCharging(session, life.signal, campusId);
        if (!life.signal.aborted) {
          setResult({ token: session.token, campusId, data });
          setFailure(null);
        }
      } catch (error) {
        if (!life.signal.aborted) {
          if (error instanceof ConnectorError && error.status === 401) {
            life.abort();
            ended.current();
            return;
          }
          setFailure({
            token: session.token,
            campusId,
            message:
              'ChargePoint connection interrupted. Check the local connector.',
          });
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
        setFailure(null);
        void poll();
      }
    });
    return () => {
      life.abort();
      clearTimeout(timer);
    };
  }, [session, retry, campusId]);
  const data =
    session && result?.token === session.token && result.campusId === campusId
      ? result.data
      : null;
  return {
    data,
    clock,
    stale: !!data && clock - Date.parse(data.observedAt) > 120000,
    error:
      session &&
      failure?.token === session.token &&
      failure.campusId === campusId
        ? failure.message
        : '',
    busy: !!session && busy,
    refresh: () => setRetry((n) => n + 1),
  };
}
