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

const SHORT_DELAY = 1000;
const MEDIUM_DELAY = 2000;

import { waitForElement, delay, trySelectors, retryOperation, simulateClick } from './dom-helpers';
import { logger } from '../utils/logger';

import { isVisible, readEditableText, replaceFacebookEditorText } from './editor-helpers';

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
 * Navigate to a friend's profile/timeline
 */
export async function navigateToProfile(profileUrl: string): Promise<boolean> {
  logger.log(`[BM Timeline] Navigating to profile: ${profileUrl}`);

  try {
    // If we're already on the profile, no need to navigate
    if (window.location.href.includes(profileUrl)) {
      logger.log('[BM Timeline] Already on profile page');
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
      logger.error('[BM Timeline] Failed to verify profile page load');
      return false;
    }

    logger.log('[BM Timeline] Successfully navigated to profile');
    return true;
  } catch (error) {
    logger.error('[BM Timeline] Error navigating to profile:', error);
    return false;
  }
}

/**
 * Open the post composer on a friend's timeline
 */
export async function openPostComposer(): Promise<HTMLElement | null> {
  logger.log('[BM Timeline] Opening post composer...');

  try {
    // Selectors ordered: structural/language-agnostic first, then English-specific
    const composerSelectors = [
      // Structural selectors (language-agnostic)
      '[contenteditable="true"][role="textbox"]',
      '[data-testid*="composer"], [data-testid*="post-composer"]',
      // aria-label selectors (may vary by locale)
      '[role="button"][aria-label*="Write something"]',
      '[role="button"][aria-label*="Create post"]',
      '[aria-label*="Write post"]',
      // German
      '[role="button"][aria-label*="Was denkst du"]',
      '[role="button"][aria-label*="Beitrag erstellen"]',
      // Spanish
      '[role="button"][aria-label*="crees"]',
      '[role="button"][aria-label*="Crear publicaci"]',
      // French
      '[role="button"][aria-label*="quoi pensez"]',
      '[role="button"][aria-label*="Cr"]',
    ];

    let composerTrigger: HTMLElement | null = trySelectors(composerSelectors);

    if (!composerTrigger) {
      // Structural fallback: find buttons near the profile timeline that look like composer triggers
      const mainContent = document.querySelector('[role="main"]');
      if (mainContent) {
        const buttons = Array.from(mainContent.querySelectorAll('[role="button"]'));
        composerTrigger =
          (buttons.find((btn) => {
            // Look for buttons that contain a user avatar image + placeholder text
            const hasAvatar = btn.querySelector('image, img[src*="profile"], svg');
            const hasPlaceholder = btn.querySelector('span')?.textContent?.trim();
            return hasAvatar && hasPlaceholder && hasPlaceholder.length > 3;
          }) as HTMLElement) ?? null;
      }
    }

    if (!composerTrigger) {
      logger.error('[BM Timeline] Could not find post composer trigger');
      return null;
    }

    // Click the trigger to open composer
    await simulateClick(composerTrigger);
    await delay(SHORT_DELAY);

    // Wait for the composer dialog/modal to appear
    const composerDialog = await waitForElement('[role="dialog"], [role="presentation"]', 5000);

    if (!composerDialog) {
      logger.warn('[BM Timeline] Composer dialog not found, checking for inline composer');
      // Sometimes composer is inline, not a dialog
      return composerTrigger;
    }

    logger.log('[BM Timeline] Post composer opened successfully');
    return composerDialog;
  } catch (error) {
    logger.error('[BM Timeline] Error opening post composer:', error);
    return null;
  }
}

/**
 * Insert text content into the post composer
 */
async function insertPostContent(content: string, container?: HTMLElement): Promise<boolean> {
  logger.log('[BM Timeline] Inserting post content...');

  try {
    const scope: ParentNode = container ?? document;

    const selectors = [
      '[contenteditable="true"][role="textbox"]',
      '[contenteditable="true"][aria-label*="post" i]',
      '[contenteditable="true"][data-text="true"]',
      'div[contenteditable="true"]',
    ];

    let textbox: HTMLElement | null = null;

    for (const selector of selectors) {
      const candidates = Array.from(scope.querySelectorAll<HTMLElement>(selector)).filter(
        isVisible,
      );

      if (candidates.length > 0) {
        textbox = candidates[0];

        logger.log(`[BM Timeline] Found visible post textbox using: ${selector}`);

        break;
      }
    }

    if (!textbox) {
      logger.error('[BM Timeline] Could not find post textbox');
      return false;
    }

    await replaceFacebookEditorText(textbox, content);

    const inserted = readEditableText(textbox);

    if (inserted !== content.trim()) {
      throw new Error('Facebook timeline editor did not retain the custom template.');
    }

    logger.log('[BM Timeline] Custom post content verified');

    return true;
  } catch (error) {
    logger.error('[BM Timeline] Error inserting custom post content:', error);

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

  logger.log(`[BM Timeline] Processed Nifty Images URL: ${processedUrl}`);
  return processedUrl;
}

/**
 * Attach an image to the post using clipboard API
 */
export async function attachImageToPost(
  imageUrl: string,
  mergeTags?: NiftyImagesMergeTags,
): Promise<boolean> {
  logger.log(`[BM Timeline] Attaching image: ${imageUrl}`);

  try {
    // Process merge tags if this is a Nifty Images URL
    let processedUrl = imageUrl;
    if (mergeTags) {
      processedUrl = processNiftyImagesMergeTags(imageUrl, mergeTags);
    }

    // Fetch the image
    logger.log('[BM Timeline] Fetching image...');
    const response = await fetch(processedUrl, {
      mode: 'cors',
      credentials: 'omit',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }

    const blob = await response.blob();
    logger.log(`[BM Timeline] Image fetched, size: ${blob.size} bytes, type: ${blob.type}`);

    // Ensure we have an image blob
    if (!blob.type.startsWith('image/')) {
      throw new Error(`Invalid image type: ${blob.type}`);
    }

    // Copy image to clipboard
    logger.log('[BM Timeline] Copying image to clipboard...');
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
    } catch {
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
      logger.warn('[BM Timeline] Could not verify image attachment');
      // Don't fail - image might still be processing
    } else {
      logger.log('[BM Timeline] Image attachment verified');
    }

    logger.log('[BM Timeline] Image attached successfully');
    return true;
  } catch (error) {
    logger.error('[BM Timeline] Error attaching image:', error);
    return false;
  }
}

/**
 * Finds and clicks the enabled Post/Share button belonging to the same
 * Facebook composer that contains our customized timeline message.
 *
 * Passing the composer container prevents the extension from accidentally
 * selecting an unrelated Post, Share, Close, or Facebook navigation button.
 */
async function submitPost(container?: HTMLElement): Promise<boolean> {
  logger.log('[BM Timeline] Submitting customized post...');

  try {
    /*
     * "scope" means the small area where we are allowed to search.
     *
     * When the Facebook composer was found earlier, `container` should be
     * that composer dialog. We search inside it instead of searching the
     * complete Facebook page.
     */
    const scope: ParentNode = container ?? document;

    /*
     * Facebook changes its labels and internal attributes frequently.
     * These selectors cover common English and international Post/Share
     * controls.
     */
    const postButtonSelectors = [
      '[data-testid*="post_submit"]',
      '[data-testid*="share_button"]',
      '[role="button"][aria-label="Post"]',
      '[role="button"][aria-label="Share"]',
      'button[aria-label="Post"]',
      'button[aria-label="Share"]',

      // Partial, case-insensitive matching
      '[role="button"][aria-label*="Post" i]',
      '[role="button"][aria-label*="Share" i]',

      // Common translated labels
      '[role="button"][aria-label*="Posten" i]',
      '[role="button"][aria-label*="Teilen" i]',
      '[role="button"][aria-label*="Publicar" i]',
      '[role="button"][aria-label*="Compartir" i]',
      '[role="button"][aria-label*="Publier" i]',
      '[role="button"][aria-label*="Partager" i]',

      // Additional Facebook variants
      'div[aria-label*="post" i][role="button"]',
      'div[aria-label*="share" i][role="button"]',
    ];

    let postButton: HTMLElement | null = null;

    /*
     * Try each selector, but only inside the supplied composer.
     */
    for (const selector of postButtonSelectors) {
      const candidates = Array.from(scope.querySelectorAll<HTMLElement>(selector));

      postButton =
        candidates.find((candidate) => {
          const disabled =
            candidate.getAttribute('aria-disabled') === 'true' ||
            candidate.hasAttribute('disabled');

          return isVisible(candidate) && !disabled;
        }) ?? null;

      if (postButton) {
        logger.log(`[BM Timeline] Found enabled Post button using selector: ${selector}`);

        break;
      }
    }

    /*
     * Fallback:
     *
     * If Facebook changed the exact selector, inspect buttons inside the
     * same composer dialog and compare their accessible labels/text.
     */
    if (!postButton) {
      const dialog = container?.matches('[role="dialog"]')
        ? container
        : container?.querySelector<HTMLElement>('[role="dialog"]') ?? null;

      if (dialog) {
        const buttons = Array.from(dialog.querySelectorAll<HTMLElement>('button, [role="button"]'));

        postButton =
          buttons.find((candidate) => {
            if (!isVisible(candidate)) {
              return false;
            }

            const disabled =
              candidate.getAttribute('aria-disabled') === 'true' ||
              candidate.hasAttribute('disabled');

            if (disabled) {
              return false;
            }

            const label = (
              candidate.getAttribute('aria-label') ??
              candidate.innerText ??
              candidate.textContent ??
              ''
            )
              .trim()
              .toLowerCase();

            const isPostControl = [
              'post',
              'share',
              'publish',
              'posten',
              'teilen',
              'publicar',
              'compartir',
              'publier',
              'partager',
            ].some(
              (word) =>
                label === word || label.startsWith(`${word} `) || label.endsWith(` ${word}`),
            );

            const isDangerousUnrelatedControl = [
              'close',
              'cancel',
              'back',
              'discard',
              'delete',
            ].some((word) => label.includes(word));

            return isPostControl && !isDangerousUnrelatedControl;
          }) ?? null;
      }
    }

    /*
     * Safety rule:
     *
     * Do not press Enter as a fallback. In a Facebook post composer,
     * Enter may simply create a new line rather than submit the post.
     */
    if (!postButton) {
      logger.error(
        '[BM Timeline] Could not find an enabled Post button inside the current composer.',
      );

      return false;
    }

    /*
     * Make sure the control is visible before clicking it.
     */
    postButton.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });

    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 250);
    });

    /*
     * Generate normal mouse events before the final click. This more closely
     * resembles a real user interaction than changing DOM properties alone.
     */
    postButton.dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    );

    postButton.dispatchEvent(
      new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    );

    postButton.click();

    logger.log('[BM Timeline] Post button clicked.');

    /*
     * Give Facebook time to submit the post and close/update the composer.
     */
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 1_500);
    });

    /*
     * A successful submission usually removes the button, closes the dialog,
     * or disables the control while Facebook processes the post.
     */
    const buttonWasRemoved = !postButton.isConnected;
    const buttonBecameDisabled =
      postButton.getAttribute('aria-disabled') === 'true' || postButton.hasAttribute('disabled');

    const composerClosed =
      container !== undefined && (!container.isConnected || !isVisible(container));

    if (buttonWasRemoved || buttonBecameDisabled || composerClosed) {
      logger.log('[BM Timeline] Customized post submission was confirmed.');

      return true;
    }

    /*
     * Facebook can sometimes leave the dialog visible briefly.
     * Report this as uncertain rather than falsely claiming success.
     */
    logger.warn(
      '[BM Timeline] Post button was clicked, but Facebook did not clearly confirm completion.',
    );

    return false;
  } catch (error) {
    logger.error('[BM Timeline] Error while submitting customized post:', error);

    return false;
  }
}

/**
 * Main function to post to a friend's timeline
 */
export async function postToTimeline(post: TimelinePost): Promise<boolean> {
  logger.log(`[BM Timeline] Starting timeline post for ${post.friendName}`);

  try {
    return await retryOperation(
      async () => {
        // 1. Navigate to profile if URL provided
        if (post.profileUrl) {
          const navigated = await navigateToProfile(post.profileUrl);
          if (!navigated) {
            throw new Error('Failed to navigate to profile');
          }
        }

        // 2. Open post composer (retry up to 2 attempts within this step)
        let composer: HTMLElement | null = null;
        for (let i = 0; i < 2; i++) {
          composer = await openPostComposer();
          if (composer) break;
          await delay(SHORT_DELAY);
        }
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
          const mergeTags: NiftyImagesMergeTags = {
            name: post.friendName,
            firstName: post.friendName.split(' ')[0],
            date: new Date().toLocaleDateString(),
          };

          const imageAttached = await attachImageToPost(post.imageUrl, mergeTags);
          if (!imageAttached) {
            logger.warn('[BM Timeline] Image attachment failed, continuing without image');
          }

          await delay(MEDIUM_DELAY);
        }

        // 5. Submit the post
        if (!(await submitPost(composer))) {
          throw new Error('Failed to submit customized timeline post');
        }

        logger.log(`[BM Timeline] Successfully posted to ${post.friendName}'s timeline`);
        return true;
      },
      2,
      2000,
    ); // retry up to 2 times with 2s base delay
  } catch (error) {
    logger.error('[BM Timeline] Error posting to timeline after retries:', error);
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
  logger.log(`[BM Timeline] Starting batch post for ${posts.length} friends`);

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
      logger.log(`[BM Timeline] Waiting ${delayBetweenPosts}ms before next post...`);
      await delay(delayBetweenPosts);
    }
  }

  logger.log(`[BM Timeline] Batch complete: ${successCount} success, ${failedCount} failed`);

  return {
    success: successCount,
    failed: failedCount,
    results,
  };
}
