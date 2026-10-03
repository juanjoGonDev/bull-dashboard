export interface Counts {
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
  paused: number;
  prioritized: number;
  total: number;
}
export interface QueueInfo {
  name: string;
  prefix: string;
  paused: boolean;
  counts: Counts;
}
export interface JobRow {
  id: string;
  name: string;
  state: string;
  data: Record<string, unknown>;
  progress: number;
  attemptsMade: number;
  timestamp: number;
  finishedOn: number | null;
  failedReason: string | null;
}
export interface JobDetail extends JobRow {
  raw?: Record<string, string>;
  stacktrace?: string[];
}
export interface RedisInfo {
  mode: "redis" | "demo";
  connected: boolean;
  url: string;
  version?: string;
  usedMemory?: string;
  clients?: string;
  uptime?: string;
  latencyMs: number;
}
