import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import App from "../App";

function renderHome() {
  return render(<MemoryRouter initialEntries={["/"]}><App /></MemoryRouter>);
}

function scienceSection() {
  return screen.getByRole("region", { name: "三餐之外，一袋补到位。" });
}

describe("science core section", () => {
  it("renders per-bag measured nutrition facts sourced from the package label", () => {
    renderHome();
    const section = scienceSection();
    expect(within(section).getByText("10.7")).toBeInTheDocument();
    expect(within(section).getByText("650")).toBeInTheDocument();
    expect(within(section).getByText("≈100")).toBeInTheDocument();
    expect(within(section).getByText("≈80%")).toBeInTheDocument();
    expect(within(section).getByText("优质蛋白")).toBeInTheDocument();
    expect(within(section).getByText("左旋肉碱")).toBeInTheDocument();
    expect(within(section).getByText("PDCAAS")).toBeInTheDocument();
    expect(within(section).getByText(/黑松露、赤芝、红菇/)).toBeInTheDocument();
    expect(within(section).getByText(/数据摘自产品包装营养成分表/)).toBeInTheDocument();
    expect(within(section).getByText(/以产品实际检测为准/)).toBeInTheDocument();
  });

  it("sets the correct expectation: not a meal replacement and no unlimited weight loss", () => {
    renderHome();
    const section = scienceSection();
    expect(within(section).getByText(/它不是代餐，不替代三餐/)).toBeInTheDocument();
    expect(within(section).getByText(/不会让人无限瘦下去/)).toBeInTheDocument();
    expect(within(section).getByText(/仅为|不构成功效承诺/).textContent).toContain("不构成功效承诺");
  });

  it("avoids absolute fat-burning or treatment claims", () => {
    renderHome();
    const section = scienceSection();
    expect(within(section).queryByText(/燃脂|保证减重|治疗|燃烧脂肪/)).not.toBeInTheDocument();
  });

  it("switches the three audience tabs", async () => {
    const user = userEvent.setup();
    renderHome();
    const section = scienceSection();
    const tablist = within(section).getByRole("tablist", { name: "人群用法" });
    await user.click(within(tablist).getByRole("tab", { name: /运动期/ }));
    const panel = within(section).getByRole("tabpanel", { name: /运动期/ });
    expect(panel).toHaveTextContent("运动后 30 分钟内 1 袋");
    expect(panel).toHaveTextContent("运动营养食品（耐力类）");
    await user.click(within(tablist).getByRole("tab", { name: /维持期/ }));
    expect(within(section).getByRole("tabpanel", { name: /维持期/ })).toHaveTextContent("平衡器，不是燃烧剂");
    await user.click(within(tablist).getByRole("tab", { name: /减脂期/ }));
    expect(within(section).getByRole("tabpanel", { name: /减脂期/ })).toHaveTextContent("温和热量缺口");
  });

  it("switches meal timeline tabs and compares before and after drinking", async () => {
    const user = userEvent.setup();
    renderHome();
    const section = scienceSection();
    const tablist = within(section).getByRole("tablist", { name: "三餐代谢时间轴" });
    expect(within(section).getByRole("tabpanel", { name: /早餐/ })).toHaveTextContent("延缓胃排空");
    await user.click(within(tablist).getByRole("tab", { name: /晚餐/ }));
    const panel = within(section).getByRole("tabpanel", { name: /晚餐/ });
    expect(panel).toHaveTextContent("社交餐");
    expect(panel).toHaveTextContent("夜间修复");
  });

  it("links to the check-in page with a distinct call to action", () => {
    renderHome();
    const section = scienceSection();
    expect(within(section).getByRole("link", { name: "去 21 天打卡，记录三餐之外的变化 →" })).toHaveAttribute("href", "/check-in");
  });
});
