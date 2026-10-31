import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { navigation, siteConfig } from "../config/site";
import { addDays, todayKey } from "../utils/checkin";

function setCampStart(offsetDays: number) {
  const checkIn = screen.getByRole("region", { name: "21 天，构建你的脂代谢稳态。" });
  fireEvent.change(within(checkIn).getByLabelText("开营日期"), { target: { value: addDays(todayKey(), offsetDays) } });
  return checkIn;
}

function renderApp(route = "/") {
  return render(<MemoryRouter initialEntries={[route]}><App /></MemoryRouter>);
}

describe("priority lifestyle sections", () => {
  beforeEach(() => {
    window.localStorage.clear();
    // 本文件验证前台展示，不接入真实 Supabase；D7 拦截由 sync-panel 专项覆盖。
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("renders lifestyle guidance with the 21-day check-in last", () => {
    renderApp();
    const ids = Array.from(document.querySelectorAll("main > section")).map((section) => section.id);
    expect(ids).toEqual([
      "hero", "perspective", "metabolism-signals", "difference", "science", "body-standards", "metrics", "nutrition",
      "formula", "benefits", "knowledge", "process", "mechanism", "research", "ritual",
      "plate-guide", "scene-guide", "movement", "check-in",
    ]);
    expect(screen.getByRole("heading", { name: "吃对了，营养打底，脂肪代谢才更有底气" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /不是“更好的代餐”，是宏量营养 × 活性菌物营养协同的新路径/ })).toBeInTheDocument();
    expect(screen.getByText("围绕“替代一餐”设计")).toBeInTheDocument();
    expect(screen.getByText("只见热量，难见均衡")).toBeInTheDocument();
    expect(screen.getByText("生命需要均衡")).toBeInTheDocument();
    const comparison = screen.getByRole("heading", { name: /不是“更好的代餐”/ }).closest("section")!;
    const recommended = within(comparison as HTMLElement).getByText("菌衡计划 · 餐前营养伴侣").closest("article")!;
    expect(within(recommended as HTMLElement).getByText("✓ 推荐路径")).toBeInTheDocument();
    expect(within(recommended as HTMLElement).getByText(/餐前 30–60 分钟，融入原有三餐/)).toBeInTheDocument();
    expect(screen.getByText("常见路径")).toBeInTheDocument();
    expect(screen.getByText("品类对比仅科学分析，不构成对任何品牌的贬损或功效承诺")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "代谢营养 × 活性菌物，专属协同优势" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /211 饮食法/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /餐桌不只在家的厨房/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "配合运动更高效，可执行的三件事。" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "21 天，构建你的脂代谢稳态。" })).toBeInTheDocument();
    expect(screen.getByText("感受到的减脂，坚持方能长期健康。")).toBeInTheDocument();
    expect(navigation.find((item) => item.id === "check-in")?.label).toBe("21 天打卡");
  });

  it("links the home check-in entry to the dedicated check-in page", () => {
    renderApp();
    const entry = screen.getByRole("region", { name: "21 天打卡入口" });
    const checkInLinks = screen.getAllByRole("link", { name: "进入 21 天打卡 →" });
    expect(checkInLinks).toHaveLength(2);
    expect(checkInLinks[0]).toHaveClass("hero-checkin-link");
    expect(checkInLinks[0]).toHaveAttribute("href", "/check-in");
    expect(within(entry).getByRole("link", { name: "进入 21 天打卡 →" })).toHaveAttribute("href", "/check-in");
    expect(screen.queryByRole("tablist", { name: "21 天打卡日期" })).not.toBeInTheDocument();
  });

  it("explains water-related weight fluctuation on the dedicated check-in page", () => {
    renderApp("/check-in");
    const checkIn = screen.getByRole("region", { name: "21 天，构建你的脂代谢稳态。" });
    expect(within(checkIn).getByText("第 1 天建立基线，第 21 天回看趋势。记录体重、腰围与每餐执行情况。")).toBeInTheDocument();
    expect(within(checkIn).getByRole("heading", { name: "水分是体重波动的关键" })).toBeInTheDocument();
    expect(within(checkIn).getAllByText(/早晚.*约 2 kg/).length).toBeGreaterThan(0);
    expect(within(checkIn).getByText(/早晚相差约 2 kg 的情况可能出现，不必因单次读数焦虑/)).toBeInTheDocument();
    expect(within(checkIn).getByText(/重点看 21 天的总体趋势/)).toBeInTheDocument();
    expect(within(checkIn).getAllByText(/60%–70/).length).toBeGreaterThan(0);
    expect(within(checkIn).getAllByText(/不等于脂肪变化/).length).toBeGreaterThan(0);
    expect(within(checkIn).getByText(/高盐饮食、经期及饮酒/)).toBeInTheDocument();
  });

  it("keeps navigation concise and every anchor valid", () => {
    renderApp();
    expect(navigation.map((item) => item.id)).toEqual([
      "perspective", "difference", "science", "body-standards", "metrics", "formula", "research", "ritual", "check-in",
    ]);
    for (const item of navigation) {
      expect(document.getElementById(item.id)).toBeInTheDocument();
      expect(screen.getAllByRole("link", { name: item.label }).length).toBeGreaterThan(0);
    }
  });

  it("switches 211 plate examples by click and keyboard", async () => {
    const user = userEvent.setup();
    renderApp();
    const plate = screen.getByRole("region", { name: /211 饮食法/ });
    await user.click(within(plate).getByRole("tab", { name: /1 拳优质蛋白/ }));
    expect(within(plate).getByRole("tabpanel")).toHaveTextContent("鱼、虾、鸡蛋、瘦肉、豆制品");
    const proteinTab = within(plate).getByRole("tab", { name: /1 拳优质蛋白/ });
    proteinTab.focus();
    await user.keyboard("{ArrowRight}");
    expect(within(plate).getByRole("tab", { name: /1 拳主食/ })).toHaveAttribute("aria-selected", "true");
    expect(within(plate).getByRole("tabpanel")).toHaveTextContent("糙米、燕麦、杂粮、薯类");
    expect(within(plate).getByText(/拳头法仅为日常估量/)).toBeInTheDocument();
  });

  it("switches dining scenarios with accessible tabs", async () => {
    const user = userEvent.setup();
    renderApp();
    const scenarios = screen.getByRole("region", { name: /餐桌不只在家的厨房/ });
    await user.click(within(scenarios).getByRole("tab", { name: "酒店早餐" }));
    const panel = within(scenarios).getByRole("tabpanel");
    expect(panel).toHaveTextContent("鸡蛋、牛奶、无糖豆浆");
    await user.click(within(scenarios).getByRole("tab", { name: "商务出差" }));
    expect(within(scenarios).getByRole("tabpanel")).toHaveTextContent("优先清蒸、白切、炖煮");
    expect(within(scenarios).getByText(/不替代三餐/)).toBeInTheDocument();
  });

  it("shows quantified movement guidance without promising weight loss", () => {
    renderApp();
    const movement = screen.getByRole("region", { name: /配合运动更高效/ });
    expect(within(movement).getByText("150+")).toBeInTheDocument();
    expect(within(movement).getByText("2")).toBeInTheDocument();
    expect(within(movement).getByText("约 1")).toBeInTheDocument();
    expect(within(movement).getByText(/循序渐进/)).toBeInTheDocument();
    expect(within(movement).getByText(/特殊人群/)).toBeInTheDocument();
    expect(within(movement).queryByText(/保证|固定减重|7 天减/)).not.toBeInTheDocument();
  });

  it("stores 21-day check-ins locally and restores them after rerender", async () => {
    const user = userEvent.setup();
    const first = renderApp("/check-in");
    const checkIn = screen.getByRole("region", { name: "21 天，构建你的脂代谢稳态。" });
    expect(within(checkIn).getAllByRole("tab")).toHaveLength(21);
    await user.type(within(checkIn).getByLabelText("早晨体重（空腹）"), "65.4");
    await user.type(within(checkIn).getByLabelText("腰围（cm）"), "82");
    await user.click(within(checkIn).getByRole("checkbox", { name: "早餐前已饮用" }));
    await user.click(within(checkIn).getByRole("checkbox", { name: "完成适量运动" }));
    expect(window.localStorage.getItem("junheng-checkin-v3")).toContain("65.4");
    const saved = JSON.parse(window.localStorage.getItem("junheng-checkin-v3") ?? "{}");
    expect(saved.schema).toBe(3);
    expect(saved.userCode).toMatch(/^JH-/);
    expect(saved.records[todayKey()].weight).toBe("64.9"); // 新用户默认扣除晨起衣物 0.5 kg
    expect(saved.records[todayKey()].waist).toBe("82");
    first.unmount();
    renderApp("/check-in");
    const restored = screen.getByRole("region", { name: "21 天，构建你的脂代谢稳态。" });
    expect(within(restored).getByLabelText("早晨体重（空腹）")).toHaveValue(65.4);
    expect(within(restored).getByLabelText("腰围（cm）")).toHaveValue(82);
    expect(within(restored).getByRole("checkbox", { name: "早餐前已饮用" })).toBeChecked();
    expect(within(restored).getByRole("checkbox", { name: "完成适量运动" })).toBeChecked();
    expect(within(restored).getByText("数据已在本机自动保存。绑定邮箱可同步至云端，换设备随时恢复。")).toBeInTheDocument();
  });

  it("migrates existing seven-day records without losing them", async () => {
    const oldDay = { weight: "65.4", waist: "82", meals: [true, false, false], water: true, movement: false, sleep: true };
    window.localStorage.setItem("junheng-seven-day-checkin-v1", JSON.stringify(Array.from({ length: 7 }, () => oldDay)));
    const user = userEvent.setup();
    renderApp("/check-in");
    const checkIn = screen.getByRole("region", { name: "21 天，构建你的脂代谢稳态。" });
    expect(within(checkIn).getByLabelText("早晨体重（空腹）")).toHaveValue(65.4);
    await user.type(within(checkIn).getByLabelText("早晨体重（空腹）"), "0");
    const migrated = JSON.parse(window.localStorage.getItem("junheng-checkin-v3") ?? "{}");
    expect(migrated.schema).toBe(3);
    expect(Object.keys(migrated.records)).toHaveLength(7);
    expect(migrated.startDate).toBe(addDays(todayKey(), -6));
    expect(Number(migrated.records[addDays(todayKey(), -6)].weight)).toBe(65.4);
    expect(migrated.records[todayKey()].waist).toBe("82");
  });

  it("renders weight and waist trends from real records and restores both", async () => {
    const user = userEvent.setup();
    const first = renderApp("/check-in");
    const checkIn = setCampStart(-20);
    await user.click(within(checkIn).getByRole("tab", { name: /第 1 天/ }));
    await user.type(within(checkIn).getByLabelText("早晨体重（空腹）"), "65.4");
    await user.type(within(checkIn).getByLabelText("腰围（cm）"), "82");
    await user.click(within(checkIn).getByRole("tab", { name: /第 21 天/ }));
    await user.type(within(checkIn).getByLabelText("早晨体重（空腹）"), "64.8");
    await user.type(within(checkIn).getByLabelText("腰围（cm）"), "80.5");
    await user.click(within(checkIn).getByRole("link", { name: "查看我的脂代谢报告" }));
    let userCenter = screen.getByRole("region", { name: "我的脂代谢追踪档案" });
    expect(within(userCenter).getByRole("img", { name: "体重趋势图" })).toBeInTheDocument();
    expect(within(userCenter).getByRole("img", { name: "腰围趋势图" })).toBeInTheDocument();
    expect(within(userCenter).getByText("64.9 kg")).toBeInTheDocument();
    expect(within(userCenter).getByText("64.3 kg")).toBeInTheDocument();
    expect(within(userCenter).getByText("82 cm")).toBeInTheDocument();
    expect(within(userCenter).getByText("80.5 cm")).toBeInTheDocument();
    first.unmount();
    renderApp("/user-center");
    userCenter = screen.getByRole("region", { name: "我的脂代谢追踪档案" });
    expect(within(userCenter).getByRole("img", { name: "体重趋势图" })).toBeInTheDocument();
    expect(within(userCenter).getByRole("img", { name: "腰围趋势图" })).toBeInTheDocument();
  });

  it("exports a 21-day camp poster with PNG download and WeChat saving guidance", async () => {
    const context = {
      fillRect: vi.fn(), fillText: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(),
      lineTo: vi.fn(), stroke: vi.fn(), arc: vi.fn(), fill: vi.fn(),
      measureText: vi.fn(() => ({ width: 100 })), closePath: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,poster");
    const user = userEvent.setup();
    renderApp("/check-in");
    const checkIn = screen.getByRole("region", { name: "21 天，构建你的脂代谢稳态。" });
    await user.type(within(checkIn).getByLabelText("早晨体重（空腹）"), "65.4");
    await user.click(within(checkIn).getByRole("link", { name: "查看我的脂代谢报告" }));
    const userCenter = screen.getByRole("region", { name: "我的脂代谢追踪档案" });
    await user.click(within(userCenter).getByRole("button", { name: "生成专属成就海报" }));
    expect(within(userCenter).getByRole("img", { name: "21 天健康记录海报预览" })).toHaveAttribute("src", "data:image/png;base64,poster");
    expect(within(userCenter).getByRole("link", { name: "下载 PNG 海报" })).toHaveAttribute("download", "菌衡计划-21天健康记录.png");
    expect(context.fillText).toHaveBeenCalledWith("菌衡计划 | 脂代谢研究所 × 心脑健康营", 70, 100, 940);
    expect(context.fillText).toHaveBeenCalledWith("我的脂代谢健康记录", 70, 210, 940);
    expect(context.fillText).toHaveBeenCalledWith("0 / 63 次", 70, 1405);
    expect(within(userCenter).getByText(/支持微信内长按保存/)).toBeInTheDocument();
    expect(within(userCenter).getByText(/微信内可长按图片保存/)).toBeInTheDocument();
    expect(within(userCenter).getByText(/仅为个人健康记录，不代表固定减重目标或产品功效/)).toBeInTheDocument();
  });

  it("switches to day 21 and resets only local check-in records", async () => {
    const user = userEvent.setup();
    renderApp("/check-in");
    const checkIn = setCampStart(-20);
    await user.click(within(checkIn).getByRole("tab", { name: /第 21 天/ }));
    expect(within(checkIn).getByText(/第 21 天 · 回看趋势/)).toBeInTheDocument();
    await user.type(within(checkIn).getByLabelText("早晨体重（空腹）"), "64.8");
    await user.click(within(checkIn).getByRole("button", { name: "清空本机记录" }));
    expect(within(checkIn).getByLabelText("早晨体重（空腹）")).toHaveValue(null);
    expect(window.localStorage.getItem("junheng-checkin-v3")).not.toContain("64.8");
  });

  it("keeps the page usable when local storage is unavailable", async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    renderApp("/check-in");
    const checkIn = screen.getByRole("region", { name: "21 天，构建你的脂代谢稳态。" });
    await user.click(within(checkIn).getByRole("checkbox", { name: "完成适量饮水" }));
    expect(within(checkIn).getByRole("checkbox", { name: "完成适量饮水" })).toBeChecked();
    expect(within(checkIn).getByText(/当前浏览器无法保存/)).toBeInTheDocument();
  });

  it("exposes the website version without enabling conversion actions", () => {
    renderApp();
    expect(siteConfig.version).toBe("1.9.0");
    expect(screen.getByText("网站版本 v1.9.0")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "立即购买" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "咨询与留资" })).not.toBeInTheDocument();
  });

  it("defaults to today inside the camp window and disables future days without backfill labels", async () => {
    renderApp("/check-in");
    const checkIn = setCampStart(-5);
    expect(within(checkIn).getByText(/第 6 天 · 保持记录/)).toBeInTheDocument();
    expect(within(checkIn).getByRole("tab", { name: /第 21 天/ })).toBeDisabled();
    expect(within(checkIn).getByRole("tab", { name: /第 6 天/ })).toHaveAttribute("aria-selected", "true");
    expect(within(checkIn).queryByText(/补记/)).not.toBeInTheDocument();
  });

  it("derives date status dots from real records whenever the camp start changes", async () => {
    const yesterday = addDays(todayKey(), -1);
    const recordedDay = { weight: "65", waist: "", meals: [false, false, false], water: false, movement: false, sleep: false };
    window.localStorage.setItem("junheng-checkin-v3", JSON.stringify({
      schema: 3, userCode: "JH-TEST1", startDate: yesterday, records: { [yesterday]: recordedDay },
    }));
    renderApp("/check-in");
    const checkIn = screen.getByRole("region", { name: "21 天，构建你的脂代谢稳态。" });

    expect(within(checkIn).getByRole("tab", { name: /第 1 天/ })).toHaveAttribute("data-has-content", "true");
    expect(within(checkIn).getByRole("tab", { name: /第 1 天/ }).querySelector(".day-tab-status")).toBeInTheDocument();
    expect(within(checkIn).getByRole("tab", { name: /第 2 天/ })).toHaveAttribute("data-has-content", "false");
    expect(within(checkIn).getByRole("tab", { name: /第 2 天/ }).querySelector(".day-tab-status")).not.toBeInTheDocument();

    fireEvent.change(within(checkIn).getByLabelText("开营日期"), { target: { value: addDays(todayKey(), -2) } });
    expect(within(checkIn).getByRole("tab", { name: /第 1 天/ })).toHaveAttribute("data-has-content", "false");
    expect(within(checkIn).getByRole("tab", { name: /第 2 天/ })).toHaveAttribute("data-has-content", "true");
    expect(within(checkIn).queryByText(/补记/)).not.toBeInTheDocument();
  });

  it("shows camp completion stats after day 21 and keeps the camper code immutable", async () => {
    const user = userEvent.setup();
    renderApp("/check-in");
    const checkIn = setCampStart(-25);
    expect(within(checkIn).getByText(/本期 21 天已结营/)).toBeInTheDocument();
    expect(within(checkIn).getByText(/坚持记录 0 天/)).toBeInTheDocument();
    // 营员代码终身唯一：不存在任何重新生成入口
    const codeBefore = within(checkIn).getByText(/^JH-/).textContent;
    expect(within(checkIn).queryByRole("button", { name: "重新生成" })).not.toBeInTheDocument();
    expect(within(checkIn).getByText(/营员代码为您的专属唯一标识，生成后不可更改/)).toBeInTheDocument();
    await user.click(within(checkIn).getByRole("tab", { name: /第 21 天/ }));
    expect(within(checkIn).getByText(/^JH-/).textContent).toBe(codeBefore);
  });

  it("exports CSV with user code, real dates and eight daily fields", async () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL");
    const user = userEvent.setup();
    renderApp("/check-in");
    const checkIn = screen.getByRole("region", { name: "21 天，构建你的脂代谢稳态。" });
    await user.type(within(checkIn).getByLabelText("早晨体重（空腹）"), "65.4");
    await user.click(within(checkIn).getByRole("checkbox", { name: "早餐前已饮用" }));
    await user.click(within(checkIn).getByRole("link", { name: "查看我的脂代谢报告" }));
    await user.click(screen.getByRole("button", { name: "导出完整数据 (CSV)" }));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    const csv = await blob.text();
    const state = JSON.parse(window.localStorage.getItem("junheng-checkin-v3") ?? "{}");
    expect(csv).toContain("user_code,record_date,day_index,weight_kg,waist_cm");
    expect(csv).toContain(`${state.userCode},${todayKey()},1,64.9,,1,0,0,0,0,0`);
  });
});
