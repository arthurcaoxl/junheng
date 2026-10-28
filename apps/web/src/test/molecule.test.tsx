import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MoleculeDiagram } from "../components/MoleculeDiagram";

function horizontalBonds(svg: HTMLElement) {
  return [...svg.querySelectorAll("line")]
    .filter((line) => line.getAttribute("y1") === line.getAttribute("y2"))
    .map((line) => [line.getAttribute("x1"), line.getAttribute("x2")]);
}

describe("molecular structure diagrams", () => {
  it("keeps glycine bonds outside the carbonyl carbon glyph", () => {
    render(<MoleculeDiagram />);
    const svg = screen.getByRole("img", { name: /甘氨酸结构式/ });
    expect(horizontalBonds(svg)).toEqual([["62", "100"], ["150", "196"], ["218", "260"]]);
  });

  it("keeps dipeptide bonds outside both carbonyl carbon glyphs", () => {
    render(<MoleculeDiagram />);
    const svg = screen.getByRole("img", { name: /甘氨酰甘氨酸二肽结构式/ });
    expect(horizontalBonds(svg)).toEqual([
      ["55", "90"], ["140", "209"], ["231", "252"],
      ["282", "327"], ["377", "466"], ["488", "549"],
    ]);
  });
});
