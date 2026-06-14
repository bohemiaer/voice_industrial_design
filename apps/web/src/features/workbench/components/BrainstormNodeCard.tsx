import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { TreeNode } from "@voice-industrial-design/shared";

import type { NodeUiMeta } from "../types";

export type BrainstormNodeData = {
  node: TreeNode;
  meta: NodeUiMeta;
  hasParent: boolean;
  hasChildren: boolean;
  isCurrentTarget: boolean;
  onSelect: (nodeId: string) => void;
};

export type BrainstormFlowNode = Node<BrainstormNodeData, "brainstorm">;

export function BrainstormNodeCard({
  data,
  selected
}: NodeProps<BrainstormFlowNode>) {
  const { node, meta, hasParent, hasChildren, isCurrentTarget, onSelect } = data;
  const nodeTag = hasParent ? `NODE ${node.publicNodeNumber}` : "ROOT";

  return (
    <div
      className={[
        "node-shell",
        selected ? "is-selected" : "",
        isCurrentTarget ? "is-target" : ""
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {hasParent ? (
        <>
          <Handle type="target" position={Position.Left} className="flow-handle flow-handle-left" />
          <span className="port port-left" aria-hidden="true">
            <span className="port-core" />
          </span>
        </>
      ) : null}

      <button
        className={[
          "node-card",
          selected ? "is-selected" : "",
          isCurrentTarget ? "is-target" : "",
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
            <h3>{node.displayName}</h3>
            <p>{node.intentSummary}</p>
          </div>

          <div className="node-card__visual" aria-hidden="true">
            <div className="visual-core" />
            <div className="visual-glow" />
            {node.status === "generating" ? (
              <div className="visual-loading">
                <span className="loading-ring" />
                <span>GENERATING</span>
              </div>
            ) : null}
          </div>
        </div>
      </button>

      {hasChildren ? (
        <>
          <Handle
            type="source"
            position={Position.Right}
            className="flow-handle flow-handle-right"
          />
          <span className="port port-right" aria-hidden="true">
            <span className="port-core" />
          </span>
        </>
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
