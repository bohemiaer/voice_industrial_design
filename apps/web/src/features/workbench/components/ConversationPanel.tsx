import type { Message } from "@voice-industrial-design/shared";
import { useEffect, useRef } from "react";

import { useWorkbenchStore } from "../store";
import type { MessageDecoration } from "../types";
import { createNodeUiMeta } from "../uiMeta";
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

const rootPromptSuggestions = [
  "我想设计一款桌面智能设备，面向居家办公人群",
  "它需要解决线缆收纳、提醒和轻量交互问题",
  "风格希望更温和、轻薄、适合放在书桌上"
];

export function ConversationPanel() {
  const serverState = useWorkbenchStore((state) => state.serverState);
  const uiState = useWorkbenchStore((state) => state.uiState);
  const toggleSystemMessage = useWorkbenchStore((state) => state.toggleSystemMessage);
  const cycleRecordingState = useWorkbenchStore((state) => state.cycleRecordingState);
  const submitVoiceTurn = useWorkbenchStore((state) => state.submitVoiceTurn);
  const submitAudioTurn = useWorkbenchStore((state) => state.submitAudioTurn);
  const requestUndo = useWorkbenchStore((state) => state.requestUndo);

  const selectedNode =
    uiState.selectedNodeId === serverState.session.id
      ? null
      : serverState.nodes.find((node) => node.id === uiState.selectedNodeId) ??
        serverState.nodes[0];
  const selectedNodeIndex = selectedNode
    ? serverState.nodes.findIndex((node) => node.id === selectedNode.id)
    : -1;
  const prompts = selectedNode
    ? createNodeUiMeta(selectedNode, Math.max(selectedNodeIndex, 0)).prompts
    : rootPromptSuggestions;
  const thinkingMessage = uiState.isThinking
    ? ({
        id: "optimistic-thinking",
        sessionId: serverState.session.id,
        taskId: null,
        role: "assistant",
        kind: "status",
        content: "思考中...",
        createdAt: new Date(0).toISOString()
      } satisfies Message)
    : null;
  const visibleMessages = thinkingMessage
    ? [...serverState.messages, thinkingMessage]
    : serverState.messages;
  const scrollRegionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!scrollRegionRef.current) {
      return;
    }

    scrollRegionRef.current.scrollTop = scrollRegionRef.current.scrollHeight;
  }, [visibleMessages]);

  const handlePromptClick = (prompt: string) => {
    if (prompt.includes("撤销")) {
      void requestUndo();
      return;
    }

    void submitVoiceTurn(prompt);
  };

  return (
    <aside className="sidebar" data-testid="conversation-panel">
      <header className="sidebar-header">
        <div className="sidebar-title">
          <h2>{serverState.session.title}</h2>
          {selectedNode ? (
            <p>
              已选中 <strong>NODE {selectedNode.publicNodeNumber}</strong> · {selectedNode.displayName}
            </p>
          ) : (
            <p>当前聚焦 ROOT 需求，确认后会先更新主需求再展开节点</p>
          )}
        </div>
      </header>

      <div className="sidebar-scroll-region" ref={scrollRegionRef}>
        <div className="sidebar-stream">
          {visibleMessages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              isExpanded={uiState.expandedSystemMessageIds.includes(message.id)}
              onToggle={toggleSystemMessage}
            />
          ))}
        </div>
      </div>

      <RecordingBar
        prompts={prompts}
        recordingState={uiState.recordingState}
        liveTranscriptText={uiState.liveTranscriptText}
        onPromptClick={handlePromptClick}
        onTextSubmit={submitVoiceTurn}
        onCycleRecordingState={cycleRecordingState}
        onRecordingComplete={submitAudioTurn}
      />
    </aside>
  );
}
