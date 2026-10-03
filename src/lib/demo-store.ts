// Store DEMO en memoria: permite usar el dashboard sin Redis / sin internet.
// Datos deterministas para que la UI no "salte": conteos y filas estables.
export type JobState =
  | "waiting"
  | "active"
  | "delayed"
  | "completed"
  | "failed"
  | "paused";

export interface DemoJob {
  id: string;
  queue: string;
  name: string;
  state: JobState;
  data: Record<string, unknown>;
  progress: number;
  attemptsMade: number;
  attempts: number;
  timestamp: number;
  finishedOn: number | null;
  processedOn: number | null;
  failedReason: string | null;
  stacktrace: string[];
  delay: number;
  priority: number;
}

export interface DemoQueue {
  name: string;
  paused: boolean;
  jobs: DemoJob[];
}

const now = Date.now();

function mk(
  queue: string,
  id: string,
  name: string,
  state: JobState,
  i: number,
  extra: Partial<DemoJob> = {}
): DemoJob {
  const ts = now - i * 1000 * 60 * 7 - (queue.length * 60000);
  const dur = 800 + ((i * 373) % 4200);
  return {
    id,
    queue,
    name,
    state,
    data: {
      to: `user${i}@ejemplo.es`,
      subject: `${name} #${id}`,
      template: name,
      locale: "es-ES",
      ...(extra.data || {}),
    },
    progress: state === "completed" ? 100 : state === "active" ? 20 + ((i * 13) % 70) : 0,
    attemptsMade: state === "failed" ? 3 : state === "completed" ? 1 : 0,
    attempts: state === "failed" ? 3 : 3,
    timestamp: ts,
    processedOn: state === "waiting" || state === "delayed" || state === "paused" ? null : ts + 1200,
    finishedOn:
      state === "completed" || state === "failed" ? ts + 1200 + dur : null,
    failedReason:
      state === "failed" ? (i % 3 === 0 ? "Error: SMTP timeout tras 30s" : i % 3 === 1 ? "Error: 429 rate limited por proveedor" : "Error: plantilla no encontrada") : null,
    stacktrace:
      state === "failed"
        ? ["Error: job failed", `    at Processor.process (${queue}/worker.js:42:11)`, `    at Queue.run (bullmq/dist/index.js:118:22)`]
        : [],
    delay: state === "delayed" ? 60000 * (5 + (i % 50)) : 0,
    priority: i % 7 === 0 ? 1 : 0,
    ...extra,
  };
}

function seedQueue(name: string, paused: boolean, kinds: string[]): DemoQueue {
  const jobs: DemoJob[] = [];
  let n = 1;
  const push = (state: JobState, count: number, kindIdx = 0) => {
    for (let k = 0; k < count; k++) {
      const kind = kinds[(kindIdx + k) % kinds.length];
      jobs.push(mk(name, String(n), kind, state, n));
      n++;
    }
  };
  push("active", 3);
  push("waiting", 9);
  push("delayed", 4);
  push("completed", 22, 1);
  push("failed", 5, 2);
  if (paused) {
    // mover 3 waiting -> paused para realismo
    let moved = 0;
    for (const j of jobs) {
      if (j.state === "waiting" && moved < 3) {
        j.state = "paused";
        moved++;
      }
    }
  }
  return { name, paused, jobs };
}

class DemoStore {
  queues: DemoQueue[] = [
    seedQueue("emails", false, ["send-welcome", "send-invoice", "send-reset"]),
    seedQueue("imagenes", false, ["resize", "optimize", "thumbnail"]),
    seedQueue("informes", true, ["generar-pdf", "agregar-datos", "enviar-resumen"]),
    seedQueue("webhooks", false, ["entregar", "reintentar", "firmar"]),
  ];
  seq = 200;

  counts(q: DemoQueue) {
    const c = { waiting: 0, active: 0, delayed: 0, completed: 0, failed: 0, paused: 0, prioritized: 0, total: q.jobs.length };
    for (const j of q.jobs) {
      if (j.state in c) (c as Record<string, number>)[j.state]++;
      if (j.priority > 0) c.prioritized++;
    }
    return c;
  }

  list(queue: string, status: string, page: number, perPage: number, search: string) {
    const q = this.queues.find((x) => x.name === queue);
    if (!q) return { jobs: [] as DemoJob[], total: 0 };
    let arr = q.jobs.slice();
    if (status !== "all") arr = arr.filter((j) => j.state === status);
    if (search) {
      const s = search.toLowerCase();
      arr = arr.filter(
        (j) =>
          j.id.toLowerCase().includes(s) ||
          j.name.toLowerCase().includes(s) ||
          JSON.stringify(j.data).toLowerCase().includes(s)
      );
    }
    arr.sort((a, b) => b.timestamp - a.timestamp);
    const total = arr.length;
    const start = (page - 1) * perPage;
    return { jobs: arr.slice(start, start + perPage), total };
  }

  get(queue: string, id: string) {
    return this.queues.find((x) => x.name === queue)?.jobs.find((j) => j.id === id) || null;
  }

  add(queue: string, name: string, data: Record<string, unknown>, opts: { delay?: number; priority?: number }) {
    let q = this.queues.find((x) => x.name === queue);
    if (!q) {
      q = { name: queue, paused: false, jobs: [] };
      this.queues.push(q);
    }
    this.seq++;
    const job: DemoJob = mk(queue, String(this.seq), name || "manual", opts.delay ? "delayed" : "waiting", this.seq, {
      data,
      delay: opts.delay || 0,
      priority: opts.priority || 0,
      timestamp: Date.now(),
    });
    q.jobs.unshift(job);
    return job;
  }

  action(queue: string, act: string) {
    const q = this.queues.find((x) => x.name === queue);
    if (!q) return false;
    if (act === "pause") q.paused = true;
    if (act === "resume") {
      q.paused = false;
      for (const j of q.jobs) if (j.state === "paused") j.state = "waiting";
    }
    if (act === "drain") q.jobs = q.jobs.filter((j) => j.state === "active" || j.state === "completed" || j.state === "failed");
    if (act === "clean-completed") q.jobs = q.jobs.filter((j) => j.state !== "completed");
    if (act === "clean-failed") q.jobs = q.jobs.filter((j) => j.state !== "failed");
    if (act === "obliterate") {
      this.queues = this.queues.filter((x) => x.name !== queue);
    }
    if (act === "retry-failed") {
      for (const j of q.jobs) {
        if (j.state === "failed") {
          j.state = "waiting";
          j.failedReason = null;
          j.stacktrace = [];
          j.attemptsMade = 0;
        }
      }
    }
    return true;
  }

  jobAction(queue: string, id: string, act: string) {
    const q = this.queues.find((x) => x.name === queue);
    const j = q?.jobs.find((x) => x.id === id);
    if (!q || !j) return false;
    if (act === "retry") {
      j.state = "waiting";
      j.failedReason = null;
      j.stacktrace = [];
      j.attemptsMade = 0;
      j.finishedOn = null;
    }
    if (act === "remove") q.jobs = q.jobs.filter((x) => x.id !== id);
    if (act === "promote") {
      j.state = "waiting";
      j.delay = 0;
    }
    if (act === "fail") {
      j.state = "failed";
      j.failedReason = "Error: movido a fallidos manualmente";
      j.finishedOn = Date.now();
    }
    return true;
  }
}

const g = globalThis as typeof globalThis & { __demoStore?: DemoStore };
export function getDemoStore(): DemoStore {
  if (!g.__demoStore) g.__demoStore = new DemoStore();
  return g.__demoStore;
}
