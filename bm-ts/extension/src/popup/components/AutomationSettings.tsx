import { useEffect, useState } from 'react';
import Spinner from './Spinner';
import { getErrorMessage, logError } from '../../utils/errors';

interface AutomationConfig {
  enabled: boolean;
  checkInterval: number; // minutes
  lastCheck: string | null;
  nextCheck: string | null;
  maxMessages: number; // 0 = unlimited
}

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

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    setIsLoading(true);
    setError(null);
    try {
      const data = await chrome.runtime.sendMessage({
        type: 'automation.getConfig',
      });
      if (data) {
        setConfig(data);
      }
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
      const result = await chrome.runtime.sendMessage({
        type: 'automation.scanFacebook',
      });
      setMessage(result.success ? 'Scan triggered successfully' : 'No Facebook tab found');
      await loadConfig(); // Refresh to get updated lastCheck
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

      {error && <div className="error mb-3">{error}</div>}
      {message && <div className="success mb-3">{message}</div>}

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

          {/* Manual Trigger */}
          <button onClick={handleRunNow} className="btn-primary btn-block mb-3">
            Run Check Now
          </button>

          {/* Max Messages */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">
              Max Messages Per Run
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
              <span className="text-sm text-gray-500">{config.maxMessages === 0 ? '(unlimited)' : `per run`}</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Set to 0 for no limit. Useful to avoid sending too many messages at once.
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
            Resets the deduplication list so automation can re-send to contacts already processed today.
          </p>

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
