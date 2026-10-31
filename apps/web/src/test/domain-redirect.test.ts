import { describe, expect, it } from "vitest";
import { getDomainRedirectUrl, shouldRedirectLegacyDomain } from "../utils/domainRedirect";

describe("legacy domain redirect", () => {
  it("redirects only the exact retired production hostname", () => {
    expect(shouldRedirectLegacyDomain("rtrzqrxly4mlo.ok.kimi.link")).toBe(true);
    expect(shouldRedirectLegacyDomain("junheng.ok.kimi.link")).toBe(false);
    expect(shouldRedirectLegacyDomain("localhost")).toBe(false);
    expect(shouldRedirectLegacyDomain("127.0.0.1")).toBe(false);
    expect(shouldRedirectLegacyDomain("rtrzqrxly4mlo.example.com")).toBe(false);
  });

  it("builds the new-domain URL from the current path and query", () => {
    expect(getDomainRedirectUrl("rtrzqrxly4mlo.ok.kimi.link", "/check-in/", "?day=7")).toBe(
      "https://junheng.ok.kimi.link/check-in/?day=7",
    );
    expect(getDomainRedirectUrl("junheng.ok.kimi.link", "/check-in/", "?day=7")).toBeNull();
  });
});
