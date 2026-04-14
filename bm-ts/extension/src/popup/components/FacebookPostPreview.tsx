import { useEffect, useRef, useState } from 'react';

type FacebookPostPreviewProps = {
  imageUrl?: string | null;
  text: string;
  showAsPost?: boolean;
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
  /** 0–1 horizontal fraction for text centre (default 0.5) */
  textX?: number;
  /** 0–1 vertical fraction for text centre (default 0.5) */
  textY?: number;
  /** When provided, renders a draggable CSS overlay instead of a canvas JPEG */
  onTextPositionChange?: (x: number, y: number) => void;
};

export default function FacebookPostPreview({
  imageUrl,
  text,
  showAsPost: _showAsPost = false,
  fontFamily = 'Arial',
  fontSize = 48,
  fontColor = '#ffffff',
  textX = 0.5,
  textY = 0.5,
  onTextPositionChange,
}: FacebookPostPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const isDragging = useRef(false);

  // Track container size for scaling the interactive overlay
  useEffect(() => {
    if (!containerRef.current) return;
    setContainerWidth(containerRef.current.clientWidth);
    const ro = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Canvas rendering — only used in static (non-interactive) mode
  useEffect(() => {
    if (onTextPositionChange) return; // interactive mode: skip canvas
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
      const FACEBOOK_WIDTH = 1080;
      const FACEBOOK_HEIGHT = 1350;
      canvas.width = FACEBOOK_WIDTH;
      canvas.height = FACEBOOK_HEIGHT;

      const imgAspect = img.width / img.height;
      const canvasAspect = FACEBOOK_WIDTH / FACEBOOK_HEIGHT;
      let drawWidth: number, drawHeight: number, offsetX: number, offsetY: number;

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

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, FACEBOOK_WIDTH, FACEBOOK_HEIGHT);
      ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

      // Gradient overlay centred on text position
      const textCenterX = textX * FACEBOOK_WIDTH;
      const textCenterY = textY * FACEBOOK_HEIGHT;
      const GRADIENT_HALF_HEIGHT = 300;
      const gradTop = Math.max(0, textCenterY - GRADIENT_HALF_HEIGHT);
      const gradBottom = Math.min(FACEBOOK_HEIGHT, textCenterY + GRADIENT_HALF_HEIGHT);
      const overlayGradient = ctx.createLinearGradient(0, gradTop, 0, gradBottom);
      overlayGradient.addColorStop(0, 'rgba(0,0,0,0)');
      overlayGradient.addColorStop(0.4, 'rgba(0,0,0,0.5)');
      overlayGradient.addColorStop(0.6, 'rgba(0,0,0,0.5)');
      overlayGradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = overlayGradient;
      ctx.fillRect(0, gradTop, FACEBOOK_WIDTH, gradBottom - gradTop);

      ctx.fillStyle = fontColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const maxWidth = FACEBOOK_WIDTH - 120;
      const lineHeight = fontSize * 1.25;
      const lines: string[] = [];
      const paragraphs = text.split('\n').filter((p) => p.trim());

      paragraphs.forEach((paragraph) => {
        const words = paragraph.split(' ');
        let currentLine = '';
        ctx.font = `bold ${fontSize}px ${fontFamily}, sans-serif`;
        words.forEach((word) => {
          const testLine = currentLine + (currentLine ? ' ' : '') + word;
          if (ctx.measureText(testLine).width > maxWidth && currentLine) {
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
      const startY = textCenterY - totalTextHeight / 2;

      displayLines.forEach((line, index) => {
        const y = startY + index * lineHeight;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillText(line, textCenterX + 2, y + 2);
        ctx.fillStyle = fontColor;
        ctx.fillText(line, textCenterX, y);
      });

      if (lines.length > 6) {
        const ellipsisY = startY + 6 * lineHeight;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillText('...', textCenterX + 2, ellipsisY + 2);
        ctx.fillStyle = fontColor;
        ctx.fillText('...', textCenterX, ellipsisY);
      }

      setPreviewUrl(canvas.toDataURL('image/jpeg', 0.92));
    };

    img.onerror = () => {
      console.error('Failed to load image for preview');
      setPreviewUrl(null);
    };

    img.src = imageUrl;
  }, [imageUrl, text, fontFamily, fontSize, fontColor, textX, textY, onTextPositionChange]);

  // ── INTERACTIVE / DRAG MODE ──────────────────────────────────────────────
  if (onTextPositionChange && imageUrl) {
    const scale = containerWidth > 0 ? containerWidth / 1080 : 1;
    const scaledFontSize = Math.max(8, Math.round(fontSize * scale));

    // Gradient CSS string centred on text position (mirrors canvas logic)
    const gradStartPct = Math.max(0, textY * 100 - 22);
    const gradEndPct = Math.min(100, textY * 100 + 22);
    const gradientStyle = `linear-gradient(to bottom, transparent ${gradStartPct}%, rgba(0,0,0,0.5) ${
      textY * 100
    }%, transparent ${gradEndPct}%)`;

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      isDragging.current = true;
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = Math.max(0.05, Math.min(0.95, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0.05, Math.min(0.95, (e.clientY - rect.top) / rect.height));
      onTextPositionChange?.(x, y);
    };

    const handlePointerUp = () => {
      isDragging.current = false;
    };

    return (
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-lg"
        style={{ aspectRatio: '4 / 5', userSelect: 'none' }}
      >
        {/* Background image — fills container via object-cover */}
        <img
          src={imageUrl}
          alt="Post background"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          draggable={false}
        />

        {/* Dark gradient overlay centred on text position */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: gradientStyle }}
        />

        {/* Draggable text block */}
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{
            position: 'absolute',
            left: `${textX * 100}%`,
            top: `${textY * 100}%`,
            transform: 'translate(-50%, -50%)',
            cursor: 'grab',
            maxWidth: '88%',
            textAlign: 'center',
            touchAction: 'none',
          }}
        >
          <p
            style={{
              fontFamily: `${fontFamily}, sans-serif`,
              fontSize: `${scaledFontSize}px`,
              fontWeight: 'bold',
              color: fontColor,
              textShadow: '1px 1px 4px rgba(0,0,0,0.8)',
              lineHeight: 1.25,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              margin: 0,
            }}
          >
            {text}
          </p>
          <span
            style={{
              fontSize: '10px',
              color: 'rgba(255,255,255,0.65)',
              fontFamily: 'sans-serif',
              fontWeight: 'normal',
              display: 'block',
              marginTop: '4px',
            }}
          >
            ✥ drag to reposition
          </span>
        </div>
      </div>
    );
  }

  // ── STATIC FALLBACKS ─────────────────────────────────────────────────────

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
    <div ref={containerRef}>
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
      <canvas ref={canvasRef} className="hidden-canvas" />
    </div>
  );
}
