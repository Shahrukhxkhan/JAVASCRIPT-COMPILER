import React, { useState, useRef } from 'react';

interface EditorProps {
  value: string;
  onChange: (val: string) => void;
}

const Editor: React.FC<EditorProps> = ({ value, onChange }) => {
  const [isFocused, setIsFocused] = useState(false);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const lineCount = value.split('\n').length || 1;

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  return (
    <div className={`flex h-full font-mono text-sm leading-normal border rounded-md overflow-hidden bg-panel transition-all duration-300 shadow-lg ${isFocused ? 'border-gold shadow-[0_0_15px_rgba(255,215,0,0.15)]' : 'border-gold-borderDark'}`}>
      <div 
        ref={lineNumbersRef}
        className="bg-background text-gold-muted pt-4 pb-4 px-2 text-right select-none border-r border-gold-borderDark min-w-[3rem] opacity-70 overflow-hidden"
      >
        {Array.from({ length: lineCount }).map((_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <textarea
        className="w-full h-full p-4 bg-panel text-text-primary outline-none resize-none custom-scrollbar leading-normal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onScroll={handleScroll}
        spellCheck={false}
      />
    </div>
  );
};

export default Editor;
