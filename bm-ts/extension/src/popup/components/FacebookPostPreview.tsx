import { useEffect, useRef, useState } from 'react';

type FacebookPostPreviewProps = {
  imageUrl?: string | null;
  text: string;
  showAsPost?: boolean;
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
};

export default function FacebookPostPreview({
  imageUrl,
  text,
  showAsPost: _showAsPost = false,
  fontFamily = 'Arial',
  fontSize = 48,
  fontColor = '#ffffff',
}: FacebookPostPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!imageUrl || !text) {
      setPreviewUrl(null);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      // Set canvas dimensions to Facebook optimal size
      const FACEBOOK_WIDTH = 1080;
      const FACEBOOK_HEIGHT = 1350;
      canvas.width = FACEBOOK_WIDTH;
      canvas.height = FACEBOOK_HEIGHT;

      // Calculate image scaling
      const imgAspect = img.width / img.height;
      const canvasAspect = FACEBOOK_WIDTH / FACEBOOK_HEIGHT;

      let drawWidth, drawHeight, offsetX, offsetY;

      if (imgAspect > canvasAspect) {
        drawHeight = FACEBOOK_HEIGHT;
        drawWidth = img.width * (FACEBOOK_HEIGHT / img.height);
        offsetX = (FACEBOOK_WIDTH - drawWidth) / 2;
        offsetY = 0;
      } else {
        drawWidth = FACEBOOK_WIDTH;
        drawHeight = img.height * (FACEBOOK_WIDTH / img.width);
        offsetX = 0;
        offsetY = (FACEBOOK_HEIGHT - drawHeight) / 2;
      }

      // Draw white background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, FACEBOOK_WIDTH, FACEBOOK_HEIGHT);

      // Draw image
      ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

      // Add semi-transparent overlay for text readability
      const overlayGradient = ctx.createLinearGradient(
        0,
        FACEBOOK_HEIGHT - 500,
        0,
        FACEBOOK_HEIGHT,
      );
      overlayGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      overlayGradient.addColorStop(1, 'rgba(0, 0, 0, 0.6)');
      ctx.fillStyle = overlayGradient;
      ctx.fillRect(0, FACEBOOK_HEIGHT - 500, FACEBOOK_WIDTH, 500);

      // Configure text styling with custom font settings
      ctx.fillStyle = fontColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Process and wrap text
      const maxWidth = FACEBOOK_WIDTH - 120; // Padding on sides
      const lineHeight = fontSize * 1.25; // Line height is 125% of font size
      const lines: string[] = [];

      // Split by line breaks first
      const paragraphs = text.split('\n').filter((p) => p.trim());

      paragraphs.forEach((paragraph) => {
        const words = paragraph.split(' ');
        let currentLine = '';

        ctx.font = `bold ${fontSize}px ${fontFamily}, sans-serif`;

        words.forEach((word) => {
          const testLine = currentLine + (currentLine ? ' ' : '') + word;
          const metrics = ctx.measureText(testLine);

          if (metrics.width > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        });

        if (currentLine) {
          lines.push(currentLine);
        }
      });

      // Calculate starting Y position to center the text block
      const totalTextHeight = lines.length * lineHeight;
      const startY = FACEBOOK_HEIGHT - 280 - totalTextHeight / 2;

      // Limit to max 6 lines
      const displayLines = lines.slice(0, 6);

      // Draw text with shadow for better readability
      displayLines.forEach((line, index) => {
        const y = startY + index * lineHeight;

        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillText(line, FACEBOOK_WIDTH / 2 + 2, y + 2);

        // Text (use configured fontColor)
        ctx.fillStyle = fontColor;
        ctx.fillText(line, FACEBOOK_WIDTH / 2, y);
      });

      // Add ellipsis if text was truncated
      if (lines.length > 6) {
        const ellipsisY = startY + 6 * lineHeight;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillText('...', FACEBOOK_WIDTH / 2 + 2, ellipsisY + 2);
        ctx.fillStyle = fontColor;
        ctx.fillText('...', FACEBOOK_WIDTH / 2, ellipsisY);
      }

      // Convert to data URL
      setPreviewUrl(canvas.toDataURL('image/jpeg', 0.92));
    };

    img.onerror = () => {
      console.error('Failed to load image for preview');
      setPreviewUrl(null);
    };

    img.src = imageUrl;
  }, [imageUrl, text, fontFamily, fontSize, fontColor]);

  if (!imageUrl && !text) {
    return (
      <div className="bg-gray-100 rounded-lg p-8 text-center">
        <div className="text-4xl mb-2">👀</div>
        <p className="text-sm text-gray-600">Add an image and text to see preview</p>
      </div>
    );
  }

  if (!imageUrl) {
    return (
      <div className="bg-white rounded-lg p-6">
        <div className="prose max-w-none">
          <p className="text-sm whitespace-pre-wrap">{text || '(empty)'}</p>
        </div>
      </div>
    );
  }

  if (!text) {
    return (
      <div className="bg-white rounded-lg overflow-hidden">
        <img src={imageUrl} alt="Preview" className="w-full facebook-preview-img" />
      </div>
    );
  }

  return (
    <div>
      {previewUrl ? (
        <img
          src={previewUrl}
          alt="Facebook post preview with text overlay"
          className="w-full rounded-lg"
        />
      ) : (
        <div className="flex items-center justify-center p-12 bg-gray-50 rounded-lg">
          <div className="text-center">
            <div className="text-4xl mb-2">⏳</div>
            <p className="text-sm text-gray-600">Generating preview...</p>
          </div>
        </div>
      )}

      {/* Hidden canvas for rendering */}
      <canvas ref={canvasRef} className="hidden-canvas" />
    </div>
  );
}
