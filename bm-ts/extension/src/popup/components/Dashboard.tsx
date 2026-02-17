import { useEffect, useState } from 'react';
import Spinner from './Spinner';
import { getErrorMessage, logError } from '../../utils/errors';
import wsClient from '../../api/websocket';

export interface DashboardStats {
  total_messages_sent: number;
  messages_sent_today: number;
  messages_sent_this_week: number;
  messages_sent_this_month: number;
  success_rate: number;
  friends_with_upcoming_birthdays: number;
  queued_messages: number;
  automation_enabled: boolean;
  next_scheduled_check?: string;
}

interface DashboardProps {
  onClose: () => void;
}

export default function Dashboard({ onClose }: DashboardProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStats();

    // Subscribe to real-time dashboard updates
    const unsubscribeDashboard = wsClient.on('dashboard_update', (data) => {
      console.log('[Dashboard] Real-time update:', data);
      setStats(data);
    });

    // Also listen to message updates to refresh stats
    const unsubscribeQueue = wsClient.on('message_queue_update', () => {
      // Refresh stats when queue changes
      loadStats();
    });

    const unsubscribeHistory = wsClient.on('message_history_update', () => {
      // Refresh stats when history changes
      loadStats();
    });

    // Cleanup: unsubscribe when component unmounts
    return () => {
      unsubscribeDashboard();
      unsubscribeQueue();
      unsubscribeHistory();
    };
  }, []);

  async function loadStats() {
    setIsLoading(true);
    setError(null);
    try {
      const data = await chrome.runtime.sendMessage({
        type: 'dashboard.getStats',
      });
      setStats(data);
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      logError(err, 'Dashboard:loadStats');
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }

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

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-blueStrong">Analytics</h2>
        <button
          onClick={loadStats}
          className="flex items-center gap-2 text-sm font-medium text-orangeBrand hover:text-orangeStrong transition-colors px-3 py-2 rounded-lg hover:bg-orange-50"
          aria-label="Refresh statistics"
          title="Refresh Stats"
        >
          <span>🔄</span>
          Refresh
        </button>
      </div>

      {error && <div className="error mb-5">{error}</div>}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : !stats ? (
        <p className="text-sm text-gray-500 text-center py-8">Unable to load statistics</p>
      ) : (
        <>
          {/* Success Rate Hero */}
          <div className="bg-gradient-to-br from-orange-500 to-amber-600 text-white rounded-xl p-8 mb-6 text-center shadow-lg">
            <div className="text-xs opacity-90 font-semibold uppercase tracking-wider mb-3">
              ✨ Success Rate
            </div>
            <div className="text-6xl font-extrabold mb-2">{stats.success_rate}%</div>
            <div className="text-xs opacity-75">Messages delivered successfully</div>
          </div>

          {/* Messages Stats Grid */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">📊 Message Statistics</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 text-center shadow-sm hover:shadow-md transition-shadow">
                <div className="text-xs text-blue-700 font-semibold mb-1 uppercase tracking-wide">Total Sent</div>
                <div className="text-3xl font-bold text-blue-900">{stats.total_messages_sent}</div>
              </div>
              <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 text-center shadow-sm hover:shadow-md transition-shadow">
                <div className="text-xs text-green-700 font-semibold mb-1 uppercase tracking-wide">⭐ Today</div>
                <div className="text-3xl font-bold text-green-900">{stats.messages_sent_today}</div>
              </div>
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 text-center shadow-sm hover:shadow-md transition-shadow">
                <div className="text-xs text-purple-700 font-semibold mb-1 uppercase tracking-wide">This Week</div>
                <div className="text-3xl font-bold text-purple-900">
                  {stats.messages_sent_this_week}
                </div>
              </div>
              <div className="bg-gradient-to-br from-pink-50 to-pink-100 rounded-lg p-4 text-center shadow-sm hover:shadow-md transition-shadow">
                <div className="text-xs text-pink-700 font-semibold mb-1 uppercase tracking-wide">This Month</div>
                <div className="text-3xl font-bold text-pink-900">
                  {stats.messages_sent_this_month}
                </div>
              </div>
            </div>
          </div>

          {/* Upcoming & Queue */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">🎂 Upcoming Activity</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="text-xs text-amber-700 font-semibold mb-2 uppercase tracking-wide">🎉 Upcoming</div>
                <div className="text-3xl font-bold text-amber-900">
                  {stats.friends_with_upcoming_birthdays}
                </div>
                <div className="text-xs text-amber-600 mt-1">birthdays</div>
              </div>
              <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="text-xs text-orange-700 font-semibold mb-2 uppercase tracking-wide">📬 In Queue</div>
                <div className="text-3xl font-bold text-orange-900">{stats.queued_messages}</div>
                <div className="text-xs text-orange-600 mt-1">messages</div>
              </div>
            </div>
          </div>

          {/* Automation Status */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">⚙️ Automation Status</h3>
            <div className={`rounded-lg p-5 shadow-md ${
              stats.automation_enabled 
                ? 'bg-gradient-to-br from-green-50 to-emerald-100' 
                : 'bg-gradient-to-br from-gray-50 to-gray-100'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-gray-800">Status</span>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
                    stats.automation_enabled 
                      ? 'bg-green-500 text-white shadow-sm' 
                      : 'bg-gray-400 text-white shadow-sm'
                  }`}
                >
                  {stats.automation_enabled ? '✓ Active' : '○ Inactive'}
                </span>
              </div>
              {stats.automation_enabled && (
                <div className="bg-white bg-opacity-70 rounded-lg px-4 py-3">
                  <div className="text-xs text-gray-600 font-medium mb-1">Next Scheduled Check</div>
                  <div className="text-sm font-bold text-green-800">
                    {formatNextCheck(stats.next_scheduled_check)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <button onClick={onClose} className="btn-secondary btn-block mt-6 font-semibold">
        ← Back to Home
      </button>
    </div>
  );
}
