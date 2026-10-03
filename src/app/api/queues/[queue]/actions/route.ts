import { queueAction } from "@/lib/bull-service";
import { db } from "@/db";
import { dashboardEvents } from "@/db/schema";

export const dynamic = "force-dynamic";

const ALLOWED = new Set([
  "pause",
  "resume",
  "drain",
  "clean-completed",
  "clean-failed",
  "retry-failed",
  "obliterate",
]);

export async function POST(req: Request, ctx: { params: Promise<{ queue: string }> }) {
  const { queue } = await ctx.params;
  const t0 = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    if (!ALLOWED.has(action)) {
      return Response.json({ error: "acción no válida" }, { status: 400 });
    }
    const name = decodeURIComponent(queue);
    const res = await queueAction(name, action);
    try {
      await db.insert(dashboardEvents).values({
        queue: name,
        action,
        mode: res.mode,
        durationMs: Date.now() - t0,
      });
    } catch { /* best-effort */ }
    return Response.json({ ok: true, ...res });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
