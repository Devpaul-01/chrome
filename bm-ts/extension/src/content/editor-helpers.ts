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

function selectEditorContents(editor: HTMLElement): void {
  const selection = window.getSelection();
  const range = document.createRange();

  range.selectNodeContents(editor);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/**
 * Replaces a Facebook React/Lexical editor atomically.
 *
 * Important: execCommand('insertText') already generates the browser input
 * event that Facebook listens for. Dispatching a second InputEvent with the
 * same data causes Lexical to insert the message a second time.
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
  if (current === expected) {
    console.log('[BM][Editor] Correct message already present; skipping insertion');
    return;
  }

  editor.focus();
  selectEditorContents(editor);

  const inserted = document.execCommand('insertText', false, expected);
  window.getSelection()?.removeAllRanges();

  if (!inserted) {
    throw new Error('Facebook rejected the custom text insertion');
  }

  await new Promise<void>((resolve) => window.setTimeout(resolve, 250));

  let actual = readEditableText(editor);

  /*
   * A previous broken build may have left duplicate text in the composer.
   * Replace it one more time atomically instead of appending another copy.
   */
  if (actual !== expected) {
    editor.focus();
    selectEditorContents(editor);
    document.execCommand('delete', false);
    selectEditorContents(editor);
    document.execCommand('insertText', false, expected);
    window.getSelection()?.removeAllRanges();
    await new Promise<void>((resolve) => window.setTimeout(resolve, 250));
    actual = readEditableText(editor);
  }

  if (actual !== expected) {
    throw new Error(
      `Facebook editor verification failed. Expected ${expected.length} characters but found ${actual.length}.`,
    );
  }

  console.log('[BM][Editor] Custom text inserted and verified');
}
