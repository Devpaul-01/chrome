/**
 * Component tests for HelpTooltip.tsx
 *
 * The tooltip is visibility-toggle based on hover / focus events.
 * Note: `pointer-events-none` on the tooltip span means mouse events fired
 * in tests may not propagate through it; we test via button interactions.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HelpTooltip from '../components/HelpTooltip';

describe('HelpTooltip', () => {
  // --- Render ---------------------------------------------------------------

  it('renders a "?" button', () => {
    render(<HelpTooltip label="Some help text" />);
    expect(screen.getByRole('button', { name: /help/i })).toBeInTheDocument();
  });

  it('tooltip is not visible by default', () => {
    render(<HelpTooltip label="Hidden tip" />);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  // --- Hover interactions ---------------------------------------------------

  it('shows tooltip on mouseenter', () => {
    render(<HelpTooltip label="Hover tip" />);
    fireEvent.mouseEnter(screen.getByRole('button', { name: /help/i }));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Hover tip');
  });

  it('hides tooltip on mouseleave (after debounce)', async () => {
    render(<HelpTooltip label="Hover tip" />);
    const btn = screen.getByRole('button', { name: /help/i });
    fireEvent.mouseEnter(btn);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    // Trigger hide — the 100 ms debounce means we need to wait
    fireEvent.mouseLeave(btn);
    await new Promise((r) => setTimeout(r, 200));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  // --- Focus interactions ---------------------------------------------------

  it('shows tooltip on focus', async () => {
    const user = userEvent.setup();
    render(<HelpTooltip label="Focus tip" />);
    await user.tab(); // focus the button
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Focus tip');
  });

  it('hides tooltip on blur', async () => {
    render(<HelpTooltip label="Blur tip" />);
    const btn = screen.getByRole('button', { name: /help/i });
    fireEvent.focus(btn);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.blur(btn);
    await new Promise((r) => setTimeout(r, 200));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  // --- Accessibility --------------------------------------------------------

  it('button has aria-label "Help"', () => {
    render(<HelpTooltip label="Some tip" />);
    expect(screen.getByRole('button', { name: /help/i })).toHaveAttribute('aria-label', 'Help');
  });

  it('button has aria-describedby pointing to tooltip id', () => {
    render(<HelpTooltip label="Some tip" id="my-tip" />);
    expect(screen.getByRole('button', { name: /help/i })).toHaveAttribute(
      'aria-describedby',
      'my-tip',
    );
  });

  it('tooltip span has the supplied id when provided', () => {
    render(<HelpTooltip label="Custom id tip" id="custom-123" />);
    fireEvent.mouseEnter(screen.getByRole('button', { name: /help/i }));
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveAttribute('id', 'custom-123');
  });

  // --- Content --------------------------------------------------------------

  it('renders multi-sentence label text fully', () => {
    const label = 'First sentence. Second sentence with more detail.';
    render(<HelpTooltip label={label} />);
    fireEvent.mouseEnter(screen.getByRole('button', { name: /help/i }));
    expect(screen.getByRole('tooltip')).toHaveTextContent(label);
  });
});
