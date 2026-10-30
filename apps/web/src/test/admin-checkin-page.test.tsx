import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { getSupabase } from "../lib/supabase";

function renderAdmin() {
  return render(<MemoryRouter initialEntries={["/admin/check-in"]}><App /></MemoryRouter>);
}

describe("admin check-in page", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("logs in with email OTP and lists campers without exposing internal UID", async () => {
    const user = userEvent.setup();
    const client = getSupabase();
    (client.rpc as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: [{
        auth_user_id: "private-uid-1",
        email: "camper@example.com",
        user_code: "JH-ADMIN1",
        start_date: "2026-10-01",
        records: {
          "2026-10-01": { weight: "80", waist: "", meals: [true, false, false], water: true, movement: false, sleep: false },
          "2026-10-02": { weight: "", waist: "", meals: [false, false, false], water: false, movement: true, sleep: false },
        },
        updated_at: "2026-10-30T10:00:00.000Z",
      }],
      error: null,
    });
    renderAdmin();

    await user.type(screen.getByLabelText("管理员邮箱"), "admin@example.com");
    await user.click(screen.getByRole("button", { name: "获取管理员验证码" }));
    await user.type(await screen.findByLabelText("邮箱验证码"), "123456");
    await user.click(screen.getByRole("button", { name: "登录并查看统计" }));

    expect(await screen.findByText("打卡统计管理")).toBeInTheDocument();
    expect(screen.getByText("JH-ADMIN1")).toBeInTheDocument();
    expect(screen.getByText("camper@example.com")).toBeInTheDocument();
    expect(screen.getByText("2 天")).toBeInTheDocument();
    expect(screen.getByText("D21")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导出脱敏 CSV" })).toBeEnabled();
    expect(screen.queryByText(/private-uid/)).not.toBeInTheDocument();
    expect(client.auth.verifyOtp).toHaveBeenCalledWith({ email: "admin@example.com", token: "123456", type: "email" });
    expect(client.rpc).toHaveBeenCalledWith("admin_checkin_overview");
  });

  it("shows a friendly whitelist error for a non-admin email", async () => {
    const user = userEvent.setup();
    const client = getSupabase();
    (client.rpc as ReturnType<typeof vi.fn>).mockRejectedValueOnce({ code: "P0001", message: "当前邮箱不是管理员" });
    renderAdmin();

    await user.type(screen.getByLabelText("管理员邮箱"), "outside@example.com");
    await user.click(screen.getByRole("button", { name: "获取管理员验证码" }));
    await user.type(await screen.findByLabelText("邮箱验证码"), "123456");
    await user.click(screen.getByRole("button", { name: "登录并查看统计" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/没有管理员权限/);
    expect(screen.queryByText("打卡统计管理")).toBeInTheDocument();
    expect(screen.queryByText("JH-ADMIN1")).not.toBeInTheDocument();
  });
});
