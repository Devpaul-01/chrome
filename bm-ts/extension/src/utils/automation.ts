// Automation configuration stored in chrome.storage.local
export interface AutomationConfig {
  enabled: boolean;
  checkInterval: number; // minutes
  lastCheck: string | null;
  nextCheck: string | null;
  maxMessages: number; // 0 = unlimited
}

const AUTOMATION_CONFIG_KEY = 'automation_config';
const ALARM_NAME = 'birthday-check-alarm';

export async function getAutomationConfig(): Promise<AutomationConfig> {
  const result = await chrome.storage.local.get(AUTOMATION_CONFIG_KEY);
  return (
    result[AUTOMATION_CONFIG_KEY] || {
      enabled: false,
      checkInterval: 60,
      lastCheck: null,
      nextCheck: null,
      maxMessages: 0,
    }
  );
}

export async function saveAutomationConfig(config: AutomationConfig): Promise<void> {
  await chrome.storage.local.set({ [AUTOMATION_CONFIG_KEY]: config });
}

export async function updateAutomationEnabled(enabled: boolean): Promise<AutomationConfig> {
  const config = await getAutomationConfig();
  config.enabled = enabled;

  if (enabled) {
    // Schedule next check
    await scheduleNextCheck(config.checkInterval);
    config.nextCheck = calculateNextCheck(config.checkInterval);
  } else {
    // Clear alarm
    if (chrome.alarms) await chrome.alarms.clear(ALARM_NAME);
    config.nextCheck = null;
  }

  await saveAutomationConfig(config);
  return config;
}

export async function updateCheckInterval(minutes: number): Promise<AutomationConfig> {
  const config = await getAutomationConfig();
  config.checkInterval = minutes;

  if (config.enabled) {
    // Reschedule with new interval
    await scheduleNextCheck(minutes);
    config.nextCheck = calculateNextCheck(minutes);
  }

  await saveAutomationConfig(config);
  return config;
}

export async function scheduleNextCheck(intervalMinutes: number): Promise<void> {
  if (!chrome.alarms) return;
  await chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: intervalMinutes,
    periodInMinutes: intervalMinutes,
  });
}

function calculateNextCheck(intervalMinutes: number): string {
  const nextCheck = new Date();
  nextCheck.setMinutes(nextCheck.getMinutes() + intervalMinutes);
  return nextCheck.toISOString();
}

export async function updateLastCheck(): Promise<void> {
  const config = await getAutomationConfig();
  config.lastCheck = new Date().toISOString();
  if (config.enabled) {
    config.nextCheck = calculateNextCheck(config.checkInterval);
  }
  await saveAutomationConfig(config);
}

// ---------------------------------------------------------------------------
// Sent-today deduplication
// Tracks which contacts have already been messaged today so repeated alarm
// fires within the same calendar day do not re-send to the same person.
// ---------------------------------------------------------------------------

const SENT_TODAY_KEY = 'bm_sent_today';

interface SentTodayRecord {
  date: string;   // YYYY-MM-DD
  ids: string[];  // facebook_profile_url values (or name if URL is absent)
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function getSentToday(): Promise<string[]> {
  const result = await chrome.storage.local.get(SENT_TODAY_KEY);
  const record: SentTodayRecord | undefined = result[SENT_TODAY_KEY];
  if (!record || record.date !== todayDateString()) {
    return [];
  }
  return record.ids;
}

export async function addToSentToday(friendId: string): Promise<void> {
  const today = todayDateString();
  const result = await chrome.storage.local.get(SENT_TODAY_KEY);
  const record: SentTodayRecord | undefined = result[SENT_TODAY_KEY];
  if (!record || record.date !== today) {
    await chrome.storage.local.set({ [SENT_TODAY_KEY]: { date: today, ids: [friendId] } });
  } else if (!record.ids.includes(friendId)) {
    record.ids.push(friendId);
    await chrome.storage.local.set({ [SENT_TODAY_KEY]: record });
  }
}

export async function clearSentToday(): Promise<void> {
  await chrome.storage.local.remove(SENT_TODAY_KEY);
}

export async function updateMaxMessages(max: number): Promise<AutomationConfig> {
  const config = await getAutomationConfig();
  config.maxMessages = Math.max(0, Math.floor(max));
  await saveAutomationConfig(config);
  return config;
}

// ---------------------------------------------------------------------------
// Per-action delay: how many minutes to wait between each automated send
// (1–5 minutes, default 1). Stored separately from AutomationConfig.
// ---------------------------------------------------------------------------

const ACTION_DELAY_KEY = 'bm_action_delay_minutes';

export async function getActionDelayMinutes(): Promise<number> {
  const result = await chrome.storage.local.get(ACTION_DELAY_KEY);
  const val = result[ACTION_DELAY_KEY];
  if (typeof val === 'number' && val >= 1 && val <= 5) return val;
  return 1; // default: 1 minute
}

export async function setActionDelayMinutes(minutes: number): Promise<void> {
  const clamped = Math.max(1, Math.min(5, Math.round(minutes)));
  await chrome.storage.local.set({ [ACTION_DELAY_KEY]: clamped });
}
