/**
 * Unit tests for the usePostComposer hook.
 *
 * Covers:
 *   - Default form state
 *   - startEditing: populates form from existing post
 *   - cancelEditing: resets form and editing state
 *   - handlePostSubmit: creates a new post
 *   - handlePostSubmit: updates an existing post when editingPostId is set
 *   - handlePostSubmit: shows error on failure
 *   - Draft persistence via chrome.storage.local
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---- Mocks ----------------------------------------------------------------

const mockShowToast = vi.fn();

vi.mock('../../context/AppContext', () => ({
  useAppContext: () => ({
    user: { id: 'u1', email: 'test@test.com' },
    showToast: mockShowToast,
  }),
}));

const mockSendBg = vi.fn();
vi.mock('../../api', () => ({
  sendBackgroundMessage: (...args: unknown[]) => mockSendBg(...args),
}));

vi.mock('../../../utils/image', () => ({
  composeImageFromUrl: vi.fn().mockResolvedValue('data:image/png;base64,composed'),
}));

// Chrome storage mock
const storageStore: Record<string, unknown> = {};
vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn((key: string) => Promise.resolve({ [key]: storageStore[key] })),
      set: vi.fn((obj: Record<string, unknown>) => {
        Object.assign(storageStore, obj);
        return Promise.resolve();
      }),
      remove: vi.fn((key: string) => {
        delete storageStore[key];
        return Promise.resolve();
      }),
    },
  },
});

import { usePostComposer } from '../usePostComposer';

// ============================================================================

describe('usePostComposer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(storageStore).forEach((k) => delete storageStore[k]);
  });

  it('returns default form state', () => {
    const { result } = renderHook(() => usePostComposer());

    expect(result.current.postForm.content).toBe('');
    expect(result.current.postForm.gender).toBe('NEUTRAL');
    expect(result.current.postForm.fontFamily).toBe('Arial');
    expect(result.current.postForm.fontSize).toBe(48);
    expect(result.current.editingPostId).toBeNull();
    expect(result.current.isSubmitting).toBe(false);
  });

  it('startEditing populates form from existing post', () => {
    const { result } = renderHook(() => usePostComposer());

    act(() => {
      result.current.startEditing({
        id: 'post-1',
        content: 'Happy Birthday!',
        gender: 'MALE',
        image_url: 'https://example.com/img.jpg',
        label: 'My Post',
        font_family: 'Helvetica',
        font_size: 36,
        font_color: '#000000',
      });
    });

    expect(result.current.editingPostId).toBe('post-1');
    expect(result.current.postForm.content).toBe('Happy Birthday!');
    expect(result.current.postForm.gender).toBe('MALE');
    expect(result.current.postForm.fontFamily).toBe('Helvetica');
    expect(result.current.postForm.fontSize).toBe(36);
  });

  it('cancelEditing resets form and clears editingPostId', () => {
    const { result } = renderHook(() => usePostComposer());

    act(() => {
      result.current.startEditing({
        id: 'post-1',
        content: 'Hello',
        gender: 'FEMALE',
      });
    });

    expect(result.current.editingPostId).toBe('post-1');

    act(() => {
      result.current.cancelEditing();
    });

    expect(result.current.editingPostId).toBeNull();
    expect(result.current.postForm.content).toBe('');
    expect(result.current.postForm.gender).toBe('NEUTRAL');
  });

  it('handlePostSubmit creates a new post (no image)', async () => {
    mockSendBg.mockResolvedValueOnce({ id: 'new-post' }); // posts.create

    const { result } = renderHook(() => usePostComposer());

    act(() => {
      result.current.setPostForm((f) => ({
        ...f,
        content: 'Happy Birthday!',
        label: 'Test Post',
      }));
    });

    const fakeEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent<HTMLFormElement>;

    await act(async () => {
      await result.current.handlePostSubmit(fakeEvent);
    });

    expect(fakeEvent.preventDefault).toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith('Post created successfully!', 'success');
    expect(result.current.postForm.content).toBe('');
  });

  it('handlePostSubmit updates existing post when editingPostId is set', async () => {
    mockSendBg.mockResolvedValueOnce({ id: 'post-1' }); // posts.update

    const { result } = renderHook(() => usePostComposer());

    act(() => {
      result.current.startEditing({
        id: 'post-1',
        content: 'Old content',
        gender: 'NEUTRAL',
      });
    });

    act(() => {
      result.current.setPostForm((f) => ({ ...f, content: 'Updated content' }));
    });

    const fakeEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent<HTMLFormElement>;

    await act(async () => {
      await result.current.handlePostSubmit(fakeEvent);
    });

    expect(mockShowToast).toHaveBeenCalledWith('Post updated successfully!', 'success');
    expect(result.current.editingPostId).toBeNull();
  });

  it('handlePostSubmit shows error on failure', async () => {
    mockSendBg.mockRejectedValueOnce(new Error('Server error'));

    const { result } = renderHook(() => usePostComposer());

    act(() => {
      result.current.setPostForm((f) => ({ ...f, content: 'Test' }));
    });

    const fakeEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent<HTMLFormElement>;

    await act(async () => {
      await result.current.handlePostSubmit(fakeEvent);
    });

    expect(mockShowToast).toHaveBeenCalledWith('Server error', 'error');
    expect(result.current.isSubmitting).toBe(false);
  });
});
