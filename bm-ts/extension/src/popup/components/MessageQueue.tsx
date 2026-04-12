import { useState, useEffect, useRef } from 'react';
import { useMessageQueue, QueuedMessage } from '../hooks/useMessages';
import Spinner from './Spinner';
import { trapFocus, handleEscapeKey } from '../../utils/accessibility';
import HelpTooltip from './HelpTooltip';
import FeatureTip from './FeatureTip';

interface MessageQueueProps {
  onClose: () => void;
  compact?: boolean;
}

type StatusFilter = 'all' | QueuedMessage['status'];
type SortDir = 'asc' | 'desc';

export default function MessageQueue({ onClose: _onClose, compact = false }: MessageQueueProps) {
  const {
    messages,
    isLoading,
    error,
    successMessage,
    expandedId,
    setExpandedId,
    loadQueue,
    cancelMessage,
    retryMessage,
    editMessage,
  } = useMessageQueue();

  // ── Filter / sort / selection state ──────────────────────────────────
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkLoading, setIsBulkLoading] = useState(false);
  const [previewMessage, setPreviewMessage] = useState<QueuedMessage | null>(null);
  const previewDialogRef = useRef<HTMLDivElement>(null);

  // Trap focus and handle Escape key when preview modal is open
  useEffect(() => {
    if (!previewMessage || !previewDialogRef.current) return;
    const cleanupTrap = trapFocus(previewDialogRef.current);
    const escHandler = handleEscapeKey(() => setPreviewMessage(null));
    document.addEventListener('keydown', escHandler);
    previewDialogRef.current.querySelector<HTMLElement>('button')?.focus();
    return () => {
      cleanupTrap();
      document.removeEventListener('keydown', escHandler);
    };
  }, [previewMessage]);

  // ── Derived lists ─────────────────────────────────────────────────────
  const visibleMessages = messages
    .filter((m) => statusFilter === 'all' || m.status === statusFilter)
    .sort((a, b) => {
      const diff =
        new Date(a.scheduled_send_time).getTime() - new Date(b.scheduled_send_time).getTime();
      return sortDir === 'asc' ? diff : -diff;
    });

  const pendingCount = messages.filter((m) => m.status === 'pending').length;
  const failedCount = messages.filter((m) => m.status === 'failed').length;
  const allVisibleSelected =
    visibleMessages.length > 0 && visibleMessages.every((m) => selectedIds.has(m.id));

  // ── Selection helpers ─────────────────────────────────────────────────
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleMessages.map((m) => m.id)));
    }
  }

  // ── Bulk actions ──────────────────────────────────────────────────────
  async function bulkCancel() {
    setIsBulkLoading(true);
    await Promise.all([...selectedIds].map((id) => cancelMessage(id)));
    setSelectedIds(new Set());
    setIsBulkLoading(false);
  }

  async function bulkRetry() {
    setIsBulkLoading(true);
    await Promise.all([...selectedIds].map((id) => retryMessage(id)));
    setSelectedIds(new Set());
    setIsBulkLoading(false);
  }

  async function retryAllFailed() {
    setIsBulkLoading(true);
    const failedIds = messages.filter((m) => m.status === 'failed').map((m) => m.id);
    await Promise.all(failedIds.map((id) => retryMessage(id)));
    setIsBulkLoading(false);
  }

  // ── Formatters ────────────────────────────────────────────────────────
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
    const styles: Record<QueuedMessage['status'], string> = {
      pending: 'bg-blue-100 text-blue-800',
      processing: 'bg-orangeBrand/20 text-orangeStrong',
      failed: 'bg-red-100 text-red-800',
    };
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${styles[status]}`}>{status}</span>
    );
  }

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-3">
        Message Queue{' '}
        <HelpTooltip label="Messages waiting to be sent. Pending messages will be delivered at the next automation run. Failed messages can be retried or edited before resending." />
      </h2>

      <FeatureTip
        tipId="queue_overview"
        message="Messages are queued here before being sent to Facebook. You can edit, retry failed messages, or cancel pending ones."
      />

      {error && (
        <div className="error mb-3" role="alert">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="success mb-3" role="status">
          {successMessage}
        </div>
      )}

      {/* Queue summary */}
      {!compact && (
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
      )}

      {/* Filter / sort controls */}
      {!compact && (
        <div className="flex gap-2 mb-3 items-center">
          <label htmlFor="queue-status-filter" className="sr-only">
            Filter by status
          </label>
          <select
            id="queue-status-filter"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as StatusFilter);
              setSelectedIds(new Set());
            }}
            className="flex-1 text-xs border rounded px-2 py-1.5 bg-white"
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="failed">Failed</option>
          </select>

          <button
            onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
            className="text-xs border rounded px-2 py-1.5 bg-white hover:bg-gray-50 whitespace-nowrap"
            aria-label={`Sort ${sortDir === 'asc' ? 'descending' : 'ascending'}`}
            title="Toggle sort order"
          >
            Date {sortDir === 'asc' ? '↑' : '↓'}
          </button>

          {failedCount > 0 && (
            <button
              onClick={retryAllFailed}
              disabled={isBulkLoading}
              className="text-xs bg-green-500 text-white px-2 py-1.5 rounded hover:bg-green-600 disabled:opacity-50 whitespace-nowrap"
              aria-label="Retry all failed messages"
            >
              Retry All Failed
            </button>
          )}
        </div>
      )}

      {/* Bulk action bar */}
      {!compact && selectedIds.size > 0 && (
        <div
          className="flex items-center gap-2 mb-3 p-2 bg-blue-50 border border-blue-200 rounded"
          role="toolbar"
          aria-label="Bulk actions"
        >
          <span className="text-xs text-blue-700 font-medium flex-1">
            {selectedIds.size} selected
          </span>
          {isBulkLoading && <Spinner size="sm" />}
          <button
            onClick={bulkRetry}
            disabled={isBulkLoading}
            className="text-xs bg-green-500 text-white px-2 py-1 rounded hover:bg-green-600 disabled:opacity-50"
          >
            Retry Selected
          </button>
          <button
            onClick={bulkCancel}
            disabled={isBulkLoading}
            className="text-xs bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600 disabled:opacity-50"
          >
            Cancel Selected
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-gray-500 hover:text-gray-700 px-1"
            aria-label="Clear selection"
          >
            ✕
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner size="lg" />
        </div>
      ) : visibleMessages.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-gray-500 mb-2">
            {statusFilter !== 'all' ? 'No messages match this filter' : 'No messages in queue'}
          </p>
          <p className="text-xs text-gray-400">Messages will appear here when scheduled</p>
        </div>
      ) : (
        <div
          className={
            compact ? 'space-y-1 max-h-80 overflow-y-auto' : 'space-y-2 max-h-96 overflow-y-auto'
          }
        >
          {/* Select-all header row */}
          {!compact && (
            <div className="flex items-center gap-2 px-1 pb-1 border-b">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleSelectAll}
                className="w-3.5 h-3.5"
                aria-label="Select all messages"
              />
              <span className="text-xs text-gray-500">
                {allVisibleSelected ? 'Deselect all' : 'Select all'}
              </span>
            </div>
          )}

          {visibleMessages.map((message) => (
            <div
              key={message.id}
              className={`border rounded p-3 bg-white hover:shadow-sm transition ${
                compact ? 'py-2 px-3' : ''
              } ${selectedIds.has(message.id) ? 'border-blue-400 bg-blue-50' : ''}`}
            >
              {/* Compact row */}
              {compact ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 flex items-center gap-3">
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">{message.friend_name}</span>
                      <span className="text-xs text-gray-500">
                        {formatDateTime(message.scheduled_send_time)}
                      </span>
                    </div>
                    {getStatusBadge(message.status)}
                  </div>
                  <div className="flex items-center gap-2">
                    {message.status === 'failed' && (
                      <button
                        onClick={() => retryMessage(message.id)}
                        className="text-xs bg-green-500 text-white px-2 py-1 rounded"
                      >
                        Retry
                      </button>
                    )}
                    <button
                      onClick={() => cancelMessage(message.id)}
                      className="text-xs bg-red-500 text-white px-2 py-1 rounded"
                    >
                      Cancel
                    </button>
                    <a
                      href={message.friend_profile_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs bg-gray-500 text-white px-2 py-1 rounded"
                    >
                      Profile
                    </a>
                  </div>
                </div>
              ) : (
                <>
                  {/* Header */}
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-start gap-2 flex-1">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(message.id)}
                        onChange={() => toggleSelect(message.id)}
                        className="w-3.5 h-3.5 mt-0.5 flex-shrink-0"
                        aria-label={`Select ${message.friend_name}`}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">{message.friend_name}</span>
                          {getStatusBadge(message.status)}
                        </div>
                        <div className="text-xs text-gray-500">
                          Send: {formatDateTime(message.scheduled_send_time)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 ml-2">
                      <button
                        onClick={() => setPreviewMessage(message)}
                        className="text-blueStrong hover:text-orangeStrong text-xs"
                        aria-label={`Preview message to ${message.friend_name}`}
                      >
                        Preview
                      </button>
                      <button
                        onClick={() => setExpandedId(expandedId === message.id ? null : message.id)}
                        className="text-blueStrong hover:text-orangeStrong text-xs"
                      >
                        {expandedId === message.id ? 'Hide' : 'Edit'}
                      </button>
                    </div>
                  </div>

                  {/* Expanded edit panel */}
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
                              editMessage(message.id, e.target.value);
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
                            onClick={() => retryMessage(message.id)}
                            className="flex-1 bg-green-500 text-white text-xs py-2 px-3 rounded hover:bg-green-600"
                          >
                            Retry
                          </button>
                        )}
                        <button
                          onClick={() => cancelMessage(message.id)}
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
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 mt-4">
        <button onClick={loadQueue} className="btn-secondary flex-1">
          Refresh
        </button>
      </div>

      {/* Message preview modal */}
      {previewMessage && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="preview-modal-title"
          ref={previewDialogRef}
          onClick={(e) => {
            if (e.target === e.currentTarget) setPreviewMessage(null);
          }}
        >
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 id="preview-modal-title" className="font-semibold text-sm">
                Message Preview — {previewMessage.friend_name}
              </h3>
              <button
                onClick={() => setPreviewMessage(null)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
                aria-label="Close preview"
              >
                ✕
              </button>
            </div>
            <div className="p-4 overflow-y-auto space-y-3 flex-1">
              <div className="flex items-center gap-2">
                {getStatusBadge(previewMessage.status)}
                <span className="text-xs text-gray-500">
                  Scheduled: {formatDateTime(previewMessage.scheduled_send_time)}
                </span>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">Message content</p>
                <div className="text-sm p-3 bg-gray-50 rounded whitespace-pre-wrap border">
                  {previewMessage.message_content}
                </div>
              </div>
              {previewMessage.error_message && (
                <div className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">
                  <strong>Error:</strong> {previewMessage.error_message}
                </div>
              )}
              <div className="text-xs text-gray-500">
                <a
                  href={previewMessage.friend_profile_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blueStrong underline"
                >
                  View Facebook profile ↗
                </a>
              </div>
            </div>
            <div className="p-4 border-t flex gap-2">
              {previewMessage.status === 'failed' && (
                <button
                  onClick={() => {
                    retryMessage(previewMessage.id);
                    setPreviewMessage(null);
                  }}
                  className="flex-1 bg-green-500 text-white text-xs py-2 rounded hover:bg-green-600"
                >
                  Retry
                </button>
              )}
              <button
                onClick={() => {
                  cancelMessage(previewMessage.id);
                  setPreviewMessage(null);
                }}
                className="flex-1 bg-red-500 text-white text-xs py-2 rounded hover:bg-red-600"
              >
                Cancel
              </button>
              <button
                onClick={() => setPreviewMessage(null)}
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
