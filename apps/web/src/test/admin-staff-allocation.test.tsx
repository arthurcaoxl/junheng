import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminCodePool from "../components/admin/AdminCodePool";
import { getSupabase } from "../lib/supabase";
import * as adminStaffService from "../services/adminStaff";
import * as codePoolService from "../services/codePool";

const staffRow = {
  staff_id: "22222222-2222-4222-8222-222222222222",
  email: "staff@example.com",
  is_active: true,
  version: 3,
  coach_count: 2,
  camper_count: 8,
  assignments: [],
};

const coachRow = {
  coach_id: "11111111-1111-4111-8111-111111111111",
  email: "coach@example.com",
  name: "教练甲",
  phone: "13800000000",
};

describe("Admin 直营员工与教练划拨分流", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
    (getSupabase().rpc as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
      if (name === "admin_search_staff_directory_v1") return Promise.resolve({ data: [staffRow], error: null });
      if (name === "admin_get_coach_directory") return Promise.resolve({ data: [coachRow], error: null });
      if (name === "allocate_codes_to_staff_v1") return Promise.resolve({ data: { ok: true, allocatedCount: 2 }, error: null });
      if (name === "allocate_codes_to_coach") return Promise.resolve({ data: { allocatedCount: 3 }, error: null });
      return Promise.resolve({ data: [], error: null });
    });
  });

  it("员工搜索调用后台 RPC 并复用 StaffMember 字段解析", async () => {
    const search = (adminStaffService as unknown as {
      searchAdminStaffDirectory?: (query: string) => Promise<adminStaffService.StaffMember[]>;
    }).searchAdminStaffDirectory;
    expect(search).toBeTypeOf("function");

    await expect(search?.(" staff ")).resolves.toEqual([{
      staffId: staffRow.staff_id,
      email: staffRow.email,
      isActive: true,
      version: 3,
      coachCount: 2,
      camperCount: 8,
      assignments: [],
    }]);
    expect(getSupabase().rpc).toHaveBeenCalledWith("admin_search_staff_directory_v1", { p_query: "staff" });
    expect(getSupabase().rpc).not.toHaveBeenCalledWith("admin_get_staff_directory");
  });

  it("直营划拨调用约定 RPC 并返回服务端 allocatedCount", async () => {
    const allocate = (codePoolService as unknown as {
      allocateCodesToStaff?: (staffId: string, count: number) => Promise<number>;
    }).allocateCodesToStaff;
    expect(allocate).toBeTypeOf("function");

    await expect(allocate?.(staffRow.staff_id, 2)).resolves.toBe(2);
    expect(getSupabase().rpc).toHaveBeenCalledWith("allocate_codes_to_staff_v1", {
      p_staff_id: staffRow.staff_id,
      p_count: 2,
    });
  });

  it("切换直营员工后按角色搜索、选择、划拨并显示对应成功文案", async () => {
    const user = userEvent.setup();
    render(<AdminCodePool />);

    await user.click(screen.getByRole("button", { name: "平台直营员工" }));
    expect(screen.getByRole("heading", { name: "平台直营员工库存划拨" })).toBeInTheDocument();
    expect(screen.queryByLabelText("划拨教练邮箱")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("划拨直营员工邮箱"), "staff");
    await user.click(await screen.findByRole("option", { name: /staff@example\.com.*在职.*2 名教练.*8 名体验官/ }));
    await user.type(screen.getByLabelText("划拨数量"), "2");
    await user.click(screen.getByRole("button", { name: "划拨给员工" }));

    expect(getSupabase().rpc).toHaveBeenCalledWith("admin_search_staff_directory_v1", { p_query: "staff" });
    expect(getSupabase().rpc).toHaveBeenCalledWith("allocate_codes_to_staff_v1", {
      p_staff_id: staffRow.staff_id,
      p_count: 2,
    });
    expect(getSupabase().rpc).not.toHaveBeenCalledWith("allocate_codes_to_coach", expect.anything());
    expect(await screen.findByText("已向平台直营员工划拨 2 枚码。")).toBeInTheDocument();
  });

  it("切换角色清除另一角色选中态，返回后不能误拨原教练", async () => {
    const user = userEvent.setup();
    render(<AdminCodePool />);

    await user.type(screen.getByLabelText("划拨教练邮箱"), "coach");
    await user.click(await screen.findByRole("option", { name: /coach@example\.com.*教练甲/ }));
    expect(screen.getByRole("button", { name: "划拨给教练" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "平台直营员工" }));
    expect(screen.getByRole("button", { name: "划拨给员工" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /^教练$/ }));

    expect(screen.getByLabelText("划拨教练邮箱")).toHaveValue("");
    expect(screen.queryByText("已选择 coach@example.com")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "划拨给教练" })).toBeDisabled();
    expect(getSupabase().rpc).not.toHaveBeenCalledWith("allocate_codes_to_staff_v1", expect.anything());
    expect(getSupabase().rpc).not.toHaveBeenCalledWith("allocate_codes_to_coach", expect.anything());
  });
});
