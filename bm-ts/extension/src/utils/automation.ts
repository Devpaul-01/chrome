// Automation configuration stored in chrome.storage.local
export interface AutomationConfig {
  enabled: boolean;
  checkInterval: number; // minutes
  lastCheck: string | null;
  nextCheck: string | null;
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
    await chrome.alarms.clear(ALARM_NAME);
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
