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
import type { TemplateSegment, Contact } from '../api/client';
import type { AutomationRunPayload } from '../utils/messages';
import { postToTimeline } from './timeline';
import { archiveConversation } from './messenger';
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
} from '../utils/failsafe';

/** Maximum messages the manual "Send to all" flow will send per session (safety cap). */
const MAX_MESSAGES_PER_SESSION = 5;
const overlayId = 'bm-overlay';

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
  renderFriendList();
  await loadSegments();
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
  if (!list) return;
  list.innerHTML = '';
  friends.forEach((friend) => {
    const row = document.createElement('div');
    row.style.border = '1px solid #ccc';
    row.style.padding = '6px';
    row.style.marginBottom = '4px';
    const strong = document.createElement('strong');
    strong.textContent = friend.name; // textContent — safe against XSS
    row.appendChild(strong);
    if (friend.profileUrl) {
      const link = document.createElement('a');
      link.href = friend.profileUrl;
      link.textContent = 'View profile';
      link.style.display = 'block';
      link.style.fontSize = '12px';
      link.target = '_blank';
      row.appendChild(link);
    }
    list.appendChild(row);
  });
}

/** Updates the status line shown in the overlay sidebar. */
function setStatus(text: string) {
  const status = overlay.querySelector<HTMLParagraphElement>('#bm-status');
  if (status) {
    status.textContent = text;
  }
}

/**
 * "Send to all" button handler used by the manual overlay UI.
 * Confirms with the user, then iterates `friends` and sends a templated
 * message to each, respecting `MAX_MESSAGES_PER_SESSION`.
 */
async function handleSendAll() {
  if (!confirm('Send messages to all detected friends?')) {
    return;
  }
  if (!friends.length) {
    setStatus('No birthday entries detected');
    return;
  }
  if (!segments.GREETING.length || !segments.BODY.length || !segments.CLOSING.length) {
    setStatus('Add at least one segment of each type first');
    return;
  }
  let sent = 0;
  for (const friend of friends) {
    if (sent >= MAX_MESSAGES_PER_SESSION) {
      setStatus(`Reached max messages (${MAX_MESSAGES_PER_SESSION})`);
      break;
    }
    try {
      await sendMessageToFriend(friend);
      sent += 1;
      setStatus(`Sent ${sent} message(s)`);
      // Anti-ban: wait between 5–15 seconds so message sends do not occur too quickly.
      await randomDelay();
    } catch (error) {
      setStatus(`Stopped after error: ${(error as Error).message}`);
      break;
    }
  }
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

async function fillMessageAndSend(message: string): Promise<void> {
  await waitForSelector("[role='textbox'], div[contenteditable='true']", 5000);
  const textbox = document.querySelector<HTMLElement>(
    "[role='textbox'], div[contenteditable='true']",
  );
  if (!textbox) {
    throw new Error('Message textbox not found');
  }
  textbox.focus();
  textbox.textContent = message;
  // Dispatch input events to keep React-controlled editors in sync before clicking send.
  textbox.dispatchEvent(new InputEvent('input', { bubbles: true }));
  const sendButton = document.querySelector<HTMLElement>(
    "div[aria-label='Send'] button, button[aria-label='Send']",
  );
  if (!sendButton) {
    throw new Error('Send button not found');
  }
  sendButton.click();
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
 * Creates (or returns the existing) overlay sidebar and appends it to `document.body`.
 * The overlay shows a friend list, a status line, and Send / Refresh buttons.
 * Styled to match the popup glass-card design system.
 */
function createOverlay(): HTMLElement {
  const existing = document.getElementById(overlayId);
  if (existing) {
    return existing;
  }

  const wrapper = document.createElement('div');
  wrapper.id = overlayId;

  // Glass card — mirrors popup design tokens
  wrapper.style.position = 'fixed';
  wrapper.style.top = '12px';
  wrapper.style.right = '12px';
  wrapper.style.width = '320px';
  wrapper.style.maxHeight = '90vh';
  wrapper.style.overflowY = 'auto';
  wrapper.style.background =
    'linear-gradient(135deg, rgba(255,255,255,0.97) 0%, rgba(255,241,232,0.96) 100%)';
  wrapper.style.border = '1.5px solid rgba(202, 79, 2, 0.22)';
  wrapper.style.borderRadius = '12px';
  wrapper.style.padding = '14px 16px';
  wrapper.style.fontFamily =
    'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  wrapper.style.fontSize = '13px';
  wrapper.style.color = '#574232';
  wrapper.style.zIndex = '2147483647';
  wrapper.style.boxShadow = '0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)';

  wrapper.setAttribute('role', 'region');
  wrapper.setAttribute('aria-label', 'BirthdayMessaging automation panel');
  wrapper.setAttribute('tabindex', '-1');

  wrapper.innerHTML = `
    <div id="bm-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <strong style="font-size:13px;font-weight:700;color:#574232;letter-spacing:0.01em;">BirthdayMessaging</strong>
      <div style="display:flex;gap:4px;align-items:center;">
        <button id="bm-minimize"
          style="background:transparent;border:none;cursor:pointer;color:#6e5a49;font-size:18px;line-height:1;padding:2px 7px;border-radius:6px;transition:background 0.15s;"
          aria-label="Minimize panel">−</button>
        <button id="bm-refresh"
          style="font-size:11px;padding:4px 10px;background:transparent;border:1.5px solid #ca4f02;color:#ca4f02;border-radius:6px;cursor:pointer;font-weight:600;transition:background 0.15s,transform 0.1s;"
          aria-label="Refresh friend list">Refresh</button>
      </div>
    </div>
    <div id="bm-body">
      <p id="bm-status" style="margin:0 0 8px 0;font-size:13px;color:#6e5a49;" aria-live="polite">Ready</p>
      <div id="bm-friend-list" aria-label="Birthday friends" role="list"></div>
      <button id="bm-send"
        style="margin-top:10px;width:100%;padding:9px;background:#ca4f02;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;box-shadow:0 3px 8px rgba(202,79,2,0.25);transition:background 0.15s,transform 0.1s;"
        aria-label="Send birthday messages to all friends">Send to all</button>
    </div>
  `;

  document.body.appendChild(wrapper);

  const header = wrapper.querySelector<HTMLElement>('#bm-header');
  const body = wrapper.querySelector<HTMLElement>('#bm-body');
  const minimizeBtn = wrapper.querySelector<HTMLButtonElement>('#bm-minimize');
  const refreshBtn = wrapper.querySelector<HTMLButtonElement>('#bm-refresh');
  const sendBtn = wrapper.querySelector<HTMLButtonElement>('#bm-send');

  // Button hover effects
  refreshBtn?.addEventListener('mouseenter', () => {
    if (refreshBtn) refreshBtn.style.background = 'rgba(229,103,23,0.1)';
  });
  refreshBtn?.addEventListener('mouseleave', () => {
    if (refreshBtn) refreshBtn.style.background = 'transparent';
  });
  sendBtn?.addEventListener('mouseenter', () => {
    if (sendBtn) {
      sendBtn.style.background = '#e56717';
      sendBtn.style.transform = 'translateY(-1px)';
    }
  });
  sendBtn?.addEventListener('mouseleave', () => {
    if (sendBtn) {
      sendBtn.style.background = '#ca4f02';
      sendBtn.style.transform = 'translateY(0)';
    }
  });
  minimizeBtn?.addEventListener('mouseenter', () => {
    if (minimizeBtn) minimizeBtn.style.background = 'rgba(202,79,2,0.08)';
  });
  minimizeBtn?.addEventListener('mouseleave', () => {
    if (minimizeBtn) minimizeBtn.style.background = 'transparent';
  });

  // Minimize / maximize toggle
  minimizeBtn?.addEventListener('click', () => {
    if (!body || !minimizeBtn || !header) return;
    const isMinimized = body.style.display === 'none';
    if (isMinimized) {
      body.style.display = '';
      header.style.marginBottom = '10px';
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

  // Escape key collapses the overlay
  wrapper.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      wrapper.style.display = 'none';
    }
  });

  wrapper.focus();
  return wrapper;
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
// GENDER HELPER
// ============================================================

function getContactGender(friend: BirthdayFriend, contacts: Contact[]): Contact['gender'] {
  const match =
    contacts.find((c) => friend.profileUrl && c.facebook_profile_url === friend.profileUrl) ??
    contacts.find((c) => c.name.toLowerCase() === friend.name.toLowerCase());
  return match?.gender ?? 'NEUTRAL';
}

// ============================================================
// CONTACT SYNC  (upsert scraped friends into backend)
// ============================================================

async function syncContactsFromFriends(
  scraped: BirthdayFriend[],
  existing: Contact[],
): Promise<void> {
  for (const friend of scraped) {
    if (!friend.profileUrl) continue;
    const existingContact = existing.find((c) => c.facebook_profile_url === friend.profileUrl);
    if (existingContact) {
      if (existingContact.name !== friend.name) {
        await sendContentMessage({
          type: 'contacts.update',
          payload: { id: existingContact.id, name: friend.name },
        });
      }
    } else {
      await sendContentMessage({
        type: 'contacts.create',
        payload: {
          name: friend.name,
          facebook_profile_url: friend.profileUrl,
          birthday: '',
        },
      });
    }
  }
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

  msgBtn.click();
  await waitForSelector("[role='textbox'], div[contenteditable='true']", 8000);
  await new Promise((r) => setTimeout(r, 800));
  await fillMessageAndSend(message);
}

// ============================================================
// MAIN AUTOMATION LOOP
// ============================================================

async function runFullAutomation(payload: AutomationRunPayload): Promise<void> {
  const {
    currentDayTemplates,
    advanceEntries,
    followUpEntries,
    posts,
    contacts,
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
    | { makePost: boolean; sendMessage: boolean }
    | undefined) ?? { makePost: true, sendMessage: true };

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

    for (const friend of friends) {
      if (maxMessages > 0 && sent >= maxMessages) break;
      const dedupKey = friend.profileUrl ?? friend.id;
      if (sentToday.includes(dedupKey)) continue;

      const gender = getContactGender(friend, contacts);
      const template = selectTemplate(currentDayTemplates, gender);
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
          const post = selectPost(posts, gender);
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

        await archiveConversation(friend.name, friend.profileUrl);

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

    // Sync newly discovered friends into the contacts list.
    await syncContactsFromFriends(friends, contacts).catch((e) =>
      console.warn('[BM] syncContactsFromFriends error:', e),
    );
  }

  // ----- PHASE 2: Advance & follow-up contacts (stored contacts list) -----
  const offDayEntries = [...advanceEntries, ...followUpEntries];
  for (const entry of offDayEntries) {
    for (const contact of entry.contacts) {
      if (maxMessages > 0 && sent >= maxMessages) break;
      if (!contact.facebook_profile_url) continue;
      const dedupKey = contact.facebook_profile_url;
      if (sentToday.includes(dedupKey)) continue;

      const dmText = assembleMessageFromTemplate(entry.template, { name: contact.name });

      // --- Fail-safe pre-send checks ---
      const decision = await preSendChecks(contact.name, dmText);
      if (decision === 'abort') break;
      if (decision === 'skip') continue;

      showAutomationOverlay(contact.name);
      try {
        if (flags.sendMessage) {
          await sendMessageFromProfile(contact.facebook_profile_url, dmText);
        }

        if (flags.makePost && posts.length > 0) {
          const post = selectPost(posts, contact.gender ?? 'NEUTRAL');
          if (post) {
            await postToTimeline({
              friendName: contact.name,
              profileUrl: contact.facebook_profile_url,
              content: resolveKeywords(post.content, { name: contact.name }),
              imageUrl: post.image_url,
            });
            await addActivityLogEntry('post', `Posted on ${contact.name}'s timeline`);
          }
        }

        await archiveConversation(contact.name, contact.facebook_profile_url);

        await sendContentMessage({
          type: 'automation.recordSent',
          payload: { friendId: dedupKey, friendName: contact.name },
        });

        // Record success for rate limiting and backoff reset
        await recordMessageSent();
        await recordSendSuccess();
        await addActivityLogEntry('send', `Sent DM to ${contact.name}`);

        sent++;
        setStatus(`Sent ${sent} message(s) this run`);
        await randomDelay(delayMin, delayMax);
      } catch (err) {
        console.error(`[BM] Error processing advance/follow-up for ${contact.name}:`, err);
        const { shouldPause } = await recordSendFailure();
        await addActivityLogEntry(
          'error',
          `Failed to send to ${contact.name}: ${(err as Error).message}`,
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
    const year = new Date().getFullYear();
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
        date: `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(
          n.getDate(),
        ).padStart(2, '0')}`,
        monthOnly: false,
      };
    }
    if (/\btomorrow\b/i.test(t)) {
      const n = new Date();
      n.setDate(n.getDate() + 1);
      return {
        date: `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(
          n.getDate(),
        ).padStart(2, '0')}`,
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Security: reject messages not from our own extension
  if (sender.id !== chrome.runtime.id) return false;

  if (message?.type === 'automation.scan') {
    void refreshFriendList();
  }
  if (message?.type === 'automation.runFull') {
    void runFullAutomation(message.payload as AutomationRunPayload);
  }
  if (message?.type === 'contacts.scrapeFromPage') {
    const contacts = scrapeBirthdayContactsFromPage();
    sendResponse({ contacts });
  }
  return true; // keep channel open for async responders
});
