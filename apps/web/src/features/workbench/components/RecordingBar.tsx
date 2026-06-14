import { useRef } from "react";

import type { RecordingState } from "../types";

type RecordingBarProps = {
  prompts: string[];
  recordingState: RecordingState;
  onPromptClick: (prompt: string) => void;
  onCycleRecordingState: () => void;
  onRecordingComplete: (audio: Blob) => void;
};

const recordingCopy: Record<RecordingState, { title: string; hint: string }> = {
  idle: {
    title: "按住空格键语音输入，或补充需求",
    hint: "例如：“沿着节点 3 继续发散”“保留数量但整体更轻薄一点”"
  },
  listening: {
    title: "正在收听你的语音输入",
    hint: "继续说出节点编号、方向偏好或撤销意图。"
  },
  processing: {
    title: "系统正在理解意图并准备更新树状态",
    hint: "当前会话会优先展示最新的目标节点、确认状态和树操作结果。"
  }
};

export function RecordingBar({
  prompts,
  recordingState,
  onPromptClick,
  onCycleRecordingState,
  onRecordingComplete
}: RecordingBarProps) {
  const copy = recordingCopy[recordingState];
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const handleMicClick = async () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
      return;
    }

    if (!("MediaRecorder" in window) || !navigator.mediaDevices?.getUserMedia) {
      onCycleRecordingState();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const audio = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm"
        });
        mediaRecorderRef.current = null;
        onRecordingComplete(audio);
      };

      onCycleRecordingState();
      recorder.start();
    } catch {
      onCycleRecordingState();
    }
  };

  return (
    <footer className="sidebar-input" data-testid="voice-dock">
      <div className="prompt-suggestions">
        {prompts.map((prompt) => (
          <button key={prompt} type="button" className="prompt-chip" onClick={() => onPromptClick(prompt)}>
            {prompt}
          </button>
        ))}
      </div>

      <div className="input-panel">
        <div className="input-panel__field">
          <p>{copy.title}</p>
          <span>{copy.hint}</span>
        </div>

        <div className="input-panel__controls">
          <button className="ghost-button" type="button" aria-label="上传附件">
            +
          </button>

          <div className="input-panel__actions">
            <button
              className={["mic-button", recordingState !== "idle" ? "is-live" : ""].join(" ")}
              type="button"
              aria-label="语音输入"
              onClick={() => {
                void handleMicClick();
              }}
            >
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
  );
}
