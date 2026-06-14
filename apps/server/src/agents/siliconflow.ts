import {
  BrainstormAssistantOutputSchema,
  SketchGenerationOutputSchema,
  type BrainstormAssistantInput,
  type BrainstormAssistantOutput,
  type SketchGenerationInput,
  type SketchGenerationOutput
} from "@voice-industrial-design/shared";

import type { AppConfig } from "../config.js";
import {
  AgentGatewayError,
  type AgentGateway,
  type TranscribeAudioInput,
  type TranscribeAudioOutput
} from "./types.js";

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 2;

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

    formData.append(
      "file",
      new Blob([audioBytes], {
        type: input.mimeType ?? "audio/webm"
      }),
      "recording.webm"
    );

    const response = await this.requestJson<{ text?: string }>(
      "/audio/transcriptions",
      {
        method: "POST",
        headers: this.authHeaders(),
        body: formData
      }
    );

    if (!response.text) {
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
    input: BrainstormAssistantInput
  ): Promise<BrainstormAssistantOutput> {
    const model = this.requireConfig(
      this.config.siliconFlowBrainstormModel,
      "SILICONFLOW_BRAINSTORM_MODEL"
    );

    const response = await this.requestJson<ChatCompletionResponse>(
      "/chat/completions",
      {
        method: "POST",
        headers: this.jsonHeaders(),
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: buildBrainstormSystemPrompt()
            },
            {
              role: "user",
              content: JSON.stringify(input)
            }
          ],
          response_format: {
            type: "json_object"
          },
          enable_thinking: false
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
      return BrainstormAssistantOutputSchema.parse(JSON.parse(content));
    } catch (error) {
      throw new AgentGatewayError(
        "SiliconFlow chat response did not match the assistant schema.",
        "SILICONFLOW_RESPONSE_INVALID",
        error
      );
    }
  }

  async generateSketch(
    input: SketchGenerationInput
  ): Promise<SketchGenerationOutput> {
    const model = this.requireConfig(
      this.config.siliconFlowImageModel,
      "SILICONFLOW_IMAGE_MODEL"
    );
    const prompt = buildSketchPrompt(input);
    const negativePrompt = "photorealistic, final render, advertisement, text";

    const response = await this.requestJson<ImageGenerationResponse>(
      "/images/generations",
      {
        method: "POST",
        headers: this.jsonHeaders(),
        body: JSON.stringify({
          model,
          prompt,
          negative_prompt: negativePrompt,
          batch_size: 1
        })
      }
    );

    const imageUrl = response.images?.[0]?.url ?? response.data?.[0]?.url;

    if (!imageUrl) {
      throw new AgentGatewayError(
        "SiliconFlow image response did not include an image URL.",
        "SILICONFLOW_RESPONSE_INVALID"
      );
    }

    return SketchGenerationOutputSchema.parse({
      imageId: `siliconflow-${response.seed ?? input.brief.briefId}`,
      briefId: input.brief.briefId,
      imageUrl,
      promptUsed: prompt,
      negativePromptUsed: negativePrompt,
      visualSummary: `${input.brief.displayName} 的早期工业设计草图。`
    });
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

  private endpoint(path: string): string {
    const baseUrl = this.requireConfig(
      this.config.siliconFlowBaseUrl,
      "SILICONFLOW_BASE_URL"
    );

    return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
  }

  private authHeaders(): Record<string, string> {
    return {
      authorization: `Bearer ${this.requireConfig(
        this.config.siliconFlowApiKey,
        "SILICONFLOW_API_KEY"
      )}`
    };
  }

  private jsonHeaders(): Record<string, string> {
    return {
      ...this.authHeaders(),
      "content-type": "application/json"
    };
  }

  private requireConfig(value: string | null, key: string): string {
    if (!value) {
      throw new AgentGatewayError(
        `${key} is required for SiliconFlow provider.`,
        "SILICONFLOW_CONFIG_MISSING"
      );
    }

    return value;
  }
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

function buildBrainstormSystemPrompt(): string {
  return [
    "你是工业设计早期概念发散助手。",
    "只能输出 JSON object，且必须匹配 BrainstormAssistantOutput schema。",
    "根据用户语音、当前节点、祖先和同层上下文，决定 expand_branches、branch_deeper 或 refresh_layer。",
    "高风险结构操作必须设置 confirmationRequired=true，并提供 rewrittenIntentForConfirmation。"
  ].join("\n");
}

function buildSketchPrompt(input: SketchGenerationInput): string {
  return [
    input.brief.promptIntent,
    `方向名称：${input.brief.displayName}`,
    `设计意图：${input.brief.intentSummary}`,
    `形态语言：${input.brief.formLanguage.join("，")}`,
    `用户需求：${input.brief.userNeedResponse.join("，")}`,
    `灵感提示：${input.brief.inspirationHints.join("，")}`,
    `差异轴：${input.brief.variationAxis}`,
    `阶段：${input.sessionStyle.detailLevel} ${input.depthContext.branchStage}`,
    "早期工业设计草图，白底，线稿，少量灰度阴影，强调可比较的产品形态。"
  ].join("\n");
}
