import { getSupabase } from "../lib/supabase";

export type PendingBoxCodeReview = {
  activationId: string;
  authUserId: string;
  camperCode: string;
  coachId: string;
  codeId: string;
  codeMasked: string;
  codeType: "experience" | "recharge";
  shipmentVerificationRef: string | null;
  paymentVerificationRef: string | null;
  codeVersion: number;
  activationVersion: number;
};

export type DormantCoach = {
  coachId: string;
  currentUserCount: number;
};

export type ReviewDecisionInput = {
  review: PendingBoxCodeReview;
  decision: "approved" | "rejected";
  shipmentVerificationRef?: string;
  paymentVerificationRef?: string;
  rejectionReasonCode?: string;
};

function rpcFailure(error: unknown): Error {
  const message = (error as { message?: string } | null)?.message ?? "";
  if (/FORBIDDEN|UNAUTHORIZED/i.test(message)) return new Error("当前账号没有人工审核或托管权限。");
  if (/PLATFORM_ACCOUNT_NOT_CONFIGURED/i.test(message)) return new Error("平台官方账号尚未配置，托管未执行。");
  if (/ACTIVATION_STATE_CONFLICT/i.test(message)) return new Error("该申请已被其他审核人处理，请刷新列表。");
  if (/INVENTORY_INSUFFICIENT/i.test(message)) return new Error("教练库存不足，审核未通过。");
  return new Error("审核或托管操作失败，请稍后重试。");
}

export async function fetchPendingBoxCodeReviews(): Promise<PendingBoxCodeReview[]> {
  const { data, error } = await getSupabase().rpc("admin_get_pending_box_code_reviews");
  if (error) throw rpcFailure(error);
  if (!Array.isArray(data)) throw new Error("待审核列表返回格式异常。");
  return data.map((raw): PendingBoxCodeReview => {
    const row = raw as Record<string, unknown>;
    return {
      activationId: String(row.activation_id),
      authUserId: String(row.auth_user_id),
      camperCode: String(row.camper_code),
      coachId: String(row.coach_id),
      codeId: String(row.code_id),
      codeMasked: String(row.code_masked),
      codeType: row.code_type === "recharge" ? "recharge" : "experience",
      shipmentVerificationRef: typeof row.shipment_verification_ref === "string" ? row.shipment_verification_ref : null,
      paymentVerificationRef: typeof row.payment_verification_ref === "string" ? row.payment_verification_ref : null,
      codeVersion: Number(row.code_version),
      activationVersion: Number(row.activation_version),
    };
  });
}

export async function reviewBoxCodeActivation(input: ReviewDecisionInput): Promise<void> {
  const { review } = input;
  if (input.decision === "approved" && !review.shipmentVerificationRef && !input.shipmentVerificationRef?.trim()) {
    throw new Error("请填写发货凭证。");
  }
  if (input.decision === "approved" && review.codeType === "recharge" && !review.paymentVerificationRef && !input.paymentVerificationRef?.trim()) {
    throw new Error("请填写线下收款凭证。");
  }
  if (input.decision === "rejected" && !input.rejectionReasonCode?.trim()) {
    throw new Error("请填写拒绝原因。");
  }

  const { data, error } = await getSupabase().rpc("admin_review_box_code_activation_v2", {
    p_activation_id: review.activationId,
    p_decision: input.decision,
    p_target_coach_id: review.coachId,
    p_shipment_verification_ref: input.shipmentVerificationRef?.trim() || null,
    p_payment_verification_ref: input.paymentVerificationRef?.trim() || null,
    p_rejection_reason_code: input.rejectionReasonCode?.trim() || null,
    p_expected_code_version: review.codeVersion,
    p_expected_activation_version: review.activationVersion,
  });
  if (error) throw rpcFailure(error);
  if ((data as { ok?: boolean } | null)?.ok !== true) throw new Error("审核结果返回格式异常。");
}

export async function fetchDormantCoaches(): Promise<DormantCoach[]> {
  const { data, error } = await getSupabase().rpc("admin_get_dormant_coaches");
  if (error) throw rpcFailure(error);
  if (!Array.isArray(data)) throw new Error("休眠教练列表返回格式异常。");
  return data.map((raw) => {
    const row = raw as Record<string, unknown>;
    return { coachId: String(row.coach_id), currentUserCount: Number(row.current_user_count) };
  });
}

export async function transferDormantCoaches(): Promise<{ transferredCount: number; coachCount: number }> {
  const { data, error } = await getSupabase().rpc("admin_transfer_dormant_coaches", { p_confirmed: true });
  if (error) throw rpcFailure(error);
  const result = data as Record<string, unknown> | null;
  if (result?.ok !== true || typeof result.transferredCount !== "number" || typeof result.coachCount !== "number") {
    throw new Error("托管结果返回格式异常。");
  }
  return { transferredCount: result.transferredCount, coachCount: result.coachCount };
}
