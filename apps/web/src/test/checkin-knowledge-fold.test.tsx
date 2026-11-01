import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { addDays, todayKey } from "../utils/checkin";

function setCampStart(offsetDays: number) {
  const checkIn = screen.getByRole("region", { name: "21 天，构建你的脂代谢稳态。" });
  fireEvent.change(within(checkIn).getByLabelText("开营日期"), { target: { value: addDays(todayKey(), offsetDays) } });
  return checkIn;
}

describe("打卡页科普内容按天数渐进式折叠", () => {
  beforeEach(() => {
    window.localStorage.clear();
    // 本文件只验证前台展示，不接入真实 Supabase。
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("第 1 天：科普标题直接可见，且没有折叠按钮", () => {
    render(<MemoryRouter initialEntries={["/check-in"]}><App /></MemoryRouter>);
    const checkIn = setCampStart(0);
    expect(within(checkIn).getByRole("heading", { name: "水分是体重波动的关键" })).toBeVisible();
    expect(within(checkIn).queryByRole("button", { name: /展开健康科普/ })).not.toBeInTheDocument();
  });

  it("第 3 天：科普默认折叠，存在 aria-expanded=false 的展开按钮", () => {
    render(<MemoryRouter initialEntries={["/check-in"]}><App /></MemoryRouter>);
    const checkIn = setCampStart(-2);
    expect(within(checkIn).getByRole("heading", { name: "水分是体重波动的关键", hidden: true })).not.toBeVisible();
    const toggle = within(checkIn).getByRole("button", { name: /展开健康科普/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("第 3 天：点击展开按钮后科普重新可见", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/check-in"]}><App /></MemoryRouter>);
    const checkIn = setCampStart(-2);
    await user.click(within(checkIn).getByRole("button", { name: /展开健康科普/ }));
    expect(within(checkIn).getByRole("button", { name: /收起健康科普/ })).toHaveAttribute("aria-expanded", "true");
    expect(within(checkIn).getByRole("heading", { name: "水分是体重波动的关键" })).toBeVisible();
  });
});
