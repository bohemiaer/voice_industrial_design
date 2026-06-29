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

export interface RuntimeApiKeys {
  siliconFlowApiKey?: string | null;
}

export interface TranscribeAudioInput {
  transcriptText?: string;
  audio?: Buffer;
  mimeType?: string;
  runtimeApiKeys?: RuntimeApiKeys;
}

export interface TranscribeAudioOutput {
  transcriptText: string;
}

export type BrainstormAgentInput = BrainstormAssistantInput & {
  runtimeApiKeys?: RuntimeApiKeys;
};
export type ChatAssistantRequest = ChatAssistantInput & {
  runtimeApiKeys?: RuntimeApiKeys;
};

export type MemorySummarizerRequest = MemorySummarizerInput & {
  runtimeApiKeys?: RuntimeApiKeys;
};

export type SketchGenerationRequest = SketchGenerationInput & {
  runtimeApiKeys?: RuntimeApiKeys;
};

export interface AgentGateway {
  transcribeAudio(input: TranscribeAudioInput): Promise<TranscribeAudioOutput>;
  runBrainstormAssistant(
    input: BrainstormAgentInput
  ): Promise<BrainstormAssistantOutput>;
  runChatAssistant(input: ChatAssistantRequest): Promise<ChatAssistantOutput>;
  runMemorySummarizer(
    input: MemorySummarizerRequest
  ): Promise<MemorySummarizerOutput>;
  generateSketch(input: SketchGenerationRequest): Promise<SketchGenerationOutput>;
}

export class AgentGatewayError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "AgentGatewayError";
  }
}
