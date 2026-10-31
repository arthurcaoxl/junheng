export type SyncMode = "bind" | "restore" | "change-email";
export type SyncMilestoneKind = "poster" | "trend";

export type SyncOpenOptions = {
  milestone?: boolean;
  milestoneKind?: SyncMilestoneKind;
  posterUrl?: string;
  onSuccess?: () => void;
};

/** 各同步入口通过统一事件请求打卡页打开绑定/恢复弹窗。 */
export function openSyncModal(mode: SyncMode, options: SyncOpenOptions = {}): void {
  window.dispatchEvent(new CustomEvent("junheng-open-sync", { detail: { mode, ...options } }));
}
