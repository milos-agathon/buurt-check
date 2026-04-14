import { useCallback, useEffect, useRef } from 'react';
import useFocusTrap from '../../hooks/useFocusTrap';
import './BottomSheet.css';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  height?: string;
  minHeight?: string;
  ariaLabel?: string;
  children: React.ReactNode;
}

export default function BottomSheet({
  isOpen,
  onClose,
  height = '50vh',
  minHeight,
  ariaLabel = 'Dialog',
  children,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropPointerDownRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      backdropPointerDownRef.current = false;
    }
  }, [isOpen]);

  useFocusTrap({
    isOpen,
    containerRef: sheetRef,
    onRequestClose: onClose,
  });

  const handleOverlayPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    backdropPointerDownRef.current = event.target === event.currentTarget;
  }, []);

  const handleOverlayClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const isBackdropClick = event.target === event.currentTarget;
    const shouldClose = isBackdropClick && backdropPointerDownRef.current;
    backdropPointerDownRef.current = false;

    if (shouldClose) {
      onClose();
    }
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="bottom-sheet-overlay"
      onPointerDown={handleOverlayPointerDown}
      onClick={handleOverlayClick}
      data-testid="bottom-sheet-overlay"
    >
      <div
        ref={sheetRef}
        className="bottom-sheet"
        style={{ maxHeight: height, minHeight }}
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
