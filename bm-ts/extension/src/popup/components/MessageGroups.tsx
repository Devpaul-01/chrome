import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { sendBackgroundMessage } from '../api';
import HelpTooltip from './HelpTooltip';

export interface MessageGroup {
  id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
}

/** Preset colour palette for group tags. */
const GROUP_COLORS = [
  { value: '#6b7280', label: 'Grey' },
  { value: '#ef4444', label: 'Red' },
  { value: '#f97316', label: 'Orange' },
  { value: '#eab308', label: 'Yellow' },
  { value: '#22c55e', label: 'Green' },
  { value: '#3b82f6', label: 'Blue' },
  { value: '#8b5cf6', label: 'Purple' },
  { value: '#ec4899', label: 'Pink' },
];

interface MessageGroupsProps {
  onClose: () => void;
}

interface MessageGroupsPropsExtended extends MessageGroupsProps {
  showClose?: boolean;
}

export interface MessageGroupsHandle {
  focus: () => void;
}

const GROUP_DRAFT_KEY = 'bm_group_draft';

const MessageGroups = forwardRef<MessageGroupsHandle, MessageGroupsPropsExtended>(
  ({ onClose, showClose = true }, ref) => {
    const headingRef = useRef<HTMLHeadingElement>(null);
    const [groups, setGroups] = useState<MessageGroup[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState({
      name: '',
      color: '#6b7280',
    });

    useImperativeHandle(ref, () => ({
      focus: () => {
        headingRef.current?.focus();
      },
    }));

    useEffect(() => {
      loadGroups();
      headingRef.current?.focus();
      // Restore draft when creating (not editing)
      chrome.storage.local.get(GROUP_DRAFT_KEY).then((stored) => {
        if (stored[GROUP_DRAFT_KEY]) {
          setFormData((prev) => ({ ...prev, ...stored[GROUP_DRAFT_KEY] }));
        }
      });
    }, []);

    // Persist draft on change (only when creating)
    useEffect(() => {
      if (editingId) return;
      chrome.storage.local.set({ [GROUP_DRAFT_KEY]: formData });
    }, [formData, editingId]);

    async function loadGroups() {
      setIsLoading(true);
      setError(null);
      try {
        const data = await sendBackgroundMessage<MessageGroup[]>({
          type: 'messageGroups.list',
        });
        setGroups(data);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setIsLoading(false);
      }
    }

    async function handleSubmit(e: React.FormEvent) {
      e.preventDefault();
      setError(null);

      try {
        if (editingId) {
          await sendBackgroundMessage<void>({
            type: 'messageGroups.update',
            payload: { id: editingId, ...formData },
          });
        } else {
          await sendBackgroundMessage<void>({
            type: 'messageGroups.create',
            payload: formData,
          });
        }

        // Reset form
        setFormData({ name: '', color: '#6b7280' });
        setEditingId(null);
        chrome.storage.local.remove(GROUP_DRAFT_KEY);
        await loadGroups();
      } catch (err) {
        setError((err as Error).message);
      }
    }

    async function handleDelete(id: string) {
      if (
        !confirm(
          'Are you sure you want to delete this group? Templates, posts, and contacts assigned to it will become ungrouped.',
        )
      )
        return;

      try {
        await sendBackgroundMessage<void>({
          type: 'messageGroups.delete',
          payload: { id },
        });
        await loadGroups();
      } catch (err) {
        setError((err as Error).message);
      }
    }

    function handleEdit(group: MessageGroup) {
      setEditingId(group.id);
      setFormData({
        name: group.name,
        color: group.color,
      });
    }

    return (
      <div className="view-container">
        <h2 ref={headingRef} tabIndex={-1} className="text-lg font-bold text-blueStrong mb-3">
          Groups{' '}
          <HelpTooltip label="Groups let you tag message templates, timeline posts, and contacts so that the right messages go to the right people." />
        </h2>

        <p className="text-xs text-gray-600 mb-5">
          Create groups like <strong>Close Friends</strong>, <strong>Family</strong>, or{' '}
          <strong>Coworkers</strong> and assign them to your templates, posts, and contacts.
        </p>

        <form onSubmit={handleSubmit} className="card mb-5">
          <h3 className="text-sm font-bold text-textPrimary mb-4">
            {editingId ? 'Edit Group' : 'Create New Group'}
          </h3>

          <label className="block mb-4">
            <span className="flex items-center gap-1 text-xs font-semibold text-textPrimary mb-2">
              Group Name{' '}
              <HelpTooltip label="A label for your own reference — e.g. 'Close Friends' or 'Family'. Not visible to recipients." />
            </span>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Close Friends"
              required
              className="text-field w-full"
            />
          </label>

          <div className="mb-5">
            <span className="flex items-center gap-1 text-xs font-semibold text-textPrimary mb-2">
              Colour
            </span>
            <div className="flex gap-2 flex-wrap">
              {GROUP_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  title={c.label}
                  onClick={() => setFormData({ ...formData, color: c.value })}
                  className="w-7 h-7 rounded-full border-2 transition-transform"
                  style={{
                    backgroundColor: c.value,
                    borderColor: formData.color === c.value ? '#111827' : 'transparent',
                    transform: formData.color === c.value ? 'scale(1.2)' : 'scale(1)',
                  }}
                  aria-label={c.label}
                  aria-pressed={formData.color === c.value}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button type="submit" className="btn-primary flex-1">
              {editingId ? 'Update Group' : 'Create Group'}
            </button>
            {editingId && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setEditingId(null);
                  setFormData({ name: '', color: '#6b7280' });
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        {error && (
          <div className="error mb-4" role="alert">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-8 text-gray-500">Loading groups...</div>
        ) : (
          <div>
            {groups.length === 0 ? (
              <div className="text-center py-8 text-gray-500 bg-white/80 rounded-lg mb-5">
                No groups yet. Create your first group above.
              </div>
            ) : (
              <div className="space-y-3 mb-5">
                {groups.map((group) => (
                  <div key={group.id} className="card">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full inline-block flex-shrink-0"
                          style={{ backgroundColor: group.color }}
                          aria-hidden="true"
                        />
                        <h3 className="text-sm font-bold text-textPrimary">{group.name}</h3>
                      </div>
                      <div className="flex gap-2 ml-2">
                        <button onClick={() => handleEdit(group)} className="btn-sm-blue">
                          Edit
                        </button>
                        <button onClick={() => handleDelete(group.id)} className="btn-sm-danger">
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {showClose && (
          <button onClick={onClose} className="btn btn-block">
            ← Back
          </button>
        )}
      </div>
    );
  },
);

MessageGroups.displayName = 'MessageGroups';

export default MessageGroups;
