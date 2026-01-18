import React, { useRef, useEffect, useState } from 'react';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
}

const PRESET_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#ffffff', // white
  '#9ca3af', // gray
];

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  placeholder = 'Enter text...',
  multiline = false,
  className = '',
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize content only once or when value changes externally
  useEffect(() => {
    if (editorRef.current && !isInitialized) {
      editorRef.current.innerHTML = value || '';
      setIsInitialized(true);
    }
  }, [value, isInitialized]);

  // Update content when value changes from outside (e.g., loading different asset)
  useEffect(() => {
    if (editorRef.current && isInitialized) {
      const currentHtml = editorRef.current.innerHTML;
      // Only update if the value has changed significantly (not just formatting)
      if (value !== currentHtml && value !== undefined) {
        // Check if this is a different value (not from our own onChange)
        const normalizedCurrent = currentHtml.replace(/&nbsp;/g, ' ').trim();
        const normalizedValue = (value || '').trim();
        if (normalizedCurrent !== normalizedValue) {
          editorRef.current.innerHTML = value || '';
        }
      }
    }
  }, [value, isInitialized]);

  const handleInput = () => {
    if (editorRef.current) {
      let html = editorRef.current.innerHTML;
      // Clean up the HTML - convert divs/br to newlines if not multiline
      if (!multiline) {
        html = html.replace(/<div>/gi, '').replace(/<\/div>/gi, '').replace(/<br\s*\/?>/gi, '');
      }
      onChange(html);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!multiline && e.key === 'Enter') {
      e.preventDefault();
    }
  };

  const execCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    handleInput();
  };

  const applyColor = (color: string) => {
    execCommand('foreColor', color);
    setShowColorPicker(false);
  };

  const isFormatActive = (command: string): boolean => {
    return document.queryCommandState(command);
  };

  return (
    <div className={`rich-text-editor ${className}`}>
      {/* Toolbar */}
      <div className="flex gap-1 mb-1 p-1 bg-stone-700 rounded-t border-b border-stone-600">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execCommand('bold')}
          className={`px-2 py-1 text-sm rounded hover:bg-stone-600 font-bold ${
            isFormatActive('bold') ? 'bg-stone-500 text-parchment-100' : 'text-parchment-300'
          }`}
          title="Bold (Ctrl+B)"
        >
          B
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execCommand('italic')}
          className={`px-2 py-1 text-sm rounded hover:bg-stone-600 italic ${
            isFormatActive('italic') ? 'bg-stone-500 text-parchment-100' : 'text-parchment-300'
          }`}
          title="Italic (Ctrl+I)"
        >
          I
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execCommand('underline')}
          className={`px-2 py-1 text-sm rounded hover:bg-stone-600 underline ${
            isFormatActive('underline') ? 'bg-stone-500 text-parchment-100' : 'text-parchment-300'
          }`}
          title="Underline (Ctrl+U)"
        >
          U
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execCommand('strikeThrough')}
          className={`px-2 py-1 text-sm rounded hover:bg-stone-600 line-through ${
            isFormatActive('strikeThrough') ? 'bg-stone-500 text-parchment-100' : 'text-parchment-300'
          }`}
          title="Strikethrough"
        >
          S
        </button>

        <div className="w-px bg-stone-600 mx-1" />

        {/* Color picker */}
        <div className="relative">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setShowColorPicker(!showColorPicker)}
            className="px-2 py-1 text-sm rounded hover:bg-stone-600 text-parchment-300 flex items-center gap-1"
            title="Text Color"
          >
            <span className="text-red-400">A</span>
            <span className="text-[10px]">▼</span>
          </button>
          {showColorPicker && (
            <div className="absolute top-full left-0 mt-1 p-2 bg-stone-800 rounded shadow-lg border border-stone-600 z-50 grid grid-cols-5 gap-1">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyColor(color)}
                  className="w-6 h-6 rounded border border-stone-500 hover:scale-110 transition-transform"
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
          )}
        </div>

        <div className="w-px bg-stone-600 mx-1" />

        {/* Clear formatting */}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execCommand('removeFormat')}
          className="px-2 py-1 text-sm rounded hover:bg-stone-600 text-parchment-300"
          title="Clear Formatting"
        >
          ✕
        </button>
      </div>

      {/* Editable area */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onBlur={() => setShowColorPicker(false)}
        data-placeholder={placeholder}
        className={`px-3 py-2 bg-stone-700 rounded-b text-sm text-parchment-100 outline-none focus:ring-1 focus:ring-blue-500 min-h-[2.5rem] ${
          multiline ? 'min-h-[4rem]' : ''
        } empty:before:content-[attr(data-placeholder)] empty:before:text-stone-500`}
        style={{ whiteSpace: multiline ? 'pre-wrap' : 'nowrap' }}
      />
    </div>
  );
};

/**
 * Renders rich text HTML safely
 * Used to display formatted text in tooltips and other UI
 */
export const RichTextRenderer: React.FC<{ html: string; className?: string }> = ({
  html,
  className = '',
}) => {
  // Sanitize HTML to only allow safe formatting tags
  const sanitizeHtml = (input: string): string => {
    // Create a temporary element to parse
    const temp = document.createElement('div');
    temp.innerHTML = input;

    // Walk through and remove any non-allowed elements
    const allowedTags = ['B', 'I', 'U', 'S', 'STRONG', 'EM', 'SPAN', 'FONT', 'BR'];
    const walkAndClean = (node: Node) => {
      const children = Array.from(node.childNodes);
      for (const child of children) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const el = child as Element;
          if (!allowedTags.includes(el.tagName)) {
            // Replace disallowed element with its text content
            const text = document.createTextNode(el.textContent || '');
            node.replaceChild(text, child);
          } else {
            // Clean attributes except style (for colors) and color
            const attrs = Array.from(el.attributes);
            for (const attr of attrs) {
              if (attr.name !== 'style' && attr.name !== 'color') {
                el.removeAttribute(attr.name);
              }
            }
            walkAndClean(child);
          }
        }
      }
    };

    walkAndClean(temp);
    return temp.innerHTML;
  };

  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
    />
  );
};

export default RichTextEditor;
