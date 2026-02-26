import { useState, useCallback, useRef, useEffect } from 'react';
import './Toast.css';

interface ToastMessage {
  id: number;
  text: string;
  action?: { label: string; onClick: () => void };
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const nextId = useRef(0);
  const timeoutIds = useRef(new Map<number, number>());

  const clearToastTimer = useCallback((id: number) => {
    const timeoutId = timeoutIds.current.get(id);
    if (timeoutId == null) return;
    window.clearTimeout(timeoutId);
    timeoutIds.current.delete(id);
  }, []);

  const showToast = useCallback((text: string, action?: { label: string; onClick: () => void }) => {
    const id = nextId.current++;
    setToasts(prev => [...prev, { id, text, action }]);
    const delay = action ? 6000 : 4000;
    const timeoutId = window.setTimeout(() => {
      timeoutIds.current.delete(id);
      setToasts(prev => prev.filter(t => t.id !== id));
    }, delay);
    timeoutIds.current.set(id, timeoutId);
  }, []);

  const dismissToast = useCallback((id: number) => {
    clearToastTimer(id);
    setToasts(prev => prev.filter(t => t.id !== id));
  }, [clearToastTimer]);

  useEffect(() => () => {
    for (const timeoutId of timeoutIds.current.values()) {
      window.clearTimeout(timeoutId);
    }
    timeoutIds.current.clear();
  }, []);

  return { toasts, showToast, dismissToast };
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: number) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map(toast => (
        <div key={toast.id} className="toast" role="alert" onClick={() => onDismiss(toast.id)}>
          <span className="toast__text">{toast.text}</span>
          {toast.action && (
            <button
              className="toast__action"
              onClick={(e) => {
                e.stopPropagation();
                toast.action!.onClick();
                onDismiss(toast.id);
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
