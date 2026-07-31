export const BM_TRACE_ENABLED = false;

/*
 * Use a distinctive portion of the target friend's visible name.
 * Keep this lowercase.
 */
export const BM_TRACE_TARGET = 'ara alnajar';

/*
 * Safety mode:
 * true  = trace everything but do not click Send/Post.
 * false = permit the final action.
 *
 * Keep this TRUE during diagnosis.
 */
export const BM_TRACE_DRY_RUN = false;

let traceSequence = 0;

function normalizeTraceText(value: unknown): string {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isTraceTarget(name: unknown): boolean {
  return normalizeTraceText(name).toLowerCase().includes(BM_TRACE_TARGET);
}

function describeElement(element?: Element | null) {
  if (!(element instanceof HTMLElement)) {
    return null;
  }

  const rect = element.getBoundingClientRect();

  return {
    tag: element.tagName,
    id: element.id || '',
    role: element.getAttribute('role') || '',
    ariaLabel: element.getAttribute('aria-label') || '',
    ariaPlaceholder: element.getAttribute('aria-placeholder') || '',
    contenteditable: element.getAttribute('contenteditable') || '',
    lexicalEditor: element.getAttribute('data-lexical-editor') || '',
    connected: element.isConnected,
    visible: element.offsetParent !== null && rect.width > 0 && rect.height > 0,
    dimensions: {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      top: Math.round(rect.top),
      left: Math.round(rect.left),
    },
    text: normalizeTraceText(element.innerText || element.textContent).slice(0, 500),
  };
}

export function markTraceContainer(element: HTMLElement | null | undefined, traceId: string): void {
  if (!element) return;

  // Diagnostic outlines must never leak into normal extension behavior.
  // Keep the trace identifier only when tracing is explicitly enabled.
  if (!BM_TRACE_ENABLED) {
    delete element.dataset.bmTraceId;
    element.style.removeProperty('outline');
    element.style.removeProperty('outline-offset');
    return;
  }

  element.dataset.bmTraceId = traceId;
  element.style.outline = '5px solid magenta';
  element.style.outlineOffset = '3px';
}

export function createTraceId(name: string): string {
  traceSequence += 1;

  return `bm-trace-${Date.now()}-${traceSequence}-${normalizeTraceText(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')}`;
}

export function bmTrace(stage: string, details: Record<string, unknown> = {}): void {
  if (!BM_TRACE_ENABLED) return;

  console.groupCollapsed(
    `%c[BM TRACE ${++traceSequence}] ${stage}`,
    'background:#7c3aed;color:white;font-weight:bold;padding:2px 6px;',
  );

  console.log({
    timestamp: new Date().toISOString(),
    stage,
    ...details,
  });

  console.groupEnd();
}

export function traceElement(
  stage: string,
  element?: Element | null,
  extra: Record<string, unknown> = {},
): void {
  bmTrace(stage, {
    ...extra,
    element: describeElement(element),
  });
}

export function findTraceContainer(traceId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-bm-trace-id="${CSS.escape(traceId)}"]`);
}
