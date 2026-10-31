import { useCallback, useEffect, useState } from 'react';
import { sendBackgroundMessage } from '../api';
import { getErrorMessage, logError } from '../../utils/errors';
import { useAppContext } from '../context/AppContext';
import type { MessageTemplate } from '../../api/client';
import type { SavedTemplate } from '../components/TemplateGallery';
import type { TemplateFormData } from '../components/TemplateCreator';

function toSavedTemplate(t: MessageTemplate): SavedTemplate {
  return {
    id: t.id,
    greeting: t.greeting,
    sentiment: t.sentiment,
    closing: t.closing,
    imageUrl: t.image_url,
    templateTitle: t.title,
    daysInAdvance: t.days_in_advance,
    gender: t.gender as 'MALE' | 'FEMALE' | 'NEUTRAL' | 'ALL',
    groupId: t.group_id ?? null,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  };
}

export function useMessageTemplates(enabled: boolean = true) {
  const { user, showToast } = useAppContext();
  const [messageTemplates, setMessageTemplates] = useState<SavedTemplate[]>([]);
  const [showTemplateCreator, setShowTemplateCreator] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SavedTemplate | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadMessageTemplates = useCallback(async () => {
    try {
      const data = await sendBackgroundMessage<MessageTemplate[]>({
        type: 'messageTemplates.list',
      });
      setMessageTemplates(data.map(toSavedTemplate));
    } catch (error) {
      logError(error, 'loadMessageTemplates');
      setMessageTemplates([]);
    }
  }, []);

  useEffect(() => {
    if (!user || !enabled) {
      setMessageTemplates([]);
      return;
    }
    void loadMessageTemplates();
  }, [user, enabled, loadMessageTemplates]);

  const handleCreateTemplate = useCallback(
    async (data: TemplateFormData): Promise<void> => {
      try {
        await sendBackgroundMessage({
          type: 'messageTemplates.create',
          payload: {
            title: data.templateTitle,
            greeting: data.greeting,
            sentiment: data.sentiment,
            closing: data.closing,
            image_url: data.imageUrl,
            days_in_advance: data.daysInAdvance,
            gender: data.gender,
            group_id: data.groupId,
          },
        });
        await loadMessageTemplates();
        setShowTemplateCreator(false);
        setEditingTemplate(null);
        showToast('Template created successfully!', 'success');
      } catch (error) {
        const msg = getErrorMessage(error);
        logError(error, 'handleCreateTemplate');
        showToast(msg, 'error');
        throw error;
      }
    },
    [loadMessageTemplates, showToast],
  );

  const handleUpdateMessageTemplate = useCallback(
    async (id: string, data: TemplateFormData): Promise<void> => {
      setIsSubmitting(true);
      try {
        await sendBackgroundMessage({
          type: 'messageTemplates.update',
          payload: {
            id,
            title: data.templateTitle,
            greeting: data.greeting,
            sentiment: data.sentiment,
            closing: data.closing,
            image_url: data.imageUrl,
            days_in_advance: data.daysInAdvance,
            gender: data.gender,
            group_id: data.groupId,
          },
        });
        await loadMessageTemplates();
        showToast('Template updated successfully!', 'success');
      } catch (error) {
        const msg = getErrorMessage(error);
        logError(error, 'handleUpdateMessageTemplate');
        showToast(msg, 'error');
        throw error;
      } finally {
        setIsSubmitting(false);
      }
    },
    [loadMessageTemplates, showToast],
  );

  const handleDeleteMessageTemplate = useCallback(
    async (id: string): Promise<void> => {
      if (!confirm('Are you sure you want to delete this template?')) return;
      try {
        await sendBackgroundMessage({ type: 'messageTemplates.delete', payload: { id } });
        await loadMessageTemplates();
        showToast('Template deleted successfully!', 'success');
      } catch (error) {
        const msg = getErrorMessage(error);
        logError(error, 'handleDeleteMessageTemplate');
        showToast(msg, 'error');
      }
    },
    [loadMessageTemplates, showToast],
  );

  return {
    messageTemplates,
    showTemplateCreator,
    setShowTemplateCreator,
    editingTemplate,
    setEditingTemplate,
    isSubmitting,
    loadMessageTemplates,
    handleCreateTemplate,
    handleUpdateMessageTemplate,
    handleDeleteMessageTemplate,
  };
}
