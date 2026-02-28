import { useCallback, useEffect, useState } from 'react';
import { sendBackgroundMessage } from '../api';

export const MAX_LIBRARY_IMAGES = 20;

export interface LibraryImage {
  id: string;
  url: string;
  filename: string;
  size: number;
}

/**
 * Shared hook for reading the image library.
 * Used by ImageManager, PostEditor, and TemplateCreator.
 */
export function useImageLibrary() {
  const [images, setImages] = useState<LibraryImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    if (!silent) setLoadError(null);
    try {
      const data = await sendBackgroundMessage<LibraryImage[]>({ type: 'images.list' });
      setImages(data ?? []);
      if (!silent) setLoadError(null);
    } catch (err) {
      // Only surface errors on explicit (non-background) loads
      if (!silent) setLoadError((err as Error).message);
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const isFull = images.length >= MAX_LIBRARY_IMAGES;

  /**
   * Save a base64 data-URL into the library.
   * Optimistically adds the returned image to local state immediately so
   * the UI updates even if the follow-up reload() fails.
   */
  const saveToLibrary = useCallback(
    async (dataUrl: string, filename: string): Promise<LibraryImage> => {
      if (isFull) throw new Error(`Image library is full (${MAX_LIBRARY_IMAGES}/20). Delete an image first.`);
      const base64Part = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      const byteSize = atob(base64Part).length;
      const saved = await sendBackgroundMessage<LibraryImage>({
        type: 'images.uploadFile',
        payload: { filename, data: dataUrl, size: byteSize },
      });
      // Optimistically add to list immediately — don't wait for reload()
      setImages((prev) => [...prev, saved]);
      // Background sync to get server-canonical state (silent — don't show error banner)
      reload(true).catch(() => undefined);
      return saved;
    },
    [isFull, reload],
  );

  const deleteImage = useCallback(
    async (id: string) => {
      await sendBackgroundMessage<void>({ type: 'images.delete', payload: { id } });
      // Optimistically remove from list immediately
      setImages((prev) => prev.filter((img) => img.id !== id));
      reload(true).catch(() => undefined);
    },
    [reload],
  );

  /** Pick a random image URL from the library for preview purposes. */
  const randomPreviewUrl = images.length > 0 ? images[0].url : null;

  return { images, isLoading, loadError, isFull, reload, saveToLibrary, deleteImage, randomPreviewUrl };
}
