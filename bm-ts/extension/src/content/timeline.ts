/**
 * timeline.ts - Facebook inline birthday timeline posting automation
 *
 * This implementation:
 * - targets the exact birthday card for one friend
 * - targets Facebook's Lexical contenteditable birthday editor
 * - inserts the custom message exactly once
 * - verifies the custom text before clicking the blue birthday-post button
 * - avoids Messenger/global textbox searches
 */

import { delay } from './dom-helpers';
import { logger } from '../utils/logger';
import { readEditableText, replaceFacebookEditorText } from './editor-helpers';

const SHORT_DELAY = 400;
const MEDIUM_DELAY = 1000;

export interface TimelinePost {
  content: string;
  imageUrl?: string;
  friendName: string;
  profileUrl?: string;
  sourceCard?: HTMLElement;
}

interface NiftyImagesMergeTags {
  name?: string;
  firstName?: string;
  age?: string;
  date?: string;
  customTags?: Record<string, string>;
}

function normalizeText(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return element.isConnected && element.offsetParent !== null && rect.width > 0 && rect.height > 0;
}

function readEditorText(editor: HTMLElement): string {
  return normalizeText(editor.innerText || editor.textContent || '');
}

interface SuspendedOverlay {
  element: HTMLElement;
  display: string;
  pointerEvents: string;
}

function suspendBirthdayMessagingOverlays(): SuspendedOverlay[] {
  const suspended: SuspendedOverlay[] = [];

  for (const id of ['bm-auto-overlay', 'bm-confirm-modal']) {
    const element = document.getElementById(id);
    if (!(element instanceof HTMLElement)) continue;

    suspended.push({
      element,
      display: element.style.display,
      pointerEvents: element.style.pointerEvents,
    });

    element.style.display = 'none';
    element.style.pointerEvents = 'none';
  }

  return suspended;
}

function restoreBirthdayMessagingOverlays(suspended: SuspendedOverlay[]): void {
  for (const item of suspended) {
    if (!item.element.isConnected) continue;
    item.element.style.display = item.display;
    item.element.style.pointerEvents = item.pointerEvents;
  }
}

function isMessengerArea(element: HTMLElement): boolean {
  let current: HTMLElement | null = element;

  for (let depth = 0; depth < 14 && current; depth += 1) {
    const labels = Array.from(current.querySelectorAll<HTMLElement>('[aria-label]')).map((item) =>
      (item.getAttribute('aria-label') || '').toLowerCase(),
    );

    if (
      labels.some(
        (label) =>
          label.includes('conversation details') ||
          label.includes('press enter to send') ||
          label.includes('send a voice clip') ||
          label.includes('send a like') ||
          label.includes('new message'),
      )
    ) {
      return true;
    }

    current = current.parentElement;
  }

  return false;
}

function cardContainsFriend(card: HTMLElement, friendName: string): boolean {
  const wanted = normalizeText(friendName).toLowerCase();
  const cardText = normalizeText(card.innerText || card.textContent || '').toLowerCase();
  return wanted.length > 0 && cardText.includes(wanted);
}

function normalizeProfileUrl(value?: string): string {
  if (!value) return '';
  try {
    const url = new URL(value, window.location.href);
    const id = url.searchParams.get('id');
    return id ? `profile:${id}` : url.pathname.replace(/\/+$/, '').toLowerCase();
  } catch {
    return value.split('?')[0].replace(/\/+$/, '').toLowerCase();
  }
}

function cardContainsProfile(card: HTMLElement, profileUrl?: string): boolean {
  const wanted = normalizeProfileUrl(profileUrl);
  if (!wanted) return true;

  return Array.from(card.querySelectorAll<HTMLAnchorElement>('a[href]')).some(
    (anchor) => normalizeProfileUrl(anchor.href) === wanted,
  );
}

function findSmallestCardForEditor(
  editor: HTMLElement,
  friendName: string,
  profileUrl?: string,
): HTMLElement | null {
  let current = editor.parentElement;
  let best: HTMLElement | null = null;

  for (let depth = 0; depth < 14 && current; depth += 1) {
    if (isMessengerArea(current)) return null;

    const editors = current.querySelectorAll(
      '[contenteditable="true"][role="textbox"][data-lexical-editor="true"]',
    );

    if (
      editors.length === 1 &&
      cardContainsFriend(current, friendName) &&
      cardContainsProfile(current, profileUrl)
    ) {
      best = current;
      // The first matching ancestor is the smallest safe card.
      break;
    }

    current = current.parentElement;
  }

  return best;
}

function reacquireBirthdayCard(post: TimelinePost): HTMLElement | null {
  const editors = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[contenteditable="true"][role="textbox"][data-lexical-editor="true"]',
    ),
  ).filter((editor) => isVisible(editor) && !isMessengerArea(editor));

  // First use the strongest identity: name + canonical profile URL.
  const exactMatches = editors
    .map((editor) => findSmallestCardForEditor(editor, post.friendName, post.profileUrl))
    .filter((card): card is HTMLElement => card !== null);
  if (exactMatches.length === 1) return exactMatches[0];

  // Some Facebook birthday cards place the profile anchor outside the smallest
  // ancestor containing the Lexical editor. In that layout profile matching is
  // impossible at editor-card scope. A name-only fallback is safe only when
  // exactly one visible non-Messenger birthday editor matches that name.
  const nameMatches = editors
    .map((editor) => findSmallestCardForEditor(editor, post.friendName))
    .filter((card): card is HTMLElement => card !== null);
  const uniqueNameMatches = Array.from(new Set(nameMatches));

  return uniqueNameMatches.length === 1 ? uniqueNameMatches[0] : null;
}

function findBirthdayCard(post: TimelinePost): HTMLElement | null {
  if (
    post.sourceCard &&
    post.sourceCard.isConnected &&
    isVisible(post.sourceCard) &&
    !isMessengerArea(post.sourceCard) &&
    cardContainsFriend(post.sourceCard, post.friendName) &&
    cardContainsProfile(post.sourceCard, post.profileUrl)
  ) {
    return post.sourceCard;
  }

  // Facebook frequently replaces birthday-card DOM nodes after opening or
  // closing Messenger. Reacquire the same person's card by BOTH identity and
  // its own Lexical editor instead of using an unsafe page-wide textbox.
  return reacquireBirthdayCard(post);
}

function findBirthdayEditor(card: HTMLElement): HTMLElement | null {
  const candidates = Array.from(
    card.querySelectorAll<HTMLElement>(
      '[contenteditable="true"][role="textbox"][data-lexical-editor="true"]',
    ),
  ).filter((editor) => isVisible(editor) && !isMessengerArea(editor));

  return (
    candidates.find((editor) => {
      const placeholder = (editor.getAttribute('aria-placeholder') || '').toLowerCase();
      const text = readEditorText(editor).toLowerCase();

      return (
        placeholder.includes('write on his profile') ||
        placeholder.includes('write on her profile') ||
        placeholder.includes('write on their profile') ||
        text.includes('happy birthday')
      );
    }) ??
    candidates[0] ??
    null
  );
}

async function replaceLexicalBirthdayText(editor: HTMLElement, message: string): Promise<void> {
  const expected = normalizeText(message);

  if (!expected) {
    throw new Error('Timeline message cannot be empty');
  }

  editor.scrollIntoView({ block: 'center', behavior: 'auto' });
  editor.click();
  editor.focus({ preventScroll: true });
  await delay(200);

  logger.log('[BM Timeline] Replacing Facebook Lexical content', {
    before: readEditorText(editor),
    expected,
    expectedLength: expected.length,
  });

  await replaceFacebookEditorText(editor, expected);
  await delay(SHORT_DELAY);

  let actual = normalizeText(readEditableText(editor));

  logger.log('[BM Timeline] Lexical replacement result', {
    expected,
    actual,
    expectedLength: expected.length,
    actualLength: actual.length,
  });

  if (actual !== expected) {
    throw new Error(
      `Timeline editor verification failed. Expected ${expected.length} characters, found ${actual.length}. Actual text: "${actual}"`,
    );
  }

  // Verify a second time after Facebook has had time to reconcile Lexical and
  // React state. The post must never be submitted if the default text returns.
  await delay(350);
  actual = normalizeText(readEditableText(editor));

  if (actual !== expected) {
    throw new Error(
      `Facebook restored the default timeline text after insertion. Expected ${expected.length} characters, found ${actual.length}. Actual text: "${actual}"`,
    );
  }

  // Do not blur here. Facebook may restore the default birthday greeting when
  // the inline Lexical editor loses focus before its form is submitted.
}

export async function insertPostContent(
  content: string,
  container?: HTMLElement,
): Promise<boolean> {
  try {
    if (!container) {
      throw new Error('A scoped birthday card is required');
    }

    const editor = container.matches(
      '[contenteditable="true"][role="textbox"][data-lexical-editor="true"]',
    )
      ? container
      : findBirthdayEditor(container);

    if (!editor) {
      throw new Error('Could not find the Facebook Lexical birthday editor');
    }

    await replaceLexicalBirthdayText(editor, content);
    return true;
  } catch (error) {
    logger.error('[BM Timeline] Failed to insert custom timeline text:', error);
    return false;
  }
}

export async function navigateToProfile(_profileUrl: string): Promise<boolean> {
  logger.warn('[BM Timeline] Profile navigation is disabled for inline birthday posting.');
  return false;
}

export async function openPostComposer(): Promise<HTMLElement | null> {
  logger.warn('[BM Timeline] Generic post composer is disabled.');
  return null;
}

export function processNiftyImagesMergeTags(
  imageUrl: string,
  mergeTags: NiftyImagesMergeTags,
): string {
  if (!imageUrl || !imageUrl.includes('niftyimages')) return imageUrl;

  let processedUrl = imageUrl;

  if (mergeTags.name) {
    processedUrl = processedUrl.replace(/\[name\]/gi, encodeURIComponent(mergeTags.name));
  }
  if (mergeTags.firstName) {
    processedUrl = processedUrl.replace(
      /\[first_name\]/gi,
      encodeURIComponent(mergeTags.firstName),
    );
    processedUrl = processedUrl.replace(/\[firstname\]/gi, encodeURIComponent(mergeTags.firstName));
  }
  if (mergeTags.age) {
    processedUrl = processedUrl.replace(/\[age\]/gi, encodeURIComponent(mergeTags.age));
  }
  if (mergeTags.date) {
    processedUrl = processedUrl.replace(/\[date\]/gi, encodeURIComponent(mergeTags.date));
  }
  if (mergeTags.customTags) {
    for (const [key, value] of Object.entries(mergeTags.customTags)) {
      processedUrl = processedUrl.replace(
        new RegExp(`\\[${key}\\]`, 'gi'),
        encodeURIComponent(value),
      );
    }
  }

  return processedUrl;
}

export async function attachImageToPost(
  _imageUrl: string,
  _mergeTags?: NiftyImagesMergeTags,
): Promise<boolean> {
  logger.warn('[BM Timeline] Image attachment is disabled for inline birthday posts.');
  return false;
}

function findBirthdaySubmitControl(card: HTMLElement, editor: HTMLElement): HTMLElement | null {
  const scope = editor.closest('form') ?? card;
  const controls = Array.from(scope.querySelectorAll<HTMLElement>('button, [role="button"]'));

  return (
    controls.find((control) => {
      if (!isVisible(control) || control === editor || control.contains(editor)) return false;
      const label = normalizeText(
        `${control.getAttribute('aria-label') || ''} ${control.getAttribute('title') || ''} ${
          control.textContent || ''
        }`,
      ).toLowerCase();
      return label.includes('post birthday message') || label === 'post';
    }) ?? null
  );
}

export async function postToTimeline(post: TimelinePost): Promise<boolean> {
  logger.log(`[BM Timeline] Starting scoped birthday post for ${post.friendName}`);

  const suspendedOverlays = suspendBirthdayMessagingOverlays();

  try {
    const card = findBirthdayCard(post);
    if (!card) {
      throw new Error(
        `Could not resolve one unique live birthday composer for ${post.friendName}; unsafe page-wide posting is disabled`,
      );
    }

    let editor = findBirthdayEditor(card);
    if (!editor) {
      throw new Error(`Could not find the Lexical birthday editor for ${post.friendName}`);
    }

    logger.log('[BM Timeline] Selected custom post content', {
      friendName: post.friendName,
      customContent: post.content,
      facebookDefaultText: readEditorText(editor),
      placeholder: editor.getAttribute('aria-placeholder'),
    });

    await replaceLexicalBirthdayText(editor, post.content);

    const expected = normalizeText(post.content);

    // React can replace descendants after an edit, so reacquire both the editor
    // and its form after insertion instead of submitting stale DOM references.
    editor = findBirthdayEditor(card);
    if (!editor || readEditorText(editor) !== expected) {
      throw new Error(
        'Custom timeline message was not retained after Facebook re-rendered the card.',
      );
    }

    const form = editor.closest('form');
    const submitControl = findBirthdaySubmitControl(card, editor);

    logger.log('[BM Timeline] Submitting exact birthday composer', {
      friendName: post.friendName,
      verifiedContent: readEditorText(editor),
      submitAriaLabel: submitControl?.getAttribute('aria-label'),
    });

    // Facebook's birthday composer exposes a dedicated control whose aria-label
    // is normally "Post birthday message". Trigger that exact control so React
    // runs the same handler as a real user click. Fall back to the editor's own
    // form only when the dedicated control is unavailable.
    if (form instanceof HTMLFormElement) {
      logger.log('[BM Timeline] Submitting editor form with requestSubmit()', {
        friendName: post.friendName,
        content: readEditorText(editor),
      });
      form.requestSubmit();
    } else if (submitControl) {
      logger.log('[BM Timeline] Clicking birthday submit control', {
        friendName: post.friendName,
        ariaLabel: submitControl.getAttribute('aria-label'),
        title: submitControl.getAttribute('title'),
      });
      submitControl.click();
    } else {
      throw new Error('The birthday editor has neither a form nor a usable submit control');
    }
    await delay(MEDIUM_DELAY);

    const cardText = normalizeText(card.innerText || card.textContent || '');
    const remainingEditor = findBirthdayEditor(card);
    const successState =
      /you wished|view post/i.test(cardText) ||
      !remainingEditor ||
      readEditorText(remainingEditor) === '';

    if (!successState) {
      throw new Error('Facebook did not confirm the customized birthday post submission.');
    }

    logger.log(`[BM Timeline] Customized birthday post confirmed for ${post.friendName}`);
    return true;
  } catch (error) {
    logger.error(`[BM Timeline] Customized timeline post failed for ${post.friendName}:`, error);
    return false;
  } finally {
    restoreBirthdayMessagingOverlays(suspendedOverlays);
  }
}

export async function batchPostToTimelines(
  posts: TimelinePost[],
  delayBetweenPosts = 5000,
): Promise<{ success: number; failed: number; results: boolean[] }> {
  const results: boolean[] = [];
  let success = 0;
  let failed = 0;

  for (let index = 0; index < posts.length; index += 1) {
    const result = await postToTimeline(posts[index]);
    results.push(result);
    if (result) success += 1;
    else failed += 1;

    if (index < posts.length - 1) {
      await delay(delayBetweenPosts);
    }
  }

  return { success, failed, results };
}
