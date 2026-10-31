import { render, screen, within } from "@testing-library/react";
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

  it("展示完整的麦角硫因成分科普并保留营养边界", () => {
    renderHome();
    const detail = screen.getByRole("region", { name: "麦角硫因成分科普" });
    expect(within(detail).getByRole("heading", { name: "什么是麦角硫因？" })).toBeInTheDocument();
    expect(within(detail).getByText(/天然含硫氨基酸/)).toBeInTheDocument();
    expect(within(detail).getByText(/人体不能自行合成/)).toBeInTheDocument();
    expect(within(detail).getByText(/抗氧化与细胞营养相关研究/)).toBeInTheDocument();
    expect(within(detail).getByText(/研究结论不等于产品功效/)).toBeInTheDocument();
    expect(within(detail).queryByText(/激活线粒体|重塑易瘦体质|治疗疾病/)).not.toBeInTheDocument();
  });

  it("展示三大核心原则且不使用确定性功效表述", () => {
    renderHome();
    const principles = screen.getByRole("region", { name: "科学体重管理的三大核心原则" });
    expect(within(principles).getByRole("heading", { name: "热量平衡" })).toBeInTheDocument();
    expect(within(principles).getByText("不挨饿、不断碳水，在营养均衡前提下保持温和热量缺口，让饮食管理更容易长期坚持。")).toBeInTheDocument();
    expect(within(principles).getByRole("heading", { name: "营养均衡" })).toBeInTheDocument();
    expect(within(principles).getByText("脂肪代谢需要多种营养参与。23 种菌菇、双蛋白与 6 种维生素，作为日常膳食的营养补充。")).toBeInTheDocument();
    expect(within(principles).getByRole("heading", { name: "脂代谢调节" })).toBeInTheDocument();
    expect(within(principles).getByText("关注久坐、应酬等生活场景下的脂质代谢管理，通过菌菇与维生素矩阵补充营养，配合饮食、运动与长期记录。")).toBeInTheDocument();
    expect(within(principles).queryByText(/修复.*代谢|激活线粒体|重塑易瘦体质/)).not.toBeInTheDocument();
  });
});
