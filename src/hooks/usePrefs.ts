"use client";

import { useCallback, useEffect, useState } from "react";

export interface Prefs {
  fontScale: number; // índice en FONT_SCALES
  contrast: boolean;
  reduceMotion: boolean;
  announce: boolean; // anunciar refrescos automáticos al lector de pantalla
  shortcuts: boolean; // atajos de una tecla (desactivables, WCAG 2.1.4)
}

export const FONT_SCALES = [
  { label: "Pequeño", pct: 87.5 },
  { label: "Normal", pct: 100 },
  { label: "Grande", pct: 112.5 },
  { label: "Muy grande", pct: 125 },
  { label: "Enorme", pct: 150 },
] as const;

export const DEFAULT_PREFS: Prefs = {
  fontScale: 1,
  contrast: false,
  reduceMotion: false,
  announce: false,
  shortcuts: true,
};

const KEY = "bullboard:prefs";

function apply(p: Prefs) {
  const d = document.documentElement;
  d.dataset.fs = String(p.fontScale);
  d.dataset.contrast = p.contrast ? "high" : "normal";
  d.dataset.motion = p.reduceMotion ? "reduce" : "normal";
}

export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<Prefs>;
      const merged = { ...DEFAULT_PREFS, ...raw };
      merged.fontScale = Math.min(FONT_SCALES.length - 1, Math.max(0, Number(merged.fontScale) || 0));
      setPrefs(merged);
    } catch {
      /* noop */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    apply(prefs);
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      /* noop */
    }
  }, [prefs, loaded]);

  const update = useCallback((patch: Partial<Prefs>) => setPrefs((p) => ({ ...p, ...patch })), []);
  const reset = useCallback(() => setPrefs(DEFAULT_PREFS), []);

  return { prefs, update, reset };
}
