import {
  BrainstormAssistantOutputSchema,
  SketchGenerationOutputSchema,
  type BrainstormActionType,
  type BrainstormAssistantInput,
  type BrainstormAssistantOutput,
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
    variationAxis: "体量轻薄化",
    promptIntent: "早期工业设计草图，突出轻薄悬浮的办公产品方向"
  },
  {
    displayName: "柔和包裹感",
    label: "柔和、包裹、亲和",
    formLanguage: ["连续曲面", "包裹外壳", "低对比接缝"],
    userNeedResponse: ["提供更温和的使用感", "减少工具感"],
    inspirationHints: ["鹅卵石", "软质家居用品"],
    variationAxis: "外壳包裹方式",
    promptIntent: "早期工业设计草图，突出柔和包裹和亲和曲面"
  },
  {
    displayName: "模块秩序感",
    label: "模块、秩序、可维护",
    formLanguage: ["分层模块", "明确分割线", "规则几何"],
    userNeedResponse: ["表达可靠和可维护", "便于理解功能分区"],
    inspirationHints: ["模块化音箱", "专业办公设备"],
    variationAxis: "模块分区逻辑",
    promptIntent: "早期工业设计草图，突出模块化分区和清晰秩序"
  },
  {
    displayName: "自然呼吸感",
    label: "自然、透气、轻松",
    formLanguage: ["开放格栅", "渐变孔阵", "有机轮廓"],
    userNeedResponse: ["营造放松感", "强调空气流动和轻松氛围"],
    inspirationHints: ["叶脉", "自然通风格栅"],
    variationAxis: "通透开孔语言",
    promptIntent: "早期工业设计草图，突出自然通透和呼吸感"
  }
] as const;

export class MockAgentGateway implements AgentGateway {
  async transcribeAudio(
    input: TranscribeAudioInput
  ): Promise<TranscribeAudioOutput> {
    return {
      transcriptText: input.transcriptText ?? "围绕当前目标生成四个方向"
    };
  }

  async runBrainstormAssistant(
    input: BrainstormAssistantInput
  ): Promise<BrainstormAssistantOutput> {
    const actionType = classifyAction(input.transcriptText);
    const branchCount = resolveBranchCount(input.transcriptText, input.constraints);
    const confirmationRequired = actionType !== "expand_branches";
    const directionBriefs = Array.from({ length: branchCount }, (_, index) =>
      createBrief(index, input.selectedNodeId)
    );

    return BrainstormAssistantOutputSchema.parse({
      actionType,
      targetNodeId: input.selectedNodeId,
      branchCount,
      designIntentSummary:
        actionType === "expand_branches"
          ? "围绕当前目标生成首轮差异化方向。"
          : "根据当前节点执行高风险树结构操作。",
      assistantReply: confirmationRequired
        ? "这一步会改变树结构，我需要你确认后再执行。"
        : `我会生成 ${branchCount} 个差异化方向。`,
      confirmationRequired,
      rewrittenIntentForConfirmation: confirmationRequired
        ? `我将围绕当前节点执行 ${actionType}，生成 ${branchCount} 个方向。`
        : undefined,
      promptHints: ["早期工业设计草图", "差异化造型语言", "白底线稿"],
      directionBriefs
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
    return "refresh_layer";
  }

  if (/下钻|深入|子方向|继续/.test(transcriptText)) {
    return "branch_deeper";
  }

  return "expand_branches";
}

function resolveBranchCount(
  transcriptText: string,
  constraints: BrainstormAssistantInput["constraints"]
): number {
  const explicit = transcriptText.match(/[一二三四1234]/)?.[0];
  const parsed = explicit ? parseChineseNumber(explicit) : constraints.maxBranchCount;
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
    variationAxis: axis.variationAxis,
    promptIntent: axis.promptIntent
  };
}
