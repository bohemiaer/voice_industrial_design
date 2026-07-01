import {
  BrainstormAssistantOutputSchema,
  ChatAssistantOutputSchema,
  MemorySummarizerOutputSchema,
  SketchGenerationOutputSchema,
  type BrainstormAssistantInput,
  type BrainstormAssistantOutput,
  type ChatAssistantInput,
  type ChatAssistantOutput,
  type MemorySummarizerInput,
  type MemorySummarizerOutput,
  type SketchGenerationInput,
  type SketchGenerationOutput
} from "@voice-industrial-design/shared";

import type { AppConfig } from "../config.js";
import { recordAgentObservation } from "../observability/agent-observation.js";
import {
  AgentGatewayError,
  type AgentGateway,
  type BrainstormAgentInput,
  type ChatAssistantRequest,
  type MemorySummarizerRequest,
  type RuntimeApiKeys,
  type SketchGenerationRequest,
  type TranscribeAudioInput,
  type TranscribeAudioOutput
} from "./types.js";
import {
  buildSketchPromptSet
} from "./sketch-prompt-builder.js";

const REQUEST_TIMEOUT_MS = 120_000;
const MAX_ATTEMPTS = 2;
const SKETCH_IMAGE_SIZE = "768x512";

type FetchLike = typeof fetch;

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

interface ImageGenerationResponse {
  images?: Array<{
    url?: string;
  }>;
  data?: Array<{
    url?: string;
  }>;
  seed?: string | number;
}

export class SiliconFlowAgentGateway implements AgentGateway {
  constructor(
    private readonly config: AppConfig,
    private readonly fetchImpl: FetchLike = fetch
  ) {}

  async transcribeAudio(
    input: TranscribeAudioInput
  ): Promise<TranscribeAudioOutput> {
    if (input.transcriptText) {
      return {
        transcriptText: input.transcriptText
      };
    }

    const model = this.requireConfig(
      this.config.siliconFlowAsrModel,
      "SILICONFLOW_ASR_MODEL"
    );

    if (!input.audio) {
      throw new AgentGatewayError(
        "Audio is required for SiliconFlow ASR.",
        "ASR_AUDIO_REQUIRED"
      );
    }

    const formData = new FormData();
    formData.append("model", model);
    const audioBytes = new Uint8Array(input.audio);
    const forwardedMimeType = input.mimeType ?? "audio/webm";

    formData.append(
      "file",
      new Blob([audioBytes], {
        type: forwardedMimeType
      }),
      resolveAudioFilename(forwardedMimeType)
    );

    const response = await this.requestJson<{ text?: string }>(
      "/audio/transcriptions",
      {
        method: "POST",
        headers: this.authHeaders(input.runtimeApiKeys),
        body: formData
      }
    );

    if (typeof response.text !== "string") {
      throw new AgentGatewayError(
        "SiliconFlow ASR response did not include text.",
        "SILICONFLOW_RESPONSE_INVALID"
      );
    }

    return {
      transcriptText: response.text
    };
  }

  async runBrainstormAssistant(
    input: BrainstormAgentInput
  ): Promise<BrainstormAssistantOutput> {
    const canUseDeepSeekDirectly =
      this.config.deepSeekApiKey &&
      this.config.deepSeekBaseUrl &&
      this.config.deepSeekBrainstormModel;

    if (!canUseDeepSeekDirectly) {
      return this.runSiliconFlowBrainstormAssistant(input);
    }

    const model = this.requireConfig(
      this.config.deepSeekBrainstormModel,
      "DEEPSEEK_BRAINSTORM_MODEL"
    );

    const response = await this.requestDeepSeekJson<ChatCompletionResponse>(
      "/chat/completions",
      {
        method: "POST",
        headers: this.deepSeekJsonHeaders(),
        body: JSON.stringify({
          model,
          messages: buildBrainstormMessages(input),
          response_format: {
            type: "json_object"
          },
          thinking: {
            type: "disabled"
          }
        })
      }
    );

    return this.parseBrainstormResponse(
      response,
      input,
      "DeepSeek chat response did not include message content.",
      "DeepSeek chat response did not match the assistant schema.",
      "DEEPSEEK_RESPONSE_INVALID"
    );
  }

  private async runSiliconFlowBrainstormAssistant(
    input: BrainstormAgentInput
  ): Promise<BrainstormAssistantOutput> {
    const model = this.requireConfig(
      this.config.siliconFlowBrainstormModel,
      "SILICONFLOW_BRAINSTORM_MODEL"
    );

    const response = await this.requestJson<ChatCompletionResponse>(
      "/chat/completions",
      {
        method: "POST",
        headers: this.jsonHeaders(input.runtimeApiKeys),
        body: JSON.stringify({
          model,
          messages: buildBrainstormMessages(input),
          response_format: {
            type: "json_object"
          },
          enable_thinking: false
        })
      }
    );

    return this.parseBrainstormResponse(
      response,
      input,
      "SiliconFlow chat response did not include message content.",
      "SiliconFlow chat response did not match the assistant schema.",
      "SILICONFLOW_RESPONSE_INVALID"
    );
  }

  private parseBrainstormResponse(
    response: ChatCompletionResponse,
    input: BrainstormAssistantInput,
    missingMessage: string,
    invalidSchemaMessage: string,
    errorCode: string
  ): BrainstormAssistantOutput {
    const content = response.choices?.[0]?.message?.content;

    if (!content) {
      throw new AgentGatewayError(
        missingMessage,
        errorCode
      );
    }

    try {
      return BrainstormAssistantOutputSchema.parse(
        normalizeBrainstormAssistantOutput(parseAssistantJson(content), input)
      );
    } catch (error) {
      throw new AgentGatewayError(
        invalidSchemaMessage,
        errorCode,
        error
      );
    }
  }

  async runChatAssistant(
    input: ChatAssistantRequest
  ): Promise<ChatAssistantOutput> {
    const hasRuntimeApiKey = Boolean(normalizeApiKey(input.runtimeApiKeys?.siliconFlowApiKey));

    const canUseSiliconFlow =
      (hasRuntimeApiKey || Boolean(this.config.siliconFlowApiKey?.trim())) &&
      Boolean(this.config.siliconFlowChatModel?.trim());

    if (canUseSiliconFlow) {
      return this.runSiliconFlowChatAssistant(input);
    }

    const response = await this.requestDeepSeekChatCompletion(
      buildChatAssistantMessages(input)
    );
    const dcontent = response.choices?.[0]?.message?.content;

    if (!dcontent) {
      throw new AgentGatewayError(
        "DeepSeek chat response did not include message content.",
        "DEEPSEEK_CHAT_RESPONSE_INVALID"
      );
    }

    try {
      return ChatAssistantOutputSchema.parse(parseAssistantJson(dcontent));
    } catch (error) {
      throw new AgentGatewayError(
        "DeepSeek chat response did not match the Chat Assistant schema.",
        "DEEPSEEK_CHAT_RESPONSE_INVALID",
        error
      );
    }
  }

  private async runSiliconFlowChatAssistant(
    input: ChatAssistantRequest
  ): Promise<ChatAssistantOutput> {
    const model = this.requireConfig(
      this.config.siliconFlowChatModel,
      "SILICONFLOW_CHAT_MODEL"
    );

    const response = await this.requestJson<ChatCompletionResponse>(
      "/chat/completions",
      {
        method: "POST",
        headers: this.jsonHeaders(input.runtimeApiKeys),
        body: JSON.stringify({
          model,
          messages: buildChatAssistantMessages(input),
          response_format: {
            type: "json_object"
          }
        })
      }
    );

    const content = response.choices?.[0]?.message?.content;

    if (!content) {
      throw new AgentGatewayError(
        "SiliconFlow chat response did not include message content.",
        "SILICONFLOW_RESPONSE_INVALID"
      );
    }

    try {
      return ChatAssistantOutputSchema.parse(parseAssistantJson(content));
    } catch (error) {
      throw new AgentGatewayError(
        "SiliconFlow chat response did not match the Chat Assistant schema.",
        "SILICONFLOW_RESPONSE_INVALID",
        error
      );
    }
  }

  async runMemorySummarizer(
    input: MemorySummarizerRequest
  ): Promise<MemorySummarizerOutput> {
    const hasRuntimeApiKey = Boolean(normalizeApiKey(input.runtimeApiKeys?.siliconFlowApiKey));

    const canUseSiliconFlow =
      (hasRuntimeApiKey || Boolean(this.config.siliconFlowApiKey?.trim())) &&
      Boolean(this.config.siliconFlowChatModel?.trim());

    if (canUseSiliconFlow) {
      return this.runSiliconFlowMemorySummarizer(input);
    }

    const response = await this.requestDeepSeekChatCompletion(
      buildMemorySummarizerMessages(input)
    );
    const dcontent = response.choices?.[0]?.message?.content;

    if (!dcontent) {
      throw new AgentGatewayError(
        "DeepSeek memory response did not include message content.",
        "DEEPSEEK_MEMORY_RESPONSE_INVALID"
      );
    }

    try {
      return MemorySummarizerOutputSchema.parse(parseAssistantJson(dcontent));
    } catch (error) {
      throw new AgentGatewayError(
        "DeepSeek memory response did not match the Memory Summarizer schema.",
        "DEEPSEEK_MEMORY_RESPONSE_INVALID",
        error
      );
    }
  }

  private async runSiliconFlowMemorySummarizer(
    input: MemorySummarizerRequest
  ): Promise<MemorySummarizerOutput> {
    const model = this.requireConfig(
      this.config.siliconFlowChatModel,
      "SILICONFLOW_CHAT_MODEL"
    );

    const response = await this.requestJson<ChatCompletionResponse>(
      "/chat/completions",
      {
        method: "POST",
        headers: this.jsonHeaders(input.runtimeApiKeys),
        body: JSON.stringify({
          model,
          messages: buildMemorySummarizerMessages(input),
          response_format: {
            type: "json_object"
          }
        })
      }
    );

    const content = response.choices?.[0]?.message?.content;

    if (!content) {
      throw new AgentGatewayError(
        "SiliconFlow memory response did not include message content.",
        "SILICONFLOW_RESPONSE_INVALID"
      );
    }

    try {
      return MemorySummarizerOutputSchema.parse(parseAssistantJson(content));
    } catch (error) {
      throw new AgentGatewayError(
        "SiliconFlow memory response did not match the Memory Summarizer schema.",
        "SILICONFLOW_RESPONSE_INVALID",
        error
      );
    }
  }

  async generateSketch(
    input: SketchGenerationRequest
  ): Promise<SketchGenerationOutput> {
    const model = this.requireConfig(
      this.config.siliconFlowImageModel,
      "SILICONFLOW_IMAGE_MODEL"
    );
    const promptSet = buildSketchPromptSet(input);
    const imageRequest = {
      model,
      prompt: promptSet.prompt,
      negative_prompt: promptSet.negativePrompt,
      image_size: SKETCH_IMAGE_SIZE,
      batch_size: 1
    };
    recordAgentObservation("image_assistant.input", {
      model,
      briefId: input.brief.briefId,
      sketchInput: input,
      promptSet,
      imageRequest
    });

    const response = await this.requestJson<ImageGenerationResponse>(
      "/images/generations",
      {
        method: "POST",
        headers: this.jsonHeaders(input.runtimeApiKeys),
        body: JSON.stringify(imageRequest)
      }
    );

    const imageUrl = response.images?.[0]?.url ?? response.data?.[0]?.url;

    if (!imageUrl) {
      throw new AgentGatewayError(
        "SiliconFlow image response did not include an image URL.",
        "SILICONFLOW_RESPONSE_INVALID"
      );
    }

    const sketchOutput = SketchGenerationOutputSchema.parse({
      imageId: `siliconflow-${response.seed ?? input.brief.briefId}`,
      briefId: input.brief.briefId,
      imageUrl,
      promptUsed: promptSet.prompt,
      negativePromptUsed: promptSet.negativePrompt,
      visualSummary: promptSet.visualSummary
    });
    recordAgentObservation("image_assistant.output", {
      model,
      briefId: input.brief.briefId,
      sketchOutput
    });

    return sketchOutput;
  }

  private async requestJson<T>(
    path: string,
    init: RequestInit,
    attempt = 1
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await this.fetchImpl(this.endpoint(path), {
        ...init,
        signal: controller.signal
      });

      if (!response.ok) {
        if (attempt < MAX_ATTEMPTS && shouldRetryStatus(response.status)) {
          await delay(0);
          return this.requestJson<T>(path, init, attempt + 1);
        }

        throw new AgentGatewayError(
          `SiliconFlow request failed with HTTP ${response.status}.`,
          "SILICONFLOW_REQUEST_FAILED",
          await readErrorBody(response)
        );
      }

      try {
        return (await response.json()) as T;
      } catch (error) {
        throw new AgentGatewayError(
          "SiliconFlow response was not valid JSON.",
          "SILICONFLOW_RESPONSE_INVALID",
          error
        );
      }
    } catch (error) {
      if (error instanceof AgentGatewayError) {
        throw error;
      }

      if (attempt < MAX_ATTEMPTS) {
        await delay(0);
        return this.requestJson<T>(path, init, attempt + 1);
      }

      throw new AgentGatewayError(
        "SiliconFlow request failed before a response was received.",
        "SILICONFLOW_REQUEST_FAILED",
        error
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async requestDeepSeekJson<T>(
    path: string,
    init: RequestInit,
    attempt = 1
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await this.fetchImpl(this.deepSeekEndpoint(path), {
        ...init,
        signal: controller.signal
      });

      if (!response.ok) {
        if (attempt < MAX_ATTEMPTS && shouldRetryStatus(response.status)) {
          await delay(0);
          return this.requestDeepSeekJson<T>(path, init, attempt + 1);
        }

        throw new AgentGatewayError(
          `DeepSeek request failed with HTTP ${response.status}.`,
          "DEEPSEEK_REQUEST_FAILED",
          await readErrorBody(response)
        );
      }

      try {
        return (await response.json()) as T;
      } catch (error) {
        throw new AgentGatewayError(
          "DeepSeek response was not valid JSON.",
          "DEEPSEEK_RESPONSE_INVALID",
          error
        );
      }
    } catch (error) {
      if (error instanceof AgentGatewayError) {
        throw error;
      }

      if (attempt < MAX_ATTEMPTS) {
        await delay(0);
        return this.requestDeepSeekJson<T>(path, init, attempt + 1);
      }

      throw new AgentGatewayError(
        "DeepSeek request failed before a response was received.",
        "DEEPSEEK_REQUEST_FAILED",
        error
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async requestDeepSeekChatCompletion(
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>
  ): Promise<ChatCompletionResponse> {
    const model = this.requireConfig(
      this.config.deepSeekBrainstormModel,
      "DEEPSEEK_BRAINSTORM_MODEL"
    );

    return this.requestDeepSeekJson<ChatCompletionResponse>(
      "/chat/completions",
      {
        method: "POST",
        headers: this.deepSeekJsonHeaders(),
        body: JSON.stringify({
          model,
          messages,
          response_format: {
            type: "json_object"
          },
          thinking: {
            type: "disabled"
          }
        })
      }
    );
  }

  private endpoint(path: string): string {
    const baseUrl = this.requireConfig(
      this.config.siliconFlowBaseUrl,
      "SILICONFLOW_BASE_URL"
    );

    return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
  }

  private deepSeekEndpoint(path: string): string {
    const baseUrl = this.requireConfig(
      this.config.deepSeekBaseUrl,
      "DEEPSEEK_BASE_URL"
    );

    return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
  }

  private authHeaders(runtimeApiKeys?: RuntimeApiKeys): Record<string, string> {
    const runtimeApiKey = normalizeApiKey(runtimeApiKeys?.siliconFlowApiKey);
    const configuredApiKey = normalizeApiKey(this.config.siliconFlowApiKey);

    return {
      authorization: `Bearer ${this.requireConfig(
        runtimeApiKey || configuredApiKey,
        "SILICONFLOW_API_KEY"
      )}`
    };
  }

  private jsonHeaders(runtimeApiKeys?: RuntimeApiKeys): Record<string, string> {
    return {
      ...this.authHeaders(runtimeApiKeys),
      "content-type": "application/json"
    };
  }

  private deepSeekJsonHeaders(): Record<string, string> {
    return {
      authorization: `Bearer ${this.requireConfig(
        this.config.deepSeekApiKey,
        "DEEPSEEK_API_KEY"
      )}`,
      "content-type": "application/json"
    };
  }

  private requireConfig(value: string | null, key: string): string {
    if (!value) {
      const code = key.startsWith("DEEPSEEK_")
        ? "DEEPSEEK_CONFIG_MISSING"
        : "SILICONFLOW_CONFIG_MISSING";
      throw new AgentGatewayError(
        `${key} is required for ${key.startsWith("DEEPSEEK_") ? "DeepSeek" : "SiliconFlow"} provider.`,
        code
      );
    }

    return value;
  }
}

function resolveAudioFilename(mimeType: string): string {
  if (mimeType === "audio/wav" || mimeType === "audio/x-wav") {
    return "recording.wav";
  }

  if (mimeType === "audio/mp3" || mimeType === "audio/mpeg") {
    return "recording.mp3";
  }

  if (mimeType === "audio/mp4" || mimeType === "audio/m4a" || mimeType === "audio/x-m4a") {
    return "recording.m4a";
  }

  if (mimeType === "audio/ogg") {
    return "recording.ogg";
  }

  return "recording.webm";
}

function normalizeApiKey(value: string | null | undefined): string | null {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/^Bearer\s+/i, "").trim();
}

function shouldRetryStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function readErrorBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return response.statusText;
  }
}

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
      content: [
        "只读对话输入：",
        JSON.stringify(input)
      ].join("\n")
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
      content: [
        "记忆摘要输入：",
        JSON.stringify(input)
      ].join("\n")
    }
  ];
}

function buildBrainstormSystemPrompt(): string {
  return [
    "你是工业设计早期概念发散助手。",
    "只能输出 JSON object，不要输出 Markdown、解释文本或代码块。",
    "根据用户语音、当前节点、祖先和同层上下文，决定 diverge 或 refresh。",
    "后续每一轮都必须同时保留初始设计目标、父节点上下文和祖先链路，不能偏离初始设计目标，也不能只根据最新一句语音把方向带偏。",
    "初始设计目标是本轮所有子方向都必须继承的主约束；如果用户提出的新修饰与初始目标冲突，应在不偏离主目标的前提下吸收调整。",
    "assistantReply 必须先复述用户需求，再说明现在会采取的具体动作。",
    "designIntentSummary 只描述本轮生成意图，不要改写用户首轮 root 原始需求。",
    "默认直接执行，不要输出确认或审批字段。",
    "targetNodeId 必须等于输入里的 selectedNodeId，除非输入明确要求操作另一个节点。",
    "若用户没有明确说数量，则 branchCount 默认输出 3。",
    "branchCount 必须在 constraints.minBranchCount 和 constraints.maxBranchCount 之间，directionBriefs.length 必须等于 branchCount。",
    "每个 directionBrief 必须输出 suggestedFollowups，且必须严格为 3 条短建议。",
    "suggestedFollowups 是节点下方的推荐发散方向，必须围绕该节点自身语义，不要写泛化教程。",
    "必须严格输出下面这些 camelCase 字段：",
    JSON.stringify({
      actionType: "diverge | refresh",
      targetNodeId: "string",
      branchCount: 3,
      designIntentSummary: "string",
      assistantReply: "string",
      promptHints: ["string"],
      directionBriefs: [
        {
          briefId: "brief-1",
          targetParentNodeId: "string",
          label: "string",
          displayName: "32 字以内",
          intentSummary: "string",
          formLanguage: ["string"],
          userNeedResponse: ["string"],
          inspirationHints: ["string"],
          suggestedFollowups: ["string", "string", "string"],
          variationAxis: "string",
          promptIntent: "string"
        }
      ]
    })
  ].join("\n");
}

function buildBrainstormMessages(
  input: BrainstormAssistantInput
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  return [
    {
      role: "system",
      content: buildBrainstormSystemPrompt()
    },
    {
      role: "user",
      content: [
        "示例输入 1：",
        JSON.stringify({
          sessionGoal: "为桌面风扇探索更轻薄的办公场景方向",
          transcriptText: "围绕这个目标先发散三个方向",
          selectedNodeId: "session-root",
          selectedNodeSummary: {
            publicNodeNumber: 1,
            displayName: "桌面风扇",
            label: "root",
            intentSummary: "为桌面风扇探索更轻薄的办公场景方向",
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
        })
      ].join("\n")
    },
    {
      role: "assistant",
      content: JSON.stringify({
        actionType: "diverge",
        targetNodeId: "session-root",
        branchCount: 3,
        designIntentSummary: "围绕桌面风扇的首轮需求生成三个可比较方向。",
        assistantReply: "我理解你要先围绕当前总需求做首轮发散，现在会直接生成三个方向。",
        promptHints: ["白底线稿", "早期工业设计草图"],
        directionBriefs: [
          {
            briefId: "brief-1",
            targetParentNodeId: "session-root",
            label: "轻薄悬浮",
            displayName: "轻薄悬浮感",
            intentSummary: "压缩体量并强化悬浮底座，降低办公桌压迫感。",
            formLanguage: ["轻薄", "悬浮"],
            userNeedResponse: ["减轻桌面存在感"],
            inspirationHints: ["办公设备", "消费电子"],
            suggestedFollowups: ["强化悬浮底座比例", "让机身再薄一点", "探索更低压迫的桌面姿态"],
            variationAxis: "体量感",
            promptIntent: "白底工业设计草图，表现轻薄悬浮的桌面风扇方向。"
          },
          {
            briefId: "brief-2",
            targetParentNodeId: "session-root",
            label: "柔和包裹",
            displayName: "柔和包裹感",
            intentSummary: "边缘更圆润，增强亲和感并弱化机械感。",
            formLanguage: ["圆润", "包裹"],
            userNeedResponse: ["更适合办公环境"],
            inspirationHints: ["家居产品"],
            suggestedFollowups: ["换成更温和的家居 CMF", "强化连续曲面包裹", "让边缘更亲和柔软"],
            variationAxis: "边界处理",
            promptIntent: "白底工业设计草图，表现柔和包裹的桌面风扇方向。"
          },
          {
            briefId: "brief-3",
            targetParentNodeId: "session-root",
            label: "模块秩序",
            displayName: "模块秩序感",
            intentSummary: "通过分件关系建立理性、专业的办公设备气质。",
            formLanguage: ["模块化", "秩序"],
            userNeedResponse: ["提升专业感"],
            inspirationHints: ["办公电器"],
            suggestedFollowups: ["细化模块分区比例", "强化专业设备秩序", "探索更清晰的功能边界"],
            variationAxis: "结构表达",
            promptIntent: "白底工业设计草图，表现模块秩序的桌面风扇方向。"
          }
        ]
      })
    },
    {
      role: "user",
      content: [
        "示例输入 2：",
        JSON.stringify({
          sessionGoal: "为桌面风扇探索更轻薄的办公场景方向",
          transcriptText: "把第二个方向刚才那组结果刷新成三个更柔和的版本",
          selectedNodeId: "node-2",
          selectedNodeSummary: {
            publicNodeNumber: 2,
            displayName: "柔和包裹感",
            label: "方向 2",
            intentSummary: "边缘更圆润，增强亲和感并弱化机械感。",
            formLanguage: ["圆润", "包裹"],
            userNeedResponse: ["更适合办公环境"],
            inspirationHints: ["家居产品"]
          },
          ancestorPath: [
            {
              nodeId: "session-root",
              label: "root",
              intentSummary: "为桌面风扇探索更轻薄的办公场景方向"
            }
          ],
          siblingSummaries: [],
          constraints: {
            minBranchCount: 3,
            maxBranchCount: 4,
            productDomain: "industrial_design",
            sketchStage: "early",
            inputMode: "voice_only"
          }
        })
      ].join("\n")
    },
    {
      role: "assistant",
      content: JSON.stringify({
        actionType: "refresh",
        targetNodeId: "node-2",
        branchCount: 3,
        designIntentSummary: "围绕柔和包裹感刷新出三个更柔和的新版本。",
        assistantReply: "我理解你要把第二个方向下最近一组结果整体刷新，现在会直接生成三个更柔和的新版本。",
        promptHints: ["白底线稿", "对比子方向"],
        directionBriefs: [
          {
            briefId: "brief-1",
            targetParentNodeId: "node-2",
            label: "圆角外壳",
            displayName: "圆角外壳",
            intentSummary: "强化整体圆角外轮廓，让产品更像家居物件。",
            formLanguage: ["圆角", "一体"],
            userNeedResponse: ["更亲和"],
            inspirationHints: ["家电"],
            suggestedFollowups: ["进一步圆润外轮廓", "换成更柔和 CMF", "弱化工具感"],
            variationAxis: "外轮廓",
            promptIntent: "白底工业设计草图，表现更圆角的一体式子方向。"
          },
          {
            briefId: "brief-2",
            targetParentNodeId: "node-2",
            label: "织物包裹",
            displayName: "织物包裹感",
            intentSummary: "通过软质包裹语言增加温和与静音联想。",
            formLanguage: ["软包", "温和"],
            userNeedResponse: ["减轻冷硬感"],
            inspirationHints: ["家居音箱"],
            suggestedFollowups: ["强化织物包覆感", "探索低对比接缝", "让触感更温和"],
            variationAxis: "材质联想",
            promptIntent: "白底工业设计草图，表现具有织物包裹感的子方向。"
          },
          {
            briefId: "brief-3",
            targetParentNodeId: "node-2",
            label: "内收曲面",
            displayName: "内收曲面",
            intentSummary: "用内收曲面降低视觉体量并保持柔和边界。",
            formLanguage: ["内收", "曲面"],
            userNeedResponse: ["更轻盈"],
            inspirationHints: ["桌面设备"],
            suggestedFollowups: ["继续内收侧面轮廓", "压低底座视觉高度", "强化轻盈曲面过渡"],
            variationAxis: "体量收束",
            promptIntent: "白底工业设计草图，表现内收曲面的柔和子方向。"
          }
        ]
      })
    },
    {
      role: "user",
      content: buildCurrentTurnPrompt(input)
    }
  ];
}

function buildCurrentTurnPrompt(input: BrainstormAssistantInput): string {
  const ancestorSummary =
    input.ancestorPath.length > 0
      ? input.ancestorPath
          .map((ancestor) => `${ancestor.label}：${ancestor.intentSummary}`)
          .join(" -> ")
      : "无";
  const siblingSummary =
    input.siblingSummaries.length > 0
      ? input.siblingSummaries
          .map((sibling) => `${sibling.label}：${sibling.intentSummary}`)
          .join(" | ")
      : "无";
  const conversationSummary =
    input.conversationHistory.length > 0
      ? input.conversationHistory
          .map((item) => `${item.role === "user" ? "用户" : "助手"}(${item.kind})：${item.content}`)
          .join(" | ")
      : "无";

  return [
    "当前回合固定约束：",
    `- 初始设计目标：${input.sessionGoal}`,
    `- 当前父节点/目标节点：${input.selectedNodeSummary.displayName}（${input.selectedNodeSummary.intentSummary}）`,
    `- 祖先链路：${ancestorSummary}`,
    `- 最近对话历史：${conversationSummary}`,
    `- 同层参考：${siblingSummary}`,
    "- 输出的新节点必须继承初始设计目标，并延续父节点上下文后再做本轮变化。",
    "结构化输入 JSON：",
    JSON.stringify(input)
  ].join("\n");
}

function parseAssistantJson(content: string): unknown {
  const direct = tryParseJson(content);

  if (direct !== undefined) {
    return direct;
  }

  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];

  if (fenced) {
    const parsedFenced = tryParseJson(fenced);

    if (parsedFenced !== undefined) {
      return parsedFenced;
    }
  }

  const firstBrace = content.indexOf("{");
  const lastBrace = content.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const parsedSlice = tryParseJson(content.slice(firstBrace, lastBrace + 1));

    if (parsedSlice !== undefined) {
      return parsedSlice;
    }
  }

  throw new Error("Assistant output was not valid JSON.");
}

function tryParseJson(content: string): unknown | undefined {
  try {
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}

function normalizeBrainstormAssistantOutput(
  value: unknown,
  input: BrainstormAssistantInput
): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const normalized = { ...value } as {
    actionType?: unknown;
    targetNodeId?: unknown;
    branchCount?: unknown;
    directionBriefs?: unknown;
    assistantReply?: unknown;
    designIntentSummary?: unknown;
    promptHints?: unknown;
  };

  if (typeof normalized.actionType !== "string") {
    normalized.actionType = inferActionType(input.transcriptText, input);
  }

  if (typeof normalized.targetNodeId !== "string") {
    normalized.targetNodeId = input.selectedNodeId;
  }

  if (
    typeof normalized.assistantReply !== "string" &&
    typeof normalized.designIntentSummary === "string"
  ) {
    normalized.assistantReply = normalized.designIntentSummary;
  }

  if (!Array.isArray(normalized.promptHints)) {
    normalized.promptHints = [];
  }

  if (Array.isArray(normalized.directionBriefs)) {
    const clampedBriefs = normalized.directionBriefs
      .filter((brief) => brief && typeof brief === "object" && !Array.isArray(brief))
      .slice(0, input.constraints.maxBranchCount)
      .map((brief, index) =>
        normalizeDirectionBrief(
          brief as Record<string, unknown>,
          index,
          normalized.targetNodeId
        )
      );

    normalized.directionBriefs = clampedBriefs;

    if (clampedBriefs.length > 0) {
      normalized.branchCount = clampedBriefs.length;
    }
  }

  if (
    typeof normalized.branchCount !== "number" ||
    !Number.isFinite(normalized.branchCount)
  ) {
    normalized.branchCount = input.constraints.minBranchCount;
  }

  return normalized;
}

function inferActionType(
  transcriptText: string,
  input: BrainstormAssistantInput
): BrainstormAssistantOutput["actionType"] {
  if (/刷新|重来|换一版|替换/.test(transcriptText)) {
    return "refresh";
  }

  return "diverge";
}

function normalizeDirectionBrief(
  brief: Record<string, unknown>,
  index: number,
  targetNodeId: unknown
): Record<string, unknown> {
  const displayName = clampText(
    firstString(
      brief.displayName,
      brief.title,
      brief.name,
      brief.label,
      `方向 ${index + 1}`
    ),
    32
  );
  const intentSummary = firstString(
    brief.intentSummary,
    brief.summary,
    brief.description,
    brief.promptIntent,
    brief.prompt,
    displayName
  );

  return {
    ...brief,
    briefId: firstString(brief.briefId, `brief-${index + 1}`),
    targetParentNodeId: firstString(brief.targetParentNodeId, targetNodeId, "root"),
    label: firstString(brief.label, brief.title, brief.name, displayName),
    displayName,
    intentSummary,
    formLanguage: normalizeStringArray(brief.formLanguage, ["产品比例"]),
    userNeedResponse: normalizeStringArray(brief.userNeedResponse, ["满足核心使用需求"]),
    inspirationHints: normalizeStringArray(brief.inspirationHints, ["工业设计参考"]),
    suggestedFollowups: normalizeSuggestedFollowups(
      brief.suggestedFollowups,
      displayName
    ),
    variationAxis: firstString(
      brief.variationAxis,
      brief.axis,
      brief.differenceAxis,
      "形态语言"
    ),
    promptIntent: firstString(
      brief.promptIntent,
      brief.prompt,
      intentSummary,
      displayName
    )
  };
}

function normalizeSuggestedFollowups(value: unknown, displayName: string): string[] {
  const normalized = normalizeStringArray(value, []);
  const fallbacks = [
    `沿${displayName}继续细化`,
    "强化该方向的形态差异",
    "换一个更明确的材质策略"
  ];

  return [...normalized, ...fallbacks].slice(0, 3);
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return "";
}

function normalizeStringArray(
  value: unknown,
  fallback: string[]
): string[] {
  if (Array.isArray(value)) {
    const normalized = value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);

    if (normalized.length > 0) {
      return normalized;
    }
  }

  if (typeof value === "string") {
    const normalized = value
      .split(/[，,、;；\/|]/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (normalized.length > 0) {
      return normalized;
    }
  }

  return fallback;
}

function clampText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return value.slice(0, maxLength);
}
