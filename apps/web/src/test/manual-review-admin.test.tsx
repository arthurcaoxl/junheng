import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminCheckInPage from "../pages/AdminCheckIn";
import { getSupabase } from "../lib/supabase";

const pendingReview = {
  activation_id: "activation-1",
  auth_user_id: "user-1",
  camper_code: "JH-REVIEW1",
  coach_id: "coach-1",
  code_id: "code-1",
  code_masked: "JH-EL-…AB23",
  code_type: "experience",
  shipment_verification_ref: null,
  payment_verification_ref: null,
  code_version: 2,
  activation_version: 1,
};

let loginSequence = 0;

async function login() {
  render(<MemoryRouter><AdminCheckInPage /></MemoryRouter>);
  const user = userEvent.setup();
  const email = `admin-${++loginSequence}@example.com`;
  await user.type(screen.getByLabelText("管理员邮箱"), email);
  await user.click(screen.getByRole("button", { name: "获取管理员验证码" }));
  await user.type(await screen.findByLabelText("邮箱验证码"), "123456");
  await user.click(screen.getByRole("button", { name: "登录并查看统计" }));
  const productionTab = await screen.findByRole("tab", { name: "生产调度" });
  await user.click(productionTab);
  return user;
}

describe("Admin 人工审核与休眠托管", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
    (getSupabase().auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { session: null } });
    (getSupabase().rpc as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
      if (name === "admin_get_pending_box_code_reviews") return Promise.resolve({ data: [pendingReview], error: null });
      if (name === "admin_get_dormant_coaches") return Promise.resolve({ data: [], error: null });
      if (name === "admin_get_coach_directory") return Promise.resolve({ data: [{ coach_id: "coach-1", email: "coach@example.com" }], error: null });
      if (name === "admin_review_box_code_activation_v2") return Promise.resolve({ data: { ok: true }, error: null });
      return Promise.resolve({ data: [], error: null });
    });
  });

  it("列出用户、脱数码和线下凭证，邮箱选教练后自动提交 UUID 审核", async () => {
    const user = await login();
    expect(await screen.findByText("JH-REVIEW1")).toBeInTheDocument();
    expect(screen.queryByText("coach-1")).not.toBeInTheDocument();
    expect(screen.getByText("JH-EL-…AB23")).toBeInTheDocument();
    expect(screen.getByText("待补录")).toBeInTheDocument();

    await user.type(screen.getByLabelText("发货凭证 JH-REVIEW1"), "SHIP-20261108-1");
    await user.type(screen.getByLabelText("审核教练邮箱 JH-REVIEW1"), "coach");
    await user.click(await screen.findByRole("option", { name: /coach@example\.com/ }));
    await user.click(screen.getByRole("button", { name: "通过并激活 JH-REVIEW1" }));

    expect(getSupabase().rpc).toHaveBeenCalledWith("admin_review_box_code_activation_v2", expect.objectContaining({
      p_activation_id: "activation-1",
      p_decision: "approved",
      p_target_coach_id: "coach-1",
      p_shipment_verification_ref: "SHIP-20261108-1",
      p_expected_code_version: 2,
      p_expected_activation_version: 1,
    }));
  });

  it("拒绝必须填写原因并调用退回 RPC", async () => {
    const user = await login();
    await screen.findByText("JH-REVIEW1");
    const reject = screen.getByRole("button", { name: "拒绝并退回 JH-REVIEW1" });
    await user.click(reject);
    expect(await screen.findByRole("alert")).toHaveTextContent("请填写拒绝原因");

    await user.type(screen.getByLabelText("拒绝原因 JH-REVIEW1"), "凭证与申请不符");
    await user.click(reject);
    expect(getSupabase().rpc).toHaveBeenCalledWith("admin_review_box_code_activation_v2", expect.objectContaining({
      p_activation_id: "activation-1",
      p_decision: "rejected",
      p_target_coach_id: "coach-1",
      p_rejection_reason_code: "凭证与申请不符",
    }));
  });

  it("一键批量托管休眠教练需人工确认并调用服务端 RPC", async () => {
    (getSupabase().rpc as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
      if (name === "admin_get_pending_box_code_reviews") return Promise.resolve({ data: [], error: null });
      if (name === "admin_get_dormant_coaches") {
        return Promise.resolve({ data: [{ coach_id: "dormant-coach-1", current_user_count: 3 }], error: null });
      }
      if (name === "admin_transfer_dormant_coaches") {
        return Promise.resolve({ data: { ok: true, transferredCount: 3, coachCount: 1 }, error: null });
      }
      return Promise.resolve({ data: [], error: null });
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = await login();

    expect(await screen.findByText(/dormant-coach-1/)).toBeInTheDocument();
    expect(screen.getByText(/3 名用户/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "一键托管全部休眠教练" }));

    expect(window.confirm).toHaveBeenCalled();
    expect(getSupabase().rpc).toHaveBeenCalledWith("admin_transfer_dormant_coaches", { p_confirmed: true });
    expect(await screen.findByText("已托管 1 名休眠教练的 3 名用户，审计流水已写入。")).toBeInTheDocument();
  });
});
