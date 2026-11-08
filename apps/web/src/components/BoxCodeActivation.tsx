import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { hasBoxCodeActivation, hasPendingBoxCodeReview, requestBoxCodeActivation } from "../services/boxCodeActivation";
import { validateBoxCode } from "../utils/boxCode";

function createIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type ActivationPhase = "idle" | "submitting" | "pending" | "bound";

function initialPhase(): ActivationPhase {
  if (hasBoxCodeActivation()) return "bound";
  if (hasPendingBoxCodeReview()) return "pending";
  return "idle";
}

export function BoxCodeActivation() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [phase, setPhase] = useState<ActivationPhase>(initialPhase);
  const [code, setCode] = useState(() => initialPhase() === "idle" ? searchParams.get("code") ?? "" : "");
  const [error, setError] = useState("");
  const submissionRef = useRef<{ code: string; key: string } | null>(null);
  const inFlightRef = useRef(false);
  const busy = phase === "submitting";

  useEffect(() => {
    if ((phase !== "bound" && phase !== "pending") || !searchParams.has("code")) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("code");
    setSearchParams(nextParams, { replace: true });
  }, [phase, searchParams, setSearchParams]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (phase === "bound" || phase === "pending" || inFlightRef.current) return;

    setError("");
    if (!validateBoxCode(code).valid) {
      setError("请输入有效的产品激活码。");
      return;
    }

    if (submissionRef.current?.code !== code) {
      submissionRef.current = { code, key: createIdempotencyKey() };
    }

    inFlightRef.current = true;
    setPhase("submitting");
    try {
      await requestBoxCodeActivation(code, submissionRef.current.key);
      setCode("");
      setPhase("pending");
    } catch (cause) {
      setPhase("idle");
      setError(cause instanceof Error ? cause.message : "激活审核申请失败，请稍后重试。");
    } finally {
      inFlightRef.current = false;
    }
  };

  return (
    <section className="box-code-activation sync-panel" aria-labelledby="box-code-activation-title">
      <h2 id="box-code-activation-title">产品码激活</h2>
      {phase === "bound" ? (
        <div className="sync-panel-form box-code-activation-bound">
          <p className="status-tag status-tag--green">已绑定专属教练</p>
        </div>
      ) : phase === "pending" ? (
        <div className="sync-panel-form">
          <p className="sync-panel-notice" role="status">审核中，暂不能打卡</p>
          <p className="sync-panel-status">运营人员核验发货与线下凭证后将开通打卡权限。</p>
        </div>
      ) : (
        <>
          <p className="sync-panel-status">输入盒内产品码并提交人工审核。审核通过后将绑定对应教练指导，每日记录腰围、体重等数据，形成动态的健康指标。</p>
          <form className="sync-panel-form" onSubmit={submit}>
            <label htmlFor="box-code-activation-input">产品激活码</label>
            <input
              id="box-code-activation-input"
              name="boxCode"
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
                setError("");
              }}
              placeholder="JH-EL-XXXX"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              disabled={busy}
            />
            <button type="submit" className="sync-panel-primary" disabled={busy}>
              {busy ? "提交中…" : "提交激活审核"}
            </button>
          </form>
        </>
      )}
      {error && <p className="sync-panel-error" role="alert">{error}</p>}
    </section>
  );
}
