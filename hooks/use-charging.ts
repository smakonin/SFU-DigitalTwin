'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ConnectorError,
  readCharging,
  type ConnectorSession,
} from '@/lib/local-connector';
import type { ChargingResponse } from '@/lib/charging';
export function useCharging(
  session: ConnectorSession | null,
  onSessionEnded: () => void,
) {
  const ended = useRef(onSessionEnded);
  useEffect(() => {
    ended.current = onSessionEnded;
  }, [onSessionEnded]);
  const [result, setResult] = useState<{
      token: string;
      data: ChargingResponse;
    } | null>(null),
    [error, setError] = useState(''),
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
          setError('');
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
        const data = await readCharging(session, life.signal);
        if (!life.signal.aborted) {
          setResult({ token: session.token, data });
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
            'ChargePoint connection interrupted. Check the local connector.',
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
  }, [session, retry]);
  return {
    data: session && result?.token === session.token ? result.data : null,
    clock,
    stale: !!result && clock - Date.parse(result.data.observedAt) > 120000,
    error: session ? error : '',
    busy: !!session && busy,
    refresh: () => setRetry((n) => n + 1),
  };
}
