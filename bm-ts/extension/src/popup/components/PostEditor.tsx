import { FormEvent, useEffect, useRef, useState } from 'react';
import FacebookPostPreview from './FacebookPostPreview';

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
    // Replace placeholders for preview
    const previewText = postForm.content
      .replace(/\{First_Name\}/g, 'John')
      .replace(/\{Last_Name\}/g, 'Doe')
      .replace(/\{Today\}/g, new Date().toLocaleDateString())
      .replace(/\[Image\]/g, ''); // Remove [Image] placeholder

    return (
      <div className="space-y-4">
        {/* Facebook-style preview */}
        <FacebookPostPreview
          imageUrl={postForm.image_url}
          text={previewText || 'Add post content to see preview'}
          fontFamily={postForm.fontFamily}
          fontSize={postForm.fontSize}
          fontColor={postForm.fontColor}
        />

        {/* Post metadata */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-xs font-semibold text-gray-700 mb-3">📋 Post Settings</div>
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex justify-between">
              <span className="font-medium">Label:</span>
              <span>{postForm.label || '(empty)'}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Gender Target:</span>
              <span className="capitalize">{postForm.gender.toLowerCase()}</span>
            </div>
          </div>
        </div>

        {/* Raw content with placeholders */}
        <details className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <summary className="text-xs font-semibold text-gray-700 cursor-pointer hover:text-gray-900">
            📝 View Raw Content (with placeholders)
          </summary>
          <div className="mt-3 pt-3 border-t border-gray-200">
            <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono bg-gray-100 p-3 rounded">
              {postForm.content || '(empty)'}
            </pre>
          </div>
        </details>
      </div>
    );
  };

  return (
    <form onSubmit={onSubmit} aria-label="Post editor" className="card">
      <h3 className="text-base font-bold text-blueStrong mb-6 pb-2 border-b border-gray-200">Create Timeline Post</h3>

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-6">
        <button
          type="button"
          onClick={() => setActiveTab('create')}
          className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
            activeTab === 'create'
              ? 'bg-blueStrong text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          ✏️ Create
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('preview')}
          className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
            activeTab === 'preview'
              ? 'bg-blueStrong text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          👀 Preview
        </button>
      </div>

      {activeTab === 'create' ? (
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
        <label className="text-xs font-semibold text-textPrimary mb-2 block">✍️ Post Content</label>

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

      <div className="mb-6">
        <label className="text-xs font-semibold text-textPrimary mb-3 block">
          📸 Post Image
          <span className="text-xs text-gray-500 ml-2">(Auto-resized to 1080×1350px)</span>
        </label>
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center bg-gray-50">
          {isProcessingImage ? (
            <div className="py-6">
              <div className="text-4xl mb-3">⏳</div>
              <p className="text-sm text-gray-600 font-medium">Optimizing image...</p>
              <p className="text-xs text-gray-500 mt-1">Resizing to 1080×1350px</p>
            </div>
          ) : postForm.image_url ? (
            <div className="relative">
              <img
                src={postForm.image_url}
                alt="Post preview"
                className="w-full max-w-md mx-auto rounded shadow-sm"
                style={{ maxHeight: '300px', objectFit: 'contain' }}
              />
              <p className="text-xs text-gray-500 mt-2">1080×1350px (Optimized)</p>
              <button
                type="button"
                onClick={() => setPostForm({ ...postForm, image_url: undefined })}
                className="mt-2 text-sm text-red-600 hover:text-red-800 font-medium"
              >
                Remove Image
              </button>
            </div>
          ) : (
            <>
              <div className="text-4xl mb-3">🖼️</div>
              <p className="text-sm font-medium text-gray-700 mb-1">Click to add an image</p>
              <p className="text-xs text-gray-500 mb-4">
                Will be automatically resized to 1080×1350px
              </p>
              <div className="flex gap-4 justify-center">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSubmitting}
                  className="btn-primary px-6 py-2 text-sm font-medium"
                >
                  Upload Image
                </button>
                <button
                  type="button"
                  onClick={handleGenerateAI}
                  disabled={isSubmitting}
                  className="btn-secondary px-6 py-2 text-sm font-medium"
                >
                  Generate with AI
                </button>
              </div>
            </>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageSelect}
          disabled={isSubmitting}
          style={{ display: 'none' }}
        />
        {imageError && (
          <p className="text-xs text-red-600 mt-2">{imageError}</p>
        )}
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
              Font Size: {postForm.fontSize || 48}px
            </label>
            <input
              type="range"
              min="24"
              max="96"
              step="4"
              value={postForm.fontSize || 48}
              onChange={(e) => setPostForm({ ...postForm, fontSize: parseInt(e.target.value) })}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>Small</span>
              <span>Large</span>
            </div>
          </div>

          {/* Font Color */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-2 block">Text Color</label>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={postForm.fontColor || '#ffffff'}
                onChange={(e) => setPostForm({ ...postForm, fontColor: e.target.value })}
                className="w-12 h-10 rounded cursor-pointer border border-gray-300"
              />
              <div className="flex-1 grid grid-cols-4 gap-1">
                {['#ffffff', '#000000', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'].map(
                  (color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setPostForm({ ...postForm, fontColor: color })}
                      className="w-8 h-8 rounded border-2 hover:scale-110 transition-transform"
                      style={{
                        backgroundColor: color,
                        borderColor: postForm.fontColor === color ? '#f97316' : '#d1d5db',
                      }}
                      title={color}
                    />
                  ),
                )}
              </div>
            </div>
          </div>
        </div>
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
        </>
      ) : (
        renderPreview()
      )}

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
