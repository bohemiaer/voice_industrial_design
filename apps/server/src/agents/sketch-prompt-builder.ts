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
  return [
    input.brief.promptIntent,
    `方向名称：${input.brief.displayName}`,
    `设计意图：${input.brief.intentSummary}`,
    `形态语言：${input.brief.formLanguage.join("，")}`,
    `用户需求：${input.brief.userNeedResponse.join("，")}`,
    `灵感提示：${input.brief.inspirationHints.join("，")}`,
    `差异轴：${input.brief.variationAxis}`,
    `阶段：${input.sessionStyle.detailLevel} ${input.depthContext.branchStage}`,
    "早期工业设计草图，白底，线稿，少量灰度阴影，强调可比较的产品形态。",
    "3:2 横向画幅，产品主体完整可见，四周保留舒适白边，不要裁切主体。"
  ].join("\n");
}

function buildSketchNegativePrompt(): string {
  return [
    "photorealistic",
    "final render",
    "advertisement",
    "text"
  ].join(", ");
}
