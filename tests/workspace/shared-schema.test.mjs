import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const distEntry = pathToFileURL(
  path.join(process.cwd(), "packages", "shared", "dist", "index.js")
).href;

test("shared dist entry exists after build", async () => {
  const shared = await import(distEntry);

  assert.ok(shared.SessionSchema);
  assert.ok(shared.TreeNodeSchema);
  assert.ok(shared.GenerationTaskSchema);
});

test("brainstorm output schema enforces direct execution shape and branch count", async () => {
  const shared = await import(distEntry);

  const valid = shared.BrainstormAssistantOutputSchema.safeParse({
    actionType: "diverge",
    targetNodeId: "node_12",
    branchCount: 2,
    designIntentSummary: "沿轻薄办公感继续下钻",
    assistantReply: "我将沿当前方向继续生成两个更柔和的子方向。",
    promptHints: ["可继续补充比例和材质倾向"],
    directionBriefs: [
      {
        briefId: "brief_1",
        targetParentNodeId: "node_12",
        label: "薄边柔和式",
        displayName: "薄边柔和式",
        intentSummary: "保留办公气质，边缘更圆润",
        formLanguage: ["圆润", "低重心"],
        userNeedResponse: ["更适合办公环境"],
        inspirationHints: ["显示器底座"],
        suggestedFollowups: ["继续细化比例", "强化材质方向", "探索交互细节"],
        variationAxis: "边界柔和程度",
        promptIntent: "工业设计草图，低重心，柔和边界"
      },
      {
        briefId: "brief_2",
        targetParentNodeId: "node_12",
        label: "悬浮纤薄式",
        displayName: "悬浮纤薄式",
        intentSummary: "通过底部留空减轻体量感",
        formLanguage: ["轻薄", "悬浮"],
        userNeedResponse: ["更轻盈"],
        inspirationHints: ["桌面音箱"],
        suggestedFollowups: ["继续细化比例", "强化材质方向", "探索交互细节"],
        variationAxis: "底部留空比例",
        promptIntent: "工业设计草图，轻薄，悬浮底座"
      }
    ]
  });

  assert.equal(valid.success, true);

  const invalid = shared.BrainstormAssistantOutputSchema.safeParse({
    actionType: "refresh",
    targetNodeId: "node_12",
    branchCount: 2,
    designIntentSummary: "刷新当前层",
    assistantReply: "我将刷新当前层。",
    promptHints: [],
    directionBriefs: []
  });

  assert.equal(invalid.success, false);
});

test("shared schemas accept unified turn-planner fields", async () => {
  const shared = await import(distEntry);

  const session = shared.SessionSchema.parse({
    id: "session-1",
    ownerUserId: "user-1",
    title: "Tree planner",
    goal: "Unify workbench flow",
    productDomain: "industrial_design",
    currentSelectedNodeId: "session-1",
    lastExecutedTargetNodeId: "session-1",
    pendingNodeId: null,
    lastMentionedNodeId: null,
    nextPublicNodeNumber: 4,
    createdAt: "2026-06-16T00:00:00.000+08:00",
    updatedAt: "2026-06-16T00:00:00.000+08:00"
  });

  const task = shared.GenerationTaskSchema.parse({
    id: "task-1",
    sessionId: "session-1",
    actionType: "diverge",
    targetNodeId: "session-1",
    status: "queued",
    branchCount: 3,
    transcriptText: "先发散三个方向",
    designIntentSummary: "diverge root node",
    branchTasks: [],
    createdAt: "2026-06-16T00:00:00.000+08:00",
    updatedAt: "2026-06-16T00:00:00.000+08:00"
  });

  const operation = shared.TreeOperationSchema.parse({
    id: "op-1",
    sessionId: "session-1",
    taskId: "task-1",
    type: "refresh",
    targetNodeId: "node-2",
    targetLayerVersion: 2,
    affectedChildGroupId: "group-2",
    insertedNodeIds: ["node-7", "node-8", "node-9"],
    deletedNodeIds: [],
    supersededNodeIds: ["node-4", "node-5", "node-6"],
    restoredNodeIds: [],
    undoOfOperationId: null,
    redoOfOperationId: null,
    payload: { branchCount: 3 },
    createdAt: "2026-06-16T00:00:00.000+08:00"
  });

  assert.equal(session.currentSelectedNodeId, "session-1");
  assert.equal(task.actionType, "diverge");
  assert.equal(operation.affectedChildGroupId, "group-2");
});

test("tree node schema requires stable naming and voice aliases", async () => {
  const shared = await import(distEntry);

  const result = shared.TreeNodeSchema.safeParse({
    id: "node_12",
    sessionId: "session_1",
    parentNodeId: "node_7",
    childGroupId: "group_2",
    depth: 2,
    displayName: "轻薄办公感",
    label: "方向 12",
    publicNodeNumber: 12,
    layerOrdinal: 2,
    layerVersion: 1,
    voiceAliases: ["轻薄办公感", "12 号节点", "第二个方向"],
    intentSummary: "扁平比例，更适合开放办公桌面",
    formLanguage: ["轻薄", "低重心"],
    userNeedResponse: ["适合办公环境"],
    inspirationHints: ["显示器底座", "桌面设备"],
    suggestedFollowups: ["继续细化比例", "强化材质方向", "探索交互细节"],
    imageUrl: "https://example.com/sketch-12.png",
    status: "ready",
    createdAt: "2026-06-12T10:00:00+08:00",
    updatedAt: "2026-06-12T10:05:00+08:00"
  });

  assert.equal(result.success, true);
});

test("v1 schemas validate standard intent, chat, and memory payloads", async () => {
  const shared = await import(distEntry);

  const standardIntent = shared.StandardTurnIntentSchema.parse({
    sessionId: "session-1",
    userIntentText: "解释一下当前节点",
    intentKind: "chat",
    chatType: "explain_node",
    targetNodeId: "node-1",
    source: "text"
  });

  assert.equal(standardIntent.intentKind, "chat");

  const chatOutput = shared.ChatAssistantOutputSchema.parse({
    assistantReply: "这个方向强调轻薄和悬浮感。"
  });

  assert.equal(chatOutput.assistantReply.includes("轻薄"), true);

  const memoryOutput = shared.MemorySummarizerOutputSchema.parse({
    stablePreferences: ["偏好轻薄"],
    activeConstraints: ["不要偏离桌面设备"],
    rejectedDirections: ["过于机械"],
    openQuestions: ["是否需要移动电源"],
    shortSummary: "用户偏好轻薄、克制的桌面设备方向。"
  });

  assert.equal(memoryOutput.shortSummary.length > 0, true);
});

test("brainstorm input carries defaultBranchCount and memory shortSummary", async () => {
  const shared = await import(distEntry);

  const input = shared.BrainstormAssistantInputSchema.parse({
    sessionGoal: "探索桌面补光设备",
    transcriptText: "这组换一版",
    selectedNodeId: "node-1",
    selectedNodeSummary: {
      publicNodeNumber: 1,
      displayName: "轻薄悬浮感",
      label: "方向 1",
      intentSummary: "压缩体量并强化悬浮底座。",
      formLanguage: ["轻薄"],
      userNeedResponse: ["降低桌面压迫"],
      inspirationHints: ["办公设备"]
    },
    ancestorPath: [],
    conversationHistory: [],
    conversationMemory: {
      stablePreferences: ["轻薄"],
      activeConstraints: ["办公桌面"],
      rejectedDirections: [],
      openQuestions: [],
      shortSummary: "用户持续偏好轻薄办公设备。"
    },
    siblingSummaries: [],
    constraints: {
      minBranchCount: 3,
      maxBranchCount: 4,
      defaultBranchCount: 4,
      productDomain: "industrial_design",
      sketchStage: "early",
      inputMode: "voice_only"
    }
  });

  assert.equal(input.constraints.defaultBranchCount, 4);
  assert.equal(input.conversationMemory.shortSummary.includes("轻薄"), true);
});
