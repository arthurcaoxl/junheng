export const CONSENT_STORAGE_KEY = "junheng-consent";

/** 本地授权留痕：独立于 storage-v3，不影响打卡契约与 merged_flag。 */
export function hasGrantedConsent(): boolean {
  try {
    return window.localStorage.getItem(CONSENT_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}
