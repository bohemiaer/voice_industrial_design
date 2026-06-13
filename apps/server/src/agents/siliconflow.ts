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

const BRAINSTORM_SYSTEM_PROMPT = `You are Brainstorm Assistant, an industrial design ideation planner for a voice-driven branching canvas. Return valid JSON only.`;

const SKETCH_SYSTEM_PROMPT = `You are Sketch Generation Assistant, a visual execution agent for industrial design ideation. Return valid JSON only.`;

export class SiliconFlowAgentGateway implements AgentGateway {
  constructor(private readonly config: AppConfig) {}

  async transcribeAudio(
    input: TranscribeAudioInput
  ): Promise<TranscribeAudioOutput> {
    if (input.transcriptText) {
      return { transcriptText: input.transcriptText };
    }

    this.assertConfigured(this.config.siliconFlowAsrModel, "SILICONFLOW_ASR_MODEL");

    throw new AgentGatewayError(
      "Audio upload transcription is not implemented in this milestone",
      "ASR_AUDIO_NOT_IMPLEMENTED"
    );
  }

  async runBrainstormAssistant(
    input: BrainstormAssistantInput
  ): Promise<BrainstormAssistantOutput> {
    const content = await this.postJson(this.config.siliconFlowBrainstormModel, {
      model: this.config.siliconFlowBrainstormModel,
      messages: [
        { role: "system", content: BRAINSTORM_SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(input) }
      ],
      response_format: { type: "json_object" }
    });
    return BrainstormAssistantOutputSchema.parse(extractJson(content));
  }

  async generateSketch(
    input: SketchGenerationInput
  ): Promise<SketchGenerationOutput> {
    const content = await this.postJson(this.config.siliconFlowImageModel, {
      model: this.config.siliconFlowImageModel,
      prompt: `${SKETCH_SYSTEM_PROMPT}\n${JSON.stringify(input)}`
    });
    return SketchGenerationOutputSchema.parse(extractJson(content));
  }

  private async postJson(model: string | null, body: unknown): Promise<unknown> {
    this.assertConfigured(model, "SiliconFlow model");
    this.assertConfigured(this.config.siliconFlowApiKey, "SILICONFLOW_API_KEY");
    this.assertConfigured(this.config.siliconFlowBaseUrl, "SILICONFLOW_BASE_URL");

    const response = await fetch(this.config.siliconFlowBaseUrl!, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.config.siliconFlowApiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new AgentGatewayError(
        `SiliconFlow request failed with status ${response.status}`,
        "SILICONFLOW_REQUEST_FAILED"
      );
    }

    return response.json();
  }

  private assertConfigured(
    value: string | null,
    variableName: string
  ): asserts value is string {
    if (!value) {
      throw new AgentGatewayError(
        `${variableName} is required for SiliconFlow gateway`,
        "SILICONFLOW_CONFIG_MISSING"
      );
    }
  }
}

function extractJson(value: unknown): unknown {
  if (
    value &&
    typeof value === "object" &&
    "choices" in value &&
    Array.isArray(value.choices) &&
    value.choices[0]?.message?.content
  ) {
    return JSON.parse(value.choices[0].message.content);
  }

  return value;
}
