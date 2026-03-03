/**
 * messenger.ts - Facebook Messenger archive automation
 * 
 * Provides functionality to:
 * - Archive conversations after sending automated messages
 * - Monitor for recipient replies using MutationObserver
 * - Auto-unarchive conversations when recipients respond
 */

const MESSENGER_BASE_URL = 'https://www.facebook.com/messages';
const ARCHIVE_STORAGE_KEY = 'bm_archived_conversations';
const DEFAULT_TIMEOUT = 10000;
const RETRY_DELAY = 1000;
const MAX_RETRIES = 3;

import { waitForElement, delay } from './dom-helpers';

/**
 * Storage interface for tracking archived conversations
 */
interface ArchivedConversation {
  friendName: string;
  archivedAt: number;
  profileUrl?: string;
}

/**
 * Check if we're currently on the Messenger page
 */
function isOnMessengerPage(): boolean {
  return window.location.href.includes('/messages');
}

/**
 * Navigate to Messenger if not already there
 */
async function ensureOnMessengerPage(timeout: number = DEFAULT_TIMEOUT): Promise<void> {
 if (!isOnMessengerPage()) {
   console.log('[BM Archive] Navigating to Messenger...');
   window.location.href = MESSENGER_BASE_URL;

   const navigationStart = Date.now();

   // Wait for navigation to complete, with timeout to avoid hanging indefinitely
   await new Promise<void>((resolve, reject) => {
     const timeoutId = window.setTimeout(() => {
       window.clearInterval(checkNavigation);
       const elapsed = Date.now() - navigationStart;
       console.error(
         `[BM Archive] Timed out after ${elapsed}ms waiting to navigate to Messenger. Current URL: ${window.location.href}`
       );
       reject(
         new Error('Navigation to Messenger timed out. Please open Facebook Messenger manually and try again.')
       );
     }, timeout);

     const checkNavigation = window.setInterval(() => {
       if (isOnMessengerPage()) {
         window.clearInterval(checkNavigation);
         window.clearTimeout(timeoutId);
         resolve();
       }
     }, 500);
   });

   // Additional delay for page to stabilize
   await delay(2000);
 }
}

/**
 * Find a conversation element by friend name
 */
async function findConversationByName(friendName: string): Promise<HTMLElement | null> {
  await ensureOnMessengerPage();
  
  // Wait for the conversation list to load
  const conversationList = await waitForElement('[role="navigation"]');
  if (!conversationList) {
    console.error('[BM Archive] Conversation list not found');
    return null;
  }
  
  // Facebook uses various selectors for conversation items
  const conversationSelectors = [
    '[role="link"][aria-label*="' + friendName + '"]',
    'a[href*="/messages/t/"][aria-label*="' + friendName + '"]',
    'div[role="listitem"] a[aria-label*="' + friendName + '"]'
  ];
  
  for (const selector of conversationSelectors) {
    const conversation = document.querySelector<HTMLElement>(selector);
    if (conversation) {
      console.log(`[BM Archive] Found conversation for ${friendName}`);
      return conversation;
    }
  }
  
  // Try finding by text content as fallback
  const allConversations = Array.from(document.querySelectorAll('[role="navigation"] a'));
  const matchingConversation = allConversations.find(
    el => el.textContent?.toLowerCase().includes(friendName.toLowerCase())
  );
  
  if (matchingConversation) {
    console.log(`[BM Archive] Found conversation by text match for ${friendName}`);
    return matchingConversation as HTMLElement;
  }
  
  console.warn(`[BM Archive] Conversation not found for ${friendName}`);
  return null;
}

/**
 * Open context menu for a conversation
 */
async function openConversationContextMenu(conversation: HTMLElement): Promise<HTMLElement | null> {
  // Right-click to open context menu
  conversation.dispatchEvent(
    new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 2
    })
  );
  
  // Wait for menu to appear
  await delay(500);
  
  // Look for the context menu
  const menu = await waitForElement('[role="menu"]', 3000);
  return menu;
}

/**
 * Click the archive option in the context menu
 */
async function clickArchiveOption(menu: HTMLElement): Promise<boolean> {
  // Look for archive menu item
  const menuItems = Array.from(menu.querySelectorAll('[role="menuitem"]'));
  
  const archiveItem = menuItems.find(item => {
    const text = item.textContent?.toLowerCase() || '';
    return text.includes('archive') && !text.includes('unarchive');
  });
  
  if (archiveItem) {
    console.log('[BM Archive] Clicking archive option');
    (archiveItem as HTMLElement).click();
    await delay(1000);
    return true;
  }
  
  console.error('[BM Archive] Archive option not found in menu');
  return false;
}

/**
 * Save archived conversation to storage
 */
async function saveArchivedConversation(friendName: string, profileUrl?: string): Promise<void> {
  const stored = await chrome.storage.local.get(ARCHIVE_STORAGE_KEY);
  const archived: ArchivedConversation[] = stored[ARCHIVE_STORAGE_KEY] || [];
  
  // Check if already archived
  const existing = archived.find(c => c.friendName === friendName);
  if (existing) {
    existing.archivedAt = Date.now();
    existing.profileUrl = profileUrl;
  } else {
    archived.push({
      friendName,
      archivedAt: Date.now(),
      profileUrl
    });
  }
  
  await chrome.storage.local.set({ [ARCHIVE_STORAGE_KEY]: archived });
  console.log(`[BM Archive] Saved archive record for ${friendName}`);
}

/**
 * Remove archived conversation from storage
 */
async function removeArchivedConversation(friendName: string): Promise<void> {
  const stored = await chrome.storage.local.get(ARCHIVE_STORAGE_KEY);
  const archived: ArchivedConversation[] = stored[ARCHIVE_STORAGE_KEY] || [];
  
  const filtered = archived.filter(c => c.friendName !== friendName);
  await chrome.storage.local.set({ [ARCHIVE_STORAGE_KEY]: filtered });
  console.log(`[BM Archive] Removed archive record for ${friendName}`);
}

/**
 * Get list of archived conversations
 */
async function getArchivedConversations(): Promise<ArchivedConversation[]> {
  const stored = await chrome.storage.local.get(ARCHIVE_STORAGE_KEY);
  return stored[ARCHIVE_STORAGE_KEY] || [];
}

/**
 * Main function to archive a conversation
 */
export async function archiveConversation(
  friendName: string,
  profileUrl?: string
): Promise<boolean> {
  console.log(`[BM Archive] Starting archive process for ${friendName}`);
  
  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      // Ensure we're on Messenger
      await ensureOnMessengerPage();
      
      // Find the conversation
      const conversation = await findConversationByName(friendName);
      if (!conversation) {
        console.error(`[BM Archive] Could not find conversation for ${friendName}`);
        return false;
      }
      
      // Open context menu
      const menu = await openConversationContextMenu(conversation);
      if (!menu) {
        console.error('[BM Archive] Could not open context menu');
        attempt++;
        await delay(RETRY_DELAY);
        continue;
      }
      
      // Click archive option
      const archived = await clickArchiveOption(menu);
      if (!archived) {
        attempt++;
        await delay(RETRY_DELAY);
        continue;
      }
      
      // Save to storage
      await saveArchivedConversation(friendName, profileUrl);
      
      console.log(`[BM Archive] Successfully archived conversation for ${friendName}`);
      return true;
      
    } catch (error) {
      console.error(`[BM Archive] Error archiving conversation (attempt ${attempt + 1}):`, error);
      attempt++;
      if (attempt < MAX_RETRIES) {
        await delay(RETRY_DELAY);
      }
    }
  }
  
  console.error(`[BM Archive] Failed to archive conversation for ${friendName} after ${MAX_RETRIES} attempts`);
  return false;
}

/**
 * Unarchive a conversation (moves it back to inbox)
 */
export async function unarchiveConversation(friendName: string): Promise<boolean> {
  console.log(`[BM Archive] Starting unarchive process for ${friendName}`);
  
  try {
    await ensureOnMessengerPage();
    
    // Navigate to archived messages
    // Facebook's URL structure for archived: /messages/archived
    window.location.href = 'https://www.facebook.com/messages/archived';
    await delay(2000);
    
    // Find the conversation in archived
    const conversation = await findConversationByName(friendName);
    if (!conversation) {
      console.warn(`[BM Archive] Conversation not found in archive for ${friendName}`);
      return false;
    }
    
    // Open context menu
    const menu = await openConversationContextMenu(conversation);
    if (!menu) {
      console.error('[BM Archive] Could not open context menu');
      return false;
    }
    
    // Look for unarchive option
    const menuItems = Array.from(menu.querySelectorAll('[role="menuitem"]'));
    const unarchiveItem = menuItems.find(item => {
      const text = item.textContent?.toLowerCase() || '';
      return text.includes('unarchive') || text.includes('move to inbox');
    });
    
    if (unarchiveItem) {
      console.log('[BM Archive] Clicking unarchive option');
      (unarchiveItem as HTMLElement).click();
      await delay(1000);
      
      // Remove from storage
      await removeArchivedConversation(friendName);
      
      console.log(`[BM Archive] Successfully unarchived conversation for ${friendName}`);
      return true;
    }
    
    console.error('[BM Archive] Unarchive option not found in menu');
    return false;
    
  } catch (error) {
    console.error('[BM Archive] Error unarchiving conversation:', error);
    return false;
  }
}

/**
 * Check if a message element is from the recipient (not the user)
 */
function isRecipientMessage(element: HTMLElement): boolean {
  // Facebook uses different classes/attributes for incoming vs outgoing messages
  // This is a heuristic approach that may need adjustment based on Facebook's DOM
  
  // Check for data attributes that indicate sender
  const dataAttributes = element.getAttribute('data-scope') || '';
  if (dataAttributes.includes('sender')) {
    return true;
  }
  
  // Check for aria-labels that indicate incoming messages
  const ariaLabel = element.getAttribute('aria-label') || '';
  if (ariaLabel && !ariaLabel.includes('You sent')) {
    return true;
  }
  
  // Check parent containers for position indicators
  // Incoming messages are typically aligned left, outgoing right
  const computedStyle = window.getComputedStyle(element);
  const textAlign = computedStyle.textAlign;
  const justifyContent = computedStyle.justifyContent;
  
  if (textAlign === 'left' || justifyContent === 'flex-start') {
    // Additional check: make sure it's actually a message bubble
    const hasMessageIndicators = 
      element.querySelector('[role="article"]') ||
      element.querySelector('[data-scope="messages_table"]') ||
      element.textContent?.trim().length > 0;
    
    return !!hasMessageIndicators;
  }
  
  return false;
}

/**
 * Monitor for replies in open conversation
 * Sets up a MutationObserver to detect new incoming messages
 */
export async function monitorForReplies(friendName: string): Promise<void> {
  console.log(`[BM Archive] Starting reply monitoring for ${friendName}`);
  
  // Get the messages container
  const messagesContainer = await waitForElement('[role="log"], [role="main"]');
  if (!messagesContainer) {
    console.error('[BM Archive] Messages container not found');
    return;
  }
  
  // Create observer
  const observer = new MutationObserver(async (mutations) => {
    for (const mutation of mutations) {
      // Check if new nodes were added
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        const addedNodes = Array.from(mutation.addedNodes)
          .filter(node => node.nodeType === Node.ELEMENT_NODE) as HTMLElement[];
        
        // Check if any added node is a recipient message
        for (const node of addedNodes) {
          if (isRecipientMessage(node)) {
            console.log(`[BM Archive] Detected reply from ${friendName}!`);
            
            // Unarchive the conversation
            const unarchived = await unarchiveConversation(friendName);
            
            if (unarchived) {
              console.log(`[BM Archive] Auto-unarchived conversation for ${friendName}`);
            }
            
            // Stop observing after detecting a reply
            observer.disconnect();
            return;
          }
        }
      }
    }
  });
  
  // Start observing
  observer.observe(messagesContainer, {
    childList: true,
    subtree: true
  });
  
  console.log(`[BM Archive] Reply monitoring active for ${friendName}`);
  
  // Store observer reference so we can clean it up later
  // @ts-ignore - attach to window for global access
  window.__bmReplyObserver = observer;
}

/**
 * Stop monitoring for replies
 */
export function stopMonitoringReplies(): void {
  // @ts-ignore
  const observer = window.__bmReplyObserver as MutationObserver | undefined;
  if (observer) {
    observer.disconnect();
    console.log('[BM Archive] Stopped reply monitoring');
  }
}

/**
 * Initialize archive monitoring for all archived conversations
 * This should be called when the extension loads on Messenger pages
 */
export async function initializeArchiveMonitoring(): Promise<void> {
  if (!isOnMessengerPage()) {
    return;
  }
  
  console.log('[BM Archive] Initializing archive monitoring...');
  
  const archived = await getArchivedConversations();
  
  if (archived.length === 0) {
    console.log('[BM Archive] No archived conversations to monitor');
    return;
  }
  
  console.log(`[BM Archive] Monitoring ${archived.length} archived conversation(s)`);
  
  // Set up monitoring for each archived conversation
  // In practice, we'll monitor all incoming messages and check if they're from archived contacts
  const messagesContainer = await waitForElement('[role="log"], [role="main"]');
  if (!messagesContainer) {
    console.warn('[BM Archive] Messages container not found for monitoring');
    return;
  }
  
  const observer = new MutationObserver(async (mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        const addedNodes = Array.from(mutation.addedNodes)
          .filter(node => node.nodeType === Node.ELEMENT_NODE) as HTMLElement[];
        
        for (const node of addedNodes) {
          if (isRecipientMessage(node)) {
            // Check if this message is from an archived contact
            // We need to identify the sender from the current conversation
            const pageTitle = document.title;
            
            for (const archivedConv of archived) {
              if (pageTitle.includes(archivedConv.friendName)) {
                console.log(`[BM Archive] Detected reply from archived contact: ${archivedConv.friendName}`);
                await unarchiveConversation(archivedConv.friendName);
                break;
              }
            }
          }
        }
      }
    }
  });
  
  observer.observe(messagesContainer, {
    childList: true,
    subtree: true
  });
  
  console.log('[BM Archive] Global archive monitoring initialized');
}
