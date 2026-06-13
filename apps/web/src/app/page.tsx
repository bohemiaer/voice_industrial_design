"use client";

import { useMemo, useState } from "react";
import type {
  BrainstormActionType,
  Message,
  Session,
  TreeNode
} from "@voice-industrial-design/shared";

type NodePalette = "teal" | "amber" | "blue" | "sand" | "mist" | "ghost";

type MessageViewModel = {
  message: Message;
  summary?: string;
  details?: string;
  actionType?: BrainstormActionType;
};

type NodeUiMeta = {
  palette: NodePalette;
  prompts: string[];
};

const toolbarItems = [
  { label: "指针", active: true },
  { label: "拖拽" },
  { label: "框选" }
];

const zoomItems = ["-", "100%", "+"];
const historyItems = ["撤销", "重做"];

const mockSession: Session = {
  id: "session-01",
  title: "便携补光设备脑暴",
  goal: "为城市通勤者探索轻便、克制且有专业器材感的手持补光设备方向。",
  productDomain: "industrial_design",
  activeNodeId: "node-3",
  pendingNodeId: "node-7",
  lastMentionedNodeId: "node-3",
  nextPublicNodeNumber: 8,
  createdAt: "2026-06-13T00:00:00+08:00",
  updatedAt: "2026-06-13T00:08:00+08:00"
};

const mockMessages: MessageViewModel[] = [
  {
    message: {
      id: "m1",
      sessionId: mockSession.id,
      taskId: null,
      role: "user",
      kind: "transcript",
      content:
        "我们要做一款给城市通勤者用的手持补光设备，最好轻便、克制，但拿在手里要有一点专业器材感。",
      createdAt: "2026-06-13T00:01:00+08:00"
    }
  },
  {
    message: {
      id: "m2",
      sessionId: mockSession.id,
      taskId: "task-root",
      role: "system",
      kind: "status",
      content: "已运行 1 条命令",
      createdAt: "2026-06-13T00:01:10+08:00"
    },
    summary: "已运行 1 条命令",
    details: "已根据初始需求创建根节点，并生成第一层 3 个概念方向。"
  },
  {
    message: {
      id: "m3",
      sessionId: mockSession.id,
      taskId: "task-root",
      role: "assistant",
      kind: "summary",
      content:
        "我先沿着便携感、器材感和家居亲和度三个轴向发散，生成了 3 个差异明显的初步方向。",
      createdAt: "2026-06-13T00:01:20+08:00"
    },
    actionType: "expand_branches"
  },
  {
    message: {
      id: "m4",
      sessionId: mockSession.id,
      taskId: null,
      role: "user",
      kind: "transcript",
      content: "选节点 3，再往下做几个更偏极简科技、但保留握持安全感的子方向。",
      createdAt: "2026-06-13T00:02:00+08:00"
    }
  },
  {
    message: {
      id: "m5",
      sessionId: mockSession.id,
      taskId: "task-select",
      role: "system",
      kind: "status",
      content: "已运行 2 条命令",
      createdAt: "2026-06-13T00:02:08+08:00"
    },
    summary: "已运行 2 条命令",
    details: "已选择“极简器材感”（节点 3）。当前准备沿该节点继续下钻生成 3 个子方向。"
  },
  {
    message: {
      id: "m6",
      sessionId: mockSession.id,
      taskId: "task-confirm",
      role: "assistant",
      kind: "confirmation",
      content:
        "意图识别：沿着 3 号节点继续向下探索，并加入“更极简、保留握持安全感”的约束。确认后将新增 3 个子方向。",
      createdAt: "2026-06-13T00:02:14+08:00"
    },
    actionType: "branch_deeper"
  },
  {
    message: {
      id: "m7",
      sessionId: mockSession.id,
      taskId: null,
      role: "user",
      kind: "transcript",
      content: "确认，继续。",
      createdAt: "2026-06-13T00:02:20+08:00"
    }
  },
  {
    message: {
      id: "m8",
      sessionId: mockSession.id,
      taskId: "task-generate",
      role: "system",
      kind: "status",
      content: "已运行 5 条命令",
      createdAt: "2026-06-13T00:02:28+08:00"
    },
    summary: "已运行 5 条命令",
    details: "正在生成节点 7。完成后会自动折叠为一条摘要，展开后可以查看本轮完整执行细节。"
  }
];

const mockTreeNodes: TreeNode[] = [
  {
    id: "root",
    sessionId: mockSession.id,
    parentNodeId: null,
    depth: 0,
    displayName: "启动：便携补光设备",
    label: "root-brief",
    publicNodeNumber: 1,
    layerOrdinal: 1,
    layerVersion: 1,
    voiceAliases: ["启动", "根节点", "便携补光设备"],
    intentSummary:
      "用于项目 kickoff 的初始需求。目标是让设备看起来轻便克制，但握持时仍保留专业器材的可靠感。",
    formLanguage: ["轻便", "克制", "器材感"],
    userNeedResponse: ["便于通勤携带", "保持专业可靠印象"],
    inspirationHints: ["摄影器材", "紧凑型电子设备"],
    imageUrl: null,
    status: "ready",
    createdAt: "2026-06-13T00:01:00+08:00",
    updatedAt: "2026-06-13T00:01:00+08:00"
  },
  {
    id: "node-2",
    sessionId: mockSession.id,
    parentNodeId: "root",
    depth: 1,
    displayName: "折线工具感",
    label: "angular-tooling",
    publicNodeNumber: 2,
    layerOrdinal: 1,
    layerVersion: 1,
    voiceAliases: ["节点二", "折线工具感", "第一个方向"],
    intentSummary: "强调结构分件与防护包边，轮廓更硬朗，适合传达户外使用和设备级可靠性。",
    formLanguage: ["折线", "硬朗", "防护"],
    userNeedResponse: ["更耐用", "更专业"],
    inspirationHints: ["户外工具", "工业设备"],
    imageUrl: null,
    status: "ready",
    createdAt: "2026-06-13T00:01:10+08:00",
    updatedAt: "2026-06-13T00:01:10+08:00"
  },
  {
    id: "node-3",
    sessionId: mockSession.id,
    parentNodeId: "root",
    depth: 1,
    displayName: "极简器材感",
    label: "minimal-gear",
    publicNodeNumber: 3,
    layerOrdinal: 2,
    layerVersion: 1,
    voiceAliases: ["节点三", "极简器材感", "第二个方向"],
    intentSummary: "主体表面更完整，减少切线与装饰，像消费电子与摄影器材之间的折中语言。",
    formLanguage: ["完整表面", "简洁", "器材感"],
    userNeedResponse: ["更轻便", "更干净", "仍然可靠"],
    inspirationHints: ["消费电子", "摄影器材"],
    imageUrl: null,
    status: "ready",
    createdAt: "2026-06-13T00:01:10+08:00",
    updatedAt: "2026-06-13T00:02:08+08:00"
  },
  {
    id: "node-4",
    sessionId: mockSession.id,
    parentNodeId: "root",
    depth: 1,
    displayName: "柔和居家化",
    label: "soft-home",
    publicNodeNumber: 4,
    layerOrdinal: 3,
    layerVersion: 1,
    voiceAliases: ["节点四", "柔和居家化", "第三个方向"],
    intentSummary: "边角更圆润，CMF 更轻，适合强调友好感与低门槛上手体验。",
    formLanguage: ["圆润", "柔和", "亲和"],
    userNeedResponse: ["容易上手", "日常友好"],
    inspirationHints: ["桌面家居", "生活电器"],
    imageUrl: null,
    status: "ready",
    createdAt: "2026-06-13T00:01:10+08:00",
    updatedAt: "2026-06-13T00:01:10+08:00"
  },
  {
    id: "node-5",
    sessionId: mockSession.id,
    parentNodeId: "node-3",
    depth: 2,
    displayName: "收窄握把",
    label: "narrow-grip",
    publicNodeNumber: 5,
    layerOrdinal: 1,
    layerVersion: 1,
    voiceAliases: ["节点五", "收窄握把", "子方向一"],
    intentSummary: "通过中段收腰和更明确的拇指停靠位置，强化单手握持的安全感与控制感。",
    formLanguage: ["收腰", "握持引导", "安全感"],
    userNeedResponse: ["单手稳固", "长时间握持"],
    inspirationHints: ["手柄设备", "掌心定位"],
    imageUrl: null,
    status: "ready",
    createdAt: "2026-06-13T00:02:20+08:00",
    updatedAt: "2026-06-13T00:02:20+08:00"
  },
  {
    id: "node-6",
    sessionId: mockSession.id,
    parentNodeId: "node-3",
    depth: 2,
    displayName: "纯平轮廓",
    label: "flat-profile",
    publicNodeNumber: 6,
    layerOrdinal: 2,
    layerVersion: 1,
    voiceAliases: ["节点六", "纯平轮廓", "子方向二"],
    intentSummary: "整体更贴近口袋化设备，造型更克制，但通过边缘厚度保留器材级支撑感。",
    formLanguage: ["纯平", "克制", "薄型"],
    userNeedResponse: ["更易携带", "保持稳固"],
    inspirationHints: ["口袋设备", "平板边缘"],
    imageUrl: null,
    status: "ready",
    createdAt: "2026-06-13T00:02:20+08:00",
    updatedAt: "2026-06-13T00:02:20+08:00"
  },
  {
    id: "node-7",
    sessionId: mockSession.id,
    parentNodeId: "node-3",
    depth: 2,
    displayName: "生成中",
    label: "in-progress",
    publicNodeNumber: 7,
    layerOrdinal: 3,
    layerVersion: 1,
    voiceAliases: ["节点七", "生成中", "子方向三"],
    intentSummary: "系统正在根据“扫描倾角”和“安全握持”约束生成新的子方向，请稍候。",
    formLanguage: ["待生成"],
    userNeedResponse: ["等待系统返回"],
    inspirationHints: ["处理中"],
    imageUrl: null,
    status: "generating",
    createdAt: "2026-06-13T00:02:20+08:00",
    updatedAt: "2026-06-13T00:02:28+08:00"
  }
];

const nodeUiMeta: Record<string, NodeUiMeta> = {
  root: {
    palette: "teal",
    prompts: ["读一下当前层", "再给我 2 个更偏专业器材感的方向", "整体更轻一点"]
  },
  "node-2": {
    palette: "amber",
    prompts: ["沿着节点 2 继续发散", "保留方向但更精致一点", "读一下这个方向的特点"]
  },
  "node-3": {
    palette: "blue",
    prompts: ["沿着节点 3 继续发散", "保留数量但更轻薄一点", "做一个带握持倾角的方向"]
  },
  "node-4": {
    palette: "sand",
    prompts: ["选节点 4", "让它更适合卧室和桌面环境", "再柔和一点但别太家电化"]
  },
  "node-5": {
    palette: "teal",
    prompts: ["继续沿着节点 5 做 3 个子方向", "更适合长时间单手握持", "保持结构但更圆润一点"]
  },
  "node-6": {
    palette: "mist",
    prompts: ["选节点 6", "保留纯平轮廓但更稳手", "做两个更有品牌气质的方向"]
  },
  "node-7": {
    palette: "ghost",
    prompts: ["撤销上一轮", "读一下当前状态", "如果不对就取消这一轮"]
  }
};

function getIntentBadge(actionType?: BrainstormActionType) {
  if (actionType === "expand_branches") {
    return { label: "EXPAND", className: "intent-expand" };
  }

  if (actionType === "branch_deeper") {
    return { label: "DEEPEN", className: "intent-deepen" };
  }

  return null;
}

function ChatMessage({ message, summary, details, actionType }: MessageViewModel) {
  if (message.role === "system") {
    return (
      <details className="system-log">
        <summary>{summary ?? message.content}</summary>
        <p>{details ?? message.content}</p>
      </details>
    );
  }

  const isUser = message.role === "user";
  const badge = getIntentBadge(actionType);

  return (
    <div className={["chat-entry", isUser ? "is-user" : "is-ai"].join(" ")}>
      <div className={["chat-bubble", isUser ? "chat-bubble-user" : "chat-bubble-ai"].join(" ")}>
        {message.content}
      </div>
      {badge ? <span className={`intent-badge ${badge.className}`}>{badge.label}</span> : null}
    </div>
  );
}

function HomePage() {
  const [selectedNodeId, setSelectedNodeId] = useState(
    mockSession.activeNodeId ?? mockTreeNodes[0].id
  );

  const nodeMap = useMemo(
    () => Object.fromEntries(mockTreeNodes.map((node) => [node.id, node])),
    []
  ) as Record<string, TreeNode>;

  const childMap = useMemo(() => {
    return mockTreeNodes.reduce<Record<string, string[]>>((acc, node) => {
      const parentId = node.parentNodeId ?? "__root__";
      if (!acc[parentId]) {
        acc[parentId] = [];
      }

      acc[parentId].push(node.id);
      return acc;
    }, {});
  }, []);

  const selectedNode = nodeMap[selectedNodeId] ?? mockTreeNodes[0];

  const renderNode = (nodeId: string): JSX.Element | null => {
    const node = nodeMap[nodeId];

    if (!node) {
      return null;
    }

    const isSelected = selectedNodeId === node.id;
    const uiMeta = nodeUiMeta[node.id];
    const children = childMap[node.id] ?? [];
    const nodeTag = node.parentNodeId ? `NODE ${node.publicNodeNumber}` : "ROOT";

    return (
      <div className="tree-node" key={node.id}>
        <div className="node-shell">
          <button
            className={[
              "node-card",
              isSelected ? "is-selected" : "",
              node.status === "generating" ? "is-generating" : "",
              `palette-${uiMeta.palette}`
            ]
              .filter(Boolean)
              .join(" ")}
            type="button"
            data-testid={`node-button-${node.id}`}
            aria-pressed={isSelected}
            onClick={() => setSelectedNodeId(node.id)}
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

          {node.parentNodeId ? <span className="port port-left" aria-hidden="true" /> : null}
          {children.length > 0 ? <span className="port port-right" aria-hidden="true" /> : null}
          {isSelected && node.status !== "generating" ? (
            <div className="node-corners" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </div>
          ) : null}
        </div>

        {children.length > 0 ? (
          <div className="tree-children">
            <div className="tree-branch-rail" aria-hidden="true" />
            <div className="tree-children__list">{children.map((childId) => renderNode(childId))}</div>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <main className="workbench-page">
      <section className="workbench-shell" data-testid="workbench-shell">
        <div className="workspace-pane" data-testid="canvas-panel">
          <div className="toolbar">
            <div className="toolbar-group">
              {toolbarItems.map((item) => (
                <button
                  key={item.label}
                  className={["toolbar-icon", item.active ? "is-active" : ""].join(" ")}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="toolbar-group">
              {zoomItems.map((item) => (
                <button
                  key={item}
                  className={item === "100%" ? "toolbar-zoom-label" : "toolbar-icon"}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="toolbar-group">
              {historyItems.map((item) => (
                <button key={item} className="toolbar-icon" type="button">
                  {item}
                </button>
              ))}
            </div>

            <div className="toolbar-export">
              <button type="button">导出</button>
            </div>
          </div>

          <div className="canvas-scroll">
            <div className="canvas-stage">{renderNode("root")}</div>
          </div>
        </div>

        <aside className="sidebar" data-testid="conversation-panel">
          <header className="sidebar-header">
            <div className="sidebar-title">
              <h2>{mockSession.title}</h2>
              <p>
                已选中 <strong>NODE {selectedNode.publicNodeNumber}</strong> ·{" "}
                {selectedNode.displayName}
              </p>
            </div>
          </header>

          <div className="sidebar-scroll-region">
            <section className="sidebar-focus">
              <span className="sidebar-focus__label">当前焦点</span>
              <h3>{selectedNode.displayName}</h3>
              <p>{selectedNode.intentSummary}</p>
            </section>

            <div className="sidebar-stream">
              {mockMessages.map((message) => (
                <ChatMessage key={message.message.id} {...message} />
              ))}
            </div>
          </div>

          <footer className="sidebar-input" data-testid="voice-dock">
            <div className="prompt-suggestions">
              {(nodeUiMeta[selectedNode.id]?.prompts ?? []).map((prompt) => (
                <button key={prompt} type="button" className="prompt-chip">
                  {prompt}
                </button>
              ))}
            </div>

            <div className="input-panel">
              <div className="input-panel__field">
                <p>按住空格键语音输入，或补充需求</p>
                <span>例如：“沿着节点 3 继续发散”“保留数量但整体更轻薄一点”</span>
              </div>

              <div className="input-panel__controls">
                <button className="ghost-button" type="button" aria-label="上传附件">
                  +
                </button>

                <div className="input-panel__actions">
                  <button className="mic-button is-live" type="button" aria-label="语音输入">
                    <span className="mic-dot" />
                    <span className="mic-wave" />
                  </button>
                  <button className="submit-button" type="button" aria-label="发送">
                    ↑
                  </button>
                </div>
              </div>
            </div>
          </footer>
        </aside>
      </section>
    </main>
  );
}

export default HomePage;
