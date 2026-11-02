import { Link } from "react-router";

export default function PrivacyPage() {
  return (
    <div className="legal-shell">
      <nav className="legal-nav" aria-label="隐私页导航">
        <Link className="legal-back-link" to="/check-in">← 返回打卡</Link>
      </nav>
      <article className="legal-page">
      <header className="legal-page-heading">
        <p className="legal-eyebrow">JUNHENG PLAN · 隐私保护</p>
        <h1>隐私政策</h1>
        <p className="legal-updated">最后更新日期：2026 年 11 月</p>
      </header>

      <p>「菌衡计划·脂代谢研究所」（以下简称“我们”）深知个人信息，尤其是健康数据对您的重要性。我们承诺严格遵守《中华人民共和国个人信息保护法》等相关法律法规。</p>

      <h2>1. 我们收集哪些信息</h2>
      <ul>
        <li><strong>基础健康数据</strong>：身高、体重、腰围等体征数据。</li>
        <li><strong>联系信息（选填）</strong>：若您选择绑定邮箱以同步数据，我们会收集您的邮箱地址。</li>
        <li><strong>设备与日志信息</strong>：保障服务运行的基本设备信息。</li>
      </ul>

      <h2>2. 数据的存储与架构</h2>
      <p>我们采用<strong>“本地优先”</strong>架构。在不绑定账号的情况下，您的打卡数据默认仅保存在您的设备本地。当您主动绑定邮箱开启云端备份后，数据将通过加密通道同步至我们的云端数据库。</p>

      <h2>3. 脱敏研究与数据利用</h2>
      <p>只有在您明确勾选授权后，我们才会将您的健康数据<strong>进行严格的脱敏处理（去除个人身份标识，无法指向具体个人）</strong>，用于本平台的综合数据统计、产品优化与代谢科学研究。<strong>我们绝不会将您的个人真实身份信息或未脱敏数据出售或泄露给任何第三方。</strong></p>

      <h2>4. 您的权利</h2>
      <p>您有权随时拒绝授权、查看或修改您的健康数据，或联系客服注销账户及删除云端数据。</p>

      <footer className="legal-footer">最后更新日期：2026 年 11 月</footer>
      </article>
    </div>
  );
}
