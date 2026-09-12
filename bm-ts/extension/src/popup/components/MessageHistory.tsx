import { useState, useEffect, useRef } from 'react';
import Spinner from './Spinner';
import { useMessageHistory, MessageHistoryItem } from '../hooks/useMessages';
import { trapFocus, handleEscapeKey } from '../../utils/accessibility';
import { getTokens, getBackendUrl } from '../../utils/storage';
import { exportHistoryCsv } from '../../api/client';
import HelpTooltip from './HelpTooltip';
import FeatureTip from './FeatureTip';

interface MessageHistoryProps {
  onClose: () => void;
  compact?: boolean;
}

export default function MessageHistory({
  onClose: _onClose,
  compact = false,
}: MessageHistoryProps) {
  const {
    isLoading,
    error,
    filterStatus,
    setFilterStatus,
    searchQuery,
    setSearchQuery,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    expandedId,
    setExpandedId,
    loadHistory,
    deleteMessage,
    filteredMessages,
    stats,
    page,
    totalItems,
    totalPages,
    goToPage,
  } = useMessageHistory();

  const [detailMessage, setDetailMessage] = useState<MessageHistoryItem | null>(null);
  const detailDialogRef = useRef<HTMLDivElement>(null);

  // Trap focus and handle Escape key when detail modal is open
  useEffect(() => {
    if (!detailMessage || !detailDialogRef.current) return;
    const cleanupTrap = trapFocus(detailDialogRef.current);
    const escHandler = handleEscapeKey(() => setDetailMessage(null));
    document.addEventListener('keydown', escHandler);
    const handleOutsideClick = (e: MouseEvent) => {
      if (detailDialogRef.current && !detailDialogRef.current.contains(e.target as Node)) {
        setDetailMessage(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    detailDialogRef.current.querySelector<HTMLElement>('button')?.focus();
    return () => {
      cleanupTrap();
      document.removeEventListener('keydown', escHandler);
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [detailMessage]);

  function formatDateTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  }

  function getStatusBadge(status: MessageHistoryItem['status']) {
    const styles = {
      sent: 'bg-blue-100 text-blue-800',
      delivered: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
    };
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${styles[status]}`}>{status}</span>
    );
  }

  function exportCsv() {
    const header = ['Name', 'Status', 'Sent At', 'Birthday', 'Message', 'Error'];
    const rows = filteredMessages.map((m) => [
      m.friend_name,
      m.status,
      new Date(m.sent_at).toLocaleString(),
      new Date(m.birthday_date).toLocaleDateString(),
      `"${(m.message_content ?? '').replace(/"/g, '""')}"`,
      m.error_message ?? '',
    ]);
    const csv = [header, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `message-history-page${page}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportAllCsv() {
    try {
      const { accessToken } = await getTokens();
      const baseUrl = await getBackendUrl();
      if (!accessToken) return;
      const blob = await exportHistoryCsv(baseUrl, accessToken);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'message_history.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Silently fall back — user can still export current page
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">
          Message History{' '}
          <HelpTooltip label="A log of all messages sent by the extension. Use filters to find specific messages. 'Export all' downloads your complete history as a CSV file." />
        </h2>
        {!compact && filteredMessages.length > 0 && (
          <div className="flex gap-2">
            <button
              onClick={exportAllCsv}
              className="text-xs text-blueStrong hover:text-orangeStrong underline"
              aria-label="Export all history to CSV"
            >
              Export All
            </button>
            <button
              onClick={exportCsv}
              className="text-xs text-blueStrong hover:text-orangeStrong underline"
              aria-label="Export current page to CSV"
            >
              Export Page
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="error mb-3" role="alert">
          {error}
        </div>
      )}

      {/* Stats summary */}
      {!compact && (
        <>
          <FeatureTip
            tipId="history_overview"
            message="Review your sent messages and track delivery status. Use the search and filters to find specific messages, or export to CSV for your records."
          />
          <div className="grid grid-cols-4 gap-2 mb-4 text-center">
            <div className="p-2 bg-gray-50 rounded">
              <div className="text-xl font-bold text-blueStrong">{stats.total}</div>
              <div className="text-xs text-gray-600">Total</div>
            </div>
            <div className="p-2 bg-blue-50 rounded">
              <div className="text-xl font-bold text-blue-600">{stats.sent}</div>
              <div className="text-xs text-gray-600">Sent</div>
            </div>
            <div className="p-2 bg-green-50 rounded">
              <div className="text-xl font-bold text-green-600">{stats.delivered}</div>
              <div className="text-xs text-gray-600">Delivered</div>
            </div>
            <div className="p-2 bg-red-50 rounded">
              <div className="text-xl font-bold text-red-600">{stats.failed}</div>
              <div className="text-xs text-gray-600">Failed</div>
            </div>
          </div>
        </>
      )}

      {/* Filters */}
      {!compact && (
        <div className="mb-3 space-y-2">
          <input
            type="text"
            placeholder="Search by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field"
            aria-label="Search by name"
          />

          {/* Date range */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label htmlFor="startDate" className="text-xs text-gray-500 block mb-0.5">
                From
              </label>
              <input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full text-xs border rounded px-2 py-1.5 bg-white"
                aria-label="Start date"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="endDate" className="text-xs text-gray-500 block mb-0.5">
                To
              </label>
              <input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full text-xs border rounded px-2 py-1.5 bg-white"
                aria-label="End date"
              />
            </div>
            {(startDate || endDate) && (
              <button
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                }}
                className="self-end text-xs text-gray-400 hover:text-gray-600 px-1 pb-1"
                aria-label="Clear date range"
              >
                ✕
              </button>
            )}
          </div>

          {/* Status buttons */}
          <div className="flex gap-2">
            {(['all', 'sent', 'delivered', 'failed'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`flex-1 text-xs py-2 rounded ${
                  filterStatus === status
                    ? 'bg-orangeStrong text-white'
                    : 'bg-gray-100 hover:bg-gray-200'
                }`}
              >
                {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner size="lg" />
        </div>
      ) : filteredMessages.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-gray-500 mb-2">
            {searchQuery || filterStatus !== 'all' || startDate || endDate
              ? 'No matching messages'
              : 'No message history'}
          </p>
          <p className="text-xs text-gray-400">
            {searchQuery || filterStatus !== 'all' || startDate || endDate
              ? 'Try adjusting your filters'
              : 'Sent messages will appear here'}
          </p>
        </div>
      ) : (
        <div
          className={
            compact ? 'space-y-1 max-h-72 overflow-y-auto' : 'space-y-2 max-h-72 overflow-y-auto'
          }
        >
          {filteredMessages.map((message) => (
            <div
              key={message.id}
              className={`border rounded p-3 bg-white hover:shadow-sm transition ${
                compact ? 'py-2 px-3' : ''
              }`}
            >
              {compact ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{message.friend_name}</span>
                      {getStatusBadge(message.status)}
                    </div>
                    <div className="text-xs text-gray-500">{formatDateTime(message.sent_at)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={message.friend_profile_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs bg-blue-500 text-white px-2 py-1 rounded"
                    >
                      View
                    </a>
                    <button
                      onClick={() => deleteMessage(message.id)}
                      className="text-xs bg-red-500 text-white px-2 py-1 rounded"
                    >
                      Del
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Header */}
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{message.friend_name}</span>
                        {getStatusBadge(message.status)}
                      </div>
                      <div className="text-xs text-gray-500">{formatDateTime(message.sent_at)}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setDetailMessage(message)}
                        className="text-blueStrong hover:text-orangeStrong text-xs"
                        aria-label={`View details for ${message.friend_name}`}
                      >
                        Details
                      </button>
                      <button
                        onClick={() => setExpandedId(expandedId === message.id ? null : message.id)}
                        className="text-blueStrong hover:text-orangeStrong text-xs"
                      >
                        {expandedId === message.id ? 'Hide' : 'Expand'}
                      </button>
                    </div>
                  </div>

                  {/* Expanded inline panel */}
                  {expandedId === message.id && (
                    <div className="mt-3 pt-3 border-t space-y-2">
                      <div>
                        <div className="text-xs font-medium text-gray-600 block mb-1">Message:</div>
                        <div className="text-sm p-2 bg-gray-50 rounded whitespace-pre-wrap">
                          {message.message_content}
                        </div>
                      </div>

                      <div className="text-xs text-gray-600">
                        <strong>Birthday:</strong>{' '}
                        {new Date(message.birthday_date).toLocaleDateString()}
                      </div>

                      {message.error_message && (
                        <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
                          Error: {message.error_message}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2">
                        <a
                          href={message.friend_profile_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 bg-blue-500 text-white text-xs py-2 px-3 rounded hover:bg-blue-600 text-center"
                        >
                          View Profile
                        </a>
                        <button
                          onClick={() => deleteMessage(message.id)}
                          className="flex-1 bg-red-500 text-white text-xs py-2 px-3 rounded hover:bg-red-600"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination controls */}
      {!compact && totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 text-xs text-gray-600">
          <button
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1 || isLoading}
            className="px-2 py-1 border rounded disabled:opacity-40 hover:bg-gray-50"
            aria-label="Previous page"
          >
            ← Prev
          </button>
          <span aria-live="polite">
            Page {page} of {totalPages} ({totalItems} total)
          </span>
          <button
            onClick={() => goToPage(page + 1)}
            disabled={page >= totalPages || isLoading}
            className="px-2 py-1 border rounded disabled:opacity-40 hover:bg-gray-50"
            aria-label="Next page"
          >
            Next →
          </button>
        </div>
      )}

      <div className="flex gap-2 mt-4">
        <button onClick={loadHistory} className="btn-secondary flex-1">
          Refresh
        </button>
      </div>

      {/* Details modal */}
      {detailMessage && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-sm max-h-[80vh] flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-detail-title"
            ref={detailDialogRef}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <h3 id="history-detail-title" className="font-semibold text-sm">
                Message Details — {detailMessage.friend_name}
              </h3>
              <button
                onClick={() => setDetailMessage(null)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
                aria-label="Close details"
              >
                ✕
              </button>
            </div>
            <div className="p-4 overflow-y-auto space-y-3 flex-1">
              <div className="flex items-center gap-2">
                {getStatusBadge(detailMessage.status)}
                <span className="text-xs text-gray-500">
                  Sent: {new Date(detailMessage.sent_at).toLocaleString()}
                </span>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">Message</p>
                <div className="text-sm p-3 bg-gray-50 rounded whitespace-pre-wrap border">
                  {detailMessage.message_content}
                </div>
              </div>
              <div className="text-xs text-gray-600">
                <strong>Birthday:</strong>{' '}
                {new Date(detailMessage.birthday_date).toLocaleDateString()}
              </div>
              {detailMessage.error_message && (
                <div className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">
                  <strong>Error:</strong> {detailMessage.error_message}
                </div>
              )}
              <div className="text-xs">
                <a
                  href={detailMessage.friend_profile_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blueStrong underline"
                >
                  View Facebook profile ↗
                </a>
              </div>
            </div>
            <div className="p-4 border-t flex gap-2">
              <button
                onClick={() => {
                  deleteMessage(detailMessage.id);
                  setDetailMessage(null);
                }}
                className="flex-1 bg-red-500 text-white text-xs py-2 rounded hover:bg-red-600"
              >
                Delete
              </button>
              <button
                onClick={() => setDetailMessage(null)}
                className="flex-1 btn-secondary text-xs py-2"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
