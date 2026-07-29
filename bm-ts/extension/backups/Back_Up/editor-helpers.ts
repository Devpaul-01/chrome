/**
 * Returns true when an element is currently rendered and visible.
 */
export function isVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();

  return element.isConnected && element.offsetParent !== null && rect.width > 0 && rect.height > 0;
}

/**
 * Reads normalized text from a Facebook contenteditable element.
 */
export function readEditableText(element: HTMLElement): string {
  return (element.innerText || element.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n/g, '\n')
    .trim();
}

/**
 * Waits until finder returns a value.
 */
export async function waitForValue<T>(
  finder: () => T | null | undefined,
  timeout = 8_000,
  interval = 100,
): Promise<T> {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const result = finder();

    if (result !== null && result !== undefined) {
      return result;
    }

    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, interval);
    });
  }

  throw new Error(`Timed out after ${timeout}ms waiting for Facebook element`);
}

/**
 * Clears a Facebook React/Lexical contenteditable editor.
 */
async function clearFacebookEditor(editor: HTMLElement): Promise<void> {
  editor.focus();

  const selection = window.getSelection();
  const range = document.createRange();

  range.selectNodeContents(editor);
  selection?.removeAllRanges();
  selection?.addRange(range);

  document.execCommand('delete', false);

  selection?.removeAllRanges();

  editor.dispatchEvent(
    new InputEvent('input', {
      bubbles: true,
      inputType: 'deleteContentBackward',
      data: null,
    }),
  );

  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 150);
  });
}

/**
 * Replaces editor contents exactly once.
 *
 * Important:
 * - If the correct text is already present, it does nothing.
 * - If old or duplicated text exists, it clears the editor first.
 * - It verifies exact equality after insertion.
 */
export async function replaceFacebookEditorText(
  editor: HTMLElement,
  message: string,
): Promise<void> {
  const expected = message.trim();

  if (!expected) {
    throw new Error('Cannot insert an empty Facebook message');
  }

  const current = readEditableText(editor);

  // Idempotency: do not type the same message repeatedly.
  if (current === expected) {
    console.log('[BM][Editor] Correct message already present; skipping insertion');
    return;
  }

  // Remove old/default/duplicated text.
  if (current.length > 0) {
    await clearFacebookEditor(editor);
  }

  editor.focus();

  const inserted = document.execCommand('insertText', false, expected);

  if (!inserted) {
    throw new Error('Facebook rejected the custom text insertion');
  }

  editor.dispatchEvent(
    new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: expected,
    }),
  );

  editor.dispatchEvent(
    new Event('change', {
      bubbles: true,
    }),
  );

  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 300);
  });

  const actual = readEditableText(editor);

  if (actual !== expected) {
    throw new Error(
      `Facebook editor verification failed. Expected ${expected.length} ` +
        `characters but found ${actual.length}.`,
    );
  }

  console.log('[BM][Editor] Custom text inserted and verified');
}
