import { FormEvent, useEffect, useRef, useState } from 'react';
import FacebookPostPreview from './FacebookPostPreview';
import { useImageLibrary } from '../hooks/useImageLibrary';
import ImageLibraryPicker from './ImageLibraryPicker';

type PostForm = {
  content: string;
  gender: 'MALE' | 'FEMALE' | 'NEUTRAL';
  image_url?: string;
  label: string;
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
};

type Props = {
  postForm: PostForm;
  setPostForm: (f: PostForm) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  isSubmitting: boolean;
  message: string | null;
};

export default function PostEditor({
  postForm,
  setPostForm,
  onSubmit,
  isSubmitting,
  message,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showKeywords, setShowKeywords] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'create' | 'preview'>('create');
  const [isUploadingPreview, setIsUploadingPreview] = useState(false);
  const [librarySaveMsg, setLibrarySaveMsg] = useState<string | null>(null);
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const { images: libraryImages, isLoading: isLoadingLibrary, isFull: libraryFull, saveToLibrary } = useImageLibrary();

  // Optimal post dimensions
  const FACEBOOK_WIDTH = 1080;
  const FACEBOOK_HEIGHT = 1350;

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const contentEmpty = postForm.content.trim().length === 0;

  const resizeImageForFacebook = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          // Create canvas with Facebook optimal dimensions
          const canvas = document.createElement('canvas');
          canvas.width = FACEBOOK_WIDTH;
          canvas.height = FACEBOOK_HEIGHT;
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }

          // Calculate scaling to cover the canvas while maintaining aspect ratio
          const imgAspect = img.width / img.height;
          const canvasAspect = FACEBOOK_WIDTH / FACEBOOK_HEIGHT;

          let drawWidth, drawHeight, offsetX, offsetY;

          if (imgAspect > canvasAspect) {
            // Image is wider than canvas - fit height, crop width
            drawHeight = FACEBOOK_HEIGHT;
            drawWidth = img.width * (FACEBOOK_HEIGHT / img.height);
            offsetX = (FACEBOOK_WIDTH - drawWidth) / 2;
            offsetY = 0;
          } else {
            // Image is taller than canvas - fit width, crop height
            drawWidth = FACEBOOK_WIDTH;
            drawHeight = img.height * (FACEBOOK_WIDTH / img.width);
            offsetX = 0;
            offsetY = (FACEBOOK_HEIGHT - drawHeight) / 2;
          }

          // Fill with white background
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, FACEBOOK_WIDTH, FACEBOOK_HEIGHT);

          // Draw image centered and cropped
          ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

          // Convert to base64 with good quality
          resolve(canvas.toDataURL('image/jpeg', 0.9));
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setImageError('Image size must be less than 10MB');
      return;
    }

    if (!file.type.startsWith('image/')) {
      setImageError('Please select an image file');
      return;
    }

    setIsProcessingImage(true);
    setImageError(null);

    try {
      const resizedImage = await resizeImageForFacebook(file);
      setPostForm({
        ...postForm,
        image_url: resizedImage,
      });
    } catch (err) {
      setImageError('Failed to process image. Please try another file.');
    } finally {
      setIsProcessingImage(false);
    }
  };

  const handleGenerateAI = async () => {
    setImageError('AI image generation coming soon!');
  };

  const insertKeyword = (keyword: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = postForm.content;
    const before = text.substring(0, start);
    const after = text.substring(end);

    setPostForm({
      ...postForm,
      content: before + keyword + after,
    });

    // Set cursor position after keyword
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + keyword.length, start + keyword.length);
    }, 0);
  };

  const renderPreview = () => {
    const previewText = postForm.content
      .replace(/\{First_Name\}/g, 'John')
      .replace(/\{Last_Name\}/g, 'Doe')
      .replace(/\{Today\}/g, new Date().toLocaleDateString());

    const previewImage = postForm.image_url || null;
    const hasImageKeyword = postForm.content.includes('[Image]');
    const libraryPreviewUrl = libraryImages.length > 0 ? libraryImages[0].url : null;

    const handleUploadToLibraryLocal = async () => {
      if (!previewImage) return;
      setIsUploadingPreview(true);
      setLibrarySaveMsg(null);
      try {
        await saveToLibrary(previewImage, `post_${Date.now()}.jpg`);
        setLibrarySaveMsg('✓ Image saved to library');
      } catch (err) {
        setLibrarySaveMsg(`Error: ${(err as Error).message}`);
      } finally {
        setIsUploadingPreview(false);
      }
    };

    if (previewImage) {
      return (
        <div className="space-y-3">
          <div className="relative">
            <img
              src={previewImage}
              alt="Preview"
              className="w-full rounded-lg shadow-md"
              style={{ maxHeight: '400px', objectFit: 'contain' }}
            />
            <div className="mt-2 text-center text-xs text-gray-600">1080×1350px (Optimized)</div>
          </div>
          {librarySaveMsg && (
            <p className={`text-xs font-medium ${librarySaveMsg.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
              {librarySaveMsg}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleUploadToLibraryLocal}
              disabled={isUploadingPreview || libraryFull}
              className="btn-primary flex-1"
              title={libraryFull ? 'Library full (20/20)' : undefined}
            >
              {isUploadingPreview ? 'Saving...' : 'Add to Library'}
            </button>
            <button
              type="button"
              onClick={() => setPostForm({ ...postForm, image_url: '' })}
              disabled={isUploadingPreview}
              className="btn-secondary flex-1"
            >
              Remove
            </button>
          </div>
        </div>
      );
    }

    if (hasImageKeyword && libraryPreviewUrl) {
      return (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 italic">
            Preview uses first library image — a random image will be picked when posting.
          </p>
          <FacebookPostPreview
            imageUrl={libraryPreviewUrl}
            text={previewText.replace(/\[Image\]/g, '')}
            fontFamily={postForm.fontFamily}
            fontSize={postForm.fontSize}
            fontColor={postForm.fontColor}
          />
        </div>
      );
    }

    if (hasImageKeyword && libraryImages.length === 0) {
      return (
        <div className="text-xs text-amber-600 bg-amber-50 rounded p-3">
          ⚠️ [Image] keyword found but your library is empty. Upload images in Image Library first.
        </div>
      );
    }

    return (
      <FacebookPostPreview
        imageUrl={null}
        text={previewText}
        fontFamily={postForm.fontFamily}
        fontSize={postForm.fontSize}
        fontColor={postForm.fontColor}
      />
    );
  };

  return (
    <form onSubmit={onSubmit} aria-label="Post editor" className="card">
      <h3 className="text-base font-bold text-blueStrong mb-6 pb-2 border-b border-gray-200">
        Create Timeline Post
      </h3>

      {activeTab === 'create' && (
        <>
          <label className="block mb-5 mt-5">
            <span className="text-xs font-semibold text-textPrimary mb-2 block">Gender Target</span>
            <select
              value={postForm.gender}
              onChange={(event) => setPostForm({ ...postForm, gender: event.target.value as any })}
              className="text-field w-full"
              aria-label="gender target"
            >
              <option value="NEUTRAL">Neutral (Any)</option>
              <option value="MALE">Male Friends</option>
              <option value="FEMALE">Female Friends</option>
            </select>
          </label>

          <label className="block mb-5">
            <span className="text-xs font-semibold text-textPrimary mb-2 block">
              Label / Description
            </span>
            <input
              type="text"
              value={postForm.label}
              onChange={(event) => setPostForm({ ...postForm, label: event.target.value })}
              placeholder="e.g., Casual Birthday Post"
              className="text-field w-full"
            />
          </label>

          <div className="mb-6">
            <label className="text-xs font-semibold text-textPrimary mb-2 block">
              ✍️ Post Content
            </label>

            <button
              type="button"
              onClick={() => setShowKeywords(!showKeywords)}
              className="btn-secondary text-xs py-2 px-3 mb-3"
            >
              {showKeywords ? '▼' : '▶'} Insert Keyword
            </button>

            {showKeywords && (
              <div className="flex gap-2 mb-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => insertKeyword('{First_Name}')}
                  className="btn-secondary text-xs py-1.5 px-3"
                >
                  {'{First_Name}'}
                </button>
                <button
                  type="button"
                  onClick={() => insertKeyword('{Last_Name}')}
                  className="btn-secondary text-xs py-1.5 px-3"
                >
                  {'{Last_Name}'}
                </button>
                <button
                  type="button"
                  onClick={() => insertKeyword('{Today}')}
                  className="btn-secondary text-xs py-1.5 px-3"
                >
                  {'{Today}'}
                </button>
                <button
                  type="button"
                  onClick={() => insertKeyword('[Image]')}
                  className="btn-secondary text-xs py-1.5 px-3"
                >
                  [Image]
                </button>
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={postForm.content}
              onChange={(event) => setPostForm({ ...postForm, content: event.target.value })}
              className="text-field w-full"
              rows={6}
              placeholder="Write your birthday post... Use {First_Name}, {Last_Name}, {Today}, or [Image]"
            />
          </div>

          {/* Font Customization */}
          <div className="mb-6">
            <label className="text-xs font-semibold text-textPrimary mb-3 block">
              🎨 Text Style (appears on image)
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Font Family */}
              <div>
                <label className="text-xs font-medium text-gray-600 mb-2 block">Font Family</label>
                <select
                  value={postForm.fontFamily || 'Arial'}
                  onChange={(e) => setPostForm({ ...postForm, fontFamily: e.target.value })}
                  className="text-field w-full text-sm"
                >
                  <option value="Arial">Arial</option>
                  <option value="Impact">Impact</option>
                  <option value="Georgia">Georgia</option>
                  <option value="Times New Roman">Times New Roman</option>
                  <option value="Courier New">Courier New</option>
                  <option value="Comic Sans MS">Comic Sans MS</option>
                  <option value="Verdana">Verdana</option>
                  <option value="Trebuchet MS">Trebuchet MS</option>
                </select>
              </div>

              {/* Font Size */}
              <div>
                <label className="text-xs font-medium text-gray-600 mb-2 block">
                  Font Size: {postForm.fontSize || 60}px
                </label>
                <input
                  type="range"
                  min="60"
                  max="100"
                  step="4"
                  value={postForm.fontSize || 60}
                  onChange={(e) => setPostForm({ ...postForm, fontSize: parseInt(e.target.value) })}
                  className="w-full"
                />
              </div>
            </div>
          </div>

          {/* Image */}
          <div className="mb-6">
            <label className="text-xs font-semibold text-textPrimary mb-2 block">
              \ud83d\uddbc\ufe0f Attach Image{' '}
              <span className="text-gray-400 font-normal">(optional \u2014 or use [Image] for random)</span>
            </label>
            {postForm.image_url ? (
              <div>
                <img
                  src={postForm.image_url}
                  alt="Attached"
                  className="w-full rounded-lg shadow-sm mb-2"
                  style={{ maxHeight: '180px', objectFit: 'contain' }}
                />
                <button
                  type="button"
                  onClick={() => setPostForm({ ...postForm, image_url: '' })}
                  className="btn-secondary text-xs py-1 px-3"
                >
                  Remove Image
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessingImage}
                    className="btn-secondary flex-1 text-sm"
                  >
                    {isProcessingImage ? '\u23f3 Processing...' : '\ud83d\udcc1 Upload'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowLibraryPicker(!showLibraryPicker)}
                    className="btn-secondary flex-1 text-sm"
                  >
                    \ud83d\uddbc\ufe0f From Library
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden="true"
                  />
                </div>
                {imageError && <p className="text-xs text-red-600">{imageError}</p>}
                {showLibraryPicker && (
                  <ImageLibraryPicker
                    images={libraryImages}
                    isLoading={isLoadingLibrary}
                    onSelect={(img) => {
                      setPostForm({ ...postForm, image_url: img.url });
                      setShowLibraryPicker(false);
                    }}
                    onClose={() => setShowLibraryPicker(false)}
                    selectedUrl={postForm.image_url}
                  />
                )}
              </div>
            )}
          </div>

          {/* Spacer */}
          <div className="h-6" />

          <div className="bg-white bg-opacity-80 rounded-lg p-5 shadow-sm border border-gray-200">
            <div className="text-xs font-semibold text-textPrimary mb-3">📝 Available Keywords</div>
            <ul className="text-xs text-gray-600 space-y-1 ml-4" style={{ listStyleType: 'disc' }}>
              <li>
                <code className="bg-surfaceSection px-1.5 py-0.5 rounded text-orangeStrong">
                  {'{First_Name}'}
                </code>{' '}
                - Friend's first name
              </li>
              <li>
                <code className="bg-surfaceSection px-1.5 py-0.5 rounded text-orangeStrong">
                  {'{Last_Name}'}
                </code>{' '}
                - Friend's last name
              </li>
              <li>
                <code className="bg-surfaceSection px-1.5 py-0.5 rounded text-orangeStrong">
                  {'{Today}'}
                </code>{' '}
                - Current date
              </li>
              <li>
                <code className="bg-surfaceSection px-1.5 py-0.5 rounded text-orangeStrong">
                  {'[Image]'}
                </code>{' '}
                - Random image from library
              </li>
            </ul>
          </div>

          {/* Live Preview while editing */}
          <div className="mb-6">
            <div className="text-xs font-semibold text-textPrimary mb-2">Preview</div>
            <div>{renderPreview()}</div>
          </div>
        </>
      )}
      {activeTab === 'preview' && renderPreview()}

      {message && (
        <div
          className={message.includes('Error') ? 'error' : 'success'}
          role="alert"
          style={{ marginBottom: '1.5rem', marginTop: '1.5rem' }}
        >
          {message}
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting || contentEmpty}
        className="btn-primary btn-block mb-5 py-3 font-semibold"
      >
        {isSubmitting ? 'Saving...' : 'Save Post'}
      </button>
    </form>
  );
}
