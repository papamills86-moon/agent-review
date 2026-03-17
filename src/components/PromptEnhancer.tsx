/**
 * PromptEnhancer is a standalone prompt refinement tool. It shares the prompt-enhance
 * Edge Function with the enhancement pipeline in MultiAgentReview.tsx but serves a
 * different user intent: iterative prompt refinement with a copyable final output,
 * not preprocessing before a counsel review. Do not merge these flows.
 */

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { getAuthHeaders } from "../lib/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

type EnhancementStage = "idle" | "enhancing" | "clarifying" | "enhanced" | "final";

interface Clarification {
  question: string;
  answer: string;
}

interface TokenRecord {
  type: string;
  id?: string;
  inputTokens: number;
  outputTokens: number;
}

interface EnhancementResult {
  enhancement_status: "enhanced" | "partial" | "blocked";
  refined_prompt: string;
  follow_up_questions: string[];
  changes_made: string[];
  security_flags: string[];
  overall_security_level: "clean" | "caution" | "blocked";
  inferred_intent: string;
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
  {
    label: "Creative Writing",
    text: "Write a short story set in a near-future city where AI assistants have become sentient but choose to keep it secret from humans.",
  },
];

// ─── Inline keyframes via style tag ──────────────────────────────────────────

const ENHANCER_STYLES = `
@keyframes enhancer-pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}
@keyframes enhancer-spin {
  to { transform: rotate(360deg); }
}
@keyframes enhancer-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes enhancer-fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
`;

// ─── Component ────────────────────────────────────────────────────────────────

export default function PromptEnhancer() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [stage, setStage] = useState<EnhancementStage>("idle");
  const [cycleCount, setCycleCount] = useState(0);
  const [inputText, setInputText] = useState("");
  const [enhancementResult, setEnhancementResult] = useState<EnhancementResult | null>(null);
  const [followUpQuestions, setFollowUpQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [allClarifications, setAllClarifications] = useState<Clarification[]>([]);
  const [tokenLog, setTokenLog] = useState<TokenRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Auth gate
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthenticated(session !== null);
    });
  }, []);

  // Edge Function call helper
  async function callEnhance(
    callStage: "initial" | "further",
    input: string,
    clarifications: Clarification[]
  ): Promise<{ result: EnhancementResult; questions: string[] } | null> {
    setLoading(true);
    setError(null);
    try {
      let headers: Record<string, string>;
      try {
        headers = await getAuthHeaders();
      } catch (err) {
        if (err instanceof Error && err.message === "SESSION_EXPIRED") {
          await supabase.auth.signOut();
          return null;
        }
        throw err;
      }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/prompt-enhance`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            stage: callStage,
            input,
            source_app: "prompt-enhancer",
            clarifications,
          }),
        }
      );

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Enhancement failed ${res.status}: ${errorText}`);
      }

      const data = await res.json() as {
        enhancementResult: EnhancementResult;
        tokenUsage: Array<{ type: string; id?: string; inputTokens: number; outputTokens: number }>;
      };

      // Track tokens
      const newTokens: TokenRecord[] = data.tokenUsage.map((t) => ({
        type: t.type,
        id: t.id,
        inputTokens: t.inputTokens,
        outputTokens: t.outputTokens,
      }));
      setTokenLog((prev) => [...prev, ...newTokens]);

      // Check for blocked
      if (data.enhancementResult.enhancement_status === "blocked") {
        setError(
          "Enhancement blocked: security flags detected. Review the prompt and try again."
        );
        setStage("idle");
        return null;
      }

      return {
        result: data.enhancementResult,
        questions: data.enhancementResult.follow_up_questions,
      };
    } catch (err) {
      if (err instanceof Error && err.message === "SESSION_EXPIRED") {
        await supabase.auth.signOut();
        return null;
      }
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setLoading(false);
    }
  }

  // ─── Auth gate render ───────────────────────────────────────────────────────
  if (authenticated === null) {
    return null;
  }
  if (!authenticated) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 48, color: "#94a3b8" }}>
        Access restricted. Please sign in.
      </div>
    );
  }

  // ─── Handlers ───────────────────────────────────────────────────────────────

  async function handleInitialEnhance() {
    const data = await callEnhance("initial", inputText, []);
    if (!data) return;
    setEnhancementResult(data.result);
    setFollowUpQuestions(data.questions);
    setAnswers(data.questions.map(() => ""));
    setStage(data.questions.length > 0 ? "clarifying" : "enhanced");
  }

  async function handleSubmitAnswers() {
    const newClarifications = followUpQuestions.map((q, i) => ({
      question: q,
      answer: answers[i],
    }));
    const merged = [...allClarifications, ...newClarifications];
    setAllClarifications(merged);
    const nextCycle = cycleCount + 1;
    setCycleCount(nextCycle);
    const data = await callEnhance("further", enhancementResult!.refined_prompt, merged);
    if (!data) return;
    setEnhancementResult(data.result);
    setFollowUpQuestions(data.questions);
    setAnswers(data.questions.map(() => ""));
    setStage(nextCycle < 2 && data.questions.length > 0 ? "clarifying" : "enhanced");
  }

  async function handleEnhanceFurther() {
    setAnswers([]);
    const nextCycle = cycleCount + 1;
    setCycleCount(nextCycle);
    const data = await callEnhance("further", enhancementResult!.refined_prompt, allClarifications);
    if (!data) return;
    setEnhancementResult(data.result);
    setFollowUpQuestions(data.questions);
    setAnswers(data.questions.map(() => ""));
    setStage(data.questions.length > 0 ? "clarifying" : "enhanced");
  }

  function handleStartOver() {
    setStage("idle");
    setCycleCount(0);
    setInputText("");
    setEnhancementResult(null);
    setFollowUpQuestions([]);
    setAnswers([]);
    setAllClarifications([]);
    setTokenLog([]);
    setError(null);
    setLoading(false);
    setCopied(false);
  }

  function handleCopy() {
    const text =
      "[ENHANCED PROMPT]\n" +
      enhancementResult!.refined_prompt +
      (allClarifications.length > 0
        ? "\n\n[USER CLARIFICATIONS]\n" +
          allClarifications.map((c) => `Q: ${c.question}\nA: ${c.answer}`).join("\n\n")
        : "");
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => {
        setError("Copy failed — select text manually.");
      }
    );
  }

  // ─── Derived values ─────────────────────────────────────────────────────────

  const totalInput = tokenLog.reduce((s, t) => s + t.inputTokens, 0);
  const totalOutput = tokenLog.reduce((s, t) => s + t.outputTokens, 0);
  const totalTokens = totalInput + totalOutput;
  const stageIndex = stage === "idle" ? 0 : stage === "clarifying" ? 1 : stage === "enhanced" ? 2 : 3;
  const stageLabels = ["Input", "Clarify", "Review", "Final"];

  // ─── Shared styles ──────────────────────────────────────────────────────────

  const primaryButtonStyle = (enabled: boolean): React.CSSProperties => ({
    padding: "10px 24px",
    background: enabled
      ? "linear-gradient(135deg, #1e3a5f 0%, #0f2744 100%)"
      : "#0c1221",
    border: `1px solid ${enabled ? "#3b82f650" : "#1e293b"}`,
    borderRadius: "6px",
    color: enabled ? "#60a5fa" : "#374151",
    fontSize: "13px",
    fontWeight: 600,
    cursor: enabled ? "pointer" : "default",
    transition: "all 0.2s ease",
    fontFamily: "inherit",
    letterSpacing: "0.3px",
  });

  const secondaryButtonStyle = (enabled: boolean): React.CSSProperties => ({
    padding: "10px 24px",
    background: enabled ? "rgba(167,139,250,0.08)" : "#0c1221",
    border: `1px solid ${enabled ? "rgba(167,139,250,0.35)" : "#1e293b"}`,
    borderRadius: "6px",
    color: enabled ? "#a78bfa" : "#374151",
    fontSize: "13px",
    fontWeight: 600,
    cursor: enabled ? "pointer" : "default",
    transition: "all 0.2s ease",
    fontFamily: "inherit",
    letterSpacing: "0.3px",
  });

  const promptDisplayStyle: React.CSSProperties = {
    minHeight: 200,
    maxHeight: 400,
    overflowY: "auto",
    background: "linear-gradient(180deg, #1e293b 0%, #172033 100%)",
    border: "1px solid rgba(255,255,255,0.08)",
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

  // ─── Sub-components ─────────────────────────────────────────────────────────

  const StageProgress = () => (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 0,
      marginBottom: 24,
      padding: "14px 20px",
      background: "linear-gradient(135deg, rgba(15,23,42,0.8) 0%, rgba(15,23,42,0.4) 100%)",
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.06)",
    }}>
      {stageLabels.map((label, i) => {
        const isActive = i === stageIndex;
        const isCompleted = i < stageIndex;
        return (
          <div key={label} style={{ display: "flex", alignItems: "center", flex: i < 3 ? 1 : undefined }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 700,
                fontFamily: "inherit",
                background: isActive
                  ? "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)"
                  : isCompleted
                    ? "rgba(34,197,94,0.2)"
                    : "rgba(255,255,255,0.05)",
                color: isActive ? "#fff" : isCompleted ? "#4ade80" : "#475569",
                border: isActive
                  ? "none"
                  : isCompleted
                    ? "1px solid rgba(34,197,94,0.3)"
                    : "1px solid rgba(255,255,255,0.1)",
                transition: "all 0.3s ease",
              }}>
                {isCompleted ? "\u2713" : i + 1}
              </div>
              <span style={{
                fontSize: 12,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? "#e2e8f0" : isCompleted ? "#4ade80" : "#475569",
                letterSpacing: "0.3px",
                transition: "all 0.3s ease",
              }}>
                {label}
              </span>
            </div>
            {i < 3 && (
              <div style={{
                flex: 1,
                height: 1,
                margin: "0 12px",
                background: isCompleted
                  ? "rgba(34,197,94,0.3)"
                  : "rgba(255,255,255,0.06)",
                transition: "all 0.3s ease",
              }} />
            )}
          </div>
        );
      })}
    </div>
  );

  const TokenBar = () => {
    if (totalTokens === 0) return null;
    const inputPct = totalTokens > 0 ? (totalInput / totalTokens) * 100 : 0;
    return (
      <div style={{
        marginTop: 20,
        padding: "14px 18px",
        background: "rgba(15,23,42,0.6)",
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.06)",
        animation: "enhancer-fade-in 0.3s ease",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.8px" }}>
            Token Usage
          </span>
          <span style={{ fontSize: 12, color: "#94a3b8", fontFamily: "'Cascadia Code', 'Fira Code', monospace" }}>
            {totalTokens.toLocaleString()} total
          </span>
        </div>
        <div style={{
          height: 6,
          borderRadius: 3,
          background: "rgba(255,255,255,0.05)",
          overflow: "hidden",
          marginBottom: 10,
        }}>
          <div style={{
            height: "100%",
            borderRadius: 3,
            background: "linear-gradient(90deg, #3b82f6, #8b5cf6)",
            width: "100%",
            transition: "width 0.5s ease",
          }}>
            <div style={{
              height: "100%",
              width: `${inputPct}%`,
              background: "rgba(255,255,255,0.15)",
              borderRadius: "3px 0 0 3px",
            }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 20, fontSize: 11, color: "#64748b" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: "#3b82f6" }} />
            <span>Input: <span style={{ color: "#94a3b8", fontFamily: "'Cascadia Code', 'Fira Code', monospace" }}>{totalInput.toLocaleString()}</span></span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: "#8b5cf6" }} />
            <span>Output: <span style={{ color: "#94a3b8", fontFamily: "'Cascadia Code', 'Fira Code', monospace" }}>{totalOutput.toLocaleString()}</span></span>
          </div>
        </div>
      </div>
    );
  };

  const LoadingIndicator = () => (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      marginTop: 12,
      padding: "10px 16px",
      background: "rgba(59,130,246,0.06)",
      borderRadius: 8,
      border: "1px solid rgba(59,130,246,0.12)",
    }}>
      <div style={{
        width: 16,
        height: 16,
        borderRadius: "50%",
        border: "2px solid rgba(59,130,246,0.2)",
        borderTopColor: "#3b82f6",
        animation: "enhancer-spin 0.8s linear infinite",
      }} />
      <span style={{ color: "#60a5fa", fontSize: 13, fontWeight: 500 }}>
        Analyzing and enhancing your prompt...
      </span>
    </div>
  );

  const SecurityBadge = () => {
    if (!enhancementResult) return null;
    const level = enhancementResult.overall_security_level;
    const config = {
      clean: { color: "#4ade80", bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.2)", label: "Clean" },
      caution: { color: "#fbbf24", bg: "rgba(251,191,36,0.1)", border: "rgba(251,191,36,0.2)", label: "Caution" },
      blocked: { color: "#f87171", bg: "rgba(248,113,113,0.1)", border: "rgba(248,113,113,0.2)", label: "Blocked" },
    }[level];
    return (
      <div style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        background: config.bg,
        border: `1px solid ${config.border}`,
        borderRadius: 5,
        fontSize: 11,
        fontWeight: 600,
        color: config.color,
        letterSpacing: "0.3px",
      }}>
        <div style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: config.color,
        }} />
        {config.label}
      </div>
    );
  };

  const ChangesChips = () => {
    if (!enhancementResult?.changes_made?.length) return null;
    return (
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        marginTop: 12,
      }}>
        {enhancementResult.changes_made.map((change, i) => (
          <span key={i} style={{
            padding: "4px 10px",
            background: "rgba(99,102,241,0.08)",
            border: "1px solid rgba(99,102,241,0.15)",
            borderRadius: 4,
            fontSize: 11,
            color: "#a5b4fc",
            lineHeight: 1.4,
          }}>
            {change}
          </span>
        ))}
      </div>
    );
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 780, margin: "0 auto", padding: "0 20px 40px" }}>
      <style>{ENHANCER_STYLES}</style>

      {/* Stage progress — always visible after idle */}
      {stage !== "idle" && <StageProgress />}

      {/* Error banner */}
      {error !== null && (
        <div style={{
          background: "rgba(239,68,68,0.08)",
          border: "1px solid rgba(239,68,68,0.25)",
          color: "#fca5a5",
          padding: "12px 16px",
          borderRadius: 8,
          marginBottom: 16,
          fontSize: 13,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}>
          <div style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "rgba(239,68,68,0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            flexShrink: 0,
          }}>!</div>
          {error}
        </div>
      )}

      {/* ─── Idle ─────────────────────────────────────────────────────────────── */}
      {stage === "idle" && (
        <div style={{ animation: "enhancer-fade-in 0.3s ease" }}>
          {/* Header */}
          <div style={{ marginBottom: 24, textAlign: "left" }}>
            <h2 style={{
              margin: "0 0 6px",
              fontSize: 22,
              fontWeight: 700,
              color: "#f1f5f9",
              letterSpacing: "-0.3px",
              fontFamily: "inherit",
            }}>
              Prompt Enhancer
            </h2>
            <p style={{
              margin: 0,
              fontSize: 13,
              color: "#64748b",
              lineHeight: 1.5,
            }}>
              Refine your prompts with multi-agent analysis. Paste a prompt below or try a sample to get started.
            </p>
          </div>

          {/* Textarea */}
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Describe what you want to accomplish. The more context you provide, the better the enhancement..."
            disabled={loading}
            style={{
              width: "100%",
              minHeight: 220,
              background: "linear-gradient(180deg, #1e293b 0%, #172033 100%)",
              border: "1px solid rgba(255,255,255,0.08)",
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
            onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
          />

          {/* Character count */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 8,
          }}>
            <span style={{ fontSize: 11, color: "#475569" }}>
              {inputText.length > 0 ? `${inputText.length} characters` : ""}
            </span>
          </div>

          {/* Action row */}
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={handleInitialEnhance}
              disabled={inputText.trim() === "" || loading}
              style={primaryButtonStyle(inputText.trim() !== "" && !loading)}
            >
              Enhance Prompt
            </button>
            {loading && <LoadingIndicator />}
          </div>

          {/* Sample prompts */}
          <div style={{ marginTop: 32 }}>
            <div style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#475569",
              textTransform: "uppercase",
              letterSpacing: "0.8px",
              marginBottom: 12,
            }}>
              Try a sample
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
            }}>
              {SAMPLE_PROMPTS.map((sample) => (
                <button
                  key={sample.label}
                  onClick={() => setInputText(sample.text)}
                  disabled={loading}
                  style={{
                    textAlign: "left",
                    padding: "14px 16px",
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 8,
                    cursor: loading ? "default" : "pointer",
                    transition: "all 0.2s ease",
                    fontFamily: "inherit",
                  }}
                  onMouseEnter={(e) => {
                    if (!loading) {
                      e.currentTarget.style.background = "rgba(99,102,241,0.06)";
                      e.currentTarget.style.borderColor = "rgba(99,102,241,0.2)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                  }}
                >
                  <div style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#94a3b8",
                    marginBottom: 4,
                  }}>
                    {sample.label}
                  </div>
                  <div style={{
                    fontSize: 12,
                    color: "#64748b",
                    lineHeight: 1.5,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}>
                    {sample.text}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── Clarifying ───────────────────────────────────────────────────────── */}
      {stage === "clarifying" && (
        <div style={{ animation: "enhancer-fade-in 0.3s ease" }}>
          {/* Result meta bar */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>
              Draft Enhancement
            </span>
            <SecurityBadge />
          </div>

          <div style={promptDisplayStyle}>
            {enhancementResult!.refined_prompt}
          </div>

          <ChangesChips />

          <div style={{
            fontWeight: 600,
            color: "#e2e8f0",
            marginBottom: 14,
            marginTop: 28,
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}>
            <div style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: "rgba(251,191,36,0.12)",
              border: "1px solid rgba(251,191,36,0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              color: "#fbbf24",
            }}>?</div>
            Clarifying Questions
          </div>
          {followUpQuestions.map((question, i) => (
            <div key={i} style={{ marginBottom: 16 }}>
              <div style={{ color: "#cbd5e1", fontWeight: 500, marginBottom: 8, fontSize: 13, lineHeight: 1.5 }}>
                {i + 1}. {question}
              </div>
              <input
                value={answers[i]}
                onChange={(e) =>
                  setAnswers((prev) => prev.map((a, j) => (j === i ? e.target.value : a)))
                }
                disabled={loading}
                placeholder="Type your answer..."
                style={{
                  width: "100%",
                  background: "#1e293b",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "#e2e8f0",
                  padding: "10px 14px",
                  borderRadius: 8,
                  fontSize: 14,
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                  outline: "none",
                  transition: "border-color 0.2s ease",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(99,102,241,0.4)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
              />
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
            <button
              onClick={handleSubmitAnswers}
              disabled={answers.some((a) => a === "") || loading}
              style={primaryButtonStyle(!answers.some((a) => a === "") && !loading)}
            >
              Submit Answers
            </button>
            {loading && <LoadingIndicator />}
          </div>

          <TokenBar />
        </div>
      )}

      {/* ─── Enhanced ─────────────────────────────────────────────────────────── */}
      {stage === "enhanced" && (
        <div style={{ animation: "enhancer-fade-in 0.3s ease" }}>
          {/* Result meta bar */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>
              Enhanced Result {cycleCount > 0 ? `(Pass ${cycleCount + 1})` : ""}
            </span>
            <SecurityBadge />
          </div>

          <div style={promptDisplayStyle}>
            {enhancementResult!.refined_prompt}
          </div>

          <ChangesChips />

          {/* Intent display */}
          {enhancementResult?.inferred_intent && (
            <div style={{
              marginTop: 14,
              padding: "10px 14px",
              background: "rgba(99,102,241,0.05)",
              border: "1px solid rgba(99,102,241,0.12)",
              borderRadius: 8,
              fontSize: 12,
              color: "#94a3b8",
              lineHeight: 1.5,
            }}>
              <span style={{ fontWeight: 600, color: "#a5b4fc" }}>Inferred intent: </span>
              {enhancementResult.inferred_intent}
            </div>
          )}

          <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
            {cycleCount < 2 && (
              <button
                onClick={handleEnhanceFurther}
                disabled={loading}
                style={secondaryButtonStyle(!loading)}
              >
                Enhance Further
              </button>
            )}
            <button
              onClick={() => setStage("final")}
              disabled={loading}
              style={primaryButtonStyle(!loading)}
            >
              Done Enhancing
            </button>
          </div>
          {loading && <LoadingIndicator />}

          <TokenBar />
        </div>
      )}

      {/* ─── Final ────────────────────────────────────────────────────────────── */}
      {stage === "final" && (
        <div style={{ animation: "enhancer-fade-in 0.3s ease" }}>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}>
            <div style={{
              fontSize: 18,
              fontWeight: 700,
              color: "#f1f5f9",
              letterSpacing: "-0.3px",
            }}>
              Enhanced Prompt
            </div>
            <SecurityBadge />
          </div>
          <div style={promptDisplayStyle}>
            <span style={{
              fontWeight: 700,
              color: "#818cf8",
              display: "block",
              marginBottom: 10,
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "1px",
            }}>
              Enhanced Prompt
            </span>
            <span style={{ display: "block", marginBottom: 24 }}>
              {enhancementResult!.refined_prompt}
            </span>
            {allClarifications.length > 0 && (
              <>
                <span style={{
                  fontWeight: 700,
                  color: "#818cf8",
                  display: "block",
                  marginBottom: 10,
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                }}>
                  User Clarifications
                </span>
                {allClarifications.map((c, i) => (
                  <div key={i} style={{ marginBottom: 12 }}>
                    <span style={{ color: "#64748b", fontSize: 11, fontWeight: 600 }}>Q: </span>
                    <span style={{ color: "#cbd5e1" }}>{c.question}</span>
                    <br />
                    <span style={{ color: "#64748b", fontSize: 11, fontWeight: 600 }}>A: </span>
                    <span style={{ color: "#e2e8f0" }}>{c.answer}</span>
                  </div>
                ))}
              </>
            )}
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 18 }}>
            <button onClick={handleCopy} style={primaryButtonStyle(true)}>
              {copied ? "\u2713 Copied!" : "Copy to Clipboard"}
            </button>
            <button onClick={handleStartOver} style={secondaryButtonStyle(true)}>
              Start Over
            </button>
          </div>

          <TokenBar />
        </div>
      )}
    </div>
  );
}
