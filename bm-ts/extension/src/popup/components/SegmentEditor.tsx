import { useEffect, useRef } from 'react';

import KeywordInserter from './KeywordInserter';

type Props = {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  rows?: number;
  ariaLabel?: string;
  maxLength?: number;
  showKeywordInserter?: boolean;
};

export default function SegmentEditor({
  content,
  onChange,
  placeholder,
  rows = 3,
  ariaLabel = 'Segment content',
  maxLength = 500,
  showKeywordInserter = true,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    // keep focus behavior for embedded editors minimal - do not auto-focus when mounted
  }, []);

  const contentLength = content.length;
  const contentTouched = contentLength > 0;
  const contentTooLong = contentLength > maxLength;

  const insertKeyword = (keyword: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = content.substring(0, start);
    const after = content.substring(end);
    const next = before + keyword + after;
    onChange(next);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + keyword.length, start + keyword.length);
    }, 0);
  };

  return (
    <div>
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        aria-label={ariaLabel}
        placeholder={placeholder}
        className={`w-full px-3 py-2 rounded-lg focus:outline-none input-styled ${
          contentTouched && contentTooLong ? '!border-red-500' : ''
        }`}
      />

      <div className="flex justify-between text-xs mt-1" aria-live="polite">
        <span className={contentTooLong ? 'text-red-600' : 'text-gray-500'}>
          {contentLength} / {maxLength} characters
        </span>
        {showKeywordInserter && <KeywordInserter onInsert={insertKeyword} compact />}
      </div>
      {contentTooLong && (
        <p className="text-sm text-red-600 mb-2" role="alert">
          Content is too long. Please keep it under {maxLength} characters.
        </p>
      )}
    </div>
  );
}
