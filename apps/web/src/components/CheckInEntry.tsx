import { Link } from "react-router";

export function CheckInEntry() {
  return (
    <section className="check-in-entry section-pad" id="check-in" data-theme="forest" aria-label="21 天打卡入口">
      <div className="section-index"><span>18</span><span>21-DAY CHECK-IN</span></div>
      <div className="check-in-entry-heading">
        <p className="eyebrow">不追赶固定数字，先看见自己的变化</p>
        <h2>21 天，看见自己的节奏。</h2>
        <p>第 1 天建立基线，第 21 天回看趋势。记录体重、腰围与每餐执行情况，也把饮水、运动和睡眠放进同一张图里。打卡已搬到独立页面，打开即用，无需滑过整页内容。</p>
        <p className="check-in-persistence">感受到的减脂，坚持方能长期健康。</p>
        <Link className="check-in-entry-link" to="/check-in">进入 21 天打卡 →</Link>
      </div>
    </section>
  );
}
