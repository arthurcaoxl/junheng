import { useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { activateBoxCode } from "../services/boxCodeActivation";
import { validateBoxCode } from "../utils/boxCode";

function createIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function BoxCodeActivation() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [code, setCode] = useState(() => searchParams.get("code") ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [syncWarning, setSyncWarning] = useState("");
  const submissionRef = useRef<{ code: string; key: string } | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;

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

    setBusy(true);
    try {
      const { syncResult } = await activateBoxCode(code, submissionRef.current.key);
      setNotice("激活成功，已为你绑定教练。");
      if (syncResult === "offline") {
        setSyncWarning("激活已完成，但本次云端同步未成功，请稍后重试。");
      }
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("code");
      setSearchParams(nextParams, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "激活失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="box-code-activation" aria-labelledby="box-code-activation-title">
      <h2 id="box-code-activation-title">产品码激活</h2>
      <p>输入盒内产品码，激活后将自动绑定对应教练，无需绑定邮箱。</p>
      <form onSubmit={submit}>
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
        <button type="submit" disabled={busy}>
          {busy ? "激活中…" : "激活产品码"}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {syncWarning && <p role="status">{syncWarning}</p>}
    </section>
  );
}
