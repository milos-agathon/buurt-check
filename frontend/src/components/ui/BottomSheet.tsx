import { useEffect, useRef } from 'react';
import useFocusTrap from '../../hooks/useFocusTrap';
import './BottomSheet.css';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  height?: string;
  ariaLabel?: string;
  children: React.ReactNode;
}

export default function BottomSheet({
  isOpen,
  onClose,
  height = '50vh',
  ariaLabel = 'Dialog',
  children,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  useFocusTrap({
    isOpen,
    containerRef: sheetRef,
    onRequestClose: onClose,
  });

  if (!isOpen) return null;

  return (
    <div className="bottom-sheet-overlay" onClick={onClose} data-testid="bottom-sheet-overlay">
      <div
        ref={sheetRef}
        className="bottom-sheet"
        style={{ maxHeight: height }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
      >
        <div className="bottom-sheet__handle" />
        <div className="bottom-sheet__content">
          {children}
        </div>
      </div>
    </div>
  );
}
