import { getSupabase } from "../lib/supabase";
import type { AdminCoachDirectoryEntry } from "./adminCoachDirectory";

export type StaffCapacityWarning = {
  code: "STAFF_CAPACITY_WARNING";
  type: "coach_count" | "camper_count";
  count: number;
  threshold: number;
};

export type StaffAssignment = {
  assignmentId: string;
  coachId: string;
  coachEmail: string;
  version: number;
};

export type StaffMember = {
  staffId: string;
  email: string;
  isActive: boolean;
  version: number;
  coachCount: number;
  camperCount: number;
  assignments: StaffAssignment[];
};

export type AssignStaffCoachResult = {
  assignmentId: string;
  coachCount: number;
  camperCount: number;
  warnings: StaffCapacityWarning[];
};

function idempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}

function rpcFailure(error: unknown): Error {
  const message = (error as { message?: string } | null)?.message ?? "";
  if (/UNAUTHORIZED|FORBIDDEN|ROLE_REQUIRED/i.test(message)) return new Error("当前账号没有员工管理权限。");
  if (/ROLE_ASSIGNMENT_CONFLICT/i.test(message)) return new Error("该账号已有其他角色，不能作为员工添加。");
  if (/ASSIGNMENT_CONFLICT|ROLE_VERSION_CONFLICT/i.test(message)) return new Error("员工权限已变化，请刷新后重试。");
  if (/IDEMPOTENCY_CONFLICT/i.test(message)) return new Error("操作标识冲突，请重新提交。");
  if (/STAFF_IDENTITY_NOT_FOUND/i.test(message)) return new Error("未找到该邮箱对应的已认证账号。");
  if (/COACH_NOT_FOUND/i.test(message)) return new Error("该教练没有当前有效归属关系，不能分配。");
  return new Error("员工权限操作失败，请稍后重试。");
}

function requiredString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function parseWarnings(input: unknown): StaffCapacityWarning[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((raw) => {
    const row = raw as Record<string, unknown>;
    if (
      row.code !== "STAFF_CAPACITY_WARNING"
      || (row.type !== "coach_count" && row.type !== "camper_count")
      || typeof row.count !== "number"
      || typeof row.threshold !== "number"
    ) return [];
    return [{ code: row.code, type: row.type, count: row.count, threshold: row.threshold }];
  });
}

export async function fetchAdminStaffDirectory(): Promise<StaffMember[]> {
  const { data, error } = await getSupabase().rpc("admin_get_staff_directory");
  if (error) throw rpcFailure(error);
  if (!Array.isArray(data)) throw new Error("员工目录返回格式异常。");
  return data.flatMap((raw): StaffMember[] => {
    const row = raw as Record<string, unknown>;
    const staffId = requiredString(row.staff_id);
    const email = requiredString(row.email);
    if (
      !staffId || !email || typeof row.is_active !== "boolean"
      || typeof row.version !== "number"
      || typeof row.coach_count !== "number"
      || typeof row.camper_count !== "number"
      || !Array.isArray(row.assignments)
    ) return [];
    const assignments = row.assignments.flatMap((value): StaffAssignment[] => {
      const assignment = value as Record<string, unknown>;
      const assignmentId = requiredString(assignment.assignmentId);
      const coachId = requiredString(assignment.coachId);
      const coachEmail = requiredString(assignment.coachEmail);
      if (!assignmentId || !coachId || !coachEmail || typeof assignment.version !== "number") return [];
      return [{ assignmentId, coachId, coachEmail, version: assignment.version }];
    });
    return [{
      staffId,
      email,
      isActive: row.is_active,
      version: row.version,
      coachCount: row.coach_count,
      camperCount: row.camper_count,
      assignments,
    }];
  });
}

export async function setStaffRole(email: string, isActive: boolean, expectedVersion: number): Promise<void> {
  const p_email = email.trim();
  if (!p_email.includes("@")) throw new Error("请输入有效员工邮箱。");
  const { data, error } = await getSupabase().rpc("admin_set_staff_role", {
    p_email,
    p_is_active: isActive,
    p_expected_version: expectedVersion,
    p_idempotency_key: idempotencyKey(),
  });
  if (error) throw rpcFailure(error);
  if ((data as { ok?: boolean } | null)?.ok !== true) throw new Error("员工角色返回格式异常。");
}

export async function assignStaffCoach(
  staff: StaffMember,
  coach: AdminCoachDirectoryEntry,
): Promise<AssignStaffCoachResult> {
  const { data, error } = await getSupabase().rpc("admin_assign_staff_coach", {
    p_staff_id: staff.staffId,
    p_coach_id: coach.coachId,
    p_expected_version: staff.version,
    p_idempotency_key: idempotencyKey(),
  });
  if (error) throw rpcFailure(error);
  const result = data as Record<string, unknown> | null;
  const assignmentId = requiredString(result?.assignmentId);
  if (
    result?.ok !== true || !assignmentId
    || typeof result.coachCount !== "number"
    || typeof result.camperCount !== "number"
  ) throw new Error("员工分配返回格式异常。");
  return {
    assignmentId,
    coachCount: result.coachCount,
    camperCount: result.camperCount,
    warnings: parseWarnings(result.warnings),
  };
}

export async function revokeStaffCoach(assignment: StaffAssignment): Promise<void> {
  const { data, error } = await getSupabase().rpc("admin_revoke_staff_coach", {
    p_assignment_id: assignment.assignmentId,
    p_expected_version: assignment.version,
    p_idempotency_key: idempotencyKey(),
  });
  if (error) throw rpcFailure(error);
  if ((data as { ok?: boolean; revoked?: boolean } | null)?.ok !== true || data.revoked !== true) {
    throw new Error("撤销分配返回格式异常。");
  }
}
