import { composeMessage, randomDelay, selectTemplate, selectPost, resolveKeywords, assembleMessageFromTemplate } from '../utils/message';
import { sendContentMessage } from './api';
import type { TemplateSegment, MessageTemplate, Contact, Post } from '../api/client';
import type { AutomationRunPayload } from '../utils/messages';
import { postToTimeline } from './timeline';
import { archiveConversation } from './messenger';

const MAX_MESSAGES_PER_SESSION = 5;
const overlayId = 'bm-overlay';

type SegmentGroups = {
  GREETING: string[];
  BODY: string[];
  CLOSING: string[];
};

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

async function refreshFriendList() {
  friends = gatherBirthdayFriends();
  renderFriendList();
  await loadSegments();
}

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

function setStatus(text: string) {
  const status = overlay.querySelector<HTMLParagraphElement>('#bm-status');
  if (status) {
    status.textContent = text;
  }
}

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
        await sendComposedMessageToFriend(friend, dmText);

        if (posts.length > 0) {
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
        await randomDelay();
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
        await sendMessageFromProfile(contact.facebook_profile_url, dmText);

        if (posts.length > 0) {
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
        await randomDelay();
      } catch (err) {
        console.error(`[BM] Error processing advance/follow-up for ${contact.name}:`, err);
      } finally {
        hideAutomationOverlay();
      }
    }
  }

  console.log(`[BM] Automation run complete. Total sent: ${sent}`);
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'automation.scan') {
    void refreshFriendList();
  }
  if (message?.type === 'automation.runFull') {
    void runFullAutomation(message.payload as AutomationRunPayload);
  }
});
