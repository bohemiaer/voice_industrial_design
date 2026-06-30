import { and, asc, desc, eq, inArray } from "drizzle-orm";
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
  UpdateSessionAfterNodesInput
} from "./types.js";

function toIso(value: Date): string {
  return value.toISOString();
}

function mapSession(row: typeof sessionsTable.$inferSelect): Session {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    title: row.title,
    goal: row.goal,
    productDomain: "industrial_design",
    currentSelectedNodeId: row.currentSelectedNodeId,
    lastExecutedTargetNodeId: row.lastExecutedTargetNodeId,
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
    childGroupId: row.childGroupId,
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
    suggestedFollowups: row.suggestedFollowups,
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
    affectedChildGroupId: row.affectedChildGroupId,
    insertedNodeIds: row.insertedNodeIds,
    deletedNodeIds: row.deletedNodeIds,
    supersededNodeIds: row.supersededNodeIds,
    restoredNodeIds: row.restoredNodeIds,
    undoOfOperationId: row.undoOfOperationId,
    redoOfOperationId: row.redoOfOperationId,
    payload: row.payload,
    createdAt: toIso(row.createdAt)
  };
}

async function getGenerationTaskWithBranches(
  db: ServerDatabase,
  taskId: string
): Promise<GenerationTask | null> {
  const rows = await db
    .select()
    .from(generationTasksTable)
    .where(eq(generationTasksTable.id, taskId))
    .limit(1);

  if (!rows[0]) {
    return null;
  }

  const branchRows = await db
    .select()
    .from(branchTasksTable)
    .where(eq(branchTasksTable.generationTaskId, taskId))
    .orderBy(asc(branchTasksTable.branchIndex));

  return {
    ...mapGenerationTask(rows[0]),
    branchTasks: branchRows.map(mapBranchTask)
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
            ownerUserId: input.ownerUserId,
            title: input.title,
            goal: input.goal,
            productDomain: "industrial_design",
            status: "active",
            rootNodeId: null,
            currentSelectedNodeId: null,
            lastExecutedTargetNodeId: null,
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
      async listByOwnerUserId(ownerUserId: string): Promise<Session[]> {
        const rows = await db
          .select()
          .from(sessionsTable)
          .where(eq(sessionsTable.ownerUserId, ownerUserId))
          .orderBy(desc(sessionsTable.updatedAt));
        return rows.map(mapSession);
      },
      async updateAfterNodesCreated(
        input: UpdateSessionAfterNodesInput
      ): Promise<Session | null> {
        const updated = await db
          .update(sessionsTable)
          .set({
            goal: input.goal ?? undefined,
            nextPublicNodeNumber: input.nextPublicNodeNumber,
            currentSelectedNodeId: input.currentSelectedNodeId ?? undefined,
            lastExecutedTargetNodeId:
              input.lastExecutedTargetNodeId ?? undefined,
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
      },
      async getLatestMemorySummary(sessionId: string): Promise<Message | null> {
        const rows = await db
          .select()
          .from(messagesTable)
          .where(
            and(
              eq(messagesTable.sessionId, sessionId),
              eq(messagesTable.kind, "memory_summary")
            )
          )
          .orderBy(desc(messagesTable.createdAt))
          .limit(1);
        return rows[0] ? mapMessage(rows[0]) : null;
      }
    },
    treeNodes: {
      async listBySessionId(sessionId: string): Promise<TreeNode[]> {
        const rows = await db
          .select()
          .from(treeNodesTable)
          .where(eq(treeNodesTable.sessionId, sessionId))
          .orderBy(asc(treeNodesTable.depth), asc(treeNodesTable.layerOrdinal));
        return rows.filter((row) => row.supersededAt === null).map(mapTreeNode);
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
              childGroupId: node.childGroupId,
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
              suggestedFollowups: node.suggestedFollowups,
              imageUrl: node.imageUrl,
              status: node.status,
              createdAt: now,
              updatedAt: now
            }))
          )
          .returning();
        return inserted.map(mapTreeNode);
      },
      async markSuperseded(input: {
        nodeIds: string[];
        operationId: string;
      }): Promise<void> {
        if (input.nodeIds.length === 0) {
          return;
        }

        await db
          .update(treeNodesTable)
          .set({
            supersededAt: new Date(),
            supersededByOperationId: input.operationId,
            updatedAt: new Date()
          })
          .where(inArray(treeNodesTable.id, input.nodeIds));
      },
      async restore(nodeIds: string[]): Promise<void> {
        if (nodeIds.length === 0) {
          return;
        }

        await db
          .update(treeNodesTable)
          .set({
            supersededAt: null,
            supersededByOperationId: null,
            updatedAt: new Date()
          })
          .where(inArray(treeNodesTable.id, nodeIds));
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
            status: "queued",
            confirmationRequired: false,
            confirmationStatus: "not_required",
            transcriptText: input.transcriptText,
            designIntentSummary: input.designIntentSummary,
            rewrittenIntentForConfirmation: null,
            assistantReply: input.assistantReply,
            errorMessage: null,
            createdAt: now,
            updatedAt: now
          })
          .returning();

        return mapGenerationTask(inserted[0]);
      },
      async getById(taskId: string): Promise<GenerationTask | null> {
        return getGenerationTaskWithBranches(db, taskId);
      },
      async getRunningBySessionId(sessionId: string): Promise<GenerationTask | null> {
        const rows = await db
          .select()
          .from(generationTasksTable)
          .where(eq(generationTasksTable.sessionId, sessionId))
          .orderBy(desc(generationTasksTable.createdAt))
          .limit(20);
        const task = rows.find((row) =>
          ["queued", "transcribing", "reasoning", "generating"].includes(row.status)
        );
        return task ? getGenerationTaskWithBranches(db, task.id) : null;
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
        return updated[0]
          ? getGenerationTaskWithBranches(db, input.taskId)
          : null;
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
            affectedChildGroupId: input.affectedChildGroupId,
            insertedNodeIds: input.insertedNodeIds,
            deletedNodeIds: input.deletedNodeIds,
            supersededNodeIds: input.supersededNodeIds,
            restoredNodeIds: input.restoredNodeIds,
            undoOfOperationId: input.undoOfOperationId,
            redoOfOperationId: input.redoOfOperationId,
            payload: input.payload,
            createdAt: new Date()
          })
          .returning();
        return mapTreeOperation(inserted[0]);
      },
      async getById(operationId: string): Promise<TreeOperation | null> {
        const rows = await db
          .select()
          .from(treeOperationsTable)
          .where(eq(treeOperationsTable.id, operationId))
          .limit(1);
        return rows[0] ? mapTreeOperation(rows[0]) : null;
      },
      async getByTaskId(taskId: string): Promise<TreeOperation | null> {
        const rows = await db
          .select()
          .from(treeOperationsTable)
          .where(eq(treeOperationsTable.taskId, taskId))
          .orderBy(desc(treeOperationsTable.createdAt))
          .limit(10);
        const operation = rows.find(
          (row) => row.type !== "undo" && row.type !== "redo"
        );
        return operation ? mapTreeOperation(operation) : null;
      },
      async getLastUndoableBySessionId(
        sessionId: string
      ): Promise<TreeOperation | null> {
        const rows = await db
          .select()
          .from(treeOperationsTable)
          .where(eq(treeOperationsTable.sessionId, sessionId))
          .orderBy(desc(treeOperationsTable.createdAt))
          .limit(1);
        const latestOperation = rows[0];

        if (!latestOperation || latestOperation.type === "undo") {
          return null;
        }

        return mapTreeOperation(latestOperation);
      },
      async getLatestBySessionId(sessionId: string): Promise<TreeOperation | null> {
        const rows = await db
          .select()
          .from(treeOperationsTable)
          .where(eq(treeOperationsTable.sessionId, sessionId))
          .orderBy(desc(treeOperationsTable.createdAt))
          .limit(1);
        return rows[0] ? mapTreeOperation(rows[0]) : null;
      }
    }
  };

  return {
    repositories,
    persistenceMode: "postgres"
  };
}
