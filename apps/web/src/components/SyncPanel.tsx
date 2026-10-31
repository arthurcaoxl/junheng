import { useEffect, useRef, useState } from "react";
import { useSyncStatus } from "../hooks/useSyncStatus";
import { syncToCloud } from "../services/checkinSync";
import type { SyncMilestoneKind, SyncMode, SyncOpenOptions } from "../services/syncUi";
import { SyncModal } from "./SyncModal";

/** 打卡页底部的同步状态栏：未绑定给引导入口，已绑定弱化展示并保留恢复入口。 */
export function SyncPanel() {
  const { configured, email } = useSyncStatus();
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<SyncMode>("bind");
  const [milestone, setMilestone] = useState(false);
  const [milestoneKind, setMilestoneKind] = useState<SyncMilestoneKind>("trend");
  const [posterUrl, setPosterUrl] = useState("");
  const pendingActionRef = useRef<(() => void) | null>(null);
  const [backupState, setBackupState] = useState<"idle" | "saving" | "synced" | "offline">("idle");

  useEffect(() => {
    if (!configured) return;
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<SyncOpenOptions & { mode?: SyncMode }>).detail;
      setMode(detail?.mode === "restore" || detail?.mode === "change-email" ? detail.mode : "bind");
      setMilestone(Boolean(detail?.milestone));
      setMilestoneKind(detail?.milestoneKind === "poster" ? "poster" : "trend");
      setPosterUrl(detail?.posterUrl ?? "");
      pendingActionRef.current = detail?.onSuccess ?? null;
      setModalOpen(true);
    };
    window.addEventListener("junheng-open-sync", onOpen);
    return () => window.removeEventListener("junheng-open-sync", onOpen);
  }, [configured]);

  if (!configured) return null;

  const open = (next: SyncMode) => {
    setMode(next);
    setMilestone(false);
    setMilestoneKind("trend");
    setPosterUrl("");
    pendingActionRef.current = null;
    setModalOpen(true);
  };

  const continueAfterBinding = () => {
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    action?.();
  };

  const backupNow = async () => {
    setBackupState("saving");
    setBackupState(await syncToCloud());
  };

  return (
    <section className="sync-panel" id="sync-panel" aria-labelledby="sync-panel-title">
      <h2 id="sync-panel-title">跨设备同步</h2>
      {email ? (
        <>
          <p className="sync-panel-status sync-panel-bound">✅ 已绑定邮箱：{email}。打卡记录会自动备份到云端。</p>
          <div className="sync-panel-actions">
            <button type="button" className="sync-panel-secondary" disabled={backupState === "saving"} onClick={backupNow}>
              {backupState === "saving" ? "正在备份…" : "立即备份到云端"}
            </button>
            <button type="button" className="sync-panel-secondary" onClick={() => open("restore")}>
              在新设备恢复数据
            </button>
          </div>
          {backupState === "synced" && <p className="sync-panel-notice" role="status">本机打卡记录已备份到云端。</p>}
          {backupState === "offline" && <p className="sync-panel-error" role="alert">本次备份未完成，记录仍保存在本机。请检查网络后重试。</p>}
        </>
      ) : (
        <>
          <p className="sync-panel-status">☁️ 记录目前仅保存在本机。绑定邮箱，换手机/电脑也能接着打卡。</p>
          <div className="sync-panel-actions">
            <button type="button" className="sync-panel-bind" onClick={() => open("bind")}>绑定邮箱，换手机/电脑接着打卡</button>
            <button type="button" className="sync-panel-secondary" onClick={() => open("restore")}>在新设备恢复数据</button>
          </div>
        </>
      )}
      <SyncModal
        open={modalOpen}
        mode={mode}
        milestone={milestone}
        milestoneKind={milestoneKind}
        posterUrl={posterUrl}
        onSuccess={continueAfterBinding}
        onClose={() => setModalOpen(false)}
      />
    </section>
  );
}
