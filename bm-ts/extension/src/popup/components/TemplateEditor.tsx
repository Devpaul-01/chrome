import { FormEvent, useEffect, useRef, useState } from 'react';
import type { SegmentType } from '../../api/client';
import Spinner from './Spinner';
import { ariaBoolean, generateId } from '../../utils/accessibility';

type TemplateForm = {
  segmentType: SegmentType;
  content: string;
  label: string;
};

type Props = {
  templateForm: TemplateForm;
  setTemplateForm: (f: TemplateForm) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  isSubmitting: boolean;
  message: string | null;
};

export default function TemplateEditor({
  templateForm,
  setTemplateForm,
  onSubmit,
  isSubmitting,
  message,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [contentErrorId] = useState(() => generateId('content-error'));

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const contentEmpty = templateForm.content.trim().length === 0;
  const contentTouched = templateForm.content.length > 0;
  const contentLength = templateForm.content.length;
  const MAX_CONTENT_LENGTH = 500; // Facebook message limit is around 500 chars for comments
  const contentTooLong = contentLength > MAX_CONTENT_LENGTH;
  const contentValid = contentTouched && !contentEmpty && !contentTooLong;

  return (
    <form onSubmit={onSubmit} aria-label="Template editor" className="card">
      <label style={{ display: 'block', marginBottom: '4px' }}>
        <span className="text-sm font-medium text-textPrimary">Type</span>
        <select
          value={templateForm.segmentType}
          onChange={(event) =>
            setTemplateForm({ ...templateForm, segmentType: event.target.value as SegmentType })
          }
          className="segment-type"
          aria-label="Template segment type"
        >
          <option value="GREETING">GREETING</option>
          <option value="BODY">BODY</option>
          <option value="CLOSING">CLOSING</option>
        </select>
      </label>

      <label style={{ display: 'block', marginBottom: '4px' }}>
        <span className="text-sm font-medium text-textPrimary">Content</span>
        <textarea
          ref={textareaRef}
          value={templateForm.content}
          onChange={(event) => setTemplateForm({ ...templateForm, content: event.target.value })}
          rows={3}
          required
          aria-required="true"
          aria-label="Template content"
          aria-invalid={ariaBoolean(contentTouched && !contentValid)}
          aria-describedby={contentTouched && !contentValid ? contentErrorId : 'content-counter'}
          placeholder="Enter your template message..."
          className={`input border rounded ${
            contentTouched && contentTooLong ? 'border-red-500' : 'border-gray-300'
          }`}
        />
        <div id="content-counter" className="flex justify-between text-xs mt-1" aria-live="polite">
          <span className={contentTooLong ? 'text-red-600' : 'text-gray-500'}>
            {contentLength} / {MAX_CONTENT_LENGTH} characters
          </span>
          {contentValid && (
            <span className="text-green-600">
              <span aria-hidden="true">Saved</span>
              <span className="ml-1">Valid</span>
            </span>
          )}
        </div>
      </label>

      {contentTouched && contentEmpty && (
        <p id={contentErrorId} className="text-sm text-red-600 mb-2" role="alert">
          Template content cannot be empty
        </p>
      )}
      {contentTooLong && (
        <p id={contentErrorId} className="text-sm text-red-600 mb-2" role="alert">
          Content is too long. Please keep it under {MAX_CONTENT_LENGTH} characters.
        </p>
      )}

      <label style={{ display: 'block', marginBottom: '8px' }}>
        <span className="text-sm font-medium text-textPrimary">Label (optional)</span>
        <input
          value={templateForm.label}
          onChange={(event) => setTemplateForm({ ...templateForm, label: event.target.value })}
          className="input"
          aria-label="Template label (optional identifier)"
          placeholder="e.g., Casual, Formal, Funny"
        />
      </label>

      {message && (
        <div
          className="bg-red-100 text-[#611a15] p-2 rounded mb-3"
          role="alert"
          aria-live="assertive"
        >
          {message}
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting || !contentValid}
        className="btn-primary btn-block flex items-center justify-center gap-2"
        aria-busy={ariaBoolean(isSubmitting)}
        aria-disabled={ariaBoolean(isSubmitting || !contentValid)}
        title={!contentValid ? 'Please fix validation errors before submitting' : ''}
      >
        {isSubmitting && <Spinner size="sm" />}
        <span>{isSubmitting ? 'Saving...' : 'Save Segment'}</span>
      </button>
    </form>
  );
}
