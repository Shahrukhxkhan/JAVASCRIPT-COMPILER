import React from 'react';

interface EditorProps {
  value: string;
  onChange: (val: string) => void;
}

const Editor: React.FC<EditorProps> = ({ value, onChange }) => {
  const lineCount = value.split('\n').length;

  return (
    <div className="flex h-full font-mono text-sm border border-gray-700 rounded-md overflow-hidden bg-gray-800">
      <div className="bg-gray-900 text-gray-500 p-4 text-right select-none border-r border-gray-700 min-w-[3rem]">
        {Array.from({ length: lineCount }).map((_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <textarea
        className="w-full h-full p-4 bg-gray-800 text-gray-100 outline-none resize-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
    </div>
  );
};

export default Editor;
