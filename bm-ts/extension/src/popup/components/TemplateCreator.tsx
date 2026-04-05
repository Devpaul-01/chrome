import { useState, useEffect, FormEvent, useRef } from 'react';
import Spinner from './Spinner';
import FacebookPostPreview from './FacebookPostPreview';
import { useImageLibrary } from '../hooks/useImageLibrary';
import ImageLibraryPicker from './ImageLibraryPicker';
import SegmentEditor from './SegmentEditor';
import HelpTooltip from './HelpTooltip';

export type TemplateFormData = {
  greeting: string;
  sentiment: string;
  closing: string;
  imageUrl: string | null;
  imageFile: File | null;
  templateTitle: string;
  daysInAdvance: number;
  gender: 'MALE' | 'FEMALE' | 'NEUTRAL' | 'ALL';
};

type Props = {
  onSubmit: (data: TemplateFormData) => Promise<void>;
  onCancel: () => void;
  initialData?: Partial<TemplateFormData>;
};

const TEMPLATE_DRAFT_KEY = 'bm_template_draft';

export default function TemplateCreator({ onSubmit, onCancel, initialData }: Props) {
  const [formData, setFormData] = useState<TemplateFormData>({
    greeting: initialData?.greeting || '',
    sentiment: initialData?.sentiment || '',
    closing: initialData?.closing || '',
    imageUrl: initialData?.imageUrl || null,
    imageFile: null,
    templateTitle: initialData?.templateTitle || '',
    daysInAdvance: initialData?.daysInAdvance || 0,
    gender: initialData?.gender || 'ALL',
  });

  // Restore draft from storage when creating (not editing)
  useEffect(() => {
    if (initialData) return;
    chrome.storage.local.get(TEMPLATE_DRAFT_KEY).then((stored) => {
      if (stored[TEMPLATE_DRAFT_KEY]) {
        setFormData((prev) => ({ ...prev, ...stored[TEMPLATE_DRAFT_KEY], imageFile: null }));
      }
    });
  }, [initialData]);

  // Persist draft to storage on change (only when creating)
  useEffect(() => {
    if (initialData) return;
    const { imageFile: _imageFile, ...persistable } = formData;
    chrome.storage.local.set({ [TEMPLATE_DRAFT_KEY]: persistable });
  }, [formData, initialData]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'create' | 'preview'>('create');
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isGenerating, setIsGenerating] = useState<'greeting' | 'sentiment' | 'closing' | null>(
    null,
  );
  const [isUploadingPreview, setIsUploadingPreview] = useState(false);
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [librarySaveMsg, setLibrarySaveMsg] = useState<string | null>(null);
  const {
    images: libraryImages,
    isLoading: isLoadingLibrary,
    isFull: libraryFull,
    saveToLibrary,
  } = useImageLibrary();
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
      } catch {
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
      chrome.storage.local.remove(TEMPLATE_DRAFT_KEY);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setIsSubmitting(false);
    }
  };

  const generateAIText = async (type: 'greeting' | 'sentiment' | 'closing') => {
    setIsGenerating(type);
    setError(null);

    try {
      // TODO: Replace with actual AI API call (OpenAI, Claude, etc.)
      // Simulating AI generation with predefined templates for now
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const suggestions = {
        greeting: [
          'Hey {First_Name}, hope your day is as awesome as you are!',
          'Happy Birthday {First_Name}! 🎉',
          'Wishing you the happiest of birthdays, {First_Name}!',
          'Hey {First_Name}! Another year older and even more amazing!',
        ],
        sentiment: [
          'Your birthday reminds me of all the wonderful qualities that make you so special. You bring joy to everyone around you.',
          "I'm so grateful to have you in my life. You make every day brighter with your kindness and humor.",
          "Another year of amazing memories together! You're one of a kind and I hope this year brings you everything you wish for.",
          "Celebrating you today! Your friendship means the world to me and I can't wait to see what this year brings you.",
        ],
        closing: [
          'Wishing you a wonderful day filled with joy and celebration!',
          'Have an amazing birthday! 🎂🎈',
          'Hope your special day is filled with love and laughter!',
          'Wishing you the best and happy birthday to you!',
          'Cheers to another great year ahead! 🥳',
        ],
      };

      const randomSuggestion =
        suggestions[type][Math.floor(Math.random() * suggestions[type].length)];

      setFormData({
        ...formData,
        [type]: randomSuggestion,
      });
    } catch {
      setError('Failed to generate text. Please try again.');
    } finally {
      setIsGenerating(null);
    }
  };

  const renderPreview = () => {
    const completeMessage = [formData.greeting, formData.sentiment, formData.closing]
      .filter(Boolean)
      .join('\n\n');

    const hasImageKeyword = completeMessage.includes('[Image]');
    const libraryPreviewUrl = libraryImages.length > 0 ? libraryImages[0].url : null;

    const handleAddToLibrary = async () => {
      if (!formData.imageUrl) return;
      setIsUploadingPreview(true);
      setLibrarySaveMsg(null);
      try {
        await saveToLibrary(formData.imageUrl, `template_${Date.now()}.jpg`);
        setLibrarySaveMsg('✓ Image saved to library');
      } catch (err) {
        setLibrarySaveMsg(`Error: ${(err as Error).message}`);
      } finally {
        setIsUploadingPreview(false);
      }
    };

    if (formData.imageUrl) {
      return (
        <div className="space-y-3">
          <FacebookPostPreview imageUrl={formData.imageUrl} text={completeMessage} />
          <div className="text-center text-xs text-gray-600">1080×1350px (Optimized)</div>
          {librarySaveMsg && (
            <p
              className={`text-xs font-medium ${
                librarySaveMsg.startsWith('Error') ? 'text-red-600' : 'text-green-600'
              }`}
            >
              {librarySaveMsg}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAddToLibrary}
              disabled={isUploadingPreview || libraryFull}
              className="btn-primary flex-1"
              title={libraryFull ? 'Library full (20/20)' : undefined}
            >
              {isUploadingPreview ? 'Saving...' : 'Add to Library'}
            </button>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, imageUrl: null })}
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
            Preview uses first library image — a random image will be picked when sending.
          </p>
          <FacebookPostPreview
            imageUrl={libraryPreviewUrl}
            text={completeMessage.replace(/\[Image\]/g, '')}
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

    return <FacebookPostPreview imageUrl={null} text={completeMessage} />;
  };

  return (
    <div className="bg-white rounded-lg shadow-lg">
      {/* Form Content */}
      <form onSubmit={handleSubmit} className="p-6">
        {activeTab === 'create' ? (
          <div className="space-y-6">
            <p className="text-sm text-gray-600 pb-2 border-b border-gray-200">
              Fields marked * are required.
            </p>

            <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
              A template has three parts — <strong>Greeting</strong>, <strong>Sentiment</strong>,
              and <strong>Closing</strong> — joined together to form the final message sent to your
              friend. Use <strong>✨ Generate</strong> for suggestions, or write your own.
            </p>

            {/* Greeting */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Greeting <span className="text-red-500">*</span>{' '}
                  <HelpTooltip label="Use merge tags like [Tag Person] to insert the friend's name, [Today] for today's date, and [Image] for an image URL." />
                </label>
                <button
                  type="button"
                  onClick={() => generateAIText('greeting')}
                  disabled={isGenerating === 'greeting'}
                  className="btn-outline-orange"
                >
                  {isGenerating === 'greeting' ? <>⏳ Generating...</> : <>✨ Generate</>}
                </button>
              </div>
              <SegmentEditor
                content={formData.greeting}
                onChange={(c) => setFormData({ ...formData, greeting: c })}
                placeholder="Hey [name], hope your day is as awesome as you are!"
                rows={2}
                ariaLabel="Greeting"
                showKeywordInserter={true}
                maxLength={300}
              />
            </div>

            {/* Sentiment */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Sentiment <span className="text-red-500">*</span>{' '}
                  <HelpTooltip label="The main body of your message — the personal, heartfelt part. Sits between the greeting and the closing." />
                </label>
                <button
                  type="button"
                  onClick={() => generateAIText('sentiment')}
                  disabled={isGenerating === 'sentiment'}
                  className="btn-outline-orange"
                >
                  {isGenerating === 'sentiment' ? <>⏳ Generating...</> : <>✨ Generate</>}
                </button>
              </div>
              <SegmentEditor
                content={formData.sentiment}
                onChange={(c) => setFormData({ ...formData, sentiment: c })}
                placeholder="Your birthday reminds me of all the wonderful qualities that make you so special."
                rows={3}
                ariaLabel="Sentiment"
                showKeywordInserter={true}
                maxLength={1000}
              />
            </div>

            {/* Closing */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Closing <span className="text-red-500">*</span>{' '}
                  <HelpTooltip label="A short sign-off line — e.g. 'Wishing you a wonderful day!' Keep it brief." />
                </label>
                <button
                  type="button"
                  onClick={() => generateAIText('closing')}
                  disabled={isGenerating === 'closing'}
                  className="btn-outline-orange"
                >
                  {isGenerating === 'closing' ? <>⏳ Generating...</> : <>✨ Generate</>}
                </button>
              </div>
              <SegmentEditor
                content={formData.closing}
                onChange={(c) => setFormData({ ...formData, closing: c })}
                placeholder="Wishing you a wonderful day filled with joy and celebration!"
                rows={2}
                ariaLabel="Closing"
                showKeywordInserter={true}
                maxLength={300}
              />
            </div>

            {/* Template Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Template Title <span className="text-red-500">*</span>{' '}
                <HelpTooltip label="A private name for this template — not sent to friends. Helps you identify it in the gallery, e.g. 'Formal – Colleagues' or 'Casual – Close Friends'." />
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
                Days in Advance{' '}
                <HelpTooltip label="Positive = days before the birthday; 0 = on the day; negative = days after. Useful for follow-up messages like 'Hope you had a great birthday yesterday!'" />
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
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Gender Filter{' '}
                <HelpTooltip label="Restrict this template to contacts of a specific gender. 'All Genders' sends to everyone. Use gender-specific templates to personalise messages for male or female friends." />
              </label>
              <select
                value={formData.gender}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    gender: e.target.value as 'MALE' | 'FEMALE' | 'NEUTRAL' | 'ALL',
                  })
                }
                className="w-full px-3 py-2 rounded-lg focus:outline-none bg-white shadow-sm focus:shadow-lg transition-shadow"
              >
                <option value="ALL">All Genders</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="NEUTRAL">Neutral</option>
              </select>
            </div>

            {/* Attach Image */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Attach Image{' '}
                <span className="text-gray-400 font-normal text-xs">
                  (optional — or use [Image] for random)
                </span>
              </label>
              {formData.imageUrl ? (
                <div>
                  <img
                    src={formData.imageUrl}
                    alt="Attached"
                    className="w-full rounded-lg shadow-sm mb-2"
                    style={{ maxHeight: '180px', objectFit: 'contain' }}
                  />
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, imageUrl: null })}
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
                      className="btn flex-1"
                    >
                      {isProcessingImage ? 'Processing...' : 'Upload'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowLibraryPicker(!showLibraryPicker)}
                      className="btn flex-1"
                    >
                      From Library
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
                  {showLibraryPicker && (
                    <ImageLibraryPicker
                      images={libraryImages}
                      isLoading={isLoadingLibrary}
                      onSelect={(img) => {
                        setFormData({ ...formData, imageUrl: img.url });
                        setShowLibraryPicker(false);
                      }}
                      onClose={() => setShowLibraryPicker(false)}
                      selectedUrl={formData.imageUrl ?? undefined}
                    />
                  )}
                </div>
              )}
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
        <div className="space-y-3 mt-8">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className="flex-1 btn-outline-orange"
              disabled={isSubmitting}
            >
              Preview
            </button>
            <button type="button" className="flex-1 btn-outline-orange">
              Send Test
            </button>
            <button
              type="button"
              onClick={() => {
                setFormData({
                  greeting: '',
                  sentiment: '',
                  closing: '',
                  imageUrl: null,
                  imageFile: null,
                  templateTitle: '',
                  daysInAdvance: 0,
                  gender: 'ALL',
                });
                setActiveTab('create');
                onCancel();
              }}
              className="flex-1 btn-outline-orange"
              disabled={isSubmitting}
            >
              Cancel
            </button>
          </div>
          <button
            type="submit"
            className="w-full btn-orange flex items-center justify-center gap-2"
            disabled={isSubmitting}
            aria-busy={isSubmitting ? 'true' : 'false'}
            aria-disabled={isSubmitting ? 'true' : 'false'}
          >
            {isSubmitting && <Spinner size="sm" />}
            <span>{isSubmitting ? 'Saving...' : 'Save'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
