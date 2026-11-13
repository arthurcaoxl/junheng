import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { getSupabase } from "../lib/supabase";
import { fetchMyActivationStatus } from "../services/boxCodeActivation";
import { flushSyncToCloud } from "../services/checkinSync";
import { addDays, emptyDay, STORAGE_KEY, todayKey } from "../utils/checkin";

vi.mock("../services/boxCodeActivation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/boxCodeActivation")>();
  return { ...actual, fetchMyActivationStatus: vi.fn() };
});

beforeEach(() => {
  vi.mocked(fetchMyActivationStatus).mockResolvedValue({ state: "active", requestedAt: null, rejectionHint: null });
});

async function renderCheckIn() {
  const view = render(<MemoryRouter initialEntries={["/check-in"]}><App /></MemoryRouter>);
  await screen.findByRole("region", { name: "21 天，构建你的脂代谢稳态。" });
  return view;
}

function savedToday() {
  const state = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
  return state.records?.[todayKey()];
}

describe("保存打卡强制登录", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem("junheng-consent", "true");
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
    // 匿名会话已经有 uid，但没有邮箱，仍必须被识别为未登录。
    (getSupabase().auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: { user: { id: "anonymous-uid", email: null } } },
    });
  });

  it("匿名 uid 存在时仍拦截保存，取消 OTP 后本地没有新增打卡", async () => {
    const user = userEvent.setup();
    await renderCheckIn();

    await user.type(screen.getByLabelText("早晨体重（空腹）"), "68");

    expect(screen.getByRole("dialog", { name: "绑定邮箱，换手机/电脑接着打卡" })).toBeInTheDocument();
    expect(savedToday()).toBeUndefined();
    await user.click(screen.getByRole("button", { name: "关闭" }));
    expect(savedToday()).toBeUndefined();
  });

  it("OTP 成功后只恢复一次 pendingSave，保存完整输入且不产生重复记录", async () => {
    const user = userEvent.setup();
    await renderCheckIn();
    const input = screen.getByLabelText("早晨体重（空腹）");

    await user.type(input, "68");
    expect(input).toHaveValue(68);
    expect(savedToday()).toBeUndefined();

    await user.type(screen.getByLabelText("邮箱地址"), "save@example.com");
    // 新增：勾选协议
    await user.click(screen.getByRole("checkbox", { name: /我已阅读并同意/ }));
    // 修改：统一按钮名正则
    await user.click(screen.getByRole("button", { name: /^(获取验证码|完成绑定|登录恢复)$/ }));
    
    await user.type(await screen.findByLabelText("邮箱验证码"), "123456");
    await user.click(screen.getByRole("button", { name: "完成绑定" }));

    expect(await screen.findByText(/已绑定邮箱：save@example.com/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(savedToday().weights.morning).toBe("68");
    expect(savedToday().weight).toBe("67.5");
    expect(getSupabase().auth.verifyOtp).toHaveBeenCalledTimes(1);
    const state = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(Object.keys(state.records)).toEqual([todayKey()]);
  });

  it("首次保存进入既有同步路径，上传新记录且不丢失云端已有日期", async () => {
    const today = todayKey();
    const yesterday = addDays(today, -1);
    const cloudDay = { ...emptyDay(), weight: "61" };
    const query = getSupabase().from("checkin_sync") as unknown as {
      maybeSingle: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      insert: ReturnType<typeof vi.fn>;
    };
    query.maybeSingle.mockResolvedValue({
      data: { user_code: "JH-CLOUD", start_date: today, records: { [yesterday]: cloudDay } },
      error: null,
    });
    const user = userEvent.setup();
    await renderCheckIn();

    await user.type(screen.getByLabelText("早晨体重（空腹）"), "68");
    await user.type(screen.getByLabelText("邮箱地址"), "first-save@example.com");
    // 新增：勾选协议
    await user.click(screen.getByRole("checkbox", { name: /我已阅读并同意/ }));
    // 修改：统一按钮名正则
    await user.click(screen.getByRole("button", { name: /^(获取验证码|完成绑定|登录恢复)$/ }));
    
    await user.type(await screen.findByLabelText("邮箱验证码"), "123456");
    await user.click(screen.getByRole("button", { name: "完成绑定" }));

    expect(await screen.findByText(/已绑定邮箱：first-save@example.com/)).toBeInTheDocument();
    expect(savedToday().weights.morning).toBe("68");
    await flushSyncToCloud();

    expect(query.insert).not.toHaveBeenCalled();
    expect(query.update).toHaveBeenCalledTimes(1);
    const [payload] = query.update.mock.calls[0];
    expect(payload.records[yesterday]).toEqual(cloudDay);
    expect(payload.records[today].weights.morning).toBe("68");
    await expect(flushSyncToCloud()).resolves.toBe("noop");
    expect(query.update).toHaveBeenCalledTimes(1);
  });

  it("已完成 OTP 的用户保存时不重复弹窗", async () => {
    (getSupabase().auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: { user: { id: "bound-uid", email: "bound@example.com" } } },
    });
    const user = userEvent.setup();
    await renderCheckIn();
    await screen.findByText(/已绑定邮箱：bound@example.com/);

    await user.type(screen.getByLabelText("早晨体重（空腹）"), "67");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(savedToday().weights.morning).toBe("67");
  });
});