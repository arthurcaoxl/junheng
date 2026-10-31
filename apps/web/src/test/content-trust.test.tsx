import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import App from "../App";

function renderHome() {
  return render(<MemoryRouter initialEntries={["/"]}><App /></MemoryRouter>);
}

describe("职场内容与信任展示", () => {
  it("使用非承诺式职场痛点文案并保留完整 211", () => {
    renderHome();
    expect(screen.getByRole("heading", { name: /为什么吃得少，体重还是难降/ })).toBeInTheDocument();
    expect(screen.getByText(/外卖高油高碳水、频繁应酬饮酒、久坐不动/)).toBeInTheDocument();
    expect(screen.getByText("科学管理体重，不靠极端节食，不追求脱水式减重。")).toBeInTheDocument();
    expect(screen.getByText(/不用算热量，记住 2 拳蔬菜、1 拳优质蛋白、1 拳主食/)).toBeInTheDocument();
    expect(screen.queryByText(/不拉肚子|拼命囤积脂肪/)).not.toBeInTheDocument();
  });

  it("常显专业名词解释并提供真实循证入口", () => {
    renderHome();
    expect(screen.getAllByText(/基础供能营养素（碳水、蛋白、脂肪）/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/经定向酶解处理的菌物营养成分/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/常见于抗氧化营养研究/).length).toBeGreaterThan(0);
    const evidence = screen.getByRole("link", { name: /查看循证依据/ });
    expect(evidence).toHaveAttribute("href", "/images/clinical/ethics-approval.png");
    expect(screen.getByText(/四川大学华西第四医院｜科学性审查批件 Hsy-2025043/)).toBeInTheDocument();
  });
});
