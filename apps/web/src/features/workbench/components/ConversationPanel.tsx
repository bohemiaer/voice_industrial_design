import type { GenerationTask, Message } from "@voice-industrial-design/shared";

import { useWorkbenchStore } from "../store";
import type { MessageDecoration } from "../types";
import { createNodeUiMeta } from "../uiMeta";
import { ConfirmationCard } from "./ConfirmationCard";
import { CurrentTargetBanner } from "./CurrentTargetBanner";
import { IntentStatusCard } from "./IntentStatusCard";
import { RecordingBar } from "./RecordingBar";

function getIntentBadge(actionType?: MessageDecoration["actionType"]) {
  if (actionType === "expand_branches") {
    return { label: "EXPAND", className: "intent-expand" };
  }

  if (actionType === "refresh_layer") {
    return { label: "REFRESH", className: "intent-refresh" };
  }

  if (actionType === "branch_deeper") {
    return { label: "DEEPEN", className: "intent-deepen" };
  }

  return null;
}

function ChatMessage({
  message,
  decoration,
  isExpanded,
  onToggle
}: {
  message: Message;
  decoration?: MessageDecoration;
  isExpanded: boolean;
  onToggle: (messageId: string) => void;
}) {
  if (message.role === "system") {
    return (
      <details className="system-log" open={isExpanded}>
        <summary
          onClick={(event) => {
            event.preventDefault();
            onToggle(message.id);
          }}
        >
          {decoration?.summary ?? message.content}
        </summary>
        <p>{decoration?.details ?? message.content}</p>
      </details>
    );
  }

  const isUser = message.role === "user";
  const badge = getIntentBadge(decoration?.actionType);

  return (
    <div className={["chat-entry", isUser ? "is-user" : "is-ai"].join(" ")}>
      <div className={["chat-bubble", isUser ? "chat-bubble-user" : "chat-bubble-ai"].join(" ")}>
        {message.content}
      </div>
      {badge ? <span className={`intent-badge ${badge.className}`}>{badge.label}</span> : null}
    </div>
  );
}

const getActiveTask = (tasks: GenerationTask[]) =>
  tasks.find((task) => task.status === "awaiting_confirmation" || task.status === "generating") ??
  tasks[tasks.length - 1] ??
  null;

export function ConversationPanel() {
  const fixture = useWorkbenchStore((state) => state.fixture);
  const serverState = useWorkbenchStore((state) => state.serverState);
  const uiState = useWorkbenchStore((state) => state.uiState);
  const toggleSystemMessage = useWorkbenchStore((state) => state.toggleSystemMessage);
  const confirmPendingAction = useWorkbenchStore((state) => state.confirmPendingAction);
  const cancelPendingAction = useWorkbenchStore((state) => state.cancelPendingAction);
  const cycleRecordingState = useWorkbenchStore((state) => state.cycleRecordingState);
  const setRecordingState = useWorkbenchStore((state) => state.setRecordingState);
  const selectNode = useWorkbenchStore((state) => state.selectNode);
  const submitVoiceTurn = useWorkbenchStore((state) => state.submitVoiceTurn);
  const submitAudioTurn = useWorkbenchStore((state) => state.submitAudioTurn);
  const requestUndo = useWorkbenchStore((state) => state.requestUndo);

  const selectedNode =
    serverState.nodes.find((node) => node.id === uiState.selectedNodeId) ?? serverState.nodes[0];
  const currentTargetNode =
    serverState.nodes.find((node) => node.id === uiState.currentTargetNodeId) ?? null;
  const activeTask = getActiveTask(serverState.generationTasks);
  const selectedNodeIndex = serverState.nodes.findIndex((node) => node.id === selectedNode.id);
  const prompts =
    fixture.nodeUiMeta[selectedNode.id]?.prompts ??
    createNodeUiMeta(selectedNode, Math.max(selectedNodeIndex, 0)).prompts;

  const handlePromptClick = (prompt: string) => {
    if (uiState.dataMode === "api") {
      if (prompt.includes("撤销")) {
        void requestUndo();
        return;
      }

      void submitVoiceTurn(prompt);
      return;
    }

    const matchedNode = serverState.nodes.find(
      (node) =>
        prompt.includes(node.displayName) ||
        prompt.includes(`节点 ${node.publicNodeNumber}`) ||
        prompt.includes(`节点${node.publicNodeNumber}`)
    );

    if (matchedNode) {
      selectNode(matchedNode.id);
      setRecordingState("processing");
      return;
    }

    if (prompt.includes("撤销")) {
      useWorkbenchStore.getState().setScenario("undo-review");
      return;
    }

    if (prompt.includes("刷新")) {
      useWorkbenchStore.getState().setScenario("refresh-layer");
      return;
    }

    if (prompt.includes("继续发散") || prompt.includes("子方向")) {
      useWorkbenchStore.getState().setScenario("branch-review");
      return;
    }

    setRecordingState("listening");
  };

  return (
    <aside className="sidebar" data-testid="conversation-panel">
      <header className="sidebar-header">
        <div className="sidebar-title">
          <h2>{serverState.session.title}</h2>
          <p>
            已选中 <strong>NODE {selectedNode.publicNodeNumber}</strong> · {selectedNode.displayName}
          </p>
        </div>
      </header>

      <div className="sidebar-scroll-region">
        <CurrentTargetBanner
          selectedNode={selectedNode}
          currentTargetNode={currentTargetNode}
          summary={uiState.lastActionSummary}
        />

        <IntentStatusCard task={activeTask} />
        <ConfirmationCard
          pendingAction={uiState.pendingAction}
          onConfirm={confirmPendingAction}
          onCancel={cancelPendingAction}
        />

        <section className="sidebar-focus">
          <span className="sidebar-focus__label">Current focus</span>
          <h3>{selectedNode.displayName}</h3>
          <p>{selectedNode.intentSummary}</p>
        </section>

        <div className="sidebar-stream">
          {serverState.messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              decoration={fixture.messageDecorations[message.id]}
              isExpanded={uiState.expandedSystemMessageIds.includes(message.id)}
              onToggle={toggleSystemMessage}
            />
          ))}
        </div>
      </div>

      <RecordingBar
        prompts={prompts}
        recordingState={uiState.recordingState}
        onPromptClick={handlePromptClick}
        onCycleRecordingState={cycleRecordingState}
        onRecordingComplete={(audio) => {
          void submitAudioTurn(audio);
        }}
      />
    </aside>
  );
}
