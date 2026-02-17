import { useEffect, useState } from 'react';
import Spinner from './Spinner';
import { getErrorMessage, logError } from '../../utils/errors';
import wsClient from '../../api/websocket';

export interface QueuedMessage {
  id: string;
  friend_name: string;
  friend_profile_url: string;
  birthday_date: string;
  scheduled_send_time: string;
  message_content: string;
  status: 'pending' | 'processing' | 'failed';
  created_at: string;
  error_message?: string;
}

interface MessageQueueProps {
  onClose: () => void;
}

export default function MessageQueue({ onClose }: MessageQueueProps) {
  const [messages, setMessages] = useState<QueuedMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadQueue();

    // Subscribe to real-time message queue updates
    const unsubscribe = wsClient.on('message_queue_update', (data) => {
      console.log('[MessageQueue] Real-time update:', data);

      if (data.action === 'created') {
        // Reload queue to get the newly created message
        loadQueue();
      } else if (data.action === 'updated') {
        // Update the specific message in the list
        setMessages((prev) =>
          prev.map((m) => (m.id === data.message.id ? { ...m, ...data.message } : m)),
        );
        setSuccessMessage('Message updated');
      } else if (data.action === 'deleted') {
        // Remove the message from the list
        setMessages((prev) => prev.filter((m) => m.id !== data.message.id));
        setSuccessMessage('Message removed');
      }
    });

    // Cleanup: unsubscribe when component unmounts
    return () => {
      unsubscribe();
    };
  }, []);

  async function loadQueue() {
    setIsLoading(true);
    setError(null);
    try {
      const data = await chrome.runtime.sendMessage({
        type: 'messages.listQueue',
      });
      setMessages(Array.isArray(data) ? data : []);
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      logError(err, 'MessageQueue:loadQueue');
      setError(errorMessage);
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCancelMessage(id: string) {
    if (!confirm('Are you sure you want to cancel this message?')) {
      return;
    }
    setError(null);
    setSuccessMessage(null);
    try {
      await chrome.runtime.sendMessage({
        type: 'messages.cancelQueued',
        payload: { id },
      });
      setMessages((prev) => prev.filter((m) => m.id !== id));
      setSuccessMessage('Message cancelled');
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      logError(err, 'MessageQueue:handleCancelMessage');
      setError(errorMessage);
    }
  }

  async function handleRetryMessage(id: string) {
    setError(null);
    setSuccessMessage(null);
    try {
      await chrome.runtime.sendMessage({
        type: 'messages.retryQueued',
        payload: { id },
      });
      setSuccessMessage('Message queued for retry');
      await loadQueue();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleEditMessage(id: string, newContent: string) {
    setError(null);
    setSuccessMessage(null);
    try {
      await chrome.runtime.sendMessage({
        type: 'messages.updateQueued',
        payload: { id, message_content: newContent },
      });
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, message_content: newContent } : m)),
      );
      setSuccessMessage('Message updated');
      setExpandedId(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function formatDateTime(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function getStatusBadge(status: QueuedMessage['status']) {
    const styles = {
      pending: 'bg-blue-100 text-blue-800',
      processing: 'bg-orangeBrand bg-opacity-20 text-orangeStrong',
      failed: 'bg-red-100 text-red-800',
    };
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${styles[status]}`}>{status}</span>
    );
  }

  const pendingCount = messages.filter((m) => m.status === 'pending').length;
  const failedCount = messages.filter((m) => m.status === 'failed').length;

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-3">Message Queue</h2>

      {error && <div className="error mb-3">{error}</div>}
      {successMessage && <div className="success mb-3">{successMessage}</div>}

      {/* Queue summary */}
      <div className="grid grid-cols-3 gap-2 mb-4 text-center">
        <div className="p-2 bg-blue-50 rounded">
          <div className="text-2xl font-bold text-blue-600">{messages.length}</div>
          <div className="text-xs text-gray-600">Total</div>
        </div>
        <div className="p-2 bg-green-50 rounded">
          <div className="text-2xl font-bold text-green-600">{pendingCount}</div>
          <div className="text-xs text-gray-600">Pending</div>
        </div>
        <div className="p-2 bg-red-50 rounded">
          <div className="text-2xl font-bold text-red-600">{failedCount}</div>
          <div className="text-xs text-gray-600">Failed</div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner size="lg" />
        </div>
      ) : messages.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-gray-500 mb-2">No messages in queue</p>
          <p className="text-xs text-gray-400">Messages will appear here when scheduled</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {messages
            .sort(
              (a, b) =>
                new Date(a.scheduled_send_time).getTime() -
                new Date(b.scheduled_send_time).getTime(),
            )
            .map((message) => (
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
                    <div className="text-xs text-gray-500">
                      Send: {formatDateTime(message.scheduled_send_time)}
                    </div>
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
                      <textarea
                        defaultValue={message.message_content}
                        onBlur={(e) => {
                          if (e.target.value !== message.message_content) {
                            handleEditMessage(message.id, e.target.value);
                          }
                        }}
                        className="w-full text-sm p-2 border rounded resize-none"
                        rows={3}
                      />
                    </div>

                    {message.error_message && (
                      <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
                        Error: {message.error_message}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                      {message.status === 'failed' && (
                        <button
                          onClick={() => handleRetryMessage(message.id)}
                          className="flex-1 bg-green-500 text-white text-xs py-2 px-3 rounded hover:bg-green-600"
                        >
                          Retry
                        </button>
                      )}
                      <button
                        onClick={() => handleCancelMessage(message.id)}
                        className="flex-1 bg-red-500 text-white text-xs py-2 px-3 rounded hover:bg-red-600"
                      >
                        Cancel
                      </button>
                      <a
                        href={message.friend_profile_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 bg-gray-500 text-white text-xs py-2 px-3 rounded hover:bg-gray-600 text-center"
                      >
                        Profile
                      </a>
                    </div>
                  </div>
                )}
              </div>
            ))}
        </div>
      )}

      <div className="flex gap-2 mt-4">
        <button onClick={loadQueue} className="btn-secondary flex-1">
          Refresh
        </button>
        <button onClick={onClose} className="btn-primary flex-1">
          Close
        </button>
      </div>
    </div>
  );
}
