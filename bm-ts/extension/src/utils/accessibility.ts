/**
 * Accessibility utilities for screen reader announcements and keyboard navigation
 */

// Debounce timer for polite announcements to avoid flooding on rapid WebSocket updates
let politeDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Announce a message to screen readers using a live region.
 * - `assertive` messages (errors/alerts) are announced immediately.
 * - `polite` messages are debounced (500 ms) so that rapid WebSocket-triggered
 *   updates don't flood screen readers.
 */
export function announceToScreenReader(
  message: string,
  priority: 'polite' | 'assertive' = 'polite',
): void {
  // Find or create live region
  let liveRegion = document.getElementById('sr-live-region');

  if (!liveRegion) {
    liveRegion = document.createElement('div');
    liveRegion.id = 'sr-live-region';
    liveRegion.className = 'sr-only';
    liveRegion.setAttribute('aria-live', priority);
    liveRegion.setAttribute('aria-atomic', 'true');
    document.body.appendChild(liveRegion);
  }

  // Update aria-live if priority changed
  if (liveRegion.getAttribute('aria-live') !== priority) {
    liveRegion.setAttribute('aria-live', priority);
  }

  // Assertive (errors/alerts) always fires immediately without debounce
  if (priority === 'assertive') {
    liveRegion.textContent = '';
    setTimeout(() => {
      liveRegion!.textContent = message;
    }, 100);
    return;
  }

  // Polite announcements: debounce so only the latest message is announced
  // when calls arrive in rapid succession (e.g. WebSocket real-time updates)
  if (politeDebounceTimer !== null) clearTimeout(politeDebounceTimer);
  const capturedRegion = liveRegion;
  politeDebounceTimer = setTimeout(() => {
    capturedRegion.textContent = '';
    setTimeout(() => {
      capturedRegion.textContent = message;
    }, 100);
    politeDebounceTimer = null;
  }, 500);
}

/**
 * Get all focusable elements within a container
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  return Array.from(container.querySelectorAll<HTMLElement>(selector));
}

/**
 * Trap focus within a container (useful for modals/dialogs)
 */
export function trapFocus(container: HTMLElement): () => void {
  const focusableElements = getFocusableElements(container);
  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Tab') return;

    if (event.shiftKey) {
      // Shift + Tab
      if (document.activeElement === firstElement) {
        event.preventDefault();
        lastElement?.focus();
      }
    } else {
      // Tab
      if (document.activeElement === lastElement) {
        event.preventDefault();
        firstElement?.focus();
      }
    }
  }

  container.addEventListener('keydown', handleKeyDown);

  // Return cleanup function
  return () => {
    container.removeEventListener('keydown', handleKeyDown);
  };
}

/**
 * Move focus to an element and scroll it into view
 */
export function moveFocusTo(element: HTMLElement | null): void {
  if (!element) return;

  element.focus();
  element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * Generate a unique ID for ARIA relationships
 */
let idCounter = 0;
export function generateId(prefix = 'a11y'): string {
  return `${prefix}-${Date.now()}-${++idCounter}`;
}

/**
 * Check if user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Escape key handler for closing modals/dialogs
 */
export function handleEscapeKey(callback: () => void): (event: KeyboardEvent) => void {
  return (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      callback();
    }
  };
}

/**
 * Convert boolean to ARIA string value
 */
export function ariaBoolean(value: boolean): 'true' | 'false' {
  return value ? 'true' : 'false';
}

/**
 * Keyboard navigation handler for lists/grids
 */
export interface KeyboardNavigationOptions {
  container: HTMLElement;
  onArrowUp?: () => void;
  onArrowDown?: () => void;
  onArrowLeft?: () => void;
  onArrowRight?: () => void;
  onEnter?: () => void;
  onSpace?: () => void;
  onEscape?: () => void;
  onHome?: () => void;
  onEnd?: () => void;
}

export function handleKeyboardNavigation(options: KeyboardNavigationOptions): () => void {
  const { container, ...handlers } = options;

  function handleKeyDown(event: KeyboardEvent) {
    const { key } = event;

    switch (key) {
      case 'ArrowUp':
        if (handlers.onArrowUp) {
          event.preventDefault();
          handlers.onArrowUp();
        }
        break;
      case 'ArrowDown':
        if (handlers.onArrowDown) {
          event.preventDefault();
          handlers.onArrowDown();
        }
        break;
      case 'ArrowLeft':
        if (handlers.onArrowLeft) {
          event.preventDefault();
          handlers.onArrowLeft();
        }
        break;
      case 'ArrowRight':
        if (handlers.onArrowRight) {
          event.preventDefault();
          handlers.onArrowRight();
        }
        break;
      case 'Enter':
        if (handlers.onEnter) {
          event.preventDefault();
          handlers.onEnter();
        }
        break;
      case ' ':
        if (handlers.onSpace) {
          event.preventDefault();
          handlers.onSpace();
        }
        break;
      case 'Escape':
        if (handlers.onEscape) {
          event.preventDefault();
          handlers.onEscape();
        }
        break;
      case 'Home':
        if (handlers.onHome) {
          event.preventDefault();
          handlers.onHome();
        }
        break;
      case 'End':
        if (handlers.onEnd) {
          event.preventDefault();
          handlers.onEnd();
        }
        break;
    }
  }

  container.addEventListener('keydown', handleKeyDown);

  return () => {
    container.removeEventListener('keydown', handleKeyDown);
  };
}
