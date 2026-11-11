import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useSearchParams } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { getSupabase } from "../lib/supabase";
import { STORAGE_KEY, todayKey } from "../utils/checkin";

function SearchParamsProbe() {
  const [searchParams] = useSearchParams();
  return <div data-testid="activation-search-params">{searchParams.toString()}</div>;
}

function renderCheckIn(entry = "/check-in?code=JH-EL-AB23") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <App />
      <SearchParamsProbe />
    </MemoryRouter>,
  );
}

async function waitForActivationForm() {
  const input = await screen.findByLabelText("产品激活码");
  const button = screen.getByRole("button", { name: "提交激活审核" });
  await waitFor(() => expect(button).toBeEnabled());
  return { input, button };
}

type ServerActivationState = "none" | "pending_review" | "active" | "rejected";

function activationStatus(state: ServerActivationState) {
  return { state, requested_at: state === "none" ? null : "2026-11-09T01:00:00Z", rejection_hint: null };
}

function mockActivationRead(state: ServerActivationState) {
  (getSupabase().rpc as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
    if (name === "get_my_activation_status") return Promise.resolve({ data: activationStatus(state), error: null });
    return Promise.resolve({ data: [], error: null });
  });
}

function mockPendingReview() {
  let serverState: ServerActivationState = "none";
  (getSupabase().rpc as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
    if (name === "get_my_activation_status") return Promise.resolve({ data: activationStatus(serverState), error: null });
    if (name === "request_box_code_activation") {
      serverState = "pending_review";
      return Promise.resolve({ data: { ok: true, state: "pending_review", replayed: false }, error: null });
    }
    return Promise.resolve({ data: [], error: null });
  });
}

describe("打卡页产品码人工审核申请", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
    (getSupabase().auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: { user: { id: "anonymous-uid", email: null } } },
    });
    mockActivationRead("none");
  });

  it("从 URL Query 填入产品码，提交后只进入 pending_review", async () => {
    mockPendingReview();
    const user = userEvent.setup();
    renderCheckIn();

    const { input, button } = await waitForActivationForm();
    expect(input).toHaveValue("JH-EL-AB23");
    await user.click(button);

    expect((await screen.findAllByText("审核中，暂不能打卡")).length).toBeGreaterThan(0);
    const deviceHash = window.localStorage.getItem("junheng-device-fingerprint-v1");
    expect(deviceHash).not.toBeNull();
    expect(deviceHash as string).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(getSupabase().rpc).toHaveBeenCalledWith("request_box_code_activation", {
      p_code: "JH-EL-AB23",
      p_idempotency_key: expect.any(String),
      p_device_hash: deviceHash,
    });
    expect(getSupabase().rpc).not.toHaveBeenCalledWith("activate_box_code", expect.anything());
  });

  it("待审核不弹强制邮箱窗口，也不写入已激活标记", async () => {
    mockPendingReview();
    const user = userEvent.setup();
    renderCheckIn();

    const { button } = await waitForActivationForm();
    await user.click(button);
    await screen.findAllByText("审核中，暂不能打卡");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(getSupabase().auth.updateUser).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("junheng-box-code-activated-v1")).not.toBe("true");
    expect(window.localStorage.getItem("junheng-box-code-pending-review-v1")).toBe("true");
    expect(getSupabase().from).toHaveBeenCalledWith("checkin_sync");
  });

  it("审核中禁用打卡输入，不产生本地打卡记录", async () => {
    mockPendingReview();
    const user = userEvent.setup();
    renderCheckIn();

    const { button } = await waitForActivationForm();
    await user.click(button);
    await screen.findAllByText("审核中，暂不能打卡");

    expect(screen.queryByLabelText("早晨体重（空腹）")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("开营日期")).not.toBeInTheDocument();
    const state = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(state.records?.[todayKey()]?.weights?.morning).toBeUndefined();
  });

  it("非法产品码在前端拦截，不消耗服务端申请尝试", async () => {
    const user = userEvent.setup();
    renderCheckIn("/check-in?code=invalid");

    const { button } = await waitForActivationForm();
    await user.click(button);

    expect(await screen.findByRole("alert")).toHaveTextContent("请输入有效的产品激活码。");
    expect(getSupabase().rpc).not.toHaveBeenCalledWith("request_box_code_activation", expect.anything());
  });

  it("服务端防爆破错误原样映射为友好提示", async () => {
    (getSupabase().rpc as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
      if (name === "get_my_activation_status") return Promise.resolve({ data: activationStatus("none"), error: null });
      if (name === "request_box_code_activation") return Promise.resolve({ data: { ok: false, errorCode: "TOO_MANY_ATTEMPTS" }, error: null });
      return Promise.resolve({ data: [], error: null });
    });
    const user = userEvent.setup();
    renderCheckIn();

    const { button } = await waitForActivationForm();
    await user.click(button);

    expect(await screen.findByRole("alert")).toHaveTextContent("尝试次数过多，请稍后再试。");
    expect(screen.queryByText("审核中，暂不能打卡")).not.toBeInTheDocument();
    expect(screen.getByLabelText("产品激活码")).toHaveValue("JH-EL-AB23");
    expect(screen.getByRole("button", { name: "提交激活审核" })).toBeEnabled();
  });

  it("初次加载读取本机待审核标记并隐藏申请表单", async () => {
    window.localStorage.setItem("junheng-box-code-pending-review-v1", "true");
    mockActivationRead("pending_review");
    renderCheckIn("/check-in");

    expect((await screen.findAllByText("审核中，暂不能打卡")).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("产品激活码")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "提交激活审核" })).not.toBeInTheDocument();
    expect(getSupabase().rpc).not.toHaveBeenCalledWith("request_box_code_activation", expect.anything());
  });

  it("待审核用户携带 Query 时清除 code 且不重复申请", async () => {
    window.localStorage.setItem("junheng-box-code-pending-review-v1", "true");
    mockActivationRead("pending_review");
    renderCheckIn();

    await screen.findAllByText("审核中，暂不能打卡");
    await waitFor(() => expect(screen.getByTestId("activation-search-params").textContent).toBe(""));
    expect(screen.queryByLabelText("产品激活码")).not.toBeInTheDocument();
    expect(getSupabase().rpc).not.toHaveBeenCalledWith("request_box_code_activation", expect.anything());
  });

  it("提交审核后刷新仍恢复待审核状态", async () => {
    mockPendingReview();
    const user = userEvent.setup();
    const firstRender = renderCheckIn();

    const { button } = await waitForActivationForm();
    await user.click(button);
    await screen.findAllByText("审核中，暂不能打卡");
    expect(screen.queryByLabelText("产品激活码")).not.toBeInTheDocument();

    firstRender.unmount();
    renderCheckIn("/check-in");
    expect((await screen.findAllByText("审核中，暂不能打卡")).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("产品激活码")).not.toBeInTheDocument();
  });

  it("申请提交中重复 submit 只产生一次 RPC", async () => {
    const rpc = getSupabase().rpc as ReturnType<typeof vi.fn>;
    let resolveRequest!: (result: { data: unknown; error: null }) => void;
    const pending = new Promise<{ data: unknown; error: null }>((resolve) => { resolveRequest = resolve; });
    rpc.mockImplementation((name: string) => {
      if (name === "get_my_activation_status") return Promise.resolve({ data: activationStatus("none"), error: null });
      if (name === "request_box_code_activation") return pending;
      return Promise.resolve({ data: [], error: null });
    });
    renderCheckIn();

    const { input, button } = await waitForActivationForm();
    const form = button.closest("form");
    expect(form).not.toBeNull();
    act(() => {
      fireEvent.submit(form!);
      fireEvent.submit(form!);
    });

    expect(input).toBeDisabled();
    expect(button).toBeDisabled();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const requestCalls = rpc.mock.calls.filter(([name]) => name === "request_box_code_activation");
    resolveRequest({ data: { ok: true, state: "pending_review", replayed: false }, error: null });
    expect(requestCalls).toHaveLength(1);
  });

  it("既有已激活用户仍显示绑定状态且不退回审核", async () => {
    window.localStorage.setItem("junheng-box-code-activated-v1", "true");
    mockActivationRead("active");
    renderCheckIn("/check-in");

    expect(await screen.findByText("已绑定专属教练")).toBeInTheDocument();
    expect(screen.queryByText("审核中，暂不能打卡")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("产品激活码")).not.toBeInTheDocument();
  });
});
