/**
 * Component tests for OnboardingWizard.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OnboardingWizard from '../components/OnboardingWizard';

const mockOnComplete = vi.fn();
const mockOnSkip = vi.fn();

function renderWizard() {
  return render(<OnboardingWizard onComplete={mockOnComplete} onSkip={mockOnSkip} />);
}

describe('OnboardingWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Initial render -------------------------------------------------------

  it('renders as a dialog', () => {
    renderWizard();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows step 1 of 9 on first render', () => {
    renderWizard();
    expect(screen.getByText(/step 1 of 9/i)).toBeInTheDocument();
  });

  it('shows the welcome title on step 1', () => {
    renderWizard();
    expect(screen.getByText(/welcome to birthday messaging/i)).toBeInTheDocument();
  });

  it('does not show Back button on first step', () => {
    renderWizard();
    expect(screen.queryByRole('button', { name: /previous step/i })).not.toBeInTheDocument();
  });

  it('shows Next button on non-last steps', () => {
    renderWizard();
    expect(screen.getByRole('button', { name: /next step/i })).toBeInTheDocument();
  });

  it('shows Skip tour button', () => {
    renderWizard();
    expect(screen.getByRole('button', { name: /skip tour/i })).toBeInTheDocument();
  });

  it('shows progress bar', () => {
    renderWizard();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  // --- Navigation -----------------------------------------------------------

  it('advances to step 2 when Next is clicked', async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole('button', { name: /next step/i }));
    expect(screen.getByText(/step 2 of 9/i)).toBeInTheDocument();
  });

  it('shows Back button on step 2', async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole('button', { name: /next step/i }));
    expect(screen.getByRole('button', { name: /previous step/i })).toBeInTheDocument();
  });

  it('goes back when Back is clicked', async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole('button', { name: /next step/i }));
    await user.click(screen.getByRole('button', { name: /previous step/i }));
    expect(screen.getByText(/step 1 of 9/i)).toBeInTheDocument();
  });

  it('shows "Get Started" button on last step', async () => {
    const user = userEvent.setup();
    renderWizard();
    // Navigate to step 9 (8 clicks)
    for (let i = 0; i < 8; i++) {
      await user.click(screen.getByRole('button', { name: /next step/i }));
    }
    expect(screen.getByRole('button', { name: /finish onboarding/i })).toBeInTheDocument();
  });

  it('calls onComplete when "Get Started" is clicked on last step', async () => {
    const user = userEvent.setup();
    renderWizard();
    for (let i = 0; i < 8; i++) {
      await user.click(screen.getByRole('button', { name: /next step/i }));
    }
    await user.click(screen.getByRole('button', { name: /finish onboarding/i }));
    expect(mockOnComplete).toHaveBeenCalledOnce();
  });

  it('calls onSkip when "Skip tour" is clicked', async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole('button', { name: /skip tour/i }));
    expect(mockOnSkip).toHaveBeenCalledOnce();
  });

  // --- Step content ---------------------------------------------------------

  it('step 5 shows merge tag guidance', async () => {
    const user = userEvent.setup();
    renderWizard();
    // Step 5 is Message Templates (4 clicks from step 1)
    for (let i = 0; i < 4; i++) {
      await user.click(screen.getByRole('button', { name: /next step/i }));
    }
    expect(screen.getByText(/\[Tag Person\]/i)).toBeInTheDocument();
  });

  it('step 9 title contains "all set"', async () => {
    const user = userEvent.setup();
    renderWizard();
    for (let i = 0; i < 8; i++) {
      await user.click(screen.getByRole('button', { name: /next step/i }));
    }
    expect(screen.getByRole('heading', { name: /all set/i })).toBeInTheDocument();
  });

  // --- Progress bar ---------------------------------------------------------

  it('progress bar aria-valuenow advances with each step', async () => {
    const user = userEvent.setup();
    renderWizard();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    await user.click(screen.getByRole('button', { name: /next step/i }));
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
  });
});
