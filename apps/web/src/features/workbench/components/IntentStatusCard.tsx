import type { GenerationTask } from "@voice-industrial-design/shared";

type IntentStatusCardProps = {
  task: GenerationTask | null;
};

const statusCopy: Record<GenerationTask["status"], string> = {
  queued: "排队中",
  transcribing: "语音转写中",
  reasoning: "意图理解中",
  awaiting_confirmation: "等待确认",
  generating: "分支生成中",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消"
};

export function IntentStatusCard({ task }: IntentStatusCardProps) {
  if (!task) {
    return null;
  }

  const completedBranches = task.branchTasks.filter(
    (branchTask) => branchTask.status === "completed"
  ).length;
  const failedBranches = task.branchTasks.filter(
    (branchTask) => branchTask.status === "failed"
  ).length;
  const generatingBranches = task.branchTasks.filter(
    (branchTask) => branchTask.status === "generating"
  ).length;

  return (
    <section className="intent-card">
      <div className="intent-card__header">
        <span className="intent-card__label">Intent status</span>
        <span className={`intent-card__status is-${task.status}`}>
          {statusCopy[task.status]}
        </span>
      </div>
      <h3>{task.designIntentSummary}</h3>
      <p>
        当前动作：<strong>{task.actionType}</strong> · 目标节点 <strong>{task.targetNodeId}</strong> · 预计分支{" "}
        <strong>{task.branchCount}</strong>
      </p>
      {task.branchTasks.length > 0 ? (
        <div className="branch-progress-summary">
          <span>完成 {completedBranches}</span>
          <span>生成中 {generatingBranches}</span>
          <span>失败 {failedBranches}</span>
        </div>
      ) : null}
      {failedBranches > 0 ? (
        <p className="branch-failure-summary">
          部分分支失败：可先使用已完成方向继续讨论，失败分支稍后重试。
        </p>
      ) : null}
    </section>
  );
}
