/**
 * FeatureTip.tsx — Dismissible one-time contextual tip banner.
 *
 * Each tip is keyed by a unique `tipId` stored in chrome.storage.local.
 * Once dismissed it never appears again.
 */

import { useEffect, useState } from 'react';

interface FeatureTipProps {
  /** Unique key persisted in storage so the tip is shown only once. */
  tipId: string;
  /** Short message to display. */
  message: string;
}

const STORAGE_PREFIX = 'bm_tip_dismissed_';

export default function FeatureTip({ tipId, message }: FeatureTipProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const key = STORAGE_PREFIX + tipId;
    chrome.storage.local.get([key], (data) => {
      if (!data[key]) setVisible(true);
    });
  }, [tipId]);

  function dismiss() {
    const key = STORAGE_PREFIX + tipId;
    chrome.storage.local.set({ [key]: true });
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-lg px-3 py-2 mb-3 text-xs animate-fade-in"
      style={{
        background: 'rgba(229,103,23,0.18)',
        border: '1px solid rgba(229,103,23,0.3)',
      }}
    >
      <span className="shrink-0 text-sm" aria-hidden="true">
        💡
      </span>
      <span className="flex-1 text-gray-700 leading-relaxed">{message}</span>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 text-gray-400 hover:text-gray-600 text-sm leading-none"
        aria-label="Dismiss tip"
      >
        ✕
      </button>
    </div>
  );
}
