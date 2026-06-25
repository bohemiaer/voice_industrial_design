import {
  BrainstormAssistantOutputSchema,
  ChatAssistantOutputSchema,
  MemorySummarizerOutputSchema,
  SketchGenerationOutputSchema,
  type BrainstormActionType,
  type BrainstormAssistantInput,
  type BrainstormAssistantOutput,
  type ChatAssistantInput,
  type ChatAssistantOutput,
  type MemorySummarizerInput,
  type MemorySummarizerOutput,
  type SketchGenerationInput,
  type SketchGenerationOutput,
  type VisualDirectionBrief
} from "@voice-industrial-design/shared";

import type {
  AgentGateway,
  TranscribeAudioInput,
  TranscribeAudioOutput
} from "./types.js";

const MOCK_AXES = [
  {
    displayName: "轻薄悬浮感",
    label: "轻薄、悬浮、低压迫",
    formLanguage: ["薄片化", "悬浮底座", "柔和圆角"],
    userNeedResponse: ["降低桌面视觉压迫", "适合长时间办公环境"],
    inspirationHints: ["悬浮屏幕支架", "轻薄消费电子"],
    suggestedFollowups: ["强化悬浮底座比例", "让机身再薄一点", "探索更低压迫的桌面姿态"],
    variationAxis: "体量轻薄化",
    promptIntent: "早期工业设计草图，突出轻薄悬浮的办公产品方向"
  },
  {
    displayName: "柔和包裹感",
    label: "柔和、包裹、亲和",
    formLanguage: ["连续曲面", "包裹外壳", "低对比接缝"],
    userNeedResponse: ["提供更温和的使用感", "减少工具感"],
    inspirationHints: ["鹅卵石", "软质家居用品"],
    suggestedFollowups: ["换成更温和的家居 CMF", "强化连续曲面包裹", "让边缘更亲和柔软"],
    variationAxis: "外壳包裹方式",
    promptIntent: "早期工业设计草图，突出柔和包裹和亲和曲面"
  },
  {
    displayName: "模块秩序感",
    label: "模块、秩序、可维护",
    formLanguage: ["分层模块", "明确分割线", "规则几何"],
    userNeedResponse: ["表达可靠和可维护", "便于理解功能分区"],
    inspirationHints: ["模块化音箱", "专业办公设备"],
    suggestedFollowups: ["细化模块分区比例", "强化专业设备秩序", "探索更清晰的功能边界"],
    variationAxis: "模块分区逻辑",
    promptIntent: "早期工业设计草图，突出模块化分区和清晰秩序"
  },
  {
    displayName: "自然呼吸感",
    label: "自然、透气、轻松",
    formLanguage: ["开放格栅", "渐变孔阵", "有机轮廓"],
    userNeedResponse: ["营造放松感", "强调空气流动和轻松氛围"],
    inspirationHints: ["叶脉", "自然通风格栅"],
    suggestedFollowups: ["放大自然通风格栅", "弱化机械感更轻松", "探索更有机的侧面轮廓"],
    variationAxis: "通透开孔语言",
    promptIntent: "早期工业设计草图，突出自然通透和呼吸感"
  }
] as const;

export class MockAgentGateway implements AgentGateway {
  async transcribeAudio(
    input: TranscribeAudioInput
  ): Promise<TranscribeAudioOutput> {
    return {
      transcriptText: input.transcriptText ?? "围绕当前目标生成三个方向"
    };
  }

  async runBrainstormAssistant(
    input: BrainstormAssistantInput
  ): Promise<BrainstormAssistantOutput> {
    const actionType = classifyAction(input.transcriptText);
    const branchCount = resolveBranchCount(input.transcriptText, input.constraints);
    const directionBriefs = Array.from({ length: branchCount }, (_, index) =>
      createBrief(index, input.selectedNodeId)
    );
    const selectedLabel = input.selectedNodeSummary.displayName;
    const actionSummary = describeAction(actionType, branchCount);

    return BrainstormAssistantOutputSchema.parse({
      actionType,
      targetNodeId: input.selectedNodeId,
      branchCount,
      designIntentSummary: `围绕“${input.transcriptText}”收束本轮设计目标，并保持与初始需求一致。`,
      assistantReply: `我理解你的需求是：${input.transcriptText}。现在我会围绕 ${selectedLabel} ${actionSummary}。`,
      promptHints: ["早期工业设计草图", "差异化造型语言", "白底线稿"],
      directionBriefs
    });
  }

  async runChatAssistant(
    input: ChatAssistantInput
  ): Promise<ChatAssistantOutput> {
    const target = input.selectedNode
      ? `当前节点“${input.selectedNode.displayName}”的方向是：${input.selectedNode.intentSummary}`
      : `当前会话目标是：${input.sessionGoal}`;

    return ChatAssistantOutputSchema.parse({
      assistantReply: `${target}。这次只是回答问题，不会改变画布。`
    });
  }

  async runMemorySummarizer(
    input: MemorySummarizerInput
  ): Promise<MemorySummarizerOutput> {
    return MemorySummarizerOutputSchema.parse({
      stablePreferences: input.previousMemory?.stablePreferences ?? [],
      activeConstraints: input.previousMemory?.activeConstraints ?? [],
      rejectedDirections: input.previousMemory?.rejectedDirections ?? [],
      openQuestions: input.previousMemory?.openQuestions ?? [],
      shortSummary: "近期对话已压缩，暂无新增稳定偏好。"
    });
  }

  async generateSketch(
    input: SketchGenerationInput
  ): Promise<SketchGenerationOutput> {
    return SketchGenerationOutputSchema.parse({
      imageId: `mock-image-${input.brief.briefId}`,
      briefId: input.brief.briefId,
      imageUrl: `https://example.com/mock-sketches/${input.brief.briefId}.png`,
      promptUsed: input.brief.promptIntent,
      negativePromptUsed: "photorealistic, final render, advertisement",
      visualSummary: `${input.brief.displayName} 的早期工业设计草图。`
    });
  }
}

function classifyAction(transcriptText: string): BrainstormActionType {
  if (/刷新|重来|换一版|替换/.test(transcriptText)) {
    return "refresh";
  }

  return "diverge";
}

function resolveBranchCount(
  transcriptText: string,
  constraints: BrainstormAssistantInput["constraints"]
): number {
  const explicit = transcriptText.match(/[一二三四1234]/)?.[0];
  const parsed = explicit ? parseChineseNumber(explicit) : 3;
  return Math.min(
    constraints.maxBranchCount,
    Math.max(constraints.minBranchCount, parsed)
  );
}

function parseChineseNumber(value: string): number {
  const map: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    "1": 1,
    "2": 2,
    "3": 3,
    "4": 4
  };
  return map[value] ?? 4;
}

function createBrief(index: number, targetParentNodeId: string): VisualDirectionBrief {
  const axis = MOCK_AXES[index % MOCK_AXES.length];
  return {
    briefId: `mock-brief-${index + 1}`,
    targetParentNodeId,
    label: axis.label,
    displayName: axis.displayName,
    intentSummary: `探索${axis.displayName}方向。`,
    formLanguage: [...axis.formLanguage],
    userNeedResponse: [...axis.userNeedResponse],
    inspirationHints: [...axis.inspirationHints],
    suggestedFollowups: [...axis.suggestedFollowups],
    variationAxis: axis.variationAxis,
    promptIntent: axis.promptIntent
  };
}

function describeAction(
  actionType: BrainstormActionType,
  branchCount: number
): string {
  if (actionType === "refresh") {
    return `刷新当前层并生成 ${branchCount} 个新方向`;
  }

  return `扩展 ${branchCount} 个新的设计方向`;
}
