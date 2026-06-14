import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const appEntry = pathToFileURL(
  path.join(process.cwd(), "apps", "server", "dist", "app.js")
).href;
const appSource = readSource("apps/server/src/app.ts");
const sessionRoutesSource = readSource("apps/server/src/routes/sessions.ts");
const orchestratorSource = readSource("apps/server/src/orchestrator/service.ts");
const siliconFlowSource = readSource("apps/server/src/agents/siliconflow.ts");

function readSource(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

async function createTestApp() {
  const { buildApp } = await import(appEntry);
  return buildApp({
    persistenceMode: "memory",
    agentProvider: "mock"
  });
}

async function createTestAppWithGateway(agentGateway) {
  const { buildApp } = await import(appEntry);
  return buildApp({
    persistenceMode: "memory",
    agentProvider: "mock",
    agentGateway
  });
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

test("voice turn APIs create tasks and support confirm/cancel plus task lookup", async () => {
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

  const voiceTurnResponse = await app.inject({
    method: "POST",
    url: `/api/sessions/${session.id}/voice-turns`,
    payload: {
      transcriptText: "围绕这个目标先发散四个方向",
      targetNodeId: null,
      actionType: "expand_branches",
      branchCount: 4,
      designIntentSummary: "围绕会话目标生成首层方向",
      assistantReply: "我会先生成四个首层方向。",
      confirmationRequired: false
    }
  });

  assert.equal(voiceTurnResponse.statusCode, 202);
  const queuedTask = voiceTurnResponse.json().task;
  assert.equal(queuedTask.status, "awaiting_confirmation");
  assert.equal(queuedTask.confirmationStatus, "awaiting_confirmation");

  const taskResponse = await app.inject({
    method: "GET",
    url: `/api/tasks/${queuedTask.id}`
  });

  assert.equal(taskResponse.statusCode, 200);
  assert.equal(taskResponse.json().task.id, queuedTask.id);

  const firstConfirmResponse = await app.inject({
    method: "POST",
    url: `/api/tasks/${queuedTask.id}/confirm`
  });

  assert.equal(firstConfirmResponse.statusCode, 200);
  assert.equal(firstConfirmResponse.json().task.status, "completed");

  const riskyTurnResponse = await app.inject({
    method: "POST",
    url: `/api/sessions/${session.id}/voice-turns`,
    payload: {
      transcriptText: "沿当前方向继续下钻三个更柔和的子方向",
      targetNodeId: null,
      actionType: "branch_deeper",
      branchCount: 3,
      designIntentSummary: "沿当前方向继续下钻",
      assistantReply: "这一步会新增子层，我需要你确认后再执行。",
      confirmationRequired: true,
      rewrittenIntentForConfirmation:
        "我将沿当前方向继续生成 3 个更柔和的子方向。"
    }
  });

  assert.equal(riskyTurnResponse.statusCode, 202);
  const awaitingTask = riskyTurnResponse.json().task;
  assert.equal(awaitingTask.status, "awaiting_confirmation");
  assert.equal(awaitingTask.confirmationStatus, "awaiting_confirmation");

  const confirmResponse = await app.inject({
    method: "POST",
    url: `/api/tasks/${awaitingTask.id}/confirm`
  });

  assert.equal(confirmResponse.statusCode, 200);
  assert.equal(confirmResponse.json().task.confirmationStatus, "confirmed");
  assert.equal(confirmResponse.json().task.status, "completed");

  const cancelTurnResponse = await app.inject({
    method: "POST",
    url: `/api/sessions/${session.id}/voice-turns`,
    payload: {
      transcriptText: "刷新当前层",
      targetNodeId: null,
      actionType: "refresh_layer",
      branchCount: 3,
      designIntentSummary: "刷新当前层方向",
      assistantReply: "这一步会替换当前层，我需要你确认。",
      confirmationRequired: true,
      rewrittenIntentForConfirmation: "我将刷新当前层并生成新的 3 个方向。"
    }
  });

  const cancelTask = cancelTurnResponse.json().task;

  const cancelResponse = await app.inject({
    method: "POST",
    url: `/api/tasks/${cancelTask.id}/cancel`
  });

  assert.equal(cancelResponse.statusCode, 200);
  assert.equal(cancelResponse.json().task.confirmationStatus, "cancelled");
  assert.equal(cancelResponse.json().task.status, "cancelled");

  await app.close();
});

test("voice turn is orchestrated by the backend from transcript only and waits for confirmation before mutating the tree", async () => {
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

  const response = await app.inject({
    method: "POST",
    url: `/api/sessions/${session.id}/voice-turns`,
    payload: {
      transcriptText: "围绕这个目标先发散四个方向",
      targetNodeId: null
    }
  });

  assert.equal(response.statusCode, 202);
  const { task } = response.json();
  assert.equal(task.actionType, "expand_branches");
  assert.equal(task.status, "awaiting_confirmation");
  assert.equal(task.confirmationStatus, "awaiting_confirmation");
  assert.equal(task.branchCount, 4);

  const messagesResponse = await app.inject({
    method: "GET",
    url: `/api/sessions/${session.id}/messages`
  });
  const messages = messagesResponse.json().messages;
  assert.equal(messages.some((message) => message.kind === "transcript"), true);
  assert.equal(messages.some((message) => message.kind === "confirmation"), true);

  const treeResponse = await app.inject({
    method: "GET",
    url: `/api/sessions/${session.id}/tree`
  });
  let nodes = treeResponse.json().nodes;
  assert.equal(nodes.length, 0);

  const confirmResponse = await app.inject({
    method: "POST",
    url: `/api/tasks/${task.id}/confirm`
  });
  assert.equal(confirmResponse.statusCode, 200);
  assert.equal(confirmResponse.json().task.status, "completed");

  const confirmedTreeResponse = await app.inject({
    method: "GET",
    url: `/api/sessions/${session.id}/tree`
  });
  nodes = confirmedTreeResponse.json().nodes;
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

test("confirming branch_deeper persists child nodes and completes the task", async () => {
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
    await app.inject({
      method: "POST",
      url: `/api/sessions/${session.id}/voice-turns`,
      payload: {
        transcriptText: "围绕这个目标先发散四个方向",
        targetNodeId: null
      }
    })
  ).json().task;
  await app.inject({
    method: "POST",
    url: `/api/tasks/${initialTask.id}/confirm`
  });
  const initialTree = await app.inject({
    method: "GET",
    url: `/api/sessions/${session.id}/tree`
  });
  const targetNode = initialTree.json().nodes[0];

  const riskyTurn = await app.inject({
    method: "POST",
    url: `/api/sessions/${session.id}/voice-turns`,
    payload: {
      transcriptText: "沿着这个方向继续下钻三个子方向",
      targetNodeId: targetNode.id
    }
  });
  const awaitingTask = riskyTurn.json().task;
  assert.equal(awaitingTask.status, "awaiting_confirmation");

  const confirmResponse = await app.inject({
    method: "POST",
    url: `/api/tasks/${awaitingTask.id}/confirm`
  });
  assert.equal(confirmResponse.statusCode, 200);
  assert.equal(confirmResponse.json().task.status, "completed");

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

test("confirming refresh_layer replaces the visible sibling layer", async () => {
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
    await app.inject({
      method: "POST",
      url: `/api/sessions/${session.id}/voice-turns`,
      payload: {
        transcriptText: "围绕这个目标先发散四个方向",
        targetNodeId: null
      }
    })
  ).json().task;
  await app.inject({
    method: "POST",
    url: `/api/tasks/${initialTask.id}/confirm`
  });
  const initialTree = await app.inject({
    method: "GET",
    url: `/api/sessions/${session.id}/tree`
  });
  const initialNodes = initialTree.json().nodes;

  const riskyTurn = await app.inject({
    method: "POST",
    url: `/api/sessions/${session.id}/voice-turns`,
    payload: {
      transcriptText: "刷新当前层，换三个方向",
      targetNodeId: initialNodes[0].id
    }
  });
  const awaitingTask = riskyTurn.json().task;

  const confirmResponse = await app.inject({
    method: "POST",
    url: `/api/tasks/${awaitingTask.id}/confirm`
  });
  assert.equal(confirmResponse.json().task.status, "completed");

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

test("undo restores the layer superseded by refresh_layer", async () => {
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
    await app.inject({
      method: "POST",
      url: `/api/sessions/${session.id}/voice-turns`,
      payload: {
        transcriptText: "围绕这个目标先发散四个方向",
        targetNodeId: null
      }
    })
  ).json().task;
  await app.inject({
    method: "POST",
    url: `/api/tasks/${initialTask.id}/confirm`
  });
  const initialTree = await app.inject({
    method: "GET",
    url: `/api/sessions/${session.id}/tree`
  });
  const initialNodeIds = initialTree.json().nodes.map((node) => node.id);

  const riskyTurn = await app.inject({
    method: "POST",
    url: `/api/sessions/${session.id}/voice-turns`,
    payload: {
      transcriptText: "刷新当前层，换三个方向",
      targetNodeId: initialNodeIds[0]
    }
  });
  await app.inject({
    method: "POST",
    url: `/api/tasks/${riskyTurn.json().task.id}/confirm`
  });

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

test("voice turn without explicit target stays on the root instead of drifting to the last mentioned node", async () => {
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

  await app.inject({
    method: "POST",
    url: `/api/sessions/${session.id}/voice-turns`,
    payload: {
      transcriptText: "围绕这个目标先发散四个方向",
      targetNodeId: null
    }
  });

  const secondResponse = await app.inject({
    method: "POST",
    url: `/api/sessions/${session.id}/voice-turns`,
    payload: {
      transcriptText: "继续围绕整体目标扩展",
      targetNodeId: null
    }
  });

  assert.equal(secondResponse.statusCode, 202);
  assert.equal(secondResponse.json().task.targetNodeId, session.id);

  await app.close();
});

test("voice turn can resolve target nodes from transcript references", async () => {
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
    await app.inject({
      method: "POST",
      url: `/api/sessions/${session.id}/voice-turns`,
      payload: {
        transcriptText: "围绕这个目标先发散四个方向",
        targetNodeId: null
      }
    })
  ).json().task;
  await app.inject({
    method: "POST",
    url: `/api/tasks/${initialTask.id}/confirm`
  });

  const treeResponse = await app.inject({
    method: "GET",
    url: `/api/sessions/${session.id}/tree`
  });
  const nodes = treeResponse.json().nodes;
  const referencedNode = nodes[0];

  const byNumberResponse = await app.inject({
    method: "POST",
    url: `/api/sessions/${session.id}/voice-turns`,
    payload: {
      transcriptText: `沿着节点 ${referencedNode.publicNodeNumber} 继续发散`,
      targetNodeId: null
    }
  });

  assert.equal(byNumberResponse.statusCode, 202);
  assert.equal(byNumberResponse.json().task.targetNodeId, referencedNode.id);

  const byNameResponse = await app.inject({
    method: "POST",
    url: `/api/sessions/${session.id}/voice-turns`,
    payload: {
      transcriptText: `围绕${referencedNode.displayName}继续下钻`,
      targetNodeId: null
    }
  });

  assert.equal(byNameResponse.statusCode, 202);
  assert.equal(byNameResponse.json().task.targetNodeId, referencedNode.id);

  await app.close();
});

test("confirming a task updates the root goal before branch expansion is persisted", async () => {
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

  const voiceTurnResponse = await app.inject({
    method: "POST",
    url: `/api/sessions/${session.id}/voice-turns`,
    payload: {
      transcriptText: "围绕这个目标先发散四个方向",
      targetNodeId: null
    }
  });

  const awaitingTask = voiceTurnResponse.json().task;
  assert.equal(awaitingTask.status, "awaiting_confirmation");

  await app.inject({
    method: "POST",
    url: `/api/tasks/${awaitingTask.id}/confirm`
  });

  const treeResponse = await app.inject({
    method: "GET",
    url: `/api/sessions/${session.id}/tree`
  });

  assert.equal(
    treeResponse.json().session.goal,
    awaitingTask.designIntentSummary
  );

  await app.close();
});

test("SiliconFlow requests wait up to two minutes before timing out", () => {
  assert.match(siliconFlowSource, /REQUEST_TIMEOUT_MS = 120_000/);
});
