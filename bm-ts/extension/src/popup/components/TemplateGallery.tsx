import { useEffect, useState } from 'react';
import HelpTooltip from './HelpTooltip';
import FeatureTip from './FeatureTip';
import { sendBackgroundMessage } from '../api';
import type { MessageGroup } from './MessageGroups';

export type SavedTemplate = {
  id: string;
  greeting: string;
  sentiment: string;
  closing: string;
  imageUrl: string | null;
  templateTitle: string;
  daysInAdvance: number;
  gender: 'MALE' | 'FEMALE' | 'NEUTRAL' | 'ALL';
  groupId: string | null;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  templates: SavedTemplate[];
  onEdit: (template: SavedTemplate) => void;
  onDelete: (templateId: string) => void;
  onCreate?: () => void;
  showHeader?: boolean;
};

export default function TemplateGallery({
  templates,
  onEdit,
  onDelete,
  onCreate,
  showHeader = true,
}: Props) {
  const [groups, setGroups] = useState<MessageGroup[]>([]);
  const [filterGroupId, setFilterGroupId] = useState<string>('');

  useEffect(() => {
    sendBackgroundMessage<MessageGroup[]>({ type: 'messageGroups.list' })
      .then(setGroups)
      .catch(() => {});
  }, []);

  const filteredTemplates = filterGroupId
    ? templates.filter((t) =>
        filterGroupId === '__none__' ? !t.groupId : t.groupId === filterGroupId,
      )
    : templates;
  const getPreviewText = (template: SavedTemplate) => {
    const parts = [template.greeting, template.sentiment, template.closing].filter(Boolean);
    return parts.join(' ').substring(0, 100) + (parts.join(' ').length > 100 ? '...' : '');
  };

  const getDaysText = (days: number) => {
    if (days === 0) return 'On birthday';
    if (days > 0) return `${days} day${days !== 1 ? 's' : ''} early`;
    return `${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''} late`;
  };

  return (
    <div className="p-4">
      {showHeader && (
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-800">
            Message Templates{' '}
            <HelpTooltip label="Templates are used for automated birthday messages sent as private direct messages. Each template has a greeting, message body, and closing. If you have multiple templates, one is picked at random for variety." />
          </h2>
          {onCreate && (
            <div>
              <button onClick={onCreate} className="btn-orange">
                Create Template
              </button>
            </div>
          )}
        </div>
      )}

      {groups.length > 0 && (
        <div className="card mb-5">
          <label className="block">
            <span className="text-xs font-semibold text-textPrimary mb-2 block">
              Filter by Group
            </span>
            <select
              value={filterGroupId}
              onChange={(e) => setFilterGroupId(e.target.value)}
              className="text-field w-full"
              aria-label="Filter templates by group"
            >
              <option value="">All Groups</option>
              <option value="__none__">Ungrouped</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {filteredTemplates.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-500 mb-4">No templates yet.</p>
          <FeatureTip
            tipId="template_gallery_empty"
            message="Create your first message template to start sending personalised birthday wishes automatically."
          />
          {onCreate && (
            <button onClick={onCreate} className="btn-orange">
              Create Template
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map((template) => (
            <div
              key={template.id}
              className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition-shadow bg-white"
            >
              {/* Template Thumbnail */}
              <div className="relative h-40 bg-gradient-to-br from-blue-50 to-orange-50">
                {template.imageUrl ? (
                  <img
                    src={template.imageUrl}
                    alt={template.templateTitle}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <span className="text-6xl">🎉</span>
                  </div>
                )}
                {/* Gender & Days Badge */}
                <div className="absolute top-2 right-2 bg-white/90 px-2 py-1 rounded text-xs font-medium">
                  {getDaysText(template.daysInAdvance)}
                </div>
                {/* Gender badge — commented out, feature not currently needed */}
                {/* {template.gender !== 'ALL' && (
                  <div className="absolute top-2 left-2 bg-white/90 px-2 py-1 rounded text-xs font-medium capitalize">
                    {template.gender}
                  </div>
                )} */}
                {template.groupId &&
                  (() => {
                    const group = groups.find((g) => g.id === template.groupId);
                    return group ? (
                      <div className="absolute top-2 left-2 bg-white/90 px-2 py-1 rounded text-xs font-medium flex items-center gap-1">
                        <span
                          className="w-2 h-2 rounded-full inline-block"
                          style={{ backgroundColor: group.color }}
                        />
                        {group.name}
                      </div>
                    ) : null;
                  })()}
              </div>

              {/* Template Info */}
              <div className="p-4">
                <h3 className="font-semibold text-gray-800 mb-1 truncate">
                  {template.templateTitle}
                </h3>
                <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                  {getPreviewText(template)}
                </p>

                {/* Metadata */}
                <div className="text-xs text-gray-500 mb-3">
                  <span className="mr-3">✉️ {template.greeting ? '1' : '0'} greeting</span>
                  <span className="mr-3">💬 {template.sentiment ? '1' : '0'} message</span>
                  <span>🎊 {template.closing ? '1' : '0'} closing</span>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => onEdit(template)}
                    className="flex-1 btn-outline-orange text-sm py-1"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => onDelete(template.id)}
                    className="flex-1 bg-red-50 text-red-600 hover:bg-red-100 rounded-md text-sm py-1 transition"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Updated timestamp */}
              <div className="px-4 pb-3 text-xs text-gray-400">
                Updated: {new Date(template.updatedAt).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
