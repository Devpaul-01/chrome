import type { TemplateSegment, SegmentType } from '../../api/client';

type Props = {
  groupedTemplates: Record<SegmentType, TemplateSegment[]>;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  editingContent: string;
  setEditingContent: (s: string) => void;
  editingLabel: string;
  setEditingLabel: (s: string) => void;
  handleTemplateUpdate: (id: string) => Promise<void>;
  handleTemplateDelete: (id: string) => Promise<void>;
};

export default function TemplateList({
  groupedTemplates,
  editingId,
  setEditingId,
  editingContent,
  setEditingContent,
  editingLabel,
  setEditingLabel,
  handleTemplateUpdate,
  handleTemplateDelete,
}: Props) {
  return (
    <div>
      {(['GREETING', 'BODY', 'CLOSING'] as SegmentType[]).map((type) => (
        <div key={type} style={{ marginBottom: '12px' }}>
          <h3 style={{ marginBottom: '4px' }}>{type}</h3>
          {groupedTemplates[type].length === 0 ? (
            <p style={{ marginTop: 0 }}>No entries yet.</p>
          ) : (
            groupedTemplates[type].map((segment) => (
              <div
                key={segment.id}
                style={{
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  marginBottom: '6px',
                }}
              >
                {editingId === segment.id ? (
                  <div>
                    <textarea
                      value={editingContent}
                      onChange={(event) => setEditingContent(event.target.value)}
                      rows={2}
                      style={{ width: '100%', marginBottom: '4px' }}
                      aria-label={`edit-content-${segment.id}`}
                    />
                    <input
                      value={editingLabel}
                      onChange={(event) => setEditingLabel(event.target.value)}
                      placeholder="Label"
                      style={{ width: '100%', marginBottom: '4px' }}
                      aria-label={`edit-label-${segment.id}`}
                    />
                    <button
                      onClick={() => void handleTemplateUpdate(segment.id)}
                      style={{ marginRight: '4px' }}
                    >
                      Save
                    </button>
                    <button onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                ) : (
                  <>
                    <p style={{ margin: '0 0 4px 0' }}>{segment.content}</p>
                    <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#666' }}>
                      {segment.label || '(no label)'} ·{' '}
                      {new Date(segment.updated_at).toLocaleDateString()}
                    </p>

                    <button
                      onClick={() => {
                        setEditingId(segment.id);
                        setEditingContent(segment.content);
                        setEditingLabel(segment.label ?? '');
                      }}
                      style={{ marginRight: '4px' }}
                    >
                      Edit
                    </button>
                    <button onClick={() => void handleTemplateDelete(segment.id)}>Delete</button>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      ))}
    </div>
  );
}
