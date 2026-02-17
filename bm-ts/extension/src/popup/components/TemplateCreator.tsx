import { useState, FormEvent, useRef } from 'react';
import Spinner from './Spinner';
import FacebookPostPreview from './FacebookPostPreview';

export type TemplateFormData = {
  greeting: string;
  sentiment: string;
  closing: string;
  imageUrl: string | null;
  imageFile: File | null;
  templateTitle: string;
  daysInAdvance: number;
  gender: 'male' | 'female' | 'all';
};

type Props = {
  onSubmit: (data: TemplateFormData) => Promise<void>;
  onCancel: () => void;
  initialData?: Partial<TemplateFormData>;
};

export default function TemplateCreator({ onSubmit, onCancel, initialData }: Props) {
  const [formData, setFormData] = useState<TemplateFormData>({
    greeting: initialData?.greeting || '',
    sentiment: initialData?.sentiment || '',
    closing: initialData?.closing || '',
    imageUrl: initialData?.imageUrl || null,
    imageFile: null,
    templateTitle: initialData?.templateTitle || '',
    daysInAdvance: initialData?.daysInAdvance || 0,
    gender: initialData?.gender || 'all',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'create' | 'preview'>('create');
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isGenerating, setIsGenerating] = useState<'greeting' | 'sentiment' | 'closing' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Optimal post dimensions
  const FACEBOOK_WIDTH = 1080;
  const FACEBOOK_HEIGHT = 1350;

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
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        setError('Image size must be less than 10MB');
        return;
      }

      if (!file.type.startsWith('image/')) {
        setError('Please select an image file');
        return;
      }

      setIsProcessingImage(true);
      setError(null);
      
      try {
        const resizedImage = await resizeImageForFacebook(file);
        setFormData({
          ...formData,
          imageUrl: resizedImage,
          imageFile: file,
        });
      } catch (err) {
        setError('Failed to process image. Please try another file.');
      } finally {
        setIsProcessingImage(false);
      }
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!formData.greeting.trim() || !formData.sentiment.trim() || !formData.closing.trim()) {
      setError('Greeting, Sentiment, and Closing are required');
      return;
    }

    if (!formData.templateTitle.trim()) {
      setError('Template Title is required');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(formData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGenerateAI = async () => {
    setError('AI image generation coming soon!');
    // TODO: Implement AI image generation
  };

  const generateAIText = async (type: 'greeting' | 'sentiment' | 'closing') => {
    setIsGenerating(type);
    setError(null);

    try {
      // TODO: Replace with actual AI API call (OpenAI, Claude, etc.)
      // Simulating AI generation with predefined templates for now
      await new Promise(resolve => setTimeout(resolve, 1500));

      const suggestions = {
        greeting: [
          "Hey [name], hope your day is as awesome as you are!",
          "Happy Birthday [name]! 🎉",
          "Wishing you the happiest of birthdays, [name]!",
          "Hey [name]! Another year older and even more amazing!",
        ],
        sentiment: [
          "Your birthday reminds me of all the wonderful qualities that make you so special. You bring joy to everyone around you.",
          "I'm so grateful to have you in my life. You make every day brighter with your kindness and humor.",
          "Another year of amazing memories together! You're one of a kind and I hope this year brings you everything you wish for.",
          "Celebrating you today! Your friendship means the world to me and I can't wait to see what this year brings you.",
        ],
        closing: [
          "Wishing you a wonderful day filled with joy and celebration!",
          "Have an amazing birthday! 🎂🎈",
          "Hope your special day is filled with love and laughter!",
          "Wishing you the best and happy birthday to you!",
          "Cheers to another great year ahead! 🥳",
        ],
      };

      const randomSuggestion = suggestions[type][Math.floor(Math.random() * suggestions[type].length)];
      
      setFormData({
        ...formData,
        [type]: randomSuggestion,
      });

    } catch (err) {
      setError('Failed to generate text. Please try again.');
    } finally {
      setIsGenerating(null);
    }
  };

  const renderPreview = () => {
    // Combine greeting, sentiment, and closing into complete message
    const completeMessage = [
      formData.greeting,
      formData.sentiment,
      formData.closing
    ].filter(Boolean).join('\n\n');

    return (
      <div className="space-y-4">
        {/* Facebook-style preview with text overlay */}
        <FacebookPostPreview
          imageUrl={formData.imageUrl}
          text={completeMessage || 'Add greeting, sentiment, and closing to see preview'}
        />

        {/* Template metadata */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-xs font-semibold text-gray-700 mb-3">📋 Template Settings</div>
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex justify-between">
              <span className="font-medium">Title:</span>
              <span>{formData.templateTitle || '(empty)'}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Send:</span>
              <span>
                {formData.daysInAdvance === 0
                  ? 'On birthday'
                  : `${Math.abs(formData.daysInAdvance)} day${Math.abs(formData.daysInAdvance) !== 1 ? 's' : ''} ${
                      formData.daysInAdvance > 0 ? 'early' : 'late'
                    }`}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Gender:</span>
              <span className="capitalize">{formData.gender === 'all' ? 'All' : formData.gender}</span>
            </div>
          </div>
        </div>

        {/* Individual segments for reference */}
        <details className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <summary className="text-xs font-semibold text-gray-700 cursor-pointer hover:text-gray-900">
            📝 View Message Segments
          </summary>
          <div className="mt-3 pt-3 border-t border-gray-200 space-y-3">
            <div>
              <div className="text-xs font-medium text-gray-600 mb-1">Greeting:</div>
              <p className="text-sm text-gray-700">{formData.greeting || '(empty)'}</p>
            </div>
            <div>
              <div className="text-xs font-medium text-gray-600 mb-1">Sentiment:</div>
              <p className="text-sm text-gray-700">{formData.sentiment || '(empty)'}</p>
            </div>
            <div>
              <div className="text-xs font-medium text-gray-600 mb-1">Closing:</div>
              <p className="text-sm text-gray-700">{formData.closing || '(empty)'}</p>
            </div>
          </div>
        </details>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-lg">
      {/* Header with Tabs */}
      <div className="border-b flex items-center justify-between px-6 py-4">
        <h2 className="text-xl font-bold text-gray-900">
          {initialData ? 'Edit Template' : 'Create Template'}
        </h2>
        <div className="flex space-x-2">
          <button
            type="button"
            onClick={() => setActiveTab('create')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'create'
                ? 'bg-orangeBrand text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'preview'
                ? 'bg-orangeBrand text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Preview
          </button>
        </div>
      </div>

      {/* Form Content */}
      <form onSubmit={handleSubmit} className="p-6">
        {activeTab === 'create' ? (
          <div className="space-y-6">
            <p className="text-sm text-gray-600 pb-2 border-b border-gray-200">Fields marked * are required.</p>

            {/* Greeting */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Greeting <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => generateAIText('greeting')}
                  disabled={isGenerating === 'greeting'}
                  className="text-xs px-2 py-1 bg-purple-50 text-purple-700 rounded hover:bg-purple-100 disabled:opacity-50 flex items-center gap-1"
                >
                  {isGenerating === 'greeting' ? (
                    <>⏳ Generating...</>
                  ) : (
                    <>✨ Generate</>
                  )}
                </button>
              </div>
              <textarea
                value={formData.greeting}
                onChange={(e) => setFormData({ ...formData, greeting: e.target.value })}
                placeholder="Hey [name], hope your day is as awesome as you are!"
                rows={2}
                className="w-full px-3 py-2 rounded-lg focus:outline-none bg-white shadow-sm focus:shadow-lg transition-shadow"
                required
              />
            </div>

            {/* Sentiment */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Sentiment <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => generateAIText('sentiment')}
                  disabled={isGenerating === 'sentiment'}
                  className="text-xs px-2 py-1 bg-purple-50 text-purple-700 rounded hover:bg-purple-100 disabled:opacity-50 flex items-center gap-1"
                >
                  {isGenerating === 'sentiment' ? (
                    <>⏳ Generating...</>
                  ) : (
                    <>✨ Generate</>
                  )}
                </button>
              </div>
              <textarea
                value={formData.sentiment}
                onChange={(e) => setFormData({ ...formData, sentiment: e.target.value })}
                placeholder="Your birthday reminds me of all the wonderful qualities that make you so special."
                rows={3}
                className="w-full px-3 py-2 rounded-lg focus:outline-none bg-white shadow-sm focus:shadow-lg transition-shadow"
                required
              />
            </div>

            {/* Closing */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Closing <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => generateAIText('closing')}
                  disabled={isGenerating === 'closing'}
                  className="text-xs px-2 py-1 bg-purple-50 text-purple-700 rounded hover:bg-purple-100 disabled:opacity-50 flex items-center gap-1"
                >
                  {isGenerating === 'closing' ? (
                    <>⏳ Generating...</>
                  ) : (
                    <>✨ Generate</>
                  )}
                </button>
              </div>
              <textarea
                value={formData.closing}
                onChange={(e) => setFormData({ ...formData, closing: e.target.value })}
                placeholder="Wishing you a wonderful day filled with joy and celebration!"
                rows={2}
                className="w-full px-3 py-2 rounded-lg focus:outline-none bg-white shadow-sm focus:shadow-lg transition-shadow"
                required
              />
            </div>

            {/* Message Image */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Message Image
                <span className="text-xs text-gray-500 ml-2">(Auto-resized to 1080x1350px)</span>
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                {isProcessingImage ? (
                  <div className="py-8">
                    <div className="text-4xl mb-2">⏳</div>
                    <p className="text-sm text-gray-600">Optimizing image...</p>
                  </div>
                ) : formData.imageUrl ? (
                  <div className="relative">
                    <img
                      src={formData.imageUrl}
                      alt="Template preview"
                      className="w-full max-w-md mx-auto rounded shadow-sm"
                      style={{ maxHeight: '300px', objectFit: 'contain' }}
                    />
                    <p className="text-xs text-gray-500 mt-2">1080x1350px (Optimized)</p>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, imageUrl: null, imageFile: null })}
                      className="mt-2 text-sm text-red-600 hover:text-red-800"
                    >
                      Remove Image
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="text-5xl mb-2">🖼️</div>
                    <p className="text-sm text-gray-600 mb-1">Click to add an image</p>
                    <p className="text-xs text-gray-500 mb-3">Will be automatically resized to 1080x1350px</p>
                    <div className="space-x-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="btn-outline-orange text-sm"
                      >
                        Upload Image
                      </button>
                      <button
                        type="button"
                        onClick={handleGenerateAI}
                        className="btn-outline-orange text-sm"
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
                className="hidden"
              />
            </div>

            {/* Template Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Template Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.templateTitle}
                onChange={(e) => setFormData({ ...formData, templateTitle: e.target.value })}
                placeholder="SimpleBirthday"
                className="w-full px-3 py-2 rounded-lg focus:outline-none bg-white shadow-sm focus:shadow-lg transition-shadow"
                required
              />
            </div>

            {/* Days in Advance */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Days in Advance
              </label>
              <select
                value={formData.daysInAdvance}
                onChange={(e) =>
                  setFormData({ ...formData, daysInAdvance: parseInt(e.target.value) })
                }
                className="w-full px-3 py-2 rounded-lg focus:outline-none bg-white shadow-sm focus:shadow-lg transition-shadow"
              >
                <option value="0">On Birthday</option>
                <option value="1">1 Day Early</option>
                <option value="2">2 Days Early</option>
                <option value="3">3 Days Early</option>
                <option value="4">4 Days Early</option>
                <option value="5">5 Days Early</option>
                <option value="7">1 Week Early</option>
                <option value="-1">1 Day Late</option>
                <option value="-2">2 Days Late</option>
              </select>
            </div>

            {/* Gender Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Gender Filter</label>
              <select
                value={formData.gender}
                onChange={(e) =>
                  setFormData({ ...formData, gender: e.target.value as 'male' | 'female' | 'all' })
                }
                className="w-full px-3 py-2 rounded-lg focus:outline-none bg-white shadow-sm focus:shadow-lg transition-shadow"
              >
                <option value="all">All Genders</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
          </div>
        ) : (
          renderPreview()
        )}

        {error && (
          <div className="mt-6 p-3 bg-red-50 text-red-700 rounded-md text-sm" role="alert">
            {error}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 mt-8">
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className="flex-1 btn-outline-orange"
            disabled={isSubmitting}
          >
            Preview
          </button>
          <button type="button" className="flex-1 btn-secondary">
            Send Test
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 btn-outline-orange"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 btn-orange flex items-center justify-center gap-2"
            disabled={isSubmitting}
          >
            {isSubmitting && <Spinner size="sm" />}
            <span>{isSubmitting ? 'Saving...' : 'Save'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
