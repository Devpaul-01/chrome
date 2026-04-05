import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { sendBackgroundMessage } from '../api';
import HelpTooltip from './HelpTooltip';

export interface MessageGroup {
  id: string;
  name: string;
  gender: 'MALE' | 'FEMALE' | 'NEUTRAL';
  segment_ids: string[];
  created_at: string;
  updated_at: string;
}

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
      gender: 'NEUTRAL' as 'MALE' | 'FEMALE' | 'NEUTRAL',
      segment_ids: [] as string[],
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
        setFormData({ name: '', gender: 'NEUTRAL', segment_ids: [] });
        setEditingId(null);
        chrome.storage.local.remove(GROUP_DRAFT_KEY);
        await loadGroups();
      } catch (err) {
        setError((err as Error).message);
      }
    }

    async function handleDelete(id: string) {
      if (!confirm('Are you sure you want to delete this message group?')) return;

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
        gender: group.gender,
        segment_ids: group.segment_ids,
      });
    }

    return (
      <div className="view-container">
        <h2 ref={headingRef} tabIndex={-1} className="text-lg font-bold text-blueStrong mb-3">
          Message Groups
        </h2>

        <p className="text-xs text-gray-600 mb-5">
          Message Groups are an <strong>advanced</strong> feature for combining individual message
          segments into curated collections with per-gender targeting. Most users should use{' '}
          <strong>Message Templates</strong> instead — groups are useful only when you need
          fine-grained control over which segments are combined per send.
        </p>

        <form onSubmit={handleSubmit} className="card mb-5">
          <h3 className="text-sm font-bold text-textPrimary mb-4">
            {editingId ? 'Edit Group' : 'Create New Group'}
          </h3>

          <label className="block mb-4">
            <span className="flex items-center gap-1 text-xs font-semibold text-textPrimary mb-2">
              Group Name{' '}
              <HelpTooltip label="A name for your own reference — e.g. 'Formal Wishes' or 'Close Friends (Male)'. Not visible to recipients." />
            </span>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Formal Birthday Wishes"
              required
              className="text-field w-full"
            />
          </label>

          <label className="block mb-4">
            <span className="flex items-center gap-1 text-xs font-semibold text-textPrimary mb-2">
              Gender Target{' '}
              <HelpTooltip label="When automation picks a group, it matches the group's gender target to the contact's saved gender. Set to Neutral to use this group as a fallback for any gender." />
            </span>
            <select
              value={formData.gender}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  gender: e.target.value as 'NEUTRAL' | 'MALE' | 'FEMALE',
                })
              }
              className="text-field w-full"
            >
              <option value="NEUTRAL">Neutral (Any)</option>
              <option value="MALE">Male Friends</option>
              <option value="FEMALE">Female Friends</option>
            </select>
          </label>

          <label className="block mb-5">
            <span className="flex items-center gap-1 text-xs font-semibold text-textPrimary mb-2">
              Segment IDs (comma-separated){' '}
              <HelpTooltip label="UUIDs of the individual message segments to include in this group, separated by commas. Most users leave this blank — standard Message Templates don't use this field. Segment IDs can be found in your backend's template segments data." />
            </span>
            <input
              type="text"
              value={formData.segment_ids.join(', ')}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  segment_ids: e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="segment-1, segment-2"
              className="text-field w-full"
            />
          </label>

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
                  setFormData({ name: '', gender: 'NEUTRAL', segment_ids: [] });
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
          <div className="text-center py-8 text-gray-500">Loading message groups...</div>
        ) : (
          <div>
            {groups.length === 0 ? (
              <div className="text-center py-8 text-gray-500 bg-white/80 rounded-lg mb-5">
                No message groups yet. Create your first group above.
              </div>
            ) : (
              <div className="space-y-3 mb-5">
                {groups.map((group) => (
                  <div key={group.id} className="card">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-sm font-bold text-textPrimary">{group.name}</h3>
                          <span className="badge badge-primary text-xs">{group.gender}</span>
                        </div>
                        <p className="text-xs text-gray-600 my-1">
                          <strong>Segments:</strong> {group.segment_ids.length} selected
                        </p>
                      </div>
                      <div className="flex gap-2 ml-2">
                        <button
                          onClick={() => handleEdit(group)}
                          className="btn-secondary text-xs py-1.5 px-3"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(group.id)}
                          className="text-xs py-1.5 px-3 rounded-full bg-red-50 text-red-600 hover:bg-red-100 transition-colors font-medium"
                        >
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
          <button onClick={onClose} className="btn-secondary btn-block">
            ← Back
          </button>
        )}
      </div>
    );
  },
);

MessageGroups.displayName = 'MessageGroups';

export default MessageGroups;
