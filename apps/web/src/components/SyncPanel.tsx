import { useEffect, useState } from "react";
import { useSyncStatus } from "../hooks/useSyncStatus";
import type { SyncMode } from "../services/syncUi";
import { SyncModal } from "./SyncModal";

/** 打卡页底部的同步状态栏：未绑定给引导入口，已绑定弱化展示并保留恢复入口。 */
export function SyncPanel() {
  const { configured, email } = useSyncStatus();
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<SyncMode>("bind");

  useEffect(() => {
    if (!configured) return;
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ mode?: SyncMode }>).detail;
      setMode(detail?.mode === "restore" ? "restore" : "bind");
      setModalOpen(true);
    };
    window.addEventListener("junheng-open-sync", onOpen);
    return () => window.removeEventListener("junheng-open-sync", onOpen);
  }, [configured]);

  if (!configured) return null;

  const open = (next: SyncMode) => {
    setMode(next);
    setModalOpen(true);
  };

  return (
    <section className="sync-panel" id="sync-panel" aria-labelledby="sync-panel-title">
      <h2 id="sync-panel-title">跨设备同步</h2>
      {email ? (
        <>
          <p className="sync-panel-status sync-panel-bound">✅ 已绑定邮箱：{email}。数据自动同步至云端。</p>
          <div className="sync-panel-actions">
            <button type="button" className="sync-panel-secondary" onClick={() => open("restore")}>
              在新设备恢复数据
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="sync-panel-status">☁️ 记录目前仅保存在本机。绑定邮箱，换手机/电脑也能接着打卡。</p>
          <div className="sync-panel-actions">
            <button type="button" className="sync-panel-bind" onClick={() => open("bind")}>绑定邮箱，永久保存</button>
            <button type="button" className="sync-panel-secondary" onClick={() => open("restore")}>在新设备恢复数据</button>
          </div>
        </>
      )}
      <SyncModal open={modalOpen} mode={mode} onClose={() => setModalOpen(false)} />
    </section>
  );
}
