import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import App from "../App";

function renderLegalPage(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

describe("协议与隐私页面排版", () => {
  it("用户服务协议提供居中内容容器与明确的返回入口", () => {
    renderLegalPage("/terms");

    expect(screen.getByRole("heading", { name: "用户服务协议" })).toBeInTheDocument();
    const article = document.querySelector(".legal-page");
    expect(article).not.toBeNull();
    expect(article!.closest(".legal-shell")).not.toBeNull();
    expect(screen.getByRole("link", { name: "← 返回打卡" })).toHaveAttribute("href", "/check-in");
  });

  it("隐私政策提供居中内容容器与明确的返回入口", () => {
    renderLegalPage("/privacy");

    expect(screen.getByRole("heading", { name: "隐私政策" })).toBeInTheDocument();
    const article = document.querySelector(".legal-page");
    expect(article).not.toBeNull();
    expect(article!.closest(".legal-shell")).not.toBeNull();
    expect(screen.getByRole("link", { name: "← 返回打卡" })).toHaveAttribute("href", "/check-in");
  });
});
