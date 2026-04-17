/**
 * Component tests for TemplateGallery.tsx
 *
 * Pure presentational component — no mocks needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TemplateGallery, { type SavedTemplate } from '../components/TemplateGallery';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTemplate(overrides: Partial<SavedTemplate> = {}): SavedTemplate {
  return {
    id: 'tpl-1',
    greeting: 'Happy Birthday!',
    sentiment: 'Hope you have a wonderful day.',
    closing: 'With love,',
    imageUrl: null,
    templateTitle: 'Classic Wish',
    daysInAdvance: 0,
    gender: 'ALL',
    groupId: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
    ...overrides,
  };
}

const defaultProps = {
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onCreate: vi.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TemplateGallery', () => {
  beforeEach(() => vi.clearAllMocks());

  // --- Empty state ----------------------------------------------------------

  it('shows "No templates yet." when templates array is empty', () => {
    render(<TemplateGallery {...defaultProps} templates={[]} />);
    expect(screen.getByText('No templates yet.')).toBeInTheDocument();
  });

  it('shows a Create Template button in the empty state when onCreate is provided', () => {
    render(<TemplateGallery {...defaultProps} templates={[]} />);
    // There can be two "Create Template" buttons (header + empty state) — verify at least one exists
    expect(screen.getAllByRole('button', { name: /create template/i }).length).toBeGreaterThan(0);
  });

  it('does not show Create Template button in empty state when onCreate is absent', () => {
    render(
      <TemplateGallery templates={[]} onEdit={vi.fn()} onDelete={vi.fn()} onCreate={undefined} />,
    );
    expect(screen.queryByRole('button', { name: /create template/i })).not.toBeInTheDocument();
  });

  // --- Header ---------------------------------------------------------------

  it('renders "Message Templates" heading when showHeader is true (default)', () => {
    render(<TemplateGallery {...defaultProps} templates={[]} />);
    expect(screen.getByText('Message Templates')).toBeInTheDocument();
  });

  it('hides the heading when showHeader is false', () => {
    render(<TemplateGallery {...defaultProps} templates={[]} showHeader={false} />);
    expect(screen.queryByText('Message Templates')).not.toBeInTheDocument();
  });

  // --- Template cards -------------------------------------------------------

  it('renders a card with the template title', () => {
    render(<TemplateGallery {...defaultProps} templates={[makeTemplate()]} />);
    expect(screen.getByText('Classic Wish')).toBeInTheDocument();
  });

  it('renders a preview of the message text', () => {
    const tpl = makeTemplate({ greeting: 'Hey!', sentiment: 'Great day.', closing: 'Cheers.' });
    render(<TemplateGallery {...defaultProps} templates={[tpl]} />);
    expect(screen.getByText(/Hey! Great day. Cheers./)).toBeInTheDocument();
  });

  it('truncates preview text at 100 characters', () => {
    const long = 'A'.repeat(110);
    render(<TemplateGallery {...defaultProps} templates={[makeTemplate({ greeting: long })]} />);
    const preview = screen.getByText(/A{100}\.\.\./);
    expect(preview).toBeInTheDocument();
  });

  it('renders multiple template cards', () => {
    const templates = [
      makeTemplate({ id: '1', templateTitle: 'Alpha' }),
      makeTemplate({ id: '2', templateTitle: 'Beta' }),
      makeTemplate({ id: '3', templateTitle: 'Gamma' }),
    ];
    render(<TemplateGallery {...defaultProps} templates={templates} />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('Gamma')).toBeInTheDocument();
  });

  // --- Days badge -----------------------------------------------------------

  it('shows "On birthday" badge when daysInAdvance is 0', () => {
    render(<TemplateGallery {...defaultProps} templates={[makeTemplate({ daysInAdvance: 0 })]} />);
    expect(screen.getByText('On birthday')).toBeInTheDocument();
  });

  it('shows "3 days early" badge when daysInAdvance is 3', () => {
    render(<TemplateGallery {...defaultProps} templates={[makeTemplate({ daysInAdvance: 3 })]} />);
    expect(screen.getByText('3 days early')).toBeInTheDocument();
  });

  it('shows "1 day early" (singular) when daysInAdvance is 1', () => {
    render(<TemplateGallery {...defaultProps} templates={[makeTemplate({ daysInAdvance: 1 })]} />);
    expect(screen.getByText('1 day early')).toBeInTheDocument();
  });

  it('shows "2 days late" badge when daysInAdvance is -2', () => {
    render(<TemplateGallery {...defaultProps} templates={[makeTemplate({ daysInAdvance: -2 })]} />);
    expect(screen.getByText('2 days late')).toBeInTheDocument();
  });

  // --- Gender badge ---------------------------------------------------------

  it('does not show a gender badge when gender is "ALL"', () => {
    render(<TemplateGallery {...defaultProps} templates={[makeTemplate({ gender: 'ALL' })]} />);
    expect(screen.queryByText(/^MALE$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^FEMALE$/)).not.toBeInTheDocument();
  });

  // --- Image rendering ------------------------------------------------------

  it('shows an emoji placeholder when imageUrl is null', () => {
    render(<TemplateGallery {...defaultProps} templates={[makeTemplate({ imageUrl: null })]} />);
    expect(screen.getByText('🎉')).toBeInTheDocument();
  });

  it('renders an img element when imageUrl is set', () => {
    render(
      <TemplateGallery
        {...defaultProps}
        templates={[makeTemplate({ imageUrl: 'https://example.com/img.jpg' })]}
      />,
    );
    const img = screen.getByRole('img', { name: /classic wish/i });
    expect(img).toHaveAttribute('src', 'https://example.com/img.jpg');
  });

  // --- Actions --------------------------------------------------------------

  it('calls onEdit with the template when Edit is clicked', async () => {
    const user = userEvent.setup();
    const tpl = makeTemplate();
    const onEdit = vi.fn();
    render(<TemplateGallery templates={[tpl]} onEdit={onEdit} onDelete={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /edit/i }));
    expect(onEdit).toHaveBeenCalledWith(tpl);
  });

  it('calls onDelete with the template id when Delete is clicked', async () => {
    const user = userEvent.setup();
    const tpl = makeTemplate({ id: 'del-me' });
    const onDelete = vi.fn();
    render(<TemplateGallery templates={[tpl]} onEdit={vi.fn()} onDelete={onDelete} />);
    await user.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledWith('del-me');
  });

  it('calls onCreate when the header Create Template button is clicked', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(
      <TemplateGallery templates={[]} onEdit={vi.fn()} onDelete={vi.fn()} onCreate={onCreate} />,
    );
    await user.click(screen.getAllByRole('button', { name: /create template/i })[0]);
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  // --- Updated timestamp ----------------------------------------------------

  it('displays the formatted updatedAt timestamp on each card', () => {
    const tpl = makeTemplate({ updatedAt: '2026-01-15T00:00:00Z' });
    render(<TemplateGallery {...defaultProps} templates={[tpl]} />);
    const date = new Date('2026-01-15T00:00:00Z').toLocaleDateString();
    expect(screen.getByText(new RegExp(date))).toBeInTheDocument();
  });
});
