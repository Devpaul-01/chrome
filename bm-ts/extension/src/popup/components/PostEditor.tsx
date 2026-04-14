import { FormEvent, useEffect, useRef, useState } from 'react';
import FacebookPostPreview from './FacebookPostPreview';
import { useImageLibrary } from '../hooks/useImageLibrary';
import ImageLibraryPicker from './ImageLibraryPicker';
import HelpTooltip from './HelpTooltip';
import FeatureTip from './FeatureTip';

type PostForm = {
  content: string;
  gender: 'MALE' | 'FEMALE' | 'NEUTRAL';
  image_url?: string;
  label: string;
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
  textX?: number;
  textY?: number;
};

type Props = {
  postForm: PostForm;
  setPostForm: (f: PostForm) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  isSubmitting: boolean;
  message: string | null;
  isEditing?: boolean;
  onCancelEdit?: () => void;
  onViewPosts?: () => void;
};

export default function PostEditor({
  postForm,
  setPostForm,
  onSubmit,
  isSubmitting,
  message,
  isEditing = false,
  onCancelEdit,
  onViewPosts,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const { images: libraryImages, isLoading: isLoadingLibrary } = useImageLibrary();

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
    } catch {
      setImageError('Failed to process image. Please try another file.');
    } finally {
      setIsProcessingImage(false);
    }
  };

  const generatePostContent = async () => {
    setIsGenerating(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const suggestions = [
        'Happy Birthday {First_Name}! 🎂 Wishing you a day filled with joy and all the things you love!',
        'Happy Birthday {First_Name}! Hope this year brings you everything you wished for! 🎉🎈',
        '{First_Name}, wishing you the happiest of birthdays today! Hope your day is as wonderful as you are! 🥳',
        'Happy Birthday to an amazing person! {First_Name}, hope today is everything you deserve and more! 🎂',
        "Sending birthday wishes your way, {First_Name}! Hope you're celebrating surrounded by people who love you! 🎉",
        'Another year, another reason to celebrate! Happy Birthday {First_Name}! Wishing you all the best! 🎈',
        '{First_Name}, may your birthday be as bright and wonderful as the joy you bring to everyone around you! 🎂',
        "It's your special day, {First_Name}! Wishing you a birthday full of laughter, love, and great memories! 🥳",
      ];
      const pick = suggestions[Math.floor(Math.random() * suggestions.length)];
      setPostForm({ ...postForm, content: pick });
    } finally {
      setIsGenerating(false);
    }
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

    if (previewImage) {
      return (
        <div className="space-y-2">
          <FacebookPostPreview
            imageUrl={previewImage}
            text={previewText}
            fontFamily={postForm.fontFamily}
            fontSize={postForm.fontSize}
            fontColor={postForm.fontColor}
            textX={postForm.textX ?? 0.5}
            textY={postForm.textY ?? 0.5}
            onTextPositionChange={(x, y) => setPostForm({ ...postForm, textX: x, textY: y })}
          />
          <p className="text-center text-xs text-gray-400">1080×1350px · drag text to reposition</p>
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
        Create Timeline Post{' '}
        <HelpTooltip label="Timeline posts are written directly on friends' Facebook walls on their birthdays. This is different from message templates, which are sent as private direct messages." />
      </h3>

      <FeatureTip
        tipId="post_editor_intro"
        message="Timeline posts appear directly on your friends' Facebook walls. Use the ✨ Generate button for suggestions, or write your own."
      />

      <>
        <label className="block mb-5">
          <span className="text-xs font-semibold text-textPrimary mb-2 block">
            Label / Description{' '}
            <HelpTooltip label="A private name for this post — not shown to friends. Helps you identify it in your post library, e.g. 'Casual post' or 'Funny birthday'." />
          </span>
          <input
            type="text"
            value={postForm.label}
            onChange={(event) => setPostForm({ ...postForm, label: event.target.value })}
            placeholder="e.g., Casual Birthday Post"
            className="text-field w-full"
            required
          />
        </label>

        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-textPrimary">
              Post Content{' '}
              <HelpTooltip label="Write your birthday post here. Use {First_Name} to insert the friend's first name, {Last_Name} for their last name, or {Today} for today's date." />
            </label>
            <button
              type="button"
              onClick={generatePostContent}
              disabled={isGenerating}
              className="btn-outline-orange"
            >
              {isGenerating ? <>⏳ Generating...</> : <>✨ Generate</>}
            </button>
          </div>

          <div className="flex gap-2 mb-3 flex-wrap" aria-label="Insert keyword">
            <span className="text-xs text-gray-500 self-center">Insert:</span>
            <button
              type="button"
              onClick={() => insertKeyword('{First_Name}')}
              className="btn-sm-blue"
            >
              {'{First_Name}'}
            </button>
            <button
              type="button"
              onClick={() => insertKeyword('{Last_Name}')}
              className="btn-sm-blue"
            >
              {'{Last_Name}'}
            </button>
            <button type="button" onClick={() => insertKeyword('{Today}')} className="btn-sm-blue">
              {'{Today}'}
            </button>
            <button type="button" onClick={() => insertKeyword('[Image]')} className="btn-sm-blue">
              {'[Image]'}
            </button>
          </div>

          <textarea
            ref={textareaRef}
            value={postForm.content}
            onChange={(event) => setPostForm({ ...postForm, content: event.target.value })}
            className="text-field w-full"
            rows={6}
            placeholder="Write your birthday post... Use {First_Name}, {Last_Name}, {Today}, or [Image]"
          />
          <div className="text-right text-xs text-gray-400 mt-1">
            {postForm.content.length} chars
          </div>
        </div>

        {/* Font Customization — only shown when an image is attached */}
        {postForm.image_url || postForm.content.includes('[Image]') ? (
          <div className="mb-6">
            <label className="text-xs font-semibold text-textPrimary mb-3 block">
              🎨 Text Style (appears on image){' '}
              <HelpTooltip label="Font customisation only applies when an image is attached. The text is overlaid on the image in the preview. Without an image, these settings have no visible effect." />
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
                  Font Size: {postForm.fontSize || 48}px
                </label>
                <input
                  type="range"
                  min="48"
                  max="96"
                  step="4"
                  value={postForm.fontSize || 48}
                  onChange={(e) => setPostForm({ ...postForm, fontSize: parseInt(e.target.value) })}
                  className="w-full"
                />
              </div>

              {/* Font Color */}
              <div>
                <label className="text-xs font-medium text-gray-600 mb-2 block">Font Color</label>
                <input
                  type="color"
                  value={postForm.fontColor || '#ffffff'}
                  onChange={(e) => setPostForm({ ...postForm, fontColor: e.target.value })}
                  className="w-full h-9 rounded cursor-pointer border border-gray-200"
                  title="Pick text colour for image overlay"
                />
              </div>
            </div>
          </div>
        ) : null}

        {/* Image */}
        <div className="mb-6">
          <label className="text-xs font-semibold text-textPrimary mb-2 block">
            🖼️ Attach Image{' '}
            <HelpTooltip label="Upload a specific image for this post, or pick one from your Image Library. Alternatively, use [Image] in your post content to have a random library image inserted at send time." />{' '}
            <span className="text-gray-400 font-normal">
              (optional — or use [Image] for random)
            </span>
          </label>
          {postForm.image_url ? (
            <div className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg border border-gray-200">
              <img
                src={postForm.image_url}
                alt="Selected image"
                className="w-12 h-12 object-cover rounded flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-700 font-medium">Image attached</p>
                <p className="text-xs text-gray-400">Preview shown below</p>
              </div>
              <button
                type="button"
                onClick={() => setPostForm({ ...postForm, image_url: '' })}
                className="flex-shrink-0 rounded-md bg-gray-600 hover:bg-gray-700 active:bg-gray-800 text-white text-xs font-semibold px-3 py-1 transition-colors"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isProcessingImage}
                  className="btn flex-1 text-sm"
                >
                  {isProcessingImage ? '⏳ Resizing to 1080×1350…' : '📁 Upload'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowLibraryPicker(!showLibraryPicker)}
                  className="btn flex-1 text-sm"
                >
                  🖼️ From Library
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

        {/* Live Preview while editing */}
        <div className="mb-6">
          <div className="text-xs font-semibold text-textPrimary mb-2">Preview</div>
          <div>{renderPreview()}</div>
        </div>
      </>

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
        aria-busy={isSubmitting ? 'true' : 'false'}
        aria-disabled={isSubmitting || contentEmpty ? 'true' : 'false'}
        className="btn-primary btn-block mb-3 py-3 font-semibold"
      >
        {isSubmitting ? 'Saving...' : isEditing ? 'Update Post' : 'Save Post'}
      </button>

      {isEditing && onCancelEdit && (
        <button
          type="button"
          onClick={onCancelEdit}
          className="btn-secondary btn-block mb-3 py-3 font-semibold"
        >
          Cancel Edit
        </button>
      )}

      {!isEditing && onViewPosts && (
        <button
          type="button"
          onClick={onViewPosts}
          className="btn-secondary btn-block mb-5 py-3 font-semibold"
        >
          View Birthday Posts
        </button>
      )}
    </form>
  );
}
