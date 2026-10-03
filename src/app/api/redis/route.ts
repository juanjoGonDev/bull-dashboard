import { getRedisInfo } from "@/lib/bull-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const info = await getRedisInfo();
    return Response.json(info, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json(
      { mode: "demo", connected: false, url: "?", latencyMs: 0, error: e instanceof Error ? e.message : "error" },
      { status: 200 }
    );
  }
}
