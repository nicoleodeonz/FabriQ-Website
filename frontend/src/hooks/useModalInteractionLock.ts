import { useEffect } from 'react';
import type { RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const LOCK_COUNT_KEY = 'modalLockCount';
const PREVIOUS_OVERFLOW_KEY = 'modalPreviousOverflow';
const PREVIOUS_PADDING_KEY = 'modalPreviousPaddingRight';

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
    if (element.hasAttribute('disabled')) return false;
    if (element.getAttribute('aria-hidden') === 'true') return false;
    if (element.tabIndex < 0) return false;
    return element.getClientRects().length > 0;
  });
}

export function useModalInteractionLock(isOpen: boolean, modalRef?: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!isOpen) return undefined;

    const { body } = document;
    const currentLockCount = Number(body.dataset[LOCK_COUNT_KEY] || '0');

    if (currentLockCount === 0) {
      body.dataset[PREVIOUS_OVERFLOW_KEY] = body.style.overflow;
      body.dataset[PREVIOUS_PADDING_KEY] = body.style.paddingRight;

      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      body.style.overflow = 'hidden';
      if (scrollbarWidth > 0) {
        body.style.paddingRight = `${scrollbarWidth}px`;
      }
    }

    body.dataset[LOCK_COUNT_KEY] = String(currentLockCount + 1);

    const previouslyFocusedElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const focusInsideModal = () => {
      const modal = modalRef?.current;
      if (!modal) return;

      const focusableElements = getFocusableElements(modal);
      const target = focusableElements[0] || modal;
      target.focus();
    };

    const frameId = window.requestAnimationFrame(focusInsideModal);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      const modal = modalRef?.current;
      if (!modal) return;

      const focusableElements = getFocusableElements(modal);
      if (focusableElements.length === 0) {
        event.preventDefault();
        modal.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && (activeElement === firstElement || activeElement === modal)) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      const modal = modalRef?.current;
      if (!modal) return;

      if (event.target instanceof Node && !modal.contains(event.target)) {
        focusInsideModal();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocusIn);

    return () => {
      window.cancelAnimationFrame(frameId);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocusIn);

      const nextLockCount = Math.max(0, Number(body.dataset[LOCK_COUNT_KEY] || '1') - 1);
      if (nextLockCount === 0) {
        body.style.overflow = body.dataset[PREVIOUS_OVERFLOW_KEY] || '';
        body.style.paddingRight = body.dataset[PREVIOUS_PADDING_KEY] || '';
        delete body.dataset[LOCK_COUNT_KEY];
        delete body.dataset[PREVIOUS_OVERFLOW_KEY];
        delete body.dataset[PREVIOUS_PADDING_KEY];
      } else {
        body.dataset[LOCK_COUNT_KEY] = String(nextLockCount);
      }

      if (previouslyFocusedElement && document.contains(previouslyFocusedElement)) {
        window.requestAnimationFrame(() => {
          previouslyFocusedElement.focus();
        });
      }
    };
  }, [isOpen, modalRef]);
}