import { useState, useEffect, useCallback } from 'react';

// Toast types with visual styling
export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  duration: number;
}

// Global toast state — allows calling toast() from anywhere (including non-React utils)
let toastIdCounter = 0;
const listeners = new Set<(toasts: ToastItem[]) => void>();
let currentToasts: ToastItem[] = [];

function notifyListeners() {
  listeners.forEach(fn => fn([...currentToasts]));
}

function addToast(message: string, type: ToastType, duration: number) {
  const id = ++toastIdCounter;
  currentToasts = [...currentToasts, { id, message, type, duration }];
  // Cap at 5 visible toasts
  if (currentToasts.length > 5) {
    currentToasts = currentToasts.slice(-5);
  }
  notifyListeners();

  setTimeout(() => {
    removeToast(id);
  }, duration);
}

function removeToast(id: number) {
  currentToasts = currentToasts.filter(t => t.id !== id);
  notifyListeners();
}

// Public API — call from anywhere
export const toast = {
  success: (message: string, duration = 3000) => addToast(message, 'success', duration),
  error: (message: string, duration = 5000) => addToast(message, 'error', duration),
  warning: (message: string, duration = 4000) => addToast(message, 'warning', duration),
  info: (message: string, duration = 3000) => addToast(message, 'info', duration),
};

// Styling per toast type
const typeStyles: Record<ToastType, string> = {
  success: 'bg-green-900/95 border-green-500 text-green-100',
  error: 'bg-red-900/95 border-red-500 text-red-100',
  warning: 'bg-yellow-900/95 border-yellow-500 text-yellow-100',
  info: 'bg-blue-900/95 border-blue-500 text-blue-100',
};

const typeIcons: Record<ToastType, string> = {
  success: '\u2714',
  error: '\u2716',
  warning: '\u26A0',
  info: '\u2139',
};

// Bottom on mobile for thumb-friendly dismissal, top-right on desktop
export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    listeners.add(setToasts);
    return () => { listeners.delete(setToasts); };
  }, []);

  const dismiss = useCallback((id: number) => removeToast(id), []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:bottom-auto md:top-4 md:left-auto md:right-4 z-[100] flex flex-col gap-2 md:max-w-sm md:w-full pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`pointer-events-auto border-l-4 rounded px-4 py-3 shadow-lg flex items-start gap-3 animate-slide-in-right ${typeStyles[t.type]}`}
          role="alert"
        >
          <span className="text-lg leading-none flex-shrink-0 mt-0.5">{typeIcons[t.type]}</span>
          <span className="text-sm flex-1 break-words">{t.message}</span>
          <button
            onClick={() => dismiss(t.id)}
            className="text-current opacity-50 hover:opacity-100 text-lg leading-none flex-shrink-0 min-w-[24px] min-h-[24px] flex items-center justify-center"
          >
            {'\u00D7'}
          </button>
        </div>
      ))}
    </div>
  );
}
