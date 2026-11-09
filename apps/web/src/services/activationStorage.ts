const ACTIVATED_FLAG_KEY = "junheng-box-code-activated-v1";
const PENDING_REVIEW_FLAG_KEY = "junheng-box-code-pending-review-v1";
export const BOX_CODE_REVIEW_EVENT = "junheng-box-code-review-updated";

export function hasBoxCodeActivation(): boolean {
  try {
    return window.localStorage.getItem(ACTIVATED_FLAG_KEY) === "true";
  } catch {
    return false;
  }
}

export type CachedActivationState = "none" | "pending_review" | "active" | "rejected";

export function syncBoxCodeActivationCache(state: CachedActivationState): void {
  try {
    if (state === "active") window.localStorage.setItem(ACTIVATED_FLAG_KEY, "true");
    else window.localStorage.removeItem(ACTIVATED_FLAG_KEY);
    if (state === "pending_review") window.localStorage.setItem(PENDING_REVIEW_FLAG_KEY, "true");
    else window.localStorage.removeItem(PENDING_REVIEW_FLAG_KEY);
  } catch {
    // 本机标记只是 UX 缓存，服务端激活事实不依赖它。
  }
  window.dispatchEvent(new Event(BOX_CODE_REVIEW_EVENT));
}

export function markBoxCodeActivated(): void {
  syncBoxCodeActivationCache("active");
}

export function hasPendingBoxCodeReview(): boolean {
  try {
    return !hasBoxCodeActivation() && window.localStorage.getItem(PENDING_REVIEW_FLAG_KEY) === "true";
  } catch {
    return false;
  }
}

export function markBoxCodePendingReview(): void {
  syncBoxCodeActivationCache("pending_review");
}
