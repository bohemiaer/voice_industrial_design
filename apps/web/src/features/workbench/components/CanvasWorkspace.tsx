import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Position,
  ReactFlow,
  useReactFlow,
  getNodesBounds,
  type Viewport,
  type Edge,
  type EdgeTypes,
  type NodeTypes
} from "@xyflow/react";
import type { TreeNode } from "@voice-industrial-design/shared";

import { useWorkbenchStore } from "../store";
import type { NodePalette } from "../types";
import { createNodeUiMeta, createSymmetricTreeLayout } from "../uiMeta";
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
  { label: "全局显示", icon: "selectionCursor" },
  { label: "拖拽", icon: "hand" }
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

const DEFAULT_SESSION_TITLE = "AI 语音工业设计脑暴";

function extractProductName(text: string): string | null {
  const normalized = text.trim();

  if (!normalized) {
    return null;
  }

  const patterns = [
    /围绕(.+?)(生成|做|展开|延展|发散|设计|探索)/,
    /探索(.+?)(的|方向|方案|概念)/,
    /设计(?:一款|一个|一台|一种)?(.+?)(，|。|,|\.|并|让|要|用于)/
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);

    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function resolveRootNodeDisplayName(session: {
  title: string;
  goal: string;
}, rootIntentSummary: string): string {
  if (
    session.title !== DEFAULT_SESSION_TITLE &&
    session.title.trim().length > 0
  ) {
    return session.title;
  }

  return extractProductName(rootIntentSummary) ?? truncateRootText(rootIntentSummary);
}

function resolveRootNodeLabel(
  session: { title: string; goal: string },
  rootIntentSummary: string
): string {
  return resolveRootNodeDisplayName(session, rootIntentSummary);
}

function resolveRootNodeIntentSummary(session: {
  goal: string;
}, firstUserTranscript: string | null): string {
  return firstUserTranscript?.trim() || session.goal;
}

function findFirstUserTranscript(messages: Array<{
  role: string;
  kind: string;
  content: string;
}>): string | null {
  const firstUserTranscript = messages.find(
    (message) => message.role === "user" && message.kind === "transcript"
  );

  return firstUserTranscript?.content ?? null;
}

function truncateRootText(text: string): string {
  const normalized = text.trim();

  if (normalized.length <= 16) {
    return normalized || "产品需求";
  }

  return `${normalized.slice(0, 16)}...`;
}

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
  const requestUndo = useWorkbenchStore((state) => state.requestUndo);
  const requestRedo = useWorkbenchStore((state) => state.requestRedo);
  const { fitBounds, fitView, getViewport, setViewport, zoomIn, zoomOut } = useReactFlow();
  const viewportSnapshotRef = useRef<Viewport | null>(null);
  const [isGlobalPreview, setIsGlobalPreview] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const historyDisabled =
    uiState.isThinking ||
    uiState.apiStatus === "loading" ||
    uiState.recordingState === "processing";
  const hasConfirmedRootIntent =
    serverState.nodes.length > 0 || serverState.session.nextPublicNodeNumber > 1;
  const firstUserTranscript = useMemo(
    () => findFirstUserTranscript(serverState.messages),
    [serverState.messages]
  );
  const rootIntentSummary = useMemo(
    () => resolveRootNodeIntentSummary(serverState.session, firstUserTranscript),
    [firstUserTranscript, serverState.session]
  );

  const rootNode = useMemo<TreeNode>(
    () => ({
      id: serverState.session.id,
      sessionId: serverState.session.id,
      parentNodeId: null,
      childGroupId: null,
      depth: 0,
      displayName: resolveRootNodeDisplayName(
        serverState.session,
        rootIntentSummary
      ),
      label: resolveRootNodeLabel(serverState.session, rootIntentSummary),
      publicNodeNumber: 1,
      layerOrdinal: 1,
      layerVersion: 1,
      voiceAliases: [
        "root",
        "用户需求",
        resolveRootNodeDisplayName(serverState.session, rootIntentSummary)
      ],
      intentSummary: resolveRootNodeIntentSummary(
        serverState.session,
        firstUserTranscript
      ),
      formLanguage: [],
      userNeedResponse: [],
      inspirationHints: [],
      imageUrl: null,
      status: "ready",
      createdAt: serverState.session.createdAt,
      updatedAt: serverState.session.updatedAt
    }),
    [firstUserTranscript, rootIntentSummary, serverState.session]
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

  const layoutPositions = useMemo(
    () => createSymmetricTreeLayout(visibleTreeNodes),
    [visibleTreeNodes]
  );

  const nodes = useMemo<BrainstormFlowNode[]>(() => {
    return visibleTreeNodes.map((node, index) => {
      const layoutPosition = layoutPositions.get(node.id) ?? {
        x: 80,
        y: 70 + node.depth * 440
      };
      const meta = {
        ...createNodeUiMeta(node, index),
        position: layoutPosition
      };

      return {
        id: node.id,
        type: "brainstorm",
        position: layoutPosition,
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        selected: uiState.currentNodeId === node.id,
        data: {
          node,
          meta,
          hasParent: Boolean(node.parentNodeId),
          hasChildren: (childMap[node.id] ?? []).length > 0,
          isCurrentTarget: uiState.currentNodeId === node.id,
          showRootPromptHints: node.id === serverState.session.id && !hasConfirmedRootIntent,
          onSelect: selectNode
        }
      };
    });
  }, [
    childMap,
    selectNode,
    serverState.session.id,
    uiState.currentNodeId,
    hasConfirmedRootIntent,
    layoutPositions,
    visibleTreeNodes
  ]);

  const flowNodeIds = useMemo(() => nodes.map((node) => node.id).join("|"), [nodes]);

  const focusLatestPreview = useCallback(() => {
    const latestGeneratedNodes = nodes.filter((node) =>
      uiState.latestGeneratedNodeIds.includes(node.id)
    );

    if (latestGeneratedNodes.length === 0) {
      return false;
    }

    const bounds = getNodesBounds(latestGeneratedNodes);
    const viewportAspectRatio =
      typeof window === "undefined"
        ? 16 / 9
        : window.innerWidth / Math.max(window.innerHeight, 1);
    const expandedWidth = Math.max(bounds.width * 2, 720);
    const expandedHeight = Math.max(
      expandedWidth / Math.max(viewportAspectRatio, 1),
      bounds.height * 1.12,
      320
    );

    void fitBounds(
      {
        x: bounds.x - (expandedWidth - bounds.width) / 2,
        y: bounds.y - (expandedHeight - bounds.height) / 2,
        width: expandedWidth,
        height: expandedHeight
      },
      {
        padding: 0.08,
        duration: 420
      }
    );

    return true;
  }, [fitBounds, nodes, uiState.latestGeneratedNodeIds]);

  useEffect(() => {
    if (isGlobalPreview) {
      return;
    }

    const fitViewTimer = window.setTimeout(() => {
      if (focusLatestPreview()) {
        return;
      }

      fitView({ padding: 0.2, minZoom: 0.48, maxZoom: 0.88, duration: 420 });
    }, 80);

    return () => window.clearTimeout(fitViewTimer);
  }, [fitView, flowNodeIds, focusLatestPreview, isGlobalPreview]);

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
            strokeWidth: uiState.currentNodeId === node.id ? 3 : 2.4
          },
          selectable: false,
          animated: node.status === "generating"
        };
      });
  }, [uiState.currentNodeId, visibleTreeNodes]);

  const handleToggleGlobalPreview = useCallback(() => {
    if (isGlobalPreview) {
      if (viewportSnapshotRef.current) {
        void setViewport(viewportSnapshotRef.current, { duration: 360 });
      }
      setIsGlobalPreview(false);
      return;
    }

    viewportSnapshotRef.current = getViewport();
    setIsGlobalPreview(true);
    void fitView({ padding: 0.16, minZoom: 0.34, maxZoom: 0.82, duration: 420 });
  }, [fitView, getViewport, isGlobalPreview, setViewport]);

  const handleExportImages = useCallback(async () => {
    const exportableNodes = serverState.nodes.filter((node) => node.imageUrl);

    if (exportableNodes.length === 0 || isExporting) {
      return;
    }

    setIsExporting(true);

    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const failures: string[] = [];

      await Promise.all(
        exportableNodes.map(async (node) => {
          try {
            const response = await fetch(node.imageUrl as string);

            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`);
            }

            const blob = await response.blob();
            const extensionMatch = new URL(node.imageUrl as string).pathname.match(/\.(png|jpg|jpeg|webp)$/i);
            const extension =
              extensionMatch?.[1]?.toLowerCase() === "jpeg"
                ? "jpg"
                : (extensionMatch?.[1]?.toLowerCase() ?? "png");

            zip.file(
              `node-${node.publicNodeNumber}-${node.displayName.replace(/[\\/:*?"<>|]/g, "-")}.${extension}`,
              blob
            );
          } catch (error) {
            failures.push(
              `NODE ${node.publicNodeNumber} ${node.displayName}: ${
                error instanceof Error ? error.message : "下载失败"
              }`
            );
          }
        })
      );

      if (failures.length > 0) {
        zip.file("export-errors.txt", failures.join("\n"));
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const downloadUrl = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      link.href = downloadUrl;
      link.download = `voice-painting-images-${timestamp}.zip`;
      link.click();
      URL.revokeObjectURL(downloadUrl);
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, serverState.nodes]);

  return (
    <section className="workspace-pane" data-testid="canvas-panel">
      <div className="toolbar">
        <div className="toolbar-group">
          {toolbarItems.map((item) => (
            <button
              key={item.label}
              className={[
                "toolbar-icon",
                item.icon === "hand" || (item.icon === "selectionCursor" && isGlobalPreview)
                  ? "is-active"
                  : ""
              ].join(" ")}
              type="button"
              title={item.label}
              aria-label={item.label}
              onClick={() => {
                if (item.icon === "selectionCursor") {
                  handleToggleGlobalPreview();
                }
              }}
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
              onClick={() => {
                if (item.icon === "minus") {
                  void zoomOut({ duration: 240 });
                  return;
                }

                if (item.icon === "plus") {
                  void zoomIn({ duration: 240 });
                  return;
                }

                if (isGlobalPreview) {
                  void fitView({ padding: 0.16, minZoom: 0.34, maxZoom: 0.82, duration: 320 });
                  return;
                }

                if (focusLatestPreview()) {
                  return;
                }

                void fitView({ padding: 0.2, minZoom: 0.48, maxZoom: 0.88, duration: 320 });
              }}
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
              disabled={
                item.icon === "redo"
                  ? historyDisabled || !uiState.canRedo
                  : historyDisabled
              }
              onClick={() => {
                if (item.icon === "redo") {
                  void requestRedo();
                  return;
                }

                if (item.icon === "undo") {
                  void requestUndo();
                }
              }}
            >
              <span className="toolbar-icon__glyph" aria-hidden="true">
                <ToolbarGlyph icon={item.icon} />
              </span>
            </button>
          ))}
        </div>

        <div className="toolbar-export">
          <button
            type="button"
            aria-label="导出"
            title="导出"
            disabled={isExporting || serverState.nodes.every((node) => !node.imageUrl)}
            onClick={() => {
              void handleExportImages();
            }}
          >
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
            panOnDrag
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
