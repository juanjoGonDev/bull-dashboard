"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Barra que decrece de 100% a 0% hasta el próximo refresco.
 * Se pinta con requestAnimationFrame directamente sobre el DOM (transform):
 * cero re-renders de React, cero reflow. Con "reducir movimiento" avanza a saltos de 1 s.
 * Es decorativa (aria-hidden); la información equivalente está en <Countdown>.
 */
export function RefreshBar({
  deadlineRef,
  cycleRef,
  enabled,
  reduceMotion,
}: {
  deadlineRef: RefObject<number>;
  cycleRef: RefObject<number>;
  enabled: boolean;
  reduceMotion: boolean;
}) {
  const fill = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    let timer = 0;
    const paint = () => {
      const d = deadlineRef.current;
      const c = cycleRef.current || 1;
      const r = enabled && d ? Math.max(0, Math.min(1, (d - Date.now()) / c)) : 0;
      if (fill.current) fill.current.style.transform = `scaleX(${r})`;
    };
    const osReduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || osReduce) {
      paint();
      timer = window.setInterval(paint, 1000);
    } else {
      const loop = () => {
        paint();
        raf = requestAnimationFrame(loop);
      };
      loop();
    }
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(timer);
    };
  }, [enabled, reduceMotion, deadlineRef, cycleRef]);

  return (
    <div className="refresh-track" aria-hidden="true">
      <div ref={fill} className="refresh-fill" />
    </div>
  );
}

/** Cuenta atrás en texto: alternativa textual de la barra. No es live-region (no satura al lector). */
export function Countdown({
  deadlineRef,
  enabled,
  refreshing,
  id,
  className = "",
}: {
  deadlineRef: RefObject<number>;
  enabled: boolean;
  refreshing: boolean;
  id?: string;
  className?: string;
}) {
  const [secs, setSecs] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const d = deadlineRef.current;
      setSecs(enabled && d ? Math.max(0, Math.ceil((d - Date.now()) / 1000)) : null);
    };
    tick();
    const i = window.setInterval(tick, 500);
    return () => window.clearInterval(i);
  }, [enabled, deadlineRef]);

  const text = !enabled
    ? "Actualización automática desactivada"
    : refreshing
      ? "Actualizando datos…"
      : `Próxima actualización en ${secs ?? "—"} s`;

  return (
    <span id={id} className={`truncate tnum ${className}`}>
      {text}
    </span>
  );
}
