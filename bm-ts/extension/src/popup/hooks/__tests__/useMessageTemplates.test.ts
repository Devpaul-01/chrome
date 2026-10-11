/**
 * Unit tests for the useMessageTemplates hook.
 *
 * Covers:
 *   - Initial load via messageTemplates.list
 *   - handleCreateTemplate: creates template, reloads list, shows toast
 *   - handleUpdateMessageTemplate: updates and reloads
 *   - handleDeleteMessageTemplate: deletes and reloads
 *   - Error handling for each operation
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

import { useMessageTemplates } from '../useMessageTemplates';

// ---- Helpers ---------------------------------------------------------------

let idCounter = 0;
function makeApiTemplate(overrides = {}) {
  return {
    id: `mt-${++idCounter}`,
    title: 'Birthday Wishes',
    greeting: 'Dear {First_Name},',
    sentiment: 'Wishing you the best!',
    closing: 'With love',
    image_url: '',
    days_in_advance: 0,
    gender: 'NEUTRAL',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeFormData(overrides = {}) {
  return {
    templateTitle: 'Birthday Wishes',
    greeting: 'Dear {First_Name},',
    sentiment: 'Wishing you the best!',
    closing: 'With love',
    imageUrl: '',
    daysInAdvance: 0,
    gender: 'NEUTRAL' as const,
    groupId: null as string | null,
    ...overrides,
  };
}

/** Render the hook and wait for the initial messageTemplates.list to finish. */
async function renderAndLoad(initialData: ReturnType<typeof makeApiTemplate>[] = []) {
  mockSendBg.mockResolvedValueOnce(initialData);
  const utils = renderHook(() => useMessageTemplates());
  await waitFor(() => expect(mockSendBg).toHaveBeenCalledWith({ type: 'messageTemplates.list' }));
  // Wait until templates are populated (or empty load settles)
  await waitFor(() =>
    expect(utils.result.current.messageTemplates).toHaveLength(initialData.length),
  );
  return utils;
}

// ============================================================================

describe('useMessageTemplates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    idCounter = 0;
  });

  it('loads message templates on mount', async () => {
    const templates = [makeApiTemplate(), makeApiTemplate({ title: 'Formal' })];
    const { result } = await renderAndLoad(templates);

    expect(result.current.messageTemplates).toHaveLength(2);
    expect(mockSendBg).toHaveBeenCalledWith({ type: 'messageTemplates.list' });
  });

  it('maps API response to SavedTemplate shape', async () => {
    const template = makeApiTemplate({
      id: 'mt-1',
      title: 'Test',
      greeting: 'Hi',
      sentiment: 'HBD',
      closing: 'Bye',
      image_url: 'https://example.com/img.jpg',
      days_in_advance: 2,
      gender: 'MALE',
    });
    const { result } = await renderAndLoad([template]);

    const saved = result.current.messageTemplates[0];
    expect(saved.templateTitle).toBe('Test');
    expect(saved.imageUrl).toBe('https://example.com/img.jpg');
    expect(saved.daysInAdvance).toBe(2);
    expect(saved.gender).toBe('MALE');
  });

  it('handles load error gracefully', async () => {
    mockSendBg.mockRejectedValueOnce(new Error('Network error'));
    const { result } = renderHook(() => useMessageTemplates());

    await waitFor(() => expect(result.current.messageTemplates).toHaveLength(0));
  });

  it('handleCreateTemplate creates and reloads', async () => {
    const { result } = await renderAndLoad([]);

    const created = makeApiTemplate({ id: 'new-1' });
    mockSendBg.mockResolvedValueOnce(created); // create
    mockSendBg.mockResolvedValueOnce([created]); // reload

    await act(async () => {
      await result.current.handleCreateTemplate(makeFormData());
    });

    expect(mockShowToast).toHaveBeenCalledWith('Template created successfully!', 'success');
    expect(result.current.showTemplateCreator).toBe(false);
  });

  it('handleCreateTemplate shows error on failure', async () => {
    const { result } = await renderAndLoad([]);

    mockSendBg.mockRejectedValueOnce(new Error('Create failed'));

    try {
      await act(async () => {
        await result.current.handleCreateTemplate(makeFormData());
      });
    } catch {
      // hook re-throws — expected
    }

    expect(mockShowToast).toHaveBeenCalledWith('Create failed', 'error');
  });

  it('handleUpdateMessageTemplate updates and reloads', async () => {
    const existing = makeApiTemplate({ id: 'upd-1' });
    const { result } = await renderAndLoad([existing]);

    const updated = makeApiTemplate({ id: 'upd-1', title: 'Updated' });
    mockSendBg.mockResolvedValueOnce(updated); // update
    mockSendBg.mockResolvedValueOnce([updated]); // reload

    await act(async () => {
      await result.current.handleUpdateMessageTemplate(
        'upd-1',
        makeFormData({ templateTitle: 'Updated' }),
      );
    });

    expect(mockShowToast).toHaveBeenCalledWith('Template updated successfully!', 'success');
  });

  it('handleDeleteMessageTemplate deletes and reloads', async () => {
    const existing = makeApiTemplate({ id: 'del-1' });
    const { result } = await renderAndLoad([existing]);

    mockSendBg.mockResolvedValueOnce(undefined); // delete
    mockSendBg.mockResolvedValueOnce([]); // reload

    await act(async () => {
      await result.current.handleDeleteMessageTemplate('del-1');
    });

    expect(mockShowToast).toHaveBeenCalledWith('Template deleted successfully!', 'success');
  });

  it('handleDeleteMessageTemplate does nothing when user cancels', async () => {
    vi.mocked(confirm).mockReturnValueOnce(false);
    const existing = makeApiTemplate({ id: 'stay-1' });
    const { result } = await renderAndLoad([existing]);

    await act(async () => {
      await result.current.handleDeleteMessageTemplate('stay-1');
    });

    expect(result.current.messageTemplates).toHaveLength(1);
  });

  it('handleDeleteMessageTemplate shows error on failure', async () => {
    const existing = makeApiTemplate({ id: 'err-1' });
    const { result } = await renderAndLoad([existing]);

    mockSendBg.mockRejectedValueOnce(new Error('Delete failed'));

    await act(async () => {
      await result.current.handleDeleteMessageTemplate('err-1');
    });

    expect(mockShowToast).toHaveBeenCalledWith('Delete failed', 'error');
  });
});
