const ACTIVATED_FLAG_KEY = "junheng-box-code-activated-v1";

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
  } catch {
    // 本机标记只控制交互与同步分流，服务端激活事实不依赖它。
  }
}
