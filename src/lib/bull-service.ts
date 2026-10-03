import { getRedisClient, withTimeout, tryConnect, getRedisUrlSafe } from "./redis";
import { getDemoStore, type JobState } from "./demo-store";

// ─── Caché anti-saturación: single-flight + TTL corto ───
type CacheEntry = { data: unknown; expiresAt: number; inflight?: Promise<unknown> };
const cache = new Map<string, CacheEntry>();
const OVERVIEW_TTL = 2000; // 2s: coalesca polling de varias pestañas / componentes
const JOBS_TTL = 1000;
const REDIS_TTL = 5000;

async function cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<{ data: T; cached: boolean }> {
  const now = Date.now();
  const e = cache.get(key);
  if (e && e.expiresAt > now && e.data !== undefined) return { data: e.data as T, cached: true };
  if (e?.inflight) {
    const d = (await e.inflight) as T;
    return { data: d, cached: true };
  }
  const p = fn();
  cache.set(key, { data: e?.data, expiresAt: e?.expiresAt || 0, inflight: p });
  try {
    const d = await p;
    cache.set(key, { data: d, expiresAt: Date.now() + ttl });
    return { data: d, cached: false };
  } catch (err) {
    // conserva stale si existe
    if (e?.data !== undefined) return { data: e.data as T, cached: true };
    cache.delete(key);
    throw err;
  }
}

export interface QueueCounts {
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
  paused: number;
  prioritized: number;
  total: number;
}

export interface QueueInfo {
  name: string;
  prefix: string;
  paused: boolean;
  counts: QueueCounts;
}

const COUNT_LUA = `
local t = redis.call('TYPE', KEYS[1])['ok']
if t == 'list' then return redis.call('LLEN', KEYS[1])
elseif t == 'zset' then return redis.call('ZCARD', KEYS[1])
elseif t == 'set' then return redis.call('SCARD', KEYS[1])
elseif t == 'stream' then return redis.call('XLEN', KEYS[1])
elseif t == 'hash' then return redis.call('HLEN', KEYS[1])
else return 0 end
`;

async function countKey(client: ReturnType<typeof getRedisClient>, key: string): Promise<number> {
  try {
    const n = await withTimeout(client.eval(COUNT_LUA, 1, key) as Promise<unknown>, 1200, "count");
    return typeof n === "number" ? n : parseInt(String(n), 10) || 0;
  } catch {
    return 0;
  }
}

async function scanQueues(): Promise<{ name: string; prefix: string }[]> {
  const client = getRedisClient();
  const found = new Map<string, string>();
  let cursor = "0";
  let iters = 0;
  // SCAN (nunca KEYS): acotado a 12 iteraciones x COUNT 200 = máx ~2400 keys tocadas
  do {
    iters++;
    const [next, keys] = (await withTimeout(
      client.scan(cursor, "MATCH", "bull:*:*", "COUNT", 200),
      1500,
      "scan"
    )) as [string, string[]];
    cursor = next;
    for (const k of keys) {
      const parts = k.split(":");
      if (parts.length >= 3 && parts[0] === "bull") {
        const name = parts[1];
        if (name && !found.has(name)) found.set(name, "bull");
      }
    }
    if (iters >= 12 || cursor === "0") break;
  } while (cursor !== "0");
  return [...found.entries()].map(([name, prefix]) => ({ name, prefix }));
}

const STATE_KEYS: Record<string, string[]> = {
  waiting: ["wait", "waiting", "paused"],
  active: ["active"],
  delayed: ["delayed", "delay"],
  completed: ["completed"],
  failed: ["failed"],
  paused: ["paused"],
  prioritized: ["prioritized", "priority"],
};

async function getQueueInfo(name: string): Promise<QueueInfo> {
  const client = getRedisClient();
  const base = `bull:${name}`;
  const counts: QueueCounts = {
    waiting: 0, active: 0, delayed: 0, completed: 0, failed: 0, paused: 0, prioritized: 0, total: 0,
  };
  // wait+paused se suman en waiting pero paused se reporta aparte
  const waitN = await countKey(client, `${base}:wait`).catch(() => 0);
  const waitingLegacy = waitN === 0 ? await countKey(client, `${base}:waiting`).catch(() => 0) : 0;
  const pausedN = await countKey(client, `${base}:paused`).catch(() => 0);
  const prioritizedN = await countKey(client, `${base}:prioritized`).catch(() => 0);
  const activeN = await countKey(client, `${base}:active`).catch(() => 0);
  const delayedN = await countKey(client, `${base}:delayed`).catch(() => 0);
  const completedN = await countKey(client, `${base}:completed`).catch(() => 0);
  const failedN = await countKey(client, `${base}:failed`).catch(() => 0);

  counts.waiting = waitN + waitingLegacy + (pausedN > 0 ? 0 : 0);
  // Si la cola está pausada, BullMQ mete todo en paused; lo mostramos separado
  counts.paused = pausedN;
  counts.prioritized = prioritizedN;
  counts.active = activeN;
  counts.delayed = delayedN;
  counts.completed = completedN;
  counts.failed = failedN;
  counts.total = counts.waiting + counts.active + counts.delayed + counts.completed + counts.failed + counts.paused;

  let paused = pausedN > 0;
  try {
    const meta = (await withTimeout(client.hget(`${base}:meta`, "paused"), 800, "meta")) as string | null;
    if (meta === "1" || meta === "true") paused = true;
  } catch { /* noop */ }
  return { name, prefix: "bull", paused, counts };
}

export async function getOverview(): Promise<{ mode: "redis" | "demo"; queues: QueueInfo[]; ms: number }> {
  const t0 = Date.now();
  const conn = await tryConnect();
  if (!conn.ok) {
    const demo = getDemoStore();
    const queues: QueueInfo[] = demo.queues.map((q) => ({
      name: q.name,
      prefix: "demo",
      paused: q.paused,
      counts: { ...demo.counts(q), total: q.jobs.length } as QueueCounts,
    }));
    return { mode: "demo", queues, ms: Date.now() - t0 };
  }
  const { data } = await cached("overview", OVERVIEW_TTL, async () => {
    const names = await withTimeout(scanQueues(), 2500, "discover");
    // Limita a 50 colas para no saturar
    const slice = names.slice(0, 50);
    const infos: QueueInfo[] = [];
    // Secuencial en lotes de 5 para no lanzar 50 pipelines a la vez
    for (let i = 0; i < slice.length; i += 5) {
      const batch = slice.slice(i, i + 5);
      const res = await Promise.all(batch.map((q) => getQueueInfo(q.name).catch(() => null)));
      for (const r of res) if (r) infos.push(r);
    }
    infos.sort((a, b) => a.name.localeCompare(b.name));
    return infos;
  });
  return { mode: "redis", queues: data as QueueInfo[], ms: Date.now() - t0 };
}

// ─── Listado de jobs ───
export interface JobRow {
  id: string;
  name: string;
  state: string;
  data: Record<string, unknown>;
  progress: number;
  attemptsMade: number;
  timestamp: number;
  finishedOn: number | null;
  failedReason: string | null;
}

function parseJobHash(id: string, h: Record<string, string>): JobRow {
  let data: Record<string, unknown> = {};
  let name = h.name || "default";
  try {
    if (h.data) data = JSON.parse(h.data);
  } catch { data = { raw: h.data }; }
  let progress = 0;
  try {
    const p = h.progress ? JSON.parse(h.progress) : 0;
    progress = typeof p === "number" ? p : 0;
  } catch { progress = parseInt(h.progress || "0", 10) || 0; }
  return {
    id,
    name,
    state: "unknown",
    data,
    progress,
    attemptsMade: parseInt(h.attemptsMade || h.atm || "0", 10) || 0,
    timestamp: parseInt(h.timestamp || h.created || "0", 10) || 0,
    finishedOn: h.finishedOn ? parseInt(h.finishedOn, 10) : null,
    failedReason: h.failedReason || null,
  };
}

async function rangeIds(client: ReturnType<typeof getRedisClient>, key: string, start: number, end: number): Promise<string[]> {
  // Intenta LIST, luego ZSET (rev: más recientes primero), luego SET
  try {
    const t = (await withTimeout(client.type(key), 600, "type")) as string;
    if (t === "list") return (await withTimeout(client.lrange(key, start, end), 800, "lrange")) as string[];
    if (t === "zset") {
      const r = (await withTimeout((client as unknown as { zrevrange(k: string, s: number, e: number): Promise<string[]> }).zrevrange(key, start, end), 800, "zrange")) as string[];
      return r || [];
    }
    if (t === "set") {
      const all = (await withTimeout(client.smembers(key), 800, "smembers")) as string[];
      return all.slice(start, end + 1);
    }
    if (t === "stream") {
      const entries = (await withTimeout(client.xrevrange(key, "+", "-", "COUNT", end - start + 1), 800, "xrange")) as unknown[];
      return (entries as [string][]).map((e) => String(e[0])).slice(0, end - start + 1);
    }
    return [];
  } catch {
    return [];
  }
}

type JobSort = "created" | "id" | "name" | "state" | "progress" | "attempts";

function sortJobs(rows: JobRow[], sort: JobSort, dir: "asc" | "desc"): JobRow[] {
  const factor = dir === "asc" ? 1 : -1;
  return rows.slice().sort((a, b) => {
    let av: string | number = a.timestamp;
    let bv: string | number = b.timestamp;
    if (sort === "id") {
      av = Number(a.id) || 0;
      bv = Number(b.id) || 0;
    } else if (sort === "name") {
      av = a.name.toLocaleLowerCase();
      bv = b.name.toLocaleLowerCase();
    } else if (sort === "state") {
      av = a.state;
      bv = b.state;
    } else if (sort === "progress") {
      av = a.progress;
      bv = b.progress;
    } else if (sort === "attempts") {
      av = a.attemptsMade;
      bv = b.attemptsMade;
    }
    if (av < bv) return -1 * factor;
    if (av > bv) return 1 * factor;
    return String(a.id).localeCompare(String(b.id), undefined, { numeric: true }) * factor;
  });
}

export async function getJobs(
  queue: string,
  status: string,
  page: number,
  perPage: number,
  search: string,
  sort: JobSort = "created",
  dir: "asc" | "desc" = "desc"
): Promise<{ mode: "redis" | "demo"; jobs: JobRow[]; total: number; ms: number }> {
  const t0 = Date.now();
  const conn = await tryConnect();
  if (!conn.ok) {
    const demo = getDemoStore();
    const demoResult = demo.list(queue, status, 1, 10000, search);
    const safeSort = ["created", "id", "name", "state", "progress", "attempts"].includes(sort) ? sort : "created";
    const ordered = sortJobs(
      demoResult.jobs.map((j) => ({
        id: j.id, name: j.name, state: j.state, data: j.data,
        progress: j.progress, attemptsMade: j.attemptsMade,
        timestamp: j.timestamp, finishedOn: j.finishedOn, failedReason: j.failedReason,
      })),
      safeSort as JobSort,
      dir
    );
    const start = (Math.max(1, page) - 1) * Math.min(Math.max(5, perPage), 50);
    const { jobs, total } = { jobs: ordered.slice(start, start + Math.min(Math.max(5, perPage), 50)), total: demoResult.total };
    return {
      mode: "demo",
      jobs: jobs.map((j) => ({
        id: j.id, name: j.name, state: j.state, data: j.data,
        progress: j.progress, attemptsMade: j.attemptsMade,
        timestamp: j.timestamp, finishedOn: j.finishedOn, failedReason: j.failedReason,
      })),
      total,
      ms: Date.now() - t0,
    };
  }
  const safePage = Math.min(Math.max(1, page || 1), 1000);
  const safePer = Math.min(Math.max(5, perPage || 15), 50);
  const safeSort = ["created", "id", "name", "state", "progress", "attempts"].includes(sort) ? sort : "created";
  const safeDir = dir === "asc" ? "asc" : "desc";
  const key = `jobs:${queue}:${status}:${safePage}:${safePer}:${search || ""}:${safeSort}:${safeDir}`;
  const { data } = await cached(key, JOBS_TTL, async () => {
    const client = getRedisClient();
    const base = `bull:${queue}`;
    const start = (safePage - 1) * safePer;
    const end = start + safePer - 1;
    let keys: string[] = [];
    if (status === "all") {
      // all: mezcla active+wait+failed recientes (barato: 3 rangos pequeños)
      const [a, w, f] = await Promise.all([
        rangeIds(client, `${base}:active`, 0, safePer - 1),
        rangeIds(client, `${base}:wait`, 0, safePer - 1).then(async (r) => (r.length ? r : rangeIds(client, `${base}:waiting`, 0, safePer - 1))),
        rangeIds(client, `${base}:failed`, 0, safePer - 1),
      ]);
      keys = [...a, ...w, ...f].slice(0, safePer);
    } else {
      const candidates = STATE_KEYS[status] || [status];
      for (const c of candidates) {
        const ids = await rangeIds(client, `${base}:${c}`, start, end);
        if (ids.length) {
          // Para waiting incluimos también paused
          if (status === "waiting") {
            const extra = await rangeIds(client, `${base}:paused`, start, end);
            keys = [...ids, ...extra].slice(0, safePer);
          } else keys = ids;
          break;
        }
      }
    }
    // Total aproximado desde counts (evita COUNT caro)
    const info = await getQueueInfo(queue).catch(() => null);
    const total =
      status === "all" ? info?.counts.total || keys.length
      : status === "waiting" ? info?.counts.waiting || keys.length
      : status === "active" ? info?.counts.active || keys.length
      : status === "delayed" ? info?.counts.delayed || keys.length
      : status === "completed" ? info?.counts.completed || keys.length
      : status === "failed" ? info?.counts.failed || keys.length
      : status === "paused" ? info?.counts.paused || keys.length
      : keys.length;

    // Búsqueda en servidor: filtra por id si search parece id exacto
    let filtered = keys;
    if (search) {
      const s = search.trim();
      if (/^\d+$/.test(s) || s.length <= 12) {
        // Intento directo por id (1 GET, baratísimo)
        try {
          const exists = await withTimeout(client.exists(`${base}:${s}`), 600, "exists");
          if (exists) filtered = [s];
        } catch { /* noop */ }
      }
    }
    // Pipeline HGETALL (máx 50)
    const pipe = client.pipeline();
    for (const id of filtered.slice(0, safePer)) pipe.hgetall(`${base}:${id}`);
    const raws = (await withTimeout(pipe.exec(), 2000, "jobs-pipe")) as [Error | null, Record<string, string>][];
    const jobs: JobRow[] = [];
    filtered.slice(0, safePer).forEach((id, i) => {
      const h = raws?.[i]?.[1];
      if (h && Object.keys(h).length) {
        const row = parseJobHash(id, h);
        row.state = status === "all" ? guessState(h) : status;
        if (!search || JSON.stringify(row).toLowerCase().includes(search.toLowerCase())) jobs.push(row);
      } else if (!search || id.includes(search)) {
        jobs.push({ id, name: "job", state: status, data: {}, progress: 0, attemptsMade: 0, timestamp: 0, finishedOn: null, failedReason: null });
      }
    });
    return { jobs: sortJobs(jobs, safeSort as JobSort, safeDir), total };
  });
  const d = data as { jobs: JobRow[]; total: number };
  return { mode: "redis", jobs: d.jobs, total: d.total, ms: Date.now() - t0 };
}

function guessState(h: Record<string, string>): string {
  if (h.finishedOn && h.failedReason) return "failed";
  if (h.finishedOn) return "completed";
  if (h.processedOn) return "active";
  if (h.delay) return "delayed";
  return "waiting";
}

export async function getJobDetail(queue: string, id: string): Promise<{ mode: "redis" | "demo"; job: (JobRow & { raw: Record<string, string>; stacktrace: string[] }) | null }> {
  const conn = await tryConnect();
  if (!conn.ok) {
    const j = getDemoStore().get(queue, id);
    if (!j) return { mode: "demo", job: null };
    return {
      mode: "demo",
      job: {
        id: j.id, name: j.name, state: j.state, data: j.data, progress: j.progress,
        attemptsMade: j.attemptsMade, timestamp: j.timestamp, finishedOn: j.finishedOn,
        failedReason: j.failedReason, raw: { delay: String(j.delay), priority: String(j.priority) }, stacktrace: j.stacktrace,
      },
    };
  }
  const client = getRedisClient();
  const base = `bull:${queue}`;
  const h = (await withTimeout(client.hgetall(`${base}:${id}`), 1200, "detail")) as Record<string, string>;
  if (!h || !Object.keys(h).length) return { mode: "redis", job: null };
  const row = parseJobHash(id, h);
  let stacktrace: string[] = [];
  try {
    if (h.stacktrace) stacktrace = JSON.parse(h.stacktrace);
  } catch { stacktrace = h.stacktrace ? [h.stacktrace] : []; }
  return { mode: "redis", job: { ...row, state: guessState(h), raw: h, stacktrace } };
}

// ─── Acciones (frecuencia baja: se permite crear conexión BullMQ dedicada) ───
async function withBullMQ<T>(fn: (m: { Queue: typeof import("bullmq").Queue }) => Promise<T>): Promise<T> {
  const mod = await import("bullmq");
  return fn({ Queue: mod.Queue });
}

function bullConnection() {
  const url = process.env.REDIS_URL || "redis://127.0.0.1:6379";
  return { url, maxRetriesPerRequest: null as unknown as number, enableReadyCheck: false };
}

export async function queueAction(queue: string, action: string): Promise<{ mode: "redis" | "demo" }> {
  const conn = await tryConnect();
  if (!conn.ok) {
    getDemoStore().action(queue, action);
    return { mode: "demo" };
  }
  cache.delete("overview");
  if (action === "pause" || action === "resume" || action === "drain" || action === "obliterate") {
    await withBullMQ(async ({ Queue }) => {
      const q = new Queue(queue, { connection: bullConnection() });
      try {
        await withTimeout(
          (async () => {
            if (action === "pause") await q.pause();
            if (action === "resume") await q.resume();
            if (action === "drain") await q.drain();
            if (action === "obliterate") await q.obliterate({ force: true });
          })(),
          8000,
          "q-action"
        );
      } finally {
        await q.close().catch(() => {});
      }
    });
    return { mode: "redis" };
  }
  if (action === "clean-completed" || action === "clean-failed") {
    await withBullMQ(async ({ Queue }) => {
      const q = new Queue(queue, { connection: bullConnection() });
      try {
        await withTimeout(q.clean(0, 1000, action === "clean-completed" ? "completed" : "failed"), 8000, "clean");
      } finally {
        await q.close().catch(() => {});
      }
    });
    return { mode: "redis" };
  }
  if (action === "retry-failed") {
    const client = getRedisClient();
    const base = `bull:${queue}`;
    const ids = await rangeIds(client, `${base}:failed`, 0, 99);
    await withBullMQ(async () => {
      const { Job } = await import("bullmq");
      for (const id of ids.slice(0, 50)) {
        try {
          const { Queue: Q } = await import("bullmq");
          const qq = new Q(queue, { connection: bullConnection() });
          try {
            const job = await Job.fromId(qq, id);
            await job?.retry?.();
          } finally {
            await qq.close().catch(() => {});
          }
        } catch { /* continúa */ }
      }
    });
    return { mode: "redis" };
  }
  throw new Error("acción no soportada");
}

export async function jobAction(queue: string, id: string, action: string): Promise<{ mode: "redis" | "demo" }> {
  const conn = await tryConnect();
  if (!conn.ok) {
    getDemoStore().jobAction(queue, id, action);
    return { mode: "demo" };
  }
  for (const k of [...cache.keys()]) if (k.startsWith(`jobs:${queue}`)) cache.delete(k);
  cache.delete("overview");
  await withBullMQ(async () => {
    const { Job, Queue } = await import("bullmq");
    const qq = new Queue(queue, { connection: bullConnection() });
    try {
      const job = await withTimeout(Job.fromId(qq, id) as Promise<unknown>, 4000, "fromId") as {
        retry(): Promise<unknown>; remove(): Promise<unknown>; promote(): Promise<unknown>; moveToFailed(o: unknown): Promise<unknown>;
      } | undefined;
      await withTimeout(
        (async () => {
          if (!job) {
            // Fallback crudo: borra hash si solo queremos eliminar
            if (action === "remove") {
              const client = getRedisClient();
              await client.del(`bull:${queue}:${id}`);
              return;
            }
            throw new Error("job no encontrado");
          }
          if (action === "retry") await job.retry();
          if (action === "remove") await job.remove();
          if (action === "promote") await job.promote();
          if (action === "fail")
            await (job as unknown as { moveToFailed(e: Error, token: string, fetchNext?: boolean): Promise<unknown> }).moveToFailed(
              new Error("Movido a fallidos manualmente"),
              "0",
              false
            );
        })(),
        6000,
        "job-action"
      );
    } finally {
      await qq.close().catch(() => {});
    }
  });
  return { mode: "redis" };
}

export async function addJob(queue: string, name: string, data: Record<string, unknown>, delay?: number, priority?: number) {
  const conn = await tryConnect();
  if (!conn.ok) {
    const j = getDemoStore().add(queue, name, data, { delay, priority });
    cache.delete("overview");
    return { mode: "demo" as const, id: j.id };
  }
  cache.delete("overview");
  const job = await withBullMQ(async ({ Queue }) => {
    const q = new Queue(queue, { connection: bullConnection() });
    try {
      return await withTimeout(q.add(name || "manual", data || {}, { delay, priority }), 6000, "add");
    } finally {
      await q.close().catch(() => {});
    }
  });
  return { mode: "redis" as const, id: (job as { id?: string }).id || "?" };
}

export async function getRedisInfo(): Promise<{
  mode: "redis" | "demo";
  connected: boolean;
  url: string;
  version?: string;
  usedMemory?: string;
  clients?: string;
  uptime?: string;
  latencyMs: number;
}> {
  const conn = await tryConnect();
  const url = getRedisUrlSafe();
  if (!conn.ok) {
    const { data } = await cached("redis-demo", REDIS_TTL, async () => ({
      mode: "demo" as const, connected: false, url: url || "sin redis (demo)",
      latencyMs: conn.latencyMs,
    }));
    return data as { mode: "redis" | "demo"; connected: boolean; url: string; latencyMs: number };
  }
  const { data } = await cached("redis-info", REDIS_TTL, async () => {
    const client = getRedisClient();
    const [info, latency] = await Promise.all([
      withTimeout(client.info("server"), 1500, "info").catch(() => ""),
      tryConnect(),
    ]);
    let version = "?";
    let uptime = "?";
    const mServer = info.match(/redis_version:([^\r\n]+)/);
    if (mServer) version = mServer[1].trim();
    const mUp = info.match(/uptime_in_seconds:(\d+)/);
    if (mUp) {
      const s = parseInt(mUp[1], 10);
      uptime = s > 86400 ? `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h` : s > 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.floor(s / 60)}m`;
    }
    let usedMemory = "?";
    let clients = "?";
    try {
      const mem = await withTimeout(client.info("memory"), 1200, "mem");
      const mm = mem.match(/used_memory_human:([^\r\n]+)/);
      if (mm) usedMemory = mm[1].trim();
      const cl = await withTimeout(client.info("clients"), 1200, "clients");
      const mc = cl.match(/connected_clients:(\d+)/);
      if (mc) clients = mc[1];
    } catch { /* noop */ }
    return { mode: "redis" as const, connected: true, url, version, usedMemory, clients, uptime, latencyMs: latency.latencyMs };
  });
  return data as { mode: "redis" | "demo"; connected: boolean; url: string; latencyMs: number; version?: string; usedMemory?: string; clients?: string; uptime?: string };
}

export type { JobState };
