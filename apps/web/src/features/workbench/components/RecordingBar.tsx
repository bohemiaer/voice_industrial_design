import { useCallback, useEffect, useRef, useState } from "react";

import type { RecordingState } from "../types";

type RecordingBarProps = {
  prompts: string[];
  recordingState: RecordingState;
  liveTranscriptText: string | null;
  onPromptClick: (prompt: string) => void;
  onTextSubmit: (text: string) => Promise<void>;
  onCycleRecordingState: () => void;
  onRecordingComplete: (audio: Blob) => void;
};

type RecordingSession = {
  audioContext: AudioContext;
  chunks: Float32Array[];
  finalizeTimeoutId: number | null;
  gainNode: GainNode;
  processorNode: ScriptProcessorNode;
  sourceNode: MediaStreamAudioSourceNode;
  stopRequested: boolean;
  stream: MediaStream;
};

const recordingCopy: Record<RecordingState, { title: string; hint: string }> = {
  idle: {
    title: "按住空格键语音输入，或补充需求",
    hint: "例如：“沿着节点 3 继续发散”“保留数量但整体更轻薄一点”"
  },
  listening: {
    title: "按住空格正在录音",
    hint: "松开空格后会立刻上传录音并转成文字。"
  },
  processing: {
    title: "正在转文字",
    hint: "识别完成后会先显示文字，再继续生成设计节点。"
  }
};

function mergeAudioChunks(chunks: Float32Array[]): Float32Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  return merged;
}

function encodeWaveFile(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const channelCount = 1;
  const bytesPerSample = 2;
  const dataSize = samples.length * channelCount * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[sampleIndex]));
    const pcmValue = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    view.setInt16(44 + sampleIndex * bytesPerSample, pcmValue, true);
  }

  return buffer;
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

export function RecordingBar({
  prompts,
  recordingState,
  liveTranscriptText,
  onPromptClick,
  onTextSubmit,
  onCycleRecordingState,
  onRecordingComplete
}: RecordingBarProps) {
  const copy = recordingCopy[recordingState];
  const inputPlaceholder = "例如：输入“确认”继续，或直接描述新的节点方向调整";
  const recordingSessionRef = useRef<RecordingSession | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const isSpaceRecordingRef = useRef(false);
  const [textInput, setTextInput] = useState("");

  const finalizeRecording = useCallback(async (session: RecordingSession) => {
    if (recordingSessionRef.current === session) {
      recordingSessionRef.current = null;
    }

    if (session.finalizeTimeoutId !== null) {
      window.clearTimeout(session.finalizeTimeoutId);
      session.finalizeTimeoutId = null;
    }

    session.processorNode.onaudioprocess = null;
    session.sourceNode.disconnect();
    session.processorNode.disconnect();
    session.gainNode.disconnect();
    session.stream.getTracks().forEach((track) => track.stop());

    try {
      if (session.chunks.length === 0) {
        onCycleRecordingState();
        onCycleRecordingState();
        return;
      }

      const audio = new Blob(
        [encodeWaveFile(mergeAudioChunks(session.chunks), session.audioContext.sampleRate)],
        { type: "audio/wav" }
      );

      onRecordingComplete(audio);
    } finally {
      await session.audioContext.close();
    }
  }, [onCycleRecordingState, onRecordingComplete]);

  const stopRecording = useCallback(async () => {
    const session = recordingSessionRef.current;

    if (!session) {
      return;
    }

    session.stopRequested = true;

    if (session.chunks.length > 0) {
      await finalizeRecording(session);
      return;
    }

    session.finalizeTimeoutId = window.setTimeout(() => {
      if (session.stopRequested) {
        void finalizeRecording(session);
      }
    }, 150);
  }, [finalizeRecording]);

  const startRecording = useCallback(async () => {
    if (recordingSessionRef.current) {
      return;
    }

    if (!("AudioContext" in window) || !navigator.mediaDevices?.getUserMedia) {
      onCycleRecordingState();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = new AudioContext();
      await audioContext.resume();

      const sourceNode = audioContext.createMediaStreamSource(stream);
      const processorNode = audioContext.createScriptProcessor(4096, 1, 1);
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 0;

      const chunks: Float32Array[] = [];
      processorNode.onaudioprocess = (event) => {
        chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));

        if (recordingSessionRef.current?.stopRequested) {
          void finalizeRecording(recordingSessionRef.current);
        }
      };

      sourceNode.connect(processorNode);
      processorNode.connect(gainNode);
      gainNode.connect(audioContext.destination);

      recordingSessionRef.current = {
        audioContext,
        chunks,
        finalizeTimeoutId: null,
        gainNode,
        processorNode,
        stopRequested: false,
        sourceNode,
        stream
      };

      onCycleRecordingState();
    } catch {
      onCycleRecordingState();
    }
  }, [onCycleRecordingState]);

  const handleMicClick = async () => {
    if (recordingSessionRef.current) {
      await stopRecording();
      return;
    }

    await startRecording();
  };

  const handleTextSubmit = async () => {
    const trimmed = textInput.trim();

    if (!trimmed) {
      return;
    }

    setTextInput("");
    await onTextSubmit(trimmed);
  };

  useEffect(() => {
    const textArea = textAreaRef.current;

    if (!textArea) {
      return;
    }

    textArea.style.height = "0px";
    textArea.style.height = `${textArea.scrollHeight}px`;
  }, [textInput]);

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }

      return (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" && !event.repeat && !isEditableTarget(event.target)) {
        event.preventDefault();

        if (!isSpaceRecordingRef.current) {
          isSpaceRecordingRef.current = true;
          void startRecording();
        }
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space" && isSpaceRecordingRef.current) {
        event.preventDefault();
        isSpaceRecordingRef.current = false;
        void stopRecording();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);

      if (recordingSessionRef.current) {
        void stopRecording();
      }
    };
  }, [startRecording, stopRecording]);

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
          <textarea
            ref={textAreaRef}
            className="input-panel__text-input"
            value={textInput}
            placeholder={inputPlaceholder}
            rows={1}
            onChange={(event) => setTextInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void handleTextSubmit();
              }
            }}
          />
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
            <button
              className="submit-button"
              type="button"
              aria-label="发送"
              onClick={() => {
                void handleTextSubmit();
              }}
            >
              ↑
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
