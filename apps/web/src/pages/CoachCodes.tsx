import { useEffect, useState, type FormEvent } from "react";
import CoachCodeInventory from "../components/coach/CoachCodeInventory";
import { getSupabase } from "../lib/supabase";
import { sendLoginCode } from "../services/checkinSync";
import { isValidOtpCode, normalizeOtpInput, OTP_INPUT_HINT, OTP_INPUT_PROPS } from "../services/otp";

export default function CoachCodesPage() {
  const [phase, setPhase] = useState<"checking" | "email" | "code" | "ready">("checking");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    getSupabase().auth.getSession().then(({ data }) => {
      if (alive) setPhase(data.session?.user.email ? "ready" : "email");
    }).catch(() => { if (alive) setPhase("email"); });
    return () => { alive = false; };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (phase === "email") {
        await sendLoginCode(email);
        setPhase("code");
      } else {
        const token = normalizeOtpInput(code);
        const { error: verifyError } = await getSupabase().auth.verifyOtp({ email, token, type: "email" });
        if (verifyError) throw new Error("验证码不正确或已过期，请重新获取。");
        setPhase("ready");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "登录失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  };

  if (phase === "ready") {
    return <div className="admin-page"><section className="admin-shell"><CoachCodeInventory /></section></div>;
  }

  return (
    <div className="admin-page">
      <section className="admin-shell admin-login-card" aria-labelledby="coach-login-title">
        <p className="admin-eyebrow">COACH · CODE INVENTORY</p>
        <h1 id="coach-login-title">教练登录</h1>
        <p className="admin-intro">使用教练邮箱验证码登录后，可查看和复制本人未激活码。</p>
        {phase === "checking" ? <p role="status">登录状态检查中…</p> : (
          <form onSubmit={submit}>
            <label htmlFor="coach-email">教练邮箱</label>
            <input id="coach-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            {phase === "code" && (
              <>
                <label htmlFor="coach-otp">邮箱验证码</label>
                <input id="coach-otp" {...OTP_INPUT_PROPS} value={code} onChange={(event) => setCode(event.target.value)} required />
                <p className="admin-hint">{OTP_INPUT_HINT}</p>
              </>
            )}
            <button type="submit" className="admin-primary" disabled={busy || (phase === "code" && !isValidOtpCode(code))}>
              {phase === "email" ? "获取教练验证码" : "登录并查看码库"}
            </button>
          </form>
        )}
        {error && <p className="admin-error" role="alert">{error}</p>}
      </section>
    </div>
  );
}
