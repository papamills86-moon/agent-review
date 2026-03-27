import { useState } from 'react';
import type { EnhancementResult } from '../../types/counsel';

interface FinalPromptReviewProps {
  enhancedPrompt: string;
  enhancementResult: EnhancementResult | null;
  onSubmitToBoard: (finalPrompt: string) => void;
  onStartOver: () => void;
}

function FinalPromptReview({
  enhancedPrompt,
  enhancementResult,
  onSubmitToBoard,
  onStartOver,
}: FinalPromptReviewProps) {
  const [promptText, setPromptText] = useState(enhancedPrompt);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(promptText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = promptText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const securityColor =
    enhancementResult?.overall_security_level === 'caution'
      ? '#fbbf24'
      : '#4ade80';

  const securityLabel =
    enhancementResult?.overall_security_level === 'caution'
      ? 'Caution'
      : 'Clean';

  return (
    <div style={{ background: '#0f172a', borderRadius: 12, border: '1px solid #1e293b', padding: 24 }}>
      <h2 style={{ margin: '0 0 4px 0', fontSize: 20, fontWeight: 600, color: '#e2e8f0' }}>
        Final Prompt Review
      </h2>

      {enhancementResult && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ margin: '0 0 8px 0', fontSize: 14, color: '#94a3b8' }}>
            {enhancementResult.inferred_intent}
          </p>

          <span
            style={{
              display: 'inline-block',
              padding: '2px 10px',
              borderRadius: 9999,
              fontSize: 12,
              fontWeight: 600,
              color: '#0f172a',
              background: securityColor,
            }}
          >
            {securityLabel}
          </span>

          {enhancementResult.changes_made.length > 0 && (
            <ul
              style={{
                margin: '12px 0 0 0',
                paddingLeft: 18,
                listStyle: 'disc',
                fontSize: 13,
                color: '#94a3b8',
                lineHeight: 1.6,
              }}
            >
              {enhancementResult.changes_made.map((change, i) => (
                <li key={i}>{change}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div style={{ position: 'relative', marginBottom: 16 }}>
        <textarea
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          style={{
            width: '100%',
            minHeight: 200,
            padding: 12,
            background: '#0a0e1a',
            border: '1px solid #1e293b',
            borderRadius: 8,
            color: '#e2e8f0',
            fontFamily: 'monospace',
            fontSize: 14,
            lineHeight: 1.6,
            resize: 'vertical',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        <button
          onClick={handleCopy}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            padding: '4px 10px',
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 6,
            color: '#94a3b8',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          {copied ? 'Copied!' : 'Copy to Clipboard'}
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <button
          onClick={onStartOver}
          style={{
            padding: '10px 20px',
            background: 'transparent',
            border: '1px solid #1e293b',
            borderRadius: 8,
            color: '#94a3b8',
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          &larr; Start Over
        </button>
        <button
          onClick={() => onSubmitToBoard(promptText)}
          style={{
            padding: '10px 20px',
            background: '#0f2744',
            border: '1px solid #2563eb50',
            borderRadius: 8,
            color: '#60a5fa',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Submit to Review Board &rarr;
        </button>
      </div>
    </div>
  );
}

export default FinalPromptReview;
