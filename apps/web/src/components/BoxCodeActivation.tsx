import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { activateBoxCode, hasBoxCodeActivation } from "../services/boxCodeActivation";
import { validateBoxCode } from "../utils/boxCode";

function createIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type ActivationPhase = "idle" | "submitting" | "bound";

export function BoxCodeActivation() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [phase, setPhase] = useState<ActivationPhase>(() => hasBoxCodeActivation() ? "bound" : "idle");
  const [code, setCode] = useState(() => hasBoxCodeActivation() ? "" : searchParams.get("code") ?? "");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [syncWarning, setSyncWarning] = useState("");
  const submissionRef = useRef<{ code: string; key: string } | null>(null);
  const inFlightRef = useRef(false);
  const busy = phase === "submitting";

  useEffect(() => {
    if (phase !== "bound" || !searchParams.has("code")) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("code");
    setSearchParams(nextParams, { replace: true });
  }, [phase, searchParams, setSearchParams]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (phase === "bound" || inFlightRef.current) return;

    setError("");
    setNotice("");
    setSyncWarning("");
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
      const { syncResult } = await activateBoxCode(code, submissionRef.current.key);
      setCode("");
      setPhase("bound");
      setNotice("激活成功，已为你绑定教练。");
      if (syncResult === "offline") {
        setSyncWarning("激活已完成，但本次云端同步未成功，请稍后重试。");
      }
    } catch (cause) {
      setPhase("idle");
      setError(cause instanceof Error ? cause.message : "激活失败，请稍后重试。");
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
      ) : (
        <>
          <p className="sync-panel-status">输入盒内产品码，激活后将自动绑定对应教练，无需绑定邮箱。</p>
          <form className="sync-panel-form" onSubmit={submit}>
            <label htmlFor="box-code-activation-input">产品激活码</label>
            <input
              id="box-code-activation-input"
              name="boxCode"
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
                setError("");
                setNotice("");
                setSyncWarning("");
              }}
              placeholder="JH-EL-XXXX"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              disabled={busy}
            />
            <button type="submit" className="sync-panel-primary" disabled={busy}>
              {busy ? "激活中…" : "激活产品码"}
            </button>
          </form>
        </>
      )}
      {error && <p className="sync-panel-error" role="alert">{error}</p>}
      {notice && <p className="sync-panel-notice" role="status">{notice}</p>}
      {syncWarning && <p className="sync-panel-notice" role="status">{syncWarning}</p>}
    </section>
  );
}
