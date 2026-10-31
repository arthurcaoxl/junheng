import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import App from "../App";

function renderAt(route: string) {
  return render(<MemoryRouter initialEntries={[route]}><App /></MemoryRouter>);
}

describe("check-in routing", () => {
  it("serves the check-in flow on its own route without the home narrative", () => {
    renderAt("/check-in");
    expect(screen.getByRole("region", { name: "21 天，构建你的脂代谢稳态。" })).toBeInTheDocument();
    // 打卡页头部使用功能型文案，与首页营销入口区做视觉区分，避免“点了没反应”的错觉
    expect(screen.getByText("每日一分钟，记录你的身体数据")).toBeInTheDocument();
    expect(screen.queryByText("感受到的减脂，坚持方能长期健康。")).not.toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "21 天打卡日期" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回首页" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("heading", { name: "餐前精准膳食，重塑脂代谢平衡。" })).not.toBeInTheDocument();
  });

  it("serves the check-in flow on the static-host deep-link path", () => {
    renderAt("/check-in/index.html");
    expect(screen.getByRole("region", { name: "21 天，构建你的脂代谢稳态。" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回首页" })).toHaveAttribute("href", "/");
  });

  it("serves the full narrative on the home route without the check-in form", () => {
    renderAt("/");
    expect(screen.getByRole("heading", { name: "餐前精准膳食，重塑脂代谢平衡。" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "21 天，构建你的脂代谢稳态。" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist", { name: "21 天打卡日期" })).not.toBeInTheDocument();
    const checkInLinks = screen.getAllByRole("link", { name: "进入 21 天打卡 →" });
    expect(checkInLinks).toHaveLength(2);
    expect(checkInLinks[0]).toHaveClass("hero-checkin-link");
  });

  it("redirects unknown routes back to the home page", () => {
    renderAt("/no-such-page");
    expect(screen.getByRole("heading", { name: "餐前精准膳食，重塑脂代谢平衡。" })).toBeInTheDocument();
  });

  it("resets scroll position when navigating to the check-in page", async () => {
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo;
    const user = userEvent.setup();
    renderAt("/");
    await user.click(screen.getAllByRole("link", { name: "进入 21 天打卡 →" }).at(-1) as HTMLElement);
    expect(screen.getByRole("region", { name: "21 天，构建你的脂代谢稳态。" })).toBeInTheDocument();
    // 路由切换必须同步、瞬时回到顶部，禁止 smooth 动画从旧页面深滚动位置滑过页脚
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "instant" });
  });
});
