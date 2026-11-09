import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminCodePool from "../components/admin/AdminCodePool";
import { getSupabase } from "../lib/supabase";

describe("Admin 产品激活码库防呆与教练搜索", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
    (getSupabase().rpc as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
      if (name === "admin_get_coach_directory") return Promise.resolve({
        data: [{
          coach_id: "11111111-1111-4111-8111-111111111111",
          email: "alice@example.com",
          name: "爱丽丝",
          phone: "13800000000",
        }],
        error: null,
      });
      if (name === "generate_platform_codes") return Promise.resolve({ data: { generatedCount: 24 }, error: null });
      if (name === "allocate_codes_to_coach") return Promise.resolve({ data: { allocatedCount: 2 }, error: null });
      return Promise.resolve({ data: [], error: null });
    });
  });

  it("盒规格只允许 21 袋或 30 袋并保留 TEST 激活码审批号", async () => {
    const user = userEvent.setup();
    render(<AdminCodePool />);

    const spec = screen.getByLabelText("盒规格");
    expect(spec.tagName).toBe("SELECT");
    expect(screen.getByRole("option", { name: "21袋" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "30袋" })).toBeInTheDocument();
    await user.selectOptions(spec, "21_bags");
    await user.type(screen.getByLabelText("生成数量"), "24");
    await user.type(screen.getByLabelText("激活码审批号"), "TEST");
    await user.click(screen.getByRole("button", { name: "批量生成码" }));

    expect(getSupabase().rpc).toHaveBeenCalledWith("generate_platform_codes", {
      p_count: 24,
      p_box_spec: "21_bags",
      p_offline_receipt_no: "TEST",
    });
  });

  it("划拨云仓不再手填 UUID，邮箱选中后自动提交 coach_id", async () => {
    const user = userEvent.setup();
    render(<AdminCodePool />);

    expect(screen.queryByLabelText("教练用户 ID")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("划拨教练邮箱"), "ali");
    await user.click(await screen.findByRole("option", { name: /alice@example\.com.*爱丽丝.*13800000000/ }));
    await user.type(screen.getByLabelText("划拨数量"), "2");
    await user.click(screen.getByRole("button", { name: "划拨给教练" }));

    expect(getSupabase().rpc).toHaveBeenCalledWith("admin_get_coach_directory", { p_query: "ali" });
    expect(getSupabase().rpc).toHaveBeenCalledWith("allocate_codes_to_coach", {
      p_coach_id: "11111111-1111-4111-8111-111111111111",
      p_count: 2,
    });
  });
});
