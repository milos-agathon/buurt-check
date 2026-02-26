import BottomSheet from './BottomSheet';
import './ConfirmSheet.css';

interface ConfirmSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
}

export default function ConfirmSheet({
  isOpen,
  onClose,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
}: ConfirmSheetProps) {
  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} height="40vh" ariaLabel={title}>
      <div className="confirm-sheet" data-testid="confirm-sheet">
        <h3 className="confirm-sheet__title">{title}</h3>
        <p className="confirm-sheet__message">{message}</p>
        <div className="confirm-sheet__actions">
          <button
            type="button"
            className="confirm-sheet__btn confirm-sheet__btn--secondary"
            onClick={onClose}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="confirm-sheet__btn confirm-sheet__btn--danger"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
