/**
 * crash-recovery.ts — Checkpoint & recovery for automation runs.
 *
 * MV3 service workers can be terminated at any time. This module lets the
 * background script save a lightweight "checkpoint" to chrome.storage.local
 * before each automation run, and clear it on completion. If the worker
 * restarts and finds a stale checkpoint, it means the previous run was
 * interrupted and we can take corrective action.
 */

const CHECKPOINT_KEY = 'bm_automation_checkpoint';

export interface AutomationCheckpoint {
  /** ISO timestamp when the run started */
  startedAt: string;
  /** 'scanning' | 'sending' | 'dispatched' */
  phase: 'scanning' | 'sending' | 'dispatched';
  /** Number of contacts targeted in this run */
  targetCount: number;
  /** Number of messages confirmed sent before interruption */
  sentCount: number;
  /** Any extra context for debugging */
  notes?: string;
}

/**
 * Save an automation checkpoint. Call at the start of a scan and
 * update as progress occurs.
 */
export async function saveCheckpoint(checkpoint: AutomationCheckpoint): Promise<void> {
  await chrome.storage.local.set({ [CHECKPOINT_KEY]: checkpoint });
}

/**
 * Retrieve a previously saved checkpoint, or null if none exists.
 */
export async function getCheckpoint(): Promise<AutomationCheckpoint | null> {
  const result = await chrome.storage.local.get(CHECKPOINT_KEY);
  return (result[CHECKPOINT_KEY] as AutomationCheckpoint | undefined) ?? null;
}

/**
 * Clear the checkpoint — call when a run completes (success or graceful failure).
 */
export async function clearCheckpoint(): Promise<void> {
  await chrome.storage.local.remove(CHECKPOINT_KEY);
}

/**
 * Check for and handle a stale checkpoint from a previous interrupted run.
 * Returns the stale checkpoint if one was found (caller can decide what to do),
 * or null if everything is clean.
 *
 * A checkpoint older than `staleThresholdMs` (default 5 min) is considered stale.
 */
export async function checkForStaleCheckpoint(
  staleThresholdMs = 5 * 60 * 1000,
): Promise<AutomationCheckpoint | null> {
  const checkpoint = await getCheckpoint();
  if (!checkpoint) return null;

  const age = Date.now() - new Date(checkpoint.startedAt).getTime();
  if (age > staleThresholdMs) {
    // Checkpoint is stale — the previous run was interrupted
    return checkpoint;
  }

  // Checkpoint exists but is still fresh — another run may be active
  return null;
}
