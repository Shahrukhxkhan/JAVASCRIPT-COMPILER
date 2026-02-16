import React from 'react';

interface OutputPanelProps {
  title: string;
  data: any;
  type?: 'json' | 'text' | 'list';
}

const OutputPanel: React.FC<OutputPanelProps> = ({ title, data, type = 'json' }) => {
  return (
    <div className="flex flex-col h-full bg-gray-800 border border-gray-700 rounded-md overflow-hidden">
      <div className="bg-gray-700 p-2 font-bold text-sm text-gray-300 uppercase tracking-wide">
        {title}
      </div>
      <div className="flex-1 overflow-auto p-4 font-mono text-xs">
        {type === 'json' && (
          <pre className="text-green-400">
            {JSON.stringify(data, null, 2)}
          </pre>
        )}
        {type === 'text' && (
          <pre className="text-blue-300 whitespace-pre-wrap">{data}</pre>
        )}
        {type === 'list' && Array.isArray(data) && (
            <div className="space-y-1">
                {data.map((item, idx) => (
                    <div key={idx} className="border-b border-gray-700 pb-1 mb-1 text-gray-300">
                        {JSON.stringify(item)}
                    </div>
                ))}
            </div>
        )}
      </div>
    </div>
  );
};

export default OutputPanel;
