import type { PendingAction } from "../types";

type ConfirmationCardProps = {
  pendingAction: PendingAction | null;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmationCard({
  pendingAction,
  onConfirm,
  onCancel
}: ConfirmationCardProps) {
  if (!pendingAction) {
    return null;
  }

  return (
    <section className="confirmation-card">
      <span className="confirmation-card__label">Needs confirmation</span>
      <h3>{pendingAction.title}</h3>
      <p>{pendingAction.description}</p>
      <div className="confirmation-card__actions">
        <button type="button" className="confirmation-card__confirm" onClick={onConfirm}>
          {pendingAction.confirmLabel}
        </button>
        <button type="button" className="confirmation-card__cancel" onClick={onCancel}>
          {pendingAction.cancelLabel}
        </button>
      </div>
    </section>
  );
}
