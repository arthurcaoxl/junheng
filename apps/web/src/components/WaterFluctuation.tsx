import { useState } from "react";

const PANEL_PREFS_KEY = "junheng-water-info-v1";

type PanelPrefs = {
  timeline: boolean;
  science: boolean;
};

function isPanelPrefs(value: unknown): value is PanelPrefs {
  return typeof value === "object" && value !== null
    && typeof (value as PanelPrefs).timeline === "boolean"
    && typeof (value as PanelPrefs).science === "boolean";
}

function loadPanelPrefs(): PanelPrefs | null {
  try {
    const raw = window.localStorage.getItem(PANEL_PREFS_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isPanelPrefs(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function defaultPanelPrefs(): PanelPrefs {
  const narrow = typeof window.matchMedia === "function" && window.matchMedia("(max-width: 760px)").matches;
  return narrow ? { timeline: false, science: false } : { timeline: true, science: true };
}

const waterFacts = [
  {
    value: "约 2 kg",
    title: "早晚体重，可以不一样",
    text: "进食、饮水和排泄都可能影响读数。尽量固定在早晨起床排尿后、早餐前，以相近状态测量并记录。",
  },
  {
    value: "60%–70%",
    title: "水分变化，不等于脂肪变化",
    text: "成人体内水分约占体重 60%–70%，个体比例会有差异。短期体重变化很大程度受身体或食物水分影响，不等于脂肪变化。",
  },
  {
    value: "看趋势",
    title: "别被单次数字牵着走",
    text: "高盐饮食、经期及饮酒等，都可能影响身体水分。把单日读数放回 21 天趋势里，更容易看清自己的节奏。",
  },
] as const;

const timeline = [
  {
    period: "早晨",
    time: "7:00–8:00",
    label: "起床排尿后、早餐前 · 常用基准点",
    text: "经过一夜睡眠，呼吸、皮肤蒸发和排尿会带走水分；空腹时胃肠内容物相对少。固定在相近时间、相近状态称重，更便于比较。",
  },
  {
    period: "中午",
    time: "12:00–14:00",
    label: "午餐后 · 逐渐上升",
    text: "喝下的水、饭菜本身的物理重量，以及消化过程中的水分变化，都会让体重计数字暂时增加。",
  },
  {
    period: "傍晚",
    time: "18:00–20:00",
    label: "晚餐后、睡前 · 常见较高点",
    text: "累积的食物和饮水会让读数常高于早晨，部分人相差约 1–2 kg。晚上重了，不等于白天长胖了。",
  },
  {
    period: "夜间",
    time: "睡眠中",
    label: "消耗与水分流失仍在继续",
    text: "基础代谢仍在消耗能量，呼吸和轻微出汗也会带走水分；早晨数字可能回落，但不应把短时变化全算作脂肪减少。",
  },
] as const;

const waterSwitches = [
  {
    title: "碳水与盐分",
    text: "常见估算中，身体每储存 1 g 糖原，会同时保留约 3 g 水分。高盐饮食也可能引起水分潴留；火锅或大餐后的体重上涨，不等于脂肪同步增加。",
  },
  {
    title: "激素波动",
    text: "部分女性在经前期会因激素变化出现水分潴留，体重可能暂时上升，经期后逐渐缓解。具体幅度因人而异。",
  },
  {
    title: "酒精与饮水",
    text: "酒精的利尿作用可能先带来脱水，随后的补水、饮酒时饮食及盐分摄入又会让读数波动。不要通过饮酒或刻意限制饮水管理体重。",
  },
] as const;

export function WaterFluctuation() {
  const [panels, setPanels] = useState<PanelPrefs>(() => loadPanelPrefs() ?? defaultPanelPrefs());

  const togglePanel = (key: keyof PanelPrefs) => {
    const next = { ...panels, [key]: !panels[key] };
    setPanels(next);
    try {
      window.localStorage.setItem(PANEL_PREFS_KEY, JSON.stringify(next));
    } catch {
      // 与打卡存储一致：本地存储不可用时静默降级，仅本次会话有效
    }
  };

  return (
    <section className="water-fluctuation" aria-labelledby="water-fluctuation-title">
      <div className="water-fluctuation-heading"><span>WATER & WEIGHT</span><h3 id="water-fluctuation-title">水分是体重波动的关键</h3><p>早晚相差约 2 kg 的情况可能出现，不必因单次读数焦虑。重点看 21 天的总体趋势，不纠结单日数字。</p></div>
      <div className="water-facts">
        {waterFacts.map((fact) => <article key={fact.value}><strong>{fact.value}</strong><h4>{fact.title}</h4><p>{fact.text}</p></article>)}
      </div>
      <div className="weight-timeline">
        <div className="water-subheading"><span>24-HOUR TIMELINE</span><h4>一天 24 小时：体重的“真实时间轴”</h4><p>体重在一天之内不是一条直线，而是一条波浪线。早晚相差约 2 kg，甚至 2.5 kg 的情况也可能出现；先区分水分、胃肠内容物和脂肪变化，不必被单次读数制造焦虑。</p></div>
        <button type="button" className="water-panel-toggle" aria-expanded={panels.timeline} aria-controls="water-timeline-body" onClick={() => togglePanel("timeline")}>
          {panels.timeline ? "收起 24 小时时间轴" : "展开 24 小时时间轴"}
        </button>
        <div id="water-timeline-body" hidden={!panels.timeline}>
          <ol>
            {timeline.map((item, index) => <li key={item.period}><span>{String(index + 1).padStart(2, "0")}</span><div><h5>{item.period} {item.time}</h5><strong>{item.label}</strong><p>{item.text}</p></div></li>)}
          </ol>
        </div>
      </div>
      <div className="water-science">
        <div className="water-subheading"><span>FAT OR WATER?</span><h4>为什么短期体重波动，常常先想到水分？</h4><p>常用估算中，1 kg 体脂对应约 7700 kcal 能量。脂肪变化是逐步发生的，短期体重大幅起伏不能简单理解为当天增加或减少了等量脂肪。</p></div>
        <button type="button" className="water-panel-toggle" aria-expanded={panels.science} aria-controls="water-science-body" onClick={() => togglePanel("science")}>
          {panels.science ? "收起波动原因" : "展开波动原因"}
        </button>
        <div id="water-science-body" hidden={!panels.science}>
          <div className="water-switch-grid">
            {waterSwitches.map((item, index) => <article key={item.title}><span>0{index + 1}</span><h5>{item.title}</h5><p>{item.text}</p></article>)}
          </div>
        </div>
      </div>
      <p className="water-note">以上为一般健康科普与常见估算，不用于诊断，个体波动范围不同；如持续明显水肿、体重短期快速变化或伴随不适，请及时咨询医生。</p>
    </section>
  );
}
