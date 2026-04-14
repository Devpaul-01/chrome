/**
 * content/index.ts — BirthdayMessaging content script.
 *
 * Injected into every Facebook page by the extension manifest.  Responsibilities:
 *
 *   1. **Overlay UI** — mounts a lightweight sidebar that lists today's birthday
 *      friends and lets the user manually trigger "Send to all".
 *
 *   2. **Manual send** — `handleSendAll` iterates detected friends, opens each
 *      Facebook Messenger dialog, fills in a templated message, and clicks Send.
 *
 *   3. **Automation run** — `runFullAutomation` is the entry point dispatched by
 *      the background service worker (`automation.runFull` message).  It handles
 *      three phases: (a) current-day friends from the live birthday feed,
 *      (b) advance-notice contacts, (c) follow-up contacts.
 *
 *   4. **Contact scraper** — `scrapeBirthdayContactsFromPage` harvests profile
 *      links and birthday dates from the DOM for the `contacts.scrapeFromFacebook`
 *      background message.
 *
 * All API calls are proxied to the background service worker via `sendContentMessage`
 * because content scripts cannot make cross-origin requests directly.
 */

import {
  composeMessage,
  randomDelay,
  selectTemplate,
  selectPost,
  resolveKeywords,
  assembleMessageFromTemplate,
} from '../utils/message';
import { sendContentMessage } from './api';
import type { TemplateSegment } from '../api/client';
import type { AutomationRunPayload } from '../utils/messages';
import { postToTimeline } from './timeline';
import { archiveConversation } from './messenger';
import { simulateClick, simulateBrowsing, runSelectorHealthCheck } from './dom-helpers';
import {
  checkRateLimit,
  recordMessageSent,
  shouldAbort,
  setShouldAbort,
  detectFacebookRestriction,
  initUserActivityTracking,
  isUserActive,
  addActivityLogEntry,
  recordSendFailure,
  recordSendSuccess,
  getConfirmationMode,
  triggerEmergencyStop,
  getEmergencyStopState,
} from '../utils/failsafe';
import {
  getAutomationConfig,
  getPreferredHours,
  isWithinPreferredHours,
} from '../utils/automation';

/** Maximum messages the manual "Send to all" flow will send per session (safety cap). */
const MAX_MESSAGES_PER_SESSION = 5;
const overlayId = 'bm-overlay';

/** Feature flags stored in chrome.storage.local, mirroring the popup toggles. */
interface OverlayFeatureFlags {
  makePost: boolean;
  sendMessage: boolean;
  archiveAfterSend: boolean;
}
const FEATURE_FLAGS_KEY = 'bm_feature_flags';

/** Track which friends are selected for sending. */
const selectedFriends = new Set<string>();
/** Whether a manual send is currently in progress. */
let isSending = false;
/** Set to true to abort a running manual send. */
let abortManualSend = false;

/** Template segments grouped by type, loaded from the backend and used to compose messages. */
type SegmentGroups = {
  GREETING: string[];
  BODY: string[];
  CLOSING: string[];
};

/**
 * Represents a person whose birthday is today as found in the Facebook birthday feed DOM.
 * `messageButton` and `container` are live DOM references used to open the Messenger dialog.
 */
type BirthdayFriend = {
  id: string;
  name: string;
  profileUrl?: string;
  container: HTMLElement;
  messageButton?: HTMLElement;
};

const overlay = createOverlay();
let friends: BirthdayFriend[] = [];
let segments: SegmentGroups = { GREETING: [], BODY: [], CLOSING: [] };

/** Re-scrape the birthday feed, repopulate the overlay friend list, and reload segments. */
async function refreshFriendList() {
  friends = gatherBirthdayFriends();
  selectedFriends.clear();
  renderFriendList();
  await loadSegments();
  renderTemplatePreview();
  void renderOverlayStatus();
}

/**
 * Scrapes birthday friend entries from the current Facebook page.
 * Uses multiple selector strategies with fallbacks to handle Facebook UI changes.
 * Searches birthday widgets in the news feed and the dedicated /birthdays page.
 */
function gatherBirthdayFriends(): BirthdayFriend[] {
  const detected: BirthdayFriend[] = [];
  const seenNames = new Set<string>();

  // Multiple selector strategies for birthday containers (ordered by reliability)
  const containerSelectors = [
    "div[data-pagelet*='Birthday']",
    "div[data-pagelet*='birthday']",
    "[data-pagelet='BirthdayFeed']",
    "[data-testid*='birthday']",
    "[data-testid*='Birthday']",
    // Fallback: the /birthdays page uses role="feed" for the birthday list
    "div[role='feed'] div[role='article']",
  ];

  const containers: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();

  for (const selector of containerSelectors) {
    document.querySelectorAll<HTMLElement>(selector).forEach((el) => {
      if (!seen.has(el)) {
        seen.add(el);
        containers.push(el);
      }
    });
  }

  // If no containers found, try broader structural fallback:
  // look for sections that contain profile links + "Message" buttons together
  if (containers.length === 0) {
    const potentialContainers = document.querySelectorAll<HTMLElement>(
      '[role="main"] [role="article"], [role="main"] > div > div > div',
    );
    potentialContainers.forEach((el) => {
      const hasProfileLink = el.querySelector("a[href*='facebook.com/']");
      const hasMessageAction = el.querySelector(
        "[role='button'][aria-label*='Message'], [role='button'][aria-label*='message'], a[href*='/messages/']",
      );
      if (hasProfileLink && hasMessageAction && !seen.has(el)) {
        seen.add(el);
        containers.push(el);
      }
    });
  }

  containers.forEach((container, index) => {
    // Try multiple name-extraction strategies
    const nameElement =
      container.querySelector('strong span') ??
      container.querySelector('strong') ??
      container.querySelector('h2 span, h3 span') ??
      container.querySelector('[role="heading"] span') ??
      container.querySelector('a[href*="facebook.com/"] span');
    const name = nameElement?.textContent?.trim() || 'Unknown';

    // Deduplicate by name
    if (name !== 'Unknown' && seenNames.has(name)) return;
    if (name !== 'Unknown') seenNames.add(name);

    // Multiple selectors for the message button (language-agnostic first)
    const messageBtn =
      container.querySelector<HTMLElement>("a[href*='/messages/t/']") ??
      container.querySelector<HTMLElement>("a[role='button'][aria-label*='Message']") ??
      container.querySelector<HTMLElement>("button[aria-label*='Message']") ??
      container.querySelector<HTMLElement>("a[role='button'][aria-label*='message']") ??
      container.querySelector<HTMLElement>("[role='button'][data-testid*='message']");

    const profileLink =
      container.querySelector<HTMLAnchorElement>("a[href*='facebook.com/'][role='link']") ??
      container.querySelector<HTMLAnchorElement>("a[href*='facebook.com/']");

    detected.push({
      id: `${name}-${index}`,
      name,
      profileUrl: profileLink?.href,
      container: container as HTMLElement,
      messageButton: messageBtn ?? undefined,
    });
  });
  return detected;
}
/** Fetches template segments from the backend and groups them by type into `segments`. */
async function loadSegments() {
  try {
    const data = await sendContentMessage<TemplateSegment[]>({ type: 'templates.list' });
    const grouped: SegmentGroups = { GREETING: [], BODY: [], CLOSING: [] };
    data.forEach((segment) => {
      grouped[segment.segment_type].push(segment.content);
    });
    segments = grouped;
    setStatus('Templates synced');
  } catch (error) {
    setStatus(`Unable to fetch templates: ${(error as Error).message}`);
  }
}

/** Renders the current `friends` array into the overlay sidebar list. */
function renderFriendList() {
  const list = overlay.querySelector<HTMLDivElement>('#bm-friend-list');
  const countBadge = overlay.querySelector<HTMLElement>('#bm-friend-count');
  if (!list) return;
  list.innerHTML = '';

  // Update count badge
  if (countBadge) {
    countBadge.textContent = friends.length
      ? `${friends.length} friend${friends.length > 1 ? 's' : ''} detected`
      : '';
  }

  // Empty state
  if (friends.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'bm-empty-state';
    empty.innerHTML = `
      <div style="font-size:24px;margin-bottom:6px;">🎂</div>
      <p class="bm-empty-title">No birthdays detected</p>
      <p class="bm-empty-subtitle">Navigate to <strong>facebook.com/birthdays</strong> and click <strong>Refresh</strong></p>
    `;
    list.appendChild(empty);
    updateSendButton();
    return;
  }

  // Initialize selectedFriends with all friends if empty
  if (selectedFriends.size === 0) {
    friends.forEach((f) => selectedFriends.add(f.id));
  }

  // Select all / deselect all row
  const selectRow = document.createElement('div');
  selectRow.className = 'bm-select-row';
  const selectAllBtn = document.createElement('button');
  selectAllBtn.textContent = 'Select all';
  selectAllBtn.className = 'bm-link-btn';
  selectAllBtn.style.color = '#ca4f02';
  selectAllBtn.addEventListener('click', () => {
    friends.forEach((f) => selectedFriends.add(f.id));
    renderFriendList();
  });
  const deselectAllBtn = document.createElement('button');
  deselectAllBtn.textContent = 'Deselect all';
  deselectAllBtn.className = 'bm-link-btn';
  deselectAllBtn.addEventListener('click', () => {
    selectedFriends.clear();
    renderFriendList();
  });
  selectRow.appendChild(selectAllBtn);
  selectRow.appendChild(deselectAllBtn);
  list.appendChild(selectRow);

  friends.forEach((friend) => {
    const row = document.createElement('div');
    row.setAttribute('role', 'listitem');
    row.className = 'bm-friend-row';

    // Checkbox
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selectedFriends.has(friend.id);
    checkbox.className = 'bm-checkbox';
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        selectedFriends.add(friend.id);
      } else {
        selectedFriends.delete(friend.id);
      }
      updateSendButton();
    });

    // Avatar placeholder
    const avatar = document.createElement('div');
    avatar.className = 'bm-avatar';
    avatar.textContent = friend.name.charAt(0).toUpperCase();

    // Name + profile link column
    const info = document.createElement('div');
    info.style.cssText = 'flex:1;min-width:0;';
    const nameEl = document.createElement('div');
    nameEl.className = 'bm-friend-name';
    nameEl.textContent = friend.name;
    info.appendChild(nameEl);
    if (friend.profileUrl) {
      const link = document.createElement('a');
      link.href = friend.profileUrl;
      link.textContent = 'Profile';
      link.target = '_blank';
      link.rel = 'noopener';
      link.className = 'bm-profile-link';
      link.addEventListener('click', (e) => e.stopPropagation());
      info.appendChild(link);
    }

    // Per-friend send button
    const sendOneBtn = document.createElement('button');
    sendOneBtn.textContent = '▶';
    sendOneBtn.title = `Send to ${friend.name}`;
    sendOneBtn.className = 'bm-send-one-btn';
    sendOneBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      void handleSendOne(friend);
    });

    // Clicking the row toggles checkbox
    row.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      checkbox.checked = !checkbox.checked;
      checkbox.dispatchEvent(new Event('change'));
    });

    row.appendChild(checkbox);
    row.appendChild(avatar);
    row.appendChild(info);
    row.appendChild(sendOneBtn);
    list.appendChild(row);
  });

  updateSendButton();
}

/** Send a single message to one specific friend (from per-row button). */
async function handleSendOne(friend: BirthdayFriend) {
  if (!segments.GREETING.length || !segments.BODY.length || !segments.CLOSING.length) {
    setStatus('Add at least one segment of each type first');
    return;
  }
  setStatus(`Sending to ${friend.name}…`);
  try {
    await sendMessageToFriend(friend);
    setStatus(`Message sent to ${friend.name}`);
  } catch (error) {
    setStatus(`Failed: ${(error as Error).message}`);
  }
}

/** Updates the send button label to reflect selected count. */
function updateSendButton() {
  const sendBtn = overlay.querySelector<HTMLButtonElement>('#bm-send');
  if (!sendBtn) return;
  const count = friends.filter((f) => selectedFriends.has(f.id)).length;
  if (isSending) return; // Don't update text while sending
  sendBtn.textContent = count > 0 ? `Send to ${count} selected` : 'Send to all';
  sendBtn.disabled = friends.length === 0;
  sendBtn.style.opacity = friends.length === 0 ? '0.5' : '1';
}

/** Updates the status line shown in the overlay sidebar. */
function setStatus(text: string) {
  const status = overlay.querySelector<HTMLParagraphElement>('#bm-status');
  if (status) {
    status.textContent = text;
  }
}

/**
 * "Send to selected" button handler used by the manual overlay UI.
 * Shows inline confirmation, then iterates selected friends and sends a templated
 * message to each, respecting `MAX_MESSAGES_PER_SESSION`.
 */
async function handleSendAll() {
  if (isSending) {
    // Clicking while sending triggers abort
    abortManualSend = true;
    setStatus('Stopping after current message…');
    return;
  }

  const targets = friends.filter((f) => selectedFriends.has(f.id));
  if (!targets.length) {
    setStatus('No friends selected');
    return;
  }
  if (!segments.GREETING.length || !segments.BODY.length || !segments.CLOSING.length) {
    setStatus('Add at least one segment of each type first');
    return;
  }

  // Inline confirmation
  const confirmed = await showInlineConfirm(
    `Send messages to ${targets.length} friend${targets.length > 1 ? 's' : ''}?`,
  );
  if (!confirmed) return;

  isSending = true;
  abortManualSend = false;
  const sendBtn = overlay.querySelector<HTMLButtonElement>('#bm-send');

  // Switch to stop button
  if (sendBtn) {
    sendBtn.textContent = '⬛ Stop';
    sendBtn.style.background = '#b91c1c';
    sendBtn.style.boxShadow = '0 3px 8px rgba(185,28,28,0.25)';
  }

  showProgressBar(0, targets.length);

  let sent = 0;
  for (const friend of targets) {
    if (abortManualSend) {
      setStatus(`Stopped — sent ${sent} of ${targets.length}`);
      break;
    }
    if (sent >= MAX_MESSAGES_PER_SESSION) {
      setStatus(`Reached session cap (${MAX_MESSAGES_PER_SESSION})`);
      break;
    }
    try {
      setStatus(`Sending to ${friend.name}…`);
      await sendMessageToFriend(friend);
      sent += 1;
      showProgressBar(sent, targets.length);
      setStatus(`Sent ${sent} / ${targets.length}`);
      if (sent < targets.length) {
        await randomDelay();
      }
    } catch (error) {
      setStatus(`Error on ${friend.name}: ${(error as Error).message}`);
      break;
    }
  }

  // Restore send button
  isSending = false;
  abortManualSend = false;
  if (sendBtn) {
    sendBtn.style.background = '#ca4f02';
    sendBtn.style.boxShadow = '0 3px 8px rgba(202,79,2,0.25)';
  }
  updateSendButton();
  if (sent === targets.length) {
    setStatus(`Done — ${sent} message${sent > 1 ? 's' : ''} sent`);
  }
}

/** Shows a progress bar inside the overlay. */
function showProgressBar(current: number, total: number) {
  let container = overlay.querySelector<HTMLDivElement>('#bm-progress');
  if (!container) {
    container = document.createElement('div');
    container.id = 'bm-progress';
    container.style.cssText = 'margin:8px 0 4px;';
    const bar = document.createElement('div');
    bar.id = 'bm-progress-bar';
    bar.style.cssText =
      'height:6px;border-radius:3px;background:linear-gradient(90deg,#ca4f02,#e56717);transition:width 0.3s ease;width:0%;';
    const track = document.createElement('div');
    track.style.cssText =
      'height:6px;border-radius:3px;background:rgba(202,79,2,0.12);overflow:hidden;';
    track.appendChild(bar);
    const label = document.createElement('div');
    label.id = 'bm-progress-label';
    label.style.cssText = 'font-size:10px;color:#9a8273;text-align:right;margin-top:2px;';
    container.appendChild(track);
    container.appendChild(label);
    // Insert before the send button
    const sendBtn = overlay.querySelector('#bm-send');
    sendBtn?.parentNode?.insertBefore(container, sendBtn);
  }
  const bar = container.querySelector<HTMLDivElement>('#bm-progress-bar');
  const label = container.querySelector<HTMLElement>('#bm-progress-label');
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  if (bar) bar.style.width = `${pct}%`;
  if (label) label.textContent = `${current} / ${total}`;
  container.style.display = total > 0 ? '' : 'none';
}

/** Shows an inline confirmation bar inside the overlay and returns a promise. */
function showInlineConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Remove any existing confirm bar
    overlay.querySelector('#bm-confirm')?.remove();

    const bar = document.createElement('div');
    bar.id = 'bm-confirm';
    bar.style.cssText =
      'background:rgba(202,79,2,0.08);border:1px solid rgba(202,79,2,0.25);border-radius:6px;padding:8px 10px;margin:8px 0;display:flex;flex-direction:column;gap:6px;';
    const msgEl = document.createElement('p');
    msgEl.style.cssText = 'margin:0;font-size:12px;color:#574232;font-weight:500;';
    msgEl.textContent = message;
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:6px;';
    const yesBtn = document.createElement('button');
    yesBtn.textContent = 'Yes, send';
    yesBtn.style.cssText =
      'flex:1;padding:6px;background:#ca4f02;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:12px;font-weight:600;';
    const noBtn = document.createElement('button');
    noBtn.textContent = 'Cancel';
    noBtn.style.cssText =
      'flex:1;padding:6px;background:transparent;color:#6e5a49;border:1px solid #ccc;border-radius:5px;cursor:pointer;font-size:12px;font-weight:600;';

    const cleanup = (result: boolean) => {
      bar.remove();
      resolve(result);
    };
    yesBtn.addEventListener('click', () => cleanup(true));
    noBtn.addEventListener('click', () => cleanup(false));

    btnRow.appendChild(yesBtn);
    btnRow.appendChild(noBtn);
    bar.appendChild(msgEl);
    bar.appendChild(btnRow);

    // Insert before the send button
    const sendBtn = overlay.querySelector('#bm-send');
    sendBtn?.parentNode?.insertBefore(bar, sendBtn);
  });
}

/**
 * Sends a pre-assembled message string to a birthday friend by opening the
 * Messenger dialog on their birthday feed entry and submitting the composed DM.
 * Used by the manual overlay's "send to all" path.
 */
async function sendMessageToFriend(friend: BirthdayFriend): Promise<void> {
  const dialogClicked = openMessageDialog(friend);
  if (!dialogClicked) {
    throw new Error(`Cannot open message for ${friend.name}`);
  }
  const message = composeMessage(segments.GREETING, segments.BODY, segments.CLOSING);
  await fillMessageAndSend(message);
}

function openMessageDialog(friend: BirthdayFriend): boolean {
  // Use the “Message” button or a quick link to the messenger thread. Clicking buttons
  // simulates normal user action instead of relying on private APIs.
  const target =
    friend.messageButton ?? friend.container.querySelector<HTMLElement>("a[href*='/messages/']");
  if (!target) {
    return false;
  }
  target.click();
  return true;
}

/**
 * Simulate realistic typing into a contenteditable element.
 * Types character-by-character with random inter-keystroke delays (40–180ms)
 * and occasional short pauses between words to mimic human behaviour.
 */
async function simulateTyping(element: HTMLElement, text: string): Promise<void> {
  element.focus();
  element.textContent = '';
  element.dispatchEvent(new InputEvent('input', { bubbles: true }));

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    // Append character
    element.textContent = text.slice(0, i + 1);
    element.dispatchEvent(
      new InputEvent('input', { bubbles: true, data: char, inputType: 'insertText' }),
    );

    // Inter-keystroke delay: 40–180ms base
    let keystrokeDelay = 40 + Math.random() * 140;

    // Longer pause after punctuation or spaces (word boundary)
    if (char === ' ' || char === '.' || char === ',' || char === '!' || char === '?') {
      keystrokeDelay += 80 + Math.random() * 200;
    }

    // Occasional micro-pause (5% chance, 200–500ms) to simulate thinking
    if (Math.random() < 0.05) {
      keystrokeDelay += 200 + Math.random() * 300;
    }

    await new Promise((resolve) => setTimeout(resolve, keystrokeDelay));
  }

  // Final input event to ensure React state is synced
  element.dispatchEvent(new InputEvent('input', { bubbles: true }));
}

async function fillMessageAndSend(message: string): Promise<void> {
  await waitForSelector("[role='textbox'], div[contenteditable='true']", 5000);
  const textbox = document.querySelector<HTMLElement>(
    "[role='textbox'], div[contenteditable='true']",
  );
  if (!textbox) {
    throw new Error('Message textbox not found');
  }

  // Use typing simulation for realistic input
  await simulateTyping(textbox, message);

  const sendButton = document.querySelector<HTMLElement>(
    "div[aria-label='Send'] button, button[aria-label='Send']",
  );
  if (!sendButton) {
    throw new Error('Send button not found');
  }
  await simulateClick(sendButton);
}

/**
 * Waits up to `timeout` ms for a DOM element matching `selector` to appear,
 * polling via `requestAnimationFrame`. Rejects if the timeout is exceeded.
 */
async function waitForSelector(selector: string, timeout = 5000): Promise<boolean> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (document.querySelector(selector)) {
        resolve(true);
        return;
      }
      if (Date.now() - start > timeout) {
        reject(new Error(`Waiting for selector ${selector} timed out`));
        return;
      }
      requestAnimationFrame(check);
    };
    check();
  });
}

/**
 * Injects a scoped stylesheet into the page with CSS classes that mirror the popup's design tokens.
 * All selectors are prefixed with `.bm-` to avoid conflicts with Facebook's styles.
 */
function injectOverlayStyles(): void {
  if (document.getElementById('bm-overlay-styles')) return;
  const style = document.createElement('style');
  style.id = 'bm-overlay-styles';
  style.textContent = `
    /* ── Overlay root ─────────────────────────────── */
    .bm-overlay {
      position: fixed;
      top: 12px;
      right: 12px;
      width: 340px;
      max-height: 90vh;
      overflow-y: auto;
      background: #ffb34c;
      border: none;
      border-radius: 0.75rem;
      padding: 0.75rem;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      color: #574232;
      z-index: 2147483647;
      box-shadow: 0 4px 16px rgba(0,0,0,0.15), 0 2px 6px rgba(0,0,0,0.08);
    }
    .bm-overlay::-webkit-scrollbar { width: 4px; height: 4px; }
    .bm-overlay::-webkit-scrollbar-track { background: rgba(0,0,0,0.08); border-radius: 4px; }
    .bm-overlay::-webkit-scrollbar-thumb { background: #ca4f02; border-radius: 4px; }

    /* ── Header ────────────────────────────────────── */
    .bm-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.625rem;
      padding: 0.5rem 0.75rem;
      background: #fff;
      border-radius: 0.75rem;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
    }
    .bm-header-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .bm-header-right {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .bm-title {
      font-size: 14px;
      font-weight: 700;
      color: #574232;
      letter-spacing: -0.02em;
    }
    .bm-status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #9a8273;
      flex-shrink: 0;
      transition: background 0.3s ease;
    }

    /* ── Cards (mirrors popup .card) ──────────────── */
    .bm-card {
      background: #ffffff;
      border: none;
      border-radius: 0.75rem;
      padding: 0.75rem 1rem;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
    }

    /* ── Section spacing ──────────────────────────── */
    .bm-section {
      margin-bottom: 0.625rem;
    }

    /* ── Inner sections (tinted areas within the body card) ── */
    .bm-inner-section {
      background: #fef7f0;
      border-radius: 0.5rem;
      padding: 0.5rem 0.75rem;
    }

    /* ── Section label (uppercase muted heading) ──── */
    .bm-section-label {
      font-size: 0.6875rem;
      font-weight: 700;
      color: #2a7fa0;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 6px;
    }

    /* ── Buttons ───────────────────────────────────── */
    .bm-btn-primary {
      margin-top: 10px;
      width: 100%;
      padding: 0.625rem 0.75rem;
      background: #ca4f02;
      color: #fff;
      border: none;
      border-radius: 0.75rem;
      cursor: pointer;
      font-size: 0.8125rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      box-shadow: 0 3px 8px rgba(202,79,2,0.25), 0 1px 3px rgba(202,79,2,0.15);
      transition: background 0.2s ease, transform 0.15s ease, box-shadow 0.2s ease;
    }
    .bm-btn-primary:hover:not(:disabled) {
      background: #e56717;
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(202,79,2,0.3), 0 2px 6px rgba(202,79,2,0.2);
    }
    .bm-btn-primary:active:not(:disabled) {
      transform: translateY(0);
    }
    .bm-btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .bm-btn-outline {
      font-size: 0.75rem;
      padding: 0.35rem 0.65rem;
      background: #fff;
      border: 1.5px solid #ca4f02;
      color: #ca4f02;
      border-radius: 0.5rem;
      cursor: pointer;
      font-weight: 600;
      transition: background 0.2s ease, transform 0.15s ease;
    }
    .bm-btn-outline:hover {
      background: rgba(202,79,2,0.08);
      transform: translateY(-1px);
    }
    .bm-btn-outline:active {
      transform: translateY(0);
    }

    .bm-btn-small {
      font-size: 0.6875rem;
      padding: 0.25rem 0.5rem;
      background: #ca4f02;
      color: #fff;
      border: none;
      border-radius: 0.375rem;
      cursor: pointer;
      font-weight: 600;
      transition: background 0.2s ease;
    }
    .bm-btn-small:hover {
      background: #e56717;
    }

    .bm-icon-btn {
      background: transparent;
      border: none;
      cursor: pointer;
      color: #6e5a49;
      font-size: 16px;
      line-height: 1;
      padding: 4px 6px;
      border-radius: 0.375rem;
      transition: background 0.2s ease, color 0.2s ease;
    }
    .bm-icon-btn:hover {
      background: rgba(202,79,2,0.08);
      color: #ca4f02;
    }

    .bm-help-btn {
      border: 1px solid rgba(202,79,2,0.2);
      border-radius: 50%;
      font-size: 11px;
      font-weight: 700;
      color: #9a8273;
      padding: 2px 7px;
    }
    .bm-help-btn:hover,
    .bm-help-btn--active {
      background: rgba(202,79,2,0.1);
      color: #ca4f02;
      border-color: #ca4f02;
    }

    .bm-minimize-btn {
      font-size: 18px;
      padding: 2px 7px;
    }

    .bm-link-btn {
      background: none;
      border: none;
      cursor: pointer;
      color: #6e5a49;
      font-size: 0.6875rem;
      font-weight: 600;
      padding: 2px 4px;
      transition: color 0.15s ease;
    }
    .bm-link-btn:hover {
      color: #ca4f02;
    }

    /* ── Toggle buttons ───────────────────────────── */
    .bm-toggle-btn {
      font-size: 0.6875rem;
      padding: 0.25rem 0.5rem;
      border-radius: 0.375rem;
      cursor: pointer;
      font-weight: 600;
      border: 1px solid #d1d5db;
      background: transparent;
      color: #9a8273;
      transition: all 0.2s ease;
    }
    .bm-toggle-btn--on {
      border-color: #ca4f02;
      background: rgba(202,79,2,0.1);
      color: #ca4f02;
    }
    .bm-toggle-btn:hover {
      border-color: #ca4f02;
      color: #ca4f02;
    }

    /* ── Select dropdown ──────────────────────────── */
    .bm-select {
      width: 100%;
      font-size: 0.75rem;
      padding: 0.375rem 0.5rem;
      border: 1.5px solid rgba(202,79,2,0.18);
      border-radius: 0.375rem;
      background: #fff;
      color: #574232;
      cursor: pointer;
      outline: none;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }
    .bm-select:focus {
      border-color: #2a7fa0;
      box-shadow: 0 0 0 3px rgba(42,127,160,0.15);
    }

    /* ── Body wrapper (white card for main content) ─ */
    .bm-body {
      background: #fff;
      border-radius: 0.75rem;
      padding: 0.75rem 1rem;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
    }

    /* ── Status & text ────────────────────────────── */
    .bm-status-text {
      margin: 0 0 4px 0;
      font-size: 13px;
      color: #6e5a49;
    }
    .bm-friend-count {
      margin: 0 0 8px;
      font-size: 0.6875rem;
      color: #9a8273;
      font-weight: 500;
    }
    .bm-muted-text {
      font-size: 0.6875rem;
      color: #6e5a49;
    }

    /* ── Stats pills ──────────────────────────────── */
    .bm-stats-row {
      display: flex;
      gap: 6px;
      margin-bottom: 10px;
      flex-wrap: wrap;
    }
    .bm-stat-pill {
      font-size: 0.6875rem;
      padding: 0.25rem 0.625rem;
      border-radius: 9999px;
      background: #fef7f0;
      color: #6e5a49;
      font-weight: 600;
      white-space: nowrap;
      cursor: default;
      border: 1px solid rgba(202,79,2,0.1);
    }
    .bm-stat-pill--alert {
      color: #b91c1c;
      background: #fef2f2;
      border-color: rgba(185,28,28,0.15);
    }

    /* ── Friend list ──────────────────────────────── */
    .bm-friend-list {
      max-height: 200px;
      overflow-y: auto;
    }
    .bm-select-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
      padding: 2px 0;
    }
    .bm-friend-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0.5rem;
      margin-bottom: 4px;
      border-radius: 0.5rem;
      background: #fef7f0;
      transition: background 0.2s ease;
      cursor: pointer;
    }
    .bm-friend-row:hover {
      background: rgba(202,79,2,0.06);
    }
    .bm-checkbox {
      accent-color: #ca4f02;
      margin: 0;
      cursor: pointer;
      flex-shrink: 0;
    }
    .bm-avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: linear-gradient(135deg, #e56717, #ca4f02);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
      flex-shrink: 0;
    }
    .bm-friend-name {
      font-size: 0.8125rem;
      font-weight: 600;
      color: #574232;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .bm-profile-link {
      font-size: 0.625rem;
      color: #ca4f02;
      text-decoration: none;
    }
    .bm-profile-link:hover {
      text-decoration: underline;
    }
    .bm-send-one-btn {
      background: none;
      border: 1px solid rgba(202,79,2,0.3);
      cursor: pointer;
      color: #ca4f02;
      font-size: 10px;
      padding: 3px 6px;
      border-radius: 0.375rem;
      flex-shrink: 0;
      transition: background 0.2s ease;
    }
    .bm-send-one-btn:hover {
      background: rgba(202,79,2,0.1);
    }

    /* ── Empty state ──────────────────────────────── */
    .bm-empty-state {
      text-align: center;
      padding: 1rem 0.5rem;
      color: #9a8273;
      font-size: 0.8125rem;
      line-height: 1.5;
    }
    .bm-empty-title {
      margin: 0 0 4px;
      font-weight: 600;
      color: #6e5a49;
    }
    .bm-empty-subtitle {
      margin: 0;
    }

    /* ── Template preview ─────────────────────────── */
    .bm-preview-text {
      margin: 0;
      font-size: 0.75rem;
      color: #574232;
      line-height: 1.5;
      font-style: italic;
    }

    /* ── Help panel ───────────────────────────────── */
    .bm-help-panel {
      margin-top: 10px;
      border-radius: 0.5rem;
      padding: 0.75rem 1rem;
      background: #fef7f0;
    }
    .bm-help-content {
      font-size: 0.6875rem;
      color: #574232;
      line-height: 1.6;
    }
    .bm-help-item {
      display: flex;
      gap: 8px;
      align-items: flex-start;
    }
    .bm-help-item--bordered {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid rgba(0,0,0,0.06);
    }
    .bm-help-icon {
      font-size: 14px;
      flex-shrink: 0;
      line-height: 1.4;
    }
    .bm-help-item-title {
      font-weight: 600;
      font-size: 0.6875rem;
      color: #574232;
      margin-bottom: 1px;
    }
    .bm-help-item-text {
      font-size: 0.65rem;
      color: #6e5a49;
      line-height: 1.5;
    }

    /* ── Reduced motion ───────────────────────────── */
    @media (prefers-reduced-motion: reduce) {
      .bm-overlay, .bm-overlay * {
        transition-duration: 0.01ms !important;
      }
    }
  `;
  document.head.appendChild(style);
}

/**
 * Creates (or returns the existing) overlay sidebar and appends it to `document.body`.
 * The overlay shows a friend list, a status line, and Send / Refresh buttons.
 * Styled to match the popup's design system using injected CSS classes.
 */
function createOverlay(): HTMLElement {
  const existing = document.getElementById(overlayId);
  if (existing) {
    return existing;
  }

  // Inject scoped stylesheet matching the popup's design tokens
  injectOverlayStyles();

  const wrapper = document.createElement('div');
  wrapper.id = overlayId;
  wrapper.className = 'bm-overlay';

  wrapper.setAttribute('role', 'region');
  wrapper.setAttribute('aria-label', 'BirthdayMessaging automation panel');
  wrapper.setAttribute('tabindex', '-1');

  wrapper.innerHTML = `
    <div id="bm-header" class="bm-header">
      <div class="bm-header-left">
        <span id="bm-status-dot" class="bm-status-dot" title="Checking…"></span>
        <strong class="bm-title">BirthdayMessaging</strong>
      </div>
      <div class="bm-header-right">
        <button id="bm-help-toggle" class="bm-icon-btn bm-help-btn"
          aria-label="Toggle help and tips" title="Show help &amp; tips">?</button>
        <button id="bm-minimize" class="bm-icon-btn bm-minimize-btn"
          aria-label="Minimize panel" title="Collapse / expand this panel">−</button>
        <button id="bm-refresh" class="bm-btn-outline"
          aria-label="Refresh friend list" title="Re-scan the page for birthday friends and reload templates">Refresh</button>
      </div>
    </div>
    <div id="bm-body" class="bm-body">
      <p id="bm-status" class="bm-status-text" aria-live="polite">Ready</p>
      <p id="bm-friend-count" class="bm-friend-count"></p>

      <!-- Session stats -->
      <div id="bm-stats" class="bm-stats-row" title="Messages sent against your safety caps"></div>

      <!-- Queue status -->
      <div id="bm-queue-status" class="bm-section"></div>

      <!-- Feature toggles -->
      <div id="bm-toggles" class="bm-inner-section bm-section"></div>

      <!-- Group selector -->
      <div id="bm-group-selector" class="bm-section"></div>

      <!-- Template preview -->
      <div id="bm-template-preview" class="bm-section"></div>

      <!-- Friend list -->
      <div id="bm-friend-list" class="bm-friend-list" aria-label="Birthday friends" role="list"></div>

      <!-- Send button -->
      <button id="bm-send" class="bm-btn-primary"
        aria-label="Send birthday messages to selected friends"
        title="Send messages to checked friends (5-15s delay between each)">Send to all</button>

      <!-- Help & Tips (collapsed by default) -->
      <div id="bm-help" class="bm-help-panel" style="display:none;">
        <div class="bm-section-label">Help &amp; Tips</div>
        <div id="bm-help-content" class="bm-help-content"></div>
      </div>
    </div>
  `;

  document.body.appendChild(wrapper);

  const header = wrapper.querySelector<HTMLElement>('#bm-header');
  const body = wrapper.querySelector<HTMLElement>('#bm-body');
  const minimizeBtn = wrapper.querySelector<HTMLButtonElement>('#bm-minimize');
  const refreshBtn = wrapper.querySelector<HTMLButtonElement>('#bm-refresh');
  const sendBtn = wrapper.querySelector<HTMLButtonElement>('#bm-send');
  const helpToggle = wrapper.querySelector<HTMLButtonElement>('#bm-help-toggle');
  const helpPanel = wrapper.querySelector<HTMLDivElement>('#bm-help');

  // Populate help content
  renderHelpContent(wrapper);

  // Minimize / maximize toggle
  minimizeBtn?.addEventListener('click', () => {
    if (!body || !minimizeBtn || !header) return;
    const isMinimized = body.style.display === 'none';
    if (isMinimized) {
      body.style.display = '';
      header.style.marginBottom = '12px';
      minimizeBtn.textContent = '−';
      minimizeBtn.setAttribute('aria-label', 'Minimize panel');
      wrapper.style.maxHeight = '90vh';
      wrapper.style.overflowY = 'auto';
    } else {
      body.style.display = 'none';
      header.style.marginBottom = '0';
      minimizeBtn.textContent = '+';
      minimizeBtn.setAttribute('aria-label', 'Expand panel');
      wrapper.style.maxHeight = 'none';
      wrapper.style.overflowY = 'visible';
    }
  });

  refreshBtn?.addEventListener('click', () => void refreshFriendList());
  sendBtn?.addEventListener('click', () => void handleSendAll());

  // Help toggle
  helpToggle?.addEventListener('click', () => {
    if (!helpPanel || !helpToggle) return;
    const isVisible = helpPanel.style.display !== 'none';
    helpPanel.style.display = isVisible ? 'none' : '';
    helpToggle.classList.toggle('bm-help-btn--active', !isVisible);
    helpToggle.title = isVisible ? 'Show help & tips' : 'Hide help & tips';
  });

  // Escape key collapses the overlay
  wrapper.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      wrapper.style.display = 'none';
    }
  });

  // Drag to reposition
  if (header) {
    header.style.cursor = 'grab';
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    header.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      const rect = wrapper.getBoundingClientRect();
      // Switch from right-anchored to left-anchored so dragging works in any direction
      wrapper.style.right = 'auto';
      wrapper.style.left = rect.left + 'px';
      wrapper.style.top = rect.top + 'px';
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      isDragging = true;
      header.style.cursor = 'grabbing';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const maxLeft = window.innerWidth - wrapper.offsetWidth;
      const maxTop = window.innerHeight - wrapper.offsetHeight;
      wrapper.style.left = Math.max(0, Math.min(maxLeft, startLeft + dx)) + 'px';
      wrapper.style.top = Math.max(0, Math.min(maxTop, startTop + dy)) + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      header.style.cursor = 'grab';
    });
  }

  // Initialize dynamic sections
  void renderOverlayStatus();

  wrapper.focus();
  return wrapper;
}

// ============================================================
// OVERLAY DYNAMIC SECTIONS
// ============================================================

/** Loads feature flags from storage. */
async function loadFeatureFlags(): Promise<OverlayFeatureFlags> {
  const result = await chrome.storage.local.get(FEATURE_FLAGS_KEY);
  return (
    (result[FEATURE_FLAGS_KEY] as OverlayFeatureFlags | undefined) ?? {
      makePost: true,
      sendMessage: true,
      archiveAfterSend: false,
    }
  );
}

/** Saves feature flags to storage. */
async function saveFeatureFlags(flags: OverlayFeatureFlags): Promise<void> {
  await chrome.storage.local.set({ [FEATURE_FLAGS_KEY]: flags });
}

/** Renders session stats, feature toggles, template preview, queue status, group selector, and status indicator. */
async function renderOverlayStatus() {
  await Promise.all([
    renderSessionStats(),
    renderQueueStatus(),
    renderFeatureToggles(),
    // renderGroupSelector(),  // Commented out — feature not currently needed
    renderTemplatePreview(),
    renderStatusDot(),
  ]);
}

/** Renders rate-limit session stats. */
async function renderSessionStats() {
  const container = overlay.querySelector<HTMLDivElement>('#bm-stats');
  if (!container) return;

  try {
    const rl = await checkRateLimit();
    container.innerHTML = '';

    const pills: Array<{ label: string; value: string; color: string; tooltip: string }> = [
      {
        label: 'Hourly',
        value: `${rl.hourly.used}/${rl.hourly.cap}`,
        color: rl.hourly.used >= rl.hourly.cap ? '#b91c1c' : '#6e5a49',
        tooltip: `${rl.hourly.used} of ${rl.hourly.cap} messages sent this hour`,
      },
      {
        label: 'Daily',
        value: `${rl.daily.used}/${rl.daily.cap}`,
        color: rl.daily.used >= rl.daily.cap ? '#b91c1c' : '#6e5a49',
        tooltip: `${rl.daily.used} of ${rl.daily.cap} messages sent today`,
      },
      {
        label: 'Weekly',
        value: `${rl.weekly.used}/${rl.weekly.cap}`,
        color: rl.weekly.used >= rl.weekly.cap ? '#b91c1c' : '#6e5a49',
        tooltip: `${rl.weekly.used} of ${rl.weekly.cap} messages sent this week`,
      },
    ];

    pills.forEach(({ label, value, color, tooltip }) => {
      const pill = document.createElement('span');
      pill.className = 'bm-stat-pill';
      if (color === '#b91c1c') pill.classList.add('bm-stat-pill--alert');
      pill.textContent = `${label}: ${value}`;
      pill.title = tooltip;
      container.appendChild(pill);
    });
  } catch {
    container.innerHTML = '<span class="bm-muted-text">Stats unavailable</span>';
  }
}

/** Renders a compact queue status bar showing pending/failed counts with a retry button. */
async function renderQueueStatus() {
  const container = overlay.querySelector<HTMLDivElement>('#bm-queue-status');
  if (!container) return;

  try {
    interface QueueItem {
      status: string;
    }
    const queue = await sendContentMessage<QueueItem[]>({ type: 'messages.listQueue' });
    if (!Array.isArray(queue) || queue.length === 0) {
      container.style.display = 'none';
      return;
    }

    const pending = queue.filter((m) => m.status === 'pending' || m.status === 'processing').length;
    const failed = queue.filter((m) => m.status === 'failed').length;

    if (pending === 0 && failed === 0) {
      container.style.display = 'none';
      return;
    }

    container.style.display = '';
    container.innerHTML = '';

    const bar = document.createElement('div');
    bar.className = 'bm-inner-section';
    bar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;';

    const info = document.createElement('span');
    info.className = 'bm-muted-text';
    const parts: string[] = [];
    if (pending > 0) parts.push(`${pending} pending`);
    if (failed > 0)
      parts.push(`<span style="color:#b91c1c;font-weight:600;">${failed} failed</span>`);
    info.innerHTML = `📬 Queue: ${parts.join(', ')}`;
    bar.appendChild(info);

    if (failed > 0) {
      const retryBtn = document.createElement('button');
      retryBtn.textContent = 'Retry';
      retryBtn.className = 'bm-btn-small';
      retryBtn.addEventListener('click', async () => {
        const failedItems = queue.filter((m) => m.status === 'failed') as Array<
          QueueItem & { id: string }
        >;
        for (const item of failedItems) {
          if (item.id) {
            await sendContentMessage({ type: 'messages.retryQueued', payload: { id: item.id } });
          }
        }
        await renderQueueStatus();
      });
      bar.appendChild(retryBtn);
    }

    container.appendChild(bar);
  } catch {
    container.style.display = 'none';
  }
}

// Message group selector — commented out, feature not currently needed
// const ACTIVE_GROUP_KEY = 'bm_active_group_id';

// /** Renders a group selector dropdown so users can switch active message groups without leaving Facebook. */
// async function renderGroupSelector() {
//   const container = overlay.querySelector<HTMLDivElement>('#bm-group-selector');
//   if (!container) return;
//
//   try {
//     interface GroupItem { id: string; name: string; gender: string }
//     const groups = await sendContentMessage<GroupItem[]>({ type: 'messageGroups.list' });
//
//     if (!Array.isArray(groups) || groups.length === 0) {
//       container.style.display = 'none';
//       return;
//     }
//
//     container.style.display = '';
//     container.innerHTML = '';
//
//     const stored = await chrome.storage.local.get(ACTIVE_GROUP_KEY);
//     const activeId = (stored[ACTIVE_GROUP_KEY] as string) || '';
//
//     const wrapper = document.createElement('div');
//     wrapper.className = 'bm-inner-section';
//
//     const label = document.createElement('div');
//     label.className = 'bm-section-label';
//     label.textContent = 'Message Group';
//     wrapper.appendChild(label);
//
//     const select = document.createElement('select');
//     select.className = 'bm-select';
//
//     const defaultOpt = document.createElement('option');
//     defaultOpt.value = '';
//     defaultOpt.textContent = '— Select a group —';
//     select.appendChild(defaultOpt);
//
//     groups.forEach((g) => {
//       const opt = document.createElement('option');
//       opt.value = g.id;
//       opt.textContent = `${g.name} (${g.gender})`;
//       if (g.id === activeId) opt.selected = true;
//       select.appendChild(opt);
//     });
//
//     select.addEventListener('change', async () => {
//       await chrome.storage.local.set({ [ACTIVE_GROUP_KEY]: select.value });
//     });
//
//     wrapper.appendChild(select);
//     container.appendChild(wrapper);
//   } catch {
//     container.style.display = 'none';
//   }
// }

/** Renders feature flag quick-toggles in the overlay. */
async function renderFeatureToggles() {
  const container = overlay.querySelector<HTMLDivElement>('#bm-toggles');
  if (!container) return;

  const flags = await loadFeatureFlags();
  container.innerHTML = '';

  const heading = document.createElement('div');
  heading.className = 'bm-section-label';
  heading.textContent = 'Features';
  container.appendChild(heading);

  const toggleDefs: Array<{ key: keyof OverlayFeatureFlags; label: string; tooltip: string }> = [
    {
      key: 'sendMessage',
      label: 'DM',
      tooltip: 'Send a direct message via Messenger to birthday friends',
    },
    { key: 'makePost', label: 'Post', tooltip: 'Post a birthday wish on their timeline' },
    {
      key: 'archiveAfterSend',
      label: 'Archive',
      tooltip: 'Archive the Messenger conversation after sending (keep off for safety)',
    },
  ];

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;';

  toggleDefs.forEach(({ key, label, tooltip }) => {
    const btn = document.createElement('button');
    const isOn = flags[key];
    btn.textContent = `${label}: ${isOn ? 'ON' : 'OFF'}`;
    btn.title = tooltip;
    btn.className = `bm-toggle-btn ${isOn ? 'bm-toggle-btn--on' : ''}`;
    btn.addEventListener('click', async () => {
      flags[key] = !flags[key];
      await saveFeatureFlags(flags);
      renderFeatureToggles();
    });
    row.appendChild(btn);
  });

  container.appendChild(row);
}

/** Renders a sample template preview so users can see what will be sent. */
function renderTemplatePreview() {
  const container = overlay.querySelector<HTMLDivElement>('#bm-template-preview');
  if (!container) return;
  container.innerHTML = '';

  if (!segments.GREETING.length || !segments.BODY.length || !segments.CLOSING.length) {
    container.style.display = 'none';
    return;
  }

  container.style.display = '';
  const wrapper = document.createElement('div');
  wrapper.className = 'bm-inner-section';

  const heading = document.createElement('div');
  heading.style.cssText =
    'display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;';
  const title = document.createElement('span');
  title.className = 'bm-section-label';
  title.style.marginBottom = '0';
  title.textContent = 'Preview';
  const shuffleBtn = document.createElement('button');
  shuffleBtn.textContent = '🔀';
  shuffleBtn.title = 'Generate new preview';
  shuffleBtn.className = 'bm-icon-btn';
  shuffleBtn.style.fontSize = '12px';
  shuffleBtn.addEventListener('click', () => renderTemplatePreview());
  heading.appendChild(title);
  heading.appendChild(shuffleBtn);

  const preview = document.createElement('p');
  preview.className = 'bm-preview-text';
  preview.textContent = composeMessage(segments.GREETING, segments.BODY, segments.CLOSING);

  wrapper.appendChild(heading);
  wrapper.appendChild(preview);
  container.appendChild(wrapper);
}

/** Updates the status indicator dot (green/yellow/red). */
async function renderStatusDot() {
  const dot = overlay.querySelector<HTMLElement>('#bm-status-dot');
  if (!dot) return;

  try {
    const [emergencyState, config, prefHours, rateLimit] = await Promise.all([
      getEmergencyStopState(),
      getAutomationConfig(),
      getPreferredHours(),
      checkRateLimit(),
    ]);

    if (emergencyState.active) {
      dot.style.background = '#b91c1c';
      dot.title = 'Emergency stop active';
    } else if (!rateLimit.allowed) {
      dot.style.background = '#f59e0b';
      dot.title = 'Rate limit reached';
    } else if (!config.enabled) {
      dot.style.background = '#9a8273';
      dot.title = 'Automation disabled';
    } else if (prefHours.enabled && !isWithinPreferredHours(prefHours)) {
      dot.style.background = '#f59e0b';
      dot.title = 'Outside preferred hours';
    } else {
      dot.style.background = '#16a34a';
      dot.title = 'Automation active';
    }
  } catch {
    dot.style.background = '#9a8273';
    dot.title = 'Status unknown';
  }
}

/** Populates the Help & Tips panel with contextual guidance. */
function renderHelpContent(container: HTMLElement) {
  const content = container.querySelector<HTMLElement>('#bm-help-content');
  if (!content) return;

  const tips: Array<{ icon: string; title: string; text: string }> = [
    {
      icon: '🎂',
      title: 'Getting started',
      text: "Navigate to <b>facebook.com/birthdays</b> and click <b>Refresh</b> to detect today's birthday friends.",
    },
    {
      icon: '✅',
      title: 'Selecting friends',
      text: 'Use checkboxes to pick who gets a message. Click a row to toggle, or use <b>Select all / Deselect all</b>.',
    },
    {
      icon: '▶',
      title: 'Sending one-by-one',
      text: "Click the <b>▶</b> button on a friend's row to send only to that person without affecting others.",
    },
    {
      icon: '⬛',
      title: 'Stopping a send',
      text: 'While messages are sending, the button turns red — click <b>Stop</b> to halt after the current message finishes.',
    },
    {
      icon: '🔀',
      title: 'Template preview',
      text: 'The <b>Preview</b> section shows a sample message. Click 🔀 to shuffle. Templates are managed in the extension popup.',
    },
    {
      icon: '⚡',
      title: 'Feature toggles',
      text: '<b>DM</b> = send a direct message, <b>Post</b> = post on their timeline, <b>Archive</b> = archive the chat after sending (keep off for safety).',
    },
    {
      icon: '🛡️',
      title: 'Rate limits',
      text: 'The stats pills show messages sent vs. your caps. Sending pauses automatically when a cap is reached.',
    },
    {
      icon: '🟢',
      title: 'Status dot',
      text: 'Green = automation active. Yellow = rate-limited or outside preferred hours. Red = emergency stop. Gray = disabled.',
    },
    {
      icon: '⌨️',
      title: 'Keyboard shortcut',
      text: 'Press <b>Escape</b> to hide the overlay. Drag the title bar to reposition it.',
    },
    {
      icon: '💡',
      title: 'Safety tip',
      text: 'Use 3+ template variations and keep sending to ≤10 friends/hour to stay within normal Facebook behaviour patterns.',
    },
  ];

  content.innerHTML = '';
  tips.forEach(({ icon, title, text }, i) => {
    const item = document.createElement('div');
    item.className = 'bm-help-item';
    if (i > 0) item.classList.add('bm-help-item--bordered');
    const iconEl = document.createElement('span');
    iconEl.className = 'bm-help-icon';
    iconEl.textContent = icon;
    const body = document.createElement('div');
    body.style.minWidth = '0';
    const titleEl = document.createElement('div');
    titleEl.className = 'bm-help-item-title';
    titleEl.textContent = title;
    const textEl = document.createElement('div');
    textEl.className = 'bm-help-item-text';
    textEl.innerHTML = text;
    body.appendChild(titleEl);
    body.appendChild(textEl);
    item.appendChild(iconEl);
    item.appendChild(body);
    content.appendChild(item);
  });
}

async function initContentScript() {
  await refreshFriendList();
}

// ============================================================
// CLIPBOARD PERMISSION CHECK
// ============================================================

const CLIPBOARD_BANNER_ID = 'bm-clipboard-warning';

async function checkClipboardPermission(): Promise<void> {
  try {
    const status = await navigator.permissions.query({
      name: 'clipboard-write' as PermissionName,
    });
    if (status.state === 'denied') {
      showClipboardPermissionBanner();
    }
  } catch {
    // permissions API not available or not applicable — silently ignore
  }
}

function showClipboardPermissionBanner(): void {
  if (document.getElementById(CLIPBOARD_BANNER_ID)) return;
  const banner = document.createElement('div');
  banner.id = CLIPBOARD_BANNER_ID;
  banner.style.cssText = [
    'position:fixed',
    'bottom:16px',
    'left:50%',
    'transform:translateX(-50%)',
    'z-index:2147483647',
    'max-width:480px',
    'width:calc(100% - 32px)',
    'background:#fff3cd',
    'border:1.5px solid #f59e0b',
    'border-radius:8px',
    'padding:12px 16px',
    'font-family:system-ui,sans-serif',
    'font-size:13px',
    'box-shadow:0 4px 12px rgba(0,0,0,0.15)',
    'display:flex',
    'gap:12px',
    'align-items:flex-start',
  ].join(';');
  banner.innerHTML = `
    <div style="flex:1">
      <strong style="color:#92400e;">Clipboard permission required</strong>
      <p style="margin:4px 0 0;color:#78350f;">
        BirthdayMessaging needs clipboard access on Facebook to fill messages reliably.
        Go to <strong>Site Settings → Clipboard → Allow</strong> for facebook.com, then refresh.
      </p>
    </div>
    <button id="bm-clipboard-dismiss"
      style="background:none;border:none;cursor:pointer;font-size:18px;color:#92400e;padding:0;line-height:1;"
      aria-label="Dismiss">&#10005;</button>
  `;
  document.body.appendChild(banner);
  banner.querySelector('#bm-clipboard-dismiss')?.addEventListener('click', () => banner.remove());
}

void initContentScript();

// Start tracking user activity for the user-active fail-safe check.
initUserActivityTracking();

// Run selector health-check on birthday pages to detect DOM changes early.
if (window.location.href.includes('/birthdays') || window.location.href.includes('/messages')) {
  // Delay slightly to let Facebook finish rendering
  setTimeout(() => {
    const report = runSelectorHealthCheck();
    if (report.failed.length > 0) {
      console.warn('[BM] Selector health-check failures:', report.failed);
    }
  }, 3000);
}

// Run selector health-check on birthday pages to detect DOM changes early.
if (window.location.href.includes('/birthdays') || window.location.href.includes('/messages')) {
  // Delay slightly to let Facebook finish rendering
  setTimeout(() => {
    const report = runSelectorHealthCheck();
    if (report.failed.length > 0) {
      console.warn('[BM] Selector health-check failures:', report.failed);
    }
  }, 3000);
}

// ============================================================
// HUMAN-IN-THE-LOOP CONFIRMATION UI
// ============================================================

/**
 * Shows an in-page confirmation modal before sending a message.
 * Returns a promise that resolves with the user's choice.
 */
function showSendConfirmation(
  friendName: string,
  messagePreview: string,
): Promise<'send' | 'skip' | 'sendAll' | 'pause'> {
  return new Promise((resolve) => {
    const modalId = 'bm-confirm-modal';
    // Remove any existing modal
    document.getElementById(modalId)?.remove();

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:2147483647',
      'background:rgba(0,0,0,0.6)',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'font-family:system-ui,sans-serif',
    ].join(';');

    const truncated =
      messagePreview.length > 120 ? messagePreview.slice(0, 120) + '…' : messagePreview;

    // Escape user-controlled strings to prevent XSS via crafted Facebook display names
    const escapeHtml = (s: string): string => {
      const el = document.createElement('span');
      el.textContent = s;
      return el.innerHTML;
    };

    modal.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:24px 28px;max-width:420px;width:calc(100% - 32px);box-shadow:0 8px 32px rgba(0,0,0,0.3);">
        <p style="font-size:16px;font-weight:700;margin:0 0 8px;color:#1a1a2e;">
          🎂 It's ${escapeHtml(friendName)}'s birthday!
        </p>
        <p style="font-size:13px;color:#555;margin:0 0 12px;">
          Send your prepared message?
        </p>
        <div style="background:#f5f5f5;border-radius:8px;padding:10px 12px;margin:0 0 16px;font-size:13px;color:#333;max-height:80px;overflow-y:auto;">
          ${escapeHtml(truncated)}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button data-action="send" style="flex:1;padding:10px 16px;background:#4CAF50;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:14px;">
            Send
          </button>
          <button data-action="skip" style="flex:1;padding:10px 16px;background:#e0e0e0;color:#333;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:14px;">
            Skip
          </button>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px;">
          <button data-action="sendAll" style="flex:1;padding:8px 12px;background:#2196F3;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;">
            Send All Remaining
          </button>
          <button data-action="pause" style="flex:1;padding:8px 12px;background:#f44336;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;">
            Pause Automation
          </button>
        </div>
      </div>
    `;

    const cleanup = (action: 'send' | 'skip' | 'sendAll' | 'pause') => {
      modal.remove();
      resolve(action);
    };

    modal.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const action = target.dataset.action;
      if (action === 'send' || action === 'skip' || action === 'sendAll' || action === 'pause') {
        cleanup(action);
      }
    });

    document.body.appendChild(modal);
  });
}

// ============================================================
// AUTOMATION OVERLAY  (full-screen dimmer shown during a run)
// ============================================================

let automationOverlay: HTMLElement | null = null;

function showAutomationOverlay(friendName: string): void {
  if (!automationOverlay) {
    automationOverlay = document.createElement('div');
    automationOverlay.id = 'bm-auto-overlay';
    automationOverlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:2147483646',
      'background:rgba(0,0,0,0.55)',
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'justify-content:center',
      'color:#fff',
      'font-family:system-ui,sans-serif',
    ].join(';');
    automationOverlay.innerHTML = `
      <div style="background:rgba(24,24,35,0.92);padding:32px 48px;border-radius:16px;text-align:center;max-width:420px;">
        <p style="font-size:18px;font-weight:700;margin:0 0 8px;">BirthdayMessaging</p>
        <p id="bm-auto-name" style="font-size:15px;margin:0;opacity:0.85;">Processing…</p>
      </div>`;
    document.body.appendChild(automationOverlay);
  }
  const nameEl = automationOverlay.querySelector<HTMLParagraphElement>('#bm-auto-name');
  if (nameEl) nameEl.textContent = `Sending to ${friendName}…`;
  automationOverlay.style.display = 'flex';
}

function hideAutomationOverlay(): void {
  if (automationOverlay) automationOverlay.style.display = 'none';
}

// ============================================================
// MESSENGER HELPERS
// ============================================================

/**
 * Use the Message button from a live BirthdayFriend entry and send a
 * pre-composed DM string. Used for current-day birthday friends.
 */
async function sendComposedMessageToFriend(friend: BirthdayFriend, message: string): Promise<void> {
  const opened = openMessageDialog(friend);
  if (!opened) throw new Error(`Cannot open message dialog for ${friend.name}`);
  await fillMessageAndSend(message);
}

/**
 * Navigate to a Facebook profile, click the Message button, and send a DM.
 * Used for advance / follow-up contacts that are not in the live birthday feed.
 */
async function sendMessageFromProfile(profileUrl: string, message: string): Promise<void> {
  const profilePath = profileUrl.replace(/^https?:\/\/[^/]+/, '');
  if (!window.location.pathname.startsWith(profilePath)) {
    window.location.href = profileUrl;
    await waitForSelector('[data-pagelet="ProfileTilesFeed"]', 12000).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 2000));
  }

  const msgBtn = document.querySelector<HTMLElement>(
    "div[aria-label='Message'], a[aria-label='Message'], [role='button'][aria-label*='Message']",
  );
  if (!msgBtn) throw new Error(`Message button not found on profile ${profileUrl}`);

  await simulateClick(msgBtn);
  await waitForSelector("[role='textbox'], div[contenteditable='true']", 8000);
  await new Promise((r) => setTimeout(r, 800));
  await fillMessageAndSend(message);
}

// ============================================================
// MAIN AUTOMATION LOOP
// ============================================================

/** Returns "MM-DD" for today + daysOffset (positive = future, negative = past). */
function birthdayDateOffset(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}-${dd}`;
}

async function runFullAutomation(payload: AutomationRunPayload): Promise<void> {
  const {
    currentDayTemplates,
    advanceTemplates,
    followUpTemplates,
    posts,
    sentToday,
    maxMessages,
  } = payload;
  let sent = 0;
  /** When set to true by "Send All Remaining", skip per-message confirmation. */
  let skipConfirmation = false;

  // Read user-configured per-action delay and feature flags from storage.
  const stored = await chrome.storage.local.get(['bm_action_delay_minutes', 'bm_feature_flags']);
  const rawDelay = stored['bm_action_delay_minutes'];
  const delayMinutes: number =
    typeof rawDelay === 'number' && rawDelay >= 1 && rawDelay <= 5 ? rawDelay : 1;
  const delayMsBase = delayMinutes * 60_000;
  const delayMin = Math.round(delayMsBase * 0.8);
  const delayMax = Math.round(delayMsBase * 1.2);

  const flags = (stored['bm_feature_flags'] as
    | { makePost: boolean; sendMessage: boolean; archiveAfterSend?: boolean }
    | undefined) ?? { makePost: true, sendMessage: true, archiveAfterSend: false };

  // Get confirmation mode
  const confirmMode = await getConfirmationMode();
  let sessionConfirmed = false;

  // Check clipboard permission and warn if denied.
  await checkClipboardPermission();

  // --- Fail-safe: check rate limits ---
  const rateLimit = await checkRateLimit();
  if (!rateLimit.allowed) {
    setStatus(rateLimit.reason ?? 'Rate limit reached');
    await addActivityLogEntry('warning', rateLimit.reason ?? 'Rate limit reached');
    return;
  }

  // --- Fail-safe: check user activity ---
  if (!isUserActive()) {
    setStatus('Waiting for user activity before sending...');
    await addActivityLogEntry('info', 'Automation deferred — user not active on page');
    return;
  }

  // --- Fail-safe: check for Facebook restrictions ---
  const restriction = detectFacebookRestriction();
  if (restriction.restricted) {
    setStatus('Facebook restriction detected — automation paused');
    await addActivityLogEntry('emergency', `Facebook restriction detected: ${restriction.reason}`);
    await triggerEmergencyStop(24);
    return;
  }

  // Helper: perform all pre-send checks before each message
  type PreSendDecision = 'send' | 'skip' | 'abort';
  async function preSendChecks(friendName: string, dmText: string): Promise<PreSendDecision> {
    // Check abort flag
    if (await shouldAbort()) {
      await addActivityLogEntry('info', 'Automation aborted by user');
      return 'abort';
    }

    // Check rate limit again before each send
    const rl = await checkRateLimit();
    if (!rl.allowed) {
      setStatus(rl.reason ?? 'Rate limit reached');
      await addActivityLogEntry('warning', rl.reason ?? 'Rate limit reached during run');
      return 'abort';
    }

    // Check for Facebook restriction after each send
    const fbCheck = detectFacebookRestriction();
    if (fbCheck.restricted) {
      await addActivityLogEntry('emergency', `Facebook restriction detected: ${fbCheck.reason}`);
      await triggerEmergencyStop(24);
      return 'abort';
    }

    // Check user activity
    if (!isUserActive()) {
      await addActivityLogEntry('info', 'Automation paused — user went inactive');
      return 'abort';
    }

    // Handle common confirmation outcomes
    async function handleConfirmationChoice(
      choice: string,
    ): Promise<'continue' | 'skip' | 'abort' | 'sendAll'> {
      if (choice === 'pause') {
        await addActivityLogEntry('info', 'Automation paused by user via confirmation dialog');
        await setShouldAbort(true);
        return 'abort';
      }
      if (choice === 'skip') {
        return 'skip';
      }
      if (choice === 'sendAll') {
        return 'sendAll';
      }
      // 'send' and any other non-special values fall through
      return 'continue';
    }

    // Human-in-the-loop confirmation
    if (!skipConfirmation) {
      if (confirmMode === 'each') {
        const choice = await showSendConfirmation(friendName, dmText);
        const outcome = await handleConfirmationChoice(choice);
        if (outcome === 'abort') {
          return 'abort';
        }
        if (outcome === 'skip') {
          return 'skip';
        }
        if (outcome === 'sendAll') {
          skipConfirmation = true;
        }
        // 'continue' falls through
      } else if (confirmMode === 'session' && !sessionConfirmed) {
        const choice = await showSendConfirmation(friendName, dmText);
        const outcome = await handleConfirmationChoice(choice);
        if (outcome === 'abort') {
          return 'abort';
        }
        if (outcome === 'skip') {
          return 'skip';
        }
        sessionConfirmed = true;
        if (outcome === 'sendAll') {
          skipConfirmation = true;
        }
        // 'continue' falls through
      }
    }
    // All modes require confirmation (no auto-send without user interaction)

    return 'send';
  }

  // ----- PHASE 1: Current-day friends from live birthday feed -----
  if (currentDayTemplates.length > 0) {
    friends = gatherBirthdayFriends();

    // Persist today's birthday friends to the contacts database
    if (friends.length > 0) {
      try {
        const today = new Date();
        const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
          2,
          '0',
        )}-${String(today.getDate()).padStart(2, '0')}`;
        const contactPayloads = friends
          .filter((f): f is typeof f & { profileUrl: string } => !!(f.name && f.profileUrl))
          .map((f) => ({
            name: f.name,
            facebook_profile_url: f.profileUrl,
            birthday: todayISO,
          }));
        if (contactPayloads.length > 0) {
          await sendContentMessage({
            type: 'contacts.bulkCreate',
            payload: { contacts: contactPayloads },
          });
          console.log(`[BM] Persisted ${contactPayloads.length} birthday contacts to DB`);
        }
      } catch (err) {
        console.warn('[BM] Failed to persist birthday contacts:', err);
      }
    }

    for (const friend of friends) {
      if (maxMessages > 0 && sent >= maxMessages) break;
      const dedupKey = friend.profileUrl ?? friend.id;
      if (sentToday.includes(dedupKey)) continue;

      const template = selectTemplate(currentDayTemplates, 'NEUTRAL');
      if (!template) continue;

      const dmText = assembleMessageFromTemplate(template, { name: friend.name });

      // --- Fail-safe pre-send checks ---
      const decision = await preSendChecks(friend.name, dmText);
      if (decision === 'abort') break;
      if (decision === 'skip') continue;

      showAutomationOverlay(friend.name);
      try {
        if (flags.sendMessage) {
          await sendComposedMessageToFriend(friend, dmText);
        }

        if (flags.makePost && posts.length > 0) {
          const post = selectPost(posts, 'NEUTRAL');
          if (post) {
            await postToTimeline({
              friendName: friend.name,
              profileUrl: friend.profileUrl,
              content: resolveKeywords(post.content, { name: friend.name }),
              imageUrl: post.image_url,
            });
            await addActivityLogEntry('post', `Posted on ${friend.name}'s timeline`);
          }
        }

        if (flags.archiveAfterSend) {
          await archiveConversation(friend.name, friend.profileUrl);
        }

        await sendContentMessage({
          type: 'automation.recordSent',
          payload: { friendId: dedupKey, friendName: friend.name },
        });

        // Record success for rate limiting and backoff reset
        await recordMessageSent();
        await recordSendSuccess();
        await addActivityLogEntry('send', `Sent DM to ${friend.name}`);

        sent++;
        setStatus(`Sent ${sent} message(s) this run`);
        // Simulate casual browsing before the inter-send delay to break
        // the "send-only" pattern that automation detection looks for.
        await simulateBrowsing();
        await randomDelay(delayMin, delayMax);
      } catch (err) {
        console.error(`[BM] Error processing ${friend.name}:`, err);
        const { shouldPause } = await recordSendFailure();
        await addActivityLogEntry(
          'error',
          `Failed to send to ${friend.name}: ${(err as Error).message}`,
        );
        if (shouldPause) {
          setStatus('Send failure detected — automation paused');
          break;
        }
      } finally {
        hideAutomationOverlay();
      }
    }
  }

  // ----- PHASE 2: Advance & follow-up via live Facebook scraping -----
  const allOffDayTemplates = [...advanceTemplates, ...followUpTemplates];
  if (allOffDayTemplates.length > 0) {
    const scraped = scrapeBirthdayContactsFromPage();

    // Persist scraped contacts to the database for future use.
    // This builds the contacts DB over time as birthdays are encountered.
    if (scraped.length > 0) {
      try {
        const contactPayloads = scraped
          .filter((s) => s.birthday && s.name && s.facebook_profile_url)
          .map((s) => ({
            name: s.name,
            facebook_profile_url: s.facebook_profile_url,
            birthday: s.birthday!,
            birthday_month_only: s.monthOnly ?? false,
          }));
        if (contactPayloads.length > 0) {
          await sendContentMessage({
            type: 'contacts.bulkCreate',
            payload: { contacts: contactPayloads },
          });
          console.log(`[BM] Persisted ${contactPayloads.length} scraped contacts to DB`);
        }
      } catch (err) {
        // Non-critical — don't block automation if contact persistence fails
        console.warn('[BM] Failed to persist scraped contacts:', err);
      }
    }

    for (const template of allOffDayTemplates) {
      const targetDate = birthdayDateOffset(template.days_in_advance);
      const matchingFriends = scraped.filter((s) => {
        if (!s.birthday || s.monthOnly) return false;
        const parts = s.birthday.split('-');
        const mmdd =
          parts.length >= 2 ? `${parts[parts.length - 2]}-${parts[parts.length - 1]}` : '';
        return mmdd === targetDate;
      });

      for (const friend of matchingFriends) {
        if (maxMessages > 0 && sent >= maxMessages) break;
        const dedupKey = friend.facebook_profile_url;
        if (sentToday.includes(dedupKey)) continue;

        const dmText = assembleMessageFromTemplate(template, { name: friend.name });

        // --- Fail-safe pre-send checks ---
        const decision = await preSendChecks(friend.name, dmText);
        if (decision === 'abort') break;
        if (decision === 'skip') continue;

        showAutomationOverlay(friend.name);
        try {
          if (flags.sendMessage) {
            await sendMessageFromProfile(friend.facebook_profile_url, dmText);
          }

          if (flags.makePost && posts.length > 0) {
            const post = selectPost(posts, 'NEUTRAL');
            if (post) {
              await postToTimeline({
                friendName: friend.name,
                profileUrl: friend.facebook_profile_url,
                content: resolveKeywords(post.content, { name: friend.name }),
                imageUrl: post.image_url,
              });
              await addActivityLogEntry('post', `Posted on ${friend.name}'s timeline`);
            }
          }

          if (flags.archiveAfterSend) {
            await archiveConversation(friend.name, friend.facebook_profile_url);
          }

          await sendContentMessage({
            type: 'automation.recordSent',
            payload: { friendId: dedupKey, friendName: friend.name },
          });

          // Record success for rate limiting and backoff reset
          await recordMessageSent();
          await recordSendSuccess();
          await addActivityLogEntry('send', `Sent DM to ${friend.name}`);

          sent++;
          setStatus(`Sent ${sent} message(s) this run`);
          await simulateBrowsing();
          await randomDelay(delayMin, delayMax);
        } catch (err) {
          console.error(`[BM] Error processing advance/follow-up for ${friend.name}:`, err);
          const { shouldPause } = await recordSendFailure();
          await addActivityLogEntry(
            'error',
            `Failed to send to ${friend.name}: ${(err as Error).message}`,
          );
          if (shouldPause) {
            setStatus('Send failure detected — automation paused');
            break;
          }
        } finally {
          hideAutomationOverlay();
        }
      }
    }
  }

  await addActivityLogEntry('info', `Automation run complete. Total sent: ${sent}`);
  console.log(`[BM] Automation run complete. Total sent: ${sent}`);
}

// ============================================================
// FACEBOOK BIRTHDAY CONTACT SCRAPER
// ============================================================

export interface ScrapedContact {
  name: string;
  facebook_profile_url: string;
  birthday?: string; // ISO YYYY-MM-DD, derived from page context
  monthOnly?: boolean; // true when only the birth month is known (day defaults to 01)
}

function scrapeBirthdayContactsFromPage(): ScrapedContact[] {
  const MONTH_MAP: Record<string, string> = {
    january: '01',
    february: '02',
    march: '03',
    april: '04',
    may: '05',
    june: '06',
    july: '07',
    august: '08',
    september: '09',
    october: '10',
    november: '11',
    december: '12',
    jan: '01',
    feb: '02',
    mar: '03',
    apr: '04',
    jun: '06',
    jul: '07',
    aug: '08',
    sep: '09',
    oct: '10',
    nov: '11',
    dec: '12',
  };

  function monthDayToISO(monthStr: string, day: number): string {
    // Use year 2000 as a fixed epoch (leap year, so Feb 29 is valid).
    // Only month+day are meaningful for birthday matching.
    const year = 2000;
    const key = monthStr.toLowerCase().replace('.', '').trim().slice(0, 3);
    const m = MONTH_MAP[key] ?? MONTH_MAP[monthStr.toLowerCase()] ?? '01';
    return `${year}-${m}-${String(day).padStart(2, '0')}`;
  }

  function isProfileLink(href: string): boolean {
    if (!href.includes('facebook.com')) return false;
    if (
      /\/(birthdays|events|groups|pages|marketplace|watch|gaming|search|login|help|notifications|settings)\b/.test(
        href,
      )
    )
      return false;
    return (
      /facebook\.com\/(?!pages\b|groups\b|events\b)[^/?#\s]{2,}(\?|#|$)/.test(href) ||
      href.includes('facebook.com/profile.php')
    );
  }

  function normalizeProfileUrl(href: string): string {
    try {
      const u = new URL(href);
      const id = u.searchParams.get('id');
      if (id) return `https://www.facebook.com/profile.php?id=${id}`;
      return `https://www.facebook.com${u.pathname.replace(/\/$/, '')}`;
    } catch {
      return href;
    }
  }

  // ── Regexes for specific month+day patterns ──
  const reFwd =
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan\.?|feb\.?|mar\.?|apr\.?|jun\.?|jul\.?|aug\.?|sep\.?|oct\.?|nov\.?|dec\.?)\s+(\d{1,2})\b/i;
  const reRev =
    /\b(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\b/i;

  /** Parse only specific month+day patterns (never "today"/"tomorrow"). */
  function parseSpecificDate(text: string): string | undefined {
    const t = text.replace(/\s+/g, ' ').trim();
    let m = reFwd.exec(t);
    if (m) return monthDayToISO(m[1], parseInt(m[2], 10));
    m = reRev.exec(t);
    if (m) return monthDayToISO(m[2], parseInt(m[1], 10));
    return undefined;
  }

  /** Regex for bare month names (e.g. section headings like "May", "June") */
  const reMonthOnly =
    /^\s*(january|february|march|april|may|june|july|august|september|october|november|december|jan\.?|feb\.?|mar\.?|apr\.?|jun\.?|jul\.?|aug\.?|sep\.?|oct\.?|nov\.?|dec\.?)\s*$/i;

  /** Parse a section heading — supports "today", "tomorrow", specific dates, and bare months. */
  function parseSectionDate(text: string): { date: string; monthOnly: boolean } | undefined {
    const specific = parseSpecificDate(text);
    if (specific) return { date: specific, monthOnly: false };
    const t = text.replace(/\s+/g, ' ').trim();
    if (/\btoday\b/i.test(t)) {
      const n = new Date();
      return {
        date: `2000-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(
          2,
          '0',
        )}`,
        monthOnly: false,
      };
    }
    if (/\btomorrow\b/i.test(t)) {
      const n = new Date();
      n.setDate(n.getDate() + 1);
      return {
        date: `2000-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(
          2,
          '0',
        )}`,
        monthOnly: false,
      };
    }
    // Bare month heading (e.g. "May") — use 1st of that month
    const mm = reMonthOnly.exec(t);
    if (mm) {
      return { date: monthDayToISO(mm[1], 1), monthOnly: true };
    }
    return undefined;
  }

  /**
   * Find a specific date (month+day) near a profile link by walking up the DOM
   * to find the contact's "card" container, then scanning text nodes within it.
   *
   * On Facebook, the date text (e.g. "6 April 1976") appears AFTER the name
   * link in DOM order, so we must search within the card — not just before.
   * We stop walking up once the container holds more than 2 profile links,
   * since that means we've left the single-contact card.
   */
  function findCardDate(link: HTMLAnchorElement): string | undefined {
    let container: HTMLElement | null = link.parentElement;
    for (let depth = 0; depth < 10 && container; depth++) {
      // Scan text nodes within this container for a specific date
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const text = walker.currentNode.textContent?.trim() ?? '';
        if (text.length >= 3 && text.length <= 80) {
          const d = parseSpecificDate(text);
          if (d) return d;
        }
      }
      // If this container already holds multiple profile links, we've gone
      // past the single-contact card — stop before inheriting another card's date.
      const profileCount = Array.from(
        container.querySelectorAll<HTMLAnchorElement>('a[href]'),
      ).filter((a) => isProfileLink(a.href)).length;
      if (profileCount > 2) break;
      container = container.parentElement;
    }
    return undefined;
  }

  // ── Build section date context from heading elements ──
  // Headings like "Today's Birthdays", "Tomorrow", "April 6" give date context
  // for contacts that don't have a per-card date.  Month-only headings like
  // "May" provide the birth month (day defaults to 01).
  interface SectionMarker {
    el: HTMLElement;
    date: string | undefined;
    monthOnly: boolean;
  }
  const sectionMarkers: SectionMarker[] = [];
  document
    .querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6,[role="heading"],[aria-level]')
    .forEach((heading) => {
      const text = heading.textContent?.trim() ?? '';
      if (text.length > 0 && text.length < 80) {
        const parsed = parseSectionDate(text);
        sectionMarkers.push({
          el: heading,
          date: parsed?.date,
          monthOnly: parsed?.monthOnly ?? false,
        });
      }
    });

  /** Find the section date from the nearest preceding heading. */
  function getSectionDate(element: HTMLElement): { date: string; monthOnly: boolean } | undefined {
    for (let i = sectionMarkers.length - 1; i >= 0; i--) {
      const pos = sectionMarkers[i].el.compareDocumentPosition(element);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) {
        return sectionMarkers[i].date
          ? { date: sectionMarkers[i].date!, monthOnly: sectionMarkers[i].monthOnly }
          : undefined;
      }
    }
    return undefined;
  }

  const results: ScrapedContact[] = [];
  const seen = new Set<string>();

  function tryAddContact(link: HTMLAnchorElement) {
    if (!isProfileLink(link.href)) return;
    const name = link.textContent?.trim() ?? '';
    if (!name || name.length < 2 || name.length > 100) return;
    const profileUrl = normalizeProfileUrl(link.href);
    if (seen.has(profileUrl)) return;
    seen.add(profileUrl);
    // Priority: per-card specific date > section heading date > undefined
    const cardDate = findCardDate(link);
    if (cardDate) {
      results.push({
        name,
        facebook_profile_url: profileUrl,
        birthday: cardDate,
        monthOnly: false,
      });
    } else {
      const section = getSectionDate(link);
      results.push({
        name,
        facebook_profile_url: profileUrl,
        birthday: section?.date,
        monthOnly: section?.monthOnly,
      });
    }
  }

  // Strategy 1: Birthday-specific pagelets
  document.querySelectorAll<HTMLElement>("div[data-pagelet*='Birthday']").forEach((container) => {
    container.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => tryAddContact(a));
  });

  // Strategy 2: Walk all profile links on the page
  document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((link) => {
    tryAddContact(link);
  });

  return results;
}

// ── Scrape result caching (4-hour TTL) ──────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, _sendResponse) => {
  // Security: reject messages not from our own extension
  if (sender.id !== chrome.runtime.id) return false;

  if (message?.type === 'automation.scan') {
    void refreshFriendList();
  }
  if (message?.type === 'automation.runFull') {
    void runFullAutomation(message.payload as AutomationRunPayload);
  }
  return true; // keep channel open for async responders
});
