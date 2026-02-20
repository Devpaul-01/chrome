import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { sendBackgroundMessage } from '../api';

export interface UserImage {
  id: string;
  url: string;
  filename: string;
  size: number;
  uploaded_at: string;
}

interface ImageManagerProps {
  onClose: () => void;
}

export interface ImageManagerHandle {
  focus: () => void;
}

const ImageManager = forwardRef<ImageManagerHandle, ImageManagerProps>(({ onClose }, ref) => {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<UserImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Optimal post dimensions
  const FACEBOOK_WIDTH = 1080;
  const FACEBOOK_HEIGHT = 1350;

  useImperativeHandle(ref, () => ({
    focus: () => {
      headingRef.current?.focus();
    },
  }));

  useEffect(() => {
    loadImages();
    headingRef.current?.focus();
  }, []);

  async function loadImages() {
    setIsLoading(true);
    setError(null);
    try {
      const data = await sendBackgroundMessage<UserImage[]>({
        type: 'images.list',
      });
      setImages(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }

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

          // Fill with white background
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, FACEBOOK_WIDTH, FACEBOOK_HEIGHT);

          // Calculate scaling to cover the canvas while maintaining aspect ratio
          const imgAspect = img.width / img.height;
          const canvasAspect = FACEBOOK_WIDTH / FACEBOOK_HEIGHT;

          let drawWidth, drawHeight, offsetX, offsetY;

          if (imgAspect > canvasAspect) {
            // Image is wider than canvas ratio - fit to height
            drawHeight = FACEBOOK_HEIGHT;
            drawWidth = drawHeight * imgAspect;
            offsetX = -(drawWidth - FACEBOOK_WIDTH) / 2;
            offsetY = 0;
          } else {
            // Image is taller than canvas ratio - fit to width
            drawWidth = FACEBOOK_WIDTH;
            drawHeight = drawWidth / imgAspect;
            offsetX = 0;
            offsetY = -(drawHeight - FACEBOOK_HEIGHT) / 2;
          }

          // Draw image centered and cropped
          ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

          // Convert to base64 JPEG with good quality
          const resizedDataUrl = canvas.toDataURL('image/jpeg', 0.9);
          resolve(resizedDataUrl);
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Resize image to Facebook optimal dimensions (same as TemplateCreator)
      const resizedDataUrl = await resizeImageForFacebook(file);

      // Store preview and file
      setPreviewImage(resizedDataUrl);
      setSelectedFile(file);
    } catch (err) {
      setError('Failed to process image. Please try another file.');
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleUploadToLibrary() {
    if (!previewImage || !selectedFile) return;

    setIsUploading(true);
    setError(null);

    try {
      // Upload the resized image
      await sendBackgroundMessage<void>({
        type: 'images.uploadFile',
        payload: {
          filename: selectedFile.name,
          data: previewImage,
          size: previewImage.length,
        },
      });

      // Clear preview and reload
      setPreviewImage(null);
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      await loadImages();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsUploading(false);
    }
  }

  function handleCancelPreview() {
    setPreviewImage(null);
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  const handleGenerateAI = async () => {
    setError('AI image generation coming soon!');
    // TODO: Implement AI image generation
  };

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this image?')) return;

    try {
      await sendBackgroundMessage<void>({
        type: 'images.delete',
        payload: { id },
      });
      await loadImages();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url).then(() => {
      alert('Image URL copied to clipboard!');
    });
  }

  return (
    <div className="view-container">
      <h2 ref={headingRef} tabIndex={-1} className="text-lg font-bold text-blueStrong mb-3">
        Image Library
      </h2>

      <p className="text-xs text-gray-600 mb-5">
        Upload and manage images for your birthday posts. Use [Image] in messages to insert a random
        image.
      </p>

      <div className="card mb-5">
        <h3 className="text-sm font-bold text-textPrimary mb-4">📸 Add Image</h3>

        {previewImage ? (
          <div className="space-y-3">
            <div className="relative">
              <img
                src={previewImage}
                alt="Preview"
                className="w-full rounded-lg shadow-md image-preview-max"
              />
              <div className="mt-2 text-center text-xs text-gray-600">1080×1350px (Optimized)</div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleUploadToLibrary}
                disabled={isUploading}
                className="btn-primary flex-1"
              >
                {isUploading ? 'Uploading...' : 'Add to Library'}
              </button>
              <button
                onClick={handleCancelPreview}
                disabled={isUploading}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center bg-gray-50">
            {isProcessing ? (
              <div className="py-6">
                <div className="text-4xl mb-3">⏳</div>
                <p className="text-sm text-gray-600 font-medium">Optimizing image...</p>
                <p className="text-xs text-gray-500 mt-1">Resizing to 1080×1350px</p>
              </div>
            ) : (
              <>
                <div className="text-4xl mb-3">🖼️</div>
                <p className="text-sm font-medium text-gray-700 mb-1">Click to add an image</p>
                <p className="text-xs text-gray-500 mb-4">
                  Will be automatically resized to 1080×1350px
                </p>
                <div className="flex gap-2 justify-center">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="btn-primary px-6 py-2 text-sm font-medium"
                  >
                    Upload Image
                  </button>
                  <button
                    onClick={handleGenerateAI}
                    disabled={isUploading}
                    className="btn-secondary px-6 py-2 text-sm font-medium"
                  >
                    Generate with AI
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                  className="hidden-input"
                  title="Upload image file"
                  placeholder="Select image file"
                />
                <p className="text-xs text-gray-400 mt-4">
                  Max 10MB • Auto-optimized for Facebook posts
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="error mb-4" role="alert">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-8 text-gray-500">Loading images...</div>
      ) : (
        <div>
          <h3 className="text-sm font-bold text-textPrimary mb-4">Your Images ({images.length})</h3>

          {images.length === 0 ? (
            <div className="text-center py-8 text-gray-500 bg-white bg-opacity-80 rounded-lg mb-5">
              No images yet. Upload your first image above.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 mb-5">
              {images.map((image) => (
                <div
                  key={image.id}
                  className="bg-white bg-opacity-80 rounded-lg p-2 shadow-sm text-center"
                >
                  <img
                    src={image.url}
                    alt={image.filename}
                    className="w-full h-28 object-cover rounded-lg mb-2"
                  />
                  <p className="text-xs mb-1 overflow-hidden overflow-ellipsis whitespace-nowrap text-textPrimary">
                    {image.filename}
                  </p>
                  <p className="text-xs text-gray-400 mb-2">{(image.size / 1024).toFixed(1)} KB</p>
                  <div className="flex gap-1">
                    <button
                      onClick={() => copyUrl(image.url)}
                      className="btn-secondary flex-1 text-xs py-1"
                    >
                      Copy
                    </button>
                    <button
                      onClick={() => handleDelete(image.id)}
                      className="flex-1 text-xs py-1 rounded-full bg-red-50 text-red-600 hover:bg-red-100 transition-colors font-medium"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

ImageManager.displayName = 'ImageManager';

export default ImageManager;
