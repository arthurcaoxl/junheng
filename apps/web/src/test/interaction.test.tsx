import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import App from "../App";

describe("page interactions", () => {
  it("switches ritual steps with an accessible tab interface", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><App /></MemoryRouter>);
    await user.click(screen.getByRole("tab", { name: /充分搅拌/ }));
    expect(screen.getByRole("tabpanel", { name: /充分搅拌/ })).toHaveTextContent("充分搅拌");
    expect(screen.getByRole("tab", { name: /充分搅拌/ })).toHaveAttribute("aria-selected", "true");
  });

  it("switches mushroom knowledge with accessible tabs", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><App /></MemoryRouter>);
    await user.click(screen.getByRole("tab", { name: /竹荪/ }));
    expect(screen.getByRole("tabpanel", { name: /竹荪/ })).toHaveTextContent("菌中皇后");
    expect(screen.getByRole("tab", { name: /竹荪/ })).toHaveAttribute("aria-selected", "true");
  });

  it("shows real mushroom photography and expands the complete directory", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><App /></MemoryRouter>);
    const knowledge = screen.getByRole("region", { name: "认识菌菇，不止记住数字。" });
    const tabList = within(knowledge).getByRole("tablist", { name: "菌菇知识" });
    expect(tabList.querySelectorAll('[role="tab"]')).toHaveLength(8);
    await user.click(within(knowledge).getByRole("tab", { name: /灵芝/ }));
    expect(within(knowledge).getByRole("img", { name: "灵芝实体照片" })).toBeVisible();
    const toggle = screen.getByRole("button", { name: "展开全部 23 种菌菇" });
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const directory = screen.getByRole("list", { name: "完整 23 种菌菇目录" });
    expect(directory).toBeVisible();
    expect(directory.children).toHaveLength(23);
  });

  it("opens the mobile navigation and exposes its state", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><App /></MemoryRouter>);
    const menu = screen.getByRole("button", { name: "打开导航" });
    await user.click(menu);
    expect(menu).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("navigation", { name: "移动端页面导航" })).toBeVisible();
  });
});
