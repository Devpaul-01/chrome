/**
 * HelpPanel.tsx — Slide-in help panel with quick-start guide,
 * keyboard shortcuts, tips, and resource links.
 */

import { useEffect, useRef } from 'react';

interface HelpPanelProps {
  open: boolean;
  onClose: () => void;
  onRestartTour: () => void;
}

const SHORTCUTS = [
  { keys: 'Alt + H', description: 'Go to Home' },
  { keys: 'Alt + D', description: 'Open Dashboard' },
  { keys: 'Alt + L', description: 'Logout' },
  { keys: 'Esc', description: 'Close modal / panel' },
];

const TIPS = [
  'Use [Tag Person] in message templates to @mention friends by name automatically.',
  'Use {First_Name} and {Last_Name} in timeline posts to personalise each post.',
  'Set "Days in Advance" on templates to send messages before or after the birthday.',
  'Upload images to the Image Library and use [Image] to insert them randomly in posts.',
  'Set the Delay Between Actions slider higher (3–5 min) to reduce Facebook ban risk.',
  'Use "Each message" confirmation mode for the safest sending experience.',
  'Check the Dashboard regularly for delivery stats and automation health.',
  'Create multiple templates — the extension picks one at random for variety.',
];

const DOCS = [
  { label: '🚀 Quick Start Guide', file: 'quick-start.html' },
  { label: '❓ FAQ', file: 'faq.html' },
  { label: '🔧 Troubleshooting', file: 'troubleshooting.html' },
  { label: '🔒 Privacy Policy', file: 'privacy-policy.html' },
  { label: '📋 Terms of Service', file: 'terms-of-service.html' },
];

const RESOURCES = [
  { label: '📺 Video Tutorial', href: 'https://www.youtube.com/@birthdaymessaging' },
  { label: '❓ FAQ', href: 'https://birthdaymessaging.com/faq' },
  { label: '🛟 Support', href: 'https://birthdaymessaging.com/support' },
  { label: '👥 Facebook Group', href: 'https://www.facebook.com/groups/birthdaymessaging' },
];

export default function HelpPanel({ open, onClose, onRestartTour }: HelpPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Focus trap
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!open) return null;
  return (
    <div className="modal-overlay" role="presentation">
      <button
        type="button"
        aria-label="Close help panel overlay"
        className="fixed inset-0 w-full h-full cursor-default bg-transparent border-none p-0 m-0"
        tabIndex={-1}
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'transparent' }}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Help panel"
        className="rounded-xl w-full max-w-sm flex flex-col animate-fade-in overflow-y-auto bg-white shadow-xl border border-orange-200 p-8 gap-5 max-h-[90vh] z-50 relative"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-blueStrong">Help &amp; Tips</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-textMuted hover:text-textPrimary text-lg leading-none"
            aria-label="Close help panel"
          >
            ✕
          </button>
        </div>

        {/* Quick-start */}
        <section>
          <h3 className="text-sm font-semibold text-textPrimary mb-2">Quick Start</h3>
          <ol className="text-xs text-textMuted space-y-1.5 list-decimal list-inside">
            <li>
              Open Facebook and go to <strong>facebook.com/friends/birthdays</strong>
            </li>
            <li>
              Click <strong>Facebook Popup</strong> on the Home tab to open the overlay on that page
            </li>
            <li>
              Scroll to the bottom of the birthdays page, then click <strong>Refresh</strong> in the
              overlay to import contacts
            </li>
            <li>
              In the <strong>Create</strong> tab, create <strong>Groups</strong> first (e.g. Close
              Friends, Colleagues) — groups let you send different messages to different sets of
              people
            </li>
            <li>
              Upload images in <strong>Image Library</strong> to use with the <code>[Image]</code>{' '}
              keyword
            </li>
            <li>
              Create <strong>Message Templates</strong> — assign each to a group and create{' '}
              <strong>at least 3 per group</strong> for randomised sending (reduces Facebook ban
              risk)
            </li>
            <li>
              Set a schedule in <strong>Scheduling</strong> (e.g. &ldquo;On the birthday&rdquo;)
            </li>
            <li>Configure automation settings (check interval, confirmation mode)</li>
            <li>
              Enable <strong>Automation Engine</strong> on the Home tab — keep Chrome open and stay
              logged in to Facebook
            </li>
          </ol>
        </section>

        {/* Keyboard shortcuts */}
        <section>
          <h3 className="text-sm font-semibold text-textPrimary mb-2">Keyboard Shortcuts</h3>
          <div className="space-y-1.5">
            {SHORTCUTS.map((s) => (
              <div key={s.keys} className="flex items-center justify-between text-xs">
                <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded text-xs font-mono">
                  {s.keys}
                </kbd>
                <span className="text-textMuted">{s.description}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Pro Tips */}
        <section>
          <h3 className="text-sm font-semibold text-textPrimary mb-2">Pro Tips</h3>
          <ul className="space-y-1.5">
            {TIPS.map((tip, i) => (
              <li key={i} className="text-xs text-textMuted flex gap-1.5">
                <span className="text-orangeStrong shrink-0">💡</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Documentation */}
        <section>
          <h3 className="text-sm font-semibold text-textPrimary mb-2">Documentation</h3>
          <div className="flex flex-col gap-1.5">
            {DOCS.map((doc) => (
              <button
                key={doc.file}
                type="button"
                onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL(doc.file) })}
                className="text-xs text-left font-medium text-blueStrong hover:underline"
              >
                {doc.label}
              </button>
            ))}
          </div>
        </section>

        {/* Resources */}
        <section>
          <h3 className="text-sm font-semibold text-textPrimary mb-2">Resources</h3>
          <div className="flex flex-wrap gap-2">
            {RESOURCES.map((r) => (
              <a
                key={r.label}
                href={r.href}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-blueStrong hover:underline"
              >
                {r.label}
              </a>
            ))}
          </div>
        </section>

        {/* Restart tour */}
        <button
          type="button"
          onClick={() => {
            onRestartTour();
            onClose();
          }}
          className="btn-outline-orange text-xs py-1.5 mt-1"
        >
          🔄 Restart Welcome Tour
        </button>
      </div>
    </div>
  );
}
