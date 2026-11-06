import { describe, expect, it } from "vitest";
import { validateBoxCode } from "../utils/boxCode";

const APPROVED_CHARACTERS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

describe("validateBoxCode", () => {
  it("distinguishes experience and recharge codes", () => {
    expect(validateBoxCode("JH-EL-AB23")).toEqual({
      valid: true,
      codeType: "experience",
    });
    expect(validateBoxCode("JH-RC-ZY99")).toEqual({
      valid: true,
      codeType: "recharge",
    });
  });

  it("accepts every approved character in the random segment", () => {
    for (const character of APPROVED_CHARACTERS) {
      expect(validateBoxCode(`JH-EL-${character}AAA`)).toEqual({
        valid: true,
        codeType: "experience",
      });
    }
  });

  it("rejects every visually ambiguous character", () => {
    for (const character of ["I", "L", "O", "0", "1"]) {
      expect(validateBoxCode(`JH-EL-${character}ABC`)).toEqual({
        valid: false,
        codeType: null,
        reason: "INVALID_FORMAT",
      });
    }
  });

  it("rejects empty input separately from other invalid input", () => {
    expect(validateBoxCode("")).toEqual({
      valid: false,
      codeType: null,
      reason: "EMPTY",
    });
  });

  it.each([
    "JH-XX-AB23",
    "JH-EL-ABC",
    "JH-EL-ABCDE",
    "JHELAB23",
    "JH-EL-AB-23",
    " JH-EL-AB23",
    "JH-EL-AB23 ",
    "jh-el-ab23",
    "JH-el-AB23",
    "JH-EL-ab23",
    " ",
  ])("rejects malformed code %j", (code) => {
    expect(validateBoxCode(code)).toEqual({
      valid: false,
      codeType: null,
      reason: "INVALID_FORMAT",
    });
  });

  it.each([null, undefined, 42, true, {}, []])(
    "rejects non-string input %j without throwing",
    (value) => {
      expect(validateBoxCode(value)).toEqual({
        valid: false,
        codeType: null,
        reason: "INVALID_FORMAT",
      });
    },
  );
});
