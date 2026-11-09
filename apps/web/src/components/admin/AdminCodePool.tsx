import { useEffect, useState, type FormEvent } from "react";
import {
  allocateCodesToCoach,
  fetchAdminRestockRequests,
  generatePlatformCodes,
  resolveAdminRestockRequest,
  type AdminRestockRequest,
} from "../../services/codePool";
import CoachEmailSearchSelect from "./CoachEmailSearchSelect";

export default function AdminCodePool() {
  const [count, setCount] = useState("");
  const [boxSpec, setBoxSpec] = useState("");
  const [receipt, setReceipt] = useState("");
  const [coachId, setCoachId] = useState("");
  const [allocateCount, setAllocateCount] = useState("");
  const [requests, setRequests] = useState<AdminRestockRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let alive = true;
    fetchAdminRestockRequests()
      .then((value) => { if (alive) setRequests(value); })
      .catch((cause: unknown) => { if (alive) setError(cause instanceof Error ? cause.message : "补货需求读取失败"); });
    return () => { alive = false; };
  }, []);

  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setNotice(await action());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "产品激活码库操作失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  };

  const generate = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const generated = await generatePlatformCodes(Number(count), boxSpec, receipt);
      return `已生成 ${generated} 枚平台码，线下凭证已写入流水。`;
    });
  };

  const allocate = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const allocated = await allocateCodesToCoach(coachId, Number(allocateCount));
      return `已向教练划拨 ${allocated} 枚码。`;
    });
  };

  const resolve = (requestId: string, decision: "fulfilled" | "rejected") => {
    void run(async () => {
      await resolveAdminRestockRequest(requestId, decision);
      setRequests((current) => current.map((item) => item.requestId === requestId ? { ...item, status: decision } : item));
      return decision === "fulfilled" ? "补货需求已标记完成。" : "补货需求已驳回。";
    });
  };

  return (
    <section className="admin-block" aria-labelledby="admin-code-pool-title">
      <div className="admin-block-heading">
        <h2 id="admin-code-pool-title">平台产品激活码库</h2>
        <span>仅管理员可生成与划拨；所有动作写入库存流水</span>
      </div>
      <div className="admin-code-pool-forms">
        <form onSubmit={generate}>
          <h3>生成平台码</h3>
          <label htmlFor="code-generate-count">生成数量</label>
          <input id="code-generate-count" type="number" min="1" step="1" value={count} onChange={(event) => setCount(event.target.value)} required />
          <label htmlFor="code-generate-spec">盒规格</label>
          <select id="code-generate-spec" value={boxSpec} onChange={(event) => setBoxSpec(event.target.value)} required>
            <option value="" disabled>请选择盒规格</option>
            <option value="21_bags">21袋</option>
            <option value="30_bags">30袋</option>
          </select>
          <label htmlFor="code-offline-receipt">激活码审批号</label>
          <input id="code-offline-receipt" value={receipt} onChange={(event) => setReceipt(event.target.value)} placeholder="TEST / INIT / 线下审批号" required />
          <button type="submit" className="admin-primary" disabled={busy}>批量生成码</button>
        </form>
        <form onSubmit={allocate}>
          <h3>教练库存划拨</h3>
          <CoachEmailSearchSelect
            id="code-coach-email"
            label="划拨教练邮箱"
            selectedId={coachId}
            disabled={busy}
            onSelect={(coach) => setCoachId(coach?.coachId ?? "")}
          />
          <label htmlFor="code-allocate-count">划拨数量</label>
          <input id="code-allocate-count" type="number" min="1" step="1" value={allocateCount} onChange={(event) => setAllocateCount(event.target.value)} required />
          <button type="submit" className="admin-secondary" disabled={busy || !coachId}>划拨给教练</button>
        </form>
      </div>
      <section className="admin-restock-requests" aria-labelledby="admin-restock-title">
        <h3 id="admin-restock-title">教练补货需求</h3>
        {requests.length === 0 ? <p className="admin-hint">暂无补货需求。</p> : (
          <ul>
            {requests.map((request) => (
              <li key={request.requestId}>
                <span>{request.createdAt.slice(0, 10)} · {request.status}</span>
                <p>{request.note || "未填写需求说明"}</p>
                {request.status === "pending" && (
                  <div className="admin-restock-actions">
                    <button type="button" className="admin-secondary" disabled={busy} onClick={() => resolve(request.requestId, "fulfilled")}>确认已补货</button>
                    <button type="button" className="admin-secondary" disabled={busy} onClick={() => resolve(request.requestId, "rejected")}>驳回</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      {error && <p className="admin-error" role="alert">{error}</p>}
      {notice && <p className="admin-notice" role="status">{notice}</p>}
    </section>
  );
}
