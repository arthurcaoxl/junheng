import { Link } from "react-router";

export function CheckInEntry() {
  return (
    <section className="check-in-entry section-pad" id="check-in" data-theme="forest" aria-label="21 天打卡入口">
      <div className="section-index"><span>18</span><span>21-DAY CHECK-IN</span></div>
      <div className="check-in-entry-heading">
        <p className="eyebrow">不追赶固定数字，先看见自己的变化</p>
        <h2>21 天，构建你的脂代谢稳态。</h2>
        <p>第 1 天建立基线，第 21 天回看趋势。记录体重、腰围与每餐执行情况。</p>
        <Link className="check-in-entry-link" to="/check-in">进入 21 天打卡 →</Link>
      </div>
    </section>
  );
}
