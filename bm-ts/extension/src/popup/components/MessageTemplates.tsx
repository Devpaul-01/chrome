import { useState } from 'react';
import TemplateCreator, { type TemplateFormData } from './TemplateCreator';
import MessageGroups from './MessageGroups';

type Props = {
  messageTemplates: SavedTemplate[];
  isLoadingTemplates: boolean;
  onCreateMessageTemplate: (data: TemplateFormData) => Promise<void>;
  onUpdateMessageTemplate: (id: string, data: TemplateFormData) => Promise<void>;
  onDeleteMessageTemplate: (id: string) => Promise<void>;
  onBack: () => void;
};

export default function MessageTemplates({
  messageTemplates,
  isLoadingTemplates,
  onCreateMessageTemplate,
  onUpdateMessageTemplate,
  onDeleteMessageTemplate,
  onBack,
}: Props) {
  const [editing, setEditing] = useState<SavedTemplate | null>(null);

  const handleSubmit = async (data: TemplateFormData) => {
    if (editing) {
      await onUpdateMessageTemplate(editing.id, data);
    } else {
      await onCreateMessageTemplate(data);
    }
    setEditing(null);
  };

  return (
    <div className="view-container">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-blueStrong">Message Templates</h2>
        <div />
      </div>

      <div className="mb-6">
        <div className="card mb-4">
          <TemplateCreator
            onSubmit={handleSubmit}
            onCancel={() => setEditing(null)}
            initialData={
              editing
                ? {
                    greeting: editing.greeting,
                    sentiment: editing.sentiment,
                    closing: editing.closing,
                    imageUrl: editing.imageUrl || null,
                    templateTitle: editing.templateTitle,
                    daysInAdvance: editing.daysInAdvance,
                    gender: editing.gender,
                  }
                : undefined
            }
          />
        </div>
      </div>

      <div className="mb-6">
        <MessageGroups onClose={onBack} showClose={false} />
      </div>

      <div className="mt-4">
        <button onClick={onBack} className="btn-secondary btn-block">
          ← Back
        </button>
      </div>
    </div>
  );
}
