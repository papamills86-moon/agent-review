import { useState } from "react";
import type { EnhancementResult, Clarification } from "../../types/counsel";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EnhancementReviewProps {
  enhancementResult: EnhancementResult;
  followUpQuestions: string[];
  isEnhancing: boolean;
  onSubmitClarifications: (clarifications: Clarification[]) => void;
  onSkipClarifications: () => void;
}

// ─── Inline keyframes ─────────────────────────────────────────────────────────

const REVIEW_STYLES = `
@keyframes er-pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}
@keyframes er-spin {
  to { transform: rotate(360deg); }
}
@keyframes er-fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
`;

// ─── Component ────────────────────────────────────────────────────────────────

export default function EnhancementReview({
  enhancementResult,
  followUpQuestions,
  isEnhancing,
  onSubmitClarifications,
  onSkipClarifications,
}: EnhancementReviewProps) {
  const [answers, setAnswers] = useState<string[]>(
    () => followUpQuestions.map(() => "")
  );

  const hasQuestions = followUpQuestions.length > 0;
  const allAnswered = answers.length > 0 && answers.every((a) => a.trim() !== "");
  const canSubmit = allAnswered && !isEnhancing;

  function handleAnswerChange(index: number, value: string) {
    setAnswers((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function handleSubmit() {
    if (!canSubmit) return;
    const clarifications: Clarification[] = followUpQuestions.map((q, i) => ({
      question: q,
      answer: answers[i],
    }));
    onSubmitClarifications(clarifications);
  }

  // ─── Shared styles ──────────────────────────────────────────────────────────

  const primaryButtonStyle = (enabled: boolean): React.CSSProperties => ({
    padding: "10px 24px",
    background: enabled
      ? "linear-gradient(135deg, #1e3a5f 0%, #0f2744 100%)"
      : "#0c1221",
    border: `1px solid ${enabled ? "#2563eb50" : "#1e293b"}`,
    borderRadius: "6px",
    color: enabled ? "#60a5fa" : "#374151",
    fontSize: "13px",
    fontWeight: 600,
    cursor: enabled ? "pointer" : "default",
    transition: "all 0.2s ease",
    fontFamily: "inherit",
    letterSpacing: "0.3px",
  });

  const textButtonStyle: React.CSSProperties = {
    padding: "10px 20px",
    background: "transparent",
    border: "none",
    borderRadius: "6px",
    color: "#94a3b8",
    fontSize: "13px",
    fontWeight: 500,
    cursor: isEnhancing ? "default" : "pointer",
    transition: "all 0.2s ease",
    fontFamily: "inherit",
    letterSpacing: "0.3px",
    opacity: isEnhancing ? 0.4 : 1,
  };

  const promptBlockStyle: React.CSSProperties = {
    minHeight: 120,
    maxHeight: 400,
    overflowY: "auto",
    background: "#0a0e1a",
    border: "1px solid #1e293b",
    borderRadius: 10,
    padding: 20,
    fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
    fontSize: 13,
    lineHeight: 1.7,
    color: "#e2e8f0",
    userSelect: "text",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  };

  const chipStyle: React.CSSProperties = {
    display: "inline-block",
    padding: "3px 10px",
    background: "rgba(96,165,250,0.1)",
    border: "1px solid rgba(96,165,250,0.2)",
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 500,
    color: "#60a5fa",
    letterSpacing: "0.2px",
  };

  const textareaStyle: React.CSSProperties = {
    width: "100%",
    minHeight: 64,
    padding: "10px 14px",
    background: "#0a0e1a",
    border: "1px solid #1e293b",
    borderRadius: 8,
    color: "#e2e8f0",
    fontSize: 13,
    lineHeight: 1.6,
    fontFamily: "inherit",
    resize: "vertical",
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.2s ease",
  };

  // ─── Loading state ──────────────────────────────────────────────────────────

  if (isEnhancing && !enhancementResult) {
    return (
      <>
        <style>{REVIEW_STYLES}</style>
        <div style={{
          maxWidth: 780,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "60px 20px",
          gap: 16,
        }}>
          <div style={{
            width: 32,
            height: 32,
            border: "3px solid #1e293b",
            borderTop: "3px solid #60a5fa",
            borderRadius: "50%",
            animation: "er-spin 0.8s linear infinite",
          }} />
          <span style={{
            fontSize: 14,
            color: "#94a3b8",
            fontWeight: 500,
            animation: "er-pulse 2s ease-in-out infinite",
          }}>
            Enhancing prompt...
          </span>
        </div>
      </>
    );
  }

  // ─── Security badge ─────────────────────────────────────────────────────────

  const securityLevel = enhancementResult.overall_security_level;
  const showSecurityBadge = securityLevel !== "clean";
  const securityColor = securityLevel === "blocked" ? "#f87171" : "#fbbf24";
  const securityBg =
    securityLevel === "blocked"
      ? "rgba(248,113,113,0.1)"
      : "rgba(251,191,36,0.1)";
  const securityBorder =
    securityLevel === "blocked"
      ? "rgba(248,113,113,0.3)"
      : "rgba(251,191,36,0.3)";
  const securityLabel = securityLevel === "blocked" ? "Blocked" : "Caution";

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{REVIEW_STYLES}</style>
      <div style={{
        maxWidth: 780,
        margin: "0 auto",
        animation: "er-fade-in 0.3s ease",
      }}>
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
            {hasQuestions ? "Review Enhancement" : "Enhanced Prompt"}
          </h2>
          <p style={{
            margin: 0,
            fontSize: 13,
            color: "#64748b",
            lineHeight: 1.5,
          }}>
            {hasQuestions
              ? "Review the draft enhancement and answer follow-up questions to refine further."
              : "Your prompt has been enhanced and is ready to proceed."}
          </p>
        </div>

        {/* Security badge */}
        {showSecurityBadge && (
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 12px",
            background: securityBg,
            border: `1px solid ${securityBorder}`,
            borderRadius: 6,
            marginBottom: 16,
          }}>
            <span style={{ fontSize: 13 }}>
              {securityLevel === "blocked" ? "\u26d4" : "\u26a0\ufe0f"}
            </span>
            <span style={{
              fontSize: 12,
              fontWeight: 600,
              color: securityColor,
              letterSpacing: "0.3px",
            }}>
              {securityLabel}
            </span>
            {enhancementResult.security_flags.length > 0 && (
              <span style={{
                fontSize: 11,
                color: securityColor,
                opacity: 0.7,
                marginLeft: 4,
              }}>
                — {enhancementResult.security_flags.join(", ")}
              </span>
            )}
          </div>
        )}

        {/* Enhanced prompt display */}
        <div style={promptBlockStyle}>
          {enhancementResult.refined_prompt}
        </div>

        {/* Inferred Intent */}
        {enhancementResult.inferred_intent && (
          <p style={{
            margin: "12px 0 0",
            fontSize: 12,
            color: "#475569",
            fontStyle: "italic",
            lineHeight: 1.5,
          }}>
            Inferred intent: {enhancementResult.inferred_intent}
          </p>
        )}

        {/* Changes Made */}
        {enhancementResult.changes_made.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#64748b",
              textTransform: "uppercase",
              letterSpacing: "0.8px",
              marginBottom: 8,
              display: "block",
            }}>
              Changes Made
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {enhancementResult.changes_made.map((change, i) => (
                <span key={i} style={chipStyle}>
                  {change}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Mode 1: Follow-up questions */}
        {hasQuestions && (
          <div style={{ marginTop: 28 }}>
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#64748b",
              textTransform: "uppercase",
              letterSpacing: "0.8px",
              marginBottom: 14,
              display: "block",
            }}>
              Follow-up Questions
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {followUpQuestions.map((question, i) => (
                <div key={i} style={{
                  padding: 16,
                  background: "rgba(15,23,42,0.6)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 10,
                }}>
                  <p style={{
                    margin: "0 0 10px",
                    fontSize: 13,
                    color: "#e2e8f0",
                    fontWeight: 500,
                    lineHeight: 1.5,
                  }}>
                    {question}
                  </p>
                  <textarea
                    value={answers[i] ?? ""}
                    onChange={(e) => handleAnswerChange(i, e.target.value)}
                    placeholder="Your answer..."
                    disabled={isEnhancing}
                    style={{
                      ...textareaStyle,
                      opacity: isEnhancing ? 0.5 : 1,
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "#2563eb50";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "#1e293b";
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Buttons */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginTop: 20,
            }}>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                style={primaryButtonStyle(canSubmit)}
              >
                {isEnhancing ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      width: 14,
                      height: 14,
                      border: "2px solid #1e293b",
                      borderTop: "2px solid #60a5fa",
                      borderRadius: "50%",
                      display: "inline-block",
                      animation: "er-spin 0.8s linear infinite",
                    }} />
                    Enhancing...
                  </span>
                ) : (
                  "Submit Answers & Enhance Further"
                )}
              </button>
              <button
                onClick={onSkipClarifications}
                disabled={isEnhancing}
                style={textButtonStyle}
              >
                Skip Questions &rarr;
              </button>
            </div>
          </div>
        )}

        {/* Mode 2: No questions — show continue button */}
        {!hasQuestions && (
          <div style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: 24,
          }}>
            <button
              onClick={onSkipClarifications}
              disabled={isEnhancing}
              style={primaryButtonStyle(!isEnhancing)}
            >
              {isEnhancing ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    width: 14,
                    height: 14,
                    border: "2px solid #1e293b",
                    borderTop: "2px solid #60a5fa",
                    borderRadius: "50%",
                    display: "inline-block",
                    animation: "er-spin 0.8s linear infinite",
                  }} />
                  Enhancing...
                </span>
              ) : (
                "Continue \u2192"
              )}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
