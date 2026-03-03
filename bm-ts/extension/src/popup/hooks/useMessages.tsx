import { useEffect, useState } from 'react';
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

export function useMessageQueue() {
  const [messages, setMessages] = useState<QueuedMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lastUpdateAt, setLastUpdateAt] = useState<number | null>(null);

  useEffect(() => {
    loadQueue();

    const unsubscribe = wsClient.on('message_queue_update', (rawData) => {
      const data = rawData as { action: string; message: QueuedMessage };
      if (data.action === 'created') {
        loadQueue();
        setLastUpdateAt(Date.now());
      } else if (data.action === 'updated') {
        setMessages((prev) =>
          prev.map((m) => (m.id === data.message.id ? { ...m, ...data.message } : m)),
        );
        setSuccessMessage('Message updated');
        setLastUpdateAt(Date.now());
      } else if (data.action === 'deleted') {
        setMessages((prev) => prev.filter((m) => m.id !== data.message.id));
        setSuccessMessage('Message removed');
        setLastUpdateAt(Date.now());
      }
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadQueue() {
    setIsLoading(true);
    setError(null);
    try {
      const data = await chrome.runtime.sendMessage({ type: 'messages.listQueue' });
      setMessages(Array.isArray(data) ? data : []);
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      logError(err, 'useMessageQueue:loadQueue');
      setError(errorMessage);
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  }

  async function cancelMessage(id: string) {
    setError(null);
    setSuccessMessage(null);
    try {
      await chrome.runtime.sendMessage({ type: 'messages.cancelQueued', payload: { id } });
      setMessages((prev) => prev.filter((m) => m.id !== id));
      setSuccessMessage('Message cancelled');
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      logError(err, 'useMessageQueue:cancelMessage');
      setError(errorMessage);
    }
  }

  async function retryMessage(id: string) {
    setError(null);
    setSuccessMessage(null);
    try {
      await chrome.runtime.sendMessage({ type: 'messages.retryQueued', payload: { id } });
      setSuccessMessage('Message queued for retry');
      await loadQueue();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function editMessage(id: string, newContent: string) {
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
      setError(getErrorMessage(err));
    }
  }

  return {
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
    // live indicator for small UI hints
    live: lastUpdateAt !== null && Date.now() - lastUpdateAt < 15000,
  };
}

export function useMessageHistory() {
  const [items, setItems] = useState<MessageHistoryItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'sent' | 'delivered' | 'failed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lastUpdateAt, setLastUpdateAt] = useState<number | null>(null);

  // Single effect: subscribe to WS updates on mount, and reload whenever
  // filter / pagination params change. Combining both concerns into one effect
  // avoids calling loadHistory() twice on initial mount.
  useEffect(() => {
    loadHistory();

    const unsubscribe = wsClient.on('message_history_update', (rawData) => {
      const data = rawData as { action: string; message: MessageHistoryItem };
      if (data.action === 'deleted') {
        setItems((prev) => prev.filter((m) => m.id !== data.message.id));
        setTotalItems((t) => Math.max(0, t - 1));
        setLastUpdateAt(Date.now());
      } else if (data.action === 'created') {
        loadHistory();
        setLastUpdateAt(Date.now());
      }
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filterStatus, searchQuery, startDate, endDate]);

  async function loadHistory() {
    setIsLoading(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        page,
        page_size: pageSize,
      };
      if (searchQuery) payload.search = searchQuery;
      if (filterStatus !== 'all') payload.status_filter = filterStatus;
      if (startDate) payload.start_date = new Date(startDate).toISOString();
      if (endDate) {
        // include the full end day
        const ed = new Date(endDate);
        ed.setHours(23, 59, 59, 999);
        payload.end_date = ed.toISOString();
      }
      const data = await chrome.runtime.sendMessage({ type: 'messages.listHistory', payload });
      if (data && typeof data === 'object' && 'items' in data) {
        setItems(Array.isArray(data.items) ? data.items : []);
        setTotalItems(typeof data.total === 'number' ? data.total : 0);
      } else {
        // backward-compat: raw array fallback
        setItems(Array.isArray(data) ? data : []);
        setTotalItems(Array.isArray(data) ? data.length : 0);
      }
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      logError(err, 'useMessageHistory:loadHistory');
      setError(errorMessage);
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }

  async function deleteMessage(id: string) {
    if (!confirm('Are you sure you want to delete this history item?')) return;
    setError(null);
    try {
      await chrome.runtime.sendMessage({ type: 'messages.deleteHistory', payload: { id } });
      setItems((prev) => prev.filter((m) => m.id !== id));
      setTotalItems((t) => Math.max(0, t - 1));
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      logError(err, 'useMessageHistory:deleteMessage');
      setError(errorMessage);
    }
  }

  // Items are already filtered server-side; expose directly as filteredMessages for compat
  const filteredMessages = items;

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  function goToPage(p: number) {
    setPage(Math.min(Math.max(1, p), totalPages));
  }

  const stats = {
    total: totalItems,
    sent: items.filter((m) => m.status === 'sent').length,
    delivered: items.filter((m) => m.status === 'delivered').length,
    failed: items.filter((m) => m.status === 'failed').length,
  };

  // Compute simple trends for the last N days
  function computeTrends(days = 7) {
    const today = new Date();
    const buckets: { date: string; total: number; successRate: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      buckets.push({ date: key, total: 0, successRate: 0 });
    }

    const grouped: Record<string, { total: number; success: number }> = {};
    for (const m of items) {
      const dt = new Date(m.sent_at || m.birthday_date || '');
      if (isNaN(dt.getTime())) continue;
      const dayKey = dt.toISOString().slice(0, 10);
      grouped[dayKey] = grouped[dayKey] || { total: 0, success: 0 };
      grouped[dayKey].total += 1;
      if (m.status === 'sent' || m.status === 'delivered') grouped[dayKey].success += 1;
    }

    const volume: number[] = [];
    const successRate: number[] = [];
    for (const b of buckets) {
      const g = grouped[b.date] || { total: 0, success: 0 };
      volume.push(g.total);
      successRate.push(g.total === 0 ? 0 : Math.round((g.success / g.total) * 100));
    }

    return { volume, successRate };
  }

  return {
    messages: items,
    isLoading,
    error,
    filterStatus,
    setFilterStatus: (s: 'all' | 'sent' | 'delivered' | 'failed') => {
      setPage(1);
      setFilterStatus(s);
    },
    searchQuery,
    setSearchQuery: (q: string) => {
      setPage(1);
      setSearchQuery(q);
    },
    startDate,
    setStartDate: (d: string) => {
      setPage(1);
      setStartDate(d);
    },
    endDate,
    setEndDate: (d: string) => {
      setPage(1);
      setEndDate(d);
    },
    expandedId,
    setExpandedId,
    loadHistory,
    deleteMessage,
    filteredMessages,
    stats,
    trends: computeTrends,
    live: lastUpdateAt !== null && Date.now() - lastUpdateAt < 15000,
    // pagination
    page,
    pageSize,
    totalItems,
    totalPages,
    goToPage,
  };
}
