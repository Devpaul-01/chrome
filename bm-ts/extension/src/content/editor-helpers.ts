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

function pause(milliseconds: number): Promise<void> {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

function selectEditorContents(editor: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) throw new Error('Browser selection API is unavailable');

  const range = document.createRange();
  range.selectNodeContents(editor);
  selection.removeAllRanges();
  selection.addRange(range);
}

function clearSelection(): void {
  window.getSelection()?.removeAllRanges();
}

function editorHasExactText(editor: HTMLElement, expected: string): boolean {
  return readEditableText(editor) === expected;
}

async function tryExecCommandReplacement(editor: HTMLElement, expected: string): Promise<boolean> {
  editor.focus({ preventScroll: true });
  selectEditorContents(editor);

  const inserted = document.execCommand('insertText', false, expected);
  clearSelection();
  await pause(300);

  return inserted && editorHasExactText(editor, expected);
}

async function tryDeleteThenInsert(editor: HTMLElement, expected: string): Promise<boolean> {
  editor.focus({ preventScroll: true });
  selectEditorContents(editor);
  document.execCommand('delete', false);
  await pause(75);

  selectEditorContents(editor);
  const inserted = document.execCommand('insertText', false, expected);
  clearSelection();
  await pause(350);

  return inserted && editorHasExactText(editor, expected);
}

async function tryPasteEventReplacement(editor: HTMLElement, expected: string): Promise<boolean> {
  if (typeof DataTransfer === 'undefined' || typeof ClipboardEvent === 'undefined') return false;

  editor.focus({ preventScroll: true });
  selectEditorContents(editor);

  const dataTransfer = new DataTransfer();
  dataTransfer.setData('text/plain', expected);

  const pasteEvent = new ClipboardEvent('paste', {
    bubbles: true,
    cancelable: true,
    composed: true,
    clipboardData: dataTransfer,
  });

  editor.dispatchEvent(pasteEvent);
  clearSelection();
  await pause(400);

  return editorHasExactText(editor, expected);
}

async function tryBeforeInputReplacement(editor: HTMLElement, expected: string): Promise<boolean> {
  editor.focus({ preventScroll: true });
  selectEditorContents(editor);

  const beforeInput = new InputEvent('beforeinput', {
    bubbles: true,
    cancelable: true,
    composed: true,
    inputType: 'insertText',
    data: expected,
  });

  editor.dispatchEvent(beforeInput);
  await pause(100);

  // If Facebook did not perform the replacement itself, perform the browser
  // editing command while the Lexical selection is still active.
  if (!editorHasExactText(editor, expected)) {
    document.execCommand('insertText', false, expected);
  }

  clearSelection();
  await pause(400);

  return editorHasExactText(editor, expected);
}

/**
 * Replaces a Facebook React/Lexical editor atomically.
 *
 * Facebook currently uses more than one Lexical configuration. Messenger and
 * the inline birthday composer do not always accept the same insertion path.
 * The strategies below are attempted one at a time and stop immediately once
 * the exact desired text is retained. A second data-bearing input event is
 * never dispatched after a successful insertion, preventing duplication.
 */
export async function replaceFacebookEditorText(
  editor: HTMLElement,
  message: string,
): Promise<void> {
  const expected = message.trim();

  if (!expected) {
    throw new Error('Cannot insert an empty Facebook message');
  }

  if (!editor.isConnected) {
    throw new Error('Facebook editor is no longer connected to the page');
  }

  if (editorHasExactText(editor, expected)) {
    console.log('[BM][Editor] Correct message already present; skipping insertion');
    return;
  }

  const strategies: Array<{
    name: string;
    run: () => Promise<boolean>;
  }> = [
    { name: 'execCommand-select-replace', run: () => tryExecCommandReplacement(editor, expected) },
    { name: 'delete-then-insert', run: () => tryDeleteThenInsert(editor, expected) },
    { name: 'paste-event', run: () => tryPasteEventReplacement(editor, expected) },
    { name: 'beforeinput-then-insert', run: () => tryBeforeInputReplacement(editor, expected) },
  ];

  for (const strategy of strategies) {
    try {
      if (await strategy.run()) {
        console.log('[BM][Editor] Custom text inserted and verified', {
          strategy: strategy.name,
          length: expected.length,
        });
        return;
      }
    } catch (error) {
      console.warn('[BM][Editor] Replacement strategy failed', {
        strategy: strategy.name,
        error,
      });
    }
  }

  const actual = readEditableText(editor);
  throw new Error(
    `Facebook editor verification failed. Expected ${expected.length} characters but found ${actual.length}. Actual text: "${actual}"`,
  );
}
