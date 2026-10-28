import { siteConfig } from "../config/site";

export function SiteFooter() {
  return (
    <footer className="site-footer" data-theme="forest">
      <p className="eyebrow">JUNHENG PLAN · 21 DAYS</p>
      <strong className="footer-days" aria-hidden="true">21<span>天</span></strong>
      <h2>21天减脂是阶段性的成果，<br />健康才是长期的目的。</h2>
      <div className="footer-bottom">
        <div><strong>{siteConfig.brand}</strong><span>{siteConfig.category}</span><span className="site-version">网站版本 v{siteConfig.version}</span></div>
        <p>本页面为品牌展示，内容依据品牌提供素材整理，不构成医疗建议。产品信息以实物包装与正式文件为准。</p>
        <a href="#hero">回到顶部 ↑</a>
      </div>
    </footer>
  );
}
