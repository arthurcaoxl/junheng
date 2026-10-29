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
    expect(screen.getByRole("region", { name: "21 天，看见自己的节奏。" })).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "21 天打卡日期" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回首页" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("heading", { name: "餐前伴侣助力脂代谢健康体重管理" })).not.toBeInTheDocument();
  });

  it("serves the check-in flow on the static-host deep-link path", () => {
    renderAt("/check-in/index.html");
    expect(screen.getByRole("region", { name: "21 天，看见自己的节奏。" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回首页" })).toHaveAttribute("href", "/");
  });

  it("serves the full narrative on the home route without the check-in form", () => {
    renderAt("/");
    expect(screen.getByRole("heading", { name: "餐前伴侣助力脂代谢健康体重管理" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "21 天，看见自己的节奏。" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist", { name: "21 天打卡日期" })).not.toBeInTheDocument();
  });

  it("redirects unknown routes back to the home page", () => {
    renderAt("/no-such-page");
    expect(screen.getByRole("heading", { name: "餐前伴侣助力脂代谢健康体重管理" })).toBeInTheDocument();
  });

  it("resets scroll position when navigating to the check-in page", async () => {
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo;
    const user = userEvent.setup();
    renderAt("/");
    await user.click(screen.getByRole("link", { name: "进入 21 天打卡 →" }));
    expect(screen.getByRole("region", { name: "21 天，看见自己的节奏。" })).toBeInTheDocument();
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });
});
