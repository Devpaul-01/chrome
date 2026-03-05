import { useState, useRef, useId } from 'react';

interface HelpTooltipProps {
  /** The text content shown in the tooltip. */
  label: string;
  /** Optional custom id for the tooltip span (generated automatically if omitted). */
  id?: string;
}

/**
 * A small accessible `?` button that reveals a contextual help tooltip on
 * hover or keyboard focus. The tooltip is rendered as a `role="tooltip"` span
 * positioned below the trigger button.
 */
export default function HelpTooltip({ label, id }: HelpTooltipProps) {
  const [visible, setVisible] = useState(false);
  const autoId = useId();
  const tooltipId = id ?? `help-tooltip-${autoId}`;
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function show() {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setVisible(true);
  }

  function hide() {
    // Small delay prevents flickering when moving between button and tooltip
    hideTimerRef.current = setTimeout(() => setVisible(false), 100);
  }

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-xs font-bold bg-gray-200 text-gray-600 hover:bg-orangeStrong hover:text-white focus:outline-none focus:ring-2 focus:ring-orangeStrong transition-colors"
        aria-label="Help"
        aria-describedby={tooltipId}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        tabIndex={0}
      >
        ?
      </button>

      {visible && (
        <span
          id={tooltipId}
          role="tooltip"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 w-56 max-w-xs rounded bg-gray-800 text-white text-xs px-3 py-2 shadow-lg leading-relaxed pointer-events-none"
          onMouseEnter={show}
          onMouseLeave={hide}
        >
          {label}
          {/* Caret pointing downward */}
          <span
            className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800"
            aria-hidden="true"
          />
        </span>
      )}
    </span>
  );
}
