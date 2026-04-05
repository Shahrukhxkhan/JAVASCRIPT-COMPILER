import React from 'react';

interface OutputPanelProps {
  title: string;
  data: any;
  type?: 'json' | 'text' | 'list';
}

const OutputPanel: React.FC<OutputPanelProps> = ({ title, data, type = 'json' }) => {
  return (
    <div className="flex flex-col h-full bg-panel border-l-2 border-gold-dark rounded-md overflow-hidden shadow-md animate-fade-in">
      <div className="bg-background/80 p-3 font-bold text-sm text-gold uppercase tracking-wider border-b border-gold-border">
        {title}
      </div>
      <div className="flex-1 overflow-auto p-4 font-mono text-xs custom-scrollbar">
        {type === 'json' && (
          <pre 
            className="text-text-primary"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(data, null, 2).replace(/"([^"]+)":/g, '<span class="text-gold-warm">"$1"</span>:') }}
          />
        )}
        {type === 'text' && (
          <pre className="text-text-primary whitespace-pre-wrap">
            {data.split('\n').map((line: string, i: number) => {
              if (line.includes('Error')) {
                return <div key={i} className="text-error flex items-start gap-2"><span className="mt-0.5">⚠️</span> {line}</div>;
              }
              return <div key={i}>{line}</div>;
            })}
          </pre>
        )}
        {type === 'list' && Array.isArray(data) && (
            <div className="space-y-1">
                {data.map((item, idx) => (
                    <div key={idx} className="border-b border-gold-border pb-2 mb-2 text-text-secondary hover:text-text-primary transition-colors">
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
