import { act, fireEvent, render, screen } from "@testing-library/react";
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

function mockPendingReview() {
  (getSupabase().rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { ok: true, state: "pending_review", replayed: false }, error: null,
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
  });

  it("从 URL Query 填入产品码，提交后只进入 pending_review", async () => {
    mockPendingReview();
    const user = userEvent.setup();
    renderCheckIn();

    expect(screen.getByLabelText("产品激活码")).toHaveValue("JH-EL-AB23");
    await user.click(screen.getByRole("button", { name: "提交激活审核" }));

    expect((await screen.findAllByText("审核中，暂不能打卡")).length).toBeGreaterThan(0);
    expect(getSupabase().rpc).toHaveBeenCalledWith("request_box_code_activation", {
      p_code: "JH-EL-AB23",
      p_idempotency_key: expect.any(String),
    });
    expect(getSupabase().rpc).not.toHaveBeenCalledWith("activate_box_code", expect.anything());
  });

  it("待审核不弹强制邮箱窗口，也不写入已激活标记", async () => {
    mockPendingReview();
    const user = userEvent.setup();
    renderCheckIn();

    await user.click(screen.getByRole("button", { name: "提交激活审核" }));
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

    await user.click(screen.getByRole("button", { name: "提交激活审核" }));
    await screen.findAllByText("审核中，暂不能打卡");

    expect(screen.getByLabelText("早晨体重（空腹）")).toBeDisabled();
    expect(screen.getByLabelText("开营日期")).toBeDisabled();
    const state = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(state.records?.[todayKey()]?.weights?.morning).toBeUndefined();
  });

  it("非法产品码在前端拦截，不消耗服务端申请尝试", async () => {
    const user = userEvent.setup();
    renderCheckIn("/check-in?code=invalid");

    await user.click(screen.getByRole("button", { name: "提交激活审核" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("请输入有效的产品激活码。");
    expect(getSupabase().rpc).not.toHaveBeenCalled();
  });

  it("服务端防爆破错误原样映射为友好提示", async () => {
    (getSupabase().rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { ok: false, errorCode: "TOO_MANY_ATTEMPTS" }, error: null,
    });
    const user = userEvent.setup();
    renderCheckIn();

    await user.click(screen.getByRole("button", { name: "提交激活审核" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("尝试次数过多，请稍后再试。");
    expect(screen.queryByText("审核中，暂不能打卡")).not.toBeInTheDocument();
    expect(screen.getByLabelText("产品激活码")).toHaveValue("JH-EL-AB23");
    expect(screen.getByRole("button", { name: "提交激活审核" })).toBeEnabled();
  });

  it("初次加载读取本机待审核标记并隐藏申请表单", async () => {
    window.localStorage.setItem("junheng-box-code-pending-review-v1", "true");
    renderCheckIn("/check-in");

    expect((await screen.findAllByText("审核中，暂不能打卡")).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("产品激活码")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "提交激活审核" })).not.toBeInTheDocument();
    expect(getSupabase().rpc).not.toHaveBeenCalledWith("request_box_code_activation", expect.anything());
  });

  it("待审核用户携带 Query 时清除 code 且不重复申请", async () => {
    window.localStorage.setItem("junheng-box-code-pending-review-v1", "true");
    renderCheckIn();

    await screen.findAllByText("审核中，暂不能打卡");
    expect(screen.getByTestId("activation-search-params").textContent).toBe("");
    expect(screen.queryByLabelText("产品激活码")).not.toBeInTheDocument();
    expect(getSupabase().rpc).not.toHaveBeenCalledWith("request_box_code_activation", expect.anything());
  });

  it("提交审核后刷新仍恢复待审核状态", async () => {
    mockPendingReview();
    const user = userEvent.setup();
    const firstRender = renderCheckIn();

    await user.click(screen.getByRole("button", { name: "提交激活审核" }));
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
    rpc.mockReturnValue(pending);
    renderCheckIn();

    const input = screen.getByLabelText("产品激活码");
    const button = screen.getByRole("button", { name: "提交激活审核" });
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
    renderCheckIn("/check-in");

    expect(await screen.findByText("已绑定专属教练")).toBeInTheDocument();
    expect(screen.queryByText("审核中，暂不能打卡")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("产品激活码")).not.toBeInTheDocument();
  });
});
