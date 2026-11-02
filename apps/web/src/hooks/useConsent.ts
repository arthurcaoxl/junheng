import { useCallback, useRef, useState } from "react";
import { fetchCloudConsent, saveCloudConsent } from "../services/consent";

export type ConsentGate = {
  /** 是否展示授权弹窗（仅云端查不到表态时才会出现） */
  promptVisible: boolean;
  /** 弹窗表态提交中 */
  busy: boolean;
  /** 入口点击时调用：已表态（同意或拒绝）直接放行；从未表态则弹窗等待表态 */
  ensureConsent: (onProceed: () => void) => Promise<void>;
  /** 弹窗内表态后调用：写入云端（失败降级本地）并放行 */
  resolve: (granted: boolean) => Promise<void>;
};

/**
 * 用户数据合规总授权闸门：
 * 同意与拒绝都视为“已表态”并永久放行——产品只打扰从未表态的用户一次。
 */
export function useConsent(): ConsentGate {
  const [promptVisible, setPromptVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const proceedRef = useRef<(() => void) | null>(null);

  const ensureConsent = useCallback(async (onProceed: () => void) => {
    const consent = await fetchCloudConsent().catch((): null => null);
    if (consent === true || consent === false) {
      onProceed();
      return;
    }
    proceedRef.current = onProceed;
    setPromptVisible(true);
  }, []);

  const resolve = useCallback(async (granted: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      await saveCloudConsent(granted).catch((error: unknown) => {
        console.warn("授权状态云端同步失败，已保留本机授权记录。", error);
      });
    } finally {
      setBusy(false);
      setPromptVisible(false);
      const proceed = proceedRef.current;
      proceedRef.current = null;
      proceed?.();
    }
  }, [busy]);

  return { promptVisible, busy, ensureConsent, resolve };
}
