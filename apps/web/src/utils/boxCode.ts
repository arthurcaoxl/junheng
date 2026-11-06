export type BoxCodeType = "experience" | "recharge";
export type BoxCodeFormat = "short" | "long";

export type BoxCodeValidationResult =
  | { valid: true; codeType: BoxCodeType; codeFormat: BoxCodeFormat }
  | {
      valid: false;
      codeType: null;
      reason: "EMPTY" | "INVALID_FORMAT";
    };

const BOX_CODE_PATTERN =
  /^JH-(EL|RC)-([ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}|[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{12,16})$/;

export function validateBoxCode(rawCode: unknown): BoxCodeValidationResult {
  if (rawCode === "") {
    return { valid: false, codeType: null, reason: "EMPTY" };
  }

  if (typeof rawCode !== "string") {
    return { valid: false, codeType: null, reason: "INVALID_FORMAT" };
  }

  const match = BOX_CODE_PATTERN.exec(rawCode);
  if (!match) {
    return { valid: false, codeType: null, reason: "INVALID_FORMAT" };
  }

  return {
    valid: true,
    codeType: match[1] === "EL" ? "experience" : "recharge",
    codeFormat: match[2].length === 4 ? "short" : "long",
  };
}
