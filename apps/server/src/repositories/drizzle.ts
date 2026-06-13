import { asc, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import type { BranchTask, GenerationTask, Message, Session, TreeNode, TreeOperation, VisualDirectionBrief } from "@voice-industrial-design/shared";

import type { ServerDatabase } from "../db/client.js";
import {
  branchTasksTable,
  generationTasksTable,
  messagesTable,
  sessionsTable,
  treeNodesTable,
  treeOperationsTable
} from "../db/schema.js";
import type {
  AppServices,
  CreateBranchTaskInput,
  CreateGenerationTaskInput,
  CreateMessageInput,
  CreateSessionInput,
  CreateTreeNodeInput,
  CreateTreeOperationInput,
  ServerRepositories,
  UpdateBranchTaskInput,
  UpdateGenerationTaskStatusInput,
  UpdateSessionAfterNodesInput,
  UpdateTaskConfirmationInput
} from "./types.js";
import { resolveTaskStateAfterConfirmation } from "./types.js";

function toIso(value: Date): string {
  return value.toISOString();
}

function mapSession(row: typeof sessionsTable.$inferSelect): Session {
  return {
    id: row.id,
    title: row.title,
    goal: row.goal,
    productDomain: "industrial_design",
    activeNodeId: row.activeNodeId,
    pendingNodeId: row.pendingNodeId,
    lastMentionedNodeId: row.lastMentionedNodeId,
    nextPublicNodeNumber: row.nextPublicNodeNumber,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt)
  };
}

function mapMessage(row: typeof messagesTable.$inferSelect): Message {
  return {
    id: row.id,
    sessionId: row.sessionId,
    taskId: row.taskId,
    role: row.role as Message["role"],
    kind: row.kind as Message["kind"],
    content: row.content,
    createdAt: toIso(row.createdAt)
  };
}

function mapTreeNode(row: typeof treeNodesTable.$inferSelect): TreeNode {
  return {
    id: row.id,
    sessionId: row.sessionId,
    parentNodeId: row.parentNodeId,
    depth: row.depth,
    displayName: row.displayName,
    label: row.label,
    publicNodeNumber: row.publicNodeNumber,
    layerOrdinal: row.layerOrdinal,
    layerVersion: row.layerVersion,
    voiceAliases: row.voiceAliases,
    intentSummary: row.intentSummary,
    formLanguage: row.formLanguage,
    userNeedResponse: row.userNeedResponse,
    inspirationHints: row.inspirationHints,
    imageUrl: row.imageUrl,
    status: row.status as TreeNode["status"],
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt)
  };
}

function mapGenerationTask(row: typeof generationTasksTable.$inferSelect): GenerationTask {
  return {
    id: row.id,
    sessionId: row.sessionId,
    actionType: row.actionType as GenerationTask["actionType"],
    targetNodeId: row.targetNodeId,
    status: row.status as GenerationTask["status"],
    confirmationRequired: row.confirmationRequired,
    confirmationStatus: row.confirmationStatus as GenerationTask["confirmationStatus"],
    rewrittenIntentForConfirmation: row.rewrittenIntentForConfirmation,
    branchCount: row.branchCount,
    transcriptText: row.transcriptText,
    designIntentSummary: row.designIntentSummary,
    branchTasks: [],
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt)
  };
}

function mapBranchTask(row: typeof branchTasksTable.$inferSelect): BranchTask {
  return {
    id: row.id,
    generationTaskId: row.generationTaskId,
    brief: row.briefPayload as VisualDirectionBrief,
    status: row.status as BranchTask["status"],
    imageUrl: row.imageUrl,
    errorMessage: row.errorMessage,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt)
  };
}

function mapTreeOperation(row: typeof treeOperationsTable.$inferSelect): TreeOperation {
  return {
    id: row.id,
    sessionId: row.sessionId,
    taskId: row.taskId,
    type: row.type as TreeOperation["type"],
    targetNodeId: row.targetNodeId,
    targetLayerVersion: row.targetLayerVersion,
    supersededNodeIds: row.supersededNodeIds,
    restoredNodeIds: row.restoredNodeIds,
    createdAt: toIso(row.createdAt)
  };
}

export function createDrizzleServices(db: ServerDatabase): AppServices {
  const repositories: ServerRepositories = {
    sessions: {
      async create(input: CreateSessionInput): Promise<Session> {
        const now = new Date();
        const inserted = await db
          .insert(sessionsTable)
          .values({
            id: randomUUID(),
            title: input.title,
            goal: input.goal,
            productDomain: "industrial_design",
            status: "active",
            rootNodeId: null,
            activeNodeId: null,
            pendingNodeId: null,
            lastMentionedNodeId: null,
            nextPublicNodeNumber: 1,
            createdAt: now,
            updatedAt: now
          })
          .returning();

        return mapSession(inserted[0]);
      },
      async getById(sessionId: string): Promise<Session | null> {
        const rows = await db
          .select()
          .from(sessionsTable)
          .where(eq(sessionsTable.id, sessionId))
          .limit(1);
        return rows[0] ? mapSession(rows[0]) : null;
      },
      async updateAfterNodesCreated(
        input: UpdateSessionAfterNodesInput
      ): Promise<Session | null> {
        const updated = await db
          .update(sessionsTable)
          .set({
            nextPublicNodeNumber: input.nextPublicNodeNumber,
            activeNodeId: input.activeNodeId ?? undefined,
            lastMentionedNodeId: input.lastMentionedNodeId ?? undefined,
            updatedAt: new Date()
          })
          .where(eq(sessionsTable.id, input.sessionId))
          .returning();
        return updated[0] ? mapSession(updated[0]) : null;
      }
    },
    messages: {
      async create(input: CreateMessageInput): Promise<Message> {
        const inserted = await db
          .insert(messagesTable)
          .values({
            id: randomUUID(),
            sessionId: input.sessionId,
            taskId: input.taskId,
            role: input.role,
            kind: input.kind,
            content: input.content,
            createdAt: new Date()
          })
          .returning();
        return mapMessage(inserted[0]);
      },
      async listBySessionId(sessionId: string): Promise<Message[]> {
        const rows = await db
          .select()
          .from(messagesTable)
          .where(eq(messagesTable.sessionId, sessionId))
          .orderBy(asc(messagesTable.createdAt));
        return rows.map(mapMessage);
      }
    },
    treeNodes: {
      async listBySessionId(sessionId: string): Promise<TreeNode[]> {
        const rows = await db
          .select()
          .from(treeNodesTable)
          .where(eq(treeNodesTable.sessionId, sessionId))
          .orderBy(asc(treeNodesTable.depth), asc(treeNodesTable.layerOrdinal));
        return rows.map(mapTreeNode);
      },
      async createMany(input: CreateTreeNodeInput[]): Promise<TreeNode[]> {
        if (input.length === 0) {
          return [];
        }

        const now = new Date();
        const inserted = await db
          .insert(treeNodesTable)
          .values(
            input.map((node) => ({
              id: randomUUID(),
              sessionId: node.sessionId,
              parentNodeId: node.parentNodeId,
              createdFromTaskId: node.createdFromTaskId,
              depth: node.depth,
              layerOrdinal: node.layerOrdinal,
              layerVersion: node.layerVersion,
              publicNodeNumber: node.publicNodeNumber,
              displayName: node.displayName,
              label: node.label,
              voiceAliases: node.voiceAliases,
              intentSummary: node.intentSummary,
              formLanguage: node.formLanguage,
              userNeedResponse: node.userNeedResponse,
              inspirationHints: node.inspirationHints,
              imageUrl: node.imageUrl,
              status: node.status,
              createdAt: now,
              updatedAt: now
            }))
          )
          .returning();
        return inserted.map(mapTreeNode);
      }
    },
    generationTasks: {
      async create(input: CreateGenerationTaskInput): Promise<GenerationTask> {
        const now = new Date();
        const inserted = await db
          .insert(generationTasksTable)
          .values({
            id: randomUUID(),
            sessionId: input.sessionId,
            targetNodeId: input.targetNodeId,
            actionType: input.actionType,
            branchCount: input.branchCount,
            status: input.confirmationRequired ? "awaiting_confirmation" : "queued",
            confirmationRequired: input.confirmationRequired,
            confirmationStatus: input.confirmationRequired
              ? "awaiting_confirmation"
              : "not_required",
            transcriptText: input.transcriptText,
            designIntentSummary: input.designIntentSummary,
            rewrittenIntentForConfirmation: input.rewrittenIntentForConfirmation,
            assistantReply: input.assistantReply,
            errorMessage: null,
            createdAt: now,
            updatedAt: now
          })
          .returning();

        return mapGenerationTask(inserted[0]);
      },
      async getById(taskId: string): Promise<GenerationTask | null> {
        const rows = await db
          .select()
          .from(generationTasksTable)
          .where(eq(generationTasksTable.id, taskId))
          .limit(1);
        return rows[0] ? mapGenerationTask(rows[0]) : null;
      },
      async updateStatus(
        input: UpdateGenerationTaskStatusInput
      ): Promise<GenerationTask | null> {
        const updated = await db
          .update(generationTasksTable)
          .set({
            status: input.status,
            errorMessage: input.errorMessage,
            updatedAt: new Date()
          })
          .where(eq(generationTasksTable.id, input.taskId))
          .returning();
        return updated[0] ? mapGenerationTask(updated[0]) : null;
      },
      async updateConfirmation(
        input: UpdateTaskConfirmationInput
      ): Promise<GenerationTask | null> {
        const nextState = resolveTaskStateAfterConfirmation(input.decision);
        const updated = await db
          .update(generationTasksTable)
          .set({
            status: nextState.status,
            confirmationStatus: nextState.confirmationStatus,
            updatedAt: new Date()
          })
          .where(eq(generationTasksTable.id, input.taskId))
          .returning();
        return updated[0] ? mapGenerationTask(updated[0]) : null;
      }
    },
    branchTasks: {
      async create(input: CreateBranchTaskInput): Promise<BranchTask> {
        const now = new Date();
        const inserted = await db
          .insert(branchTasksTable)
          .values({
            id: randomUUID(),
            generationTaskId: input.generationTaskId,
            branchIndex: input.branchIndex,
            status: input.status,
            briefPayload: input.brief,
            imageUrl: input.imageUrl,
            persistedNodeId: null,
            errorMessage: input.errorMessage,
            createdAt: now,
            updatedAt: now
          })
          .returning();
        return mapBranchTask(inserted[0]);
      },
      async update(input: UpdateBranchTaskInput): Promise<BranchTask | null> {
        const updated = await db
          .update(branchTasksTable)
          .set({
            status: input.status,
            imageUrl: input.imageUrl,
            persistedNodeId: input.persistedNodeId,
            errorMessage: input.errorMessage,
            updatedAt: new Date()
          })
          .where(eq(branchTasksTable.id, input.branchTaskId))
          .returning();
        return updated[0] ? mapBranchTask(updated[0]) : null;
      }
    },
    treeOperations: {
      async create(input: CreateTreeOperationInput): Promise<TreeOperation> {
        const inserted = await db
          .insert(treeOperationsTable)
          .values({
            id: randomUUID(),
            sessionId: input.sessionId,
            taskId: input.taskId,
            type: input.type,
            targetNodeId: input.targetNodeId,
            targetLayerVersion: input.targetLayerVersion,
            insertedNodeIds: input.insertedNodeIds,
            supersededNodeIds: input.supersededNodeIds,
            restoredNodeIds: input.restoredNodeIds,
            payload: input.payload,
            createdAt: new Date()
          })
          .returning();
        return mapTreeOperation(inserted[0]);
      },
      async getLastUndoableBySessionId(
        sessionId: string
      ): Promise<TreeOperation | null> {
        const rows = await db
          .select()
          .from(treeOperationsTable)
          .where(eq(treeOperationsTable.sessionId, sessionId))
          .orderBy(desc(treeOperationsTable.createdAt))
          .limit(10);
        const operation = rows.find((row) => row.type !== "undo");
        return operation ? mapTreeOperation(operation) : null;
      }
    }
  };

  return {
    repositories,
    persistenceMode: "postgres"
  };
}
