/**
 * Canvas image composition utilities for Facebook post generation.
 */

/**
 * Composes an image with centred text overlay, scaled to Facebook post
 * dimensions (1080 × 1350).  Returns a base64-encoded JPEG data URL.
 */
export function composeImageFromUrl(
  srcUrl: string,
  text: string,
  fontFamily: string | undefined,
  fontSize: number | undefined,
  fontColor: string | undefined,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const FACEBOOK_WIDTH = 1080;
        const FACEBOOK_HEIGHT = 1350;

        const canvas = document.createElement('canvas');
        canvas.width = FACEBOOK_WIDTH;
        canvas.height = FACEBOOK_HEIGHT;

        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas not supported'));

        // Scale image to cover canvas while preserving aspect ratio
        const imgAspect = img.width / img.height;
        const canvasAspect = FACEBOOK_WIDTH / FACEBOOK_HEIGHT;

        let drawWidth: number, drawHeight: number, offsetX: number, offsetY: number;

        if (imgAspect > canvasAspect) {
          // Image is wider — fit height, crop sides
          drawHeight = FACEBOOK_HEIGHT;
          drawWidth = img.width * (FACEBOOK_HEIGHT / img.height);
          offsetX = (FACEBOOK_WIDTH - drawWidth) / 2;
          offsetY = 0;
        } else {
          // Image is taller — fit width, crop top/bottom
          drawWidth = FACEBOOK_WIDTH;
          drawHeight = img.height * (FACEBOOK_WIDTH / img.width);
          offsetX = 0;
          offsetY = (FACEBOOK_HEIGHT - drawHeight) / 2;
        }

        // White background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, FACEBOOK_WIDTH, FACEBOOK_HEIGHT);

        // Draw image
        ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

        // Gradient overlay for text legibility
        const overlayGradient = ctx.createLinearGradient(
          0,
          FACEBOOK_HEIGHT - 500,
          0,
          FACEBOOK_HEIGHT,
        );
        overlayGradient.addColorStop(0, 'rgba(0,0,0,0)');
        overlayGradient.addColorStop(1, 'rgba(0,0,0,0.6)');
        ctx.fillStyle = overlayGradient;
        ctx.fillRect(0, FACEBOOK_HEIGHT - 500, FACEBOOK_WIDTH, 500);

        // Text settings
        const appliedFont = fontFamily || 'Arial';
        const appliedSize = fontSize || 48;
        const appliedColor = fontColor || '#ffffff';

        ctx.fillStyle = appliedColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const maxWidth = FACEBOOK_WIDTH - 120;
        const lineHeight = appliedSize * 1.25;
        const lines: string[] = [];

        // Word-wrap paragraphs
        const paragraphs = text.split('\n').filter((p) => p.trim());
        paragraphs.forEach((paragraph) => {
          const words = paragraph.split(' ');
          let currentLine = '';
          ctx.font = `bold ${appliedSize}px ${appliedFont}, sans-serif`;

          words.forEach((word) => {
            const testLine = currentLine + (currentLine ? ' ' : '') + word;
            const { width } = ctx.measureText(testLine);
            if (width > maxWidth && currentLine) {
              lines.push(currentLine);
              currentLine = word;
            } else {
              currentLine = testLine;
            }
          });

          if (currentLine) lines.push(currentLine);
        });

        const displayLines = lines.slice(0, 6);
        const totalTextHeight = displayLines.length * lineHeight;
        const startY = FACEBOOK_HEIGHT - 280 - totalTextHeight / 2;

        // Draw text with drop shadow
        displayLines.forEach((line, idx) => {
          const y = startY + idx * lineHeight;
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillText(line, FACEBOOK_WIDTH / 2 + 2, y + 2);
          ctx.fillStyle = appliedColor;
          ctx.fillText(line, FACEBOOK_WIDTH / 2, y);
        });

        // Ellipsis indicator when text was truncated
        if (lines.length > 6) {
          const ellipsisY = startY + 6 * lineHeight;
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillText('...', FACEBOOK_WIDTH / 2 + 2, ellipsisY + 2);
          ctx.fillStyle = appliedColor;
          ctx.fillText('...', FACEBOOK_WIDTH / 2, ellipsisY);
        }

        resolve(canvas.toDataURL('image/jpeg', 0.92));
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = srcUrl;
  });
}
