import { useEffect, useState } from 'react';
import Spinner from './Spinner';
import { getErrorMessage, logError } from '../../utils/errors';
import wsClient from '../../api/websocket';

export interface MessageHistoryItem {
  id: string;
  friend_name: string;
  friend_profile_url: string;
  birthday_date: string;
  message_content: string;
  sent_at: string;
  status: 'sent' | 'delivered' | 'failed';
  error_message?: string;
}

interface MessageHistoryProps {
  onClose: () => void;
}

export default function MessageHistory({ onClose }: MessageHistoryProps) {
  const [messages, setMessages] = useState<MessageHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'sent' | 'delivered' | 'failed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadHistory();

    // Subscribe to real-time message history updates
    const unsubscribe = wsClient.on('message_history_update', (data) => {
      console.log('[MessageHistory] Real-time update:', data);

      if (data.action === 'deleted') {
        // Remove the message from the list
        setMessages((prev) => prev.filter((m) => m.id !== data.message.id));
      } else if (data.action === 'created') {
        // Reload history to get the new message
        loadHistory();
      }
    });

    // Cleanup: unsubscribe when component unmounts
    return () => {
      unsubscribe();
    };
  }, []);

  async function loadHistory() {
    setIsLoading(true);
    setError(null);
    try {
      const data = await chrome.runtime.sendMessage({
        type: 'messages.listHistory',
      });
      setMessages(Array.isArray(data) ? data : []);
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      logError(err, 'MessageHistory:loadHistory');
      setError(errorMessage);
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDeleteMessage(id: string) {
    if (!confirm('Are you sure you want to delete this history item?')) {
      return;
    }
    setError(null);
    try {
      await chrome.runtime.sendMessage({
        type: 'messages.deleteHistory',
        payload: { id },
      });
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      logError(err, 'MessageHistory:handleDeleteMessage');
      setError(errorMessage);
    }
  }

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

  const filteredMessages = messages
    .filter((m) => filterStatus === 'all' || m.status === filterStatus)
    .filter(
      (m) => searchQuery === '' || m.friend_name.toLowerCase().includes(searchQuery.toLowerCase()),
    )
    .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime());

  const stats = {
    total: messages.length,
    sent: messages.filter((m) => m.status === 'sent').length,
    delivered: messages.filter((m) => m.status === 'delivered').length,
    failed: messages.filter((m) => m.status === 'failed').length,
  };

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-3">Message History</h2>

      {error && <div className="error mb-3">{error}</div>}

      {/* Stats summary */}
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

      {/* Filters */}
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
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {filteredMessages.map((message) => (
            <div
              key={message.id}
              className="border rounded p-3 bg-white hover:shadow-sm transition"
            >
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
                    <label className="text-xs font-medium text-gray-600 block mb-1">Message:</label>
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
                      onClick={() => handleDeleteMessage(message.id)}
                      className="flex-1 bg-red-500 text-white text-xs py-2 px-3 rounded hover:bg-red-600"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 mt-4">
        <button onClick={loadHistory} className="btn-secondary flex-1">
          Refresh
        </button>
        <button onClick={onClose} className="btn-primary flex-1">
          Close
        </button>
      </div>
    </div>
  );
}
