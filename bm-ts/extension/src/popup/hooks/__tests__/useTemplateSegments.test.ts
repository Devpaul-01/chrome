/**
 * Unit tests for the useTemplateSegments hook.
 *
 * Covers:
 *   - Initial load via templates.list
 *   - groupedTemplates computed correctly
 *   - handleTemplateSubmit: creates template, reloads list
 *   - handleTemplateSubmit: rejects empty content
 *   - handleTemplateDelete: removes optimistically, restores on error
 *   - handleTemplateUpdate: updates and reloads
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ---- Mocks ----------------------------------------------------------------

const mockShowToast = vi.fn();
const mockUser = { id: 'u1', email: 'test@test.com' };

vi.mock('../../context/AppContext', () => ({
  useAppContext: () => ({
    user: mockUser,
    showToast: mockShowToast,
  }),
}));

const mockSendBg = vi.fn();
vi.mock('../../api', () => ({
  sendBackgroundMessage: (...args: unknown[]) => mockSendBg(...args),
}));

vi.stubGlobal(
  'confirm',
  vi.fn(() => true),
);

import { useTemplateSegments } from '../useTemplateSegments';

// ---- Helpers ---------------------------------------------------------------

let idCounter = 0;
function makeSegment(overrides = {}) {
  return {
    id: `seg-${++idCounter}`,
    segment_type: 'GREETING' as const,
    content: 'Happy Birthday!',
    label: 'Default',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/** Render the hook and wait for the initial templates.list load to finish. */
async function renderAndLoad(initialData: ReturnType<typeof makeSegment>[] = []) {
  mockSendBg.mockResolvedValueOnce(initialData);
  const utils = renderHook(() => useTemplateSegments());
  await waitFor(() => expect(mockSendBg).toHaveBeenCalledWith({ type: 'templates.list' }));
  await waitFor(() => expect(utils.result.current.isLoadingTemplates).toBe(false));
  return utils;
}

// ============================================================================

describe('useTemplateSegments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    idCounter = 0;
  });

  it('loads templates on mount', async () => {
    const segments = [
      makeSegment(),
      makeSegment({ segment_type: 'BODY', content: 'Have a great day' }),
    ];
    const { result } = await renderAndLoad(segments);

    expect(result.current.templates).toHaveLength(2);
    expect(result.current.isLoadingTemplates).toBe(false);
  });

  it('groups templates by segment type', async () => {
    const segments = [
      makeSegment({ segment_type: 'GREETING' }),
      makeSegment({ segment_type: 'BODY' }),
      makeSegment({ segment_type: 'CLOSING' }),
      makeSegment({ segment_type: 'GREETING' }),
    ];
    const { result } = await renderAndLoad(segments);

    expect(result.current.groupedTemplates.GREETING).toHaveLength(2);
    expect(result.current.groupedTemplates.BODY).toHaveLength(1);
    expect(result.current.groupedTemplates.CLOSING).toHaveLength(1);
  });

  it('handles load error', async () => {
    mockSendBg.mockRejectedValueOnce(new Error('Network error'));
    const { result } = renderHook(() => useTemplateSegments());

    await waitFor(() => expect(result.current.isLoadingTemplates).toBe(false));
    expect(result.current.templates).toHaveLength(0);
    expect(mockShowToast).toHaveBeenCalledWith('Network error', 'error');
  });

  it('handleTemplateSubmit rejects empty content', async () => {
    const { result } = await renderAndLoad([]);

    act(() => {
      result.current.setTemplateForm({ segmentType: 'GREETING', content: '   ', label: '' });
    });

    const fakeEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent<HTMLFormElement>;
    await act(async () => {
      await result.current.handleTemplateSubmit(fakeEvent);
    });

    expect(mockShowToast).toHaveBeenCalledWith('Template content cannot be empty', 'warning');
  });

  it('handleTemplateSubmit creates template and reloads', async () => {
    const { result } = await renderAndLoad([]);

    act(() => {
      result.current.setTemplateForm({
        segmentType: 'GREETING',
        content: 'Happy Birthday!',
        label: 'Default',
      });
    });

    const created = makeSegment({ id: 'new-1' });
    mockSendBg.mockResolvedValueOnce(created); // create
    mockSendBg.mockResolvedValueOnce([created]); // reload

    const fakeEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent<HTMLFormElement>;
    await act(async () => {
      await result.current.handleTemplateSubmit(fakeEvent);
    });

    expect(mockShowToast).toHaveBeenCalledWith('Template saved successfully!', 'success');
  });

  it('handleTemplateDelete removes template optimistically', async () => {
    const segments = [makeSegment({ id: 'keep' }), makeSegment({ id: 'del' })];
    const { result } = await renderAndLoad(segments);

    mockSendBg.mockResolvedValueOnce(undefined); // delete response
    await act(async () => {
      await result.current.handleTemplateDelete('del');
    });

    expect(result.current.templates).toHaveLength(1);
    expect(result.current.templates[0].id).toBe('keep');
    expect(mockShowToast).toHaveBeenCalledWith('Template deleted', 'success');
  });

  it('handleTemplateDelete restores on failure', async () => {
    const segments = [makeSegment({ id: 'only' })];
    const { result } = await renderAndLoad(segments);

    mockSendBg.mockRejectedValueOnce(new Error('Delete failed'));
    await act(async () => {
      await result.current.handleTemplateDelete('only');
    });

    expect(result.current.templates).toHaveLength(1);
    expect(mockShowToast).toHaveBeenCalledWith('Delete failed', 'error');
  });

  it('handleTemplateUpdate updates and reloads', async () => {
    const seg = makeSegment({ id: 'edit-1', content: 'Old' });
    const { result } = await renderAndLoad([seg]);

    act(() => {
      result.current.setEditingId('edit-1');
      result.current.setEditingContent('New content');
      result.current.setEditingLabel('New label');
    });

    const updated = { ...seg, content: 'New content', label: 'New label' };
    mockSendBg.mockResolvedValueOnce(updated); // update
    mockSendBg.mockResolvedValueOnce([updated]); // reload

    await act(async () => {
      await result.current.handleTemplateUpdate();
    });

    expect(mockShowToast).toHaveBeenCalledWith('Template updated successfully!', 'success');
    expect(result.current.editingId).toBeNull();
  });

  it('handleTemplateUpdate rejects empty content', async () => {
    const { result } = await renderAndLoad([]);

    act(() => {
      result.current.setEditingId('some-id');
      result.current.setEditingContent('   ');
    });

    await act(async () => {
      await result.current.handleTemplateUpdate();
    });

    expect(mockShowToast).toHaveBeenCalledWith('Content is required', 'warning');
  });
});
