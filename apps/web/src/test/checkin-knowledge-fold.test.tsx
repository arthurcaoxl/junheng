import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { fetchMyActivationStatus } from "../services/boxCodeActivation";
import { addDays, todayKey } from "../utils/checkin";

vi.mock("../services/boxCodeActivation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/boxCodeActivation")>();
  return { ...actual, fetchMyActivationStatus: vi.fn() };
});

function setCampStart(offsetDays: number) {
  const checkIn = screen.getByRole("region", { name: "21 天，构建你的脂代谢稳态。" });
  fireEvent.change(within(checkIn).getByLabelText("开营日期"), { target: { value: addDays(todayKey(), offsetDays) } });
  return checkIn;
}

async function renderCheckIn() {
  const view = render(<MemoryRouter initialEntries={["/check-in"]}><App /></MemoryRouter>);
  await screen.findByRole("region", { name: "21 天，构建你的脂代谢稳态。" });
  return view;
}

describe("打卡页科普内容按天数渐进式折叠", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem("junheng-consent", "true");
    // 本文件只验证前台展示，不接入真实 Supabase。
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
    vi.mocked(fetchMyActivationStatus).mockResolvedValue({ state: "active", requestedAt: null, rejectionHint: null });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("第 1 天：科普标题直接可见，且没有折叠按钮", async () => {
    await renderCheckIn();
    const checkIn = setCampStart(0);
    expect(within(checkIn).getByRole("heading", { name: "水分是体重波动的关键" })).toBeVisible();
    expect(within(checkIn).queryByRole("button", { name: /揭秘：你的体重为何早晚差2公斤？/ })).not.toBeInTheDocument();
  });

  it("第 3 天：科普默认折叠，存在 aria-expanded=false 的展开按钮", async () => {
    await renderCheckIn();
    const checkIn = setCampStart(-2);
    expect(within(checkIn).getByRole("heading", { name: "水分是体重波动的关键", hidden: true })).not.toBeVisible();
    const toggle = within(checkIn).getByRole("button", { name: /揭秘：你的体重为何早晚差2公斤？/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("第 3 天：点击展开按钮后科普重新可见", async () => {
    const user = userEvent.setup();
    await renderCheckIn();
    const checkIn = setCampStart(-2);
    await user.click(within(checkIn).getByRole("button", { name: /揭秘：你的体重为何早晚差2公斤？/ }));
    expect(within(checkIn).getByRole("button", { name: /收起：你的体重为何早晚差2公斤？/ })).toHaveAttribute("aria-expanded", "true");
    expect(within(checkIn).getByRole("heading", { name: "水分是体重波动的关键" })).toBeVisible();
  });

  it("第 1 天标题为建立初始基线，第 2 天起改为记录今日体重与腰围", async () => {
    const first = await renderCheckIn();
    const firstDay = setCampStart(0);
    expect(within(firstDay).getByRole("heading", { name: "建立你的初始基线" })).toBeInTheDocument();
    first.unmount();

    window.localStorage.clear();
    window.localStorage.setItem("junheng-consent", "true");
    await renderCheckIn();
    const secondDay = setCampStart(-1);
    expect(within(secondDay).getByRole("heading", { name: "记录今日体重与腰围" })).toBeInTheDocument();
  });
});
