import { useState, type FormEvent } from "react";
import { allocateCodesToCoach, generatePlatformCodes } from "../../services/codePool";

export default function AdminCodePool() {
  const [count, setCount] = useState("");
  const [boxSpec, setBoxSpec] = useState("");
  const [receipt, setReceipt] = useState("");
  const [coachId, setCoachId] = useState("");
  const [allocateCount, setAllocateCount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setNotice(await action());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "码池操作失败，请稍后重试。");
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

  return (
    <section className="admin-block" aria-labelledby="admin-code-pool-title">
      <div className="admin-block-heading">
        <h2 id="admin-code-pool-title">平台码池</h2>
        <span>仅管理员可生成与划拨；所有动作写入库存流水</span>
      </div>
      <div className="admin-code-pool-forms">
        <form onSubmit={generate}>
          <h3>生成平台码</h3>
          <label htmlFor="code-generate-count">生成数量</label>
          <input id="code-generate-count" type="number" min="1" step="1" value={count} onChange={(event) => setCount(event.target.value)} required />
          <label htmlFor="code-generate-spec">盒规格</label>
          <input id="code-generate-spec" value={boxSpec} onChange={(event) => setBoxSpec(event.target.value)} placeholder="与系统配置一致" required />
          <label htmlFor="code-offline-receipt">线下打款凭证号</label>
          <input id="code-offline-receipt" value={receipt} onChange={(event) => setReceipt(event.target.value)} required />
          <button type="submit" className="admin-primary" disabled={busy}>批量生成码</button>
        </form>
        <form onSubmit={allocate}>
          <h3>教练库存划拨</h3>
          <label htmlFor="code-coach-id">教练用户 ID</label>
          <input id="code-coach-id" value={coachId} onChange={(event) => setCoachId(event.target.value)} required />
          <label htmlFor="code-allocate-count">划拨数量</label>
          <input id="code-allocate-count" type="number" min="1" step="1" value={allocateCount} onChange={(event) => setAllocateCount(event.target.value)} required />
          <button type="submit" className="admin-secondary" disabled={busy}>划拨给教练</button>
        </form>
      </div>
      {error && <p className="admin-error" role="alert">{error}</p>}
      {notice && <p className="admin-notice" role="status">{notice}</p>}
    </section>
  );
}
