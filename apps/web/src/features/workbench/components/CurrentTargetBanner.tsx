import type { TreeNode } from "@voice-industrial-design/shared";

type CurrentTargetBannerProps = {
  selectedNode: TreeNode;
  currentTargetNode: TreeNode | null;
  summary: string | null;
};

export function CurrentTargetBanner({
  selectedNode,
  currentTargetNode,
  summary
}: CurrentTargetBannerProps) {
  return (
    <section className="target-banner">
      <div>
        <span className="target-banner__label">Current target</span>
        <h3>
          节点 {currentTargetNode?.publicNodeNumber ?? selectedNode.publicNodeNumber} ·{" "}
          {currentTargetNode?.displayName ?? selectedNode.displayName}
        </h3>
      </div>
      <p>{summary ?? currentTargetNode?.intentSummary ?? selectedNode.intentSummary}</p>
    </section>
  );
}
