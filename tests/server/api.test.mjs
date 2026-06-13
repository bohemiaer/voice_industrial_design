import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const appEntry = pathToFileURL(
  path.join(process.cwd(), "apps", "server", "dist", "app.js")
).href;

async function createTestApp() {
  const { buildApp } = await import(appEntry);
  return buildApp({
    persistenceMode: "memory"
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
  assert.equal(queuedTask.status, "completed");
  assert.equal(queuedTask.confirmationStatus, "not_required");

  const taskResponse = await app.inject({
    method: "GET",
    url: `/api/tasks/${queuedTask.id}`
  });

  assert.equal(taskResponse.statusCode, 200);
  assert.equal(taskResponse.json().task.id, queuedTask.id);

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
  assert.equal(confirmResponse.json().task.status, "generating");

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

test("voice turn is orchestrated by the backend from transcript only", async () => {
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
  assert.equal(task.status, "completed");
  assert.equal(task.confirmationStatus, "not_required");
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
