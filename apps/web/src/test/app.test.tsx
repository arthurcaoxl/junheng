import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import App from "../App";

describe("brand page", () => {
  it("renders the full narrative and required notices", () => {
    render(<MemoryRouter><App /></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("餐前伴侣助力脂代谢健康体重管理");
    expect(screen.getByText("——23种菌菇精华 × 优质蛋白 × 复合维生素——")).toBeInTheDocument();
    expect(screen.getAllByText("40%+").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/数据依据品牌提供素材/).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "一杯的营养密度" })).toBeInTheDocument();
    expect(screen.getByText("每 100 g 含蛋白质 40 g 以上*")).toBeInTheDocument();
    expect(screen.getByText("甘氨酰甘氨酸（二肽）")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /四大菌菇助攻/ })).toBeInTheDocument();
    expect(screen.getByText("餐后血糖管理")).toBeInTheDocument();
    expect(screen.getByText("日常肠道营养")).toBeInTheDocument();
    expect(screen.getByText("临床研究进行中")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "药食同源菌菇核心优势" })).toBeInTheDocument();
    expect(screen.getByText("研发机构｜北京千菌方菌物科学研究院")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "6 位国医大师/院士靶向组方*" })).toBeInTheDocument();
    expect(screen.getByText("李佃贵")).toBeInTheDocument();
    expect(screen.getByText("孙光荣")).toBeInTheDocument();
    expect(screen.getAllByText("国医大师、中国工程院院士")).toHaveLength(2);
    expect(document.querySelector(".expert-order")).not.toBeInTheDocument();
    expect(screen.getAllByText(/仅作组方背景展示，不构成专家代言/).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "一荤一素一菌菇" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "阅读新华网公开报道 ↗" })).toHaveAttribute("href", expect.stringContaining("news.cn"));
    expect(screen.getByText("真菌多糖肽")).toBeInTheDocument();
    expect(screen.getAllByText("麦角硫因").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: /代谢营养 × 活性菌物，专属协同优势/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "小分子菌糖肽" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "麦角硫因" }).length).toBeGreaterThan(0);
    expect(screen.getByText("从多样营养供给，到日常代谢管理")).toBeInTheDocument();
    expect(screen.getByText(/围绕真菌多糖肽、麦角硫因及菌菇活性营养的保留与释放/)).toBeInTheDocument();
    expect(screen.getByText(/21天减脂是阶段性的成果/)).toBeInTheDocument();
    expect(screen.getByText(/研究情况与结论以正式报告为准/)).toBeInTheDocument();
    expect(screen.getByText(/不是药品，不能代替药物/)).toBeInTheDocument();
  });

  it("does not render conversion or check-in actions", () => {
    render(<MemoryRouter><App /></MemoryRouter>);
    expect(screen.queryByRole("link", { name: "立即购买" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "咨询与留资" })).not.toBeInTheDocument();
    expect(screen.queryByText(/微信打卡/)).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist", { name: "21 天打卡日期" })).not.toBeInTheDocument();
  });
});
