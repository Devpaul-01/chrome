import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { sendBackgroundMessage } from '../api';
import Spinner from './Spinner';
import HelpTooltip from './HelpTooltip';
import FeatureTip from './FeatureTip';
import type { MessageGroup } from './MessageGroups';

export interface Post {
  id: string;
  content: string;
  gender: 'MALE' | 'FEMALE' | 'NEUTRAL';
  image_url?: string;
  label: string;
  font_family?: string;
  font_size?: number;
  font_color?: string;
  group_id?: string | null;
  created_at: string;
  updated_at: string;
}

interface PostListProps {
  onClose: () => void;
  onEdit?: (post: Post) => void;
}

interface PostListPropsExtended extends PostListProps {
  showClose?: boolean;
}

export interface PostListHandle {
  focus: () => void;
}

const PostList = forwardRef<PostListHandle, PostListPropsExtended>(
  ({ onClose, showClose = true, onEdit }, ref) => {
    const headingRef = useRef<HTMLHeadingElement>(null);
    const [posts, setPosts] = useState<Post[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<'labelAsc' | 'labelDesc' | 'createdAsc' | 'createdDesc'>(
      'createdDesc',
    );
    const [groups, setGroups] = useState<MessageGroup[]>([]);
    const [filterGroupId, setFilterGroupId] = useState<string>('');

    useImperativeHandle(ref, () => ({
      focus: () => {
        headingRef.current?.focus();
      },
    }));

    useEffect(() => {
      loadPosts();
      headingRef.current?.focus();
      sendBackgroundMessage<MessageGroup[]>({ type: 'messageGroups.list' })
        .then(setGroups)
        .catch(() => {});
    }, []);

    async function loadPosts() {
      setIsLoading(true);
      setError(null);
      try {
        const data = await sendBackgroundMessage<Post[]>({
          type: 'posts.list',
        });
        setPosts(data);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setIsLoading(false);
      }
    }

    async function handleDelete(id: string) {
      if (!confirm('Are you sure you want to delete this post?')) return;

      try {
        await sendBackgroundMessage<void>({
          type: 'posts.delete',
          payload: { id },
        });
        await loadPosts();
      } catch (err) {
        setError((err as Error).message);
      }
    }

    const filteredPosts = filterGroupId
      ? posts.filter((p) =>
          filterGroupId === '__none__' ? !p.group_id : p.group_id === filterGroupId,
        )
      : posts;

    // Sort filtered posts according to sortBy selection
    const sortedPosts = [...filteredPosts];
    if (sortBy === 'labelAsc') {
      sortedPosts.sort((a, b) =>
        (a.label || '').localeCompare(b.label || '', undefined, { sensitivity: 'base' }),
      );
    } else if (sortBy === 'labelDesc') {
      sortedPosts.sort((a, b) =>
        (b.label || '').localeCompare(a.label || '', undefined, { sensitivity: 'base' }),
      );
    } else if (sortBy === 'createdAsc') {
      sortedPosts.sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
    } else if (sortBy === 'createdDesc') {
      sortedPosts.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    }

    return (
      <div className="view-container">
        <h2 ref={headingRef} tabIndex={-1} className="text-lg font-bold text-blueStrong mb-3">
          Birthday Posts ({posts.length}){' '}
          <HelpTooltip label="Your saved timeline post templates. These are posted to friends' Facebook walls on their birthdays. If you have multiple posts, one is chosen at random for variety." />
        </h2>

        <p className="text-xs text-gray-600 mb-5">
          Manage your Facebook wall post templates. These will be posted to friends&apos; timelines
          on their birthdays.
        </p>

        <FeatureTip
          tipId="post_library_intro"
          message="Create post templates that will be posted on friends' timelines. The more templates you have, the more varied your birthday posts will be."
        />

        <div className="card mb-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Gender filter — commented out, feature not currently needed */}
            {/* <label className="block">
              <span className="text-xs font-semibold text-textPrimary mb-2 block">
                Filter by Gender
              </span>
              <select
                value={filterGender}
                onChange={(e) =>
                  setFilterGender(e.target.value as 'ALL' | 'MALE' | 'FEMALE' | 'NEUTRAL')
                }
                className="text-field w-full"
              >
                <option value="ALL">All Genders</option>
                <option value="NEUTRAL">Neutral</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
              </select>
            </label> */}

            {groups.length > 0 && (
              <label className="block">
                <span className="text-xs font-semibold text-textPrimary mb-2 block">
                  Filter by Group
                </span>
                <select
                  value={filterGroupId}
                  onChange={(e) => setFilterGroupId(e.target.value)}
                  className="text-field w-full"
                  aria-label="Filter posts by group"
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
            )}

            <label className="block">
              <span className="text-xs font-semibold text-textPrimary mb-2 block">Sort by</span>
              <select
                value={sortBy}
                onChange={(e) =>
                  setSortBy(
                    e.target.value as 'labelAsc' | 'labelDesc' | 'createdAsc' | 'createdDesc',
                  )
                }
                className="text-field w-full"
                aria-label="Sort posts"
              >
                <option value="labelAsc">Label (A → Z)</option>
                <option value="labelDesc">Label (Z → A)</option>
                <option value="createdDesc">Newest</option>
                <option value="createdAsc">Oldest</option>
              </select>
            </label>
          </div>
        </div>

        {error && (
          <div className="error mb-4" role="alert">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner size="md" message="Loading posts..." />
          </div>
        ) : (
          <div>
            {filteredPosts.length === 0 ? (
              <div className="text-center py-8 text-gray-500 bg-white/80 rounded-lg">
                <p className="mb-3">No posts yet. Create your first timeline post.</p>
                <button onClick={onClose} className="btn-primary text-sm py-2 px-4">
                  + Create Post
                </button>
              </div>
            ) : (
              <>
                {/* Gender-grouped display — commented out, showing flat list instead */}
                {sortedPosts.map((post) => (
                  <div key={post.id} className="card mb-3">
                    <div className="mb-3">
                      <div className="flex items-start justify-between mb-2">
                        <strong className="text-sm text-textPrimary flex-1">
                          {post.label || 'Untitled Post'}
                        </strong>
                        {/* <span className="badge badge-primary text-xs ml-2">
                                {post.gender}
                              </span> */}
                        {post.group_id &&
                          (() => {
                            const group = groups.find((g) => g.id === post.group_id);
                            return group ? (
                              <span
                                className="text-xs ml-2 px-2 py-0.5 rounded-full font-medium flex items-center gap-1"
                                style={{ backgroundColor: group.color + '22', color: group.color }}
                              >
                                <span
                                  className="w-2 h-2 rounded-full inline-block"
                                  style={{ backgroundColor: group.color }}
                                />
                                {group.name}
                              </span>
                            ) : null;
                          })()}
                      </div>
                    </div>

                    <div className="mb-3">
                      {expandedId === post.id ? (
                        <div>
                          <p className="whitespace-pre-wrap my-2 p-3 bg-surfaceSection rounded-lg text-sm text-textPrimary">
                            {post.content}
                          </p>
                          {post.image_url && (
                            <div className="mt-2">
                              <img
                                src={post.image_url}
                                alt="Post image preview"
                                className="rounded-lg max-h-32 object-cover w-full"
                              />
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-gray-600 text-sm overflow-hidden overflow-ellipsis whitespace-nowrap">
                          {post.content.substring(0, 60)}
                          {post.content.length > 60 ? '...' : ''}
                        </p>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => setExpandedId(expandedId === post.id ? null : post.id)}
                        className="btn text-xs py-1.5 px-3"
                      >
                        {expandedId === post.id ? '▲ Collapse' : '▼ Expand'}
                      </button>
                      {onEdit && (
                        <button onClick={() => onEdit(post)} className="btn-sm-blue">
                          Edit
                        </button>
                      )}
                      <button onClick={() => handleDelete(post.id)} className="btn-sm-danger">
                        Delete
                      </button>
                    </div>

                    <div className="mt-3 text-xs text-gray-400">
                      Created: {new Date(post.created_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {showClose && (
          <button onClick={onClose} className="btn btn-block mt-5">
            ← Back
          </button>
        )}
      </div>
    );
  },
);

PostList.displayName = 'PostList';

export default PostList;
