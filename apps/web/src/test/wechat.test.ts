import { describe, expect, it } from "vitest";
import html from "../../index.html?raw";
import h5 from "../../public/h5/index.html?raw";
import shareImageUrl from "../../public/images/wechat-share.jpg?url";

describe("WeChat browser readiness", () => {
  it("provides safe-area viewport and a branded loading shell", () => {
    expect(html).toContain("viewport-fit=cover");
    expect(html).toContain('class="boot-screen"');
    expect(html).toContain("餐前伴侣，助力脂代谢");
  });

  it("provides absolute sharing metadata and a local share image", () => {
    expect(html).toContain('property="og:title"');
    expect(html).toContain('property="og:description"');
    expect(html).toContain('content="https://rtrzqrxly4mlo.ok.kimi.link/images/wechat-share.jpg"');
    expect(html).toContain('property="og:image:width" content="1200"');
    expect(html).toContain('property="og:image:height" content="630"');
    expect(shareImageUrl).toContain("wechat-share");
  });

  it("preloads the hero and keeps the canonical cloud address", () => {
    expect(html).toContain('rel="preload" as="image" href="/images/hero.webp"');
    expect(html).toContain('rel="canonical" href="https://rtrzqrxly4mlo.ok.kimi.link/"');
  });
});

describe("standalone WeChat H5", () => {
  it("provides a lightweight independent document with sharing metadata", () => {
    expect(h5).toContain("viewport-fit=cover");
    expect(h5).toContain('rel="canonical" href="https://rtrzqrxly4mlo.ok.kimi.link/h5/index.html"');
    expect(h5).toContain('property="og:url" content="https://rtrzqrxly4mlo.ok.kimi.link/h5/index.html"');
    expect(h5).not.toContain("<script");
    expect(h5.length).toBeLessThan(30000);
  });

  it("keeps the core brand narrative and all six experts without serial numbers", () => {
    for (const text of ["餐前伴侣助力脂代谢", "健康体重管理", "23种菌菇精华", "北京千菌方菌物科学研究院", "李佃贵", "张大宁", "金世元", "石学敏", "孙光荣", "王琦", "临床研究进行中"]) {
      expect(h5).toContain(text);
    }
    expect(h5).not.toContain("expert-order");
    expect(h5).toContain("不是药品，不能代替药物");
  });
});
