import { FormEvent, useEffect, useRef } from 'react';
import type { SegmentType } from '../../api/client';
import KeywordInserter from './KeywordInserter';

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
  showKeywordInserter?: boolean; // New: enable keyword functionality
};

export default function TemplateEditorEnhanced({
  templateForm,
  setTemplateForm,
  onSubmit,
  isSubmitting,
  message,
  showKeywordInserter = true,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const contentEmpty = templateForm.content.trim().length === 0;

  const insertKeyword = (keyword: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = templateForm.content;
    const before = text.substring(0, start);
    const after = text.substring(end);

    setTemplateForm({
      ...templateForm,
      content: before + keyword + after,
    });

    // Set cursor position after keyword
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + keyword.length, start + keyword.length);
    }, 0);
  };

  return (
    <form onSubmit={onSubmit} aria-label="Template editor" className="card">
      <label style={{ display: 'block', marginBottom: '4px' }}>
        Type
        <select
          value={templateForm.segmentType}
          onChange={(event) =>
            setTemplateForm({ ...templateForm, segmentType: event.target.value as SegmentType })
          }
          className="segment-type"
          aria-label="segment type"
        >
          <option value="GREETING">GREETING</option>
          <option value="BODY">BODY</option>
          <option value="CLOSING">CLOSING</option>
        </select>
      </label>

      <label style={{ display: 'block', margin: '8px 0 4px 0' }}>
        Label / Description
        <input
          type="text"
          value={templateForm.label}
          onChange={(event) => setTemplateForm({ ...templateForm, label: event.target.value })}
          placeholder="e.g., Formal Greeting"
          style={{ width: '100%', marginTop: '4px' }}
        />
      </label>

      <label style={{ display: 'block', margin: '8px 0 4px 0' }}>
        Content
        <textarea
          ref={textareaRef}
          value={templateForm.content}
          onChange={(event) => setTemplateForm({ ...templateForm, content: event.target.value })}
          className="textarea-field"
          rows={4}
          placeholder="Type your message segment... (Use keywords like {First_Name})"
        />
      </label>

      {showKeywordInserter && <KeywordInserter onInsert={insertKeyword} compact />}

      {message && (
        <div
          className={message.includes('Error') ? 'error-message' : 'success-message'}
          role="alert"
          style={{ marginTop: '8px' }}
        >
          {message}
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting || contentEmpty}
        className="button-primary"
        style={{ marginTop: '8px' }}
      >
        {isSubmitting ? 'Saving...' : 'Save Template'}
      </button>
    </form>
  );
}
