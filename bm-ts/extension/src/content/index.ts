import { composeMessage, randomDelay } from '../utils/message';
import { sendContentMessage } from './api';
import type { TemplateSegment } from '../api/client';

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

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'automation.scan') {
    void refreshFriendList();
  }
});
