import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { getSupabase } from "../lib/supabase";
import { STORAGE_KEY, todayKey } from "../utils/checkin";

function renderCheckIn(entry = "/check-in?code=JH-EL-AB23") {
  return render(<MemoryRouter initialEntries={[entry]}><App /></MemoryRouter>);
}

describe("打卡页产品码激活", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
    (getSupabase().auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: { user: { id: "anonymous-uid", email: null } } },
    });
  });

  it("从 URL Query 自动填入产品码并调用激活 RPC", async () => {
    (getSupabase().rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { ok: true, state: "active", replayed: false }, error: null,
    });
    const user = userEvent.setup();
    renderCheckIn();

    expect(screen.getByLabelText("产品激活码")).toHaveValue("JH-EL-AB23");
    await user.click(screen.getByRole("button", { name: "激活产品码" }));

    expect(await screen.findByText("激活成功，已为你绑定教练。")).toBeInTheDocument();
    expect(getSupabase().rpc).toHaveBeenCalledWith("activate_box_code", {
      p_code: "JH-EL-AB23",
      p_idempotency_key: expect.any(String),
    });
  });

  it("激活成功不弹强制邮箱窗口，并静默同步云端", async () => {
    (getSupabase().rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { ok: true, state: "active", replayed: false }, error: null,
    });
    const user = userEvent.setup();
    renderCheckIn();

    await user.click(screen.getByRole("button", { name: "激活产品码" }));
    expect(await screen.findByText("激活成功，已为你绑定教练。")).toBeInTheDocument();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(getSupabase().auth.updateUser).not.toHaveBeenCalled();
    const query = getSupabase().from("checkin_sync") as unknown as { insert: ReturnType<typeof vi.fn> };
    expect(query.insert).toHaveBeenCalled();
  });

  it("激活后的匿名营员保存打卡时不再被强制绑邮箱", async () => {
    (getSupabase().rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { ok: true, state: "active", replayed: false }, error: null,
    });
    const user = userEvent.setup();
    renderCheckIn();

    await user.click(screen.getByRole("button", { name: "激活产品码" }));
    await screen.findByText("激活成功，已为你绑定教练。");
    await user.type(screen.getByLabelText("早晨体重（空腹）"), "68");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const state = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(state.records[todayKey()].weights.morning).toBe("68");
  });

  it("非法产品码在前端拦截，不消耗服务端激活尝试", async () => {
    const user = userEvent.setup();
    renderCheckIn("/check-in?code=invalid");

    await user.click(screen.getByRole("button", { name: "激活产品码" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("请输入有效的产品激活码。");
    expect(getSupabase().rpc).not.toHaveBeenCalled();
  });

  it("服务端防爆破错误原样映射为友好提示", async () => {
    (getSupabase().rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { ok: false, errorCode: "TOO_MANY_ATTEMPTS" }, error: null,
    });
    const user = userEvent.setup();
    renderCheckIn();

    await user.click(screen.getByRole("button", { name: "激活产品码" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("尝试次数过多，请稍后再试。");
    expect(screen.queryByText("激活成功，已为你绑定教练。")).not.toBeInTheDocument();
  });
});
