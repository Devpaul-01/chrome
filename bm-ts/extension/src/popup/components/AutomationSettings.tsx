import { useEffect, useState } from 'react';
import Spinner from './Spinner';
import { getErrorMessage, logError } from '../../utils/errors';
import HelpTooltip from './HelpTooltip';

const ACTION_DELAY_KEY = 'bm_action_delay_minutes';

interface AutomationConfig {
  enabled: boolean;
  checkInterval: number; // minutes
  lastCheck: string | null;
  nextCheck: string | null;
  maxMessages: number; // 0 = unlimited
}

interface RateLimitBucket {
  used: number;
  cap: number;
}

interface RateLimitStatus {
  allowed: boolean;
  reason?: string;
  hourly: RateLimitBucket;
  daily: RateLimitBucket;
  weekly: RateLimitBucket;
}

interface ActivityLogEntry {
  timestamp: string;
  level: string;
  message: string;
}

interface EmergencyStopState {
  active: boolean;
  triggeredAt: string | null;
  cooldownUntil: string | null;
}

type ConfirmationMode = 'each' | 'session' | 'auto';

interface AutomationSettingsProps {
  onClose: () => void;
  showClose?: boolean;
}

export default function AutomationSettings({ onClose, showClose = true }: AutomationSettingsProps) {
  const [config, setConfig] = useState<AutomationConfig>({
    enabled: false,
    checkInterval: 60,
    lastCheck: null,
    nextCheck: null,
    maxMessages: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionDelayMinutes, setActionDelayMinutes] = useState(1);
  const [rateLimits, setRateLimits] = useState<RateLimitStatus | null>(null);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [emergencyStop, setEmergencyStop] = useState<EmergencyStopState>({
    active: false,
    triggeredAt: null,
    cooldownUntil: null,
  });
  const [confirmMode, setConfirmMode] = useState<ConfirmationMode>('each');
  const [showLog, setShowLog] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'automation.getConfig',
      });
      const data = response?.data ?? response;
      if (data) {
        setConfig(data);
      }
      const stored = await chrome.storage.local.get(ACTION_DELAY_KEY);
      if (typeof stored[ACTION_DELAY_KEY] === 'number') {
        setActionDelayMinutes(stored[ACTION_DELAY_KEY] as number);
      }

      // Load fail-safe state
      const [rlResult, logResult, esResult, cmResult] = await Promise.all([
        chrome.runtime.sendMessage({ type: 'failsafe.getRateLimits' }),
        chrome.runtime.sendMessage({ type: 'failsafe.getActivityLog' }),
        chrome.runtime.sendMessage({ type: 'failsafe.getEmergencyStop' }),
        chrome.runtime.sendMessage({ type: 'failsafe.getConfirmationMode' }),
      ]);
      const rl = rlResult?.data ?? rlResult;
      const log = logResult?.data ?? logResult;
      const es = esResult?.data ?? esResult;
      const cm = cmResult?.data ?? cmResult;
      if (rl?.hourly) setRateLimits(rl);
      if (Array.isArray(log)) setActivityLog(log);
      if (es) setEmergencyStop(es);
      if (cm?.mode) setConfirmMode(cm.mode);
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      logError(err, 'AutomationSettings:loadConfig');
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleToggleAutomation(enabled: boolean) {
    setIsSaving(true);
    setMessage(null);
    setError(null);
    try {
      await chrome.runtime.sendMessage({
        type: 'automation.setEnabled',
        payload: { enabled },
      });
      setConfig((prev) => ({ ...prev, enabled }));
      setMessage(enabled ? 'Automation enabled' : 'Automation disabled');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUpdateInterval(minutes: number) {
    if (minutes < 30) {
      setError('Interval must be at least 30 minutes');
      return;
    }
    setIsSaving(true);
    setMessage(null);
    setError(null);
    try {
      await chrome.runtime.sendMessage({
        type: 'automation.setInterval',
        payload: { minutes },
      });
      setConfig((prev) => ({ ...prev, checkInterval: minutes }));
      setMessage('Check interval updated');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUpdateMaxMessages(max: number) {
    setIsSaving(true);
    setMessage(null);
    setError(null);
    try {
      await chrome.runtime.sendMessage({
        type: 'automation.setMaxMessages',
        payload: { max },
      });
      setConfig((prev) => ({ ...prev, maxMessages: max }));
      setMessage(max === 0 ? 'Max messages set to unlimited' : `Max messages set to ${max}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleClearSentToday() {
    setMessage(null);
    setError(null);
    try {
      await chrome.runtime.sendMessage({ type: 'automation.clearSentToday' });
      setMessage('Sent-today list cleared — all contacts can be messaged again today');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleRunNow() {
    setMessage(null);
    setError(null);
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'automation.scanFacebook',
      });
      const result = response?.data ?? response;
      setMessage(result?.success ? 'Scan triggered successfully' : 'No Facebook tab found');
      await loadConfig(); // Refresh to get updated lastCheck
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleEmergencyStop() {
    setMessage(null);
    setError(null);
    try {
      await chrome.runtime.sendMessage({
        type: 'failsafe.triggerEmergencyStop',
        payload: { cooldownHours: 24 },
      });
      setEmergencyStop({
        active: true,
        triggeredAt: new Date().toISOString(),
        cooldownUntil: null,
      });
      setConfig((prev) => ({ ...prev, enabled: false }));
      setMessage('Emergency stop activated — all automation paused for 24 hours');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleClearEmergencyStop() {
    setMessage(null);
    setError(null);
    try {
      await chrome.runtime.sendMessage({ type: 'failsafe.clearEmergencyStop' });
      setEmergencyStop({ active: false, triggeredAt: null, cooldownUntil: null });
      setMessage('Emergency stop cleared');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleConfirmModeChange(mode: ConfirmationMode) {
    try {
      await chrome.runtime.sendMessage({
        type: 'failsafe.setConfirmationMode',
        payload: { mode },
      });
      setConfirmMode(mode);
      setMessage(`Confirmation mode set to "${mode}"`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleClearActivityLog() {
    try {
      await chrome.runtime.sendMessage({ type: 'failsafe.clearActivityLog' });
      setActivityLog([]);
      setMessage('Activity log cleared');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function formatDate(dateString: string | null): string {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleString();
  }

  const intervalPresets = [
    { label: '30 minutes', value: 30 },
    { label: '1 hour', value: 60 },
    { label: '2 hours', value: 120 },
    { label: '6 hours', value: 360 },
    { label: '12 hours', value: 720 },
    { label: '24 hours', value: 1440 },
  ];

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-3">Automation Settings</h2>
      <p className="text-sm text-gray-600 mb-4">
        Configure automatic birthday checking and message sending.
      </p>

      {error && <div className="error mb-3" role="alert">{error}</div>}
      {message && <div className="success mb-3" role="status">{message}</div>}

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner size="md" message="Loading settings..." />
        </div>
      ) : (
        <>
          {/* Enable/Disable Toggle */}
          <div className="mb-4 p-3 bg-gray-50 rounded">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => handleToggleAutomation(e.target.checked)}
                disabled={isSaving}
                className="w-5 h-5"
              />
              <div>
                <span className="font-medium">Enable Automation</span>
                <p className="text-xs text-gray-600">
                  Automatically check for birthdays and send messages
                </p>
              </div>
            </label>
          </div>

          {/* Check Interval */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Check Interval</label>
            <div className="grid grid-cols-2 gap-2 mb-2">
              {intervalPresets.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => handleUpdateInterval(preset.value)}
                  disabled={isSaving}
                  aria-pressed={config.checkInterval === preset.value}
                  className={`px-3 py-2 text-sm rounded ${
                    config.checkInterval === preset.value
                      ? 'bg-orangeStrong text-white'
                      : 'bg-gray-100 hover:bg-gray-200'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500">
              How often to check Facebook for birthdays and send scheduled messages
            </p>
          </div>

          {/* Status Information */}
          <div className="mb-4 p-3 bg-blue-50 rounded">
            <h3 className="text-sm font-semibold mb-2">Status</h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Automation:</span>
                <span className={config.enabled ? 'text-green-600 font-medium' : 'text-gray-500'}>
                  {config.enabled ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Last check:</span>
                <span className="text-textPrimary">{formatDate(config.lastCheck)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Next check:</span>
                <span className="text-gray-800">
                  {config.enabled ? formatDate(config.nextCheck) : 'N/A'}
                </span>
              </div>
            </div>
          </div>

          {/* Emergency Stop */}
          <div className="mb-4">
            {emergencyStop.active ? (
              <div className="p-3 bg-red-50 border border-red-300 rounded mb-2">
                <p className="text-sm font-semibold text-red-700 mb-1">⚠️ Emergency Stop Active</p>
                <p className="text-xs text-red-600 mb-2">
                  All automation is paused.
                  {emergencyStop.cooldownUntil && (
                    <> Cooldown until {formatDate(emergencyStop.cooldownUntil)}.</>
                  )}
                </p>
                <button
                  onClick={handleClearEmergencyStop}
                  className="px-3 py-1.5 text-sm bg-white border border-red-300 text-red-700 rounded hover:bg-red-50"
                >
                  Clear Emergency Stop
                </button>
              </div>
            ) : (
              <button
                onClick={handleEmergencyStop}
                className="w-full px-4 py-3 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors"
              >
                🛑 Pause All Activity
              </button>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Immediately stops all automation and sets a 24-hour cooldown.
            </p>
          </div>

          {/* Confirmation Mode */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">
              Send Confirmation Mode{' '}
              <HelpTooltip label="Controls whether you're asked to confirm messages before they're sent. 'Each message' is safest and asks every time. 'Per session' asks once per automation run. 'Auto' may send without asking each time and carries higher ban risk." />
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'each' as const, label: 'Each message' },
                { value: 'session' as const, label: 'Per session' },
                { value: 'auto' as const, label: 'Auto (riskier)' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleConfirmModeChange(opt.value)}
                  className={`px-3 py-2 text-xs rounded ${
                    confirmMode === opt.value
                      ? 'bg-orangeStrong text-white'
                      : 'bg-gray-100 hover:bg-gray-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Rate Limits */}
          {rateLimits && (
            <div className="mb-4 p-3 bg-gray-50 rounded">
              <h3 className="text-sm font-semibold mb-2">Rate Limits</h3>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Hourly:</span>
                  <span
                    className={
                      rateLimits.hourly.used >= rateLimits.hourly.cap
                        ? 'text-red-600 font-medium'
                        : 'text-textPrimary'
                    }
                  >
                    {rateLimits.hourly.used} / {rateLimits.hourly.cap}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Daily:</span>
                  <span
                    className={
                      rateLimits.daily.used >= rateLimits.daily.cap
                        ? 'text-red-600 font-medium'
                        : 'text-textPrimary'
                    }
                  >
                    {rateLimits.daily.used} / {rateLimits.daily.cap}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Weekly:</span>
                  <span
                    className={
                      rateLimits.weekly.used >= rateLimits.weekly.cap
                        ? 'text-red-600 font-medium'
                        : 'text-textPrimary'
                    }
                  >
                    {rateLimits.weekly.used} / {rateLimits.weekly.cap}
                  </span>
                </div>
              </div>
              {!rateLimits.allowed && rateLimits.reason && (
                <p className="text-xs text-red-600 mt-2 font-medium">{rateLimits.reason}</p>
              )}
            </div>
          )}

          {/* Manual Trigger */}
          <button onClick={handleRunNow} className="btn-primary btn-block mb-3">
            Run Check Now
          </button>

          {/* Max Messages */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">
              Max Messages Per Run{' '}
              <HelpTooltip label="Set to 0 for unlimited. Limits how many birthday messages are sent per automation run to stay within safe activity levels." />
            </label>
            <div className="flex gap-2 items-center">
              <input
                type="number"
                min={0}
                max={100}
                value={config.maxMessages}
                onChange={(e) => handleUpdateMaxMessages(parseInt(e.target.value) || 0)}
                disabled={isSaving}
                className="w-24 px-3 py-2 rounded-lg focus:outline-none bg-white shadow-sm focus:shadow-lg transition-shadow"
              />
              <span className="text-sm text-gray-500">
                {config.maxMessages === 0 ? '(unlimited)' : `per run`}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Set to 0 for no limit. Useful to avoid sending too many messages at once.
            </p>
          </div>

          {/* Per-Action Delay */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Delay Between Actions</label>
            <div className="flex gap-3 items-center">
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={actionDelayMinutes}
                onChange={async (e) => {
                  const val = parseInt(e.target.value, 10);
                  setActionDelayMinutes(val);
                  await chrome.storage.local.set({ [ACTION_DELAY_KEY]: val });
                }}
                className="flex-1"
                aria-label="Delay between actions in minutes"
              />
              <span className="text-sm font-semibold text-textPrimary w-16 text-right">
                {actionDelayMinutes} min{actionDelayMinutes > 1 ? 's' : ''}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Wait 1–5 minutes between each automated send to mimic human behaviour.
            </p>
          </div>

          {/* Clear Sent Today */}
          <button
            onClick={handleClearSentToday}
            disabled={isSaving}
            className="btn-secondary btn-block mb-3"
          >
            Clear Sent-Today List
          </button>
          <p className="text-xs text-gray-500 mb-4">
            Resets the deduplication list so automation can re-send to contacts already processed
            today.
          </p>

          {/* Activity Log */}
          <div className="mb-4">
            <button
              onClick={() => setShowLog(!showLog)}
              className="w-full text-left text-sm font-medium text-gray-700 flex items-center justify-between p-2 bg-gray-50 rounded hover:bg-gray-100"
            >
              <span>Activity Log ({activityLog.length})</span>
              <span className="text-xs">{showLog ? '▲' : '▼'}</span>
            </button>
            {showLog && (
              <div className="mt-2">
                {activityLog.length === 0 ? (
                  <p className="text-xs text-gray-500 p-2">No activity recorded yet.</p>
                ) : (
                  <div className="max-h-48 overflow-y-auto border rounded">
                    {activityLog.map((entry, i) => (
                      <div
                        key={i}
                        className={`px-3 py-2 text-xs border-b last:border-b-0 ${
                          entry.level === 'emergency'
                            ? 'bg-red-50 text-red-700'
                            : entry.level === 'warning'
                            ? 'bg-yellow-50 text-yellow-700'
                            : entry.level === 'error'
                            ? 'bg-red-50 text-red-600'
                            : entry.level === 'send' || entry.level === 'post'
                            ? 'bg-green-50 text-green-700'
                            : 'bg-white text-gray-600'
                        }`}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <span className="flex-1">{entry.message}</span>
                          <span className="text-gray-400 whitespace-nowrap">
                            {new Date(entry.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {activityLog.length > 0 && (
                  <button
                    onClick={handleClearActivityLog}
                    className="mt-2 text-xs text-gray-500 hover:text-gray-700 underline"
                  >
                    Clear log
                  </button>
                )}
              </div>
            )}
          </div>

          {showClose && (
            <button onClick={onClose} className="btn-secondary btn-block">
              Close
            </button>
          )}
        </>
      )}
    </div>
  );
}
