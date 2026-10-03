import { getJobs, addJob } from "@/lib/bull-service";
import { db } from "@/db";
import { dashboardEvents } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ queue: string }> }
) {
  const { queue } = await ctx.params;
  const url = new URL(_req.url);
  const status = url.searchParams.get("status") || "all";
  const page = parseInt(url.searchParams.get("page") || "1", 10) || 1;
  const perPage = Math.min(parseInt(url.searchParams.get("perPage") || "15", 10) || 15, 50);
  const search = url.searchParams.get("search") || "";
  const allowedSort = new Set(["created", "id", "name", "state", "progress", "attempts"]);
  const sort = allowedSort.has(url.searchParams.get("sort") || "") ? url.searchParams.get("sort")! : "created";
  const dir = url.searchParams.get("dir") === "asc" ? "asc" : "desc";
  try {
    const data = await getJobs(decodeURIComponent(queue), status, page, perPage, search, sort as "created" | "id" | "name" | "state" | "progress" | "attempts", dir);
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json(
      { mode: "demo", jobs: [], total: 0, error: e instanceof Error ? e.message : "error" },
      { status: 200 }
    );
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ queue: string }> }) {
  const { queue } = await ctx.params;
  const t0 = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const name = String(body.name || "manual").slice(0, 80) || "manual";
    let data: Record<string, unknown> = {};
    if (typeof body.data === "string") {
      try {
        data = JSON.parse(body.data);
      } catch {
        data = { raw: body.data };
      }
    } else if (body.data && typeof body.data === "object") {
      data = body.data;
    }
    const delay = body.delay ? Math.min(Math.max(0, Number(body.delay) || 0), 86400000) : undefined;
    const priority = body.priority ? Math.min(Math.max(0, Number(body.priority) || 0), 100) : undefined;
    const res = await addJob(decodeURIComponent(queue), name, data, delay, priority);
    try {
      await db.insert(dashboardEvents).values({
        queue: decodeURIComponent(queue),
        action: "add-job",
        jobId: res.id,
        mode: res.mode,
        durationMs: Date.now() - t0,
      });
    } catch { /* auditoría best-effort */ }
    return Response.json(res);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
