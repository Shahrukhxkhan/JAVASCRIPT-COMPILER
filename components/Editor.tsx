import React, { useRef, useCallback } from 'react';

interface EditorProps {
  value: string;
  onChange: (val: string) => void;
}

const Editor: React.FC<EditorProps> = ({ value, onChange }) => {
  const lineCount = value.split('\n').length;
  const lineNumberRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleScroll = useCallback(() => {
    if (lineNumberRef.current && textareaRef.current) {
      lineNumberRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  return (
    <div className="flex h-full font-mono text-sm border border-gray-700 rounded-md overflow-hidden bg-gray-800">
      <div
        ref={lineNumberRef}
        className="bg-gray-900 text-gray-500 p-4 text-right select-none border-r border-gray-700 min-w-[3rem] overflow-hidden"
        style={{ lineHeight: '1.5rem' }}
      >
        {Array.from({ length: lineCount }).map((_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <textarea
        ref={textareaRef}
        className="w-full h-full p-4 bg-gray-800 text-gray-100 outline-none resize-none"
        style={{ lineHeight: '1.5rem' }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={handleScroll}
        spellCheck={false}
      />
    </div>
  );
};

export default Editor;
