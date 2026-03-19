import { useCallback, useEffect, useMemo, useState } from 'react';
import { sendBackgroundMessage } from '../api';
import { getErrorMessage, logError } from '../../utils/errors';
import { useAppContext } from '../context/AppContext';
import type { TemplateSegment } from '../../api/client';
import type { SegmentType } from '../../api/client';

const SEGMENT_TYPES: SegmentType[] = ['GREETING', 'BODY', 'CLOSING'];

type TemplateForm = {
  segmentType: SegmentType;
  content: string;
  label: string;
};

export function useTemplateSegments() {
  const { user, showToast } = useAppContext();
  const [templates, setTemplates] = useState<TemplateSegment[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [templateForm, setTemplateForm] = useState<TemplateForm>({
    segmentType: 'GREETING',
    content: '',
    label: '',
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [editingLabel, setEditingLabel] = useState('');

  const loadTemplates = useCallback(async () => {
    setIsLoadingTemplates(true);
    try {
      const data = await sendBackgroundMessage<TemplateSegment[]>({ type: 'templates.list' });
      setTemplates(Array.isArray(data) ? data : []);
    } catch (error) {
      const msg = getErrorMessage(error);
      logError(error, 'loadTemplates');
      showToast(msg, 'error');
      setTemplates([]);
    } finally {
      setIsLoadingTemplates(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!user) {
      setTemplates([]);
      return;
    }
    void loadTemplates();
  }, [user, loadTemplates]);

  const groupedTemplates = useMemo(
    () =>
      SEGMENT_TYPES.reduce<Record<SegmentType, TemplateSegment[]>>(
        (acc, type) => {
          acc[type] = templates.filter((t) => t.segment_type === type);
          return acc;
        },
        { GREETING: [], BODY: [], CLOSING: [] } as Record<SegmentType, TemplateSegment[]>,
      ),
    [templates],
  );

  const handleTemplateSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
      e.preventDefault();
      if (!templateForm.content.trim()) {
        const msg = 'Template content cannot be empty';
        setMessage(msg);
        showToast(msg, 'warning');
        return;
      }
      setIsSubmitting(true);
      setMessage(null);
      try {
        // Optimistic insert
        const tempId = `tmp-${Date.now()}`;
        const temp: TemplateSegment = {
          id: tempId,
          segment_type: templateForm.segmentType,
          content: templateForm.content.trim(),
          label: templateForm.label || undefined,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setTemplates((prev) => [temp, ...prev]);

        await sendBackgroundMessage<TemplateSegment>({
          type: 'templates.create',
          payload: {
            segmentType: templateForm.segmentType,
            content: templateForm.content.trim(),
            label: templateForm.label.trim() || undefined,
          },
        });
        await loadTemplates();
        setTemplateForm((f) => ({ ...f, content: '', label: '' }));
        showToast('Template saved successfully!', 'success');
      } catch (error) {
        const msg = getErrorMessage(error);
        logError(error, 'handleTemplateSubmit');
        setMessage(msg);
        showToast(msg, 'error');
      } finally {
        setIsSubmitting(false);
      }
    },
    [templateForm, loadTemplates, showToast],
  );

  const handleTemplateDelete = useCallback(
    async (id: string): Promise<void> => {
      if (!confirm('Are you sure you want to delete this template?')) return;
      const prev = templates;
      setTemplates((t) => t.filter((item) => item.id !== id));
      try {
        await sendBackgroundMessage<void>({ type: 'templates.delete', payload: { id } });
        showToast('Template deleted', 'success');
      } catch (error) {
        const msg = getErrorMessage(error);
        logError(error, 'handleTemplateDelete');
        setMessage(msg);
        showToast(msg, 'error');
        setTemplates(prev);
      }
    },
    [templates, showToast],
  );

  const handleTemplateUpdate = useCallback(async (): Promise<void> => {
    if (!editingContent.trim()) {
      const msg = 'Content is required';
      setMessage(msg);
      showToast(msg, 'warning');
      return;
    }
    setIsSubmitting(true);
    setMessage(null);
    try {
      await sendBackgroundMessage<TemplateSegment>({
        type: 'templates.update',
        payload: {
          id: editingId!,
          content: editingContent.trim(),
          label: editingLabel.trim() || undefined,
        },
      });
      setEditingId(null);
      setEditingContent('');
      setEditingLabel('');
      await loadTemplates();
      showToast('Template updated successfully!', 'success');
    } catch (error) {
      const msg = getErrorMessage(error);
      logError(error, 'handleTemplateUpdate');
      setMessage(msg);
      showToast(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  }, [editingId, editingContent, editingLabel, loadTemplates, showToast]);

  return {
    templates,
    groupedTemplates,
    isLoadingTemplates,
    isSubmitting,
    message,
    templateForm,
    setTemplateForm,
    editingId,
    setEditingId,
    editingContent,
    setEditingContent,
    editingLabel,
    setEditingLabel,
    loadTemplates,
    handleTemplateSubmit,
    handleTemplateDelete,
    handleTemplateUpdate,
  };
}
