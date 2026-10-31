import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";

function renderApp(route = "/") {
  return render(<MemoryRouter initialEntries={[route]}><App /></MemoryRouter>);
}

function seedRecords() {
  const records = Array.from({ length: 21 }, (_, index) => ({
    weight: String(66 - index * 0.1),
    waist: String(98 - index * 0.15),
    meals: [index % 2 === 0, false, false],
    water: index % 3 === 0,
    movement: false,
    sleep: true,
  }));
  window.localStorage.setItem("junheng-checkin-v2", JSON.stringify(records));
}

describe("v1.4.1 interface refinement", () => {
  beforeEach(() => {
    window.localStorage.clear();
    // 本组只验证历史图表与海报渲染，明确关闭同步以隔离 D7 转化拦截。
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("places the selected plate ring outside the clipped plate", async () => {
    const user = userEvent.setup();
    renderApp();
    const plate = screen.getByRole("region", { name: /211 饮食法/ });
    const frame = plate.querySelector(".plate-frame");
    expect(frame).toBeInTheDocument();
    expect(frame?.querySelector(":scope > .plate-visual")).toBeInTheDocument();
    await user.click(within(plate).getByRole("tab", { name: /1 拳主食/ }));
    expect(within(plate).getByRole("tab", { name: /1 拳主食/ })).toHaveAttribute("aria-selected", "true");
  });

  it("uses two wide stacked charts with three-week day labels", () => {
    seedRecords();
    renderApp("/check-in");
    const trends = screen.getByRole("region", { name: "21 天身体记录趋势" });
    expect(trends.querySelector(".trend-grid-stacked")).toBeInTheDocument();
    for (const label of ["体重趋势图", "腰围趋势图"]) {
      const chart = within(trends).getByRole("img", { name: label });
      expect(chart).toHaveAttribute("viewBox", "0 0 1000 290");
      expect(chart.querySelector(".trend-chart-scroll")).not.toBeInTheDocument();
      expect(within(chart).getByText("D1")).toBeInTheDocument();
      expect(within(chart).getByText("D7")).toBeInTheDocument();
      expect(within(chart).getByText("D14")).toBeInTheDocument();
      expect(within(chart).getByText("D21")).toBeInTheDocument();
      expect(within(chart).queryByText("D5")).not.toBeInTheDocument();
      expect(within(chart).queryByText("D10")).not.toBeInTheDocument();
      expect(within(chart).queryByText("D15")).not.toBeInTheDocument();
      expect(within(chart).queryByText("D2")).not.toBeInTheDocument();
    }
    expect(trends.querySelectorAll(".trend-chart-scroll")).toHaveLength(2);
  });

  it("keeps dense trend values readable and limits decimal precision", () => {
    const records = Array.from({ length: 21 }, (_, index) => ({
      weight: index < 7 ? (65.4 - index * 0.03).toFixed(2) : index === 20 ? "64.80000000000001" : "",
      waist: index < 7 ? (82 - index * 0.05).toFixed(2) : index === 20 ? "81" : "",
      meals: [false, false, false], water: false, movement: false, sleep: false,
    }));
    window.localStorage.setItem("junheng-checkin-v2", JSON.stringify(records));
    renderApp("/check-in");
    const chart = screen.getByRole("img", { name: "体重趋势图" });
    const labels = [...chart.querySelectorAll(".trend-value")].map((label) => label.textContent);
    expect(labels.length).toBeLessThanOrEqual(5);
    expect(labels[0]).toBe("65.4 kg");
    expect(labels.at(-1)).toBe("64.8 kg");
    expect(labels.every((label) => !/\d\.\d{3,}/.test(label ?? ""))).toBe(true);
  });

  it("exports a 1080 by 1920 named poster with stacked trends and neutral privacy copy", async () => {
    const context = {
      fillRect: vi.fn(), fillText: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(),
      lineTo: vi.fn(), stroke: vi.fn(), arc: vi.fn(), fill: vi.fn(),
      measureText: vi.fn(() => ({ width: 100 })), closePath: vi.fn(),
    };
    const posterCanvases: HTMLCanvasElement[] = [];
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(function (this: HTMLCanvasElement) {
      posterCanvases.push(this);
      return "data:image/png;base64,phase-a-poster";
    });
    const user = userEvent.setup();
    seedRecords();
    renderApp("/check-in");
    await user.type(screen.getByLabelText("姓名或网名"), "小菌");
    expect(screen.getByText("海报署名：小菌")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "导出记录海报" }));
    expect(posterCanvases[0]?.width).toBe(1080);
    expect(posterCanvases[0]?.height).toBe(1920);
    expect(context.fillText).toHaveBeenCalledWith("记录人：小菌", 70, 318);
    expect(context.fillText).toHaveBeenCalledWith("体重趋势 / kg", 70, 430);
    expect(context.fillText).toHaveBeenCalledWith("腰围趋势 / cm", 70, 870);
    expect(context.fillText).toHaveBeenCalledWith("本海报由本人主动生成，仅供个人健康管理参考。", 70, 1835);
    const posterText = context.fillText.mock.calls.map(([text]) => String(text));
    expect(posterText).toEqual(expect.arrayContaining(["D1", "D7", "D14", "D21"]));
    expect(posterText.filter((text) => ["D5", "D10", "D15"].includes(text))).toEqual([]);
    const footerCalls = context.fillText.mock.calls.map(([text]) => String(text));
    expect(footerCalls.some((text) => text.includes("记录保存在当前设备"))).toBe(false);
  });
});
