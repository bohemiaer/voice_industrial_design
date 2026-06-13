import { pgTable, uuid, text, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";

export const sessionsTable = pgTable("sessions", {
  id: uuid("id").primaryKey(),
  title: text("title").notNull(),
  goal: text("goal").notNull(),
  productDomain: text("product_domain").notNull(),
  status: text("status").notNull(),
  rootNodeId: uuid("root_node_id"),
  activeNodeId: uuid("active_node_id"),
  pendingNodeId: uuid("pending_node_id"),
  lastMentionedNodeId: uuid("last_mentioned_node_id"),
  nextPublicNodeNumber: integer("next_public_node_number").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
});

export const messagesTable = pgTable("messages", {
  id: uuid("id").primaryKey(),
  sessionId: uuid("session_id").notNull(),
  taskId: uuid("task_id"),
  role: text("role").notNull(),
  kind: text("kind").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});

export const treeNodesTable = pgTable("tree_nodes", {
  id: uuid("id").primaryKey(),
  sessionId: uuid("session_id").notNull(),
  parentNodeId: uuid("parent_node_id"),
  createdFromTaskId: uuid("created_from_task_id"),
  depth: integer("depth").notNull(),
  layerOrdinal: integer("layer_ordinal").notNull(),
  layerVersion: integer("layer_version").notNull(),
  publicNodeNumber: integer("public_node_number").notNull(),
  displayName: text("display_name").notNull(),
  label: text("label").notNull(),
  voiceAliases: jsonb("voice_aliases").$type<string[]>().notNull(),
  intentSummary: text("intent_summary").notNull(),
  formLanguage: jsonb("form_language").$type<string[]>().notNull(),
  userNeedResponse: jsonb("user_need_response").$type<string[]>().notNull(),
  inspirationHints: jsonb("inspiration_hints").$type<string[]>().notNull(),
  imageUrl: text("image_url"),
  status: text("status").notNull(),
  supersededAt: timestamp("superseded_at", { withTimezone: true }),
  supersededByOperationId: uuid("superseded_by_operation_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
});

export const generationTasksTable = pgTable("generation_tasks", {
  id: uuid("id").primaryKey(),
  sessionId: uuid("session_id").notNull(),
  targetNodeId: uuid("target_node_id").notNull(),
  actionType: text("action_type").notNull(),
  branchCount: integer("branch_count").notNull(),
  status: text("status").notNull(),
  confirmationRequired: boolean("confirmation_required").notNull(),
  confirmationStatus: text("confirmation_status").notNull(),
  transcriptText: text("transcript_text").notNull(),
  designIntentSummary: text("design_intent_summary").notNull(),
  rewrittenIntentForConfirmation: text("rewritten_intent_for_confirmation"),
  assistantReply: text("assistant_reply"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
});

export const branchTasksTable = pgTable("branch_tasks", {
  id: uuid("id").primaryKey(),
  generationTaskId: uuid("generation_task_id").notNull(),
  branchIndex: integer("branch_index").notNull(),
  status: text("status").notNull(),
  briefPayload: jsonb("brief_payload").notNull(),
  imageUrl: text("image_url"),
  persistedNodeId: uuid("persisted_node_id"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
});

export const treeOperationsTable = pgTable("tree_operations", {
  id: uuid("id").primaryKey(),
  sessionId: uuid("session_id").notNull(),
  taskId: uuid("task_id"),
  type: text("type").notNull(),
  targetNodeId: uuid("target_node_id").notNull(),
  targetLayerVersion: integer("target_layer_version"),
  insertedNodeIds: jsonb("inserted_node_ids").$type<string[]>().notNull(),
  supersededNodeIds: jsonb("superseded_node_ids").$type<string[]>().notNull(),
  restoredNodeIds: jsonb("restored_node_ids").$type<string[]>().notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});
