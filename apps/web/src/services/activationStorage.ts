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

export function markBoxCodeActivated(): void {
  try {
    window.localStorage.setItem(ACTIVATED_FLAG_KEY, "true");
    window.localStorage.removeItem(PENDING_REVIEW_FLAG_KEY);
  } catch {
    // 本机标记只控制交互与同步分流，服务端激活事实不依赖它。
  }
}

export function hasPendingBoxCodeReview(): boolean {
  try {
    return !hasBoxCodeActivation() && window.localStorage.getItem(PENDING_REVIEW_FLAG_KEY) === "true";
  } catch {
    return false;
  }
}

export function markBoxCodePendingReview(): void {
  try {
    window.localStorage.setItem(PENDING_REVIEW_FLAG_KEY, "true");
  } catch {
    // 服务端 code_activations 才是审核事实，本机标记仅用于阻断交互。
  }
  window.dispatchEvent(new Event(BOX_CODE_REVIEW_EVENT));
}
