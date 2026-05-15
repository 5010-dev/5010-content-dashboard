"use client";

import { useFormStatus, useFormState } from "react-dom";
import { generateSuggestionAction, type SuggestionState } from "./actions";

function SubmitButton({
  label,
  pendingLabel,
  variant,
}: {
  label: string;
  pendingLabel: string;
  variant?: "default" | "ghost";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`small ${variant === "ghost" ? "ghost" : ""}`}
      style={pending ? { opacity: 0.7, cursor: "wait" } : undefined}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

const initialState: SuggestionState = { status: "idle" };

export function SuggestForm({
  keywordId,
  force = false,
  label,
  variant,
}: {
  keywordId: number;
  force?: boolean;
  label: string;
  variant?: "default" | "ghost";
}) {
  const [state, action] = useFormState(generateSuggestionAction, initialState);
  const pendingLabel = force ? "다시 분석 중… (2~3분)" : "분석 중… (2~3분)";

  return (
    <form
      action={action}
      style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
    >
      <input type="hidden" name="keywordId" value={keywordId} />
      {force && <input type="hidden" name="force" value="1" />}
      <SubmitButton label={label} pendingLabel={pendingLabel} variant={variant} />
      {state.status === "error" && (
        <span className="faint" style={{ color: "var(--risk-critical)", fontSize: 12 }}>
          ⚠ {state.error}
        </span>
      )}
      {state.status === "cached" && (
        <span className="faint" style={{ fontSize: 12 }}>
          이미 최근 7일 내 제안이 있어요. 새로 만들려면 "다시 생성".
        </span>
      )}
      {state.status === "in_progress" && (
        <span className="faint" style={{ fontSize: 12, color: "var(--accent)" }}>
          이미 다른 곳에서 생성 중. 잠시 후 새로고침.
        </span>
      )}
      <PendingMessage />
    </form>
  );
}

function PendingMessage() {
  const { pending } = useFormStatus();
  if (!pending) return null;
  return (
    <span className="faint" style={{ fontSize: 12, color: "var(--accent)" }}>
      Claude가 상위 페이지를 분석 중…
    </span>
  );
}

export function InProgressBadge({ startedAt }: { startedAt: Date }) {
  const elapsed = Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000));
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const label = mins > 0 ? `${mins}분 ${secs}초 경과` : `${secs}초 경과`;
  return (
    <span
      className="rank-pill"
      style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
    >
      <span style={{ marginRight: 4 }}>🔄</span>
      분석 중 · {label}
    </span>
  );
}
