import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";

export const dashboardEvents = pgTable("dashboard_events", {
  id: serial("id").primaryKey(),
  queue: text("queue").notNull(),
  action: text("action").notNull(),
  jobId: text("job_id"),
  mode: text("mode").notNull().default("demo"),
  durationMs: integer("duration_ms"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type DashboardEvent = typeof dashboardEvents.$inferSelect;
