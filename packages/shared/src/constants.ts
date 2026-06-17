export const APP_NAME = "Voice Industrial Design";

export const TASK_STATUS = [
  "queued",
  "transcribing",
  "reasoning",
  "generating",
  "completed",
  "failed",
  "cancelled"
] as const;

export const BRANCH_TASK_STATUS = [
  "queued",
  "generating",
  "completed",
  "failed"
] as const;

export const TREE_NODE_STATUS = [
  "draft",
  "generating",
  "ready",
  "failed"
] as const;

export const MESSAGE_ROLE = ["user", "assistant", "system"] as const;

export const MESSAGE_KIND = [
  "transcript",
  "status",
  "summary",
  "confirmation",
  "hint"
] as const;

export const CONFIRMATION_STATUS = [
  "not_required",
  "awaiting_confirmation",
  "confirmed",
  "cancelled"
] as const;

export const BRAINSTORM_ACTION_TYPE = [
  "diverge",
  "refresh"
] as const;

export const TREE_OPERATION_TYPE = [
  "diverge",
  "refresh",
  "delete",
  "undo",
  "redo"
] as const;

export const NODE_REFERENCE_STRATEGY = [
  "public_node_number",
  "display_name",
  "layer_ordinal",
  "last_mentioned"
] as const;

export type TaskStatus = (typeof TASK_STATUS)[number];
export type BranchTaskStatus = (typeof BRANCH_TASK_STATUS)[number];
export type TreeNodeStatus = (typeof TREE_NODE_STATUS)[number];
export type MessageRole = (typeof MESSAGE_ROLE)[number];
export type MessageKind = (typeof MESSAGE_KIND)[number];
export type ConfirmationStatus = (typeof CONFIRMATION_STATUS)[number];
export type BrainstormActionType = (typeof BRAINSTORM_ACTION_TYPE)[number];
export type TreeOperationType = (typeof TREE_OPERATION_TYPE)[number];
export type NodeReferenceStrategy = (typeof NODE_REFERENCE_STRATEGY)[number];
