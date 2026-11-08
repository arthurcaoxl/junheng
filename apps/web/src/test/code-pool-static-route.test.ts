import { describe, expect, it } from "vitest";
import postbuild from "../../scripts/postbuild-static-routes.mjs?raw";

describe("教练码库静态深链", () => {
  it("无 SPA fallback 的托管环境生成 coach/codes/index.html", () => {
    expect(postbuild).toContain('"coach/codes"');
  });
});
