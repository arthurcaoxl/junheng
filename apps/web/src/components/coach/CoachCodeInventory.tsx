import { useEffect, useState } from "react";
import { fetchMyCodeInventory, type CoachCodeInventory as Inventory } from "../../services/codePool";

export default function CoachCodeInventory() {
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState("");

  useEffect(() => {
    let alive = true;
    fetchMyCodeInventory()
      .then((result) => { if (alive) setInventory(result); })
      .catch((cause: unknown) => {
        if (alive) setError(cause instanceof Error ? cause.message : "码库读取失败，请稍后重试。");
      });
    return () => { alive = false; };
  }, []);

  const copy = async (codeId: string, code: string) => {
    setError("");
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(codeId);
    } catch {
      setError("复制失败，请手动选择码面复制。");
    }
  };

  return (
    <section className="admin-block" aria-labelledby="my-code-inventory-title">
      <div className="admin-block-heading">
        <h2 id="my-code-inventory-title">我的码库</h2>
        {inventory && <span>可用 {inventory.availableCount} 枚</span>}
      </div>
      {!inventory && !error && <p role="status">码库加载中…</p>}
      {error && <p className="admin-error" role="alert">{error}</p>}
      {inventory?.needsRestock && <p className="admin-notice" role="status">库存低于补货点，请及时补货</p>}
      {inventory && inventory.codes.length === 0 && <p>暂无未激活码。</p>}
      {inventory && inventory.codes.length > 0 && (
        <ul className="coach-code-list">
          {inventory.codes.map((item) => (
            <li key={item.codeId}>
              <code>{item.code}</code>
              <span>{item.boxSpec}</span>
              <button type="button" className="admin-secondary" onClick={() => void copy(item.codeId, item.code)}>
                {copiedId === item.codeId ? "已复制" : `复制 ${item.code}`}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
