import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const appEntry = pathToFileURL(
  path.join(process.cwd(), "apps", "server", "dist", "app.js")
).href;

process.env.SILICONFLOW_IMAGE_MODEL ??= "test-image-model";
const appSource = readSource("apps/server/src/app.ts");
const sessionRoutesSource = readSource("apps/server/src/routes/sessions.ts");
const orchestratorSource = readSource("apps/server/src/orchestrator/service.ts");
const siliconFlowSource = readSource("apps/server/src/agents/siliconflow.ts");
const TEST_USER = {
  userId: "00000000-0000-4000-8000-000000000001",
  email: "designer@example.com"
};
const OTHER_USER = {
  userId: "00000000-0000-4000-8000-000000000002",
  email: "reviewer@example.com"
};

function readSource(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

async function createTestApp() {
  const { buildApp } = await import(appEntry);
  return buildApp({
    persistenceMode: "memory",
    agentProvider: "siliconflow",
    agentGateway: createDeterministicGateway(),
    defaultAuthenticatedUser: TEST_USER
  });
}

async function createTestAppWithGateway(agentGateway) {
  const { buildApp } = await import(appEntry);
  return buildApp({
    persistenceMode: "memory",
    agentProvider: "siliconflow",
    agentGateway,
    defaultAuthenticatedUser: TEST_USER
  });
}

async function createAuthEnforcedTestApp() {
  const { buildApp } = await import(appEntry);
  return buildApp({
    persistenceMode: "memory",
    agentProvider: "siliconflow",
    agentGateway: createDeterministicGateway(),
    authRequired: true,
    authVerifier: async (token) => {
      if (token === "test-user-token") {
        return TEST_USER;
      }

      if (token === "other-user-token") {
        return OTHER_USER;
      }

      return null;
    }
  });
}

function createDeterministicGateway() {
  return {
    async transcribeAudio(input) {
      return {
        transcriptText: input.transcriptText ?? "围绕这个目标先发散三个方向"
      };
    },
    async runBrainstormAssistant(input) {
      const branchCount = extractExplicitBranchCount(input.transcriptText) ?? 3;
      const actionType = input.transcriptText.includes("刷新")
        ? "refresh_layer"
        : input.selectedNodeSummary.formLanguage.length > 0
          ? "branch_deeper"
          : "expand_branches";

      return {
        actionType,
        targetNodeId: input.selectedNodeId,
        branchCount,
        designIntentSummary: `围绕“${input.sessionGoal}”继续展开。`,
        assistantReply: `现在基于当前节点执行 ${actionType}，生成 ${branchCount} 个方向。`,
        promptHints: ["白底线稿"],
        directionBriefs: Array.from({ length: branchCount }, (_, index) => ({
          briefId: `brief-${index + 1}`,
          targetParentNodeId: input.selectedNodeId,
          label: `方向 ${index + 1}`,
          displayName: `方向 ${index + 1}`,
          intentSummary: `探索方向 ${index + 1}`,
          formLanguage: ["轻薄"],
          userNeedResponse: ["降低桌面压迫感"],
          inspirationHints: ["办公设备"],
          suggestedFollowups: ["继续细化比例", "强化材质方向", "探索交互细节"],
          variationAxis: `变化轴 ${index + 1}`,
          promptIntent: `生成方向 ${index + 1} 草图`
        }))
      };
    },
    async generateSketch(input) {
      return {
        imageId: `image-${input.brief.briefId}`,
        briefId: input.brief.briefId,
        imageUrl: `https://example.com/${input.brief.briefId}.png`,
        promptUsed: input.brief.promptIntent,
        negativePromptUsed: "photorealistic",
        visualSummary: `${input.brief.displayName} 草图`
      };
    }
  };
}

function extractExplicitBranchCount(transcriptText) {
  const arabicMatch = transcriptText.match(/([0-9]+)\s*(个|种|条|组)/);

  if (arabicMatch) {
    return Number(arabicMatch[1]);
  }

  const chineseMatch = transcriptText.match(/([一二两三四五六七八九十])\s*(个|种|条|组)/);

  if (!chineseMatch) {
    return null;
  }

  const chineseNumbers = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10
  };

  return chineseNumbers[chineseMatch[1]] ?? null;
}

async function submitVoiceTurnWithRetry(
  app,
  sessionId,
  payload,
  attempts = 5
) {
  let lastResponse = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await app.inject({
      method: "POST",
      url: `/api/sessions/${sessionId}/voice-turns`,
      payload
    });

    lastResponse = response;

    if (response.statusCode !== 202) {
      continue;
    }

    const body = response.json();

    if (body.task?.status === "failed") {
      continue;
    }

    return response;
  }

  return lastResponse;
}

async function waitForTaskStatus(
  app,
  taskId,
  statuses = ["completed", "failed"],
  attempts = 80,
  intervalMs = 25
) {
  let lastTask = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await app.inject({
      method: "GET",
      url: `/api/tasks/${taskId}`
    });

    assert.equal(response.statusCode, 200);
    const task = response.json().task;
    lastTask = task;

    if (statuses.includes(task.status)) {
      return task;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return lastTask;
}

function liveTest(name, fn) {
  return test(name, { concurrency: false }, fn);
}

function authHeaders(token = "test-user-token") {
  return {
    authorization: `Bearer ${token}`
  };
}

test("health endpoint reports server status", async () => {
  const app = await createTestApp();

  const response = await app.inject({
    method: "GET",
    url: "/health"
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    ok: true,
    service: "voice-industrial-design-server",
    persistenceMode: "memory"
  });

  await app.close();
});

test("protected APIs reject requests without auth", async () => {
  const app = await createAuthEnforcedTestApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/sessions",
    payload: {
      title: "未登录测试",
      goal: "验证接口必须登录"
    }
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error.code, "AUTH_REQUIRED");

  await app.close();
});

test("protected APIs reject invalid auth tokens", async () => {
  const app = await createAuthEnforcedTestApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/sessions",
    headers: authHeaders("bad-token"),
    payload: {
      title: "无效 token 测试",
      goal: "验证接口拒绝无效 token"
    }
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error.code, "AUTH_INVALID");

  await app.close();
});

test("session creation stores the authenticated owner user id", async () => {
  const app = await createAuthEnforcedTestApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/sessions",
    headers: authHeaders(),
    payload: {
      title: "归属测试",
      goal: "验证新会话归属当前用户"
    }
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.json().session.ownerUserId, TEST_USER.userId);

  await app.close();
});

test("users cannot read or mutate sessions owned by another user", async () => {
  const app = await createAuthEnforcedTestApp();

  const createResponse = await app.inject({
    method: "POST",
    url: "/api/sessions",
    headers: authHeaders(),
    payload: {
      title: "跨用户隔离",
      goal: "验证其他用户不能访问这个会话"
    }
  });
  assert.equal(createResponse.statusCode, 201);
  const { session } = createResponse.json();

  const treeResponse = await app.inject({
    method: "GET",
    url: `/api/sessions/${session.id}/tree`,
    headers: authHeaders("other-user-token")
  });
  assert.equal(treeResponse.statusCode, 404);
  assert.equal(treeResponse.json().error.code, "SESSION_NOT_FOUND");

  const voiceTurnResponse = await app.inject({
    method: "POST",
    url: `/api/sessions/${session.id}/voice-turns`,
    headers: authHeaders("other-user-token"),
    payload: {
      transcriptText: "围绕这个目标先发散三个方向",
      targetNodeId: null
    }
  });
  assert.equal(voiceTurnResponse.statusCode, 404);
  assert.equal(voiceTurnResponse.json().error.code, "SESSION_NOT_FOUND");

  await app.close();
});

test("server allows the web dev origin to call api routes directly", async () => {
  const app = await createTestApp();

  const response = await app.inject({
    method: "OPTIONS",
    url: "/api/sessions",
    headers: {
      origin: "http://localhost:3000",
      "access-control-request-method": "POST"
    }
  });

  assert.equal(response.statusCode, 204);
  assert.equal(
    response.headers["access-control-allow-origin"],
    "http://localhost:3000"
  );
  assert.match(
    String(response.headers["access-control-allow-methods"]),
    /POST/
  );

  await app.close();
});

test("session APIs create a session and return empty tree/messages", async () => {
  const app = await createTestApp();

  const createResponse = await app.inject({
    method: "POST",
    url: "/api/sessions",
    payload: {
      title: "桌面风扇脑暴",
      goal: "探索更轻薄的桌面风扇方向"
    }
  });

  assert.equal(createResponse.statusCode, 201);
  const created = createResponse.json();
  assert.ok(created.session.id);
  assert.equal(created.session.title, "桌面风扇脑暴");
  assert.equal(created.session.goal, "探索更轻薄的桌面风扇方向");
  assert.equal(created.session.productDomain, "industrial_design");

  const treeResponse = await app.inject({
    method: "GET",
    url: `/api/sessions/${created.session.id}/tree`
  });

  assert.equal(treeResponse.statusCode, 200);
  assert.deepEqual(treeResponse.json(), {
    session: created.session,
    nodes: []
  });

  const messagesResponse = await app.inject({
    method: "GET",
    url: `/api/sessions/${created.session.id}/messages`
  });

  assert.equal(messagesResponse.statusCode, 200);
  assert.deepEqual(messagesResponse.json(), {
    messages: []
  });

  await app.close();
});

test("chat turns call Chat Assistant and do not mutate the tree", async () => {
  const calls = {
    chat: 0,
    brainstorm: 0,
    sketch: 0
  };
  const app = await createTestAppWithGateway({
    async transcribeAudio(input) {
      return {
        transcriptText: input.transcriptText ?? "解释一下当前节点，不要生成"
      };
    },
    async runBrainstormAssistant() {
      calls.brainstorm += 1;
      throw new Error("brainstorm should not be called for chat");
    },
    async generateSketch() {
      calls.sketch += 1;
      throw new Error("sketch should not be called for chat");
    },
    async runChatAssistant() {
      calls.chat += 1;
      return {
        assistantReply: "这是只读解释，不会改变画布。"
      };
    },
    async runMemorySummarizer() {
      return {
        stablePreferences: [],
        activeConstraints: [],
        rejectedDirections: [],
        openQuestions: [],
        shortSummary: "无新增记忆。"
      };
    }
  });

  const createSessionResponse = await app.inject({
    method: "POST",
    url: "/api/sessions",
    payload: {
      title: "桌面补光设备",
      goal: "探索桌面补光设备"
    }
  });
  const { session } = createSessionResponse.json();

  const response = await app.inject({
    method: "POST",
    url: `/api/sessions/${session.id}/voice-turns`,
    payload: {
      transcriptText: "解释一下当前节点，不要生成",
      targetNodeId: null
    }
  });

  assert.equal(response.statusCode, 202);
  assert.equal(response.json().task, null);
  assert.equal(response.json().operation, null);
  assert.equal(calls.chat, 1);
  assert.equal(calls.brainstorm, 0);
  assert.equal(calls.sketch, 0);

  const treeResponse = await app.inject({
    method: "GET",
    url: `/api/sessions/${session.id}/tree`
  });
  assert.equal(treeResponse.json().nodes.length, 0);

  const messagesResponse = await app.inject({
    method: "GET",
    url: `/api/sessions/${session.id}/messages`
  });
  const messages = messagesResponse.json().messages;
  assert.equal(
    messages.some((message) => message.kind === "chat" || message.kind === "node_explanation"),
    true
  );

  await app.close();
});

test("memory summarizer runs only after more than six dialogue turns", async () => {
  let memoryCalls = 0;
  const app = await createTestAppWithGateway({
    async transcribeAudio(input) {
      return {
        transcriptText: input.transcriptText ?? "解释当前状态，不要生成"
      };
    },
    async runBrainstormAssistant() {
      throw new Error("brainstorm should not run for chat turns");
    },
    async generateSketch() {
      throw new Error("sketch should not run for chat turns");
    },
    async runChatAssistant() {
      return {
        assistantReply: "只读回复。"
      };
    },
    async runMemorySummarizer() {
      memoryCalls += 1;
      return {
        stablePreferences: ["轻薄"],
        activeConstraints: [],
        rejectedDirections: [],
        openQuestions: [],
        shortSummary: "用户偏好轻薄。"
      };
    }
  });

  const createSessionResponse = await app.inject({
    method: "POST",
    url: "/api/sessions",
    payload: {
      title: "桌面设备方向",
      goal: "探索桌面智能设备"
    }
  });
  const { session } = createSessionResponse.json();

  for (let index = 0; index < 6; index += 1) {
    const response = await app.inject({
      method: "POST",
      url: `/api/sessions/${session.id}/voice-turns`,
      payload: {
        transcriptText: `第 ${index + 1} 轮，只聊一下不要生成`,
        targetNodeId: null
      }
    });
    assert.equal(response.statusCode, 202);
  }

  assert.equal(memoryCalls, 0);

  const seventhResponse = await app.inject({
    method: "POST",
    url: `/api/sessions/${session.id}/voice-turns`,
    payload: {
      transcriptText: "第 7 轮，只聊一下不要生成",
      targetNodeId: null
    }
  });

  assert.equal(seventhResponse.statusCode, 202);
  assert.equal(memoryCalls, 1);

  const messagesResponse = await app.inject({
    method: "GET",
    url: `/api/sessions/${session.id}/messages`
  });

  assert.equal(
    messagesResponse.json().messages.some((message) => message.kind === "memory_summary"),
    true
  );

  await app.close();
});

test("v1 acceptance: brainstorm receives memory after summarization", async () => {
  const brainstormInputs = [];
  const app = await createTestAppWithGateway({
    async transcribeAudio(input) {
      return {
        transcriptText: input.transcriptText ?? "只聊一下不要生成"
      };
    },
    async runChatAssistant() {
      return {
        assistantReply: "只读回复。"
      };
    },
    async runMemorySummarizer() {
      return {
        stablePreferences: ["轻薄"],
        activeConstraints: ["办公桌面"],
        rejectedDirections: [],
        openQuestions: [],
        shortSummary: "用户偏好轻薄，并希望适合办公桌面。"
      };
    },
    async runBrainstormAssistant(input) {
      brainstormInputs.push(input);
      return {
        actionType: "diverge",
        targetNodeId: input.selectedNodeId,
        branchCount: 3,
        designIntentSummary: "围绕记忆偏好生成方向。",
        assistantReply: "现在围绕轻薄办公桌面偏好生成三个方向。",
        promptHints: ["白底线稿"],
        directionBriefs: Array.from({ length: 3 }, (_, index) => ({
          briefId: `brief-${index + 1}`,
          targetParentNodeId: input.selectedNodeId,
          label: `方向 ${index + 1}`,
          displayName: `方向 ${index + 1}`,
          intentSummary: `探索轻薄办公方向 ${index + 1}`,
          formLanguage: ["轻薄"],
          userNeedResponse: ["适合办公桌面"],
          inspirationHints: ["办公设备"],
          suggestedFollowups: ["继续细化比例", "强化材质方向", "探索交互细节"],
          variationAxis: `变化轴 ${index + 1}`,
          promptIntent: `生成方向 ${index + 1} 草图`
        }))
      };
    },
    async generateSketch(input) {
      return {
        imageId: `image-${input.brief.briefId}`,
        briefId: input.brief.briefId,
        imageUrl: `https://example.com/${input.brief.briefId}.png`,
        promptUsed: input.brief.promptIntent,
        negativePromptUsed: "photorealistic",
        visualSummary: `${input.brief.displayName} 草图`
      };
    }
  });

  const createSessionResponse = await app.inject({
    method: "POST",
    url: "/api/sessions",
    payload: {
      title: "桌面设备方向",
      goal: "探索桌面设备"
    }
  });
  const { session } = createSessionResponse.json();

  for (let index = 0; index < 7; index += 1) {
    const response = await app.inject({
      method: "POST",
      url: `/api/sessions/${session.id}/voice-turns`,
      payload: {
        transcriptText: `第 ${index + 1} 轮，只聊一下不要生成`,
        targetNodeId: null
      }
    });
    assert.equal(response.statusCode, 202);
  }

  const generationResponse = await app.inject({
    method: "POST",
    url: `/api/sessions/${session.id}/voice-turns`,
    payload: {
      transcriptText: "基于刚才偏好生成三个方向",
      targetNodeId: null
    }
  });
  assert.equal(generationResponse.statusCode, 202);

  assert.equal(
    brainstormInputs.at(-1).conversationMemory.shortSummary.includes("轻薄"),
    true
  );

  await app.close();
});

liveTest("voice turn APIs return quickly and tasks remain queryable while images finish in background", async () => {
  const app = await createTestApp();

  const createSessionResponse = await app.inject({
    method: "POST",
    url: "/api/sessions",
    payload: {
      title: "台灯方向探索",
      goal: "围绕更柔和的办公台灯做首轮发散"
    }
  });

  const {
    session
  } = createSessionResponse.json();

  const voiceTurnResponse = await submitVoiceTurnWithRetry(app, session.id, {
    transcriptText: "围绕这个目标先发散四个方向",
    targetNodeId: null,
    actionType: "expand_branches",
    branchCount: 4,
    designIntentSummary: "围绕会话目标生成首层方向",
    assistantReply: "我会先生成四个首层方向。"
  });

  assert.equal(voiceTurnResponse.statusCode, 202);
  const queuedTask = voiceTurnResponse.json().task;
  assert.match(queuedTask.status, /queued|generating|completed/);
  assert.equal(queuedTask.confirmationRequired, undefined);
  assert.equal(queuedTask.confirmationStatus, undefined);
  assert.equal(queuedTask.rewrittenIntentForConfirmation, undefined);

  const completedTask = await waitForTaskStatus(app, queuedTask.id);
  assert.equal(completedTask.id, queuedTask.id);
  assert.equal(completedTask.status, "completed");

  await app.close();
});

liveTest("voice turn is orchestrated by the backend from transcript only and mutates the tree after background generation completes", async () => {
  const app = await createTestApp();

  const createSessionResponse = await app.inject({
    method: "POST",
    url: "/api/sessions",
    payload: {
      title: "台灯方向探索",
      goal: "围绕更柔和的办公台灯做首轮发散"
    }
  });

  const { session } = createSessionResponse.json();

  const response = await submitVoiceTurnWithRetry(app, session.id, {
    transcriptText: "围绕这个目标先发散四个方向",
    targetNodeId: null
  });

  assert.equal(response.statusCode, 202);
  const initialTask = response.json().task;
  const task = await waitForTaskStatus(app, initialTask.id);
  assert.equal(task.actionType, "diverge");
  assert.equal(task.status, "completed");
  assert.equal(task.confirmationStatus, undefined);
  assert.equal(task.branchCount, 4);

  const messagesResponse = await app.inject({
    method: "GET",
    url: `/api/sessions/${session.id}/messages`
  });
  const messages = messagesResponse.json().messages;
  assert.equal(messages.some((message) => message.kind === "transcript"), true);
  assert.equal(messages.some((message) => message.kind === "summary"), true);

  const treeResponse = await app.inject({
    method: "GET",
    url: `/api/sessions/${session.id}/tree`
  });
  const nodes = treeResponse.json().nodes;
  assert.equal(nodes.length, 4);
  assert.equal(nodes[0].status, "ready");
  assert.equal(nodes[0].publicNodeNumber, 1);

  await app.close();
});

test("undo endpoint fails cleanly when no confirmed tree operation exists", async () => {
  const app = await createTestApp();

  const createSessionResponse = await app.inject({
    method: "POST",
    url: "/api/sessions",
    payload: {
      title: "便携音箱",
      goal: "探索便携音箱的首轮概念方向"
    }
  });

  const {
    session
  } = createSessionResponse.json();

  const undoResponse = await app.inject({
    method: "POST",
    url: `/api/sessions/${session.id}/undo`
  });

  assert.equal(undoResponse.statusCode, 409);
  assert.equal(undoResponse.json().error.code, "UNDO_NOT_AVAILABLE");

  await app.close();
});

liveTest("branch_deeper persists child nodes after asynchronous branch generation", async () => {
  const app = await createTestApp();

  const createSessionResponse = await app.inject({
    method: "POST",
    url: "/api/sessions",
    payload: {
      title: "桌面设备方向",
      goal: "探索桌面智能设备的首层方向"
    }
  });
  const { session } = createSessionResponse.json();

  const initialTask = (
    await submitVoiceTurnWithRetry(app, session.id, {
      transcriptText: "围绕这个目标先发散四个方向",
      targetNodeId: null
    })
  ).json().task;
  assert.equal((await waitForTaskStatus(app, initialTask.id)).status, "completed");
  const initialTree = await app.inject({
    method: "GET",
    url: `/api/sessions/${session.id}/tree`
  });
  const targetNode = initialTree.json().nodes[0];

  const riskyTurn = await submitVoiceTurnWithRetry(app, session.id, {
    transcriptText: "沿着这个方向继续下钻三个子方向",
    targetNodeId: targetNode.id
  });
  const completedTask = await waitForTaskStatus(app, riskyTurn.json().task.id);
  assert.equal(completedTask.status, "completed");

  const treeResponse = await app.inject({
    method: "GET",
    url: `/api/sessions/${session.id}/tree`
  });
  const childNodes = treeResponse
    .json()
    .nodes.filter((node) => node.parentNodeId === targetNode.id);
  assert.equal(childNodes.length, 3);
  assert.equal(childNodes.every((node) => node.depth === targetNode.depth + 1), true);

  await app.close();
});

liveTest("refresh replaces the latest generated child group under the current node", async () => {
  const app = await createTestApp();

  const createSessionResponse = await app.inject({
    method: "POST",
    url: "/api/sessions",
    payload: {
      title: "桌面设备方向",
      goal: "探索桌面智能设备的首层方向"
    }
  });
  const { session } = createSessionResponse.json();

  const initialTask = (
    await submitVoiceTurnWithRetry(app, session.id, {
      transcriptText: "围绕这个目标先发散四个方向",
      targetNodeId: null
    })
  ).json().task;
  assert.equal((await waitForTaskStatus(app, initialTask.id)).status, "completed");
  const initialTree = await app.inject({
    method: "GET",
    url: `/api/sessions/${session.id}/tree`
  });
  const initialNodes = initialTree.json().nodes;

  const riskyTurn = await submitVoiceTurnWithRetry(app, session.id, {
    transcriptText: "刷新当前层，换三个方向",
    targetNodeId: null
  });
  const completedTask = await waitForTaskStatus(app, riskyTurn.json().task.id);
  assert.equal(completedTask.status, "completed");
  assert.equal(completedTask.actionType, "refresh");

  const refreshedTree = await app.inject({
    method: "GET",
    url: `/api/sessions/${session.id}/tree`
  });
  const refreshedNodes = refreshedTree.json().nodes;
  assert.equal(refreshedNodes.length, 3);
  assert.equal(refreshedNodes.some((node) => node.id === initialNodes[0].id), false);
  assert.equal(refreshedNodes.every((node) => node.layerVersion === 2), true);

  await app.close();
});

liveTest("refresh without explicit count reuses the refreshed group size", async () => {
  const brainstormInputs = [];
  const app = await createTestAppWithGateway({
    async transcribeAudio(input) {
      return {
        transcriptText: input.transcriptText ?? "刷新这一组"
      };
    },
    async runBrainstormAssistant(input) {
      brainstormInputs.push(input);
      const count = input.transcriptText.includes("四个")
        ? 4
        : input.constraints.defaultBranchCount;
      return {
        actionType: input.transcriptText.includes("刷新") ? "refresh" : "diverge",
        targetNodeId: input.selectedNodeId,
        branchCount: count,
        designIntentSummary: "生成方向",
        assistantReply: `生成 ${count} 个方向。`,
        promptHints: [],
        directionBriefs: Array.from({ length: count }, (_, index) => ({
          briefId: `brief-${index + 1}`,
          targetParentNodeId: input.selectedNodeId,
          label: `方向 ${index + 1}`,
          displayName: `方向 ${index + 1}`,
          intentSummary: `方向 ${index + 1}`,
          formLanguage: ["轻薄"],
          userNeedResponse: ["办公"],
          inspirationHints: ["设备"],
          suggestedFollowups: ["继续细化比例", "强化材质方向", "探索交互细节"],
          variationAxis: `轴 ${index + 1}`,
          promptIntent: "白底工业设计草图"
        }))
      };
    },
    async generateSketch(input) {
      return {
        imageId: `image-${input.brief.briefId}`,
        briefId: input.brief.briefId,
        imageUrl: `https://example.com/${input.brief.briefId}.png`,
        promptUsed: input.brief.promptIntent,
        negativePromptUsed: "photorealistic",
        visualSummary: "草图"
      };
    },
    async runChatAssistant() {
      return { assistantReply: "chat" };
    },
    async runMemorySummarizer() {
      return {
        stablePreferences: [],
        activeConstraints: [],
        rejectedDirections: [],
        openQuestions: [],
        shortSummary: "无新增记忆。"
      };
    }
  });

  const createSessionResponse = await app.inject({
    method: "POST",
    url: "/api/sessions",
    payload: {
      title: "桌面设备方向",
      goal: "探索桌面设备"
    }
  });
  const { session } = createSessionResponse.json();

  const firstTask = (
    await app.inject({
      method: "POST",
      url: `/api/sessions/${session.id}/voice-turns`,
      payload: {
        transcriptText: "先生成四个方向",
        targetNodeId: null
      }
    })
  ).json().task;
  await waitForTaskStatus(app, firstTask.id);

  const refreshTask = (
    await app.inject({
      method: "POST",
      url: `/api/sessions/${session.id}/voice-turns`,
      payload: {
        transcriptText: "刷新这一组",
        targetNodeId: null
      }
    })
  ).json().task;
  await waitForTaskStatus(app, refreshTask.id);

  assert.equal(brainstormInputs.at(-1).constraints.defaultBranchCount, 4);

  await app.close();
});

liveTest("undo restores the layer superseded by refresh_layer", async () => {
  const app = await createTestApp();

  const createSessionResponse = await app.inject({
    method: "POST",
    url: "/api/sessions",
    payload: {
      title: "桌面设备方向",
      goal: "探索桌面智能设备的首层方向"
    }
  });
  const { session } = createSessionResponse.json();

  const initialTask = (
    await submitVoiceTurnWithRetry(app, session.id, {
      transcriptText: "围绕这个目标先发散四个方向",
      targetNodeId: null
    })
  ).json().task;
  assert.equal((await waitForTaskStatus(app, initialTask.id)).status, "completed");
  const initialTree = await app.inject({
    method: "GET",
    url: `/api/sessions/${session.id}/tree`
  });
  const initialNodeIds = initialTree.json().nodes.map((node) => node.id);

  const riskyTurn = await submitVoiceTurnWithRetry(app, session.id, {
    transcriptText: "刷新当前层，换三个方向",
    targetNodeId: initialNodeIds[0]
  });
  assert.equal(
    (await waitForTaskStatus(app, riskyTurn.json().task.id)).status,
    "completed"
  );

  const undoResponse = await app.inject({
    method: "POST",
    url: `/api/sessions/${session.id}/undo`
  });
  assert.equal(undoResponse.statusCode, 200);

  const restoredTree = await app.inject({
    method: "GET",
    url: `/api/sessions/${session.id}/tree`
  });
  const restoredNodeIds = restoredTree.json().nodes.map((node) => node.id);
  assert.deepEqual(restoredNodeIds.sort(), initialNodeIds.sort());

  await app.close();
});

liveTest("voice turn routes delete to tree command execution instead of generation", async () => {
  const app = await createTestApp();

  const createSessionResponse = await app.inject({
    method: "POST",
    url: "/api/sessions",
    payload: {
      title: "删除节点测试",
      goal: "先生成再删除一个方向"
    }
  });
  const { session } = createSessionResponse.json();

  const initialTask = (
    await submitVoiceTurnWithRetry(app, session.id, {
      transcriptText: "围绕这个目标先发散四个方向",
      targetNodeId: null
    })
  ).json().task;
  assert.equal((await waitForTaskStatus(app, initialTask.id)).status, "completed");

  const initialTree = await app.inject({
    method: "GET",
    url: `/api/sessions/${session.id}/tree`
  });
  const initialNodes = initialTree.json().nodes;

  const deleteResponse = await app.inject({
    method: "POST",
    url: `/api/sessions/${session.id}/voice-turns`,
    payload: {
      transcriptText: `删除节点 ${initialNodes[0].publicNodeNumber}`,
      targetNodeId: null
    }
  });

  assert.equal(deleteResponse.statusCode, 202);
  assert.equal(deleteResponse.json().task, null);
  assert.equal(deleteResponse.json().operation.type, "delete");

  const treeAfterDelete = await app.inject({
    method: "GET",
    url: `/api/sessions/${session.id}/tree`
  });

  assert.equal(treeAfterDelete.json().nodes.length, initialNodes.length - 1);

  const messagesAfterDelete = await app.inject({
    method: "GET",
    url: `/api/sessions/${session.id}/messages`
  });
  const deleteMessages = messagesAfterDelete.json().messages;
  assert.equal(
    deleteMessages.some(
      (message) =>
        message.role === "user" &&
        message.kind === "transcript" &&
        message.content.includes("删除节点")
    ),
    true
  );
  assert.equal(
    deleteMessages.some(
      (message) =>
        message.role === "assistant" &&
        message.kind === "summary" &&
        message.content.includes("删除")
    ),
    true
  );

  await app.close();
});

liveTest("v1 acceptance: delete undo redo never call brainstorm or sketch", async () => {
  const calls = {
    brainstorm: 0,
    sketch: 0
  };
  const app = await createTestAppWithGateway({
    async transcribeAudio(input) {
      return {
        transcriptText: input.transcriptText ?? "围绕这个目标先发散三个方向"
      };
    },
    async runBrainstormAssistant(input) {
      calls.brainstorm += 1;
      return {
        actionType: input.transcriptText.includes("刷新") ? "refresh" : "diverge",
        targetNodeId: input.selectedNodeId,
        branchCount: 3,
        designIntentSummary: "生成三个方向。",
        assistantReply: "现在生成三个方向。",
        promptHints: ["白底线稿"],
        directionBriefs: Array.from({ length: 3 }, (_, index) => ({
          briefId: `brief-${index + 1}`,
          targetParentNodeId: input.selectedNodeId,
          label: `方向 ${index + 1}`,
          displayName: `方向 ${index + 1}`,
          intentSummary: `探索方向 ${index + 1}`,
          formLanguage: ["轻薄"],
          userNeedResponse: ["办公"],
          inspirationHints: ["设备"],
          suggestedFollowups: ["继续细化比例", "强化材质方向", "探索交互细节"],
          variationAxis: `轴 ${index + 1}`,
          promptIntent: "白底工业设计草图"
        }))
      };
    },
    async generateSketch(input) {
      calls.sketch += 1;
      return {
        imageId: `image-${input.brief.briefId}`,
        briefId: input.brief.briefId,
        imageUrl: `https://example.com/${input.brief.briefId}.png`,
        promptUsed: input.brief.promptIntent,
        negativePromptUsed: "photorealistic",
        visualSummary: "草图"
      };
    },
    async runChatAssistant() {
      return { assistantReply: "chat" };
    },
    async runMemorySummarizer() {
      return {
        stablePreferences: [],
        activeConstraints: [],
        rejectedDirections: [],
        openQuestions: [],
        shortSummary: "无新增记忆。"
      };
    }
  });

  const createSessionResponse = await app.inject({
    method: "POST",
    url: "/api/sessions",
    payload: {
      title: "本地操作测试",
      goal: "先生成再验证本地操作"
    }
  });
  const { session } = createSessionResponse.json();

  const initialTask = (
    await submitVoiceTurnWithRetry(app, session.id, {
      transcriptText: "先生成三个方向",
      targetNodeId: null
    })
  ).json().task;
  await waitForTaskStatus(app, initialTask.id);

  const treeResponse = await app.inject({
    method: "GET",
    url: `/api/sessions/${session.id}/tree`
  });
  const targetNode = treeResponse.json().nodes[0];

  calls.brainstorm = 0;
  calls.sketch = 0;

  const deleteResponse = await app.inject({
    method: "POST",
    url: `/api/sessions/${session.id}/voice-turns`,
    payload: {
      transcriptText: `删除节点 ${targetNode.publicNodeNumber}`,
      targetNodeId: null
    }
  });
  assert.equal(deleteResponse.statusCode, 202);

  const undoResponse = await app.inject({
    method: "POST",
    url: `/api/sessions/${session.id}/undo`
  });
  assert.equal(undoResponse.statusCode, 200);

  const redoResponse = await app.inject({
    method: "POST",
    url: `/api/sessions/${session.id}/redo`
  });
  assert.equal(redoResponse.statusCode, 200);

  assert.equal(calls.brainstorm, 0);
  assert.equal(calls.sketch, 0);

  await app.close();
});

liveTest("server rejects new commands while generation is in flight", async () => {
  const slowGateway = {
    ...createDeterministicGateway(),
    async generateSketch(input) {
      await new Promise((resolve) => setTimeout(resolve, 60));
      return createDeterministicGateway().generateSketch(input);
    }
  };
  const app = await createTestAppWithGateway(slowGateway);

  const createSessionResponse = await app.inject({
    method: "POST",
    url: "/api/sessions",
    payload: {
      title: "并发保护测试",
      goal: "验证生成中禁发新命令"
    }
  });
  const { session } = createSessionResponse.json();

  const firstTurn = await app.inject({
    method: "POST",
    url: `/api/sessions/${session.id}/voice-turns`,
    payload: {
      transcriptText: "围绕这个目标先发散三个方向",
      targetNodeId: null
    }
  });

  assert.equal(firstTurn.statusCode, 202);

  const secondTurn = await app.inject({
    method: "POST",
    url: `/api/sessions/${session.id}/voice-turns`,
    payload: {
      transcriptText: "继续发散",
      targetNodeId: null
    }
  });

  assert.equal(secondTurn.statusCode, 409);
  assert.equal(secondTurn.json().error.code, "SESSION_BUSY");

  await app.close();
});

liveTest("undo is single-step and cannot undo the same completed operation twice", async () => {
  const app = await createTestApp();

  const createSessionResponse = await app.inject({
    method: "POST",
    url: "/api/sessions",
    payload: {
      title: "桌面设备方向",
      goal: "探索桌面智能设备的首层方向"
    }
  });
  const { session } = createSessionResponse.json();

  const initialTask = (
    await submitVoiceTurnWithRetry(app, session.id, {
      transcriptText: "围绕这个目标先发散四个方向",
      targetNodeId: null
    })
  ).json().task;
  assert.equal((await waitForTaskStatus(app, initialTask.id)).status, "completed");

  const refreshTask = (
    await submitVoiceTurnWithRetry(app, session.id, {
      transcriptText: "刷新当前层，换三个方向",
      targetNodeId: null
    })
  ).json().task;
  assert.equal((await waitForTaskStatus(app, refreshTask.id)).status, "completed");

  const firstUndoResponse = await app.inject({
    method: "POST",
    url: `/api/sessions/${session.id}/undo`
  });
  assert.equal(firstUndoResponse.statusCode, 200);

  const secondUndoResponse = await app.inject({
    method: "POST",
    url: `/api/sessions/${session.id}/undo`
  });
  assert.equal(secondUndoResponse.statusCode, 409);
  assert.equal(secondUndoResponse.json().error.code, "UNDO_NOT_AVAILABLE");

  await app.close();
});

liveTest("redo reapplies the last undone refresh operation", async () => {
  const app = await createTestApp();

  const createSessionResponse = await app.inject({
    method: "POST",
    url: "/api/sessions",
    payload: {
      title: "桌面设备方向",
      goal: "探索桌面智能设备的首层方向"
    }
  });
  const { session } = createSessionResponse.json();

  const initialTask = (
    await submitVoiceTurnWithRetry(app, session.id, {
      transcriptText: "围绕这个目标先发散四个方向",
      targetNodeId: null
    })
  ).json().task;
  assert.equal((await waitForTaskStatus(app, initialTask.id)).status, "completed");

  const refreshTask = (
    await submitVoiceTurnWithRetry(app, session.id, {
      transcriptText: "刷新当前层，换三个方向",
      targetNodeId: null
    })
  ).json().task;
  assert.equal((await waitForTaskStatus(app, refreshTask.id)).status, "completed");

  const refreshedTree = await app.inject({
    method: "GET",
    url: `/api/sessions/${session.id}/tree`
  });
  const refreshedNodeIds = refreshedTree.json().nodes.map((node) => node.id).sort();

  const undoResponse = await app.inject({
    method: "POST",
    url: `/api/sessions/${session.id}/undo`
  });
  assert.equal(undoResponse.statusCode, 200);

  const redoResponse = await app.inject({
    method: "POST",
    url: `/api/sessions/${session.id}/redo`
  });
  assert.equal(redoResponse.statusCode, 200);
  assert.equal(redoResponse.json().operation.type, "redo");

  const redoneTree = await app.inject({
    method: "GET",
    url: `/api/sessions/${session.id}/tree`
  });
  const redoneNodeIds = redoneTree.json().nodes.map((node) => node.id).sort();
  assert.deepEqual(redoneNodeIds, refreshedNodeIds);

  const messagesResponse = await app.inject({
    method: "GET",
    url: `/api/sessions/${session.id}/messages`
  });
  const messages = messagesResponse.json().messages;
  assert.equal(
    messages.some(
      (message) =>
        message.role === "assistant" &&
        message.kind === "summary" &&
        message.content.includes("撤回")
    ),
    true
  );
  assert.equal(
    messages.some(
      (message) =>
        message.role === "assistant" &&
        message.kind === "summary" &&
        message.content.includes("重做")
    ),
    true
  );

  await app.close();
});

test("undo route can target a specific client-selected tree operation", () => {
  assert.match(sessionRoutesSource, /request\.body as \{ operationId\?: string \| null; taskId\?: string \| null \}/);
  assert.match(sessionRoutesSource, /operationId \?\? null/);
  assert.match(sessionRoutesSource, /taskId \?\? null/);
  assert.match(sessionRoutesSource, /getById\(/);
  assert.match(sessionRoutesSource, /getByTaskId\(/);
});

test("server supports multipart audio voice turns", () => {
  assert.match(appSource, /@fastify\/multipart/);
  assert.match(appSource, /app.register\(multipart/);
  assert.match(sessionRoutesSource, /request\.parts\(\)/);
  assert.match(sessionRoutesSource, /part\.toBuffer\(\)/);
  assert.match(sessionRoutesSource, /mimeType/);
  assert.match(orchestratorSource, /audio: input\.audio/);
  assert.match(orchestratorSource, /mimeType: input\.mimeType/);
});

test("server exposes transcription before full brainstorm generation", () => {
  assert.match(sessionRoutesSource, /app\.post\("\/api\/transcriptions"/);
  assert.match(sessionRoutesSource, /transcriptText: transcript\.transcriptText/);
  assert.match(sessionRoutesSource, /VOICE_TURN_INPUT_REQUIRED/);
});

test("transcription endpoint surfaces upstream agent errors instead of generic internal errors", async () => {
  const { AgentGatewayError } = await import(
    `${pathToFileURL(path.join(process.cwd(), "apps", "server", "dist", "agents", "types.js")).href}?t=${Date.now()}${Math.random()}`
  );
  const app = await createTestAppWithGateway({
    async transcribeAudio() {
      throw new AgentGatewayError(
        "SiliconFlow request failed with HTTP 500.",
        "SILICONFLOW_REQUEST_FAILED"
      );
    },
    async runBrainstormAssistant() {
      throw new Error("not used");
    },
    async generateSketch() {
      throw new Error("not used");
    }
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/transcriptions",
    payload: (() => {
      const formData = new FormData();
      formData.append(
        "audio",
        new File([Buffer.from("fake-audio")], "recording.webm", {
          type: "audio/webm"
        })
      );
      return formData;
    })()
  });

  assert.equal(response.statusCode, 502);
  assert.deepEqual(response.json(), {
    error: {
      code: "SILICONFLOW_REQUEST_FAILED",
      message: "SiliconFlow request failed with HTTP 500."
    }
  });

  await app.close();
});

test("text voice-turns bypass the transcription gateway entirely", async () => {
  let transcribeCalls = 0;
  const app = await createTestAppWithGateway({
    async transcribeAudio() {
      transcribeCalls += 1;
      throw new Error("text input should not call transcribeAudio");
    },
    async runBrainstormAssistant(input) {
      return {
        actionType: "expand_branches",
        targetNodeId: input.selectedNodeId,
        branchCount: 3,
        designIntentSummary: `围绕“${input.transcriptText}”生成首轮方向。`,
        assistantReply: `现在围绕“${input.transcriptText}”生成三个方向。`,
        promptHints: ["白底线稿"],
        directionBriefs: Array.from({ length: 3 }, (_, index) => ({
          briefId: `brief-${index + 1}`,
          targetParentNodeId: input.selectedNodeId,
          label: `方向 ${index + 1}`,
          displayName: `方向 ${index + 1}`,
          intentSummary: `探索方向 ${index + 1}`,
          formLanguage: ["轻薄"],
          userNeedResponse: ["降低桌面压迫感"],
          inspirationHints: ["办公设备"],
          suggestedFollowups: ["继续细化比例", "强化材质方向", "探索交互细节"],
          variationAxis: `变化轴 ${index + 1}`,
          promptIntent: `生成方向 ${index + 1} 草图`
        }))
      };
    },
    async generateSketch() {
      throw new Error("not used");
    }
  });

  const createSessionResponse = await app.inject({
    method: "POST",
    url: "/api/sessions",
    payload: {
      title: "桌面设备方向",
      goal: "探索桌面智能设备的首层方向"
    }
  });
  const { session } = createSessionResponse.json();

  const response = await submitVoiceTurnWithRetry(app, session.id, {
    transcriptText: "围绕这个目标先发散四个方向",
    targetNodeId: null
  });

  assert.equal(response.statusCode, 202);
  assert.equal(transcribeCalls, 0);
  assert.equal(
    response.json().task.transcriptText,
    "围绕这个目标先发散四个方向"
  );

  await app.close();
});

liveTest("voice turn without explicit target keeps using the previous executed target node", async () => {
  const app = await createTestApp();

  const createSessionResponse = await app.inject({
    method: "POST",
    url: "/api/sessions",
    payload: {
      title: "台灯方向探索",
      goal: "围绕更柔和的办公台灯做首轮发散"
    }
  });

  const { session } = createSessionResponse.json();

  const initialResponse = await submitVoiceTurnWithRetry(app, session.id, {
    transcriptText: "围绕这个目标先发散四个方向",
    targetNodeId: null
  });
  assert.equal(initialResponse.statusCode, 202);
  await waitForTaskStatus(app, initialResponse.json().task.id);

  const initialTree = await app.inject({
    method: "GET",
    url: `/api/sessions/${session.id}/tree`
  });
  const targetNode = initialTree.json().nodes[0];

  const explicitTargetResponse = await submitVoiceTurnWithRetry(app, session.id, {
    transcriptText: "沿着这个方向继续下钻三个子方向",
    targetNodeId: targetNode.id
  });

  assert.equal(explicitTargetResponse.statusCode, 202);
  assert.equal(explicitTargetResponse.json().task.targetNodeId, targetNode.id);
  await waitForTaskStatus(app, explicitTargetResponse.json().task.id);

  const secondResponse = await submitVoiceTurnWithRetry(app, session.id, {
    transcriptText: "继续往下扩展",
    targetNodeId: null
  });

  assert.equal(secondResponse.statusCode, 202);
  assert.equal(secondResponse.json().task.targetNodeId, targetNode.id);

  await app.close();
});

liveTest("voice turn can resolve target nodes from transcript references", async () => {
  const app = await createTestApp();

  const createSessionResponse = await app.inject({
    method: "POST",
    url: "/api/sessions",
    payload: {
      title: "桌面设备方向",
      goal: "探索桌面智能设备的首层方向"
    }
  });
  const { session } = createSessionResponse.json();

  const initialTask = (
    await submitVoiceTurnWithRetry(app, session.id, {
      transcriptText: "围绕这个目标先发散四个方向",
      targetNodeId: null
    })
  ).json().task;
  assert.equal((await waitForTaskStatus(app, initialTask.id)).status, "completed");

  const treeResponse = await app.inject({
    method: "GET",
    url: `/api/sessions/${session.id}/tree`
  });
  const nodes = treeResponse.json().nodes;
  const referencedNode = nodes[0];

  const byNumberResponse = await submitVoiceTurnWithRetry(app, session.id, {
    transcriptText: `沿着节点 ${referencedNode.publicNodeNumber} 继续发散`,
    targetNodeId: null
  });

  assert.equal(byNumberResponse.statusCode, 202);
  assert.equal(byNumberResponse.json().task.targetNodeId, referencedNode.id);

  const byChineseNumberResponse = await submitVoiceTurnWithRetry(app, session.id, {
    transcriptText: `沿着节点二继续发散`,
    targetNodeId: null
  });

  assert.equal(byChineseNumberResponse.statusCode, 202);
  assert.equal(byChineseNumberResponse.json().task.targetNodeId, nodes[1].id);

  const byNameResponse = await submitVoiceTurnWithRetry(app, session.id, {
    transcriptText: `围绕${referencedNode.displayName}继续下钻`,
    targetNodeId: null
  });

  assert.equal(byNameResponse.statusCode, 202);
  assert.equal(byNameResponse.json().task.targetNodeId, referencedNode.id);

  await app.close();
});

liveTest("executing tasks keeps the original root goal unchanged after the first round", async () => {
  const app = await createTestApp();

  const createSessionResponse = await app.inject({
    method: "POST",
    url: "/api/sessions",
    payload: {
      title: "桌面设备方向",
      goal: "探索桌面智能设备的首层方向"
    }
  });
  const { session } = createSessionResponse.json();

  const voiceTurnResponse = await submitVoiceTurnWithRetry(app, session.id, {
    transcriptText: "围绕这个目标先发散四个方向",
    targetNodeId: null
  });

  const completedTask = await waitForTaskStatus(app, voiceTurnResponse.json().task.id);
  assert.equal(completedTask.status, "completed");

  const treeResponse = await app.inject({
    method: "GET",
    url: `/api/sessions/${session.id}/tree`
  });

  assert.equal(
    treeResponse.json().session.goal,
    "探索桌面智能设备的首层方向"
  );

  await app.close();
});

liveTest("brainstorm assistant receives prior conversation history on later turns", async () => {
  const brainstormInputs = [];
  const app = await createTestAppWithGateway({
    async transcribeAudio(input) {
      return {
        transcriptText: input.transcriptText ?? "围绕这个目标先发散三个方向"
      };
    },
    async runBrainstormAssistant(input) {
      brainstormInputs.push(input);
      return {
        actionType: input.selectedNodeSummary.formLanguage.length > 0 ? "branch_deeper" : "expand_branches",
        targetNodeId: input.selectedNodeId,
        branchCount: 3,
        designIntentSummary: `围绕“${input.sessionGoal}”继续展开。`,
        assistantReply: `现在基于当前节点生成三个方向。`,
        promptHints: ["白底线稿"],
        directionBriefs: Array.from({ length: 3 }, (_, index) => ({
          briefId: `brief-${index + 1}`,
          targetParentNodeId: input.selectedNodeId,
          label: `方向 ${index + 1}`,
          displayName: `方向 ${index + 1}`,
          intentSummary: `探索方向 ${index + 1}`,
          formLanguage: ["轻薄"],
          userNeedResponse: ["降低桌面压迫感"],
          inspirationHints: ["办公设备"],
          suggestedFollowups: ["继续细化比例", "强化材质方向", "探索交互细节"],
          variationAxis: `变化轴 ${index + 1}`,
          promptIntent: `生成方向 ${index + 1} 草图`
        }))
      };
    },
    async generateSketch(input) {
      return createDeterministicGateway().generateSketch(input);
    }
  });

  const createSessionResponse = await app.inject({
    method: "POST",
    url: "/api/sessions",
    payload: {
      title: "桌面补光方向",
      goal: "保持轻便、克制且有专业器材感"
    }
  });
  const { session } = createSessionResponse.json();

  const firstTask = (
    await submitVoiceTurnWithRetry(app, session.id, {
      transcriptText: "围绕这个目标先发散三个方向",
      targetNodeId: null
    })
  ).json().task;
  await waitForTaskStatus(app, firstTask.id);

  const treeResponse = await app.inject({
    method: "GET",
    url: `/api/sessions/${session.id}/tree`
  });
  const targetNode = treeResponse.json().nodes[0];

  const secondTask = (
    await submitVoiceTurnWithRetry(app, session.id, {
      transcriptText: "保留专业器材感，再轻一点",
      targetNodeId: targetNode.id
    })
  ).json().task;
  await waitForTaskStatus(app, secondTask.id);

  const secondInput = brainstormInputs.at(-1);
  assert.equal(Array.isArray(secondInput.conversationHistory), true);
  assert.equal(secondInput.conversationHistory.length >= 2, true);
  assert.equal(
    secondInput.conversationHistory.some(
      (item) =>
        item.role === "user" &&
        item.kind === "transcript" &&
        item.content.includes("围绕这个目标先发散三个方向")
    ),
    true
  );
  assert.equal(
    secondInput.conversationHistory.some(
      (item) =>
        item.role === "assistant" &&
        item.kind === "summary" &&
        item.content.includes("现在基于当前节点生成三个方向")
    ),
    true
  );

  await app.close();
});

liveTest("sketch prompt preserves root goal parent context and recent conversation constraints", async () => {
  const sketchInputs = [];
  const app = await createTestAppWithGateway({
    async transcribeAudio(input) {
      return {
        transcriptText: input.transcriptText ?? "围绕这个目标先发散三个方向"
      };
    },
    async runBrainstormAssistant(input) {
      return {
        actionType: input.selectedNodeSummary.formLanguage.length > 0 ? "branch_deeper" : "expand_branches",
        targetNodeId: input.selectedNodeId,
        branchCount: 3,
        designIntentSummary: `围绕“${input.sessionGoal}”继续展开。`,
        assistantReply: `我会保留当前方向的核心气质继续细化。`,
        promptHints: ["白底线稿"],
        directionBriefs: Array.from({ length: 3 }, (_, index) => ({
          briefId: `brief-${index + 1}`,
          targetParentNodeId: input.selectedNodeId,
          label: `方向 ${index + 1}`,
          displayName: `方向 ${index + 1}`,
          intentSummary: `探索方向 ${index + 1}`,
          formLanguage: ["轻薄"],
          userNeedResponse: ["降低桌面压迫感"],
          inspirationHints: ["办公设备"],
          suggestedFollowups: ["继续细化比例", "强化材质方向", "探索交互细节"],
          variationAxis: `变化轴 ${index + 1}`,
          promptIntent: `生成方向 ${index + 1} 草图`
        }))
      };
    },
    async generateSketch(input) {
      sketchInputs.push(input);
      return createDeterministicGateway().generateSketch(input);
    }
  });

  const createSessionResponse = await app.inject({
    method: "POST",
    url: "/api/sessions",
    payload: {
      title: "桌面补光方向",
      goal: "保持轻便、克制且有专业器材感"
    }
  });
  const { session } = createSessionResponse.json();

  const firstTask = (
    await submitVoiceTurnWithRetry(app, session.id, {
      transcriptText: "围绕这个目标先发散三个方向",
      targetNodeId: null
    })
  ).json().task;
  await waitForTaskStatus(app, firstTask.id);

  const treeResponse = await app.inject({
    method: "GET",
    url: `/api/sessions/${session.id}/tree`
  });
  const targetNode = treeResponse.json().nodes[0];

  const secondTask = (
    await submitVoiceTurnWithRetry(app, session.id, {
      transcriptText: "保留专业器材感，再轻一点",
      targetNodeId: targetNode.id
    })
  ).json().task;
  await waitForTaskStatus(app, secondTask.id);

  const latestSketchPrompt = sketchInputs.at(-1).brief.promptIntent;
  assert.match(latestSketchPrompt, /主需求：保持轻便、克制且有专业器材感/);
  assert.match(latestSketchPrompt, /当前延展节点：/);
  assert.match(latestSketchPrompt, /最近对话历史：/);
  assert.match(latestSketchPrompt, /保留专业器材感，再轻一点/);

  await app.close();
});

test("voice turns return before all branch sketches finish while branch generation still runs concurrently", async () => {
  let currentInFlight = 0;
  let maxInFlight = 0;
  const app = await createTestAppWithGateway({
    async transcribeAudio(input) {
      return {
        transcriptText: input.transcriptText ?? "围绕这个目标先发散四个方向"
      };
    },
    async runBrainstormAssistant(input) {
      return {
        actionType: "expand_branches",
        targetNodeId: input.selectedNodeId,
        branchCount: 4,
        designIntentSummary: "围绕桌面智能设备生成首轮四个方向。",
        assistantReply: "现在围绕当前目标生成四个方向。",
        promptHints: ["白底线稿"],
        directionBriefs: Array.from({ length: 4 }, (_, index) => ({
          briefId: `brief-${index + 1}`,
          targetParentNodeId: input.selectedNodeId,
          label: `方向 ${index + 1}`,
          displayName: `方向 ${index + 1}`,
          intentSummary: `探索方向 ${index + 1}`,
          formLanguage: ["轻薄"],
          userNeedResponse: ["降低桌面压迫感"],
          inspirationHints: ["办公设备"],
          suggestedFollowups: ["继续细化比例", "强化材质方向", "探索交互细节"],
          variationAxis: `变化轴 ${index + 1}`,
          promptIntent: `生成方向 ${index + 1} 草图`
        }))
      };
    },
    async generateSketch(input) {
      currentInFlight += 1;
      maxInFlight = Math.max(maxInFlight, currentInFlight);
      await new Promise((resolve) => setTimeout(resolve, 30));
      currentInFlight -= 1;

      return {
        imageId: `image-${input.brief.briefId}`,
        briefId: input.brief.briefId,
        imageUrl: `https://example.com/${input.brief.briefId}.png`,
        promptUsed: input.brief.promptIntent,
        negativePromptUsed: "photorealistic",
        visualSummary: `${input.brief.displayName} 草图`
      };
    }
  });

  const createSessionResponse = await app.inject({
    method: "POST",
    url: "/api/sessions",
    payload: {
      title: "桌面设备方向",
      goal: "探索桌面智能设备的首层方向"
    }
  });
  const { session } = createSessionResponse.json();

  const task = (
    await app.inject({
      method: "POST",
      url: `/api/sessions/${session.id}/voice-turns`,
      payload: {
        transcriptText: "围绕这个目标先发散四个方向",
        targetNodeId: null
      }
    })
  ).json().task;

  assert.match(task.status, /queued|generating/);
  const completedTask = await waitForTaskStatus(app, task.id);
  assert.equal(completedTask.status, "completed");
  assert.ok(maxInFlight > 1);

  await app.close();
});

test("if one branch image generation fails the remaining successful branches still persist", async () => {
  let sketchCalls = 0;
  const app = await createTestAppWithGateway({
    async transcribeAudio(input) {
      return {
        transcriptText: input.transcriptText ?? "围绕这个目标先发散四个方向"
      };
    },
    async runBrainstormAssistant(input) {
      return {
        actionType: "expand_branches",
        targetNodeId: input.selectedNodeId,
        branchCount: 3,
        designIntentSummary: "围绕桌面智能设备生成三个方向。",
        assistantReply: "现在围绕当前目标生成三个方向。",
        promptHints: ["白底线稿"],
        directionBriefs: Array.from({ length: 3 }, (_, index) => ({
          briefId: `brief-${index + 1}`,
          targetParentNodeId: input.selectedNodeId,
          label: `方向 ${index + 1}`,
          displayName: `方向 ${index + 1}`,
          intentSummary: `探索方向 ${index + 1}`,
          formLanguage: ["轻薄"],
          userNeedResponse: ["降低桌面压迫感"],
          inspirationHints: ["办公设备"],
          suggestedFollowups: ["继续细化比例", "强化材质方向", "探索交互细节"],
          variationAxis: `变化轴 ${index + 1}`,
          promptIntent: `生成方向 ${index + 1} 草图`
        }))
      };
    },
    async generateSketch(input) {
      sketchCalls += 1;
      if (input.brief.briefId === "brief-2") {
        throw new Error("branch 2 failed");
      }

      return {
        imageId: `image-${input.brief.briefId}`,
        briefId: input.brief.briefId,
        imageUrl: `https://example.com/${input.brief.briefId}.png`,
        promptUsed: input.brief.promptIntent,
        negativePromptUsed: "photorealistic",
        visualSummary: `${input.brief.displayName} 草图`
      };
    }
  });

  const createSessionResponse = await app.inject({
    method: "POST",
    url: "/api/sessions",
    payload: {
      title: "桌面设备方向",
      goal: "探索桌面智能设备的首层方向"
    }
  });
  const { session } = createSessionResponse.json();

  const submittedTask = (
    await app.inject({
      method: "POST",
      url: `/api/sessions/${session.id}/voice-turns`,
      payload: {
        transcriptText: "围绕这个目标先发散三个方向",
        targetNodeId: null
      }
    })
  ).json().task;

  const completedTask = await waitForTaskStatus(app, submittedTask.id);
  assert.equal(completedTask.status, "completed");
  assert.equal(sketchCalls, 3);

  const treeResponse = await app.inject({
    method: "GET",
    url: `/api/sessions/${session.id}/tree`
  });
  assert.equal(treeResponse.json().nodes.length, 3);

  const taskResponse = await app.inject({
    method: "GET",
    url: `/api/tasks/${submittedTask.id}`
  });
  const branchStatuses = taskResponse.json().task.branchTasks.map((branchTask) => branchTask.status);
  assert.deepEqual(branchStatuses.sort(), ["completed", "completed", "failed"].sort());
  assert.equal(
    treeResponse.json().nodes.filter((node) => node.imageUrl === null).length,
    1
  );

  await app.close();
});

test("if all branch image generations fail the text branches still persist without images", async () => {
  const app = await createTestAppWithGateway({
    async transcribeAudio(input) {
      return {
        transcriptText: input.transcriptText ?? "围绕这个目标先发散三个方向"
      };
    },
    async runBrainstormAssistant(input) {
      return {
        actionType: "expand_branches",
        targetNodeId: input.selectedNodeId,
        branchCount: 3,
        designIntentSummary: "围绕桌面智能设备生成三个方向。",
        assistantReply: "现在围绕当前目标生成三个方向。",
        promptHints: ["白底线稿"],
        directionBriefs: Array.from({ length: 3 }, (_, index) => ({
          briefId: `brief-${index + 1}`,
          targetParentNodeId: input.selectedNodeId,
          label: `方向 ${index + 1}`,
          displayName: `方向 ${index + 1}`,
          intentSummary: `探索方向 ${index + 1}`,
          formLanguage: ["轻薄"],
          userNeedResponse: ["降低桌面压迫感"],
          inspirationHints: ["办公设备"],
          suggestedFollowups: ["继续细化比例", "强化材质方向", "探索交互细节"],
          variationAxis: `变化轴 ${index + 1}`,
          promptIntent: `生成方向 ${index + 1} 草图`
        }))
      };
    },
    async generateSketch() {
      throw new Error("all branches failed");
    }
  });

  const createSessionResponse = await app.inject({
    method: "POST",
    url: "/api/sessions",
    payload: {
      title: "桌面设备方向",
      goal: "探索桌面智能设备的首层方向"
    }
  });
  const { session } = createSessionResponse.json();

  const submittedTask = (
    await app.inject({
      method: "POST",
      url: `/api/sessions/${session.id}/voice-turns`,
      payload: {
        transcriptText: "围绕这个目标先发散三个方向",
        targetNodeId: null
      }
    })
  ).json().task;

  const completedTask = await waitForTaskStatus(app, submittedTask.id);
  assert.equal(completedTask.status, "completed");

  const treeResponse = await app.inject({
    method: "GET",
    url: `/api/sessions/${session.id}/tree`
  });
  assert.equal(treeResponse.json().nodes.length, 3);
  assert.equal(
    treeResponse.json().nodes.every((node) => node.imageUrl === null),
    true
  );

  const taskResponse = await app.inject({
    method: "GET",
    url: `/api/tasks/${submittedTask.id}`
  });
  const branchStatuses = taskResponse.json().task.branchTasks.map((branchTask) => branchTask.status);
  assert.deepEqual(branchStatuses, ["failed", "failed", "failed"]);

  await app.close();
});

test("voice turns skip image generation entirely when the image model is disabled", { concurrency: false }, async () => {
  const previousImageModel = process.env.SILICONFLOW_IMAGE_MODEL;
  process.env.SILICONFLOW_IMAGE_MODEL = "";

  let sketchCalls = 0;

  try {
    const app = await createTestAppWithGateway({
      async transcribeAudio(input) {
        return {
          transcriptText: input.transcriptText ?? "围绕这个目标先发散三个方向"
        };
      },
      async runBrainstormAssistant(input) {
        return {
          actionType: "expand_branches",
          targetNodeId: input.selectedNodeId,
          branchCount: 3,
          designIntentSummary: "围绕桌面智能设备生成三个方向。",
          assistantReply: "现在围绕当前目标生成三个方向。",
          promptHints: ["白底线稿"],
          directionBriefs: Array.from({ length: 3 }, (_, index) => ({
            briefId: `brief-${index + 1}`,
            targetParentNodeId: input.selectedNodeId,
            label: `方向 ${index + 1}`,
            displayName: `方向 ${index + 1}`,
            intentSummary: `探索方向 ${index + 1}`,
            formLanguage: ["轻薄"],
            userNeedResponse: ["降低桌面压迫感"],
            inspirationHints: ["办公设备"],
            suggestedFollowups: ["继续细化比例", "强化材质方向", "探索交互细节"],
            variationAxis: `变化轴 ${index + 1}`,
            promptIntent: `生成方向 ${index + 1} 草图`
          }))
        };
      },
      async generateSketch() {
        sketchCalls += 1;
        throw new Error("image generation should be skipped");
      }
    });

    const createSessionResponse = await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: {
        title: "桌面设备方向",
        goal: "探索桌面智能设备的首层方向"
      }
    });
    const { session } = createSessionResponse.json();

    const submittedTask = (
      await app.inject({
        method: "POST",
        url: `/api/sessions/${session.id}/voice-turns`,
        payload: {
          transcriptText: "围绕这个目标先发散三个方向",
          targetNodeId: null
        }
      })
    ).json().task;

    const completedTask = await waitForTaskStatus(app, submittedTask.id);
    assert.equal(completedTask.status, "completed");
    assert.equal(sketchCalls, 0);

    const treeResponse = await app.inject({
      method: "GET",
      url: `/api/sessions/${session.id}/tree`
    });
    assert.equal(treeResponse.json().nodes.length, 3);
    assert.equal(
      treeResponse.json().nodes.every((node) => node.imageUrl === null),
      true
    );

    const taskResponse = await app.inject({
      method: "GET",
      url: `/api/tasks/${submittedTask.id}`
    });
    const branchStatuses = taskResponse.json().task.branchTasks.map((branchTask) => branchTask.status);
    assert.deepEqual(branchStatuses, ["completed", "completed", "completed"]);

    await app.close();
  } finally {
    if (previousImageModel === undefined) {
      delete process.env.SILICONFLOW_IMAGE_MODEL;
    } else {
      process.env.SILICONFLOW_IMAGE_MODEL = previousImageModel;
    }
  }
});

test("SiliconFlow requests wait up to two minutes before timing out", () => {
  assert.match(siliconFlowSource, /REQUEST_TIMEOUT_MS = 120_000/);
});
