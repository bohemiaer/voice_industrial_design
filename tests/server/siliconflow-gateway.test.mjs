import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const gatewayEntry = pathToFileURL(
  path.join(process.cwd(), "apps", "server", "dist", "agents", "siliconflow.js")
).href;

const baseConfig = {
  nodeEnv: "test",
  serverPort: 8787,
  databaseUrl: null,
  agentProvider: "siliconflow",
  siliconFlowApiKey: "sk-test",
  siliconFlowBaseUrl: "https://api.siliconflow.cn/v1",
  siliconFlowAsrModel: "FunAudioLLM/SenseVoiceSmall",
  siliconFlowBrainstormModel: "deepseek-ai/DeepSeek-V4-Flash",
  siliconFlowImageModel: "Tongyi-MAI/Z-Image-Turbo",
  defaultBranchCount: 4,
  maxBranchCount: 4,
  sessionDomain: "industrial_design"
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}

async function createGateway(fetchImpl, overrides = {}) {
  const { SiliconFlowAgentGateway } = await import(`${gatewayEntry}?t=${Date.now()}${Math.random()}`);
  return new SiliconFlowAgentGateway(
    {
      ...baseConfig,
      ...overrides
    },
    fetchImpl
  );
}

function createBrainstormInput() {
  return {
    sessionGoal: "探索桌面智能设备方向",
    transcriptText: "先发散四个方向",
    selectedNodeId: "session-1",
    selectedNodeSummary: {
      publicNodeNumber: 1,
      displayName: "桌面智能设备",
      label: "root",
      intentSummary: "探索桌面智能设备方向",
      formLanguage: [],
      userNeedResponse: [],
      inspirationHints: []
    },
    ancestorPath: [],
    siblingSummaries: [],
    constraints: {
      minBranchCount: 3,
      maxBranchCount: 4,
      productDomain: "industrial_design",
      sketchStage: "early",
      inputMode: "voice_only"
    }
  };
}

function createAssistantOutput() {
  return {
    actionType: "expand_branches",
    targetNodeId: "session-1",
    branchCount: 3,
    designIntentSummary: "生成首层方向",
    assistantReply: "生成三个方向",
    confirmationRequired: false,
    promptHints: ["工业设计草图"],
    directionBriefs: [1, 2, 3].map((index) => ({
      briefId: `brief-${index}`,
      targetParentNodeId: "session-1",
      label: `方向 ${index}`,
      displayName: `方向 ${index}`,
      intentSummary: `探索方向 ${index}`,
      formLanguage: ["轻薄"],
      userNeedResponse: ["便携"],
      inspirationHints: ["消费电子"],
      variationAxis: "形态差异",
      promptIntent: "早期工业设计草图"
    }))
  };
}

function createSketchInput() {
  const brief = createAssistantOutput().directionBriefs[0];
  return {
    brief,
    sessionStyle: {
      sketchTone: "loose",
      detailLevel: "early",
      productDomain: "industrial_design"
    },
    depthContext: {
      depth: 0,
      branchStage: "first_layer"
    },
    siblingContext: []
  };
}

test("transcribeAudio sends multipart audio to SiliconFlow ASR endpoint", async () => {
  const calls = [];
  const gateway = await createGateway(async (url, init) => {
    calls.push({ url, init });
    return jsonResponse({ text: "沿着节点三继续发散" });
  });

  const result = await gateway.transcribeAudio({
    audio: Buffer.from("fake-audio"),
    mimeType: "audio/webm"
  });

  assert.equal(result.transcriptText, "沿着节点三继续发散");
  assert.equal(calls[0].url, "https://api.siliconflow.cn/v1/audio/transcriptions");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.authorization, "Bearer sk-test");
  assert.equal(calls[0].init.body instanceof FormData, true);
  assert.equal(calls[0].init.body.get("model"), "FunAudioLLM/SenseVoiceSmall");
  assert.equal(calls[0].init.body.get("file").name, "recording.webm");
});

test("transcribeAudio accepts empty transcript text from SiliconFlow ASR", async () => {
  const gateway = await createGateway(async () => jsonResponse({ text: "" }));

  const result = await gateway.transcribeAudio({
    audio: Buffer.from("fake-audio"),
    mimeType: "audio/wav"
  });

  assert.equal(result.transcriptText, "");
});

test("runBrainstormAssistant sends JSON mode chat completion request", async () => {
  const calls = [];
  const gateway = await createGateway(async (url, init) => {
    calls.push({ url, init });
    return jsonResponse({
      choices: [
        {
          message: {
            content: JSON.stringify(createAssistantOutput())
          }
        }
      ]
    });
  });

  const result = await gateway.runBrainstormAssistant(createBrainstormInput());

  assert.equal(result.actionType, "expand_branches");
  assert.equal(calls[0].url, "https://api.siliconflow.cn/v1/chat/completions");
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, "deepseek-ai/DeepSeek-V4-Flash");
  assert.deepEqual(body.response_format, { type: "json_object" });
  assert.equal(body.enable_thinking, false);
  assert.match(body.messages[0].content, /actionType/);
  assert.match(body.messages[0].content, /directionBriefs/);
  assert.match(body.messages[0].content, /targetNodeId/);
  assert.match(body.messages[0].content, /rewrittenIntentForConfirmation/);
});

test("generateSketch sends image generation request and maps returned image URL", async () => {
  const calls = [];
  const gateway = await createGateway(async (url, init) => {
    calls.push({ url, init });
    return jsonResponse({
      images: [{ url: "https://example.com/generated.png" }],
      seed: 12
    });
  });

  const result = await gateway.generateSketch(createSketchInput());

  assert.equal(result.imageUrl, "https://example.com/generated.png");
  assert.equal(result.briefId, "brief-1");
  assert.equal(calls[0].url, "https://api.siliconflow.cn/v1/images/generations");
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, "Tongyi-MAI/Z-Image-Turbo");
  assert.match(body.prompt, /早期工业设计草图/);
  assert.equal(body.batch_size, 1);
});

test("SiliconFlow gateway retries 429 responses and parses the successful retry", async () => {
  let attempts = 0;
  const gateway = await createGateway(async () => {
    attempts += 1;
    if (attempts === 1) {
      return jsonResponse({ error: { message: "rate limited" } }, 429);
    }
    return jsonResponse({ text: "重试后成功" });
  });

  const result = await gateway.transcribeAudio({
    audio: Buffer.from("fake-audio"),
    mimeType: "audio/webm"
  });

  assert.equal(result.transcriptText, "重试后成功");
  assert.equal(attempts, 2);
});

test("SiliconFlow gateway wraps invalid structured output as AgentGatewayError", async () => {
  const gateway = await createGateway(async () =>
    jsonResponse({
      choices: [
        {
          message: {
            content: "{\"not\":\"valid assistant output\"}"
          }
        }
      ]
    })
  );

  await assert.rejects(
    () => gateway.runBrainstormAssistant(createBrainstormInput()),
    {
      name: "AgentGatewayError",
      code: "SILICONFLOW_RESPONSE_INVALID"
    }
  );
});

test("runBrainstormAssistant falls back to assistantReply when confirmation intent is omitted", async () => {
  const gateway = await createGateway(async () =>
    jsonResponse({
      choices: [
        {
          message: {
            content: JSON.stringify({
              ...createAssistantOutput(),
              confirmationRequired: true,
              rewrittenIntentForConfirmation: undefined
            })
          }
        }
      ]
    })
  );

  const result = await gateway.runBrainstormAssistant(createBrainstormInput());

  assert.equal(result.confirmationRequired, true);
  assert.equal(
    result.rewrittenIntentForConfirmation,
    result.assistantReply
  );
});
