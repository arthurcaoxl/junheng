import { siteConfig } from "../config/site";
import { LiquidImage } from "./LiquidImage";

export function Hero() {
  return (
    <section className="hero" id="hero" data-theme="forest" aria-labelledby="hero-title">
      <span className="hero-watermark" aria-hidden="true">23</span>
      <div className="hero-copy">
        <p className="eyebrow">JUNHENG PLAN · 餐前营养管理</p>
        <h1 id="hero-title"><span className="hero-title-primary">{siteConfig.slogan}</span><span>{siteConfig.healthStatement}</span></h1>
        <p className="hero-subtitle">{siteConfig.subtitle}</p>
        <p className="hero-intro">每餐前一杯，让营养先到一步。23 种菌菇精华、优质蛋白与复合维生素，融入每一个认真对待三餐的日常。</p>
        <p className="product-category">{siteConfig.category}</p>
      </div>
      <figure className="hero-media">
        <LiquidImage src="/images/hero.webp" alt="正常三餐搭配菌衡膳食粉的生活场景" width={809} height={1160} />
        <figcaption><span>PRE-MEAL 01</span> 餐前一杯，营养先行</figcaption>
      </figure>
      <a className="scroll-cue" href="#perspective"><span>重新理解体重管理</span><i aria-hidden="true" /></a>
    </section>
  );
}
