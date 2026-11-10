import { getSupabase } from "../lib/supabase";

export type CoachCode = {
  codeId: string;
  code: string;
  boxSpec: string;
  maxCheckins: number;
  createdAt: string;
};

export type CoachCodeInventory = {
  availableCount: number;
  restockPoint: number;
  needsRestock: boolean;
  codes: CoachCode[];
};

function rpcFailure(error: unknown): Error {
  const message = (error as { message?: string } | null)?.message ?? "";
  if (/FORBIDDEN|UNAUTHORIZED/i.test(message)) return new Error("当前账号没有产品激活码库管理权限。");
  if (/INVENTORY_INSUFFICIENT/i.test(message)) return new Error("可用库存不足，操作已整体取消。");
  if (/OFFLINE_RECEIPT_REQUIRED/i.test(message)) return new Error("请填写线下打款凭证号。");
  if (/BOX_SPEC_CONFIG_MISMATCH/i.test(message)) return new Error("盒规格与当前系统配置不一致，请核实后重试。");
  if (/BOX_CODE_PEPPER_NOT_CONFIGURED|CODE_HASH_NOT_CONFIGURED/i.test(message)) {
    return new Error("系统维护中，请稍后重试。");
  }
  if (/RESTOCK_NOT_EMPTY/i.test(message)) return new Error("当前仍有可用库存，无需申请补货。");
  if (/RESTOCK_NOT_FULFILLED/i.test(message)) return new Error("尚未检测到补货库存，请先完成划拨。");
  if (/CODE_NOT_AVAILABLE|ACTIVATION_STATE_CONFLICT/i.test(message)) return new Error("该码已不可用，请刷新产品激活码库后重试。");
  return new Error("产品激活码库操作失败，请稍后重试。");
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label}必须为正整数。`);
  return value;
}

export async function generatePlatformCodes(
  count: number,
  boxSpec: string,
  offlineReceiptNo: string,
): Promise<number> {
  positiveInteger(count, "生成盒数");
  if (!boxSpec.trim()) throw new Error("请填写盒规格。");
  if (!offlineReceiptNo.trim()) throw new Error("请填写线下打款凭证号。");
  const { data, error } = await getSupabase().rpc("generate_platform_codes", {
    p_count: count,
    p_box_spec: boxSpec.trim(),
    p_offline_receipt_no: offlineReceiptNo.trim(),
  });
  if (error) throw rpcFailure(error);
  const generatedCount = (data as { generatedCount?: unknown } | null)?.generatedCount;
  if (typeof generatedCount !== "number") throw new Error("产品激活码库返回数据格式异常。");
  return generatedCount;
}

export async function allocateCodesToCoach(coachId: string, count: number): Promise<number> {
  positiveInteger(count, "划拨数量");
  if (!coachId.trim()) throw new Error("请填写教练用户 ID。");
  const { data, error } = await getSupabase().rpc("allocate_codes_to_coach", {
    p_coach_id: coachId.trim(),
    p_count: count,
  });
  if (error) throw rpcFailure(error);
  const allocatedCount = (data as { allocatedCount?: unknown } | null)?.allocatedCount;
  if (typeof allocatedCount !== "number") throw new Error("产品激活码库返回数据格式异常。");
  return allocatedCount;
}

export async function allocateCodesToStaff(staffId: string, count: number): Promise<number> {
  positiveInteger(count, "划拨数量");
  if (!staffId.trim()) throw new Error("请选择平台直营员工。");
  const { data, error } = await getSupabase().rpc("allocate_codes_to_staff_v1", {
    p_staff_id: staffId.trim(),
    p_count: count,
  });
  if (error) throw rpcFailure(error);
  const result = data as { ok?: unknown; allocatedCount?: unknown } | null;
  if (result?.ok !== true || typeof result.allocatedCount !== "number") {
    throw new Error("产品激活码库返回数据格式异常。");
  }
  return result.allocatedCount;
}

export async function fetchMyCodeInventory(): Promise<CoachCodeInventory> {
  const { data, error } = await getSupabase().rpc("get_coach_inventory_v3", { p_dummy: null });
  if (error) throw rpcFailure(error);
  const result = data as Record<string, unknown> | null;
  if (
    !result
    || typeof result.availableCount !== "number"
    || typeof result.restockPoint !== "number"
    || typeof result.needsRestock !== "boolean"
    || !Array.isArray(result.codes)
  ) throw new Error("码库返回数据格式异常。");

  const codes = result.codes.map((raw): CoachCode => {
    const row = raw as Record<string, unknown>;
    if (
      typeof row.codeId !== "string"
      || typeof row.code !== "string"
      || typeof row.boxSpec !== "string"
      || typeof row.maxCheckins !== "number"
      || typeof row.createdAt !== "string"
    ) throw new Error("码库返回数据格式异常。");
    return {
      codeId: row.codeId,
      code: row.code,
      boxSpec: row.boxSpec,
      maxCheckins: row.maxCheckins,
      createdAt: row.createdAt,
    };
  });

  return {
    availableCount: result.availableCount,
    restockPoint: result.restockPoint,
    needsRestock: result.needsRestock,
    codes,
  };
}

export async function requestCoachRestock(note: string): Promise<void> {
  const trimmed = note.trim();
  if (trimmed.length > 500) throw new Error("补货需求说明最多 500 字。");
  const { data, error } = await getSupabase().rpc("request_coach_restock_v1", { p_note: trimmed });
  if (error) throw rpcFailure(error);
  if ((data as { ok?: unknown } | null)?.ok !== true) throw new Error("补货申请返回数据格式异常。");
}

export async function pushCoachCode(camperRef: string, codeId: string, idempotencyKey: string): Promise<void> {
  if (!camperRef || !codeId || !idempotencyKey) throw new Error("直推参数不完整，请刷新后重试。");
  const { data, error } = await getSupabase().rpc("coach_push_code_v1", {
    p_camper_ref: camperRef,
    p_code_id: codeId,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw rpcFailure(error);
  const result = data as { ok?: unknown; state?: unknown; errorCode?: unknown } | null;
  if (result?.ok !== true) throw rpcFailure({ message: String(result?.errorCode ?? "CODE_NOT_AVAILABLE") });
  if (result.state !== "pending_review") throw new Error("直推返回数据格式异常。");
}

export type AdminRestockRequest = {
  requestId: string;
  coachId: string;
  note: string;
  status: "pending" | "fulfilled" | "rejected";
  createdAt: string;
};

export async function fetchAdminRestockRequests(): Promise<AdminRestockRequest[]> {
  const { data, error } = await getSupabase().rpc("admin_get_coach_restock_requests_v1");
  if (error) throw rpcFailure(error);
  if (!Array.isArray(data)) throw new Error("补货需求返回数据格式异常。");
  return data.map((raw) => {
    const row = raw as Record<string, unknown>;
    if (
      typeof row.request_id !== "string" || typeof row.coach_id !== "string"
      || typeof row.note !== "string" || typeof row.created_at !== "string"
      || (row.status !== "pending" && row.status !== "fulfilled" && row.status !== "rejected")
    ) throw new Error("补货需求返回数据格式异常。");
    return { requestId: row.request_id, coachId: row.coach_id, note: row.note, status: row.status, createdAt: row.created_at };
  });
}

export async function resolveAdminRestockRequest(requestId: string, decision: "fulfilled" | "rejected"): Promise<void> {
  const { data, error } = await getSupabase().rpc("admin_resolve_coach_restock_request_v1", {
    p_request_id: requestId,
    p_decision: decision,
  });
  if (error) throw rpcFailure(error);
  if ((data as { ok?: unknown } | null)?.ok !== true) throw new Error("补货处理返回数据格式异常。");
}

export const COACH_PENDING_REVIEWS_EVENT = "junheng-coach-pending-reviews-updated";

export type CoachPendingReview = {
  codeId: string;
  code: string;
  camperCode: string;
  requestedAt: string;
  entryPath: "manual_code" | "coach_push";
};

export async function fetchCoachPendingReviews(): Promise<CoachPendingReview[]> {
  const { data, error } = await getSupabase().rpc("get_coach_pending_reviews");
  if (error) throw new Error("在审激活码读取失败，请稍后重试。");
  if (!Array.isArray(data)) throw new Error("在审激活码返回数据格式异常。");
  return data.map((raw) => {
    const row = raw as Record<string, unknown>;
    if (
      typeof row.code_id !== "string" || typeof row.code !== "string"
      || typeof row.camper_code !== "string" || typeof row.requested_at !== "string"
      || (row.entry_path !== "manual_code" && row.entry_path !== "coach_push")
    ) throw new Error("在审激活码返回数据格式异常。");
    return {
      codeId: row.code_id,
      code: row.code,
      camperCode: row.camper_code,
      requestedAt: row.requested_at,
      entryPath: row.entry_path,
    };
  });
}
