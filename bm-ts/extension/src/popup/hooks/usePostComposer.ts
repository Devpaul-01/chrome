import { useCallback, useState } from 'react';
import { sendBackgroundMessage } from '../api';
import { getErrorMessage, logError } from '../../utils/errors';
import { composeImageFromUrl } from '../../utils/image';
import { useAppContext } from '../context/AppContext';

type PostForm = {
  content: string;
  gender: 'MALE' | 'FEMALE' | 'NEUTRAL';
  image_url?: string;
  label: string;
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
};

const POST_FORM_DEFAULT: PostForm = {
  content: '',
  gender: 'NEUTRAL',
  image_url: '',
  label: '',
  fontFamily: 'Arial',
  fontSize: 48,
  fontColor: '#ffffff',
};

export function usePostComposer() {
  const { showToast } = useAppContext();
  const [postForm, setPostForm] = useState<PostForm>(POST_FORM_DEFAULT);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePostSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
      e.preventDefault();
      setIsSubmitting(true);
      try {
        const previewText = (postForm.content || '')
          .replace(/\{First_Name\}/g, 'John')
          .replace(/\{Last_Name\}/g, 'Doe')
          .replace(/\{Today\}/g, new Date().toLocaleDateString());

        let imageUrlToUse: string | undefined;

        if (previewText.includes('[Image]') || postForm.image_url) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const images = await sendBackgroundMessage<any[]>({ type: 'images.list' });
          if (!images || images.length === 0) {
            showToast('No images in your library. Please upload one first.', 'error');
            return;
          }
          const random = images[Math.floor(Math.random() * images.length)];

          const composedDataUrl = await composeImageFromUrl(
            random.url,
            previewText.replace(/\[Image\]/g, ''),
            postForm.fontFamily,
            postForm.fontSize,
            postForm.fontColor,
          );

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const uploaded = await sendBackgroundMessage<any>({
            type: 'images.create',
            payload: {
              url: composedDataUrl,
              filename: `composed_${Date.now()}.jpg`,
              size: composedDataUrl.length,
            },
          });
          imageUrlToUse = uploaded.url;
        }

        const finalContent = (postForm.content || '').replace(/\[Image\]/g, '');

        await sendBackgroundMessage({
          type: 'posts.create',
          payload: {
            content: finalContent,
            image_url: imageUrlToUse,
            gender: postForm.gender,
            is_default: false,
          },
        });

        showToast('Post created successfully!', 'success');
        setPostForm(POST_FORM_DEFAULT);
      } catch (error) {
        const msg = getErrorMessage(error);
        logError(error, 'handlePostSubmit');
        showToast(msg, 'error');
      } finally {
        setIsSubmitting(false);
      }
    },
    [postForm, showToast],
  );

  return { postForm, setPostForm, isSubmitting, handlePostSubmit };
}
