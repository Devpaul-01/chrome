import { useCallback, useEffect, useState } from 'react';
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
  textX?: number;
  textY?: number;
  group_id?: string | null;
};

export type EditingPost = {
  id: string;
  content: string;
  gender: 'MALE' | 'FEMALE' | 'NEUTRAL';
  image_url?: string;
  label?: string;
  font_family?: string;
  font_size?: number;
  font_color?: string;
  group_id?: string | null;
};

const POST_FORM_DEFAULT: PostForm = {
  content: '',
  gender: 'NEUTRAL',
  image_url: '',
  label: '',
  fontFamily: 'Arial',
  fontSize: 48,
  fontColor: '#ffffff',
  textX: 0.5,
  textY: 0.5,
  group_id: null,
};

const POST_DRAFT_KEY = 'bm_post_draft';

export function usePostComposer() {
  const { showToast } = useAppContext();
  const [postForm, setPostForm] = useState<PostForm>(POST_FORM_DEFAULT);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);

  function startEditing(post: EditingPost) {
    setEditingPostId(post.id);
    // post.image_url is a pre-composed JPEG (text baked in). Re-using it as a raw
    // background would render double text in the editor. Clear it and restore the
    // [Image] keyword so the submit step re-composes a fresh image from the library.
    const content = post.image_url ? `${post.content.trim()} [Image]` : post.content;
    setPostForm({
      content,
      gender: post.gender,
      image_url: '',
      label: post.label ?? '',
      fontFamily: post.font_family ?? 'Arial',
      fontSize: post.font_size ?? 48,
      fontColor: post.font_color ?? '#ffffff',
      group_id: post.group_id ?? null,
    });
  }

  function cancelEditing() {
    setEditingPostId(null);
    setPostForm(POST_FORM_DEFAULT);
  }

  // Restore draft from storage on mount (only for new posts, not edits)
  useEffect(() => {
    if (editingPostId) return;
    chrome.storage.local.get(POST_DRAFT_KEY).then((stored) => {
      if (stored[POST_DRAFT_KEY]) {
        setPostForm({ ...POST_FORM_DEFAULT, ...stored[POST_DRAFT_KEY] });
      }
    });
  }, [editingPostId]);

  // Persist draft to storage on change (only for new posts)
  useEffect(() => {
    if (editingPostId) return;
    chrome.storage.local.set({ [POST_DRAFT_KEY]: postForm });
  }, [postForm, editingPostId]);

  const handlePostSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
      e.preventDefault();
      setIsSubmitting(true);
      try {
        const previewText = (postForm.content || '')
          .replace(/\{First_Name\}/g, 'John')
          .replace(/\{Last_Name\}/g, 'Doe')
          .replace(/\{Today\}/g, new Date().toLocaleDateString());

        let imageUrlToUse: string | undefined = postForm.image_url || undefined;

        const hasImageKeyword = previewText.includes('[Image]');

        if (postForm.image_url) {
          // User directly attached an image — compose text onto it; no library needed
          const composedDataUrl = await composeImageFromUrl(
            postForm.image_url,
            previewText.replace(/\[Image\]/g, ''),
            postForm.fontFamily,
            postForm.fontSize,
            postForm.fontColor,
            postForm.textX ?? 0.5,
            postForm.textY ?? 0.5,
          );

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const uploaded = await sendBackgroundMessage<any>({
            type: 'images.uploadFile',
            payload: {
              filename: `composed_${Date.now()}.jpg`,
              data: composedDataUrl,
              size: atob(
                composedDataUrl.includes(',') ? composedDataUrl.split(',')[1] : composedDataUrl,
              ).length,
              source: 'post',
            } as import('../../api/client').UploadImageFilePayload,
          });
          imageUrlToUse = uploaded.url;
        } else if (hasImageKeyword) {
          // [Image] keyword with no attached image — pick a random library image
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
            postForm.textX ?? 0.5,
            postForm.textY ?? 0.5,
          );

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const uploaded = await sendBackgroundMessage<any>({
            type: 'images.uploadFile',
            payload: {
              filename: `composed_${Date.now()}.jpg`,
              data: composedDataUrl,
              size: atob(
                composedDataUrl.includes(',') ? composedDataUrl.split(',')[1] : composedDataUrl,
              ).length,
              source: 'post',
            } as import('../../api/client').UploadImageFilePayload,
          });
          imageUrlToUse = uploaded.url;
        }
        // else: text-only post — no image processing needed

        const finalContent = (postForm.content || '').replace(/\[Image\]/g, '').trim();

        const sharedPayload = {
          content: finalContent,
          image_url: imageUrlToUse,
          gender: postForm.gender,
          label: postForm.label,
          font_family: postForm.fontFamily,
          font_size: postForm.fontSize,
          font_color: postForm.fontColor,
          group_id: postForm.group_id,
        };

        if (editingPostId) {
          await sendBackgroundMessage({
            type: 'posts.update',
            payload: { id: editingPostId, ...sharedPayload },
          });
          showToast('Post updated successfully!', 'success');
          setEditingPostId(null);
        } else {
          await sendBackgroundMessage({
            type: 'posts.create',
            payload: { ...sharedPayload, is_default: false },
          });
          showToast('Post created successfully!', 'success');
          chrome.storage.local.remove(POST_DRAFT_KEY);
        }
        setPostForm(POST_FORM_DEFAULT);
      } catch (error) {
        const msg = getErrorMessage(error);
        logError(error, 'handlePostSubmit');
        showToast(msg, 'error');
      } finally {
        setIsSubmitting(false);
      }
    },
    [postForm, editingPostId, showToast],
  );

  return {
    postForm,
    setPostForm,
    isSubmitting,
    handlePostSubmit,
    editingPostId,
    startEditing,
    cancelEditing,
  };
}
