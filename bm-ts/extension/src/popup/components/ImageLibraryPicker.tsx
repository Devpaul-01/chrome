import { LibraryImage, MAX_LIBRARY_IMAGES } from '../hooks/useImageLibrary';
import Spinner from './Spinner';

interface Props {
  images: LibraryImage[];
  isLoading: boolean;
  onSelect: (image: LibraryImage) => void;
  onClose: () => void;
  selectedUrl?: string | null;
}

/**
 * Inline picker panel that shows the image library grid.
 * Rendered inside PostEditor and TemplateCreator when the user
 * clicks "Select from Library".
 */
export default function ImageLibraryPicker({
  images,
  isLoading,
  onSelect,
  onClose,
  selectedUrl,
}: Props) {
  return (
    <div className="border border-gray-200 rounded-lg bg-gray-50 p-3 mt-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-textPrimary">
          Library ({images.length} / {MAX_LIBRARY_IMAGES})
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-gray-500 hover:text-gray-700 underline"
        >
          Close
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-4">
          <Spinner size="sm" />
        </div>
      ) : images.length === 0 ? (
        <p className="text-xs text-gray-500 py-3 text-center">
          No images yet — upload one in Image Library.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2 max-h-56 overflow-y-auto">
          {images.map((img) => (
            <button
              key={img.id}
              type="button"
              onClick={() => onSelect(img)}
              className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                selectedUrl === img.url
                  ? 'border-orangeBrand ring-2 ring-orangeBrand ring-opacity-40'
                  : 'border-transparent hover:border-gray-300'
              }`}
              title={img.filename}
            >
              <img
                src={img.url}
                alt={img.filename}
                className="w-full h-20 object-cover"
              />
              {selectedUrl === img.url && (
                <div className="absolute inset-0 flex items-center justify-center bg-orange-500 bg-opacity-25">
                  <span className="text-white text-lg font-bold drop-shadow">✓</span>
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
