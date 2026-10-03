import { getJobDetail, jobAction } from "@/lib/bull-service";
import { db } from "@/db";
import { dashboardEvents } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ queue: string; id: string }> }) {
  const { queue, id } = await ctx.params;
  try {
    const data = await getJobDetail(decodeURIComponent(queue), decodeURIComponent(id));
    if (!data.job) return Response.json({ error: "no encontrado" }, { status: 404 });
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ queue: string; id: string }> }) {
  const { queue, id } = await ctx.params;
  const t0 = Date.now();
  try {
    const res = await jobAction(decodeURIComponent(queue), decodeURIComponent(id), "remove");
    try {
      await db.insert(dashboardEvents).values({
        queue: decodeURIComponent(queue),
        action: "remove-job",
        jobId: decodeURIComponent(id),
        mode: res.mode,
        durationMs: Date.now() - t0,
      });
    } catch { /* noop */ }
    return Response.json({ ok: true, ...res });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
