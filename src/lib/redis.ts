import IORedis from "ioredis";

const globalForRedis = globalThis as typeof globalThis & {
  __bullRedis?: IORedis;
  __bullRedisFailedAt?: number;
};

function getRedisUrl(): string | null {
  const url =
    process.env.REDIS_URL ||
    process.env.REDIS_TLS_URL ||
    (process.env.REDIS_HOST
      ? `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT || "6379"}`
      : null);
  // Intentamos localhost por defecto; si no hay redis, pasamos a modo demo sin romper.
  return url || "redis://127.0.0.1:6379";
}

export function getRedisClient(): IORedis {
  if (globalForRedis.__bullRedis) return globalForRedis.__bullRedis;
  const url = getRedisUrl()!;
  const client: IORedis = new IORedis(url, {
    lazyConnect: true,
    enableReadyCheck: true,
    maxRetriesPerRequest: 2,
    retryStrategy: (times) => {
      if (times > 3) return null; // deja de reintentar: pasamos a demo
      return Math.min(times * 200, 1000);
    },
    connectTimeout: 2000,
    enableAutoPipelining: true,
    // No bloqueamos el event loop con comandos largos
    disableClientInfo: true,
  });
  client.on("error", () => {
    // Silencioso: el dashboard muestra badge DEMO/DESCONECTADO sin crashear
  });
  globalForRedis.__bullRedis = client;
  return client;
}

export async function withTimeout<T>(p: Promise<T>, ms: number, label = "redis"): Promise<T> {
  let t: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        t = setTimeout(() => reject(new Error(`${label} timeout ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (t) clearTimeout(t);
  }
}

export async function tryConnect(): Promise<{ ok: boolean; latencyMs: number }> {
  const start = Date.now();
  // Fast-fail: si redis acaba de fallar, no lo acribillamos (anti-saturación)
  const failedAt = globalForRedis.__bullRedisFailedAt || 0;
  if (failedAt && Date.now() - failedAt < 3000) {
    return { ok: false, latencyMs: 0 };
  }
  try {
    const client = getRedisClient();
    await withTimeout(client.ping(), 1200, "ping");
    globalForRedis.__bullRedisFailedAt = 0;
    return { ok: true, latencyMs: Date.now() - start };
  } catch {
    globalForRedis.__bullRedisFailedAt = Date.now();
    return { ok: false, latencyMs: Date.now() - start };
  }
}

export function getRedisUrlSafe(): string {
  const url = getRedisUrl() || "";
  // Oculta password para mostrar en UI
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    return u.host || url;
  } catch {
    return url.replace(/:[^:@/]+@/, ":***@");
  }
}
