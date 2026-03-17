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

  // ─── Shared styles ──────────────────────────────────────────────────────────

  const primaryButtonStyle = (enabled: boolean): React.CSSProperties => ({
    padding: "9px 22px",
    background: enabled ? "#0f2744" : "#0c1221",
    border: `1px solid ${enabled ? "#1d4ed850" : "#1e293b"}`,
    borderRadius: "5px",
    color: enabled ? "#60a5fa" : "#374151",
    fontSize: "12px",
    fontWeight: 600,
    cursor: enabled ? "pointer" : "default",
    transition: "all 0.15s",
    fontFamily: "inherit",
  });

  const secondaryButtonStyle = (enabled: boolean): React.CSSProperties => ({
    padding: "9px 22px",
    background: enabled ? "rgba(167,139,250,0.08)" : "#0c1221",
    border: `1px solid ${enabled ? "rgba(167,139,250,0.35)" : "#1e293b"}`,
    borderRadius: "5px",
    color: enabled ? "#a78bfa" : "#374151",
    fontSize: "12px",
    fontWeight: 600,
    cursor: enabled ? "pointer" : "default",
    transition: "all 0.15s",
    fontFamily: "inherit",
  });

  const promptDisplayStyle: React.CSSProperties = {
    minHeight: 200,
    maxHeight: 400,
    overflowY: "auto",
    background: "#1e293b",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8,
    padding: 16,
    fontFamily: "monospace",
    fontSize: 13,
    color: "#e2e8f0",
    userSelect: "text",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 16px" }}>
      {/* Error banner */}
      {error !== null && (
        <div
          style={{
            background: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.4)",
            color: "#fca5a5",
            padding: "10px 14px",
            borderRadius: 6,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {/* ─── Idle ─────────────────────────────────────────────────────────────── */}
      {stage === "idle" && (
        <div>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Paste the prompt you want to enhance\u2026"
            disabled={loading}
            style={{
              width: "100%",
              minHeight: 120,
              background: "#1e293b",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#e2e8f0",
              borderRadius: 8,
              padding: 12,
              fontSize: 14,
              fontFamily: "inherit",
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />
          <div style={{ marginTop: 12 }}>
            <button
              onClick={handleInitialEnhance}
              disabled={inputText.trim() === "" || loading}
              style={primaryButtonStyle(inputText.trim() !== "" && !loading)}
            >
              Enhance
            </button>
            {loading && (
              <span style={{ color: "#94a3b8", fontSize: 13, marginTop: 8, display: "block" }}>
                Enhancing\u2026
              </span>
            )}
          </div>
        </div>
      )}

      {/* ─── Clarifying ───────────────────────────────────────────────────────── */}
      {stage === "clarifying" && (
        <div>
          <div style={promptDisplayStyle}>
            {enhancementResult!.refined_prompt}
          </div>
          <div style={{ fontWeight: 600, color: "#e2e8f0", marginBottom: 12, marginTop: 24 }}>
            Clarifying Questions
          </div>
          {followUpQuestions.map((question, i) => (
            <div key={i} style={{ marginBottom: 16 }}>
              <div style={{ color: "#e2e8f0", fontWeight: 500, marginBottom: 6 }}>
                {i + 1}. {question}
              </div>
              <input
                value={answers[i]}
                onChange={(e) =>
                  setAnswers((prev) => prev.map((a, j) => (j === i ? e.target.value : a)))
                }
                disabled={loading}
                style={{
                  width: "100%",
                  background: "#1e293b",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "#e2e8f0",
                  padding: "8px 12px",
                  borderRadius: 6,
                  fontSize: 14,
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
            </div>
          ))}
          <button
            onClick={handleSubmitAnswers}
            disabled={answers.some((a) => a === "") || loading}
            style={primaryButtonStyle(!answers.some((a) => a === "") && !loading)}
          >
            Submit Answers
          </button>
          {loading && (
            <span style={{ color: "#94a3b8", fontSize: 13, marginTop: 8, display: "block" }}>
              Enhancing\u2026
            </span>
          )}
        </div>
      )}

      {/* ─── Enhanced ─────────────────────────────────────────────────────────── */}
      {stage === "enhanced" && (
        <div>
          <div style={promptDisplayStyle}>
            {enhancementResult!.refined_prompt}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
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
          {loading && (
            <span style={{ color: "#94a3b8", fontSize: 13, marginTop: 8, display: "block" }}>
              Enhancing\u2026
            </span>
          )}
        </div>
      )}

      {/* ─── Final ────────────────────────────────────────────────────────────── */}
      {stage === "final" && (
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: "#e2e8f0", marginBottom: 16 }}>
            Enhanced Prompt
          </div>
          <div style={promptDisplayStyle}>
            <span style={{ fontWeight: 700, color: "#6366f1", display: "block", marginBottom: 8 }}>
              [ENHANCED PROMPT]
            </span>
            <span style={{ display: "block", marginBottom: 24 }}>
              {enhancementResult!.refined_prompt}
            </span>
            {allClarifications.length > 0 && (
              <>
                <span
                  style={{ fontWeight: 700, color: "#6366f1", display: "block", marginBottom: 8 }}
                >
                  [USER CLARIFICATIONS]
                </span>
                {allClarifications.map((c, i) => (
                  <div key={i} style={{ marginBottom: 12 }}>
                    <span style={{ color: "#94a3b8" }}>Q: </span>
                    {c.question}
                    <br />
                    <span style={{ color: "#94a3b8" }}>A: </span>
                    {c.answer}
                  </div>
                ))}
              </>
            )}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
            <button onClick={handleCopy} style={primaryButtonStyle(true)}>
              {copied ? "Copied!" : "Copy to Clipboard"}
            </button>
            <button onClick={handleStartOver} style={secondaryButtonStyle(true)}>
              Start Over
            </button>
          </div>
          <div style={{ marginTop: 24, fontSize: 12, color: "#94a3b8" }}>
            Session tokens — Input: {tokenLog.reduce((s, t) => s + t.inputTokens, 0)} | Output:{" "}
            {tokenLog.reduce((s, t) => s + t.outputTokens, 0)}
          </div>
        </div>
      )}
    </div>
  );
}
