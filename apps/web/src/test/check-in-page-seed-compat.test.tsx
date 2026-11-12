import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CheckInPage from "../pages/CheckInPage";
import { getSupabase } from "../lib/supabase";

const ACTIVATED_KEY = "junheng-box-code-activated-v1";
const PENDING_KEY = "junheng-box-code-pending-review-v1";
const requestedAt = "2026-11-01T01:02:03Z";

type RpcResult = { data: unknown; error: unknown };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function legacyStatus(source: "whitelist" | "runtime"): RpcResult {
  return {
    data: {
      state: "legacy_granted",
      source,
      requested_at: null,
      rejection_hint: null,
    },
    error: null,
  };
}

function legacyStateStatus(
  state: "none" | "pending_review" | "active" | "rejected",
): RpcResult {
  return {
    data: {
      state,
      requested_at: state === "none" ? null : requestedAt,
      rejection_hint: state === "rejected" ? "contact_coach" : null,
      // 旧服务端响应 deliberately 不带 source，前端必须继续兼容。
    },
    error: null,
  };
}

function rpcMock() {
  return getSupabase().rpc as ReturnType<typeof vi.fn>;
}

function mockStatusSequence(...results: Array<RpcResult | Promise<RpcResult>>) {
  const mock = rpcMock();
  for (const result of results) {
    if (result instanceof Promise) mock.mockReturnValueOnce(result);
    else mock.mockResolvedValueOnce(result);
  }
  mock.mockImplementation((name: string) => {
    if (name === "get_checkin_quota") {
      return Promise.resolve({
        data: {
          ok: true,
          maxCheckins: 21,
          usedCheckins: 4,
          remainingCheckins: 17,
          boxSpec: "21_bags",
        },
        error: null,
      });
    }
    return Promise.resolve({ data: null, error: { message: `unexpected RPC: ${name}` } });
  });
}

function renderPage() {
  return render(<MemoryRouter><CheckInPage /></MemoryRouter>);
}

function expectNoActivationForm() {
  expect(screen.queryByLabelText("产品激活码")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "提交激活审核" })).not.toBeInTheDocument();
}

function expectCalendar() {
  expect(screen.getByRole("tablist", { name: "21 天打卡日期" })).toBeInTheDocument();
  expect(screen.getByRole("tabpanel")).toBeInTheDocument();
}

describe("CheckInPage 种子激活兼容（仅拦截 Supabase RPC）", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
    rpcMock().mockReset();
  });

  it.each(["whitelist", "runtime"] as const)(
    "%s legacy_granted 渲染真实日历，不伪造盒码绑定也不读取盒码额度",
    async (source) => {
      window.localStorage.setItem(ACTIVATED_KEY, "true");
      window.localStorage.setItem(PENDING_KEY, "true");
      mockStatusSequence(legacyStatus(source));
      renderPage();

      await waitFor(expectCalendar);
      expectNoActivationForm();
      expect(screen.queryByText("已绑定专属教练")).not.toBeInTheDocument();
      expect(screen.queryByText("审核中，暂不能打卡")).not.toBeInTheDocument();
      expect(window.localStorage.getItem(ACTIVATED_KEY)).toBeNull();
      expect(window.localStorage.getItem(PENDING_KEY)).toBeNull();
      expect(rpcMock()).toHaveBeenCalledTimes(1);
      expect(rpcMock()).toHaveBeenCalledWith("get_my_activation_status");
      expect(rpcMock()).not.toHaveBeenCalledWith("get_checkin_quota");
    },
  );

  it("RPC 返回前只显示权限 Loading，不提前渲染日历或输码入口", async () => {
    const request = deferred<RpcResult>();
    mockStatusSequence(request.promise);
    renderPage();

    expect(screen.getByRole("status")).toHaveTextContent("正在确认打卡权限");
    expect(screen.queryByRole("tablist", { name: "21 天打卡日期" })).not.toBeInTheDocument();
    expectNoActivationForm();

    await act(async () => request.resolve(legacyStatus("runtime")));
    await waitFor(expectCalendar);
  });

  it("旧四态 none 无 source 时显示可用输码表单并清除本机激活缓存", async () => {
    window.localStorage.setItem(ACTIVATED_KEY, "true");
    mockStatusSequence(legacyStateStatus("none"));
    renderPage();

    expect(await screen.findByLabelText("产品激活码")).toBeEnabled();
    expect(screen.queryByRole("tablist", { name: "21 天打卡日期" })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(ACTIVATED_KEY)).toBeNull();
    expect(window.localStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it("旧四态 pending_review 无 source 时只显示审核中并写入审核缓存", async () => {
    mockStatusSequence(legacyStateStatus("pending_review"));
    renderPage();

    expect(await screen.findByText("审核中，暂不能打卡")).toBeInTheDocument();
    expectNoActivationForm();
    expect(screen.queryByRole("tablist", { name: "21 天打卡日期" })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(ACTIVATED_KEY)).toBeNull();
    expect(window.localStorage.getItem(PENDING_KEY)).toBe("true");
  });

  it("旧四态 active 无 source 时渲染日历、真实绑定态和盒码额度", async () => {
    mockStatusSequence(legacyStateStatus("active"));
    renderPage();

    await waitFor(expectCalendar);
    expect(await screen.findByText("已绑定专属教练")).toBeInTheDocument();
    expect(await screen.findByText("剩余 17/21 次")).toBeInTheDocument();
    expectNoActivationForm();
    expect(window.localStorage.getItem(ACTIVATED_KEY)).toBe("true");
    expect(window.localStorage.getItem(PENDING_KEY)).toBeNull();
    expect(rpcMock()).toHaveBeenCalledWith("get_checkin_quota");
  });

  it("旧四态 rejected 无 source 时允许重新输码并显示通用联系提示", async () => {
    mockStatusSequence(legacyStateStatus("rejected"));
    renderPage();

    expect(await screen.findByText("未通过，请联系教练")).toBeInTheDocument();
    expect(screen.getByLabelText("产品激活码")).toBeEnabled();
    expect(screen.queryByRole("tablist", { name: "21 天打卡日期" })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(ACTIVATED_KEY)).toBeNull();
    expect(window.localStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it.each([
    ["网络 reject", () => Promise.reject(new Error("offline"))],
    ["HTTP 5xx", () => Promise.resolve({ data: null, error: { status: 500, message: "upstream failed" } })],
    ["非法响应", () => Promise.resolve({ data: { state: "legacy_granted", source: "forged", requested_at: null, rejection_hint: null }, error: null })],
  ])("%s 时 fail-closed，且不把失败写成 none 缓存", async (_label, result) => {
    window.localStorage.setItem(ACTIVATED_KEY, "true");
    window.localStorage.setItem(PENDING_KEY, "true");
    mockStatusSequence(result() as Promise<RpcResult>);
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("激活状态读取失败，请稍后重试。");
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
    expectNoActivationForm();
    expect(screen.queryByRole("tablist", { name: "21 天打卡日期" })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(ACTIVATED_KEY)).toBeNull();
    expect(window.localStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it("异常重试重新进入 Loading，成功后才按 runtime 状态放行", async () => {
    const user = userEvent.setup();
    const retryRequest = deferred<RpcResult>();
    mockStatusSequence(
      { data: null, error: { status: 503, message: "unavailable" } },
      retryRequest.promise,
    );
    renderPage();

    await user.click(await screen.findByRole("button", { name: "重试" }));
    expect(screen.getByRole("status")).toHaveTextContent("正在确认打卡权限");
    expectNoActivationForm();

    await act(async () => retryRequest.resolve(legacyStatus("runtime")));
    await waitFor(expectCalendar);
    expect(rpcMock()).toHaveBeenCalledTimes(2);
    expect(rpcMock()).not.toHaveBeenCalledWith("get_checkin_quota");
  });

  it("42501 显示重登而非重试，并通过真实同步面板打开恢复登录", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(ACTIVATED_KEY, "true");
    mockStatusSequence({ data: null, error: { code: "42501", message: "UNAUTHORIZED" } });
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("登录状态已失效，请重新登录。");
    expect(window.localStorage.getItem(ACTIVATED_KEY)).toBeNull();
    expect(screen.queryByRole("button", { name: "重试" })).not.toBeInTheDocument();
    expectNoActivationForm();

    await user.click(screen.getByRole("button", { name: "重新登录" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "恢复您的脂代谢档案" })).toBeInTheDocument();
    expect(screen.getByLabelText("邮箱地址")).toBeInTheDocument();
    expect(rpcMock()).toHaveBeenCalledTimes(1);
  });
});
