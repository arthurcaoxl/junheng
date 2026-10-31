import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";

function renderApp(route = "/") {
  return render(<MemoryRouter initialEntries={[route]}><App /></MemoryRouter>);
}

describe("v1.4 science, plate and personal records", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("explains the 24-hour weight timeline and three water switches without absolute claims", () => {
    renderApp("/check-in");
    const checkIn = screen.getByRole("region", { name: "21 天，看见自己的节奏。" });
    expect(within(checkIn).getByRole("heading", { name: "一天 24 小时：体重的“真实时间轴”" })).toBeInTheDocument();
    expect(within(checkIn).getByRole("heading", { name: "早晨 7:00–8:00" })).toBeInTheDocument();
    expect(within(checkIn).getByRole("heading", { name: "中午 12:00–14:00" })).toBeInTheDocument();
    expect(within(checkIn).getByRole("heading", { name: "傍晚 18:00–20:00" })).toBeInTheDocument();
    expect(within(checkIn).getByRole("heading", { name: "夜间 睡眠中" })).toBeInTheDocument();
    expect(within(checkIn).getByRole("heading", { name: "为什么短期体重波动，常常先想到水分？" })).toBeInTheDocument();
    expect(within(checkIn).getByRole("heading", { name: "碳水与盐分" })).toBeInTheDocument();
    expect(within(checkIn).getByRole("heading", { name: "激素波动" })).toBeInTheDocument();
    expect(within(checkIn).getByRole("heading", { name: "酒精与饮水" })).toBeInTheDocument();
    expect(within(checkIn).getByText(/2.5 kg/)).toBeInTheDocument();
    expect(within(checkIn).getByText(/约 7700 kcal/)).toBeInTheDocument();
    expect(within(checkIn).getByText(/约 3 g 水分/)).toBeInTheDocument();
    expect(within(checkIn).queryByText(/99%/)).not.toBeInTheDocument();
  });

  it("makes plate sections visibly clickable and shows the active example", async () => {
    const user = userEvent.setup();
    renderApp();
    const plate = screen.getByRole("region", { name: /211 饮食法/ });
    expect(within(plate).getByText("点按餐盘分区，查看食物示例")).toBeInTheDocument();
    const proteinTab = within(plate).getByRole("tab", { name: /1 拳优质蛋白/ });
    await user.click(proteinTab);
    expect(proteinTab).toHaveTextContent("正在查看");
    expect(within(plate).getByRole("tabpanel")).toHaveTextContent("鱼、虾、鸡蛋、瘦肉、豆制品");
  });

  it("restores a real name or nickname locally and adds it to the poster", async () => {
    const context = {
      fillRect: vi.fn(), fillText: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(),
      lineTo: vi.fn(), stroke: vi.fn(), arc: vi.fn(), fill: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,named-poster");
    const user = userEvent.setup();
    const first = renderApp("/check-in");
    await user.type(screen.getByLabelText("姓名或网名"), "小菌");
    expect(window.localStorage.getItem("junheng-checkin-name-v1")).toBe("小菌");
    first.unmount();
    renderApp("/check-in");
    expect(screen.getByLabelText("姓名或网名")).toHaveValue("小菌");
    await user.click(screen.getByRole("button", { name: "导出记录海报" }));
    expect(context.fillText).toHaveBeenCalledWith("记录人：小菌", 70, 318);
  });

  it("clears the saved name together with local check-in records", async () => {
    const user = userEvent.setup();
    renderApp("/check-in");
    await user.type(screen.getByLabelText("姓名或网名"), "小菌");
    await user.click(screen.getByRole("button", { name: "清空本机记录" }));
    expect(screen.getByLabelText("姓名或网名")).toHaveValue("");
    expect(window.localStorage.getItem("junheng-checkin-name-v1")).toBeNull();
  });

  it("uses precise nutrition copy without unverified scores or guaranteed outcomes", () => {
    renderApp();
    expect(screen.getByText(/定向酶解带来小分子菌糖肽/)).toBeInTheDocument();
    expect(screen.getByText(/宏量营养之上，多一层菌物活性物质/)).toBeInTheDocument();
    expect(screen.getByText(/动植物蛋白搭配，丰富必需氨基酸来源/)).toBeInTheDocument();
    expect(screen.getByText(/PDCAAS.*满分 1.0/)).toBeInTheDocument();
    expect(screen.getByText(/具体评分需依据产品实际检测/)).toBeInTheDocument();
    expect(screen.getByText(/减脂期的“肌肉护城河”/)).toBeInTheDocument();
    expect(screen.getByText(/6 种复合维生素参与能量及蛋白质等营养素的正常代谢/)).toBeInTheDocument();
    expect(screen.getByText(/而非单独决定减重或肌肉增长/)).toBeInTheDocument();
    expect(screen.queryByText(/更接近满分|确保吃进去的蛋白质/)).not.toBeInTheDocument();
  });
});
