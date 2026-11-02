export const CONSENT_STORAGE_KEY = "junheng-consent";

/**
 * 本地授权留痕（独立于 storage-v3，不影响打卡契约与 merged_flag）：
 * true=明确同意 / false=明确拒绝 / null=从未表态。
 */
export function readLocalConsent(): boolean | null {
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (raw === "true") return true;
    if (raw === "false") return false;
    return null;
  } catch {
    return null;
  }
}

export function writeLocalConsent(granted: boolean): void {
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, granted ? "true" : "false");
  } catch {
    // 私密模式等场景：本地留痕失败不阻断（云端已尽力留痕）
  }
}

/** 总授权机制改由 readLocalConsent 三态判定；此布尔口径仅保留给“同意才放行”的历史场景。 */
export function hasGrantedConsent(): boolean {
  return readLocalConsent() === true;
}
