import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { TreeNode } from "@voice-industrial-design/shared";

import type { NodeUiMeta } from "../types";

const rootPromptHints = [
  "描述产品类型",
  "说明核心功能",
  "定义目标人群",
  "列出关键需求",
  "补充风格方向"
];

export type BrainstormNodeData = {
  node: TreeNode;
  meta: NodeUiMeta;
  hasParent: boolean;
  hasChildren: boolean;
  isCurrentTarget: boolean;
  showRootPromptHints: boolean;
  onSelect: (nodeId: string) => void;
  onSuggestedFollowupClick: (input: {
    text: string;
    source: {
      nodeId: string;
      publicNodeNumber: number;
      displayName: string;
    };
  }) => void;
};

export type BrainstormFlowNode = Node<BrainstormNodeData, "brainstorm">;

export function BrainstormNodeCard({
  data,
  selected
}: NodeProps<BrainstormFlowNode>) {
  const {
    node,
    meta,
    hasParent,
    hasChildren,
    isCurrentTarget,
    showRootPromptHints,
    onSelect,
    onSuggestedFollowupClick
  } = data;
  const isRoot = !hasParent;
  const nodeTag = hasParent ? `节点 ${node.publicNodeNumber}` : "ROOT";
  const hasRenderedImage = Boolean(node.imageUrl) && node.status !== "generating";
  const suggestedFollowups = !isRoot && !hasChildren && node.status !== "generating"
    ? node.suggestedFollowups.slice(0, 3)
    : [];

  return (
    <div
      className={[
        "node-shell",
        selected ? "is-selected" : "",
        isCurrentTarget ? "is-target" : "",
        suggestedFollowups.length > 0 ? "has-suggestion-tree" : ""
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {hasParent ? (
        <>
          <Handle type="target" position={Position.Top} className="flow-handle flow-handle-top" />
          <span className="port port-top" aria-hidden="true">
            <span className="port-core" />
          </span>
        </>
      ) : null}

      <button
        className={[
          "node-card",
          selected ? "is-selected" : "",
          isCurrentTarget ? "is-target" : "",
          isRoot ? "is-root" : "",
          node.status === "generating" ? "is-generating" : "",
          `palette-${meta.palette}`
        ]
          .filter(Boolean)
          .join(" ")}
        type="button"
        data-testid={`node-button-${node.id}`}
        aria-pressed={selected}
        onClick={() => onSelect(node.id)}
      >
        <header className="node-card__header">
          <span>{nodeTag}</span>
          <span className="node-card__status" aria-hidden="true" />
        </header>

        <div className="node-card__body">
          <div className="node-card__copy">
            <h3>{node.status === "generating" ? `方向 ${node.layerOrdinal}` : node.displayName}</h3>
            {!isRoot ? <p>{node.intentSummary}</p> : null}
          </div>

          {!isRoot ? (
            <div className="node-card__visual" aria-hidden="true">
              {hasRenderedImage ? (
                <img
                  className="node-card__image"
                  src={node.imageUrl ?? undefined}
                  alt={`${node.displayName} 生成草图`}
                />
              ) : (
                <>
                  <div className="visual-core" />
                  <div className="visual-glow" />
                </>
              )}
              {node.status === "generating" ? (
                <div className="visual-loading">
                  <span className="loading-ring" />
                  <span>图片生成中</span>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="node-card__requirement">
              {!showRootPromptHints ? <span>已确认设计需求</span> : null}
              <p className="node-card__requirement-text">{node.intentSummary}</p>
              {showRootPromptHints ? (
                <div className="node-card__empty-prompts">
                  {rootPromptHints.map((hint) => (
                    <em key={hint}>{hint}</em>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </button>

      {hasChildren ? (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            className="flow-handle flow-handle-bottom"
          />
          <span className="port port-bottom" aria-hidden="true">
            <span className="port-core" />
          </span>
        </>
      ) : null}

      {suggestedFollowups.length > 0 ? (
        <div
          className="node-suggestion-list node-suggestion-tree nodrag nopan"
          aria-label={`${node.displayName} 推荐发散方向`}
        >
          <svg
            className="node-suggestion-bezier-lines"
            viewBox="0 0 410 76"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M205 2 C205 30 69 30 69 74" strokeDasharray="6 7" />
            <path d="M205 2 C205 30 205 40 205 74" strokeDasharray="6 7" />
            <path d="M205 2 C205 30 341 30 341 74" strokeDasharray="6 7" />
          </svg>
          {suggestedFollowups.map((prompt, index) => (
            <div
              key={prompt}
              className={`node-suggestion-branch node-suggestion-branch-${index + 1}`}
            >
              <button
                type="button"
                className="node-suggestion-chip node-suggestion-card nodrag nopan"
                onClick={() => {
                  onSelect(node.id);
                  onSuggestedFollowupClick({
                    text: prompt,
                    source: {
                      nodeId: node.id,
                      publicNodeNumber: node.publicNodeNumber,
                      displayName: node.displayName
                    }
                  });
                }}
              >
                {prompt}
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {selected && node.status !== "generating" ? (
        <div className="node-corners" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
      ) : null}
    </div>
  );
}
