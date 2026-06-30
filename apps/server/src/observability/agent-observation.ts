import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const OBSERVATION_MARKDOWN_PATH = resolve(
  process.cwd(),
  "logs",
  "agent-observation.md"
);

export function recordAgentObservation(
  stage: string,
  payload: Record<string, unknown>
): void {
  const timestamp = new Date().toISOString();
  const event = {
    event: "agent_observation",
    stage,
    timestamp,
    payload
  };

  console.info(
    JSON.stringify(event)
  );

  if (isVercelRuntime()) {
    return;
  }

  try {
    appendMarkdownObservation(stage, timestamp, payload);
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: "agent_observation_markdown_write_failed",
        stage,
        timestamp,
        error: error instanceof Error ? error.message : String(error)
      })
    );
  }
}

function isVercelRuntime(): boolean {
  return process.env.VERCEL === "1";
}

function appendMarkdownObservation(
  stage: string,
  timestamp: string,
  payload: Record<string, unknown>
): void {
  mkdirSync(dirname(OBSERVATION_MARKDOWN_PATH), { recursive: true });
  appendFileSync(
    OBSERVATION_MARKDOWN_PATH,
    formatMarkdownObservation(stage, timestamp, payload),
    "utf8"
  );
}

function formatMarkdownObservation(
  stage: string,
  timestamp: string,
  payload: Record<string, unknown>
): string {
  const readableTimestamp = formatReadableTimestamp(timestamp);

  return [
    "",
    "---",
    "",
    `## ${stageTitle(stage)} - ${readableTimestamp}`,
    "",
    ...formatStageSummary(stage, payload),
    "",
    `- ISO 时间: ${timestamp}`,
    "",
    "### 完整 payload",
    "",
    "```json",
    JSON.stringify(payload, null, 2),
    "```",
    ""
  ].join("\n");
}

function formatReadableTimestamp(timestamp: string): string {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second} GMT+8`;
}

function stageTitle(stage: string): string {
  const titles: Record<string, string> = {
    "brainstorm_assistant.input": "脑暴助理输入",
    "brainstorm_assistant.output": "脑暴助理输出",
    "prompt_router.input": "Prompt 路由输入",
    "prompt_router.output": "Prompt 路由输出",
    "image_prompt_writer.input": "生图 Prompt Writer 输入",
    "image_prompt_writer.output": "生图 Prompt Writer 输出",
    "image_assistant.input": "生图助理输入",
    "image_assistant.output": "生图助理输出"
  };

  return titles[stage] ?? stage;
}

function formatStageSummary(
  stage: string,
  payload: Record<string, unknown>
): string[] {
  if (stage === "brainstorm_assistant.input") {
    return formatBrainstormInput(payload);
  }

  if (stage === "brainstorm_assistant.output") {
    return formatBrainstormOutput(payload);
  }

  if (stage === "prompt_router.input" || stage === "prompt_router.output") {
    return formatPromptRouter(payload);
  }

  if (stage === "image_assistant.input") {
    return formatImageInput(payload);
  }

  if (stage === "image_assistant.output") {
    return formatImageOutput(payload);
  }

  return formatCommonSummary(payload);
}

function formatBrainstormInput(payload: Record<string, unknown>): string[] {
  const assistantInput = readRecord(payload.assistantInput);

  return [
    "### 摘要",
    "",
    `- Session: ${formatValue(payload.sessionId)}`,
    `- 当前节点: ${formatValue(payload.selectedNodeId)}`,
    `- 用户输入: ${formatValue(payload.transcriptText)}`,
    `- 设计目标: ${formatValue(assistantInput.sessionGoal)}`,
    `- 对话记忆: ${formatValue(assistantInput.conversationMemory)}`,
    `- 约束: ${formatValue(assistantInput.constraints)}`
  ];
}

function formatBrainstormOutput(payload: Record<string, unknown>): string[] {
  const output = readRecord(payload.rawAssistantOutput);
  const briefs = readArray(output.directionBriefs);

  return [
    "### 摘要",
    "",
    `- Session: ${formatValue(payload.sessionId)}`,
    `- 当前节点: ${formatValue(payload.selectedNodeId)}`,
    `- 动作: ${formatValue(output.actionType)}`,
    `- 目标节点: ${formatValue(output.targetNodeId)}`,
    `- 分支数量: ${formatValue(output.branchCount)}`,
    `- 助手回复: ${formatValue(output.assistantReply)}`,
    "",
    "### 方向 briefs",
    "",
    ...formatBriefRows(briefs)
  ];
}

function formatPromptRouter(payload: Record<string, unknown>): string[] {
  return [
    "### 摘要",
    "",
    `- Session: ${formatValue(payload.sessionId)}`,
    `- Task: ${formatValue(payload.taskId)}`,
    `- 动作: ${formatValue(payload.actionType)}`,
    `- 目标节点: ${formatValue(payload.targetNodeId)}`,
    `- 用户输入: ${formatValue(payload.transcriptText)}`,
    `- 分支任务: ${formatValue(payload.branchTasks)}`
  ];
}

function formatImageInput(payload: Record<string, unknown>): string[] {
  const promptSet = readRecord(payload.promptSet);

  return [
    "### 摘要",
    "",
    `- 模型: ${formatValue(payload.model)}`,
    `- Brief: ${formatValue(payload.briefId)}`,
    `- Visual summary: ${formatValue(promptSet.visualSummary)}`,
    "",
    "### Prompt",
    "",
    "```text",
    String(promptSet.prompt ?? ""),
    "```",
    "",
    "### Negative prompt",
    "",
    "```text",
    String(promptSet.negativePrompt ?? ""),
    "```"
  ];
}

function formatImageOutput(payload: Record<string, unknown>): string[] {
  const output = readRecord(payload.sketchOutput);

  return [
    "### 摘要",
    "",
    `- 模型: ${formatValue(payload.model)}`,
    `- Brief: ${formatValue(payload.briefId)}`,
    `- Image URL: ${formatValue(output.imageUrl)}`,
    `- Visual summary: ${formatValue(output.visualSummary)}`,
    "",
    "### Prompt used",
    "",
    "```text",
    String(output.promptUsed ?? ""),
    "```",
    "",
    "### Negative prompt used",
    "",
    "```text",
    String(output.negativePromptUsed ?? ""),
    "```"
  ];
}

function formatCommonSummary(payload: Record<string, unknown>): string[] {
  return [
    "### 摘要",
    "",
    ...Object.entries(payload).map(
      ([key, value]) => `- ${key}: ${formatValue(value)}`
    )
  ];
}

function formatBriefRows(briefs: unknown[]): string[] {
  if (briefs.length === 0) {
    return ["无"];
  }

  return [
    "| 序号 | 名称 | 意图 | 差异轴 | promptIntent |",
    "| --- | --- | --- | --- | --- |",
    ...briefs.map((brief, index) => {
      const record = readRecord(brief);
      return [
        index + 1,
        escapeTableValue(record.displayName),
        escapeTableValue(record.intentSummary),
        escapeTableValue(record.variationAxis),
        escapeTableValue(record.promptIntent)
      ].join(" | ");
    }).map((row) => `| ${row} |`)
  ];
}

function formatValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value === null || value === undefined) {
    return "";
  }

  return JSON.stringify(value);
}

function escapeTableValue(value: unknown): string {
  return formatValue(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function readRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
