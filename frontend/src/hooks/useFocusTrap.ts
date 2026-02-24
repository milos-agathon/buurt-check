import { useEffect, useRef, type RefObject } from 'react';

interface UseFocusTrapOptions<T extends HTMLElement> {
  isOpen: boolean;
  containerRef: RefObject<T | null>;
  onRequestClose?: () => void;
  initialFocusSelector?: string;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function isFocusable(element: HTMLElement): boolean {
  if (element.hasAttribute('disabled')) return false;
  if (element.getAttribute('aria-hidden') === 'true') return false;

  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  return true;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array
    .from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => isFocusable(element));
}

export default function useFocusTrap<T extends HTMLElement>({
  isOpen,
  containerRef,
  onRequestClose,
  initialFocusSelector,
}: UseFocusTrapOptions<T>) {
  const onRequestCloseRef = useRef(onRequestClose);
  onRequestCloseRef.current = onRequestClose;

  useEffect(() => {
    if (!isOpen) return;

    const container = containerRef.current;
    if (!container) return;

    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    let removeTemporaryTabIndex = false;
    if (!container.hasAttribute('tabindex')) {
      container.setAttribute('tabindex', '-1');
      removeTemporaryTabIndex = true;
    }

    const focusInitialElement = () => {
      const requestedInitial = initialFocusSelector
        ? container.querySelector<HTMLElement>(initialFocusSelector)
        : null;
      const focusables = getFocusableElements(container);
      const target = (requestedInitial && isFocusable(requestedInitial))
        ? requestedInitial
        : (focusables[0] ?? container);
      target.focus();
    };

    const frame = window.requestAnimationFrame(focusInitialElement);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onRequestCloseRef.current?.();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusables = getFocusableElements(container);
      if (focusables.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const activeElement = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      const activeInside = !!(activeElement && container.contains(activeElement));

      if (event.shiftKey) {
        if (!activeInside || activeElement === first || activeElement === container) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (!activeInside || activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      if (removeTemporaryTabIndex) {
        container.removeAttribute('tabindex');
      }
      if (previousFocus && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, [containerRef, initialFocusSelector, isOpen]);
}
