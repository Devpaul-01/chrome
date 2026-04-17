import { useEffect, useState } from 'react';
import { sendBackgroundMessage } from '../api';
import type { DashboardStats } from './Dashboard';
import Spinner from './Spinner';
import HelpTooltip from './HelpTooltip';
import FeatureTip from './FeatureTip';

interface HomeControlsProps {
  // onViewCalendar: () => void; // Uncomment to re-enable Birthday Calendar
  onViewAnalytics: () => void;
  onViewUpcomingBirthdays: () => void;
  onViewContacts: () => void;
  userName: string;
}

export default function HomeControls({
  onViewAnalytics,
  onViewUpcomingBirthdays,
  onViewContacts,
  userName,
}: HomeControlsProps) {
  const [automationEnabled, setAutomationEnabled] = useState(false);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
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
      const [config, stats] = await Promise.all([
        sendBackgroundMessage<{ enabled: boolean }>({ type: 'automation.getConfig' }),
        sendBackgroundMessage<DashboardStats>({ type: 'dashboard.getStats' }).catch(() => null),
      ]);
      setAutomationEnabled(config?.enabled ?? false);
      setDashboardStats(stats);
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
      await sendBackgroundMessage({ type: 'automation.setEnabled', payload: { enabled } });
      setAutomationEnabled(enabled);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  }

  // async function updateActiveGroup(id: string) { // Commented out — feature not currently needed
  //   setActiveGroupId(id);
  //   await chrome.storage.local.set({ [ACTIVE_GROUP_KEY]: id });
  // }

  function formatNextCheck(dateString?: string): string {
    if (!dateString) return 'Not scheduled';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return 'Soon';
    if (diffMins < 60) return `in ${diffMins}m`;
    if (diffHours < 24) return `in ${diffHours}h`;

    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      {/* Welcome */}
      <div className="card text-center">
        <h2 className="text-xl font-bold text-blueStrong mb-1">Welcome, {userName}!</h2>
        <p className="text-textMuted text-sm">
          Manage your birthday messages and social posts all in one place
        </p>
      </div>

      <FeatureTip
        tipId="home_automation"
        message="Enable automation on this page to start sending birthday messages automatically. Make sure you have at least one template and schedule configured."
      />

      {/* Master Power Toggle */}
      <div
        className={`card power-card ${automationEnabled ? 'power-card--on' : 'power-card--off'}`}
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-textPrimary leading-tight">
              Automation Engine{' '}
              <HelpTooltip label="When enabled, the extension automatically checks Facebook for birthdays and sends messages on your behalf at the interval you've configured in Scheduling." />
            </h3>
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

      {/* Inline Dashboard Summary */}
      {dashboardStats && (
        <div className="card">
          <h3 className="text-sm font-bold text-textPrimary mb-3">
            Today&apos;s Summary{' '}
            <HelpTooltip label="A quick snapshot of today's messaging activity. Click 'Analytics' below for detailed stats and charts." />
          </h3>
          <div className="grid grid-cols-3 gap-3 text-center mb-3">
            <div>
              <div className="text-2xl font-bold text-blueStrong">
                {dashboardStats.messages_sent_today}
              </div>
              <div className="text-xs text-textMuted">Sent Today</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-orangeStrong">
                {dashboardStats.success_rate}%
              </div>
              <div className="text-xs text-textMuted">Success</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blueStrong">
                {dashboardStats.queued_messages}
              </div>
              <div className="text-xs text-textMuted">In Queue</div>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-textMuted border-t border-gray-100 pt-2">
            <span>
              🎂 {dashboardStats.friends_with_upcoming_birthdays} upcoming birthday
              {dashboardStats.friends_with_upcoming_birthdays !== 1 ? 's' : ''}
            </span>
            <span>
              Next check:{' '}
              {automationEnabled ? formatNextCheck(dashboardStats.next_scheduled_check) : 'Off'}{' '}
              <HelpTooltip label="The next time the extension will scan Facebook for birthdays. Requires Chrome to be open and Facebook to be logged in." />
            </span>
          </div>
        </div>
      )}

      {/* Active Message Group Selector — commented out, feature not currently needed */}
      {/* <div className="card">
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
      </div> */}

      {/* Quick Actions Grid — Open Facebook, Contacts, Analytics, Birthdays */}
      <div className="messages-hub-grid">
        <a
          href="https://www.facebook.com/friends/birthdays"
          target="_blank"
          rel="noopener noreferrer"
          className="messages-hub-card messages-hub-card--blue"
          aria-label="Open Facebook Birthdays"
        >
          <span className="messages-hub-icon">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
            </svg>
          </span>
          <span className="messages-hub-label">Facebook</span>
          <span className="messages-hub-desc">Open birthdays page</span>
        </a>

        <button
          onClick={onViewContacts}
          className="messages-hub-card messages-hub-card--green"
          aria-label="View Contacts"
        >
          <span className="messages-hub-icon">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </span>
          <span className="messages-hub-label">Contacts</span>
          <span className="messages-hub-desc">Manage contacts</span>
        </button>

        <button
          onClick={onViewAnalytics}
          className="messages-hub-card messages-hub-card--orange"
          aria-label="Analytics"
        >
          <span className="messages-hub-icon">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
              <line x1="2" y1="20" x2="22" y2="20" />
            </svg>
          </span>
          <span className="messages-hub-label">Analytics</span>
          <span className="messages-hub-desc">View message stats</span>
        </button>
        <button
          onClick={onViewUpcomingBirthdays}
          className="messages-hub-card messages-hub-card--blue"
          aria-label="Upcoming Birthdays"
        >
          <span className="messages-hub-icon">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M4 21v-2a4 4 0 0 1 3-3.87" />
              <circle cx="12" cy="7" r="4" />
              <path d="M12 2v1" />
              <path d="M9 4l3-2 3 2" />
            </svg>
          </span>
          <span className="messages-hub-label">Birthdays</span>
          <span className="messages-hub-desc">Upcoming birthdays</span>
        </button>
      </div>
    </div>
  );
}
