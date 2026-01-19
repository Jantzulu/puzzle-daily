import React from 'react';

interface WarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message: string;
  buttonText?: string;
}

/**
 * A styled warning modal that matches the dungeon theme.
 * Used instead of browser alert() for a consistent look.
 */
export const WarningModal: React.FC<WarningModalProps> = ({
  isOpen,
  onClose,
  title = 'Warning',
  message,
  buttonText = 'Got it',
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="dungeon-panel p-6 rounded-pixel-lg text-center max-w-sm mx-4 border-2 border-rust-600 bg-gradient-to-b from-stone-800 to-stone-900">
        {/* Warning icon */}
        <div className="text-4xl mb-3">
          <span className="text-rust-400">&#9888;</span>
        </div>

        {/* Title */}
        <h3 className="text-xl font-bold font-medieval text-rust-300 text-shadow-dungeon mb-2">
          {title}
        </h3>

        {/* Message */}
        <p className="text-parchment-300 mb-4">
          {message}
        </p>

        {/* Button */}
        <button
          onClick={onClose}
          className="dungeon-btn-primary px-6 py-2 font-medium"
          autoFocus
        >
          {buttonText}
        </button>
      </div>
    </div>
  );
};

export default WarningModal;
