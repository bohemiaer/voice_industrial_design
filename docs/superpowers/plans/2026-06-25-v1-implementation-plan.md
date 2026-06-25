# V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the v1 agent architecture from the v1 requirements, Agent PRD, and persistence design: standard intent routing, direct execution, real LLM chat, memory summarization after 6 dialogue turns, deterministic sketch prompt building, and consistent tree persistence.

**Architecture:** Keep Orchestrator as the only state writer and router. Add typed agent gateway methods for Brainstorm, Chat, Memory, and Sketch Generation; keep Prompt Builder deterministic and make Sketch Generation Gateway image-model-only. Persist semantic briefs on branch tasks and tree nodes so the concept tree remains explainable and reusable.

**Tech Stack:** TypeScript, Zod shared schemas, Fastify server routes, in-memory and Drizzle repositories, DeepSeek chat completions through the existing SiliconFlow gateway wrapper pattern, SiliconFlow image generation, Node test runner.

---

## File Structure

- Modify `packages/shared/src/constants.ts`: add or confirm message kinds and action/status enums used by v1.
- Modify `packages/shared/src/schemas.ts`: add StandardTurnIntent, Chat Assistant, Memory Summarizer, and Prompt Builder schemas; add `constraints.defaultBranchCount`.
- Modify `apps/server/src/agents/types.ts`: extend `AgentGateway` with `runChatAssistant()` and `runMemorySummarizer()`.
- Modify `apps/server/src/agents/mock.ts`: add deterministic mock chat and memory methods.
- Modify `apps/server/src/agents/siliconflow.ts`: add real DeepSeek chat and memory calls; keep image generation separate from deterministic prompt building.
- Create `apps/server/src/agents/sketch-prompt-builder.ts`: isolate deterministic prompt and negative prompt construction.
- Modify `apps/server/src/orchestrator/service.ts`: add standard intent routing, chat branch, memory trigger after 6 turns, refresh default branch count, and direct execution semantics.
- Modify `apps/server/src/repositories/types.ts`: add repository helpers needed for last memory summary and chat/message writes if missing.
- Modify `apps/server/src/repositories/memory.ts`: implement new helpers without changing public storage shape.
- Modify `apps/server/src/repositories/drizzle.ts`: implement matching helpers for Postgres mode.
- Modify `apps/server/src/routes/sessions.ts`: route voice/text/canvas turns into the standard intent path if the route currently assumes generation-only voice turns.
- Modify `tests/server/api.test.mjs`: cover standard intent routing, chat branch, memory trigger, refresh default count, direct execution, and persistence effects.
- Modify `tests/server/siliconflow-gateway.test.mjs`: cover Chat Assistant, Memory Summarizer, and Prompt Builder request bodies.
- Modify `tests/workspace/shared-schema.test.mjs`: cover new shared schemas.

---

### Task 1: Shared V1 Schemas

**Files:**
- Modify: `packages/shared/src/constants.ts`
- Modify: `packages/shared/src/schemas.ts`
- Test: `tests/workspace/shared-schema.test.mjs`

- [ ] **Step 1: Add failing shared schema tests**

Append these cases to `tests/workspace/shared-schema.test.mjs`:

```js
test("v1 schemas validate standard intent, chat, and memory payloads", async () => {
  const shared = await import(sharedEntry);

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
  const shared = await import(sharedEntry);

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
```

- [ ] **Step 2: Run the focused shared schema test and confirm it fails**

Run:

```powershell
node --test tests/workspace/shared-schema.test.mjs
```

Expected: fails because `StandardTurnIntentSchema`, `ChatAssistantOutputSchema`, `MemorySummarizerOutputSchema`, `conversationMemory.shortSummary`, or `constraints.defaultBranchCount` is not defined yet.

- [ ] **Step 3: Implement schemas**

In `packages/shared/src/schemas.ts`, add these schemas near the existing assistant schemas:

```ts
export const IntentKindSchema = z.enum(["chat", "generation", "tree_op"]);
export const InputSourceSchema = z.enum(["voice", "text", "canvas"]);
export const RequestedActionSchema = z.enum([
  "diverge",
  "refresh",
  "delete",
  "undo",
  "redo"
]);
export const ChatTypeSchema = z.enum([
  "casual",
  "help",
  "status",
  "explain_node",
  "explain_canvas"
]);

export const ConversationMemorySchema = z.object({
  stablePreferences: z.array(z.string().min(1)),
  activeConstraints: z.array(z.string().min(1)),
  rejectedDirections: z.array(z.string().min(1)),
  openQuestions: z.array(z.string().min(1)),
  shortSummary: z.string().min(1)
});

export const StandardTurnIntentSchema = z.object({
  sessionId: z.string().min(1),
  userIntentText: z.string().min(1),
  intentKind: IntentKindSchema,
  requestedAction: RequestedActionSchema.optional(),
  chatType: ChatTypeSchema.optional(),
  targetNodeId: z.string().min(1),
  source: InputSourceSchema
});

export const ChatAssistantInputSchema = z.object({
  userIntentText: z.string().min(1),
  chatType: ChatTypeSchema,
  sessionGoal: z.string().min(1),
  conversationMemory: ConversationMemorySchema.optional(),
  conversationHistory: z.array(ConversationHistoryItemSchema),
  selectedNode: z
    .object({
      nodeId: z.string().min(1),
      displayName: z.string().min(1),
      intentSummary: z.string().min(1)
    })
    .optional(),
  visibleNodeSummaries: z
    .array(
      z.object({
        nodeId: z.string().min(1),
        displayName: z.string().min(1),
        intentSummary: z.string().min(1),
        variationAxis: z.string().min(1).optional()
      })
    )
    .optional()
});

export const ChatAssistantOutputSchema = z.object({
  assistantReply: z.string().min(1)
});

export const MemorySummarizerInputSchema = z.object({
  sessionGoal: z.string().min(1),
  selectedNode: z
    .object({
      nodeId: z.string().min(1),
      intentSummary: z.string().min(1)
    })
    .optional(),
  recentMessages: z.array(ConversationHistoryItemSchema),
  previousMemory: ConversationMemorySchema.optional()
});

export const MemorySummarizerOutputSchema = ConversationMemorySchema;
```

Update `BrainstormAssistantInputSchema`:

```ts
conversationMemory: ConversationMemorySchema.optional(),
constraints: z.object({
  minBranchCount: z.number().int().positive(),
  maxBranchCount: z.number().int().positive(),
  defaultBranchCount: z.number().int().positive(),
  productDomain: ProductDomainSchema,
  sketchStage: SketchStageSchema,
  inputMode: InputModeSchema
})
```

In `packages/shared/src/index.ts`, ensure the new schemas and inferred types are exported by the existing export pattern.

- [ ] **Step 4: Run the focused shared schema test and confirm it passes**

Run:

```powershell
node --test tests/workspace/shared-schema.test.mjs
```

Expected: all shared schema tests pass.

- [ ] **Step 5: Commit**

```powershell
git add packages/shared/src/constants.ts packages/shared/src/schemas.ts packages/shared/src/index.ts tests/workspace/shared-schema.test.mjs
git commit -m "feat: add v1 assistant schemas"
```

---

### Task 2: Agent Gateway Chat And Memory Methods

**Files:**
- Modify: `apps/server/src/agents/types.ts`
- Modify: `apps/server/src/agents/mock.ts`
- Modify: `apps/server/src/agents/siliconflow.ts`
- Test: `tests/server/siliconflow-gateway.test.mjs`

- [ ] **Step 1: Add failing gateway tests for real LLM chat and memory**

Append to `tests/server/siliconflow-gateway.test.mjs`:

```js
test("runChatAssistant sends a JSON mode chat completion request", async () => {
  const calls = [];
  const gateway = await createGateway(async (url, init) => {
    calls.push({ url, init });
    return jsonResponse({
      choices: [
        {
          message: {
            content: JSON.stringify({
              assistantReply: "当前节点强调轻薄悬浮，适合继续探索更低压迫感的桌面方案。"
            })
          }
        }
      ]
    });
  });

  const result = await gateway.runChatAssistant({
    userIntentText: "解释一下当前节点",
    chatType: "explain_node",
    sessionGoal: "探索桌面补光设备",
    conversationHistory: [],
    selectedNode: {
      nodeId: "node-1",
      displayName: "轻薄悬浮感",
      intentSummary: "压缩体量并强化悬浮底座。"
    }
  });

  assert.match(result.assistantReply, /轻薄悬浮/);
  assert.equal(calls[0].url, "https://api.deepseek.com/chat/completions");
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, "deepseek-v4-flash");
  assert.deepEqual(body.response_format, { type: "json_object" });
  assert.match(body.messages[0].content, /只读对话助理/);
  assert.match(body.messages.at(-1).content, /解释一下当前节点/);
});

test("runMemorySummarizer returns structured memory from JSON mode", async () => {
  const gateway = await createGateway(async () =>
    jsonResponse({
      choices: [
        {
          message: {
            content: JSON.stringify({
              stablePreferences: ["轻薄"],
              activeConstraints: ["办公桌面"],
              rejectedDirections: ["厚重机械感"],
              openQuestions: [],
              shortSummary: "用户偏好轻薄、办公友好的方向。"
            })
          }
        }
      ]
    })
  );

  const result = await gateway.runMemorySummarizer({
    sessionGoal: "探索桌面补光设备",
    recentMessages: [
      {
        role: "user",
        kind: "transcript",
        content: "不要太厚重"
      },
      {
        role: "assistant",
        kind: "summary",
        content: "会保持轻薄。"
      }
    ]
  });

  assert.deepEqual(result.stablePreferences, ["轻薄"]);
  assert.equal(result.shortSummary.includes("轻薄"), true);
});
```

- [ ] **Step 2: Run focused gateway tests and confirm failure**

Run:

```powershell
corepack pnpm build:shared; corepack pnpm --filter @voice-industrial-design/server build; node --test tests/server/siliconflow-gateway.test.mjs
```

Expected: TypeScript build fails or tests fail because `runChatAssistant()` and `runMemorySummarizer()` are missing.

- [ ] **Step 3: Extend AgentGateway types**

In `apps/server/src/agents/types.ts`, import the new types and extend the interface:

```ts
import type {
  BrainstormAssistantInput,
  BrainstormAssistantOutput,
  ChatAssistantInput,
  ChatAssistantOutput,
  MemorySummarizerInput,
  MemorySummarizerOutput,
  SketchGenerationInput,
  SketchGenerationOutput
} from "@voice-industrial-design/shared";
```

Add to `AgentGateway`:

```ts
runChatAssistant(input: ChatAssistantInput): Promise<ChatAssistantOutput>;
runMemorySummarizer(
  input: MemorySummarizerInput
): Promise<MemorySummarizerOutput>;
```

- [ ] **Step 4: Implement mock gateway methods**

In `apps/server/src/agents/mock.ts`, add:

```ts
async runChatAssistant(input: ChatAssistantInput): Promise<ChatAssistantOutput> {
  const target = input.selectedNode
    ? `当前节点“${input.selectedNode.displayName}”的方向是：${input.selectedNode.intentSummary}`
    : `当前会话目标是：${input.sessionGoal}`;

  return {
    assistantReply: `${target}。这次只是回答问题，不会改变画布。`
  };
}

async runMemorySummarizer(
  input: MemorySummarizerInput
): Promise<MemorySummarizerOutput> {
  return {
    stablePreferences: input.previousMemory?.stablePreferences ?? [],
    activeConstraints: input.previousMemory?.activeConstraints ?? [],
    rejectedDirections: input.previousMemory?.rejectedDirections ?? [],
    openQuestions: input.previousMemory?.openQuestions ?? [],
    shortSummary: "近期对话已压缩，暂无新增稳定偏好。"
  };
}
```

Add the matching type imports from `@voice-industrial-design/shared`.

- [ ] **Step 5: Implement SiliconFlow Chat Assistant and Memory Summarizer**

In `apps/server/src/agents/siliconflow.ts`, import schemas:

```ts
ChatAssistantOutputSchema,
MemorySummarizerOutputSchema,
type ChatAssistantInput,
type ChatAssistantOutput,
type MemorySummarizerInput,
type MemorySummarizerOutput
```

Add methods to `SiliconFlowAgentGateway`:

```ts
async runChatAssistant(input: ChatAssistantInput): Promise<ChatAssistantOutput> {
  const content = await this.requestChatCompletion(
    buildChatAssistantMessages(input),
    "DEEPSEEK_CHAT_RESPONSE_INVALID"
  );

  try {
    return ChatAssistantOutputSchema.parse(parseAssistantJson(content));
  } catch (error) {
    throw new AgentGatewayError(
      "DeepSeek chat response did not match the Chat Assistant schema.",
      "DEEPSEEK_CHAT_RESPONSE_INVALID",
      error
    );
  }
}

async runMemorySummarizer(
  input: MemorySummarizerInput
): Promise<MemorySummarizerOutput> {
  const content = await this.requestChatCompletion(
    buildMemorySummarizerMessages(input),
    "DEEPSEEK_MEMORY_RESPONSE_INVALID"
  );

  try {
    return MemorySummarizerOutputSchema.parse(parseAssistantJson(content));
  } catch (error) {
    throw new AgentGatewayError(
      "DeepSeek memory response did not match the Memory Summarizer schema.",
      "DEEPSEEK_MEMORY_RESPONSE_INVALID",
      error
    );
  }
}
```

Extract the existing Brainstorm chat completion call into a private helper:

```ts
private async requestChatCompletion(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  errorCode: string
): Promise<string> {
  const model = this.requireConfig(
    this.config.deepSeekBrainstormModel,
    "DEEPSEEK_BRAINSTORM_MODEL"
  );

  const response = await this.requestJson<ChatCompletionResponse>(
    "https://api.deepseek.com/chat/completions",
    {
      method: "POST",
      headers: this.deepSeekJsonHeaders(),
      body: JSON.stringify({
        model,
        messages,
        response_format: { type: "json_object" },
        thinking: { type: "disabled" }
      })
    }
  );

  const content = response.choices?.[0]?.message?.content;

  if (!content) {
    throw new AgentGatewayError(
      "DeepSeek response did not include assistant content.",
      errorCode
    );
  }

  return content;
}
```

Add builders:

```ts
function buildChatAssistantMessages(
  input: ChatAssistantInput
): Array<{ role: "system" | "user"; content: string }> {
  return [
    {
      role: "system",
      content: [
        "你是工业设计脑暴工具的只读对话助理。",
        "你必须回答用户问题，但不得生成方向 brief、不得调用生图、不得决定树操作。",
        "只能输出 JSON object：{\"assistantReply\":\"string\"}。"
      ].join("\n")
    },
    {
      role: "user",
      content: JSON.stringify(input)
    }
  ];
}

function buildMemorySummarizerMessages(
  input: MemorySummarizerInput
): Array<{ role: "system" | "user"; content: string }> {
  return [
    {
      role: "system",
      content: [
        "你是工业设计脑暴会话的记忆摘要助理。",
        "只保留会影响后续设计生成或解释的事实。",
        "只能输出 JSON object，字段为 stablePreferences、activeConstraints、rejectedDirections、openQuestions、shortSummary。"
      ].join("\n")
    },
    {
      role: "user",
      content: JSON.stringify(input)
    }
  ];
}
```

- [ ] **Step 6: Run focused gateway tests and confirm pass**

Run:

```powershell
corepack pnpm build:shared; corepack pnpm --filter @voice-industrial-design/server build; node --test tests/server/siliconflow-gateway.test.mjs
```

Expected: all SiliconFlow gateway tests pass.

- [ ] **Step 7: Commit**

```powershell
git add apps/server/src/agents/types.ts apps/server/src/agents/mock.ts apps/server/src/agents/siliconflow.ts tests/server/siliconflow-gateway.test.mjs
git commit -m "feat: add chat and memory agent gateway methods"
```

---

### Task 3: Deterministic Sketch Prompt Builder Module

**Files:**
- Create: `apps/server/src/agents/sketch-prompt-builder.ts`
- Modify: `apps/server/src/agents/siliconflow.ts`
- Test: `tests/server/siliconflow-gateway.test.mjs`

- [ ] **Step 1: Add focused prompt builder expectations**

Update the existing `generateSketch sends image generation request and maps returned image URL` test in `tests/server/siliconflow-gateway.test.mjs` to assert:

```js
assert.match(body.prompt, /Early industrial design concept sketch/);
assert.match(body.prompt, /Concept direction: 方向 1/);
assert.match(body.prompt, /Variation axis: 形态差异/);
assert.match(body.prompt, /loose marker sketch style/);
assert.match(body.negative_prompt, /photorealistic/);
assert.match(body.negative_prompt, /multiple unrelated products/);
```

- [ ] **Step 2: Run focused gateway test and confirm it fails if builder is still inline**

Run:

```powershell
corepack pnpm --filter @voice-industrial-design/server build; node --test tests/server/siliconflow-gateway.test.mjs
```

Expected: if the current inline builder already satisfies the assertions, this step may pass; still proceed to extraction to match the v1 module boundary.

- [ ] **Step 3: Create prompt builder module**

Create `apps/server/src/agents/sketch-prompt-builder.ts`:

```ts
import type { SketchGenerationInput } from "@voice-industrial-design/shared";

export interface SketchPromptBuilderOutput {
  briefId: string;
  prompt: string;
  negativePrompt: string;
  promptLanguage: "en";
  visualSummary: string;
}

export function buildSketchPromptSet(
  input: SketchGenerationInput
): SketchPromptBuilderOutput {
  return {
    briefId: input.brief.briefId,
    prompt: buildSketchPrompt(input),
    negativePrompt: buildSketchNegativePrompt(),
    promptLanguage: "en",
    visualSummary: `${input.brief.displayName} 的早期工业设计草图。`
  };
}

function buildSketchPrompt(input: SketchGenerationInput): string {
  const branchStageInstruction =
    input.depthContext.branchStage === "first_layer"
      ? "Keep the sketch loose, exploratory, and visually broad for first-layer ideation."
      : "Make the sketch more controlled while preserving the selected design direction.";
  const detailInstruction =
    input.sessionStyle.detailLevel === "early"
      ? "Avoid small technical details; focus on silhouette, proportion, and dominant surfaces."
      : "Add clearer seams, component boundaries, CMF cues, and interaction details while keeping it sketch-like.";

  return [
    "Early industrial design concept sketch for product design ideation.",
    `Concept direction: ${input.brief.displayName}.`,
    `Design intent: ${input.brief.intentSummary}.`,
    `Variation axis: ${input.brief.variationAxis}.`,
    `Form language: ${input.brief.formLanguage.join(", ")}.`,
    `User need response: ${input.brief.userNeedResponse.join(", ")}.`,
    `Inspiration cues: ${input.brief.inspirationHints.join(", ")}.`,
    `Core visual intent: ${input.brief.promptIntent}.`,
    `Sketch tone: ${input.sessionStyle.sketchTone}.`,
    `Detail level: ${input.sessionStyle.detailLevel}.`,
    `Branch stage: ${input.depthContext.branchStage}.`,
    branchStageInstruction,
    detailInstruction,
    "Emphasize silhouette, proportion, key surfaces, material cues, interaction areas, and sketch medium.",
    "Use loose marker sketch style, clean linework, subtle grey shading, white background, and a product design ideation board feeling.",
    "Show one coherent product concept only, suitable for comparing design directions."
  ].join("\n");
}

function buildSketchNegativePrompt(): string {
  return [
    "photorealistic",
    "final render",
    "advertisement",
    "UI text",
    "logos",
    "brand marks",
    "people",
    "hands",
    "cluttered background",
    "exploded diagram",
    "annotations",
    "multiple unrelated products"
  ].join(", ");
}
```

- [ ] **Step 4: Use the module from SiliconFlow image generation**

In `apps/server/src/agents/siliconflow.ts`, import:

```ts
import { buildSketchPromptSet } from "./sketch-prompt-builder.js";
```

Inside `generateSketch()` replace local prompt construction with:

```ts
const promptSet = buildSketchPromptSet(input);
```

Use:

```ts
prompt: promptSet.prompt,
negative_prompt: promptSet.negativePrompt,
promptUsed: promptSet.prompt,
negativePromptUsed: promptSet.negativePrompt,
visualSummary: promptSet.visualSummary
```

Remove the local `buildSketchPrompt()` and `buildSketchNegativePrompt()` functions from `siliconflow.ts`.

- [ ] **Step 5: Run focused gateway tests**

Run:

```powershell
corepack pnpm --filter @voice-industrial-design/server build; node --test tests/server/siliconflow-gateway.test.mjs
```

Expected: all SiliconFlow gateway tests pass.

- [ ] **Step 6: Commit**

```powershell
git add apps/server/src/agents/sketch-prompt-builder.ts apps/server/src/agents/siliconflow.ts tests/server/siliconflow-gateway.test.mjs
git commit -m "refactor: isolate deterministic sketch prompt builder"
```

---

### Task 4: Standard Intent Routing And Chat Branch

**Files:**
- Modify: `apps/server/src/orchestrator/service.ts`
- Modify: `apps/server/src/routes/sessions.ts`
- Test: `tests/server/api.test.mjs`

- [ ] **Step 1: Add failing API tests for chat branch**

Append to `tests/server/api.test.mjs`:

```js
test("chat turns call Chat Assistant and do not mutate the tree", async () => {
  const agentCalls = {
    chat: 0,
    brainstorm: 0,
    sketch: 0
  };
  const app = await buildTestApp({
    agentGateway: {
      transcribeAudio: async () => ({ transcriptText: "解释一下当前节点，不要生成" }),
      runBrainstormAssistant: async () => {
        agentCalls.brainstorm += 1;
        throw new Error("brainstorm should not be called for chat");
      },
      generateSketch: async () => {
        agentCalls.sketch += 1;
        throw new Error("sketch should not be called for chat");
      },
      runChatAssistant: async () => {
        agentCalls.chat += 1;
        return {
          assistantReply: "这是只读解释，不会改变画布。"
        };
      },
      runMemorySummarizer: async () => ({
        stablePreferences: [],
        activeConstraints: [],
        rejectedDirections: [],
        openQuestions: [],
        shortSummary: "无新增记忆。"
      })
    }
  });

  const session = await createSession(app);
  const response = await app.inject({
    method: "POST",
    url: `/api/sessions/${session.id}/voice-turns`,
    headers: authHeaders(),
    payload: {
      transcriptText: "解释一下当前节点，不要生成"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(agentCalls.chat, 1);
  assert.equal(agentCalls.brainstorm, 0);
  assert.equal(agentCalls.sketch, 0);

  const tree = await app.inject({
    method: "GET",
    url: `/api/sessions/${session.id}/tree`,
    headers: authHeaders()
  });
  assert.equal(JSON.parse(tree.body).nodes.length, 0);
});
```

If helper names differ in `api.test.mjs`, adapt to the existing local helper names while preserving the assertions.

- [ ] **Step 2: Run focused API test and confirm failure**

Run:

```powershell
corepack pnpm build:shared; corepack pnpm --filter @voice-industrial-design/server build; node --test --test-concurrency=1 tests/server/api.test.mjs
```

Expected: fails because all turns currently flow through generation or because `runChatAssistant` is not routed.

- [ ] **Step 3: Add standard intent resolver**

In `apps/server/src/orchestrator/service.ts`, add:

```ts
function resolveStandardTurnIntent(input: {
  sessionId: string;
  transcriptText: string;
  requestedTargetNodeId: string | null;
  source: "voice" | "text" | "canvas";
  selectedNodeId: string;
}): StandardTurnIntent {
  const text = input.transcriptText.trim();
  const lower = text.toLowerCase();
  const explicitNoGenerate =
    /不要生成|别生成|不生成|只聊|先聊|解释|说明|怎么用|帮助|状态|当前/.test(text);
  const deleteIntent = /删除|删掉|移除/.test(text);
  const undoIntent = /撤回|撤销|undo/i.test(text);
  const redoIntent = /重做|恢复|redo/i.test(text);
  const refreshIntent = /刷新|换一版|重来|重新生成|refresh/i.test(text);

  if (deleteIntent || undoIntent || redoIntent) {
    return {
      sessionId: input.sessionId,
      userIntentText: text,
      intentKind: "tree_op",
      requestedAction: deleteIntent ? "delete" : undoIntent ? "undo" : "redo",
      targetNodeId: input.selectedNodeId,
      source: input.source
    };
  }

  if (explicitNoGenerate) {
    return {
      sessionId: input.sessionId,
      userIntentText: text,
      intentKind: "chat",
      chatType: /解释|说明/.test(text) ? "explain_node" : /帮助|怎么用/.test(text) ? "help" : "casual",
      targetNodeId: input.selectedNodeId,
      source: input.source
    };
  }

  return {
    sessionId: input.sessionId,
    userIntentText: text,
    intentKind: "generation",
    requestedAction: refreshIntent ? "refresh" : "diverge",
    targetNodeId: input.selectedNodeId,
    source: input.source
  };
}
```

Use `StandardTurnIntent` from shared types.

- [ ] **Step 4: Route chat turns**

In the main turn handling function in `apps/server/src/orchestrator/service.ts`, after transcript and target resolution:

```ts
const standardIntent = resolveStandardTurnIntent({
  sessionId: session.id,
  transcriptText: transcript.transcriptText,
  requestedTargetNodeId: input.targetNodeId ?? null,
  source: "voice",
  selectedNodeId: targetContext.selectedNodeId
});

if (standardIntent.intentKind === "chat") {
  return executeChatTurn({
    services,
    agentGateway,
    session,
    targetNode: targetContext.targetNode,
    treeNodes,
    sessionMessages,
    standardIntent
  });
}
```

Add `executeChatTurn()`:

```ts
async function executeChatTurn(input: {
  services: AppServices;
  agentGateway: AgentGateway;
  session: Session;
  targetNode: TreeNode | null;
  treeNodes: TreeNode[];
  sessionMessages: Message[];
  standardIntent: StandardTurnIntent;
}): Promise<{ task: null; operation: null }> {
  await createUserTranscriptMessage(
    input.services,
    input.session.id,
    null,
    input.standardIntent.userIntentText
  );

  const chatOutput = await input.agentGateway.runChatAssistant({
    userIntentText: input.standardIntent.userIntentText,
    chatType: input.standardIntent.chatType ?? "casual",
    sessionGoal: input.session.goal,
    conversationHistory: buildConversationHistory(input.sessionMessages),
    selectedNode: input.targetNode
      ? {
          nodeId: input.targetNode.id,
          displayName: input.targetNode.displayName,
          intentSummary: input.targetNode.intentSummary
        }
      : undefined,
    visibleNodeSummaries: input.treeNodes
      .filter((node) => !node.supersededAt)
      .slice(-12)
      .map((node) => ({
        nodeId: node.id,
        displayName: node.displayName,
        intentSummary: node.intentSummary,
        variationAxis: node.variationAxis ?? undefined
      }))
  });

  await input.services.repositories.messages.create({
    sessionId: input.session.id,
    taskId: null,
    role: "assistant",
    kind:
      input.standardIntent.chatType === "explain_node" ||
      input.standardIntent.chatType === "explain_canvas"
        ? "node_explanation"
        : "chat",
    content: chatOutput.assistantReply
  });

  return {
    task: null,
    operation: null
  };
}
```

- [ ] **Step 5: Route tree operations through standard intent**

In the same main turn function, before generation:

```ts
if (standardIntent.intentKind === "tree_op") {
  if (standardIntent.requestedAction === "undo") {
    const operation = await executeUndoSession({
      services,
      sessionId: session.id,
      operationId: null,
      taskId: null
    });
    return { task: null, operation };
  }

  if (standardIntent.requestedAction === "redo") {
    const operation = await executeRedoSession({
      services,
      sessionId: session.id
    });
    return { task: null, operation };
  }

  if (standardIntent.requestedAction === "delete") {
    const operation = await executeDeleteSession({
      services,
      sessionId: session.id,
      targetNodeId: standardIntent.targetNodeId
    });
    return { task: null, operation };
  }
}
```

If `executeDeleteSession()` has a different existing signature, use that signature and pass the same target node chosen by Orchestrator.

- [ ] **Step 6: Run focused API tests**

Run:

```powershell
corepack pnpm build:shared; corepack pnpm --filter @voice-industrial-design/server build; node --test --test-concurrency=1 tests/server/api.test.mjs
```

Expected: chat branch test passes and existing generation/tree operation tests remain passing.

- [ ] **Step 7: Commit**

```powershell
git add apps/server/src/orchestrator/service.ts apps/server/src/routes/sessions.ts tests/server/api.test.mjs
git commit -m "feat: route standard v1 intents"
```

---

### Task 5: Memory Summarizer Trigger After Six Dialogue Turns

**Files:**
- Modify: `apps/server/src/orchestrator/service.ts`
- Modify: `apps/server/src/repositories/types.ts`
- Modify: `apps/server/src/repositories/memory.ts`
- Modify: `apps/server/src/repositories/drizzle.ts`
- Test: `tests/server/api.test.mjs`

- [ ] **Step 1: Add failing memory trigger test**

Append to `tests/server/api.test.mjs`:

```js
test("memory summarizer runs only after more than six dialogue turns", async () => {
  let memoryCalls = 0;
  const app = await buildTestApp({
    agentGateway: {
      transcribeAudio: async (input) => ({
        transcriptText: input.transcriptText ?? "解释当前状态，不要生成"
      }),
      runBrainstormAssistant: async () => {
        throw new Error("brainstorm should not run for chat turns");
      },
      generateSketch: async () => {
        throw new Error("sketch should not run for chat turns");
      },
      runChatAssistant: async () => ({
        assistantReply: "只读回复。"
      }),
      runMemorySummarizer: async () => {
        memoryCalls += 1;
        return {
          stablePreferences: ["轻薄"],
          activeConstraints: [],
          rejectedDirections: [],
          openQuestions: [],
          shortSummary: "用户偏好轻薄。"
        };
      }
    }
  });

  const session = await createSession(app);

  for (let index = 0; index < 6; index += 1) {
    await app.inject({
      method: "POST",
      url: `/api/sessions/${session.id}/voice-turns`,
      headers: authHeaders(),
      payload: {
        transcriptText: `第 ${index + 1} 轮，只聊一下不要生成`
      }
    });
  }

  assert.equal(memoryCalls, 0);

  await app.inject({
    method: "POST",
    url: `/api/sessions/${session.id}/voice-turns`,
    headers: authHeaders(),
    payload: {
      transcriptText: "第 7 轮，只聊一下不要生成"
    }
  });

  assert.equal(memoryCalls, 1);

  const messages = await app.inject({
    method: "GET",
    url: `/api/sessions/${session.id}/messages`,
    headers: authHeaders()
  });

  assert.equal(
    JSON.parse(messages.body).messages.some(
      (message) => message.kind === "memory_summary"
    ),
    true
  );
});
```

- [ ] **Step 2: Run focused API tests and confirm failure**

Run:

```powershell
corepack pnpm build:shared; corepack pnpm --filter @voice-industrial-design/server build; node --test --test-concurrency=1 tests/server/api.test.mjs
```

Expected: fails because memory summarization is not triggered after six turns.

- [ ] **Step 3: Add repository helper for latest memory summary**

In `apps/server/src/repositories/types.ts`, add to `messages`:

```ts
getLatestMemorySummary(sessionId: string): Promise<Message | null>;
```

In `apps/server/src/repositories/memory.ts`, implement:

```ts
getLatestMemorySummary: async (sessionId) => {
  const messages = state.messages
    .filter(
      (message) =>
        message.sessionId === sessionId && message.kind === "memory_summary"
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return messages[0] ?? null;
}
```

In `apps/server/src/repositories/drizzle.ts`, implement:

```ts
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

  return rows[0] ? mapMessageRow(rows[0]) : null;
}
```

Ensure `and`, `eq`, and `desc` are imported from `drizzle-orm` if not already present.

- [ ] **Step 4: Add memory helpers in Orchestrator**

In `apps/server/src/orchestrator/service.ts`, add:

```ts
const MEMORY_TRIGGER_TURN_COUNT = 6;

function countDialogueTurns(messages: Message[]): number {
  const userMessages = messages.filter((message) => message.role === "user");
  return userMessages.length;
}

function selectRecentDialogueMessages(messages: Message[]): Message[] {
  return messages
    .filter(
      (message) =>
        message.kind === "transcript" ||
        message.kind === "intent" ||
        message.kind === "summary" ||
        message.kind === "chat" ||
        message.kind === "node_explanation"
    )
    .slice(-(MEMORY_TRIGGER_TURN_COUNT * 2));
}

function parseMemorySummaryMessage(
  message: Message | null
): MemorySummarizerOutput | undefined {
  if (!message) {
    return undefined;
  }

  try {
    return MemorySummarizerOutputSchema.parse(JSON.parse(message.content));
  } catch {
    return undefined;
  }
}
```

Import `MemorySummarizerOutputSchema` and `MemorySummarizerOutput`.

- [ ] **Step 5: Trigger memory after each completed turn**

In the main turn flow, after writing user/assistant messages for chat and generation summaries, call:

```ts
await maybeCreateConversationMemory({
  services,
  agentGateway,
  session,
  targetNode: targetContext.targetNode,
  messages: await services.repositories.messages.listBySessionId(session.id)
});
```

Add:

```ts
async function maybeCreateConversationMemory(input: {
  services: AppServices;
  agentGateway: AgentGateway;
  session: Session;
  targetNode: TreeNode | null;
  messages: Message[];
}): Promise<void> {
  if (countDialogueTurns(input.messages) <= MEMORY_TRIGGER_TURN_COUNT) {
    return;
  }

  const latestMemory =
    await input.services.repositories.messages.getLatestMemorySummary(
      input.session.id
    );
  const latestMemoryCreatedAt = latestMemory?.createdAt ?? "";
  const messagesAfterMemory = input.messages.filter(
    (message) => message.role === "user" && message.createdAt > latestMemoryCreatedAt
  );

  if (latestMemory && messagesAfterMemory.length <= MEMORY_TRIGGER_TURN_COUNT) {
    return;
  }

  const previousMemory = parseMemorySummaryMessage(latestMemory);
  const memory = await input.agentGateway.runMemorySummarizer({
    sessionGoal: input.session.goal,
    selectedNode: input.targetNode
      ? {
          nodeId: input.targetNode.id,
          intentSummary: input.targetNode.intentSummary
        }
      : undefined,
    recentMessages: selectRecentDialogueMessages(input.messages).map((message) => ({
      role: message.role,
      kind: message.kind,
      content: message.content
    })),
    previousMemory
  });

  await input.services.repositories.messages.create({
    sessionId: input.session.id,
    taskId: null,
    role: "system",
    kind: "memory_summary",
    content: JSON.stringify(memory)
  });
}
```

- [ ] **Step 6: Include memory in assistant inputs**

When building Brainstorm and Chat inputs, read latest memory:

```ts
const latestMemory =
  await services.repositories.messages.getLatestMemorySummary(session.id);
const conversationMemory = parseMemorySummaryMessage(latestMemory);
```

Pass `conversationMemory` to `runBrainstormAssistant()` input and `runChatAssistant()` input.

- [ ] **Step 7: Run focused API tests**

Run:

```powershell
corepack pnpm build:shared; corepack pnpm --filter @voice-industrial-design/server build; node --test --test-concurrency=1 tests/server/api.test.mjs
```

Expected: memory trigger test passes and existing tests pass.

- [ ] **Step 8: Commit**

```powershell
git add apps/server/src/orchestrator/service.ts apps/server/src/repositories/types.ts apps/server/src/repositories/memory.ts apps/server/src/repositories/drizzle.ts tests/server/api.test.mjs
git commit -m "feat: summarize memory after six dialogue turns"
```

---

### Task 6: Refresh Default Count From Previous Generated Group

**Files:**
- Modify: `apps/server/src/orchestrator/service.ts`
- Test: `tests/server/api.test.mjs`

- [ ] **Step 1: Add failing refresh default count test**

Append to `tests/server/api.test.mjs`:

```js
test("refresh without explicit count reuses the refreshed group size", async () => {
  const brainstormInputs = [];
  const app = await buildTestApp({
    agentGateway: {
      transcribeAudio: async (input) => ({
        transcriptText: input.transcriptText ?? "刷新这一组"
      }),
      runBrainstormAssistant: async (input) => {
        brainstormInputs.push(input);
        const count = input.constraints.defaultBranchCount;
        return {
          actionType: input.transcriptText.includes("刷新") ? "refresh" : "diverge",
          targetNodeId: input.selectedNodeId,
          branchCount: count,
          designIntentSummary: "生成方向",
          assistantReply: `生成 ${count} 个方向。`,
          confirmationRequired: false,
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
            variationAxis: `轴 ${index + 1}`,
            promptIntent: "白底工业设计草图"
          }))
        };
      },
      generateSketch: async (input) => ({
        imageId: `image-${input.brief.briefId}`,
        briefId: input.brief.briefId,
        imageUrl: `https://example.com/${input.brief.briefId}.png`,
        promptUsed: input.brief.promptIntent,
        negativePromptUsed: "photorealistic",
        visualSummary: "草图"
      }),
      runChatAssistant: async () => ({ assistantReply: "chat" }),
      runMemorySummarizer: async () => ({
        stablePreferences: [],
        activeConstraints: [],
        rejectedDirections: [],
        openQuestions: [],
        shortSummary: "无新增记忆。"
      })
    }
  });

  const session = await createSession(app);

  await app.inject({
    method: "POST",
    url: `/api/sessions/${session.id}/voice-turns`,
    headers: authHeaders(),
    payload: {
      transcriptText: "先生成四个方向"
    }
  });

  await app.inject({
    method: "POST",
    url: `/api/sessions/${session.id}/voice-turns`,
    headers: authHeaders(),
    payload: {
      transcriptText: "刷新这一组"
    }
  });

  assert.equal(brainstormInputs.at(-1).constraints.defaultBranchCount, 4);
});
```

- [ ] **Step 2: Run focused API tests and confirm failure**

Run:

```powershell
corepack pnpm build:shared; corepack pnpm --filter @voice-industrial-design/server build; node --test --test-concurrency=1 tests/server/api.test.mjs
```

Expected: fails because refresh still defaults to 3 or lacks `defaultBranchCount`.

- [ ] **Step 3: Add helper to resolve default branch count**

In `apps/server/src/orchestrator/service.ts`, add:

```ts
function resolveDefaultBranchCount(input: {
  actionType: "diverge" | "refresh";
  targetNodeId: string;
  treeNodes: TreeNode[];
  config: AppConfig;
}): number {
  if (input.actionType === "diverge") {
    return 3;
  }

  const latestGroupId = input.treeNodes
    .filter(
      (node) =>
        node.parentNodeId === input.targetNodeId &&
        node.childGroupId &&
        !node.supersededAt
    )
    .sort((a, b) => b.layerVersion - a.layerVersion)[0]?.childGroupId;

  if (!latestGroupId) {
    return 3;
  }

  const groupSize = input.treeNodes.filter(
    (node) => node.childGroupId === latestGroupId && !node.supersededAt
  ).length;

  return Math.min(Math.max(groupSize, 3), input.config.maxBranchCount);
}
```

- [ ] **Step 4: Pass defaultBranchCount into Brainstorm input**

In `buildBrainstormInput()`, add:

```ts
defaultBranchCount: resolveDefaultBranchCount({
  actionType: input.requestedAction ?? "diverge",
  targetNodeId: input.selectedNodeId,
  treeNodes: input.treeNodes,
  config: input.config
})
```

If `buildBrainstormInput()` does not currently receive `requestedAction`, add it to the function input object and pass `standardIntent.requestedAction`.

- [ ] **Step 5: Validate branchCount against defaultBranchCount**

Update `validateAssistantOutput()`:

```ts
if (
  !hasExplicitQuantity(input.transcriptText) &&
  output.branchCount !== brainstormInput.constraints.defaultBranchCount
) {
  throw new ApiError(
    422,
    "BRANCH_COUNT_MISMATCH",
    "Branch count must match the default count when the user did not request a quantity."
  );
}
```

Add helper:

```ts
function hasExplicitQuantity(text: string): boolean {
  return /[一二两三四五六七八九十0-9]+个|[一二两三四五六七八九十0-9]+种|[一二两三四五六七八九十0-9]+条/.test(text);
}
```

If the existing validation function does not have access to `brainstormInput`, update its signature rather than re-parsing raw text elsewhere.

- [ ] **Step 6: Run focused API tests**

Run:

```powershell
corepack pnpm build:shared; corepack pnpm --filter @voice-industrial-design/server build; node --test --test-concurrency=1 tests/server/api.test.mjs
```

Expected: refresh default count test passes and existing generation tests pass.

- [ ] **Step 7: Commit**

```powershell
git add apps/server/src/orchestrator/service.ts tests/server/api.test.mjs
git commit -m "feat: reuse refreshed group size by default"
```

---

### Task 7: Remove Approval-Style Main Path

**Files:**
- Modify: `packages/shared/src/schemas.ts`
- Modify: `apps/server/src/repositories/types.ts`
- Modify: `apps/server/src/orchestrator/service.ts`
- Modify: `apps/server/src/repositories/memory.ts`
- Modify: `apps/server/src/repositories/drizzle.ts`
- Test: `tests/server/api.test.mjs`

- [ ] **Step 1: Add failing direct execution test**

Add or update an API test:

```js
test("generation turn uses direct execution without confirmation state", async () => {
  const app = await buildTestApp();
  const session = await createSession(app);

  const response = await app.inject({
    method: "POST",
    url: `/api/sessions/${session.id}/voice-turns`,
    headers: authHeaders(),
    payload: {
      transcriptText: "先发散三个方向"
    }
  });

  assert.equal(response.statusCode, 202);
  const task = JSON.parse(response.body).task;
  assert.equal(task.confirmationRequired, undefined);
  assert.equal(task.confirmationStatus, undefined);
  assert.equal(task.rewrittenIntentForConfirmation, undefined);
});
```

- [ ] **Step 2: Run focused API tests and confirm failure**

Run:

```powershell
corepack pnpm build:shared; corepack pnpm --filter @voice-industrial-design/server build; node --test --test-concurrency=1 tests/server/api.test.mjs
```

Expected: fails because task schemas or route payloads still expose confirmation fields.

- [ ] **Step 3: Remove confirmation from shared task schema**

In `packages/shared/src/schemas.ts`, remove from `GenerationTaskSchema`:

```ts
confirmationRequired: z.boolean().default(false),
confirmationStatus: ConfirmationStatusSchema.default("not_required"),
rewrittenIntentForConfirmation: z.string().min(1).nullable().default(null),
```

Keep `CONFIRMATION_STATUS` constants only if other tests still need backward-compatible parsing; otherwise remove unused imports.

- [ ] **Step 4: Remove confirmation from repository create/update types**

In `apps/server/src/repositories/types.ts`, remove from `CreateGenerationTaskInput`:

```ts
confirmationRequired: boolean;
rewrittenIntentForConfirmation: string | null;
```

Remove `UpdateTaskConfirmationInput`, `updateConfirmation()`, and `resolveTaskStateAfterConfirmation()` if no route still references them.

- [ ] **Step 5: Update repositories**

In `apps/server/src/repositories/memory.ts` and `apps/server/src/repositories/drizzle.ts`, stop reading/writing confirmation fields in domain objects returned to API callers. If database columns still exist, leave them at fixed values internally:

```ts
confirmationRequired: false
confirmationStatus: "not_required"
rewrittenIntentForConfirmation: null
```

Do not expose those properties in mapped `GenerationTask` once the shared schema no longer contains them.

- [ ] **Step 6: Remove confirm/cancel route usage**

In `apps/server/src/routes/tasks.ts` and `apps/server/src/orchestrator/service.ts`, remove or return `410 Gone` for confirm/cancel endpoints if they exist:

```ts
throw new ApiError(
  410,
  "CONFIRMATION_FLOW_REMOVED",
  "v1 uses direct execution and does not support confirmation decisions."
);
```

- [ ] **Step 7: Run API and server tests**

Run:

```powershell
corepack pnpm test:server
```

Expected: server tests pass after updating any old confirmation tests to assert direct execution.

- [ ] **Step 8: Commit**

```powershell
git add packages/shared/src/schemas.ts apps/server/src/repositories/types.ts apps/server/src/repositories/memory.ts apps/server/src/repositories/drizzle.ts apps/server/src/orchestrator/service.ts apps/server/src/routes/tasks.ts tests/server/api.test.mjs
git commit -m "refactor: remove approval-style generation path"
```

---

### Task 8: Full V1 Verification Pass

**Files:**
- Modify: `tests/server/api.test.mjs`
- Modify: `tests/server/siliconflow-gateway.test.mjs`
- Modify: `tests/workspace/shared-schema.test.mjs`

- [ ] **Step 1: Add final acceptance tests**

Ensure tests cover:

```js
test("v1 acceptance: chat does not create generation tasks", async () => {
  // Assert chat writes user + assistant messages and leaves tasks/nodes unchanged.
});

test("v1 acceptance: delete undo redo never call brainstorm or sketch", async () => {
  // Assert deterministic tree operations execute without agent calls.
});

test("v1 acceptance: brainstorm receives memory after summarization", async () => {
  // Create seven turns, then a generation turn; assert input.conversationMemory.shortSummary exists.
});

test("v1 acceptance: prompt builder records promptUsed while preserving semantic brief", async () => {
  // Assert branch_tasks.brief_payload retains displayName/intentSummary/userNeedResponse/inspirationHints.
});
```

Write each test with the concrete helpers already used in `api.test.mjs`; do not introduce a new test harness.

- [ ] **Step 2: Run complete verification**

Run:

```powershell
corepack pnpm test:server
node --test tests/workspace/shared-schema.test.mjs
```

Expected:

```text
fail 0
```

for both commands.

- [ ] **Step 3: Review v1 docs against implementation**

Check these exact docs:

```powershell
rg -n "生图助理|审批|确认|近期消息过长|上下文预算不足|branchCount.: 3" docs/superpowers/specs/v1
```

Expected: no old conflicting references. The only acceptable match is text that explicitly says `diverge` defaults to 3 while `refresh` uses `constraints.defaultBranchCount`.

- [ ] **Step 4: Commit**

```powershell
git add tests/server/api.test.mjs tests/server/siliconflow-gateway.test.mjs tests/workspace/shared-schema.test.mjs docs/superpowers/specs/v1
git commit -m "test: cover v1 agent acceptance flows"
```

---

## Self-Review

**Spec coverage:**
- Standard intent routing: Task 4.
- Direct execution without approval cards: Task 7.
- Brainstorm semantic brief retention: Tasks 1, 6, 8.
- Deterministic Prompt Builder and image-only Sketch Generation Gateway: Tasks 2, 3, 8.
- Real LLM Chat Assistant: Tasks 2, 4, 8.
- Memory Summarizer after more than 6 dialogue turns: Tasks 1, 2, 5, 8.
- `refresh` default count from refreshed group: Task 6.
- Persistence of `userNeedResponse` and `inspirationHints`: already present in current schema/DB; covered in Tasks 1 and 8.

**Placeholder scan:** No task uses placeholder language. Where existing test helper names may differ, the plan instructs preserving the exact assertions and adapting only to local helper names.

**Type consistency:** The plan uses `ConversationMemorySchema.shortSummary`, `constraints.defaultBranchCount`, `runChatAssistant()`, and `runMemorySummarizer()` consistently across shared schemas, gateway types, SiliconFlow implementation, mock implementation, and orchestrator inputs.
