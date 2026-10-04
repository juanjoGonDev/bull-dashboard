"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";
import { Btn, Num, Ago, StateBadge, ProgressMini, stateMeta } from "@/components/ui";
import { RefreshBar, Countdown } from "@/components/RefreshBar";
import { ConfirmDialog } from "@/components/Dialog";
import { AddJobDialog } from "@/components/AddJobDialog";
import { JobDetailDialog } from "@/components/JobDetailDialog";
import { useAutoRefresh, REFRESH_OPTIONS } from "@/hooks/useAutoRefresh";
import { FONT_SCALES, usePrefs, type Prefs } from "@/hooks/usePrefs";
import type { Counts, JobDetail, JobRow, QueueInfo, RedisInfo } from "@/lib/types";

const PER_PAGE = 15;
const VIEWS = ["overview", "jobs", "settings"] as const;
type View = (typeof VIEWS)[number];
type SortField = "created" | "id" | "name" | "state" | "progress" | "attempts";
type SortDir = "asc" | "desc";
type QueueActionKey = "pause" | "resume" | "retry-failed" | "clean-completed" | "drain";
type ConfirmConfig = { title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm: () => void };

type UrlState = {
  view: View;
  queue: string;
  status: string;
  search: string;
  page: number;
  sort: SortField;
  dir: SortDir;
  refresh: number;
  collapsed: boolean;
  font: number | null;
  contrast: boolean | null;
  motion: boolean | null;
  announce: boolean | null;
  shortcuts: boolean | null;
};

const STATES = [
  { id: "all", label: "Todos", dot: "#6b7280" },
  { id: "waiting", label: "En espera", dot: "#2563eb" },
  { id: "active", label: "Activos", dot: "#d97706" },
  { id: "delayed", label: "Retrasados", dot: "#7c3aed" },
  { id: "completed", label: "Completados", dot: "#059669" },
  { id: "failed", label: "Fallidos", dot: "#dc2626" },
  { id: "paused", label: "Pausados", dot: "#6b7280" },
] as const;
const SORTS: { id: SortField; label: string }[] = [
  { id: "created", label: "Fecha de creación" },
  { id: "id", label: "ID" },
  { id: "name", label: "Nombre" },
  { id: "state", label: "Estado" },
  { id: "progress", label: "Progreso" },
  { id: "attempts", label: "Intentos" },
];
const REFRESH_LABELS: Record<number, string> = { 0: "Desactivado", 5000: "Cada 5 s", 10000: "Cada 10 s", 30000: "Cada 30 s", 60000: "Cada 1 min", 300000: "Cada 5 min" };
const VIEW_META: Record<View, { label: string; description: string; icon: IconName }> = {
  overview: { label: "Resumen", description: "Estado general de tus colas", icon: "grid" },
  jobs: { label: "Jobs", description: "Explora, filtra y administra trabajos", icon: "inbox" },
  settings: { label: "Ajustes", description: "Preferencias del panel y accesibilidad", icon: "sliders" },
};

const defaultUrl: UrlState = { view: "overview", queue: "", status: "all", search: "", page: 1, sort: "created", dir: "desc", refresh: 10000, collapsed: false, font: null, contrast: null, motion: null, announce: null, shortcuts: null };

function parseUrl(): UrlState {
  if (typeof window === "undefined") return defaultUrl;
  const p = new URL(window.location.href).searchParams;
  const view = VIEWS.includes((p.get("view") || "overview") as View) ? (p.get("view") as View) : "overview";
  const sort = SORTS.some((x) => x.id === p.get("sort")) ? (p.get("sort") as SortField) : "created";
  const refresh = Number(p.get("refresh"));
  const validRefresh = REFRESH_OPTIONS.some((x) => x.value === refresh);
  const bool = (key: string): boolean | null => p.has(key) ? p.get(key) === "1" : null;
  return {
    view: view || "overview",
    queue: p.get("queue") || "",
    status: STATES.some((x) => x.id === p.get("status")) ? p.get("status") || "all" : "all",
    search: p.get("q") || "",
    page: Math.max(1, Math.min(1000, Number(p.get("page")) || 1)),
    sort,
    dir: p.get("dir") === "asc" ? "asc" : "desc",
    refresh: validRefresh ? refresh : 10000,
    collapsed: p.get("nav") === "collapsed",
    font: p.has("font") ? Math.max(0, Math.min(FONT_SCALES.length - 1, Number(p.get("font")) || 0)) : null,
    contrast: bool("contrast"), motion: bool("motion"), announce: bool("announce"), shortcuts: bool("shortcuts"),
  };
}

function numberText(n: number) { return n.toLocaleString("es-ES"); }
function jobLabel(job: JobRow) { return `Job ${job.id}, ${job.name}, ${stateMeta(job.state).label}, progreso ${Math.round(job.progress || 0)} por ciento`; }

function SortIndicator({ active, dir }: { active: boolean; dir: SortDir }) {
  return <span aria-hidden="true" className={active ? "text-accent" : "text-subtle"}>{active ? (dir === "asc" ? "↑" : "↓") : "↕"}</span>;
}

export default function Dashboard() {
  const [url, setUrl] = useState(defaultUrl);
  const [ready, setReady] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [refreshMenuOpen, setRefreshMenuOpen] = useState(false);
  const [queues, setQueues] = useState<QueueInfo[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [total, setTotal] = useState(0);
  const [mode, setMode] = useState<"redis" | "demo">("demo");
  const [redis, setRedis] = useState<RedisInfo | null>(null);
  const [booted, setBooted] = useState(false);
  const [draftSearch, setDraftSearch] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const [live, setLive] = useState("");
  const [alert, setAlert] = useState("");
  const { prefs, update: updatePrefs, reset: resetPrefs } = usePrefs();

  const urlRef = useRef(url); urlRef.current = url;
  const prefsRef = useRef(prefs); prefsRef.current = prefs;
  const abortRef = useRef<AbortController | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const refreshMenuRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<number>(0);
  const lastRequest = useRef("");
  const autoAnnounce = useRef(false);
  const refreshSynced = useRef(false);

  useEffect(() => {
    const initial = parseUrl();
    setUrl(initial); setDraftSearch(initial.search); setReady(true);
    const pop = () => { const next = parseUrl(); setUrl(next); setDraftSearch(next.search); setMobileMenu(false); setRefreshMenuOpen(false); };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);

  useEffect(() => {
    if (!refreshMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!refreshMenuRef.current?.contains(event.target as Node)) setRefreshMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setRefreshMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [refreshMenuOpen]);

  const updateUrl = useCallback((patch: Partial<UrlState>, push = false) => {
    if (typeof window === "undefined") return;
    const next = { ...urlRef.current, ...patch };
    const p = new URLSearchParams();
    p.set("view", next.view);
    if (next.queue) p.set("queue", next.queue);
    p.set("status", next.status);
    if (next.search) p.set("q", next.search);
    p.set("page", String(next.page));
    p.set("sort", next.sort); p.set("dir", next.dir); p.set("refresh", String(next.refresh));
    if (next.collapsed) p.set("nav", "collapsed");
    if (next.font !== null) p.set("font", String(next.font));
    if (next.contrast !== null) p.set("contrast", next.contrast ? "1" : "0");
    if (next.motion !== null) p.set("motion", next.motion ? "1" : "0");
    if (next.announce !== null) p.set("announce", next.announce ? "1" : "0");
    if (next.shortcuts !== null) p.set("shortcuts", next.shortcuts ? "1" : "0");
    window.history[push ? "pushState" : "replaceState"]({}, "", `${window.location.pathname}?${p.toString()}`);
    setUrl(next);
  }, []);

  const announce = useCallback((text: string, error = false, visual = true) => {
    if (visual) {
      setToast({ text, error }); window.clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => setToast(null), 4500);
    }
    const set = error ? setAlert : setLive; set(""); window.setTimeout(() => set(text), 60);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = draftSearch.trim();
      if (next !== url.search) updateUrl({ search: next, page: 1 }, false);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [draftSearch, url.search, updateUrl]);

  useEffect(() => {
    if (!ready) return;
    const patch: Partial<Prefs> = {};
    if (url.font !== null) patch.fontScale = url.font;
    if (url.contrast !== null) patch.contrast = url.contrast;
    if (url.motion !== null) patch.reduceMotion = url.motion;
    if (url.announce !== null) patch.announce = url.announce;
    if (url.shortcuts !== null) patch.shortcuts = url.shortcuts;
    if (Object.keys(patch).length) updatePrefs(patch);
  }, [ready, url.font, url.contrast, url.motion, url.announce, url.shortcuts, updatePrefs]);

  const setAccessibility = (patch: Partial<Prefs>) => {
    updatePrefs(patch);
    updateUrl({ ...(patch.fontScale === undefined ? {} : { font: patch.fontScale }), ...(patch.contrast === undefined ? {} : { contrast: patch.contrast }), ...(patch.reduceMotion === undefined ? {} : { motion: patch.reduceMotion }), ...(patch.announce === undefined ? {} : { announce: patch.announce }), ...(patch.shortcuts === undefined ? {} : { shortcuts: patch.shortcuts }) }, false);
  };

  const fetchJobs = useCallback((state: UrlState, queue: string, signal: AbortSignal) => {
    const p = new URLSearchParams({ status: state.status, page: String(state.page), perPage: String(PER_PAGE), search: state.search, sort: state.sort, dir: state.dir });
    return fetch(`/api/queues/${encodeURIComponent(queue)}/jobs?${p.toString()}`, { signal, cache: "no-store" }).then((r) => r.json());
  }, []);

  const refreshAll = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController(); abortRef.current = controller;
    const signal = controller.signal; const requested = { ...urlRef.current }; let queue = requested.queue;
    try {
      const overviewPromise = fetch("/api/queues", { signal, cache: "no-store" }).then((r) => r.json());
      const redisPromise = fetch("/api/redis", { signal, cache: "no-store" }).then((r) => r.json());
      const jobsPromise = requested.view === "jobs" && queue ? fetchJobs(requested, queue, signal) : null;
      const overview = await overviewPromise;
      const list: QueueInfo[] = Array.isArray(overview?.queues) ? overview.queues : [];
      if (list.length && (!queue || !list.some((x) => x.name === queue))) {
        queue = list[0].name;
        if (!requested.queue) updateUrl({ queue }, false);
      }
      const jobsAfter = requested.view === "jobs" && queue && !jobsPromise ? fetchJobs({ ...requested, page: 1 }, queue, signal) : jobsPromise;
      const [jobData, redisData] = await Promise.all([jobsAfter || Promise.resolve(null), redisPromise]);
      if (signal.aborted) return;
      setQueues(list); setMode(overview?.mode || "demo"); setRedis(redisData || null);
      if (requested.view === "jobs") { setJobs(Array.isArray(jobData?.jobs) ? jobData.jobs : []); setTotal(typeof jobData?.total === "number" ? jobData.total : 0); }
      else { setJobs([]); setTotal(0); }
      lastRequest.current = `${requested.view}|${queue}|${requested.status}|${requested.search}|${requested.page}|${requested.sort}|${requested.dir}`;
      setBooted(true);
      if (autoAnnounce.current && prefsRef.current.announce) announce(`Datos actualizados a las ${new Date().toLocaleTimeString("es-ES")}`, false, false);
    } catch (error) {
      if ((error as Error)?.name !== "AbortError") throw error;
    }
  }, [announce, fetchJobs, updateUrl]);

  const tick = useCallback(async () => { try { await refreshAll(); } finally { autoAnnounce.current = true; } }, [refreshAll]);
  const { intervalMs, changeInterval, manualRefresh, refreshing, lastRefresh, errorStreak, deadlineRef, cycleRef } = useAutoRefresh(tick, 10000);

  useEffect(() => {
    if (!ready || refreshSynced.current) return;
    refreshSynced.current = true;
    if (url.refresh !== 10000) changeInterval(url.refresh);
  }, [ready, url.refresh, changeInterval]);

  useEffect(() => { if (errorStreak === 1) announce("Error de conexión. Reintentando con espera progresiva.", true); }, [errorStreak, announce]);

  useEffect(() => {
    if (!ready) return;
    const key = `${url.view}|${url.queue}|${url.status}|${url.search}|${url.page}|${url.sort}|${url.dir}`;
    if (key === lastRequest.current) return;
    autoAnnounce.current = false; void manualRefresh();
  }, [ready, url.view, url.queue, url.status, url.search, url.page, url.sort, url.dir, manualRefresh]);

  const selectedQueue = useMemo(() => queues.find((q) => q.name === url.queue) || null, [queues, url.queue]);
  const totals = useMemo(() => queues.reduce((acc, q) => ({ waiting: acc.waiting + q.counts.waiting, active: acc.active + q.counts.active, delayed: acc.delayed + q.counts.delayed, completed: acc.completed + q.counts.completed, failed: acc.failed + q.counts.failed, paused: acc.paused + q.counts.paused, prioritized: acc.prioritized + q.counts.prioritized, total: acc.total + q.counts.total }), { waiting: 0, active: 0, delayed: 0, completed: 0, failed: 0, paused: 0, prioritized: 0, total: 0 } as Counts), [queues]);
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const statusLabel = STATES.find((s) => s.id === url.status)?.label || "Todos";

  const navigate = (view: View, push = true) => { setMobileMenu(false); updateUrl({ view }, push); };
  const chooseQueue = (queue: string) => {
    setMobileMenu(false);
    updateUrl({ view: "jobs", queue, status: "all", search: "", page: 1, sort: "created", dir: "desc" }, true);
  };
  const setRefresh = (value: number) => { updateUrl({ refresh: value }, false); changeInterval(value); announce(value === 0 ? "Actualización automática desactivada" : `Actualización automática ${REFRESH_OPTIONS.find((x) => x.value === value)?.label.toLowerCase()}`, false, false); };
  const userRefresh = async () => { autoAnnounce.current = false; const result = await manualRefresh(); if (result === true) announce(`Datos actualizados a las ${new Date().toLocaleTimeString("es-ES")}`); if (result === false) announce("No se pudieron actualizar los datos. Se reintentará automáticamente.", true); };

  const queueAction = async (action: QueueActionKey, message: string) => {
    if (!url.queue) return; setBusy(action);
    try {
      const response = await fetch(`/api/queues/${encodeURIComponent(url.queue)}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }).then((r) => r.json());
      if (response.error) throw new Error(response.error); announce(`${message} en ${url.queue}`); await manualRefresh();
    } catch (error) { announce(`No se pudo completar la acción: ${error instanceof Error ? error.message : "error desconocido"}`, true); }
    finally { setBusy(null); }
  };
  const askQueueAction = (action: QueueActionKey, message: string) => {
    if (action === "clean-completed") setConfirm({ title: `¿Limpiar completados de ${url.queue}?`, message: "Se borrará el historial de jobs completados.", confirmLabel: "Limpiar", onConfirm: () => void queueAction(action, message) });
    else if (action === "drain") setConfirm({ title: `¿Vaciar la cola ${url.queue}?`, message: "Se eliminarán los jobs en espera y retrasados. No se puede deshacer.", confirmLabel: "Vaciar cola", danger: true, onConfirm: () => void queueAction(action, message) });
    else void queueAction(action, message);
  };
  const loadDetail = async (id: string) => {
    if (!url.queue) return; setDetailId(id); setDetailLoading(true); setDetail(null);
    try { const response = await fetch(`/api/queues/${encodeURIComponent(url.queue)}/jobs/${encodeURIComponent(id)}`, { cache: "no-store" }).then((r) => r.json()); if (response.job) setDetail(response.job); else announce(`No se encontró el job ${id}.`, true); }
    catch { announce("No se pudo cargar el detalle del job.", true); } finally { setDetailLoading(false); }
  };
  const jobAction = async (id: string, action: "retry" | "remove" | "promote" | "fail") => {
    if (!url.queue) return; setBusy(`${action}:${id}`);
    try { const response = await fetch(`/api/queues/${encodeURIComponent(url.queue)}/jobs/${encodeURIComponent(id)}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }).then((r) => r.json()); if (response.error) throw new Error(response.error); announce(`Job ${id}: ${action} correcto`); if (action === "remove") { setDetailId(null); setDetail(null); } else if (detailId === id) void loadDetail(id); await manualRefresh(); }
    catch (error) { announce(`No se pudo completar la acción sobre el job ${id}: ${error instanceof Error ? error.message : "error"}`, true); }
    finally { setBusy(null); }
  };
  const askJobAction = (id: string, action: "retry" | "remove" | "promote" | "fail") => {
    if (action === "remove") setConfirm({ title: `¿Eliminar el job ${id}?`, message: `Se borrará definitivamente de ${url.queue}.`, confirmLabel: "Eliminar", danger: true, onConfirm: () => void jobAction(id, action) });
    else if (action === "fail") setConfirm({ title: `¿Marcar el job ${id} como fallido?`, message: "Dejará de procesarse y pasará a fallidos.", confirmLabel: "Marcar fallido", danger: true, onConfirm: () => void jobAction(id, action) });
    else void jobAction(id, action);
  };
  const sortBy = (field: SortField) => updateUrl({ sort: field, dir: url.sort === field && url.dir === "asc" ? "desc" : url.sort === field ? "asc" : field === "created" ? "desc" : "asc", page: 1 }, true);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!prefsRef.current.shortcuts || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input,textarea,select,[contenteditable=true],[role=dialog],[role=alertdialog]")) return;
      if (event.key === "/") { event.preventDefault(); searchRef.current?.focus(); }
      if (event.key === "n") { event.preventDefault(); setShowAdd(true); }
      if (event.key === "r") { event.preventDefault(); void userRefresh(); }
    };
    document.addEventListener("keydown", key); return () => document.removeEventListener("keydown", key);
  }, [userRefresh]);

  if (!ready) return <div className="grid min-h-dvh place-items-center bg-bg text-sm text-subtle">Cargando BullBoard…</div>;
  const pageMeta = VIEW_META[url.view];
  const modeText = mode === "redis" ? "Conectado a Redis" : "Modo demostración: datos locales";

  return <>
    <a href="#main-content" className="skip-link">Saltar al contenido principal</a>
    <div id="app-shell" className="flex min-h-dvh flex-col bg-bg text-ink lg:h-dvh lg:overflow-hidden">
      <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-panel px-3 sm:gap-3 lg:px-4">
        <button type="button" aria-label="Abrir menú" aria-expanded={mobileMenu} onClick={() => setMobileMenu(true)} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-line-strong lg:hidden"><Icon name="grid" size={18} /></button>
        <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-ink"><Icon name="layers" size={18} /></span>
        <div className="min-w-0"><h1 className="truncate text-base font-bold">BullBoard</h1><p className="hidden truncate text-xs text-subtle sm:block">Bull y BullMQ</p></div>
        <span title={modeText} className={`inline-flex h-6 w-6 shrink-0 items-center justify-center gap-1.5 rounded-full border text-xs font-bold sm:w-20 ${mode === "redis" ? "border-green-300 bg-ok-bg text-ok" : "border-amber-300 bg-warn-bg text-warn"}`}><span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: mode === "redis" ? "#16a34a" : "#d97706" }} /><span aria-hidden="true" className="hidden sm:inline">{mode === "redis" ? "REDIS" : "DEMO"}</span><span className="sr-only">{modeText}</span></span>
        <span className="min-w-0 flex-1" />
        <div className="hidden max-w-xs shrink-0 items-center gap-2 rounded-lg border border-line bg-bg px-2.5 py-1.5 xl:flex"><Icon name="db" size={14} className="text-subtle" /><span className="min-w-0 truncate text-xs text-muted">{redis ? (redis.connected ? `${redis.url} · ${redis.latencyMs} ms` : "Sin Redis · demo local") : "Conectando…"}</span></div>
        <div ref={refreshMenuRef} className="relative shrink-0">
          <button type="button" aria-describedby="refresh-countdown" aria-haspopup="menu" aria-expanded={refreshMenuOpen} onClick={() => setRefreshMenuOpen((open) => !open)} title="Cambiar frecuencia de actualización" className="inline-flex h-11 shrink-0 items-center gap-2 rounded-lg border border-line-strong bg-panel px-2.5 text-sm font-medium text-muted hover:bg-soft lg:h-9 lg:px-3"><Icon name="refresh" size={15} /><span className="hidden sm:inline">{REFRESH_LABELS[intervalMs] || "Actualización"}</span><Icon name="chevd" size={13} /></button>
          {refreshMenuOpen && <div role="menu" aria-label="Frecuencia de actualización" className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-line bg-panel p-2 shadow-xl">{REFRESH_OPTIONS.map((option) => { const active = intervalMs === option.value; return <button key={option.value} type="button" role="menuitemradio" aria-checked={active} onClick={() => { setRefresh(option.value); setRefreshMenuOpen(false); }} className={`flex min-h-11 w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm ${active ? "border-accent bg-accent text-accent-ink" : "border-line bg-panel text-muted hover:border-line-strong hover:bg-soft"}`}><Icon name="refresh" size={14} /><span className="min-w-0 flex-1"><span className="block truncate font-semibold">{option.label}</span><span className={`block truncate text-xs ${active ? "text-accent-ink/80" : "text-subtle"}`}>{option.value === 0 ? "Sin refresco automático" : `Intervalo ${option.short}`}</span></span>{active && <Icon name="check" size={14} />}</button>; })}</div>}
        </div>
        <Btn icon="refresh" size="sm" tone="dark" srLabel="Actualizar ahora y reiniciar el temporizador" title="Actualizar ahora" spinning={refreshing} onClick={() => void userRefresh()} className="lg:!h-9 lg:!w-9" />
        <Btn icon="a11y" size="sm" srLabel="Ir a ajustes de accesibilidad" title="Ajustes de accesibilidad" onClick={() => navigate("settings")} className="lg:!h-9 lg:!w-9" />
        <Countdown id="refresh-countdown" deadlineRef={deadlineRef} enabled={intervalMs > 0} refreshing={refreshing} className="sr-only xl:not-sr-only xl:block xl:w-40 xl:shrink-0 xl:text-xs xl:text-subtle" />
        <RefreshBar deadlineRef={deadlineRef} cycleRef={cycleRef} enabled={intervalMs > 0} reduceMotion={prefs.reduceMotion} />
      </header>
      <div className="flex min-h-0 flex-1"><Sidebar view={url.view} collapsed={url.collapsed} mobileOpen={mobileMenu} queues={queues} selectedQueue={url.queue} booted={booted} onNavigate={navigate} onQueue={chooseQueue} onClose={() => setMobileMenu(false)} onToggle={() => updateUrl({ collapsed: !url.collapsed }, false)} />
        <main id="main-content" ref={mainRef} tabIndex={-1} className="min-w-0 flex-1 overflow-y-auto outline-none"><div className="mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-5 lg:px-7 lg:py-6">
          <div className="mb-5 flex min-h-14 items-center gap-3"><span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent text-accent-ink"><Icon name={pageMeta.icon} size={20} /></span><div className="min-w-0 flex-1"><h2 className="truncate text-xl font-bold tracking-tight sm:text-2xl">{pageMeta.label}</h2><p className="truncate text-sm text-subtle">{pageMeta.description}</p></div>{url.view === "overview" && <Btn icon="plus" label="Nuevo job" tone="dark" size="sm" onClick={() => setShowAdd(true)} />}{url.view === "jobs" && <Btn icon="grid" label="Resumen" size="sm" onClick={() => navigate("overview")} />}{url.view === "settings" && <Btn icon="grid" label="Resumen" size="sm" onClick={() => navigate("overview")} />}</div>
          {url.view === "overview" && <Overview queues={queues} totals={totals} booted={booted} mode={mode} redis={redis} onQueue={chooseQueue} onJobs={() => navigate("jobs")} />}
          {url.view === "jobs" && <Jobs selected={selectedQueue} url={url} updateUrl={updateUrl} jobs={jobs} total={total} pages={Math.max(1, Math.ceil(total / PER_PAGE))} booted={booted} draftSearch={draftSearch} setDraftSearch={setDraftSearch} searchRef={searchRef} statusLabel={statusLabel} busy={busy} refreshing={refreshing} onQueueAction={askQueueAction} onDetail={loadDetail} onJobAction={askJobAction} onSort={sortBy} onNew={() => setShowAdd(true)} />}
          {url.view === "settings" && <Settings prefs={prefs} update={setAccessibility} reset={resetPrefs} interval={intervalMs} onRefresh={setRefresh} redis={redis} mode={mode} />}
        </div></main>
      </div>
      <footer className="flex min-h-8 shrink-0 items-center gap-2 border-t border-line bg-panel px-3 py-1.5 text-xs text-subtle lg:px-5"><Icon name="db" size={13} /><span className="truncate">{redis?.connected ? `Redis ${redis.url} · ${redis.latencyMs} ms` : "Sin Redis · datos de demostración"}</span><span className="min-w-0 flex-1" />{errorStreak > 0 && <span className="flex shrink-0 items-center gap-1 font-semibold text-danger"><Icon name="alert" size={13} /> Reintentando</span>}<span className="hidden shrink-0 sm:inline">{lastRefresh ? `Actualizado ${lastRefresh.toLocaleTimeString("es-ES")}` : "—"}</span><span className="hidden shrink-0 md:inline">· caché 2 s · sin CDNs</span></footer>
    </div>
    {detailId && <JobDetailDialog id={detailId} queue={url.queue} job={detail} loading={detailLoading} busy={busy !== null} onClose={() => { setDetailId(null); setDetail(null); }} onAction={(action) => askJobAction(detailId, action)} />}
    {showAdd && <AddJobDialog queues={queues} initialQueue={url.queue} onClose={() => setShowAdd(false)} onDone={(message) => { setShowAdd(false); announce(message); void manualRefresh(); }} />}
    {confirm && <ConfirmDialog title={confirm.title} message={confirm.message} confirmLabel={confirm.confirmLabel} danger={confirm.danger} onCancel={() => setConfirm(null)} onConfirm={() => { const fn = confirm.onConfirm; setConfirm(null); fn(); }} />}
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">{live}</div><div role="alert" aria-live="assertive" aria-atomic="true" className="sr-only">{alert}</div>
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[60] flex justify-center px-3"><div className={`flex min-h-11 w-full max-w-md items-center gap-2 rounded-xl border px-4 py-2 text-sm shadow-xl transition-all ${toast?.error ? "border-danger bg-danger text-white" : "border-accent bg-accent text-accent-ink"} ${toast ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}><Icon name={toast?.error ? "alert" : "check"} size={16} /><span className="min-w-0 flex-1">{toast?.text || ""}</span></div></div>
  </>;
}

type VerticalMenuOption<T extends string | number> = { value: T; label: string; description?: string; icon?: IconName; dot?: string; disabled?: boolean };

function VerticalMenu<T extends string | number>({ label, options, value, onChange, className = "" }: { label: string; options: VerticalMenuOption<T>[]; value: T; onChange: (value: T) => void; className?: string }) {
  return <div className={className}><p className="mb-2 text-xs font-bold uppercase tracking-wide text-subtle">{label}</p><div role="radiogroup" aria-label={label} className="grid gap-1.5">{options.map((option) => { const active = option.value === value; return <button key={String(option.value)} type="button" role="radio" aria-checked={active} disabled={option.disabled} onClick={() => onChange(option.value)} className={`flex min-h-10 items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${active ? "border-accent bg-accent text-accent-ink" : "border-line bg-panel text-muted hover:border-line-strong hover:bg-soft"}`}>{option.icon && <Icon name={option.icon} size={15} />} {option.dot && <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: option.dot }} />}<span className="min-w-0 flex-1"><span className="block truncate font-semibold">{option.label}</span>{option.description && <span className={`block truncate text-xs ${active ? "text-accent-ink/80" : "text-subtle"}`}>{option.description}</span>}</span>{active && <Icon name="check" size={14} />}</button>; })}</div></div>;
}

function Sidebar({ view, collapsed, mobileOpen, queues, selectedQueue, booted, onNavigate, onQueue, onClose, onToggle }: { view: View; collapsed: boolean; mobileOpen: boolean; queues: QueueInfo[]; selectedQueue: string; booted: boolean; onNavigate: (view: View) => void; onQueue: (queue: string) => void; onClose: () => void; onToggle: () => void }) {
  const [queueSearch, setQueueSearch] = useState("");
  const filteredQueues = useMemo(() => {
    const term = queueSearch.trim().toLowerCase();
    if (!term) return queues;
    return queues.filter((queue) => queue.name.toLowerCase().includes(term));
  }, [queueSearch, queues]);
  const expandedOnly = collapsed ? "lg:hidden" : "";

  return <>{<aside className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-line bg-panel shadow-xl transition-transform lg:static lg:z-auto lg:shadow-none ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"} ${collapsed ? "lg:w-[4.25rem]" : "lg:w-72"}`}><div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3"><span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-soft"><Icon name="layers" size={16} /></span><span className={`min-w-0 flex-1 truncate text-sm font-bold ${expandedOnly}`}>Menú vertical</span><button type="button" aria-label="Cerrar menú" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-soft lg:hidden"><Icon name="x" size={16} /></button><button type="button" aria-label={collapsed ? "Expandir menú" : "Colapsar menú"} title={collapsed ? "Expandir menú" : "Colapsar menú"} onClick={onToggle} className="hidden h-9 w-9 place-items-center rounded-lg hover:bg-soft lg:grid"><Icon name={collapsed ? "chevr" : "chevl"} size={16} /></button></div><div className="stable-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-2"><nav aria-label="Secciones principales" className="grid gap-1">{(Object.keys(VIEW_META) as View[]).map((item) => <button type="button" key={item} onClick={() => onNavigate(item)} aria-current={view === item ? "page" : undefined} title={collapsed ? VIEW_META[item].label : undefined} className={`flex h-11 items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold ${view === item ? "bg-accent text-accent-ink" : "text-muted hover:bg-soft"} ${collapsed ? "lg:justify-center lg:px-0" : ""}`}><Icon name={VIEW_META[item].icon} size={17} /><span className={expandedOnly}>{VIEW_META[item].label}</span>{view === item && <span className={`ml-auto h-1.5 w-1.5 rounded-full bg-current ${expandedOnly}`} />}</button>)}</nav><div className={`space-y-4 ${expandedOnly}`}><section aria-labelledby="sidebar-queues-heading" className="rounded-xl border border-line bg-bg p-2.5"><div className="mb-2 flex items-center gap-2"><Icon name="layers" size={15} className="text-subtle" /><h3 id="sidebar-queues-heading" className="min-w-0 flex-1 text-xs font-bold uppercase tracking-wide text-subtle">Colas</h3><span className="rounded-full bg-panel px-2 py-0.5 text-[0.68rem] font-bold text-subtle tnum">{numberText(queues.length)}</span></div><label htmlFor="sidebar-queue-search" className="sr-only">Buscar colas</label><div className="mb-2 flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-panel px-2.5 focus-within:outline focus-within:outline-3 focus-within:outline-focus"><Icon name="search" size={14} className="text-subtle" /><input id="sidebar-queue-search" type="search" value={queueSearch} onChange={(e) => setQueueSearch(e.target.value)} placeholder="Buscar cola…" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />{queueSearch && <button type="button" aria-label="Borrar búsqueda de colas" title="Borrar búsqueda" onClick={() => setQueueSearch("")} className="grid h-7 w-7 place-items-center rounded-md text-subtle hover:bg-soft"><Icon name="x" size={13} /></button>}</div><div className="stable-scroll max-h-72 overflow-y-auto pr-1"><div role="list" aria-label="Colas disponibles" className="grid gap-1.5">{!booted ? [1, 2, 3].map((x) => <div key={x} className="h-14 rounded-lg border border-line bg-panel p-2"><div className="skeleton h-3 w-2/3" /><div className="skeleton mt-2 h-3 w-1/2" /></div>) : filteredQueues.map((queue) => { const active = selectedQueue === queue.name; return <div key={queue.name} role="listitem"><button type="button" onClick={() => onQueue(queue.name)} aria-current={active ? "page" : undefined} className={`w-full min-w-0 rounded-lg border p-2 text-left transition-colors ${active ? "border-accent bg-accent text-accent-ink" : "border-line bg-panel text-muted hover:border-line-strong hover:bg-soft"}`}><span className="flex items-center gap-2"><Icon name={queue.paused ? "pause" : "layers"} size={14} /><span className="min-w-0 flex-1 truncate text-sm font-bold">{queue.name}</span>{active && <Icon name="check" size={13} />}</span><span className={`mt-1 flex items-center gap-2 text-xs ${active ? "text-accent-ink/80" : "text-subtle"}`}><span className="tnum">{numberText(queue.counts.total)} jobs</span>{queue.counts.failed > 0 && <span className={active ? "text-accent-ink" : "text-danger"}>· {numberText(queue.counts.failed)} fallidos</span>}{queue.paused && <span>· pausada</span>}</span></button></div>; })}{booted && !queues.length && <p className="rounded-lg border border-dashed border-line-strong bg-panel p-3 text-center text-xs text-subtle">No hay colas disponibles.</p>}{booted && queues.length > 0 && !filteredQueues.length && <p className="rounded-lg border border-dashed border-line-strong bg-panel p-3 text-center text-xs text-subtle">Sin resultados para «{queueSearch}».</p>}</div></div></section></div></div><div className={`shrink-0 border-t border-line p-3 text-xs text-subtle ${collapsed ? "lg:p-2 lg:text-center" : ""}`}><p className="truncate">{collapsed ? "v1" : "Panel local · sin CDNs"}</p><p className={`mt-1 truncate ${expandedOnly}`}>SCAN acotado · caché 2 s</p></div></aside>}{mobileOpen && <button type="button" aria-label="Cerrar menú" onClick={onClose} className="fixed inset-0 z-40 bg-black/35 lg:hidden" />}</>;
}

function Overview({ queues, totals, booted, mode, redis, onQueue, onJobs }: { queues: QueueInfo[]; totals: Counts; booted: boolean; mode: "redis" | "demo"; redis: RedisInfo | null; onQueue: (queue: string) => void; onJobs: () => void }) {
  const cards = [{ label: "Jobs totales", value: totals.total, icon: "inbox" as IconName, hint: "en todas las colas" }, { label: "En espera", value: totals.waiting, icon: "clock" as IconName, hint: "pendientes" }, { label: "En proceso", value: totals.active, icon: "zap" as IconName, hint: "workers ocupados" }, { label: "Fallidos", value: totals.failed, icon: "alert" as IconName, hint: totals.failed ? "requieren atención" : "sin errores", danger: totals.failed > 0 }];
  return <div className="space-y-5"><section aria-labelledby="overview-cards" className="grid grid-cols-2 gap-3 xl:grid-cols-4"><h3 id="overview-cards" className="sr-only">Indicadores principales</h3>{cards.map((card) => <article key={card.label} className="flex min-h-28 min-w-0 items-center gap-3 rounded-xl border border-line bg-panel p-4"><span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-soft"><Icon name={card.icon} size={18} /></span><dl className="min-w-0"><dt className="truncate text-sm text-subtle">{card.label}</dt><dd className={`truncate text-2xl font-bold tnum ${card.danger ? "text-danger" : ""}`}>{booted ? <Num n={card.value} /> : "—"}</dd><dd className="truncate text-xs text-subtle">{card.hint}</dd></dl></article>)}</section><section aria-labelledby="queues-heading" className="rounded-xl border border-line bg-panel p-4 sm:p-5"><div className="flex items-center gap-3"><div className="min-w-0 flex-1"><h3 id="queues-heading" className="text-base font-bold">Tus colas</h3><p className="text-sm text-subtle">Selecciona una cola para abrir sus jobs.</p></div><Btn icon="inbox" label="Ver jobs" size="sm" onClick={onJobs} /></div><div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{!booted ? [1, 2, 3].map((x) => <div key={x} className="h-28 rounded-lg border border-line p-3"><div className="skeleton h-4 w-2/3" /><div className="skeleton mt-4 h-3 w-full" /></div>) : queues.map((queue) => <button type="button" key={queue.name} onClick={() => onQueue(queue.name)} title={`Abrir jobs de ${queue.name}`} className="min-w-0 rounded-lg border border-line p-3 text-left hover:border-line-strong hover:bg-bg"><div className="flex items-center gap-2"><Icon name={queue.paused ? "pause" : "layers"} size={16} /><span className="min-w-0 flex-1 truncate text-sm font-bold">{queue.name}</span>{queue.paused && <span className="rounded-full bg-warn-bg px-2 py-1 text-[0.65rem] font-bold text-warn">PAUSADA</span>}</div><div className="mt-4 grid grid-cols-3 gap-2 text-xs"><span><strong className="block text-base tnum"><Num n={queue.counts.total} /></strong><span className="text-subtle">total</span></span><span><strong className="block text-base tnum"><Num n={queue.counts.active} /></strong><span className="text-subtle">activos</span></span><span className={queue.counts.failed ? "text-danger" : ""}><strong className="block text-base tnum"><Num n={queue.counts.failed} /></strong><span className="text-subtle">fallidos</span></span></div></button>)}{booted && !queues.length && <p className="col-span-full rounded-lg border border-dashed border-line-strong p-8 text-center text-sm text-subtle">No hay colas disponibles.</p>}</div></section><section className="grid gap-3 lg:grid-cols-2"><article className="rounded-xl border border-line bg-panel p-4"><h3 className="text-sm font-bold">Estado de conexión</h3><div className="mt-3 flex items-center gap-3"><span className={`h-3 w-3 rounded-full ${redis?.connected ? "bg-emerald-500" : "bg-amber-500"}`} /><div className="min-w-0"><p className="text-sm font-semibold">{redis?.connected ? "Redis conectado" : "Modo demo local"}</p><p className="truncate text-xs text-subtle">{redis?.connected ? `${redis.url} · versión ${redis.version || "desconocida"}` : "Puedes explorar sin Redis."}</p></div></div></article><article className="rounded-xl border border-line bg-panel p-4"><h3 className="text-sm font-bold">Rendimiento protegido</h3><p className="mt-3 text-sm text-subtle">SCAN acotado, caché server-side y una sola consulta periódica para no saturar Redis.</p><p className="mt-2 text-xs font-medium text-ok">Fuente: {mode === "redis" ? "Redis real" : "Demostración"}</p></article></section></div>;
}

function QueueActions({ queue, busy, onAction }: { queue: QueueInfo | null; busy: string | null; onAction: (action: QueueActionKey, text: string) => void }) {
  const actions = [{ key: queue?.paused ? "resume" : "pause", icon: queue?.paused ? "play" : "pause", label: queue?.paused ? "Reanudar" : "Pausar", text: queue?.paused ? "Cola reanudada" : "Cola pausada" }, { key: "retry-failed", icon: "retry", label: "Reintentar", text: "Fallidos enviados de nuevo", disabled: !queue?.counts.failed }, { key: "clean-completed", icon: "broom", label: "Limpiar", text: "Completados eliminados" }, { key: "drain", icon: "trash", label: "Vaciar", text: "Cola vaciada", danger: true }] as { key: QueueActionKey; icon: IconName; label: string; text: string; disabled?: boolean; danger?: boolean }[];
  return <div role="group" aria-label={`Acciones de ${queue?.name || "la cola"}`} className="grid grid-cols-4 gap-2">{actions.map((action) => <Btn key={action.key} icon={action.icon} label={action.label} stack tone={action.danger ? "danger" : "ghost"} disabled={!queue || !!busy || action.disabled} spinning={busy === action.key} srLabel={`${action.label} cola ${queue?.name || ""}`} onClick={() => onAction(action.key, action.text)} />)}</div>;
}

function Jobs({ selected, url, updateUrl, jobs, total, pages, booted, draftSearch, setDraftSearch, searchRef, statusLabel, busy, refreshing, onQueueAction, onDetail, onJobAction, onSort, onNew }: { selected: QueueInfo | null; url: UrlState; updateUrl: (patch: Partial<UrlState>, push?: boolean) => void; jobs: JobRow[]; total: number; pages: number; booted: boolean; draftSearch: string; setDraftSearch: (value: string) => void; searchRef: React.RefObject<HTMLInputElement | null>; statusLabel: string; busy: string | null; refreshing: boolean; onQueueAction: (action: QueueActionKey, text: string) => void; onDetail: (id: string) => void; onJobAction: (id: string, action: "retry" | "remove") => void; onSort: (field: SortField) => void; onNew: () => void }) {
  const status = STATES.find((state) => state.id === url.status) || STATES[0];
  return <div className="space-y-4"><section aria-labelledby="job-filters" className="rounded-xl border border-line bg-panel p-4"><h3 id="job-filters" className="sr-only">Filtros del listado de jobs</h3><div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start"><div className="rounded-lg border border-line bg-bg p-3"><div className="flex flex-wrap items-center gap-2"><span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-soft"><Icon name={selected?.paused ? "pause" : "layers"} size={16} /></span><div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-wide text-subtle">Cola seleccionada</p><p className="truncate text-sm font-bold">{selected ? selected.name : "Ninguna cola seleccionada"}</p></div>{selected?.paused && <span className="rounded-full bg-warn-bg px-2 py-1 text-[0.65rem] font-bold text-warn">PAUSADA</span>}<span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-panel px-2.5 py-1 text-xs font-semibold"><span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: status.dot }} />{statusLabel}</span></div><div className="mt-3 grid gap-2 text-xs text-subtle sm:grid-cols-3"><span><strong className="block text-base text-ink tnum">{selected ? <Num n={selected.counts.total} /> : "—"}</strong>total</span><span><strong className="block text-base text-ink tnum">{selected ? <Num n={selected.counts.active} /> : "—"}</strong>activos</span><span className={selected?.counts.failed ? "text-danger" : ""}><strong className="block text-base tnum">{selected ? <Num n={selected.counts.failed} /> : "—"}</strong>fallidos</span></div><p className="mt-3 text-xs text-subtle">Cambia de cola desde el menú vertical. Usa el buscador de colas del lateral para localizarla rápido.</p><div className="mt-3"><p id="jobs-status-filter" className="text-xs font-bold uppercase tracking-wide text-subtle">Estado</p><div role="radiogroup" aria-labelledby="jobs-status-filter" className="mt-2 flex flex-wrap gap-2">{STATES.map((state) => { const active = url.status === state.id; return <button key={state.id} type="button" role="radio" aria-checked={active} onClick={() => updateUrl({ status: state.id, page: 1 }, true)} className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold ${active ? "border-accent bg-accent text-accent-ink" : "border-line-strong bg-panel text-muted hover:bg-soft"}`}><span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: state.dot }} />{state.label}</button>; })}</div></div></div><div className="flex flex-wrap gap-2 lg:justify-end"><Btn icon="plus" label="Nuevo job" tone="dark" onClick={onNew} /><Btn icon="grid" label="Resumen" onClick={() => updateUrl({ view: "overview" }, true)} /></div></div><div className="mt-3 grid gap-3 md:grid-cols-[minmax(14rem,1fr)_auto] md:items-end"><div><label htmlFor="jobs-search" className="mb-1 block text-xs font-semibold text-subtle">Buscar por ID, nombre o datos</label><div className="flex h-11 items-center gap-2 rounded-lg border border-line-strong px-3 focus-within:outline focus-within:outline-3 focus-within:outline-focus"><Icon name="search" size={15} className="text-subtle" /><input id="jobs-search" ref={searchRef} type="search" value={draftSearch} onChange={(e) => setDraftSearch(e.target.value)} placeholder="Escribe para buscar…" aria-keyshortcuts="/" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />{draftSearch && <button type="button" aria-label="Borrar búsqueda" title="Borrar búsqueda" onClick={() => setDraftSearch("")} className="grid h-7 w-7 place-items-center text-subtle"><Icon name="x" size={14} /></button>}</div></div><p className="text-xs text-subtle md:text-right">{selected ? `${numberText(selected.counts.total)} jobs en ${selected.name}` : "Elige una cola en el menú vertical"}</p></div></section>{selected && <section aria-labelledby="queue-actions" className="rounded-xl border border-line bg-panel p-4"><div className="mb-3 flex items-center gap-3"><div className="min-w-0 flex-1"><h3 id="queue-actions" className="truncate text-sm font-bold">Acciones de {selected.name}</h3><p className="text-xs text-subtle">Las acciones destructivas piden confirmación.</p></div>{refreshing && <Icon name="refresh" size={14} spin />}</div><QueueActions queue={selected} busy={busy} onAction={onQueueAction} /></section>}<section aria-labelledby="jobs-list" className="overflow-hidden rounded-xl border border-line bg-panel"><div className="flex min-h-14 items-center gap-3 border-b border-line px-4"><div className="min-w-0 flex-1"><h3 id="jobs-list" className="truncate text-sm font-bold">{selected ? `Jobs · ${selected.name}` : "Listado de jobs"}</h3><p className="truncate text-xs text-subtle">{booted ? `${numberText(total)} jobs · ${statusLabel}` : "Cargando datos…"}</p></div><span className="hidden text-xs text-subtle sm:inline">Orden: {SORTS.find((x) => x.id === url.sort)?.label} {url.dir === "asc" ? "↑" : "↓"}</span></div>{selected ? <Results jobs={jobs} total={total} pages={pages} page={url.page} sort={url.sort} dir={url.dir} booted={booted} statusLabel={statusLabel} search={url.search} busy={busy} onDetail={onDetail} onJobAction={onJobAction} onPage={(page) => updateUrl({ page: Math.max(1, Math.min(pages, page)) }, true)} onSort={onSort} /> : <div className="grid min-h-64 place-items-center p-6 text-center"><Icon name="layers" size={26} className="text-subtle" /><p className="mt-3 text-sm font-semibold">Selecciona una cola</p><p className="mt-1 text-sm text-subtle">Usa el menú vertical y su buscador de colas para elegirla.</p></div>}</section></div>;
}

function Results({ jobs, total, pages, page, sort, dir, booted, statusLabel, search, busy, onDetail, onJobAction, onPage, onSort }: { jobs: JobRow[]; total: number; pages: number; page: number; sort: SortField; dir: SortDir; booted: boolean; statusLabel: string; search: string; busy: string | null; onDetail: (id: string) => void; onJobAction: (id: string, action: "retry" | "remove") => void; onPage: (page: number) => void; onSort: (field: SortField) => void }) {
  const empty = booted && jobs.length === 0;
  const header = (field: SortField, label: string) => <button type="button" onClick={() => onSort(field)} aria-label={`Ordenar por ${label}`} className="inline-flex items-center gap-1 text-left hover:text-ink">{label}<SortIndicator active={sort === field} dir={dir} /></button>;
  return <>{empty ? <div className="grid min-h-72 place-items-center p-6 text-center"><Icon name="inbox" size={24} className="text-subtle" /><p className="mt-3 text-sm font-semibold">No hay jobs{search ? ` que coincidan con «${search}»` : ` con estado «${statusLabel}»`}.</p><p className="mt-1 text-sm text-subtle">Prueba otro filtro o crea un job nuevo.</p></div> : <><div className="lg:hidden"><ul aria-label={`Jobs ${statusLabel.toLowerCase()}, página ${page} de ${pages}`}>{!booted ? [1, 2, 3].map((x) => <li key={x} className="h-36 border-b border-line p-4"><span className="skeleton inline-block h-4 w-1/3" /><span className="skeleton mt-4 block h-3 w-2/3" /><span className="skeleton mt-5 block h-8 w-full" /></li>) : jobs.map((job) => <li key={job.id} className="min-h-36 border-b border-line p-4"><article aria-label={jobLabel(job)}><div className="flex items-center gap-2"><span className="font-mono text-xs font-bold">#{job.id}</span><StateBadge state={job.state} /><span className="min-w-0 flex-1" /><Ago ts={job.timestamp} className="text-xs text-subtle" /></div><button type="button" onClick={() => onDetail(job.id)} aria-haspopup="dialog" className="mt-2 block max-w-full truncate text-left text-sm font-semibold hover:underline">{job.name}</button><p className="mt-1 truncate text-xs text-subtle">{job.failedReason || `${job.attemptsMade} intentos · ${Object.keys(job.data || {}).length ? JSON.stringify(job.data).slice(0, 70) : "sin datos"}`}</p><div className="mt-3 flex items-center gap-2"><div className="min-w-0 flex-1"><ProgressMini value={job.progress} label={`Progreso del job ${job.id}`} /></div><Btn icon="eye" size="sm" srLabel={`Ver detalle del job ${job.id}`} onClick={() => onDetail(job.id)} /><Btn icon="retry" size="sm" srLabel={`Reintentar job ${job.id}`} disabled={busy !== null} onClick={() => onJobAction(job.id, "retry")} /><Btn icon="trash" size="sm" tone="danger" srLabel={`Eliminar job ${job.id}`} disabled={busy !== null} onClick={() => onJobAction(job.id, "remove")} /></div></article></li>)}</ul></div><div className="hidden overflow-x-auto lg:block"><table className="w-full min-w-[50rem] table-fixed border-collapse text-sm"><caption className="sr-only">Jobs {statusLabel.toLowerCase()}, {total} en total, página {page} de {pages}.</caption><thead className="bg-bg text-left text-xs font-semibold text-subtle"><tr className="h-11 border-b border-line"><th scope="col" className="w-20 px-4">{header("id", "ID")}</th><th scope="col" className="px-2">{header("name", "Nombre")}</th><th scope="col" className="w-28 px-2">{header("state", "Estado")}</th><th scope="col" className="hidden px-2 xl:table-cell">Datos</th><th scope="col" className="w-28 px-2">{header("progress", "Progreso")}</th><th scope="col" className="w-28 px-2">{header("created", "Creado")}</th><th scope="col" className="w-32 px-4 text-right">Acciones</th></tr></thead><tbody>{!booted ? [1, 2, 3, 4].map((x) => <tr key={x} className="h-14 border-b border-line"><td colSpan={7} className="px-4"><span className="skeleton inline-block h-4 w-2/3" /></td></tr>) : jobs.map((job) => <tr key={job.id} className="h-14 border-b border-line hover:bg-bg"><th scope="row" className="px-4 text-left font-mono text-xs">#{job.id}</th><td className="min-w-0 px-2"><button type="button" onClick={() => onDetail(job.id)} aria-haspopup="dialog" title={`Ver detalle: ${jobLabel(job)}`} className="block max-w-full truncate text-left font-semibold hover:underline">{job.name}</button><span className="block truncate text-xs text-subtle">{job.failedReason || `${job.attemptsMade} intentos`}</span></td><td className="px-2"><StateBadge state={job.state} /></td><td className="hidden truncate px-2 font-mono text-xs text-subtle xl:table-cell" title={JSON.stringify(job.data)}>{Object.keys(job.data || {}).length ? JSON.stringify(job.data).slice(0, 85) : "Sin datos"}</td><td className="px-2"><ProgressMini value={job.progress} label={`Progreso del job ${job.id}`} /></td><td className="px-2 text-xs text-subtle"><Ago ts={job.timestamp} /></td><td className="px-4"><div className="flex justify-end gap-1"><Btn icon="eye" size="sm" srLabel={`Ver detalle del job ${job.id}`} onClick={() => onDetail(job.id)} /><Btn icon="retry" size="sm" srLabel={`Reintentar job ${job.id}`} disabled={busy !== null} onClick={() => onJobAction(job.id, "retry")} /><Btn icon="trash" size="sm" tone="danger" srLabel={`Eliminar job ${job.id}`} disabled={busy !== null} onClick={() => onJobAction(job.id, "remove")} /></div></td></tr>)}</tbody></table></div></>}<nav aria-label="Paginación de jobs" className="flex min-h-16 items-center gap-2 border-t border-line px-4"><p className="min-w-0 flex-1 truncate text-xs text-subtle">{booted ? `${numberText(total)} ${total === 1 ? "job" : "jobs"}` : "Cargando…"}</p><Btn icon="chevl" size="sm" srLabel="Página anterior" disabled={page <= 1} onClick={() => onPage(page - 1)} /><span className="w-20 shrink-0 text-center text-xs font-semibold tnum"><span aria-hidden="true">{page} / {pages}</span><span className="sr-only">Página {page} de {pages}</span></span><Btn icon="chevr" size="sm" srLabel="Página siguiente" disabled={page >= pages} onClick={() => onPage(page + 1)} /></nav></>;
}

function Settings({ prefs, update, reset, interval, onRefresh, redis, mode }: { prefs: Prefs; update: (patch: Partial<Prefs>) => void; reset: () => void; interval: number; onRefresh: (value: number) => void; redis: RedisInfo | null; mode: "redis" | "demo" }) {
  const refreshOptions = REFRESH_OPTIONS.map((option) => ({ value: option.value, label: option.label, description: option.value === 0 ? "No se actualiza automáticamente" : `Siguiente ciclo cada ${option.short}`, icon: "refresh" as IconName }));
  const fontOptions = FONT_SCALES.map((scale, index) => ({ value: index, label: scale.label, description: `${scale.pct}% del tamaño base`, icon: "type" as IconName }));
  return <div className="grid gap-4 xl:grid-cols-2"><SettingsCard icon="refresh" title="Actualización de datos" description="Controla la frecuencia de consulta y la protección de Redis."><VerticalMenu label="Frecuencia automática" value={interval} options={refreshOptions} onChange={onRefresh} /><p className="mt-3 text-xs text-subtle">Las pestañas ocultas no consultan y el refresco manual reinicia el temporizador.</p></SettingsCard><SettingsCard icon="a11y" title="Accesibilidad" description="Se guarda en este navegador y sus valores aparecen en la URL compartida."><VerticalMenu label="Tamaño del texto" value={prefs.fontScale} options={fontOptions} onChange={(fontScale) => update({ fontScale })} /><div className="mt-3 grid gap-2"><SettingSwitch id="setting-contrast" checked={prefs.contrast} onChange={(value) => update({ contrast: value })} label="Alto contraste" help="Refuerza bordes y textos." /><SettingSwitch id="setting-motion" checked={prefs.reduceMotion} onChange={(value) => update({ reduceMotion: value })} label="Reducir movimiento" help="Reduce animaciones." /><SettingSwitch id="setting-announce" checked={prefs.announce} onChange={(value) => update({ announce: value })} label="Anunciar actualizaciones" help="Informa al lector de pantalla." /></div></SettingsCard><SettingsCard icon="keyboard" title="Navegación y teclado" description="Atajos opcionales y menú lateral."><SettingSwitch id="setting-shortcuts" checked={prefs.shortcuts} onChange={(value) => update({ shortcuts: value })} label="Activar atajos" help="R refresca, / busca y N crea un job." /><div className="my-4 rounded-lg bg-bg p-3 text-sm text-subtle"><kbd className="rounded border border-line-strong bg-panel px-1.5 py-0.5 font-mono">R</kbd> actualizar <kbd className="ml-2 rounded border border-line-strong bg-panel px-1.5 py-0.5 font-mono">/</kbd> buscar <kbd className="ml-2 rounded border border-line-strong bg-panel px-1.5 py-0.5 font-mono">N</kbd> nuevo job</div><Btn icon="retry" label="Restablecer preferencias" size="sm" onClick={reset} /></SettingsCard><SettingsCard icon="db" title="Conexión" description="Fuente de datos activa."><div className="flex items-center gap-3"><span className={`h-3 w-3 rounded-full ${redis?.connected ? "bg-emerald-500" : "bg-amber-500"}`} /><div className="min-w-0"><p className="text-sm font-semibold">{mode === "redis" ? "Redis conectado" : "Modo demostración"}</p><p className="truncate text-xs text-subtle">{redis?.url || "redis://127.0.0.1:6379"}</p></div></div><dl className="mt-4 grid grid-cols-2 gap-2">{[["Versión", redis?.version || "—"], ["Memoria", redis?.usedMemory || "—"], ["Clientes", redis?.clients || "—"], ["Latencia", redis ? `${redis.latencyMs} ms` : "—"]].map(([key, value]) => <div key={key} className="rounded-lg border border-line bg-bg p-3"><dt className="text-xs text-subtle">{key}</dt><dd className="mt-1 text-sm font-semibold tnum">{value}</dd></div>)}</dl></SettingsCard></div>;
}

function SettingsCard({ icon, title, description, children }: { icon: IconName; title: string; description: string; children: ReactNode }) { return <section className="rounded-xl border border-line bg-panel p-4 sm:p-5"><div className="flex items-start gap-3"><span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-soft"><Icon name={icon} size={17} /></span><div className="min-w-0"><h3 className="text-base font-bold">{title}</h3><p className="mt-0.5 text-sm text-subtle">{description}</p></div></div><div className="mt-5">{children}</div></section>; }
function SettingSwitch({ id, checked, onChange, label, help }: { id: string; checked: boolean; onChange: (value: boolean) => void; label: string; help: string }) { return <div className="flex items-start gap-3 rounded-lg border border-line p-3"><div className="min-w-0 flex-1"><label htmlFor={id} className="block text-sm font-semibold">{label}</label><p id={`${id}-help`} className="mt-0.5 text-xs text-subtle">{help}</p></div><button id={id} type="button" role="switch" aria-checked={checked} aria-describedby={`${id}-help`} onClick={() => onChange(!checked)} className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 ${checked ? "border-accent bg-accent" : "border-line-strong bg-soft"}`}><span aria-hidden="true" className={`h-5 w-5 rounded-full bg-white shadow ${checked ? "translate-x-5" : "translate-x-0.5"}`} /></button></div>; }
