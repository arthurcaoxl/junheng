import { StrictMode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CheckInPage from "../pages/CheckInPage";
import { fetchMyActivationStatus, type MyActivationStatus } from "../services/boxCodeActivation";

vi.mock("../services/boxCodeActivation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/boxCodeActivation")>();
  return { ...actual, fetchMyActivationStatus: vi.fn() };
});

vi.mock("../components/SevenDayCheckIn", () => ({
  SevenDayCheckIn: () => <div data-testid="seven-day-check-in">DAY 01–DAY 09</div>,
}));

vi.mock("../components/SyncPanel", () => ({
  SyncPanel: () => <div data-testid="sync-panel">跨设备同步</div>,
}));

const mockedFetchStatus = vi.mocked(fetchMyActivationStatus);

function status(state: MyActivationStatus["state"]): MyActivationStatus {
  return {
    state,
    requestedAt: state === "none" ? null : "2026-11-11T01:00:00Z",
    rejectionHint: state === "rejected" ? "contact_coach" : null,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function renderPage(strict = false) {
  const page = <MemoryRouter><CheckInPage /></MemoryRouter>;
  return render(strict ? <StrictMode>{page}</StrictMode> : page);
}

describe("CheckInPage 服务端激活状态守卫", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it("RPC 返回前只显示 Loading，不渲染日历或输码表单，并保留同步能力", async () => {
    const request = deferred<MyActivationStatus>();
    mockedFetchStatus.mockResolvedValue(status("none")).mockReturnValueOnce(request.promise);
    renderPage();

    expect(screen.getByRole("status")).toHaveTextContent("正在确认打卡权限");
    expect(screen.getByRole("status").closest(".sync-panel")).not.toBeNull();
    expect(screen.queryByTestId("seven-day-check-in")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("产品激活码")).not.toBeInTheDocument();
    expect(screen.getByTestId("sync-panel")).toBeInTheDocument();
    expect(mockedFetchStatus).toHaveBeenCalledTimes(1);

    await act(async () => request.resolve(status("none")));
    expect(await screen.findByLabelText("产品激活码")).toBeInTheDocument();
  });

  it("只有服务端 active 才渲染打卡日历", async () => {
    mockedFetchStatus.mockResolvedValue(status("active"));
    renderPage();

    expect(await screen.findByTestId("seven-day-check-in")).toBeInTheDocument();
    expect(await screen.findByText("已绑定专属教练")).toBeInTheDocument();
    expect(screen.queryByLabelText("产品激活码")).not.toBeInTheDocument();
    expect(screen.getByTestId("sync-panel")).toBeInTheDocument();
  });

  it("本机激活标记不能绕过服务端 none 状态", async () => {
    window.localStorage.setItem("junheng-box-code-activated-v1", "true");
    mockedFetchStatus.mockResolvedValue(status("none"));
    renderPage();

    expect(await screen.findByLabelText("产品激活码")).toBeInTheDocument();
    expect(screen.queryByTestId("seven-day-check-in")).not.toBeInTheDocument();
  });

  it("rejected 显示输码表单和联系教练提示，不渲染日历", async () => {
    mockedFetchStatus.mockResolvedValue(status("rejected"));
    renderPage();

    expect(await screen.findByLabelText("产品激活码")).toBeInTheDocument();
    expect(await screen.findByText("未通过，请联系教练")).toBeInTheDocument();
    expect(screen.queryByTestId("seven-day-check-in")).not.toBeInTheDocument();
  });

  it("pending_review 只显示审核中，不渲染日历或输码表单", async () => {
    mockedFetchStatus.mockResolvedValue(status("pending_review"));
    renderPage();

    expect(await screen.findByText("审核中，暂不能打卡")).toBeInTheDocument();
    expect(screen.queryByTestId("seven-day-check-in")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("产品激活码")).not.toBeInTheDocument();
  });

  it("读取异常显示重试态，重试成功后才按新状态放行", async () => {
    const user = userEvent.setup();
    mockedFetchStatus.mockRejectedValueOnce(new Error("网络异常")).mockResolvedValue(status("active"));
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("网络异常");
    expect(screen.queryByTestId("seven-day-check-in")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("产品激活码")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByTestId("seven-day-check-in")).toBeInTheDocument();
    expect(mockedFetchStatus).toHaveBeenCalledTimes(3);
  });

  it("组件卸载后迟到的 active 响应不会触发状态更新", async () => {
    const request = deferred<MyActivationStatus>();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockedFetchStatus.mockReturnValueOnce(request.promise);
    const view = renderPage();

    view.unmount();
    await act(async () => request.resolve(status("active")));

    expect(consoleError).not.toHaveBeenCalled();
    expect(screen.queryByTestId("seven-day-check-in")).not.toBeInTheDocument();
    consoleError.mockRestore();
  });

  it("StrictMode 竞态下迟到的 active 响应不能覆盖较新的 none", async () => {
    const stale = deferred<MyActivationStatus>();
    const latest = deferred<MyActivationStatus>();
    mockedFetchStatus
      .mockReturnValueOnce(stale.promise)
      .mockReturnValueOnce(latest.promise)
      .mockResolvedValue(status("none"));
    renderPage(true);

    expect(mockedFetchStatus).toHaveBeenCalledTimes(2);
    await act(async () => latest.resolve(status("none")));
    expect(await screen.findByLabelText("产品激活码")).toBeInTheDocument();

    await act(async () => stale.resolve(status("active")));
    await waitFor(() => expect(screen.queryByTestId("seven-day-check-in")).not.toBeInTheDocument());
    expect(screen.getByLabelText("产品激活码")).toBeInTheDocument();
  });
});
