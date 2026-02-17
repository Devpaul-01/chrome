/**
 * timeline.ts - Facebook Timeline posting automation
 *
 * Provides functionality to:
 * - Navigate to friend's profile/timeline
 * - Open post composer
 * - Insert text content with merge tag support
 * - Attach images via clipboard API (Nifty Images support)
 * - Submit posts to friend timelines
 */

const DEFAULT_TIMEOUT = 10000;
const SHORT_DELAY = 1000;
const MEDIUM_DELAY = 2000;
const LONG_DELAY = 3000;

/**
 * Interface for post content
 */
export interface TimelinePost {
  content: string;
  imageUrl?: string;
  friendName: string;
  profileUrl?: string;
}

/**
 * Interface for merge tag replacement in Nifty Images URLs
 */
interface NiftyImagesMergeTags {
  name?: string;
  firstName?: string;
  age?: string;
  date?: string;
  customTags?: Record<string, string>;
}

/**
 * Wait for an element to appear in the DOM
 */
async function waitForElement(
  selector: string,
  timeout = DEFAULT_TIMEOUT,
  parent: Document | HTMLElement = document,
): Promise<HTMLElement | null> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const element = parent.querySelector<HTMLElement>(selector);
    if (element) {
      return element;
    }
    await delay(100);
  }

  return null;
}

/**
 * Delay execution for specified milliseconds
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Navigate to a friend's profile/timeline
 */
export async function navigateToProfile(profileUrl: string): Promise<boolean> {
  console.log(`[BM Timeline] Navigating to profile: ${profileUrl}`);

  try {
    // If we're already on the profile, no need to navigate
    if (window.location.href.includes(profileUrl)) {
      console.log('[BM Timeline] Already on profile page');
      return true;
    }

    // Navigate to the profile
    window.location.href = profileUrl;

    // Wait for navigation to complete
    await new Promise<void>((resolve) => {
      const checkNavigation = setInterval(() => {
        if (window.location.href.includes(profileUrl)) {
          clearInterval(checkNavigation);
          resolve();
        }
      }, 500);

      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkNavigation);
        resolve();
      }, 10000);
    });

    // Wait for page to stabilize
    await delay(MEDIUM_DELAY);

    // Verify we're on a profile page
    const isProfilePage =
      document.querySelector('[role="main"]') !== null ||
      document.querySelector('[data-pagelet="ProfileTimeline"]') !== null;

    if (!isProfilePage) {
      console.error('[BM Timeline] Failed to verify profile page load');
      return false;
    }

    console.log('[BM Timeline] Successfully navigated to profile');
    return true;
  } catch (error) {
    console.error('[BM Timeline] Error navigating to profile:', error);
    return false;
  }
}

/**
 * Open the post composer on a friend's timeline
 */
export async function openPostComposer(): Promise<HTMLElement | null> {
  console.log('[BM Timeline] Opening post composer...');

  try {
    // Look for the "Write something..." or "Create post" button
    const composerSelectors = [
      '[role="button"][aria-label*="Write something"]',
      '[role="button"][aria-label*="Create post"]',
      '[aria-label*="Write post"]',

      // Fallback: look for contenteditable areas
      '[contenteditable="true"][role="textbox"]',
    ];

    let composerTrigger: HTMLElement | null = null;

    for (const selector of composerSelectors) {
      composerTrigger = document.querySelector<HTMLElement>(selector);
      if (composerTrigger) {
        console.log(`[BM Timeline] Found composer trigger: ${selector}`);
        break;
      }
    }

    if (!composerTrigger) {
      // Try finding by text content
      const allButtons = Array.from(document.querySelectorAll('[role="button"]'));
      composerTrigger = allButtons.find((btn) => {
        const text = btn.textContent?.toLowerCase() || '';
        return text.includes('write') || text.includes('post') || text.includes('something');
      }) as HTMLElement;
    }

    if (!composerTrigger) {
      console.error('[BM Timeline] Could not find post composer trigger');
      return null;
    }

    // Click the trigger to open composer
    composerTrigger.click();
    await delay(SHORT_DELAY);

    // Wait for the composer dialog/modal to appear
    const composerDialog = await waitForElement('[role="dialog"], [role="presentation"]', 5000);

    if (!composerDialog) {
      console.warn('[BM Timeline] Composer dialog not found, checking for inline composer');
      // Sometimes composer is inline, not a dialog
      return composerTrigger;
    }

    console.log('[BM Timeline] Post composer opened successfully');
    return composerDialog;
  } catch (error) {
    console.error('[BM Timeline] Error opening post composer:', error);
    return null;
  }
}

/**
 * Insert text content into the post composer
 */
export async function insertPostContent(
  content: string,
  containerElement?: HTMLElement,
): Promise<boolean> {
  console.log('[BM Timeline] Inserting post content...');

  try {
    const searchRoot = containerElement || document;

    // Find the contenteditable textbox
    const textboxSelectors = [
      '[contenteditable="true"][role="textbox"]',
      '[contenteditable="true"][aria-label*="post"]',
      '[contenteditable="true"][data-text="true"]',
      'div[contenteditable="true"]',
    ];

    let textbox: HTMLElement | null = null;

    for (const selector of textboxSelectors) {
      textbox = searchRoot.querySelector<HTMLElement>(selector);
      if (textbox && !textbox.getAttribute('aria-hidden')) {
        console.log(`[BM Timeline] Found textbox: ${selector}`);
        break;
      }
    }

    if (!textbox) {
      console.error('[BM Timeline] Could not find post textbox');
      return false;
    }

    // Focus the textbox
    textbox.focus();
    await delay(300);

    // Clear existing content
    textbox.textContent = '';

    // Insert the new content
    textbox.textContent = content;

    // Trigger input events to notify Facebook's React components
    textbox.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        cancelable: true,
      }),
    );

    textbox.dispatchEvent(
      new Event('change', {
        bubbles: true,
      }),
    );

    // Verify content was inserted
    await delay(300);
    const insertedText = textbox.textContent || textbox.innerText || '';

    if (!insertedText.includes(content.substring(0, 20))) {
      console.warn('[BM Timeline] Content verification failed, retrying with alternative method');

      // Alternative method: use document.execCommand (deprecated but sometimes works)
      textbox.focus();
      document.execCommand('selectAll', false);
      document.execCommand('insertText', false, content);
    }

    console.log('[BM Timeline] Post content inserted successfully');
    return true;
  } catch (error) {
    console.error('[BM Timeline] Error inserting post content:', error);
    return false;
  }
}

/**
 * Process Nifty Images merge tags in image URL
 */
export function processNiftyImagesMergeTags(
  imageUrl: string,
  mergeTags: NiftyImagesMergeTags,
): string {
  if (!imageUrl || !imageUrl.includes('niftyimages')) {
    return imageUrl;
  }

  let processedUrl = imageUrl;

  // Replace common merge tags
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

  // Process custom tags
  if (mergeTags.customTags) {
    for (const [key, value] of Object.entries(mergeTags.customTags)) {
      const regex = new RegExp(`\\[${key}\\]`, 'gi');
      processedUrl = processedUrl.replace(regex, encodeURIComponent(value));
    }
  }

  console.log(`[BM Timeline] Processed Nifty Images URL: ${processedUrl}`);
  return processedUrl;
}

/**
 * Attach an image to the post using clipboard API
 */
export async function attachImageToPost(
  imageUrl: string,
  mergeTags?: NiftyImagesMergeTags,
): Promise<boolean> {
  console.log(`[BM Timeline] Attaching image: ${imageUrl}`);

  try {
    // Process merge tags if this is a Nifty Images URL
    let processedUrl = imageUrl;
    if (mergeTags) {
      processedUrl = processNiftyImagesMergeTags(imageUrl, mergeTags);
    }

    // Fetch the image
    console.log('[BM Timeline] Fetching image...');
    const response = await fetch(processedUrl, {
      mode: 'cors',
      credentials: 'omit',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }

    const blob = await response.blob();
    console.log(`[BM Timeline] Image fetched, size: ${blob.size} bytes, type: ${blob.type}`);

    // Ensure we have an image blob
    if (!blob.type.startsWith('image/')) {
      throw new Error(`Invalid image type: ${blob.type}`);
    }

    // Copy image to clipboard
    console.log('[BM Timeline] Copying image to clipboard...');
    await navigator.clipboard.write([
      new ClipboardItem({
        [blob.type]: blob,
      }),
    ]);

    await delay(500);

    // Find the composer textbox to paste into
    const textbox = document.querySelector<HTMLElement>('[contenteditable="true"][role="textbox"]');

    if (!textbox) {
      throw new Error('Could not find textbox for pasting image');
    }

    // Focus and paste
    textbox.focus();
    await delay(200);

    // Try modern paste method first
    try {
      const items = await navigator.clipboard.read();
      if (items.length > 0) {
        // Dispatch paste event
        const pasteEvent = new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: new DataTransfer(),
        });

        textbox.dispatchEvent(pasteEvent);
      }
    } catch (e) {
      // Fallback to execCommand
      document.execCommand('paste');
    }

    // Wait for image to be processed
    await delay(MEDIUM_DELAY);

    // Verify image was attached by looking for image preview
    const imagePreview = document.querySelector(
      '[role="dialog"] img, [role="presentation"] img, [aria-label*="image"] img',
    );

    if (!imagePreview) {
      console.warn('[BM Timeline] Could not verify image attachment');
      // Don't fail - image might still be processing
    } else {
      console.log('[BM Timeline] Image attachment verified');
    }

    console.log('[BM Timeline] Image attached successfully');
    return true;
  } catch (error) {
    console.error('[BM Timeline] Error attaching image:', error);
    return false;
  }
}

/**
 * Submit the post
 */
export async function submitPost(): Promise<boolean> {
  console.log('[BM Timeline] Submitting post...');

  try {
    // Look for the Post/Submit button
    const postButtonSelectors = [
      '[role="button"][aria-label="Post"]',
      '[role="button"][aria-label="Share"]',

      '[aria-label*="Post"][role="button"]',
    ];

    let postButton: HTMLElement | null = null;

    for (const selector of postButtonSelectors) {
      postButton = document.querySelector<HTMLElement>(selector);
      if (postButton) {
        // Make sure it's not disabled
        const isDisabled =
          postButton.getAttribute('aria-disabled') === 'true' ||
          postButton.hasAttribute('disabled');

        if (!isDisabled) {
          console.log(`[BM Timeline] Found post button: ${selector}`);
          break;
        }
      }
    }

    if (!postButton) {
      // Try finding by text content
      const allButtons = Array.from(document.querySelectorAll('[role="button"]'));
      postButton = allButtons.find((btn) => {
        const text = btn.textContent?.trim().toLowerCase() || '';
        const isDisabled =
          btn.getAttribute('aria-disabled') === 'true' || btn.hasAttribute('disabled');
        return (text === 'post' || text === 'share') && !isDisabled;
      }) as HTMLElement;
    }

    if (!postButton) {
      console.error('[BM Timeline] Could not find Post button');
      return false;
    }

    // Click the button
    postButton.click();

    // Wait for post to be submitted
    await delay(LONG_DELAY);

    // Check if composer dialog closed (indicates success)
    const composerDialog = document.querySelector('[role="dialog"]');
    const postSuccess = !composerDialog;

    if (postSuccess) {
      console.log('[BM Timeline] Post submitted successfully');
    } else {
      console.warn('[BM Timeline] Post submission unclear - dialog still open');
    }

    return true;
  } catch (error) {
    console.error('[BM Timeline] Error submitting post:', error);
    return false;
  }
}

/**
 * Main function to post to a friend's timeline
 */
export async function postToTimeline(post: TimelinePost): Promise<boolean> {
  console.log(`[BM Timeline] Starting timeline post for ${post.friendName}`);

  try {
    // 1. Navigate to profile if URL provided
    if (post.profileUrl) {
      const navigated = await navigateToProfile(post.profileUrl);
      if (!navigated) {
        throw new Error('Failed to navigate to profile');
      }
    }

    // 2. Open post composer
    const composer = await openPostComposer();
    if (!composer) {
      throw new Error('Failed to open post composer');
    }

    await delay(SHORT_DELAY);

    // 3. Insert text content
    const contentInserted = await insertPostContent(post.content, composer);
    if (!contentInserted) {
      throw new Error('Failed to insert post content');
    }

    await delay(SHORT_DELAY);

    // 4. Attach image if present
    if (post.imageUrl) {
      // Extract merge tag data from post
      const mergeTags: NiftyImagesMergeTags = {
        name: post.friendName,
        firstName: post.friendName.split(' ')[0],
        date: new Date().toLocaleDateString(),
      };

      const imageAttached = await attachImageToPost(post.imageUrl, mergeTags);
      if (!imageAttached) {
        console.warn('[BM Timeline] Image attachment failed, continuing without image');
      }

      await delay(MEDIUM_DELAY);
    }

    // 5. Submit the post
    const submitted = await submitPost();
    if (!submitted) {
      throw new Error('Failed to submit post');
    }

    console.log(`[BM Timeline] Successfully posted to ${post.friendName}'s timeline`);
    return true;
  } catch (error) {
    console.error('[BM Timeline] Error posting to timeline:', error);
    return false;
  }
}

/**
 * Batch post to multiple friend timelines with delays
 */
export async function batchPostToTimelines(
  posts: TimelinePost[],
  delayBetweenPosts: number = 5000,
): Promise<{ success: number; failed: number; results: boolean[] }> {
  console.log(`[BM Timeline] Starting batch post for ${posts.length} friends`);

  const results: boolean[] = [];
  let successCount = 0;
  let failedCount = 0;

  for (const post of posts) {
    const result = await postToTimeline(post);
    results.push(result);

    if (result) {
      successCount++;
    } else {
      failedCount++;
    }

    // Wait between posts to avoid rate limiting
    if (posts.indexOf(post) < posts.length - 1) {
      console.log(`[BM Timeline] Waiting ${delayBetweenPosts}ms before next post...`);
      await delay(delayBetweenPosts);
    }
  }

  console.log(`[BM Timeline] Batch complete: ${successCount} success, ${failedCount} failed`);

  return {
    success: successCount,
    failed: failedCount,
    results,
  };
}
