export type SyncMode = "bind" | "restore";

/** 各同步入口通过统一事件请求打卡页打开绑定/恢复弹窗。 */
export function openSyncModal(mode: SyncMode): void {
  window.dispatchEvent(new CustomEvent("junheng-open-sync", { detail: { mode } }));
}
