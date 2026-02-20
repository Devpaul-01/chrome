import Spinner from './Spinner';
import { useMessageHistory, MessageHistoryItem } from '../hooks/useMessages';

interface MessageHistoryProps {
  onClose: () => void;
  compact?: boolean;
}

export default function MessageHistory({ onClose, compact = false }: MessageHistoryProps) {
  const {
    isLoading,
    error,
    filterStatus,
    setFilterStatus,
    searchQuery,
    setSearchQuery,
    expandedId,
    setExpandedId,
    loadHistory,
    deleteMessage,
    filteredMessages,
    stats,
  } = useMessageHistory();

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

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-3">Message History</h2>

      {error && <div className="error mb-3">{error}</div>}

      {/* Stats summary */}
      {!compact && (
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
          />
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
            {searchQuery || filterStatus !== 'all' ? 'No matching messages' : 'No message history'}
          </p>
          <p className="text-xs text-gray-400">
            {searchQuery || filterStatus !== 'all'
              ? 'Try adjusting your filters'
              : 'Sent messages will appear here'}
          </p>
        </div>
      ) : (
        <div
          className={
            compact ? 'space-y-1 max-h-72 overflow-y-auto' : 'space-y-2 max-h-80 overflow-y-auto'
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
                    <button
                      onClick={() => setExpandedId(expandedId === message.id ? null : message.id)}
                      className="text-blueStrong hover:text-orangeStrong text-xs"
                    >
                      {expandedId === message.id ? 'Hide' : 'Details'}
                    </button>
                  </div>

                  {/* Expanded details */}
                  {expandedId === message.id && (
                    <div className="mt-3 pt-3 border-t space-y-2">
                      <div>
                        <label className="text-xs font-medium text-gray-600 block mb-1">
                          Message:
                        </label>
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

      <div className="flex gap-2 mt-4">
        <button onClick={loadHistory} className="btn-secondary flex-1">
          Refresh
        </button>
      </div>
    </div>
  );
}
