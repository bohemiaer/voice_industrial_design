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
import { resolveRootNodeDisplayName } from "../copy";
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
const nodeCardWidth = 290;
const suggestionTreeWidth = 410;
const suggestionTreeOverhang = (suggestionTreeWidth - nodeCardWidth) / 2;

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

const exportCardWidth = 400;
const exportCardHeight = 470;

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

function sanitizeFileSegment(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "-").slice(0, 80);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("图片读取失败"));
    reader.readAsDataURL(blob);
  });
}

async function fetchImageDataUrl(imageUrl: string): Promise<string> {
  const response = await fetch(imageUrl);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return readBlobAsDataUrl(await response.blob());
}

async function resolveExportImageHref(imageUrl: string): Promise<string> {
  try {
    return await fetchImageDataUrl(imageUrl);
  } catch {
    return imageUrl;
  }
}

function wrapExportText(value: string, maxCharacters: number, maxLines: number): string[] {
  const normalized = value.replace(/\s+/g, " ").trim();
  const lines: string[] = [];
  let current = "";

  for (const character of normalized) {
    if (current.length >= maxCharacters) {
      lines.push(current);
      current = "";
    }

    current += character;

    if (lines.length === maxLines) {
      break;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  if (lines.length === maxLines && normalized.length > lines.join("").length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, -1)}...`;
  }

  return lines;
}

function renderExportTspans(input: {
  lines: string[];
  x: number;
  y: number;
  lineHeight: number;
}): string {
  return input.lines
    .map((line, index) => {
      if (index === 0) {
        return `<tspan x="${input.x}" y="${input.y}">${escapeHtml(line)}</tspan>`;
      }

      return `<tspan x="${input.x}" dy="${input.lineHeight}">${escapeHtml(line)}</tspan>`;
    })
    .join("");
}

function createNodeExportSvg(node: TreeNode, imageHref: string): string {
  const titleLines = wrapExportText(node.displayName, 11, 2);
  const summaryLines = wrapExportText(node.intentSummary, 17, 3);
  const summaryY = 146 + Math.max(titleLines.length - 1, 0) * 32;
  const imageY = Math.min(summaryY + summaryLines.length * 28 + 26, 220);

  // SVG is exported directly to avoid tainted canvas failures from cross-origin generated images.
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${exportCardWidth}" height="${exportCardHeight}" viewBox="0 0 ${exportCardWidth} ${exportCardHeight}">
  <defs>
    <filter id="cardShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#1d232b" flood-opacity="0.10"/>
    </filter>
    <clipPath id="imageClip">
      <rect x="31" y="${imageY}" width="334" height="222" rx="15" ry="15"/>
    </clipPath>
  </defs>
  <rect width="400" height="470" fill="#f4f5f3"/>
  <rect x="0.5" y="6.5" width="399" height="466" rx="26" fill="#ffffff" stroke="#cfd6e0" filter="url(#cardShadow)"/>
  <circle cx="200" cy="6" r="6" fill="#ffffff" stroke="#cfd6e0" stroke-width="3"/>
  <text x="31" y="44" fill="#6f7784" font-size="14" font-weight="800" letter-spacing="4" font-family="Segoe UI, PingFang SC, Microsoft YaHei, sans-serif">节点 ${node.publicNodeNumber}</text>
  <circle cx="360" cy="40" r="6" fill="#b7bec8"/>
  <line x1="7" y1="70" x2="392" y2="70" stroke="#dde2e8"/>
  <text fill="#0f1720" font-size="28" font-weight="900" font-family="Segoe UI, PingFang SC, Microsoft YaHei, sans-serif">
    ${renderExportTspans({ lines: titleLines, x: 31, y: 118, lineHeight: 32 })}
  </text>
  <text fill="#6b7280" font-size="18" font-weight="500" font-family="Segoe UI, PingFang SC, Microsoft YaHei, sans-serif">
    ${renderExportTspans({ lines: summaryLines, x: 31, y: summaryY, lineHeight: 28 })}
  </text>
  <rect x="31" y="${imageY}" width="334" height="222" rx="15" fill="#f4f6f8" stroke="#d7dde5"/>
  <image href="${escapeHtml(imageHref)}" x="31" y="${imageY}" width="334" height="222" preserveAspectRatio="xMidYMid slice" clip-path="url(#imageClip)"/>
</svg>`;
}

async function renderNodeExportImage(node: TreeNode): Promise<Blob> {
  if (!node.imageUrl) {
    throw new Error("节点没有可导出的图片");
  }

  const imageHref = await resolveExportImageHref(node.imageUrl);
  const svg = createNodeExportSvg(node, imageHref);

  return new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
}

function ToolbarGlyph({ icon }: { icon: string }) {
  if (icon === "zoom-label") {
    return <span className="toolbar-icon__text">100%</span>;
  }

  const commonProps = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const
  };

  const paths: Record<string, JSX.Element> = {
    selectionCursor: (
      <svg {...commonProps}>
        <rect x="5" y="5" width="6" height="6" rx="1.4" />
        <rect x="13" y="13" width="6" height="6" rx="1.4" />
        <path d="M11 8h5" />
        <path d="M16 8v5" />
      </svg>
    ),
    hand: (
      <svg {...commonProps}>
        <path d="M7.8 12.1V8.4a1.25 1.25 0 0 1 2.5 0v4" />
        <path d="M10.3 11.5V6.7a1.25 1.25 0 0 1 2.5 0v4.8" />
        <path d="M12.8 11.6V7.3a1.25 1.25 0 0 1 2.5 0v4.9" />
        <path d="M15.3 12.7V9.1a1.25 1.25 0 0 1 2.5 0v4.1c0 4.3-2.7 7-6.5 7-2.8 0-4.6-1.3-5.8-3.7l-.9-1.8a1.2 1.2 0 0 1 2.1-1.2l1.1 1.7v-3.1" />
      </svg>
    ),
    frame: (
      <svg {...commonProps}>
        <path d="M5 9V5h4" />
        <path d="M15 5h4v4" />
        <path d="M19 15v4h-4" />
        <path d="M9 19H5v-4" />
      </svg>
    ),
    minus: (
      <svg {...commonProps}>
        <path d="M6 12h12" />
      </svg>
    ),
    plus: (
      <svg {...commonProps}>
        <path d="M12 6v12" />
        <path d="M6 12h12" />
      </svg>
    ),
    undo: (
      <svg {...commonProps}>
        <path d="m9 8-4 4 4 4" />
        <path d="M5 12h9a4.5 4.5 0 1 1 0 9h-2" />
      </svg>
    ),
    redo: (
      <svg {...commonProps}>
        <path d="m15 8 4 4-4 4" />
        <path d="M19 12h-9a4.5 4.5 0 1 0 0 9h2" />
      </svg>
    ),
    export: (
      <svg {...commonProps}>
        <path d="M12 4v10" />
        <path d="m8 8 4-4 4 4" />
        <path d="M5 14v3.5A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5V14" />
      </svg>
    )
  };

  return paths[icon] ?? null;
}

export function CanvasWorkspace() {
  const serverState = useWorkbenchStore((state) => state.serverState);
  const uiState = useWorkbenchStore((state) => state.uiState);
  const selectNode = useWorkbenchStore((state) => state.selectNode);
  const setInputDraft = useWorkbenchStore((state) => state.setInputDraft);
  const requestUndo = useWorkbenchStore((state) => state.requestUndo);
  const requestRedo = useWorkbenchStore((state) => state.requestRedo);
  const { fitBounds, fitView, getViewport, setViewport, zoomIn, zoomOut } = useReactFlow();
  const viewportSnapshotRef = useRef<Viewport | null>(null);
  const workspacePaneRef = useRef<HTMLElement | null>(null);
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
      suggestedFollowups: [
        "先发散三个造型方向",
        "更强调使用场景",
        "补充材质和品牌气质"
      ],
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
      const hasSuggestedFollowups =
        Boolean(node.parentNodeId) &&
        node.status !== "generating" &&
        node.suggestedFollowups.length > 0;
      const meta = {
        ...createNodeUiMeta(node, index),
        position: layoutPosition
      };
      const flowPosition = hasSuggestedFollowups
        ? {
            ...layoutPosition,
            x: layoutPosition.x - suggestionTreeOverhang
          }
        : layoutPosition;

      return {
        id: node.id,
        type: "brainstorm",
        position: flowPosition,
        style: hasSuggestedFollowups ? { width: suggestionTreeWidth } : undefined,
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
          onSelect: selectNode,
          onSuggestedFollowupClick: setInputDraft
        }
      };
    });
  }, [
    childMap,
    selectNode,
    setInputDraft,
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
      bounds.height + 280,
      520
    );
    const topPadding = (expandedHeight - bounds.height) * 0.28;

    void fitBounds(
      {
        x: bounds.x - (expandedWidth - bounds.width) / 2,
        y: bounds.y - topPadding,
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

  const focusDefaultWorkspace = useCallback(() => {
    const workspacePane = workspacePaneRef.current;
    const rootCard = workspacePane?.querySelector(".node-card.is-root");

    if (!workspacePane || !rootCard) {
      return;
    }

    const paneRect = workspacePane.getBoundingClientRect();
    const rootRect = rootCard.getBoundingClientRect();
    const currentViewport = getViewport();
    const desiredCenterX = paneRect.left + paneRect.width * 0.5;
    const desiredCenterY = paneRect.top + paneRect.height * 0.42;
    const currentCenterX = rootRect.left + rootRect.width / 2;
    const currentCenterY = rootRect.top + rootRect.height / 2;

    void setViewport(
      {
        ...currentViewport,
        x: currentViewport.x + desiredCenterX - currentCenterX,
        y: currentViewport.y + desiredCenterY - currentCenterY
      },
      { duration: 420 }
    );
  }, [getViewport, setViewport]);

  useEffect(() => {
    if (isGlobalPreview) {
      return;
    }

    const focusTimers = [120, 360, 720].map((delay) => window.setTimeout(() => {
      if (focusLatestPreview()) {
        return;
      }

      focusDefaultWorkspace();
    }, delay));

    return () => {
      focusTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [flowNodeIds, focusDefaultWorkspace, focusLatestPreview, isGlobalPreview]);

  useEffect(() => {
    if (isGlobalPreview) {
      return;
    }

    const handleResize = () => {
      window.requestAnimationFrame(focusDefaultWorkspace);
    };

    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, [focusDefaultWorkspace, isGlobalPreview]);

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

      await Promise.all(
        exportableNodes.map(async (node) => {
          const blob = await renderNodeExportImage(node);

          zip.file(
            `node-card-${node.publicNodeNumber}-${sanitizeFileSegment(node.displayName)}.svg`,
            blob
          );
        })
      );

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const downloadUrl = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      link.href = downloadUrl;
      link.download = `voice-painting-node-cards-${timestamp}.zip`;
      link.click();
      URL.revokeObjectURL(downloadUrl);
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, serverState.nodes]);

  return (
    <section className="workspace-pane" data-testid="canvas-panel" ref={workspacePaneRef}>
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

                focusDefaultWorkspace();
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
