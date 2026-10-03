import { db } from "@/db";
import { dashboardEvents } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await db.select().from(dashboardEvents).orderBy(desc(dashboardEvents.id)).limit(20);
    return Response.json({ events: rows });
  } catch {
    return Response.json({ events: [] });
  }
}
