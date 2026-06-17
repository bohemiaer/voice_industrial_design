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
  deepSeekApiKey: "ds-test",
  deepSeekBaseUrl: "https://api.deepseek.com",
  deepSeekBrainstormModel: "deepseek-v4-flash",
  siliconFlowApiKey: "sk-test",
  siliconFlowBaseUrl: "https://api.siliconflow.cn/v1",
  siliconFlowAsrModel: "FunAudioLLM/SenseVoiceSmall",
  siliconFlowImageModel: "Tongyi-MAI/Z-Image-Turbo",
  defaultBranchCount: 3,
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
    conversationHistory: [],
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

function createDeeperBrainstormInput() {
  return {
    sessionGoal: "为桌面补光设备保持轻便、克制且专业器材感的初始方向",
    transcriptText: "沿着节点一继续发散三个更轻一点的版本",
    selectedNodeId: "node-1",
    selectedNodeSummary: {
      publicNodeNumber: 1,
      displayName: "轻薄悬浮感",
      label: "方向 1",
      intentSummary: "压缩体量并强化悬浮底座，降低桌面压迫感。",
      formLanguage: ["轻薄", "悬浮"],
      userNeedResponse: ["降低桌面存在感"],
      inspirationHints: ["办公设备", "消费电子"]
    },
    ancestorPath: [
      {
        nodeId: "session-1",
        label: "root",
        intentSummary: "为桌面补光设备保持轻便、克制且专业器材感的初始方向"
      }
    ],
    conversationHistory: [
      {
        role: "user",
        kind: "transcript",
        content: "先围绕这个目标发散三个方向"
      },
      {
        role: "assistant",
        kind: "summary",
        content: "我会先生成三个保持专业器材感的方向。"
      }
    ],
    siblingSummaries: [
      {
        nodeId: "node-2",
        label: "柔和包裹",
        intentSummary: "边缘更圆润，增强亲和感并弱化机械感。",
        formLanguage: ["圆润", "包裹"]
      }
    ],
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
    actionType: "diverge",
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
  assert.equal(calls[0].init.body.get("file").type, "audio/webm");
});

test("transcribeAudio preserves wav uploads when forwarding to SiliconFlow ASR", async () => {
  const calls = [];
  const gateway = await createGateway(async (url, init) => {
    calls.push({ url, init });
    return jsonResponse({ text: "这是一段 wav 录音" });
  });

  const result = await gateway.transcribeAudio({
    audio: Buffer.from("fake-audio"),
    mimeType: "audio/wav"
  });

  assert.equal(result.transcriptText, "这是一段 wav 录音");
  assert.equal(calls[0].init.body.get("file").name, "recording.wav");
  assert.equal(calls[0].init.body.get("file").type, "audio/wav");
});

test("transcribeAudio accepts empty transcript text from SiliconFlow ASR", async () => {
  const gateway = await createGateway(async () => jsonResponse({ text: "" }));

  const result = await gateway.transcribeAudio({
    audio: Buffer.from("fake-audio"),
    mimeType: "audio/wav"
  });

  assert.equal(result.transcriptText, "");
});

test("runBrainstormAssistant sends JSON mode chat completion request directly to DeepSeek official API", async () => {
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

  assert.equal(result.actionType, "diverge");
  assert.equal(calls[0].url, "https://api.deepseek.com/chat/completions");
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, "deepseek-v4-flash");
  assert.deepEqual(body.response_format, { type: "json_object" });
  assert.deepEqual(body.thinking, { type: "disabled" });
  assert.equal(body.messages.length >= 6, true);
  assert.match(body.messages[0].content, /actionType/);
  assert.match(body.messages[0].content, /directionBriefs/);
  assert.match(body.messages[0].content, /targetNodeId/);
  assert.match(body.messages[0].content, /rewrittenIntentForConfirmation/);
  assert.equal(body.messages[1].role, "user");
  assert.match(body.messages[1].content, /示例输入 1/);
  assert.equal(body.messages[2].role, "assistant");
  assert.match(body.messages[2].content, /"actionType":"diverge"/);
  assert.equal(body.messages[3].role, "user");
  assert.match(body.messages[3].content, /示例输入 2/);
  assert.equal(body.messages[4].role, "assistant");
  assert.match(body.messages[4].content, /"actionType":"refresh"/);
  assert.equal(body.messages.at(-1).role, "user");
});

test("runBrainstormAssistant keeps the original root goal explicit in later-turn prompt context", async () => {
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

  await gateway.runBrainstormAssistant(createDeeperBrainstormInput());

  const body = JSON.parse(calls[0].init.body);
  assert.match(body.messages[0].content, /初始设计目标/);
  assert.match(body.messages[0].content, /不能偏离/);
  assert.match(body.messages.at(-1).content, /sessionGoal/);
  assert.match(
    body.messages.at(-1).content,
    /为桌面补光设备保持轻便、克制且专业器材感的初始方向/
  );
  assert.match(body.messages.at(-1).content, /ancestorPath/);
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
      code: "DEEPSEEK_RESPONSE_INVALID"
    }
  );
});

test("runBrainstormAssistant normalizes lightly malformed DeepSeek branch payloads instead of rejecting them", async () => {
  const gateway = await createGateway(async () =>
    jsonResponse({
      choices: [
        {
          message: {
            content: JSON.stringify({
              actionType: "diverge",
              targetNodeId: "session-1",
              assistantReply: "先给你三条方向。",
              designIntentSummary: "围绕桌面设备的首轮需求继续发散。",
              directionBriefs: [
                {
                  title: "轻薄悬浮感",
                  summary: "更薄、更轻、更适合办公桌。",
                  formLanguage: "轻薄,悬浮",
                  userNeedResponse: "降低压迫感",
                  inspirationHints: "办公设备",
                  axis: "体量感",
                  prompt: "白底工业设计草图"
                },
                {
                  name: "柔和包裹感",
                  description: "边缘更圆润，观感更柔和。",
                  formLanguage: ["圆润", "包裹"],
                  userNeedResponse: ["亲和感"],
                  inspirationHints: ["家居产品"],
                  variationAxis: "边界处理",
                  promptIntent: "白底工业设计草图"
                }
              ]
            })
          }
        }
      ]
    })
  );

  const result = await gateway.runBrainstormAssistant(createBrainstormInput());

  assert.equal(result.branchCount, 2);
  assert.equal(result.directionBriefs.length, 2);
  assert.equal(result.directionBriefs[0].displayName, "轻薄悬浮感");
  assert.equal(result.directionBriefs[0].intentSummary, "更薄、更轻、更适合办公桌。");
  assert.deepEqual(result.directionBriefs[0].formLanguage, ["轻薄", "悬浮"]);
  assert.deepEqual(result.directionBriefs[0].userNeedResponse, ["降低压迫感"]);
  assert.equal(result.directionBriefs[0].variationAxis, "体量感");
  assert.equal(result.directionBriefs[0].targetParentNodeId, "session-1");
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

test("runBrainstormAssistant salvages fenced JSON and normalizes branch metadata", async () => {
  const gateway = await createGateway(async () =>
    jsonResponse({
      choices: [
        {
          message: {
            content: [
              "```json",
              JSON.stringify({
                ...createAssistantOutput(),
                targetNodeId: undefined,
                branchCount: 4,
                promptHints: undefined,
                directionBriefs: createAssistantOutput().directionBriefs.map(
                  (brief) => ({
                    ...brief,
                    targetParentNodeId: undefined
                  })
                )
              }),
              "```"
            ].join("\n")
          }
        }
      ]
    })
  );

  const result = await gateway.runBrainstormAssistant(createBrainstormInput());

  assert.equal(result.targetNodeId, "session-1");
  assert.equal(result.branchCount, 3);
  assert.deepEqual(result.promptHints, []);
  assert.equal(
    result.directionBriefs.every(
      (brief) => brief.targetParentNodeId === "session-1"
    ),
    true
  );
});
