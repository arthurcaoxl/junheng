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
  if (/FORBIDDEN|UNAUTHORIZED/i.test(message)) return new Error("当前账号没有码池管理权限。");
  if (/INVENTORY_INSUFFICIENT/i.test(message)) return new Error("可用库存不足，操作已整体取消。");
  if (/OFFLINE_RECEIPT_REQUIRED/i.test(message)) return new Error("请填写线下打款凭证号。");
  if (/BOX_SPEC_CONFIG_MISMATCH/i.test(message)) return new Error("盒规格与当前系统配置不一致，请核实后重试。");
  if (/INVALID_CODE_COUNT/i.test(message)) return new Error("生成数量必须为 24 的正整数倍。");
  return new Error("码池操作失败，请稍后重试。");
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
  positiveInteger(count, "生成数量");
  if (!boxSpec.trim()) throw new Error("请填写盒规格。");
  if (!offlineReceiptNo.trim()) throw new Error("请填写线下打款凭证号。");
  const { data, error } = await getSupabase().rpc("generate_platform_codes", {
    p_count: count,
    p_box_spec: boxSpec.trim(),
    p_offline_receipt_no: offlineReceiptNo.trim(),
  });
  if (error) throw rpcFailure(error);
  const generatedCount = (data as { generatedCount?: unknown } | null)?.generatedCount;
  if (typeof generatedCount !== "number") throw new Error("码池返回数据格式异常。");
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
  if (typeof allocatedCount !== "number") throw new Error("码池返回数据格式异常。");
  return allocatedCount;
}

export async function fetchMyCodeInventory(): Promise<CoachCodeInventory> {
  const { data, error } = await getSupabase().rpc("get_my_code_inventory");
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
