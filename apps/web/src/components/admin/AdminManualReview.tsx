import { useCallback, useEffect, useState } from "react";
import {
  fetchDormantCoaches,
  fetchPendingBoxCodeReviews,
  reviewBoxCodeActivation,
  transferDormantCoaches,
  type DormantCoach,
  type PendingBoxCodeReview,
  type ReviewDecisionInput,
} from "../../services/manualReview";
import CoachEmailSearchSelect from "./CoachEmailSearchSelect";

type EvidenceDraft = {
  coachId: string;
  shipment: string;
  payment: string;
  rejectionReason: string;
};

export default function AdminManualReview() {
  const [reviews, setReviews] = useState<PendingBoxCodeReview[]>([]);
  const [coaches, setCoaches] = useState<DormantCoach[]>([]);
  const [drafts, setDrafts] = useState<Record<string, EvidenceDraft>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const [pendingReviews, dormantCoaches] = await Promise.all([
      fetchPendingBoxCodeReviews(),
      fetchDormantCoaches(),
    ]);
    setReviews(pendingReviews);
    setCoaches(dormantCoaches);
  }, []);

  useEffect(() => {
    void load().catch((cause) => {
      setError(cause instanceof Error ? cause.message : "审核数据读取失败，请稍后重试。");
    });
  }, [load]);

  const draftFor = (review: PendingBoxCodeReview): EvidenceDraft => drafts[review.activationId] ?? {
    coachId: review.coachId,
    shipment: review.shipmentVerificationRef ?? "",
    payment: review.paymentVerificationRef ?? "",
    rejectionReason: "",
  };

  const updateDraft = (activationId: string, patch: Partial<EvidenceDraft>) => {
    setDrafts((current) => {
      const row = reviews.find((review) => review.activationId === activationId);
      const existing = current[activationId] ?? {
        coachId: row?.coachId ?? "",
        shipment: row?.shipmentVerificationRef ?? "",
        payment: row?.paymentVerificationRef ?? "",
        rejectionReason: "",
      };
      return { ...current, [activationId]: { ...existing, ...patch } };
    });
  };

  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const message = await action();
      await load();
      setNotice(message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  };

  const review = (row: PendingBoxCodeReview, decision: ReviewDecisionInput["decision"]) => {
    const draft = draftFor(row);
    void run(async () => {
      await reviewBoxCodeActivation({
        review: { ...row, coachId: draft.coachId },
        decision,
        shipmentVerificationRef: draft.shipment,
        paymentVerificationRef: draft.payment,
        rejectionReasonCode: draft.rejectionReason,
      });
      return decision === "approved" ? `已通过 ${row.camperCode} 的激活审核。` : `已拒绝 ${row.camperCode} 的申请并退回补发。`;
    });
  };

  const transferAll = () => {
    if (!window.confirm("确认将全部休眠教练名下用户转移至平台官方账号？该操作会逐用户写入审计。")) return;
    void run(async () => {
      const result = await transferDormantCoaches();
      return `已托管 ${result.coachCount} 名休眠教练的 ${result.transferredCount} 名用户，审计流水已写入。`;
    });
  };

  return (
    <>
      <section className="admin-block" aria-labelledby="admin-manual-review-title">
        <div className="admin-block-heading">
          <h2 id="admin-manual-review-title">激活人工审核</h2>
          <span>核验用户、教练、产品码及线下凭证后才可开通打卡</span>
        </div>
        {reviews.length === 0 ? (
          <p>当前没有待审核申请。</p>
        ) : (
          <div className="admin-table-wrap" tabIndex={0} aria-label="待审核激活列表，可横向滚动">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>用户</th>
                  <th>教练</th>
                  <th>产品码</th>
                  <th>线下凭证</th>
                  <th>拒绝原因</th>
                  <th>审核操作</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((row) => {
                  const draft = draftFor(row);
                  return (
                    <tr key={row.activationId}>
                      <td>{row.camperCode}</td>
                      <td>
                        <CoachEmailSearchSelect
                          id={`review-coach-${row.activationId}`}
                          label={`审核教练邮箱 ${row.camperCode}`}
                          selectedId={draft.coachId}
                          disabled={busy}
                          onSelect={(coach) => updateDraft(row.activationId, { coachId: coach?.coachId ?? "" })}
                        />
                      </td>
                      <td>{row.codeMasked}<br /><small>{row.codeType === "recharge" ? "充值码" : "体验码"}</small></td>
                      <td>
                        {!row.shipmentVerificationRef && !draft.shipment && <span>待补录</span>}
                        <label htmlFor={`shipment-${row.activationId}`}>发货凭证 {row.camperCode}</label>
                        <input
                          id={`shipment-${row.activationId}`}
                          aria-label={`发货凭证 ${row.camperCode}`}
                          value={draft.shipment}
                          onChange={(event) => updateDraft(row.activationId, { shipment: event.target.value })}
                          disabled={busy}
                        />
                        {row.codeType === "recharge" && (
                          <>
                            <label htmlFor={`payment-${row.activationId}`}>收款凭证 {row.camperCode}</label>
                            <input
                              id={`payment-${row.activationId}`}
                              aria-label={`收款凭证 ${row.camperCode}`}
                              value={draft.payment}
                              onChange={(event) => updateDraft(row.activationId, { payment: event.target.value })}
                              disabled={busy}
                            />
                          </>
                        )}
                      </td>
                      <td>
                        <label htmlFor={`rejection-${row.activationId}`}>拒绝原因 {row.camperCode}</label>
                        <input
                          id={`rejection-${row.activationId}`}
                          aria-label={`拒绝原因 ${row.camperCode}`}
                          value={draft.rejectionReason}
                          onChange={(event) => updateDraft(row.activationId, { rejectionReason: event.target.value })}
                          disabled={busy}
                        />
                      </td>
                      <td>
                        <button type="button" className="admin-primary" disabled={busy || !draft.coachId} onClick={() => review(row, "approved")}>
                          通过并激活 {row.camperCode}
                        </button>
                        <button type="button" className="admin-secondary" disabled={busy || !draft.coachId} onClick={() => review(row, "rejected")}>
                          拒绝并退回 {row.camperCode}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-block" aria-labelledby="admin-trusteeship-title">
        <div className="admin-block-heading">
          <h2 id="admin-trusteeship-title">教练休眠托管</h2>
          <span>人工确认后批量转至平台官方账号，并逐用户写入审计</span>
        </div>
        {coaches.length > 0 && (
          <ul>
            {coaches.map((coach) => <li key={coach.coachId}>{coach.coachId} · {coach.currentUserCount} 名用户</li>)}
          </ul>
        )}
        <button type="button" className="admin-primary" disabled={busy || coaches.length === 0} onClick={transferAll}>
          一键托管全部休眠教练
        </button>
      </section>

      {error && <p className="admin-error" role="alert">{error}</p>}
      {notice && <p className="admin-notice" role="status">{notice}</p>}
    </>
  );
}
