import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { sendBackgroundMessage } from '../api';
import Spinner from './Spinner';

export interface Post {
  id: string;
  content: string;
  gender: 'MALE' | 'FEMALE' | 'NEUTRAL';
  image_url?: string;
  label: string;
  created_at: string;
  updated_at: string;
}

interface PostListProps {
  onClose: () => void;
}

interface PostListPropsExtended extends PostListProps {
  showClose?: boolean;
}

export interface PostListHandle {
  focus: () => void;
}

const PostList = forwardRef<PostListHandle, PostListPropsExtended>(
  ({ onClose, showClose = true }, ref) => {
    const headingRef = useRef<HTMLHeadingElement>(null);
    const [posts, setPosts] = useState<Post[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [filterGender, setFilterGender] = useState<'ALL' | 'MALE' | 'FEMALE' | 'NEUTRAL'>('ALL');
    const [sortBy, setSortBy] = useState<'labelAsc' | 'labelDesc' | 'createdAsc' | 'createdDesc'>(
      'labelAsc',
    );

    useImperativeHandle(ref, () => ({
      focus: () => {
        headingRef.current?.focus();
      },
    }));

    useEffect(() => {
      loadPosts();
      headingRef.current?.focus();
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

    const filteredPosts = posts.filter(
      (post) => filterGender === 'ALL' || post.gender === filterGender,
    );

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

    const groupedPosts = {
      MALE: sortedPosts.filter((p) => p.gender === 'MALE'),
      FEMALE: sortedPosts.filter((p) => p.gender === 'FEMALE'),
      NEUTRAL: sortedPosts.filter((p) => p.gender === 'NEUTRAL'),
    };

    return (
      <div className="view-container">
        <h2 ref={headingRef} tabIndex={-1} className="text-lg font-bold text-blueStrong mb-3">
          Birthday Posts
        </h2>

        <p className="text-xs text-gray-600 mb-5">
          Manage your Facebook wall post templates. These will be posted to friends' timelines on
          their birthdays.
        </p>

        <div className="card mb-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-semibold text-textPrimary mb-2 block">
                Filter by Gender
              </span>
              <select
                value={filterGender}
                onChange={(e) => setFilterGender(e.target.value as any)}
                className="text-field w-full"
              >
                <option value="ALL">All Genders</option>
                <option value="NEUTRAL">Neutral</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-textPrimary mb-2 block">Sort by</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
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
              <div className="text-center py-8 text-gray-500 bg-white bg-opacity-80 rounded-lg">
                No posts found. Create your first post to get started.
              </div>
            ) : (
              <>
                {(['NEUTRAL', 'MALE', 'FEMALE'] as const).map((gender) => {
                  const genderPosts = groupedPosts[gender];
                  if (genderPosts.length === 0) return null;

                  const genderLabel =
                    gender === 'MALE' ? 'Male' : gender === 'FEMALE' ? 'Female' : 'All';
                  const genderEmoji =
                    gender === 'MALE' ? '♂️' : gender === 'FEMALE' ? '♀️' : '✨';

                  return (
                    <div key={gender} className="mb-6">
                      <h3 className="text-sm font-bold text-textPrimary mb-3 pb-2 border-b-2 border-orangeBrand">
                        {genderEmoji} {genderLabel} Posts ({genderPosts.length})
                      </h3>

                      {genderPosts.map((post) => (
                        <div key={post.id} className="card mb-3">
                          <div className="mb-3">
                            <div className="flex items-start justify-between mb-2">
                              <strong className="text-sm text-textPrimary flex-1">
                                {post.label || 'Untitled Post'}
                              </strong>
                              <span className="badge badge-primary text-xs ml-2">
                                {post.gender}
                              </span>
                            </div>
                          </div>

                          <div className="mb-3">
                            {expandedId === post.id ? (
                              <div>
                                <p className="whitespace-pre-wrap my-2 p-3 bg-surfaceSection rounded-lg text-sm text-textPrimary">
                                  {post.content}
                                </p>
                                {post.image_url && (
                                  <p className="text-xs text-gray-600 mt-2">
                                    Image{' '}
                                    <a
                                      href={post.image_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-orange-600 hover:underline"
                                    >
                                      View Image
                                    </a>
                                  </p>
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
                              className="btn-secondary text-xs py-1.5 px-3"
                            >
                              {expandedId === post.id ? '▲ Collapse' : '▼ Expand'}
                            </button>
                            <button
                              onClick={() => handleDelete(post.id)}
                              className="text-xs py-1.5 px-3 rounded-full bg-red-50 text-red-600 hover:bg-red-100 transition-colors font-medium"
                            >
                              Delete
                            </button>
                          </div>

                          <div className="mt-3 text-xs text-gray-400">
                            Created: {new Date(post.created_at).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {showClose && (
          <button onClick={onClose} className="btn-secondary btn-block mt-5">
            ← Back
          </button>
        )}
      </div>
    );
  },
);

PostList.displayName = 'PostList';

export default PostList;
