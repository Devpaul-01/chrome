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

import { composeMessage, randomDelay, selectTemplate, selectPost, resolveKeywords, assembleMessageFromTemplate } from '../utils/message';
import { sendContentMessage } from './api';
import type { TemplateSegment, MessageTemplate, Contact, Post } from '../api/client';
import type { AutomationRunPayload } from '../utils/messages';
import { postToTimeline } from './timeline';
import { archiveConversation } from './messenger';

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
 * Searches `div[data-pagelet*='Birthday']` elements which Facebook renders
 * for birthday widgets in the news feed and the dedicated /birthdays page.
 */
function gatherBirthdayFriends(): BirthdayFriend[] {
  // Look for Facebook elements that are part of the birthday feed. `data-pagelet` often
  // mentions “Birthday” when the birthday widget is rendered on the news feed.
  const containers = Array.from(document.querySelectorAll("div[data-pagelet*='Birthday']"));
  const detected: BirthdayFriend[] = [];
  containers.forEach((container, index) => {
    const nameElement = container.querySelector('strong span, span');
    const name = nameElement?.textContent?.trim() || 'Unknown';
    const messageBtn = container.querySelector<HTMLElement>(
      "a[role='button'][aria-label*='Message'], button[aria-label*='Message']",
    );
    const profileLink = container.querySelector<HTMLAnchorElement>("a[href*='facebook.com']");
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
    row.innerHTML = `<strong>${friend.name}</strong>`;
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
 */
function createOverlay(): HTMLElement {
  const existing = document.getElementById(overlayId);
  if (existing) {
    return existing;
  }
  const wrapper = document.createElement('div');
  wrapper.id = overlayId;
  wrapper.style.position = 'fixed';
  wrapper.style.top = '12px';
  wrapper.style.right = '12px';
  wrapper.style.width = '320px';
  wrapper.style.maxHeight = '90vh';
  wrapper.style.overflowY = 'auto';
  wrapper.style.background = 'rgba(255,255,255,0.98)';
  wrapper.style.border = '1px solid #ccc';
  wrapper.style.borderRadius = '8px';
  wrapper.style.padding = '12px';
  wrapper.style.fontFamily = 'inherit';
  wrapper.style.zIndex = '2147483647';
  wrapper.style.boxShadow = '0 4px 10px rgba(0,0,0,0.2)';
  wrapper.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <strong>BirthdayMessaging</strong>
      <button id="bm-refresh" style="font-size:12px;padding:4px 6px;">Refresh</button>
    </div>
    <p id="bm-status" style="margin:0 0 8px 0;font-size:13px;">Ready</p>
    <div id="bm-friend-list"></div>
    <button id="bm-send" style="margin-top:8px;width:100%;padding:8px;">Send to all</button>
  `;
  document.body.appendChild(wrapper);
  const refreshBtn = wrapper.querySelector<HTMLButtonElement>('#bm-refresh');
  refreshBtn?.addEventListener('click', () => void refreshFriendList());
  const sendBtn = wrapper.querySelector<HTMLButtonElement>('#bm-send');
  sendBtn?.addEventListener('click', () => void handleSendAll());
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
    'position:fixed', 'bottom:16px', 'left:50%', 'transform:translateX(-50%)',
    'z-index:2147483647', 'max-width:480px', 'width:calc(100% - 32px)',
    'background:#fff3cd', 'border:1.5px solid #f59e0b', 'border-radius:8px',
    'padding:12px 16px', 'font-family:system-ui,sans-serif', 'font-size:13px',
    'box-shadow:0 4px 12px rgba(0,0,0,0.15)', 'display:flex', 'gap:12px',
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

// ============================================================
// AUTOMATION OVERLAY  (full-screen dimmer shown during a run)
// ============================================================

let automationOverlay: HTMLElement | null = null;

function showAutomationOverlay(friendName: string): void {
  if (!automationOverlay) {
    automationOverlay = document.createElement('div');
    automationOverlay.id = 'bm-auto-overlay';
    automationOverlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:2147483646',
      'background:rgba(0,0,0,0.55)',
      'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center',
      'color:#fff', 'font-family:system-ui,sans-serif',
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

function getContactGender(
  friend: BirthdayFriend,
  contacts: Contact[],
): Contact['gender'] {
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
    const existingContact = existing.find(
      (c) => c.facebook_profile_url === friend.profileUrl,
    );
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
async function sendComposedMessageToFriend(
  friend: BirthdayFriend,
  message: string,
): Promise<void> {
  const opened = openMessageDialog(friend);
  if (!opened) throw new Error(`Cannot open message dialog for ${friend.name}`);
  await fillMessageAndSend(message);
}

/**
 * Navigate to a Facebook profile, click the Message button, and send a DM.
 * Used for advance / follow-up contacts that are not in the live birthday feed.
 */
async function sendMessageFromProfile(
  profileUrl: string,
  message: string,
): Promise<void> {
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

  // Read user-configured per-action delay and feature flags from storage.
  const stored = await chrome.storage.local.get(['bm_action_delay_minutes', 'bm_feature_flags']);
  const rawDelay = stored['bm_action_delay_minutes'];
  const delayMinutes: number =
    typeof rawDelay === 'number' && rawDelay >= 1 && rawDelay <= 5 ? rawDelay : 1;
  const delayMsBase = delayMinutes * 60_000;
  const delayMin = Math.round(delayMsBase * 0.8);
  const delayMax = Math.round(delayMsBase * 1.2);

  const flags = (stored['bm_feature_flags'] as { makePost: boolean; sendMessage: boolean } | undefined) ??
    { makePost: true, sendMessage: true };

  // Check clipboard permission and warn if denied.
  await checkClipboardPermission();

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
          }
        }

        await archiveConversation(friend.name, friend.profileUrl);

        await sendContentMessage({
          type: 'automation.recordSent',
          payload: { friendId: dedupKey, friendName: friend.name },
        });

        sent++;
        setStatus(`Sent ${sent} message(s) this run`);
        await randomDelay(delayMin, delayMax);
      } catch (err) {
        console.error(`[BM] Error processing ${friend.name}:`, err);
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
          }
        }

        await archiveConversation(contact.name, contact.facebook_profile_url);

        await sendContentMessage({
          type: 'automation.recordSent',
          payload: { friendId: dedupKey, friendName: contact.name },
        });

        sent++;
        setStatus(`Sent ${sent} message(s) this run`);
        await randomDelay(delayMin, delayMax);
      } catch (err) {
        console.error(`[BM] Error processing advance/follow-up for ${contact.name}:`, err);
      } finally {
        hideAutomationOverlay();
      }
    }
  }

  console.log(`[BM] Automation run complete. Total sent: ${sent}`);
}

// ============================================================
// FACEBOOK BIRTHDAY CONTACT SCRAPER
// ============================================================

export interface ScrapedContact {
  name: string;
  facebook_profile_url: string;
  birthday?: string; // ISO YYYY-MM-DD, derived from page context
}

function scrapeBirthdayContactsFromPage(): ScrapedContact[] {
  const MONTH_MAP: Record<string, string> = {
    january: '01', february: '02', march: '03', april: '04',
    may: '05', june: '06', july: '07', august: '08',
    september: '09', october: '10', november: '11', december: '12',
    jan: '01', feb: '02', mar: '03', apr: '04',
    jun: '06', jul: '07', aug: '08',
    sep: '09', oct: '10', nov: '11', dec: '12',
  };

  function monthDayToISO(monthStr: string, day: number): string {
    const year = new Date().getFullYear();
    const key = monthStr.toLowerCase().replace('.', '').trim().slice(0, 3);
    const m = MONTH_MAP[key] ?? MONTH_MAP[monthStr.toLowerCase()] ?? '01';
    return `${year}-${m}-${String(day).padStart(2, '0')}`;
  }

  function parseDateFromText(text: string): string | undefined {
    const t = text.replace(/\s+/g, ' ').trim();
    // "Today" / "Tomorrow"
    if (/\btoday\b/i.test(t)) {
      const n = new Date();
      return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
    }
    if (/\btomorrow\b/i.test(t)) {
      const n = new Date(); n.setDate(n.getDate() + 1);
      return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
    }
    // "January 15" / "Jan. 15" / "Jan 15"
    const reFwd = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan\.?|feb\.?|mar\.?|apr\.?|jun\.?|jul\.?|aug\.?|sep\.?|oct\.?|nov\.?|dec\.?)\s+(\d{1,2})\b/i;
    // "15 January" / "15 Jan"
    const reRev = /\b(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\b/i;
    let m = reFwd.exec(t);
    if (m) return monthDayToISO(m[1], parseInt(m[2], 10));
    m = reRev.exec(t);
    if (m) return monthDayToISO(m[2], parseInt(m[1], 10));
    return undefined;
  }

  function isProfileLink(href: string): boolean {
    if (!href.includes('facebook.com')) return false;
    if (/\/(birthdays|events|groups|pages|marketplace|watch|gaming|search|login|help|notifications|settings)\b/.test(href)) return false;
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

  const results: ScrapedContact[] = [];
  const seen = new Set<string>();

  function tryAddContact(link: HTMLAnchorElement, contextEl: HTMLElement | null) {
    if (!isProfileLink(link.href)) return;
    const name = link.textContent?.trim() ?? '';
    if (!name || name.length < 2 || name.length > 100) return;
    const profileUrl = normalizeProfileUrl(link.href);
    if (seen.has(profileUrl)) return;
    seen.add(profileUrl);
    // Walk up DOM to find date string in surrounding text
    let dateStr: string | undefined;
    let el: HTMLElement | null = contextEl ?? link.parentElement;
    for (let depth = 0; depth < 10 && el && !dateStr; depth++) {
      const text = el.textContent ?? '';
      // Only check short-ish text to avoid false positives from large containers
      if (text.length < 600) dateStr = parseDateFromText(text);
      el = el.parentElement;
    }
    results.push({ name, facebook_profile_url: profileUrl, birthday: dateStr });
  }

  // Strategy 1: Birthday-specific pagelets (today / reminder section)
  document.querySelectorAll<HTMLElement>("div[data-pagelet*='Birthday']").forEach((container) => {
    container.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => tryAddContact(a, a));
  });

  // Strategy 2: Walk full page with month-heading context tracking
  let sectionDateCtx: string | undefined;
  document.querySelectorAll<HTMLElement>('h1,h2,h3,h4,[role="heading"],a[href]').forEach((node) => {
    if (node.tagName !== 'A') {
      const txt = node.textContent?.trim() ?? '';
      if (txt.length < 80) {
        const d = parseDateFromText(txt);
        if (d) sectionDateCtx = d;
      }
      return;
    }
    const link = node as HTMLAnchorElement;
    if (!isProfileLink(link.href)) return;
    const name = link.textContent?.trim() ?? '';
    if (!name || name.length < 2 || name.length > 100) return;
    const profileUrl = normalizeProfileUrl(link.href);
    if (seen.has(profileUrl)) return;
    seen.add(profileUrl);
    // Try local context first, then fall back to section heading date
    let dateStr: string | undefined;
    let el: HTMLElement | null = link.parentElement;
    for (let depth = 0; depth < 8 && el && !dateStr; depth++) {
      const text = el.textContent ?? '';
      if (text.length < 400) dateStr = parseDateFromText(text);
      el = el.parentElement;
    }
    results.push({ name, facebook_profile_url: profileUrl, birthday: dateStr ?? sectionDateCtx });
  });

  return results;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
