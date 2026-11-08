import { ensureSession, getSupabase } from "../lib/supabase";
import { syncToCloud, type SyncResult } from "./checkinSync";
import { markBoxCodeActivated } from "./activationStorage";

export { hasBoxCodeActivation } from "./activationStorage";

type ActivationErrorCode =
  | "UNAUTHORIZED"
  | "CODE_NOT_AVAILABLE"
  | "CODE_TYPE_MISMATCH"
  | "SHIPMENT_VERIFICATION_REQUIRED"
  | "PAYMENT_VERIFICATION_REQUIRED"
  | "ACTIVATION_STATE_CONFLICT"
  | "COACH_NOT_ELIGIBLE"
  | "INVENTORY_INSUFFICIENT"
  | "IDEMPOTENCY_CONFLICT"
  | "TOO_MANY_ATTEMPTS"
  | "CODE_HASH_NOT_CONFIGURED";

type ActivationResult = {
  ok?: boolean;
  errorCode?: ActivationErrorCode;
};

const ERROR_MESSAGES: Record<ActivationErrorCode, string> = {
  UNAUTHORIZED: "登录状态已失效，请刷新页面后重试。",
  CODE_NOT_AVAILABLE: "产品码无效、已使用或当前不可激活。",
  CODE_TYPE_MISMATCH: "产品码类型与当前激活申请不一致。",
  SHIPMENT_VERIFICATION_REQUIRED: "发货信息尚未核验完成，请稍后再试。",
  PAYMENT_VERIFICATION_REQUIRED: "付款信息尚未核验完成，请稍后再试。",
  ACTIVATION_STATE_CONFLICT: "激活状态已变化，请刷新页面后重试。",
  COACH_NOT_ELIGIBLE: "当前产品码暂不能绑定教练，请联系运营方。",
  INVENTORY_INSUFFICIENT: "教练库存不足，激活已取消，请联系运营方补货。",
  IDEMPOTENCY_CONFLICT: "激活请求已变化，请刷新页面后重试。",
  TOO_MANY_ATTEMPTS: "尝试次数过多，请稍后再试。",
  CODE_HASH_NOT_CONFIGURED: "激活服务暂不可用，请联系运营方。",
};

export async function activateBoxCode(
  code: string,
  idempotencyKey: string,
): Promise<{ syncResult: SyncResult }> {
  await ensureSession();

  // 激活 RPC 会核对 checkin_sync 中的终身 userCode，先确保匿名云端档案存在。
  if (await syncToCloud() === "offline") {
    throw new Error("云端数据尚未同步，请检查网络后重试。");
  }

  const { data, error } = await getSupabase().rpc("activate_box_code", {
    p_code: code,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw new Error("激活请求失败，请检查网络后重试。");

  const result = data as ActivationResult | null;
  if (!result?.ok) {
    const code = result?.errorCode;
    throw new Error(code ? ERROR_MESSAGES[code] : "激活失败，请稍后重试。");
  }

  markBoxCodeActivated();
  // 激活后的保持性同步不是新打卡，不消耗物理日额度。
  return { syncResult: await syncToCloud(false) };
}
