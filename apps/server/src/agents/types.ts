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

export interface TranscribeAudioInput {
  transcriptText?: string;
  audio?: Buffer;
  mimeType?: string;
}

export interface TranscribeAudioOutput {
  transcriptText: string;
}

export interface AgentGateway {
  transcribeAudio(input: TranscribeAudioInput): Promise<TranscribeAudioOutput>;
  runBrainstormAssistant(
    input: BrainstormAssistantInput
  ): Promise<BrainstormAssistantOutput>;
  runChatAssistant(input: ChatAssistantInput): Promise<ChatAssistantOutput>;
  runMemorySummarizer(
    input: MemorySummarizerInput
  ): Promise<MemorySummarizerOutput>;
  generateSketch(input: SketchGenerationInput): Promise<SketchGenerationOutput>;
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
