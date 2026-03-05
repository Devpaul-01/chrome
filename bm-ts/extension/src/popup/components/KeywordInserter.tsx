import { useState } from 'react';

interface KeywordInserterProps {
  onInsert: (keyword: string) => void;
  compact?: boolean;
}

export default function KeywordInserter({ onInsert, compact = false }: KeywordInserterProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const keywords = [
    { value: '{First_Name}', label: 'First Name', description: "Friend's first name" },
    { value: '{Last_Name}', label: 'Last Name', description: "Friend's last name" },
    { value: '{Today}', label: 'Today', description: 'Current date' },
    { value: '[Image]', label: 'Random Image', description: 'Random image from your library' },
  ];

  if (compact) {
    return (
      <div style={{ marginBottom: '8px' }}>
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="btn"
          style={{ marginBottom: '4px' }}
        >
          {isExpanded ? '− Hide Keywords' : '+ Insert Keyword'}
        </button>

        {isExpanded && (
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {keywords.map((kw) => (
              <button
                key={kw.value}
                type="button"
                onClick={() => onInsert(kw.value)}
                className="btn"
                title={kw.description}
              >
                {kw.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: '12px' }}>
      <h3 style={{ fontSize: '14px', marginBottom: '8px' }}>Insert Keywords</h3>
      <p style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
        Click to insert dynamic content placeholders
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
        {keywords.map((kw) => (
          <button
            key={kw.value}
            type="button"
            onClick={() => onInsert(kw.value)}
            className="btn"
            style={{ textAlign: 'left' }}
          >
            <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>{kw.label}</div>
            <div style={{ fontSize: '11px', color: '#666' }}>{kw.value}</div>
          </button>
        ))}
      </div>

      <div
        style={{
          marginTop: '12px',
          padding: '8px',
          background: '#f5f5f5',
          borderRadius: '4px',
          fontSize: '11px',
        }}
      >
        <strong>How it works:</strong>
        <ul style={{ margin: '4px 0', paddingLeft: '20px' }}>
          <li>Keywords are replaced when messages are sent</li>
          <li>Use them in greetings, body, or closing segments</li>
          <li>[Image] inserts a random image from your library</li>
        </ul>
      </div>
    </div>
  );
}
