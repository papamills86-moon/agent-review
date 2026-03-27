import { useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PromptInputProps {
  onEnhance: (input: string) => void;
  onSkipToReview: (input: string) => void;
}

// ─── Sample Prompts ───────────────────────────────────────────────────────────

const SAMPLE_PROMPTS = [
  {
    label: "Code Review",
    text: "Review this pull request for security vulnerabilities, performance issues, and adherence to best practices. Focus on the authentication flow changes.",
  },
  {
    label: "Architecture",
    text: "Design a microservices architecture for a real-time collaborative document editor that supports 10,000 concurrent users with conflict resolution.",
  },
  {
    label: "Data Pipeline",
    text: "Build an ETL pipeline that ingests JSON logs from S3, transforms them into a star schema, and loads into Redshift with incremental updates.",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function PromptInput({ onEnhance, onSkipToReview }: PromptInputProps) {
  const [inputText, setInputText] = useState("");

  const isEmpty = inputText.trim() === "";

  return (
    <div style={{ maxWidth: 780, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 20, textAlign: "left" }}>
        <h2 style={{
          margin: "0 0 6px",
          fontSize: 22,
          fontWeight: 700,
          color: "#f1f5f9",
          letterSpacing: "-0.3px",
          fontFamily: "inherit",
        }}>
          Enter Your Prompt
        </h2>
        <p style={{
          margin: 0,
          fontSize: 13,
          color: "#64748b",
          lineHeight: 1.5,
        }}>
          Describe what you want to accomplish. Enhance it first or skip straight to review.
        </p>
      </div>

      {/* Textarea */}
      <textarea
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        placeholder="Describe what you want to accomplish. The more context you provide, the better the results..."
        style={{
          width: "100%",
          minHeight: 180,
          background: "#0a0e1a",
          border: "1px solid #1e293b",
          color: "#e2e8f0",
          borderRadius: 10,
          padding: 18,
          fontSize: 14,
          lineHeight: 1.7,
          fontFamily: "inherit",
          resize: "vertical",
          boxSizing: "border-box",
          outline: "none",
          transition: "border-color 0.2s ease",
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(99,102,241,0.4)"; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = "#1e293b"; }}
      />

      {/* Character counter */}
      <div style={{
        display: "flex",
        justifyContent: "flex-end",
        marginTop: 6,
      }}>
        <span style={{ fontSize: 11, color: "#475569" }}>
          {inputText.length > 0 ? `${inputText.length} characters` : ""}
        </span>
      </div>

      {/* Sample prompts */}
      <div style={{ marginTop: 20 }}>
        <div style={{
          fontSize: 11,
          fontWeight: 600,
          color: "#475569",
          textTransform: "uppercase",
          letterSpacing: "0.8px",
          marginBottom: 10,
        }}>
          Try a sample
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {SAMPLE_PROMPTS.map((sample) => (
            <button
              key={sample.label}
              onClick={() => setInputText(sample.text)}
              style={{
                padding: "8px 14px",
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 6,
                color: "#94a3b8",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                transition: "all 0.2s ease",
                fontFamily: "inherit",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(99,102,241,0.06)";
                e.currentTarget.style.borderColor = "rgba(99,102,241,0.2)";
                e.currentTarget.style.color = "#a5b4fc";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                e.currentTarget.style.color = "#94a3b8";
              }}
            >
              {sample.label}
            </button>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{
        marginTop: 28,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 12,
      }}>
        {/* Primary: Enhance Prompt */}
        <button
          onClick={() => onEnhance(inputText)}
          disabled={isEmpty}
          style={{
            padding: "10px 24px",
            background: isEmpty
              ? "#0c1221"
              : "linear-gradient(135deg, #1e3a5f 0%, #0f2744 100%)",
            border: `1px solid ${isEmpty ? "#1e293b" : "#6366f150"}`,
            borderRadius: 6,
            color: isEmpty ? "#374151" : "#818cf8",
            fontSize: 13,
            fontWeight: 600,
            cursor: isEmpty ? "default" : "pointer",
            transition: "all 0.2s ease",
            fontFamily: "inherit",
            letterSpacing: "0.3px",
          }}
        >
          Enhance Prompt
        </button>

        {/* Secondary: Skip to Review */}
        <button
          onClick={() => onSkipToReview(inputText)}
          disabled={isEmpty}
          style={{
            padding: "6px 2px",
            background: "transparent",
            border: "none",
            color: isEmpty ? "#374151" : "#94a3b8",
            fontSize: 13,
            fontWeight: 500,
            cursor: isEmpty ? "default" : "pointer",
            transition: "all 0.2s ease",
            fontFamily: "inherit",
            letterSpacing: "0.2px",
          }}
          onMouseEnter={(e) => {
            if (!isEmpty) e.currentTarget.style.color = "#e2e8f0";
          }}
          onMouseLeave={(e) => {
            if (!isEmpty) e.currentTarget.style.color = "#94a3b8";
          }}
        >
          Skip to Review →
        </button>
      </div>
    </div>
  );
}
