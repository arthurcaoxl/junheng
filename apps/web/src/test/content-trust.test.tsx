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
});
