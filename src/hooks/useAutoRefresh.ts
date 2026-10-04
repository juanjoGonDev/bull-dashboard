"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const REFRESH_OPTIONS = [
  { value: 0, label: "Desactivado", short: "Off" },
  { value: 5000, label: "Cada 5 segundos", short: "5 s" },
  { value: 10000, label: "Cada 10 segundos", short: "10 s" },
  { value: 30000, label: "Cada 30 segundos", short: "30 s" },
  { value: 60000, label: "Cada minuto", short: "1 min" },
  { value: 300000, label: "Cada 5 minutos", short: "5 min" },
] as const;

/**
 * Temporizador estilo AWS:
 * - deadlineRef / cycleRef se leen desde la barra y la cuenta atrás SIN re-render de la página.
 * - Refresco manual = refresca + reinicia el ciclo al 100%.
 * - Pestaña oculta: no consulta (no satura Redis en segundo plano).
 * - Si hay errores, mantiene el intervalo elegido para que la cuenta atrás y la barra sigan sincronizadas.
 * - Si llega una petición mientras otra está en curso, se encola UNA re-ejecución.
 */
export function useAutoRefresh(onTick: () => Promise<void>, defaultMs = 10000) {
  const [intervalMs, setIntervalMs] = useState<number>(defaultMs);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [errorStreak, setErrorStreak] = useState(0);

  const deadlineRef = useRef<number>(0);
  const cycleRef = useRef<number>(defaultMs);
  const intervalRef = useRef<number>(defaultMs);
  const fnRef = useRef(onTick);
  fnRef.current = onTick;
  const busy = useRef(false);
  const pending = useRef(false);
  const streak = useRef(0);

  const schedule = useCallback((ms: number) => {
    cycleRef.current = ms > 0 ? ms : 1;
    deadlineRef.current = ms > 0 ? Date.now() + ms : 0;
  }, []);

  const run = useCallback(
    async (manual: boolean): Promise<boolean | null> => {
      if (busy.current) {
        if (manual) pending.current = true;
        return null;
      }
      if (!manual && typeof document !== "undefined" && document.hidden) {
        schedule(intervalRef.current);
        return null;
      }
      busy.current = true;
      setRefreshing(true);
      let ok = true;
      try {
        await fnRef.current();
        streak.current = 0;
        setLastRefresh(new Date());
      } catch {
        ok = false;
        streak.current += 1;
      } finally {
        busy.current = false;
        setErrorStreak(streak.current);
        const base = intervalRef.current;
        schedule(base);
        if (pending.current) {
          pending.current = false;
          // ejecuta la petición encolada (p. ej. cambio de pestaña durante un refresco)
          void run(true);
        } else {
          setRefreshing(false);
        }
      }
      return ok;
    },
    [schedule]
  );

  const manualRefresh = useCallback(() => {
    schedule(intervalRef.current);
    return run(true);
  }, [run, schedule]);

  const changeInterval = useCallback(
    (ms: number) => {
      intervalRef.current = ms;
      setIntervalMs(ms);
      schedule(ms);
      if (ms > 0) void run(true);
    },
    [run, schedule]
  );

  // Carga inicial
  useEffect(() => {
    schedule(intervalRef.current);
    void run(true);
  }, [run, schedule]);

  // Comprobación ligera del vencimiento (sin setState salvo al refrescar)
  useEffect(() => {
    if (intervalMs === 0) return;
    const id = window.setInterval(() => {
      const d = deadlineRef.current;
      if (d && Date.now() >= d) void run(false);
    }, 250);
    const onVis = () => {
      if (!document.hidden && deadlineRef.current && Date.now() >= deadlineRef.current) void run(false);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [intervalMs, run]);

  return { intervalMs, changeInterval, manualRefresh, refreshing, lastRefresh, errorStreak, deadlineRef, cycleRef };
}
