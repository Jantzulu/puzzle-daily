import React, { useRef, useState } from 'react';

interface ImageUrlInputProps {
  /** Current base64 image data (if any) */
  imageData?: string;
  /** Current image URL (if any) */
  imageUrl?: string;
  /** Called when image data changes (from file upload) */
  onImageDataChange: (data: string | undefined) => void;
  /** Called when image URL changes */
  onImageUrlChange: (url: string | undefined) => void;
  /** Label for the upload section */
  label: string;
  /** Optional description text */
  description?: string;
  /** Accept attribute for file input (default: "image/*") */
  accept?: string;
  /** Whether this is for a sprite sheet (shows frame config hint) */
  isSpriteSheet?: boolean;
  /** Optional class name for the container */
  className?: string;
}

/**
 * Reusable component for image upload with URL support.
 * Provides both file upload and URL input options.
 */
export const ImageUrlInput: React.FC<ImageUrlInputProps> = ({
  imageData,
  imageUrl,
  onImageDataChange,
  onImageUrlChange,
  label,
  description,
  accept = 'image/*',
  isSpriteSheet = false,
  className = '',
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = useState(imageUrl || '');
  const [previewError, setPreviewError] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (PNG, JPG, GIF, WebP)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const data = event.target?.result as string;
      onImageDataChange(data);
      // Clear URL when uploading a file
      onImageUrlChange(undefined);
      setUrlInput('');
      setPreviewError(false);
    };
    reader.readAsDataURL(file);

    // Reset input so same file can be selected again
    e.target.value = '';
  };

  const handleUrlSubmit = () => {
    const trimmedUrl = urlInput.trim();
    if (!trimmedUrl) {
      onImageUrlChange(undefined);
      return;
    }

    // Basic URL validation
    try {
      new URL(trimmedUrl);
      onImageUrlChange(trimmedUrl);
      // Clear base64 data when using URL
      onImageDataChange(undefined);
      setPreviewError(false);
    } catch {
      alert('Please enter a valid URL');
    }
  };

  const handleClear = () => {
    onImageDataChange(undefined);
    onImageUrlChange(undefined);
    setUrlInput('');
    setPreviewError(false);
  };

  const hasImage = !!(imageData || imageUrl);
  const displayUrl = imageData || imageUrl;

  return (
    <div className={`space-y-2 ${className}`}>
      <label className="block text-stone-300 text-sm font-medium">{label}</label>
      {description && (
        <p className="text-stone-500 text-xs">{description}</p>
      )}

      {/* Preview */}
      {hasImage && !previewError && (
        <div className="relative inline-block">
          <img
            src={displayUrl}
            alt="Preview"
            className="max-w-[128px] max-h-[128px] rounded border border-stone-600 bg-stone-800"
            onError={() => setPreviewError(true)}
          />
          <button
            onClick={handleClear}
            className="absolute -top-2 -right-2 w-5 h-5 bg-blood-600 hover:bg-blood-500 rounded-full text-white text-xs flex items-center justify-center"
            title="Remove image"
          >
            ×
          </button>
          {imageUrl && !imageData && (
            <span className="absolute bottom-1 left-1 bg-arcane-700/90 text-xs px-1 rounded">
              URL
            </span>
          )}
        </div>
      )}

      {previewError && imageUrl && (
        <div className="text-blood-400 text-xs">
          Failed to load image from URL. Check that the URL is accessible.
        </div>
      )}

      {/* File Upload */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={handleFileUpload}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-3 py-1.5 bg-stone-700 hover:bg-stone-600 rounded text-sm text-stone-200"
        >
          {hasImage ? 'Replace File' : 'Upload File'}
        </button>
        <span className="ml-2 text-stone-500 text-xs">
          PNG, JPG, GIF, WebP
          {isSpriteSheet && ' (horizontal strip)'}
        </span>
      </div>

      {/* URL Input */}
      <div className="flex items-center gap-2 mt-2">
        <div className="flex-1 h-px bg-stone-700"></div>
        <span className="text-stone-500 text-xs">OR</span>
        <div className="flex-1 h-px bg-stone-700"></div>
      </div>

      <div className="flex gap-2">
        <input
          type="url"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onBlur={handleUrlSubmit}
          onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
          placeholder="https://your-storage.com/image.png"
          className="flex-1 px-2 py-1.5 bg-stone-700 rounded text-sm text-parchment-100 placeholder:text-stone-500"
        />
        <button
          onClick={handleUrlSubmit}
          className="px-3 py-1.5 bg-arcane-700 hover:bg-arcane-600 rounded text-sm"
        >
          Set
        </button>
      </div>
      <p className="text-stone-500 text-xs">
        Link to external image (Supabase, CDN, etc.). No file size limit.
      </p>
    </div>
  );
};

/**
 * Helper to resolve image source - returns URL or base64 data
 * Prefers base64 if both are set (for offline capability)
 */
export function resolveImageSource(imageData?: string, imageUrl?: string): string | undefined {
  return imageData || imageUrl;
}
