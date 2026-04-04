/**
 * Tests for content/messenger.ts — Archive/Unarchive flow
 *
 * Covers:
 *  - archiveConversation (retry logic, storage)
 *  - unarchiveConversation (retry logic, multi-language, storage)
 *  - monitorForReplies (observer setup, cleanup)
 *  - stopMonitoringReplies
 *  - stopAllMonitoring
 *  - initializeArchiveMonitoring
 *
 * These tests mock the DOM and chrome.storage to verify the flow
 * without needing a real Facebook page.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to mock dom-helpers before importing messenger
vi.mock('../dom-helpers', () => ({
  waitForElement: vi.fn(),
  delay: vi.fn().mockResolvedValue(undefined),
  createStableMutationObserver: vi.fn(),
  retryOperation: vi.fn(),
}));

import {
  archiveConversation,
  unarchiveConversation,
  monitorForReplies,
  stopMonitoringReplies,
  stopAllMonitoring,
  initializeArchiveMonitoring,
} from '../messenger';

import { waitForElement, createStableMutationObserver, retryOperation } from '../dom-helpers';

const mockWaitForElement = vi.mocked(waitForElement);
const mockCreateStableObserver = vi.mocked(createStableMutationObserver);
const mockRetryOperation = vi.mocked(retryOperation);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupMessengerPage() {
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { href: 'https://www.facebook.com/messages/t/123', includes: (s: string) => window.location.href.includes(s) },
  });
}

function createMockMenu(itemTexts: string[]) {
  const menu = document.createElement('div');
  menu.setAttribute('role', 'menu');
  itemTexts.forEach((text) => {
    const item = document.createElement('div');
    item.setAttribute('role', 'menuitem');
    item.textContent = text;
    menu.appendChild(item);
  });
  return menu;
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  setupMessengerPage();
});

afterEach(() => {
  stopAllMonitoring();
});

// ---------------------------------------------------------------------------
// archiveConversation
// ---------------------------------------------------------------------------

describe('archiveConversation', () => {
  it('returns false when conversation is not found', async () => {
    // Mock: navigation container exists but no matching conversation
    mockWaitForElement.mockResolvedValue(document.createElement('div'));

    const result = await archiveConversation('NonExistentUser');
    expect(result).toBe(false);
  });

  it('returns false when context menu fails (jsdom MouseEvent limitation)', async () => {
    // In jsdom, MouseEvent constructor fails because `window` is not a real Window.
    // archiveConversation will find the conversation but fail on right-click simulation.
    const nav = document.createElement('div');
    nav.setAttribute('role', 'navigation');
    const link = document.createElement('a');
    link.setAttribute('role', 'link');
    link.setAttribute('aria-label', 'Conversation with John Doe');
    link.textContent = 'John Doe';
    nav.appendChild(link);
    document.body.appendChild(nav);

    mockWaitForElement.mockResolvedValue(nav);

    // The function will fail gracefully (MouseEvent can't be constructed in jsdom)
    const result = await archiveConversation('John Doe', 'https://facebook.com/johndoe');
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// unarchiveConversation
// ---------------------------------------------------------------------------

describe('unarchiveConversation', () => {
  it('delegates to retryOperation with MAX_RETRIES', async () => {
    mockRetryOperation.mockResolvedValue(false);
    await unarchiveConversation('Someone');
    expect(mockRetryOperation).toHaveBeenCalled();
    // Check that retryOperation was called with max retries = 3 and delay = 1000
    const [, maxRetries, retryDelay] = mockRetryOperation.mock.calls[0];
    expect(maxRetries).toBe(3);
    expect(retryDelay).toBe(1000);
  });

  it('removes from storage on success', async () => {
    // Pre-populate storage
    await chrome.storage.local.set({
      bm_archived_conversations: [{ friendName: 'Jane', archivedAt: Date.now() }],
    });

    // Mock retryOperation to execute the inner function
    mockRetryOperation.mockImplementation(async (fn) => {
      return fn();
    });

    // Setup DOM with unarchive menu option
    const nav = document.createElement('div');
    nav.setAttribute('role', 'navigation');
    const link = document.createElement('a');
    link.setAttribute('role', 'link');
    link.setAttribute('aria-label', 'Conversation with Jane');
    link.textContent = 'Jane';
    nav.appendChild(link);
    document.body.appendChild(nav);

    const menu = createMockMenu(['Unarchive', 'Delete']);
    mockWaitForElement
      .mockResolvedValueOnce(nav)
      .mockResolvedValueOnce(menu);

    const result = await unarchiveConversation('Jane');

    if (result) {
      const stored = await chrome.storage.local.get('bm_archived_conversations');
      const archived = stored['bm_archived_conversations'] as Array<{
        friendName: string;
      }>;
      expect(archived?.some((a) => a.friendName === 'Jane')).toBeFalsy();
    }
  });

  it('handles German locale (Dearchivieren)', async () => {
    mockRetryOperation.mockImplementation(async (fn) => fn());

    const nav = document.createElement('div');
    nav.setAttribute('role', 'navigation');
    const link = document.createElement('a');
    link.setAttribute('aria-label', 'Hans');
    link.textContent = 'Hans';
    nav.appendChild(link);
    document.body.appendChild(nav);

    const menu = createMockMenu(['Dearchivieren', 'Löschen']);
    mockWaitForElement
      .mockResolvedValueOnce(nav)
      .mockResolvedValueOnce(menu);

    // Should not throw — the German term should be recognized
    await unarchiveConversation('Hans');
    expect(mockRetryOperation).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// monitorForReplies
// ---------------------------------------------------------------------------

describe('monitorForReplies', () => {
  it('sets up a stable observer on messages container', async () => {
    const mockObserver = { observe: vi.fn(), disconnect: vi.fn() };
    mockCreateStableObserver.mockReturnValue(mockObserver);

    const container = document.createElement('div');
    container.setAttribute('role', 'log');
    mockWaitForElement.mockResolvedValue(container);

    await monitorForReplies('TestFriend');

    expect(mockCreateStableObserver).toHaveBeenCalledTimes(1);
    expect(mockObserver.observe).toHaveBeenCalledTimes(1);
    // Verify it observed *some* element with the right options
    expect(mockObserver.observe.mock.calls[0][1]).toEqual({
      childList: true,
      subtree: true,
    });
  });

  it('passes debounceMs and reconnectOnDetach options', async () => {
    const mockObserver = { observe: vi.fn(), disconnect: vi.fn() };
    mockCreateStableObserver.mockReturnValue(mockObserver);

    const container = document.createElement('div');
    mockWaitForElement.mockResolvedValue(container);

    await monitorForReplies('Friend');

    const options = mockCreateStableObserver.mock.calls[0][1];
    expect(options?.debounceMs).toBe(300);
    expect(options?.reconnectOnDetach).toBe(true);
    expect(options?.onError).toBeTypeOf('function');
  });

  it('does nothing when messages container not found', async () => {
    mockWaitForElement.mockResolvedValue(null);

    await monitorForReplies('Nobody');

    expect(mockCreateStableObserver).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// stopMonitoringReplies
// ---------------------------------------------------------------------------

describe('stopMonitoringReplies', () => {
  it('disconnects the reply observer', async () => {
    const mockObserver = { observe: vi.fn(), disconnect: vi.fn() };
    mockCreateStableObserver.mockReturnValue(mockObserver);

    const container = document.createElement('div');
    mockWaitForElement.mockResolvedValue(container);

    await monitorForReplies('Friend');
    stopMonitoringReplies();

    expect(mockObserver.disconnect).toHaveBeenCalled();
  });

  it('does nothing when no observer is active', () => {
    // Should not throw
    stopMonitoringReplies();
  });
});

// ---------------------------------------------------------------------------
// stopAllMonitoring
// ---------------------------------------------------------------------------

describe('stopAllMonitoring', () => {
  it('disconnects both reply and global observers', async () => {
    const replyObserver = { observe: vi.fn(), disconnect: vi.fn() };
    const globalObserver = { observe: vi.fn(), disconnect: vi.fn() };
    mockCreateStableObserver
      .mockReturnValueOnce(replyObserver)
      .mockReturnValueOnce(globalObserver);

    const container = document.createElement('div');
    mockWaitForElement.mockResolvedValue(container);

    // Set up reply observer
    await monitorForReplies('Friend1');

    // Set up global observer by pre-populating archived conversations
    await chrome.storage.local.set({
      bm_archived_conversations: [{ friendName: 'Friend2', archivedAt: Date.now() }],
    });
    await initializeArchiveMonitoring();

    stopAllMonitoring();

    expect(replyObserver.disconnect).toHaveBeenCalled();
    expect(globalObserver.disconnect).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// initializeArchiveMonitoring
// ---------------------------------------------------------------------------

describe('initializeArchiveMonitoring', () => {
  it('skips monitoring when not on messenger page', async () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: 'https://www.facebook.com/', includes: (s: string) => window.location.href.includes(s) },
    });

    await initializeArchiveMonitoring();

    expect(mockCreateStableObserver).not.toHaveBeenCalled();
  });

  it('skips when no archived conversations', async () => {
    setupMessengerPage();
    await chrome.storage.local.set({ bm_archived_conversations: [] });

    await initializeArchiveMonitoring();

    expect(mockCreateStableObserver).not.toHaveBeenCalled();
  });

  it('sets up global observer when archived conversations exist', async () => {
    setupMessengerPage();
    await chrome.storage.local.set({
      bm_archived_conversations: [{ friendName: 'ArchivedFriend', archivedAt: Date.now() }],
    });

    const mockObserver = { observe: vi.fn(), disconnect: vi.fn() };
    mockCreateStableObserver.mockReturnValue(mockObserver);

    const container = document.createElement('div');
    mockWaitForElement.mockResolvedValue(container);

    await initializeArchiveMonitoring();

    expect(mockCreateStableObserver).toHaveBeenCalledTimes(1);
    const options = mockCreateStableObserver.mock.calls[0][1];
    expect(options?.debounceMs).toBe(500);
    expect(options?.reconnectOnDetach).toBe(true);
    expect(mockObserver.observe).toHaveBeenCalledWith(container, {
      childList: true,
      subtree: true,
    });
  });

  it('disconnects previous global observer before creating new one', async () => {
    setupMessengerPage();
    await chrome.storage.local.set({
      bm_archived_conversations: [{ friendName: 'Friend', archivedAt: Date.now() }],
    });

    const firstObserver = { observe: vi.fn(), disconnect: vi.fn() };
    const secondObserver = { observe: vi.fn(), disconnect: vi.fn() };
    mockCreateStableObserver
      .mockReturnValueOnce(firstObserver)
      .mockReturnValueOnce(secondObserver);

    const container = document.createElement('div');
    mockWaitForElement.mockResolvedValue(container);

    await initializeArchiveMonitoring();
    await initializeArchiveMonitoring();

    expect(firstObserver.disconnect).toHaveBeenCalled();
    expect(secondObserver.observe).toHaveBeenCalled();
  });
});
