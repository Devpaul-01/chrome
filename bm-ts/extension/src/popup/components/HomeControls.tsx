import { useEffect, useState } from 'react';
import { sendBackgroundMessage } from '../api';
import type { MessageGroup } from './MessageGroups';
import Spinner from './Spinner';

const FEATURE_FLAGS_KEY = 'bm_feature_flags';
const ACTIVE_GROUP_KEY = 'bm_active_group_id';

interface FeatureFlags {
  makePost: boolean;
  sendMessage: boolean;
}

interface HomeControlsProps {
  contactCount: number;
  onViewCalendar: () => void;
  onViewAnalytics: () => void;
  userName: string;
}

export default function HomeControls({
  contactCount,
  onViewCalendar,
  onViewAnalytics,
  userName,
}: HomeControlsProps) {
  const [automationEnabled, setAutomationEnabled] = useState(false);
  const [flags, setFlags] = useState<FeatureFlags>({ makePost: true, sendMessage: true });
  const [groups, setGroups] = useState<MessageGroup[]>([]);
  const [activeGroupId, setActiveGroupId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadState();
  }, []);

  async function loadState() {
    setIsLoading(true);
    setError(null);
    try {
      const [config, groupData, stored] = await Promise.all([
        chrome.runtime.sendMessage({ type: 'automation.getConfig' }),
        sendBackgroundMessage<MessageGroup[]>({ type: 'messageGroups.list' }).catch(
          () => [] as MessageGroup[],
        ),
        chrome.storage.local.get([FEATURE_FLAGS_KEY, ACTIVE_GROUP_KEY]),
      ]);
      setAutomationEnabled(config?.enabled ?? false);
      setGroups(Array.isArray(groupData) ? groupData : []);
      if (stored[FEATURE_FLAGS_KEY]) setFlags(stored[FEATURE_FLAGS_KEY] as FeatureFlags);
      if (stored[ACTIVE_GROUP_KEY]) setActiveGroupId(stored[ACTIVE_GROUP_KEY] as string);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }

  async function toggleMasterPower(enabled: boolean) {
    setIsSaving(true);
    setError(null);
    try {
      await chrome.runtime.sendMessage({ type: 'automation.setEnabled', payload: { enabled } });
      setAutomationEnabled(enabled);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  }

  async function updateFlag(key: keyof FeatureFlags, value: boolean) {
    const next = { ...flags, [key]: value };
    setFlags(next);
    await chrome.storage.local.set({ [FEATURE_FLAGS_KEY]: next });
  }

  async function updateActiveGroup(id: string) {
    setActiveGroupId(id);
    await chrome.storage.local.set({ [ACTIVE_GROUP_KEY]: id });
  }

  if (isLoading) {
    return (
      <div className="tab-content flex items-center justify-center py-10">
        <Spinner size="md" />
      </div>
    );
  }

  return (
    <div role="tabpanel" id="home-panel" className="tab-content space-y-4">
      {error && <div className="error" role="alert">{error}</div>}

      {/* Welcome */}
      <div className="card text-center">
        <h2 className="text-xl font-bold text-blueStrong mb-1">Welcome, {userName}!</h2>
        <p className="text-textMuted text-sm">
          Manage your birthday messages and social posts all in one place
        </p>
      </div>

      {/* Master Power Toggle */}
      <div
        className={`card power-card ${automationEnabled ? 'power-card--on' : 'power-card--off'}`}
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-textPrimary leading-tight">Automation Engine</h3>
            <p className="text-xs text-textMuted mt-1">
              {automationEnabled
                ? 'Running — birthday messages will be sent automatically'
                : 'Paused — no messages will be sent'}
            </p>
          </div>
          <button
            role="switch"
            aria-checked={automationEnabled}
            aria-label="Toggle automation engine"
            disabled={isSaving}
            onClick={() => toggleMasterPower(!automationEnabled)}
            className={`power-toggle ${automationEnabled ? 'power-toggle--on' : ''}`}
          >
            {automationEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* Feature Switches */}
      <div className="card space-y-3">
        <h3 className="text-sm font-bold text-textPrimary">Feature Switches</h3>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-textPrimary">Send Message</p>
            <p className="text-xs text-textMuted">Send DMs to birthday contacts</p>
          </div>
          <button
            role="switch"
            aria-checked={flags.sendMessage}
            aria-label="Toggle send message"
            onClick={() => updateFlag('sendMessage', !flags.sendMessage)}
            className={`feature-toggle ${flags.sendMessage ? 'feature-toggle--on' : ''}`}
          >
            <span className="feature-toggle-thumb" />
          </button>
        </div>

        <div className="border-t border-gray-100" />

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-textPrimary">Make Post</p>
            <p className="text-xs text-textMuted">Post on birthday contacts&apos; timelines</p>
          </div>
          <button
            role="switch"
            aria-checked={flags.makePost}
            aria-label="Toggle make post"
            onClick={() => updateFlag('makePost', !flags.makePost)}
            className={`feature-toggle ${flags.makePost ? 'feature-toggle--on' : ''}`}
          >
            <span className="feature-toggle-thumb" />
          </button>
        </div>
      </div>

      {/* Active Message Group Selector */}
      <div className="card">
        <label className="block">
          <span className="text-sm font-bold text-textPrimary mb-2 block">
            Active Message Group
          </span>
          {groups.length === 0 ? (
            <p className="text-xs text-textMuted">
              No groups yet — create one under Messages → Templates.
            </p>
          ) : (
            <select
              value={activeGroupId}
              onChange={(e) => updateActiveGroup(e.target.value)}
              className="text-field w-full"
            >
              <option value="">— Select a group —</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.gender})
                </option>
              ))}
            </select>
          )}
        </label>
      </div>

      {/* Quick Stats */}
      <div className="card">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-blueStrong">{contactCount}</div>
            <div className="text-xs text-textMuted">Contacts</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-blueStrong">{groups.length}</div>
            <div className="text-xs text-textMuted">Groups</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-orangeStrong">{contactCount}</div>
            <div className="text-xs text-textMuted">Birthdays</div>
          </div>
        </div>
      </div>

      {/* Shortcuts */}
      <button onClick={onViewCalendar} className="btn w-full">
        View Birthday Calendar
      </button>
      <button onClick={onViewAnalytics} className="btn-primary btn-block">
        View Analytics
      </button>
    </div>
  );
}
