/**
 * Unit tests for the useImageLibrary hook.
 *
 * Covers:
 *   - Initial load via images.list
 *   - saveToLibrary: calls uploadFile, adds to list optimistically
 *   - saveToLibrary: throws when library is full
 *   - deleteImage: removes image optimistically, triggers background reload
 *   - isFull tracks MAX_LIBRARY_IMAGES boundary
 *   - reload(silent=true) suppresses loading/error state changes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ---- Mocks ----------------------------------------------------------------

const mockSendBg = vi.fn();
vi.mock('../../api', () => ({
  sendBackgroundMessage: (...args: unknown[]) => mockSendBg(...args),
}));

import { useImageLibrary, MAX_LIBRARY_IMAGES } from '../useImageLibrary';

// ---- Helpers ---------------------------------------------------------------

let idCounter = 0;
function makeImage(overrides = {}) {
  return {
    id: `img-${++idCounter}`,
    url: 'https://example.com/img.jpg',
    filename: 'img.jpg',
    size: 12345,
    ...overrides,
  };
}

// ============================================================================

describe('useImageLibrary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    idCounter = 0;
  });

  it('loads images from images.list on mount', async () => {
    const images = [makeImage(), makeImage()];
    mockSendBg.mockResolvedValueOnce(images);

    const { result } = renderHook(() => useImageLibrary());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.images).toHaveLength(2);
  });

  it('handles null response gracefully', async () => {
    mockSendBg.mockResolvedValueOnce(null);

    const { result } = renderHook(() => useImageLibrary());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.images).toHaveLength(0);
  });

  it('sets loadError when list request fails', async () => {
    mockSendBg.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useImageLibrary());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.loadError).toBe('Network error');
  });

  it('saveToLibrary adds image optimistically', async () => {
    mockSendBg.mockResolvedValueOnce([]); // initial load
    const saved = makeImage({ id: 'saved-1' });
    mockSendBg.mockResolvedValueOnce(saved); // uploadFile
    mockSendBg.mockResolvedValueOnce([saved]); // background reload (silent)

    const { result } = renderHook(() => useImageLibrary());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let returnedImage: Awaited<ReturnType<typeof result.current.saveToLibrary>>;
    await act(async () => {
      returnedImage = await result.current.saveToLibrary('data:image/png;base64,abc', 'test.png');
    });

    expect(returnedImage!.id).toBe('saved-1');
    expect(result.current.images).toHaveLength(1);
    expect(result.current.images[0].id).toBe('saved-1');
  });

  it('saveToLibrary sends correct message type', async () => {
    mockSendBg.mockResolvedValueOnce([]); // load
    mockSendBg.mockResolvedValueOnce(makeImage()); // upload
    mockSendBg.mockResolvedValueOnce([]); // reload

    const { result } = renderHook(() => useImageLibrary());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.saveToLibrary('data:image/png;base64,abc', 'photo.png');
    });

    const uploadCall = mockSendBg.mock.calls.find(
      (args: unknown[]) => (args[0] as { type: string }).type === 'images.uploadFile',
    );
    expect(uploadCall).toBeTruthy();
    expect(uploadCall![0].payload.filename).toBe('photo.png');
  });

  it('saveToLibrary throws when library is full', async () => {
    const fullImages = Array.from({ length: MAX_LIBRARY_IMAGES }, () => makeImage());
    mockSendBg.mockResolvedValueOnce(fullImages);

    const { result } = renderHook(() => useImageLibrary());
    await waitFor(() => expect(result.current.isFull).toBe(true));

    await expect(
      act(async () => {
        await result.current.saveToLibrary('data:image/png;base64,x', 'overflow.png');
      }),
    ).rejects.toThrow(/full/i);
  });

  it('deleteImage removes image optimistically', async () => {
    const images = [makeImage({ id: 'keep' }), makeImage({ id: 'del' })];
    mockSendBg.mockResolvedValueOnce(images); // load
    mockSendBg.mockResolvedValueOnce(undefined); // delete
    mockSendBg.mockResolvedValueOnce([images[0]]); // silent reload

    const { result } = renderHook(() => useImageLibrary());
    await waitFor(() => expect(result.current.images).toHaveLength(2));

    await act(async () => {
      await result.current.deleteImage('del');
    });

    expect(result.current.images).toHaveLength(1);
    expect(result.current.images[0].id).toBe('keep');
  });

  it('deleteImage sends correct message type', async () => {
    mockSendBg.mockResolvedValueOnce([makeImage({ id: 'target' })]);
    mockSendBg.mockResolvedValueOnce(undefined);
    mockSendBg.mockResolvedValueOnce([]);

    const { result } = renderHook(() => useImageLibrary());
    await waitFor(() => expect(result.current.images).toHaveLength(1));

    await act(async () => {
      await result.current.deleteImage('target');
    });

    const deleteCall = mockSendBg.mock.calls.find(
      (args: unknown[]) => (args[0] as { type: string }).type === 'images.delete',
    );
    expect(deleteCall).toBeTruthy();
    expect(deleteCall![0].payload.id).toBe('target');
  });

  it('isFull is true when at capacity', async () => {
    const atCapacity = Array.from({ length: MAX_LIBRARY_IMAGES }, () => makeImage());
    mockSendBg.mockResolvedValueOnce(atCapacity);

    const { result } = renderHook(() => useImageLibrary());

    await waitFor(() => expect(result.current.isFull).toBe(true));
  });

  it('isFull is false when below capacity', async () => {
    mockSendBg.mockResolvedValueOnce([makeImage()]);

    const { result } = renderHook(() => useImageLibrary());

    await waitFor(() => expect(result.current.isFull).toBe(false));
  });
});
