import { getOverview } from "@/lib/bull-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const t0 = Date.now();
    const data = await getOverview();
    return Response.json(
      { ...data, serverMs: Date.now() - t0 },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return Response.json(
      { mode: "demo", queues: [], error: e instanceof Error ? e.message : "error" },
      { status: 200 }
    );
  }
}
