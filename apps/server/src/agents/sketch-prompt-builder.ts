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
