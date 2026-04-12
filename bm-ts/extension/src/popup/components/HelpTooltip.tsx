import { useState, useRef, useId, useLayoutEffect } from 'react';

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
  const [nudge, setNudge] = useState(0); // px to shift left (+) or right (-)
  const autoId = useId();
  const tooltipId = id ?? `help-tooltip-${autoId}`;
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);

  function show() {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setVisible(true);
  }

  function hide() {
    // Small delay prevents flickering when moving between button and tooltip
    hideTimerRef.current = setTimeout(() => setVisible(false), 100);
  }

  // After the tooltip renders, measure whether it overflows either edge and
  // apply a pixel correction. useLayoutEffect fires before the browser paints
  // so state updates here are batched into the same frame — no visible jump.
  useLayoutEffect(() => {
    if (!visible || !tooltipRef.current) {
      setNudge(0);
      return;
    }
    const rect = tooltipRef.current.getBoundingClientRect();
    const margin = 8;
    if (rect.right > window.innerWidth - margin) {
      setNudge(rect.right - (window.innerWidth - margin));
    } else if (rect.left < margin) {
      setNudge(rect.left - margin); // negative → shift right
    } else {
      setNudge(0);
    }
  }, [visible]);

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
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          className="absolute bottom-full left-1/2 mb-1.5 z-50 w-56 max-w-xs rounded-lg text-xs px-3 py-2 leading-relaxed pointer-events-none"
          style={{
            transform: `translateX(calc(-50% - ${nudge}px))`,
            background: 'rgba(0, 78, 100, 0.92)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            border: '1px solid #0080A6',
            borderLeft: '4px solid #0080A6',
            color: '#f0f4f5',
            fontWeight: 500,
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2), 0 4px 10px rgba(0, 0, 0, 0.12)',
          }}
          onMouseEnter={show}
          onMouseLeave={hide}
        >
          {label}
          {/* Caret pointing downward — counter-nudged to always point at the button */}
          <span
            className="absolute top-full left-1/2 border-4 border-transparent"
            style={{ transform: `translateX(calc(-50% + ${nudge}px))`, borderTopColor: '#0080A6' }}
            aria-hidden="true"
          />
        </span>
      )}
    </span>
  );
}
