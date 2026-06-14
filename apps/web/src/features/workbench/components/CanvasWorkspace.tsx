import { memo, useEffect, useMemo } from "react";
import {
  Background,
  Position,
  ReactFlow,
  useReactFlow,
  type Edge,
  type EdgeTypes,
  type NodeTypes
} from "@xyflow/react";
import type { TreeNode } from "@voice-industrial-design/shared";

import { useWorkbenchStore } from "../store";
import type { NodePalette } from "../types";
import { createNodePosition, createNodeUiMeta } from "../uiMeta";
import {
  BrainstormNodeCard,
  type BrainstormFlowNode
} from "./BrainstormNodeCard";
import { WorkbenchBezierEdge } from "./WorkbenchBezierEdge";

const connectorPalette: Record<NodePalette, string> = {
  teal: "#2ad4bf",
  amber: "#f1b94b",
  blue: "#4b6fff",
  sand: "#c5ad93",
  mist: "#8eb2ff",
  ghost: "#d5dbe4"
};

const toolbarItems = [
  { label: "指针", icon: "selectionCursor", active: true },
  { label: "拖拽", icon: "hand" },
  { label: "框选", icon: "frame" }
];

const zoomItems = [
  { label: "缩小", icon: "minus" },
  { label: "100%", icon: "zoom-label" },
  { label: "放大", icon: "plus" }
];
const historyItems = [
  { label: "撤销", icon: "undo" },
  { label: "重做", icon: "redo" }
];

const nodeTypes = {
  brainstorm: memo(BrainstormNodeCard)
} satisfies NodeTypes;

const edgeTypes = {
  workbenchBezier: WorkbenchBezierEdge
} satisfies EdgeTypes;

function ToolbarGlyph({ icon }: { icon: string }) {
  if (icon === "zoom-label") {
    return <span className="toolbar-icon__text">100%</span>;
  }

  const commonProps = {
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const
  };

  const paths: Record<string, JSX.Element> = {
    selectionCursor: (
      <svg {...commonProps}>
        <path d="M4 4h5" />
        <path d="M4 4v5" />
        <path d="M16 16h-5" />
        <path d="M16 16v-5" />
        <path d="M7 10h6" />
        <path d="M10 7v6" />
      </svg>
    ),
    hand: (
      <svg {...commonProps}>
        <path d="M7.2 9V4.8a1 1 0 0 1 2 0V8" />
        <path d="M10 8V4a1 1 0 1 1 2 0v4" />
        <path d="M12.8 8.6V5.2a1 1 0 1 1 2 0V11c0 3-2.2 5-4.9 5-2.4 0-4-.9-5.2-3.4L3.6 10a1 1 0 0 1 1.8-1l1 1.6V7.8a1 1 0 0 1 2 0V9" />
      </svg>
    ),
    frame: (
      <svg {...commonProps}>
        <path d="M5 7V5h3" />
        <path d="M12 5h3v3" />
        <path d="M15 13v2h-3" />
        <path d="M8 15H5v-3" />
      </svg>
    ),
    minus: (
      <svg {...commonProps}>
        <path d="M5 10h10" />
      </svg>
    ),
    plus: (
      <svg {...commonProps}>
        <path d="M10 5v10" />
        <path d="M5 10h10" />
      </svg>
    ),
    undo: (
      <svg {...commonProps}>
        <path d="M7 6 4 9l3 3" />
        <path d="M5 9h6a4 4 0 1 1 0 8" />
      </svg>
    ),
    redo: (
      <svg {...commonProps}>
        <path d="m13 6 3 3-3 3" />
        <path d="M15 9H9a4 4 0 1 0 0 8" />
      </svg>
    ),
    export: (
      <svg {...commonProps}>
        <path d="M10 4v8" />
        <path d="m7 7 3-3 3 3" />
        <path d="M5 12v2a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2" />
      </svg>
    )
  };

  return paths[icon] ?? null;
}

export function CanvasWorkspace() {
  const serverState = useWorkbenchStore((state) => state.serverState);
  const uiState = useWorkbenchStore((state) => state.uiState);
  const selectNode = useWorkbenchStore((state) => state.selectNode);
  const { fitView } = useReactFlow();

  const rootNode = useMemo<TreeNode>(
    () => ({
      id: serverState.session.id,
      sessionId: serverState.session.id,
      parentNodeId: null,
      depth: 0,
      displayName: "用户需求",
      label: "用户需求",
      publicNodeNumber: 1,
      layerOrdinal: 1,
      layerVersion: 1,
      voiceAliases: ["root", "用户需求"],
      intentSummary: serverState.session.goal,
      formLanguage: [],
      userNeedResponse: [],
      inspirationHints: [],
      imageUrl: null,
      status: "ready",
      createdAt: serverState.session.createdAt,
      updatedAt: serverState.session.updatedAt
    }),
    [serverState.session]
  );

  const visibleTreeNodes = useMemo<TreeNode[]>(() => {
    return [
      rootNode,
      ...serverState.nodes.map((node) => ({
        ...node,
        parentNodeId: node.parentNodeId ?? serverState.session.id,
        depth: node.depth + 1
      }))
    ];
  }, [rootNode, serverState.nodes, serverState.session.id]);

  const childMap = useMemo(() => {
    return visibleTreeNodes.reduce<Record<string, string[]>>((acc, node) => {
      const parentId = node.parentNodeId;

      if (!parentId) {
        return acc;
      }

      if (!acc[parentId]) {
        acc[parentId] = [];
      }

      acc[parentId].push(node.id);
      return acc;
    }, {});
  }, [visibleTreeNodes]);

  const visibleOrdinalByNodeId = useMemo(() => {
    const depthCounts = new Map<number, number>();
    const ordinals = new Map<string, number>();

    [...visibleTreeNodes]
      .sort((left, right) => {
        if (left.depth !== right.depth) {
          return left.depth - right.depth;
        }

        return left.layerOrdinal - right.layerOrdinal;
      })
      .forEach((node) => {
        const nextOrdinal = (depthCounts.get(node.depth) ?? 0) + 1;
        depthCounts.set(node.depth, nextOrdinal);
        ordinals.set(node.id, nextOrdinal);
      });

    return ordinals;
  }, [visibleTreeNodes]);

  const visibleCountByDepth = useMemo(() => {
    return visibleTreeNodes.reduce<Map<number, number>>((counts, node) => {
      counts.set(node.depth, (counts.get(node.depth) ?? 0) + 1);
      return counts;
    }, new Map<number, number>());
  }, [visibleTreeNodes]);

  const nodes = useMemo<BrainstormFlowNode[]>(() => {
    return visibleTreeNodes.map((node, index) => {
      const meta = createNodeUiMeta(node, index);
      const visibleOrdinal = visibleOrdinalByNodeId.get(node.id) ?? node.layerOrdinal;
      const visibleCount = visibleCountByDepth.get(node.depth) ?? 1;

      return {
        id: node.id,
        type: "brainstorm",
        position: createNodePosition(node.depth, visibleOrdinal, visibleCount),
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        selected: uiState.selectedNodeId === node.id,
        data: {
          node,
          meta,
          hasParent: Boolean(node.parentNodeId),
          hasChildren: (childMap[node.id] ?? []).length > 0,
          isCurrentTarget: uiState.currentTargetNodeId === node.id,
          onSelect: selectNode
        }
      };
    });
  }, [
    childMap,
    selectNode,
    uiState.currentTargetNodeId,
    uiState.selectedNodeId,
    visibleCountByDepth,
    visibleOrdinalByNodeId,
    visibleTreeNodes
  ]);

  const flowNodeIds = useMemo(() => nodes.map((node) => node.id).join("|"), [nodes]);

  useEffect(() => {
    const fitViewTimer = window.setTimeout(() => {
      fitView({ padding: 0.2, minZoom: 0.48, maxZoom: 0.88, duration: 420 });
    }, 80);

    return () => window.clearTimeout(fitViewTimer);
  }, [fitView, flowNodeIds]);

  const edges = useMemo<Edge[]>(() => {
    return visibleTreeNodes
      .filter((node) => node.parentNodeId)
      .map((node) => {
        const meta = createNodeUiMeta(
          node,
          visibleTreeNodes.findIndex((candidate) => candidate.id === node.id)
        );

        return {
          id: `${node.parentNodeId}-${node.id}`,
          source: node.parentNodeId as string,
          target: node.id,
          type: "workbenchBezier",
          style: {
            stroke: connectorPalette[meta.palette],
            strokeWidth: uiState.currentTargetNodeId === node.id ? 3 : 2.4
          },
          selectable: false,
          animated: node.status === "generating"
        };
      });
  }, [uiState.currentTargetNodeId, visibleTreeNodes]);

  return (
    <section className="workspace-pane" data-testid="canvas-panel">
      <div className="toolbar">
        <div className="toolbar-group">
          {toolbarItems.map((item) => (
            <button
              key={item.label}
              className={["toolbar-icon", item.active ? "is-active" : ""].join(" ")}
              type="button"
              title={item.label}
              aria-label={item.label}
            >
              <span className="toolbar-icon__glyph" aria-hidden="true">
                <ToolbarGlyph icon={item.icon} />
              </span>
            </button>
          ))}
        </div>

        <div className="toolbar-group">
          {zoomItems.map((item) => (
            <button
              key={item.label}
              className={item.icon === "zoom-label" ? "toolbar-zoom-label" : "toolbar-icon"}
              type="button"
              title={item.label}
              aria-label={item.label}
            >
              <span className="toolbar-icon__glyph" aria-hidden="true">
                <ToolbarGlyph icon={item.icon} />
              </span>
            </button>
          ))}
        </div>

        <div className="toolbar-group">
          {historyItems.map((item) => (
            <button
              key={item.label}
              className="toolbar-icon"
              type="button"
              title={item.label}
              aria-label={item.label}
            >
              <span className="toolbar-icon__glyph" aria-hidden="true">
                <ToolbarGlyph icon={item.icon} />
              </span>
            </button>
          ))}
        </div>

        <div className="toolbar-export">
          <button type="button" aria-label="导出" title="导出">
            <span className="toolbar-icon__glyph" aria-hidden="true">
              <ToolbarGlyph icon="export" />
            </span>
          </button>
        </div>
      </div>

      <div className="canvas-scroll">
        <div className="flow-shell">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            fitViewOptions={{ padding: 0.18, minZoom: 0.64, maxZoom: 0.92 }}
            minZoom={0.45}
            maxZoom={1.4}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            zoomOnDoubleClick={false}
            colorMode="light"
            proOptions={{ hideAttribution: true }}
            style={{ width: "100%", height: "100%" }}
          >
            <Background color="rgba(34, 41, 49, 0.12)" gap={24} size={1.3} />
          </ReactFlow>
        </div>
      </div>
    </section>
  );
}
