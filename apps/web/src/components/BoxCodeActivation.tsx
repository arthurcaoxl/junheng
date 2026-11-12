import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import {
  ActivationStatusError,
  fetchMyActivationStatus,
  hasBoxCodeActivation,
  hasPendingBoxCodeReview,
  requestBoxCodeActivation,
  type ActivationStatusErrorKind,
  type MyActivationStatus,
} from "../services/boxCodeActivation";
import { openSyncModal } from "../services/syncUi";
import { validateBoxCode } from "../utils/boxCode";

function createIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type ActivationPhase = "idle" | "submitting" | "pending" | "bound" | "legacy";

function initialPhase(): ActivationPhase {
  if (hasBoxCodeActivation()) return "bound";
  if (hasPendingBoxCodeReview()) return "pending";
  return "idle";
}

function phaseForStatus(status: MyActivationStatus): ActivationPhase {
  if (status.state === "active") return "bound";
  if (status.state === "legacy_granted") return "legacy";
  if (status.state === "pending_review") return "pending";
  return "idle";
}

export function BoxCodeActivation({ status }: { status?: MyActivationStatus } = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [phase, setPhase] = useState<ActivationPhase>(initialPhase);
  const [code, setCode] = useState(() => initialPhase() === "idle" ? searchParams.get("code") ?? "" : "");
  const [error, setError] = useState("");
  const [statusLoading, setStatusLoading] = useState(!status);
  const [statusErrorKind, setStatusErrorKind] = useState<ActivationStatusErrorKind | null>(null);
  const [statusAttempt, setStatusAttempt] = useState(0);
  const [rejected, setRejected] = useState(false);
  const submissionRef = useRef<{ code: string; key: string } | null>(null);
  const inFlightRef = useRef(false);
  const busy = phase === "submitting" || statusLoading || statusErrorKind !== null;

  useEffect(() => {
    let alive = true;
    const applyStatus = (nextStatus: MyActivationStatus) => {
      if (!alive) return;
      setPhase(phaseForStatus(nextStatus));
      setRejected(nextStatus.state === "rejected");
      setStatusErrorKind(null);
    };

    if (status) {
      applyStatus(status);
      setStatusLoading(false);
      return () => { alive = false; };
    }

    setStatusLoading(true);
    setStatusErrorKind(null);
    fetchMyActivationStatus().then(applyStatus).catch((cause: unknown) => {
      if (!alive) return;
      setStatusErrorKind(cause instanceof ActivationStatusError ? cause.kind : "unavailable");
    }).finally(() => {
      if (alive) setStatusLoading(false);
    });
    return () => { alive = false; };
  }, [status, statusAttempt]);

  useEffect(() => {
    if ((phase !== "bound" && phase !== "legacy" && phase !== "pending") || !searchParams.has("code")) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("code");
    setSearchParams(nextParams, { replace: true });
  }, [phase, searchParams, setSearchParams]);

  const retryStatus = () => {
    setError("");
    setStatusAttempt((value) => value + 1);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (phase === "bound" || phase === "legacy" || phase === "pending" || statusLoading || statusErrorKind || inFlightRef.current) return;

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
      setRejected(false);
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
      {statusLoading ? (
        <p className="sync-panel-status" role="status">正在确认打卡权限</p>
      ) : statusErrorKind === "unauthorized" ? (
        <>
          <p className="sync-panel-error" role="alert">登录状态已失效，请重新登录。</p>
          <button type="button" className="sync-panel-primary" onClick={() => openSyncModal("restore", { onSuccess: retryStatus })}>重新登录</button>
        </>
      ) : statusErrorKind === "unavailable" ? (
        <>
          <p className="sync-panel-error" role="alert">激活状态读取失败，请稍后重试。</p>
          <button type="button" className="sync-panel-primary" onClick={retryStatus}>重试</button>
        </>
      ) : phase === "bound" ? (
        <div className="sync-panel-form box-code-activation-bound">
          <p className="status-tag status-tag--green">已绑定专属教练</p>
        </div>
      ) : phase === "legacy" ? (
        <div className="sync-panel-form">
          <p className="sync-panel-notice" role="status">已开通打卡权限</p>
        </div>
      ) : phase === "pending" ? (
        <div className="sync-panel-form">
          <p className="sync-panel-notice" role="status">审核中，暂不能打卡</p>
          <p className="sync-panel-status">运营人员核验发货与线下凭证后将开通打卡权限。</p>
        </div>
      ) : (
        <>
          {rejected && <p className="sync-panel-notice" role="status">未通过，请联系教练</p>}
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
              {phase === "submitting" ? "提交中…" : "提交激活审核"}
            </button>
          </form>
        </>
      )}
      {!statusLoading && !statusErrorKind && error && <p className="sync-panel-error" role="alert">{error}</p>}
    </section>
  );
}
