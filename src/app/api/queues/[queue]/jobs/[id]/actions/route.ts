import { jobAction } from "@/lib/bull-service";
import { db } from "@/db";
import { dashboardEvents } from "@/db/schema";

export const dynamic = "force-dynamic";

const ALLOWED = new Set(["retry", "remove", "promote", "fail"]);

export async function POST(req: Request, ctx: { params: Promise<{ queue: string; id: string }> }) {
  const { queue, id } = await ctx.params;
  const t0 = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    if (!ALLOWED.has(action)) return Response.json({ error: "acción no válida" }, { status: 400 });
    const res = await jobAction(decodeURIComponent(queue), decodeURIComponent(id), action);
    try {
      await db.insert(dashboardEvents).values({
        queue: decodeURIComponent(queue),
        action: `job:${action}`,
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
