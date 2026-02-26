/**
 * Component tests for TemplateList.tsx
 *
 * Pure presentational component — no mocks needed.
 * TemplateList renders GREETING / BODY / CLOSING segment groups.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import TemplateList from '../components/TemplateList';
import type { TemplateSegment } from '../../api/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSeg(
  overrides: Partial<TemplateSegment> & { segment_type: TemplateSegment['segment_type'] },
): TemplateSegment {
  const id = overrides.id ?? 'seg-1';
  return {
    id,
    segment_type: overrides.segment_type,
    content: overrides.content ?? 'Default content',
    label: overrides.label,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: overrides.updated_at ?? '2026-01-15T00:00:00Z',
    ...overrides,
  };
}

const emptyGroups = {
  GREETING: [],
  BODY: [],
  CLOSING: [],
};

function makeDefaultProps(partial = {}) {
  return {
    groupedTemplates: emptyGroups,
    editingId: null,
    setEditingId: vi.fn(),
    editingContent: '',
    setEditingContent: vi.fn(),
    editingLabel: '',
    setEditingLabel: vi.fn(),
    handleTemplateUpdate: vi.fn().mockResolvedValue(undefined),
    handleTemplateDelete: vi.fn().mockResolvedValue(undefined),
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TemplateList', () => {
  beforeEach(() => vi.clearAllMocks());

  // --- Section headings ------------------------------------------------------

  it('renders GREETING, BODY, and CLOSING section headings', () => {
    render(<TemplateList {...makeDefaultProps()} />);
    expect(screen.getByText('GREETING')).toBeInTheDocument();
    expect(screen.getByText('BODY')).toBeInTheDocument();
    expect(screen.getByText('CLOSING')).toBeInTheDocument();
  });

  // --- Empty state ----------------------------------------------------------

  it('shows "No entries yet." for each empty section', () => {
    render(<TemplateList {...makeDefaultProps()} />);
    const empties = screen.getAllByText('No entries yet.');
    expect(empties).toHaveLength(3);
  });

  it('hides "No entries yet." when a section has items', () => {
    const groups = {
      GREETING: [makeSeg({ segment_type: 'GREETING', id: 'g1', content: 'Hello!' })],
      BODY: [],
      CLOSING: [],
    };
    render(<TemplateList {...makeDefaultProps({ groupedTemplates: groups })} />);
    // Only BODY and CLOSING should show the empty message
    const empties = screen.getAllByText('No entries yet.');
    expect(empties).toHaveLength(2);
  });

  // --- Segment display ------------------------------------------------------

  it('renders segment content text', () => {
    const groups = {
      GREETING: [makeSeg({ segment_type: 'GREETING', id: 'g1', content: 'Hey there!' })],
      BODY: [],
      CLOSING: [],
    };
    render(<TemplateList {...makeDefaultProps({ groupedTemplates: groups })} />);
    expect(screen.getByText('Hey there!')).toBeInTheDocument();
  });

  it('renders segment label when provided', () => {
    const groups = {
      GREETING: [],
      BODY: [makeSeg({ segment_type: 'BODY', id: 'b1', content: 'Body text', label: 'Friendly' })],
      CLOSING: [],
    };
    render(<TemplateList {...makeDefaultProps({ groupedTemplates: groups })} />);
    expect(screen.getByText(/Friendly/)).toBeInTheDocument();
  });

  it('shows "(no label)" when segment label is absent', () => {
    const groups = {
      GREETING: [makeSeg({ segment_type: 'GREETING', id: 'g1', content: 'Hi', label: undefined })],
      BODY: [],
      CLOSING: [],
    };
    render(<TemplateList {...makeDefaultProps({ groupedTemplates: groups })} />);
    expect(screen.getByText(/\(no label\)/)).toBeInTheDocument();
  });

  it('renders Edit and Delete buttons for each segment', () => {
    const groups = {
      GREETING: [makeSeg({ segment_type: 'GREETING', id: 'g1' })],
      BODY: [],
      CLOSING: [],
    };
    render(<TemplateList {...makeDefaultProps({ groupedTemplates: groups })} />);
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
  });

  // --- Edit button ----------------------------------------------------------

  it('calls setEditingId, setEditingContent, and setEditingLabel when Edit is clicked', async () => {
    const user = userEvent.setup();
    const seg = makeSeg({ segment_type: 'GREETING', id: 'g1', content: 'Hey!', label: 'Casual' });
    const groups = { GREETING: [seg], BODY: [], CLOSING: [] };
    const props = makeDefaultProps({ groupedTemplates: groups });
    render(<TemplateList {...props} />);

    await user.click(screen.getByRole('button', { name: /^edit$/i }));
    expect(props.setEditingId).toHaveBeenCalledWith('g1');
    expect(props.setEditingContent).toHaveBeenCalledWith('Hey!');
    expect(props.setEditingLabel).toHaveBeenCalledWith('Casual');
  });

  // --- Delete button --------------------------------------------------------

  it('calls handleTemplateDelete with the segment id when Delete is clicked', async () => {
    const user = userEvent.setup();
    const seg = makeSeg({ segment_type: 'BODY', id: 'b1', content: 'Body' });
    const groups = { GREETING: [], BODY: [seg], CLOSING: [] };
    const props = makeDefaultProps({ groupedTemplates: groups });
    render(<TemplateList {...props} />);

    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(props.handleTemplateDelete).toHaveBeenCalledWith('b1');
  });

  // --- Inline editing mode --------------------------------------------------

  it('shows a textarea and label input when editingId matches the segment', () => {
    const seg = makeSeg({ segment_type: 'GREETING', id: 'g1', content: 'Hello' });
    const groups = { GREETING: [seg], BODY: [], CLOSING: [] };
    const props = makeDefaultProps({
      groupedTemplates: groups,
      editingId: 'g1',
      editingContent: 'Hello',
      editingLabel: 'Warm',
    });
    render(<TemplateList {...props} />);
    expect(screen.getByRole('textbox', { name: `edit-content-g1` })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: `edit-label-g1` })).toBeInTheDocument();
  });

  it('calls setEditingContent when the edit textarea is changed', async () => {
    const user = userEvent.setup();
    const seg = makeSeg({ segment_type: 'CLOSING', id: 'c1', content: 'Bye' });
    const groups = { GREETING: [], BODY: [], CLOSING: [seg] };
    const setEditingContent = vi.fn();
    const props = makeDefaultProps({
      groupedTemplates: groups,
      editingId: 'c1',
      editingContent: 'Bye',
      setEditingContent,
    });
    render(<TemplateList {...props} />);
    const textarea = screen.getByRole('textbox', { name: 'edit-content-c1' });
    await user.clear(textarea);
    await user.type(textarea, 'Farewell');
    // setEditingContent called for each keystroke — just verify it was called
    expect(setEditingContent).toHaveBeenCalled();
  });

  it('calls handleTemplateUpdate with segment id when editing Save is clicked', async () => {
    const user = userEvent.setup();
    const seg = makeSeg({ segment_type: 'GREETING', id: 'g1', content: 'Hey' });
    const groups = { GREETING: [seg], BODY: [], CLOSING: [] };
    const props = makeDefaultProps({ groupedTemplates: groups, editingId: 'g1' });
    render(<TemplateList {...props} />);

    await user.click(screen.getByRole('button', { name: /^save$/i }));
    expect(props.handleTemplateUpdate).toHaveBeenCalledWith('g1');
  });

  it('calls setEditingId(null) when editing Cancel is clicked', async () => {
    const user = userEvent.setup();
    const seg = makeSeg({ segment_type: 'GREETING', id: 'g1' });
    const groups = { GREETING: [seg], BODY: [], CLOSING: [] };
    const setEditingId = vi.fn();
    const props = makeDefaultProps({ groupedTemplates: groups, editingId: 'g1', setEditingId });
    render(<TemplateList {...props} />);

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(setEditingId).toHaveBeenCalledWith(null);
  });

  // --- Multiple segments per section ----------------------------------------

  it('renders multiple segments within the same section', () => {
    const groups = {
      GREETING: [
        makeSeg({ segment_type: 'GREETING', id: 'g1', content: 'Hello friend!' }),
        makeSeg({ segment_type: 'GREETING', id: 'g2', content: 'Hey buddy!' }),
      ],
      BODY: [],
      CLOSING: [],
    };
    render(<TemplateList {...makeDefaultProps({ groupedTemplates: groups })} />);
    expect(screen.getByText('Hello friend!')).toBeInTheDocument();
    expect(screen.getByText('Hey buddy!')).toBeInTheDocument();
  });
});
