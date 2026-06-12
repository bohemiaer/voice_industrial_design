export const APP_NAME = "Voice Industrial Design";

export const TASK_STATUS = [
  "queued",
  "transcribing",
  "reasoning",
  "awaiting_confirmation",
  "generating",
  "completed",
  "failed",
  "cancelled"
] as const;

export type TaskStatus = (typeof TASK_STATUS)[number];
