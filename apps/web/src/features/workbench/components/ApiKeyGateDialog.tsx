"use client";

type ApiKeyGateDialogProps = {
  title: string;
  description: string;
  registrationUrl: string;
  value: string;
  error: string | null;
  isSaving: boolean;
  onClose: () => void;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

export function ApiKeyGateDialog({
  title,
  description,
  registrationUrl,
  value,
  error,
  isSaving,
  onClose,
  onChange,
  onSubmit
}: ApiKeyGateDialogProps) {
  return (
    <div className="api-key-gate" role="dialog" aria-modal="true" aria-labelledby="api-key-gate-title">
      <div className="api-key-gate__backdrop" />
      <div className="api-key-gate__panel">
        <button
          type="button"
          className="api-key-gate__close"
          aria-label="关闭 API 弹窗"
          onClick={onClose}
        >
          ×
        </button>
        <p className="api-key-gate__eyebrow">Workbench Access</p>
        <h2 id="api-key-gate-title">{title}</h2>
        <p>{description}</p>
        <a
          className="api-key-gate__link"
          href={registrationUrl}
          target="_blank"
          rel="noreferrer"
        >
          前往硅基流动获取 API
        </a>

        <label className="api-key-gate__field">
          <span>API</span>
          <input
            autoFocus
            type="password"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="请输入你的 SiliconFlow API Key"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSubmit();
              }
            }}
          />
        </label>

        {error ? <p className="api-key-gate__error">{error}</p> : null}

        <button
          type="button"
          className="api-key-gate__submit"
          onClick={onSubmit}
          disabled={isSaving}
        >
          {isSaving ? "正在保存..." : "保存并开始使用"}
        </button>
      </div>
    </div>
  );
}
