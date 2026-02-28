import { useEffect, useState } from 'react';
import Spinner from './Spinner';
import MessageQueue from './MessageQueue';
import MessageHistory from './MessageHistory';
import { useMessageHistory, useMessageQueue } from '../hooks/useMessages';
import DashboardStatsCard from './DashboardStatsCard';
import DashboardCharts from './DashboardCharts';
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
  const [activePanel, setActivePanel] = useState<'queue' | 'history'>('queue');
  const { trends: computeHistoryTrends, live: historyLive } = useMessageHistory();
  const { live: queueLive } = useMessageQueue();

  useEffect(() => {
    loadStats();

    // Subscribe to real-time dashboard updates
    const unsubscribeDashboard = wsClient.on('dashboard_update', (data) => {
      console.log('[Dashboard] Real-time update:', data);
      setStats(data as DashboardStats);
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
          className="btn-orange flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg shadow-sm transition-colors"
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
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
              📊 Message Statistics
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              <DashboardStatsCard
                title="Total Sent"
                value={stats.total_messages_sent}
                variant="blue"
              />
              <DashboardStatsCard title="Today" value={stats.messages_sent_today} variant="green" />
              <DashboardStatsCard
                title="This Week"
                value={stats.messages_sent_this_week}
                variant="purple"
              />
              <DashboardStatsCard
                title="This Month"
                value={stats.messages_sent_this_month}
                variant="pink"
              />
              <DashboardStatsCard
                title="Failed"
                value={(() => {
                  try {
                    // use history stats for failed count
                    // eslint-disable-next-line react-hooks/rules-of-hooks
                    const { stats: historyStats } = useMessageHistory();
                    return historyStats?.failed ?? 0;
                  } catch {
                    return 0;
                  }
                })()}
                variant="red"
              />
            </div>

            <div className="mt-4">
              <DashboardCharts {...computeHistoryTrends(7)} />
              <div className="text-xs text-gray-500 mt-2">
                Live: {historyLive || queueLive ? 'on' : 'off'}
              </div>
            </div>
          </div>

          {/* Upcoming & Queue */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
              🎂 Upcoming Activity
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="text-xs text-amber-700 font-semibold mb-2 uppercase tracking-wide">
                  🎉 Upcoming
                </div>
                <div className="text-3xl font-bold text-amber-900">
                  {stats.friends_with_upcoming_birthdays}
                </div>
                <div className="text-xs text-amber-600 mt-1">birthdays</div>
              </div>
              <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="text-xs text-orange-700 font-semibold mb-2 uppercase tracking-wide">
                  📬 In Queue
                </div>
                <div className="text-3xl font-bold text-orange-900">{stats.queued_messages}</div>
                <div className="text-xs text-orange-600 mt-1">messages</div>
              </div>
            </div>
          </div>

          {/* Automation Status */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
              ⚙️ Automation Status
            </h3>
            <div
              className={`rounded-lg p-5 shadow-md ${
                stats.automation_enabled
                  ? 'bg-gradient-to-br from-green-50 to-emerald-100'
                  : 'bg-gradient-to-br from-gray-50 to-gray-100'
              }`}
            >
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

      {/* (removed duplicate unified layout) */}
    </div>
  );
}
