import { describe, expect, test } from "bun:test";
import { emaBySmoothing } from "./chart";

describe("emaBySmoothing", () => {
  test("starts from zero and keeps high smoothing slower than low smoothing", () => {
    const values = [0, 100, 0, 100, 0, 100];
    const fast = emaBySmoothing(values, 0.1);
    const smooth = emaBySmoothing(values, 0.99);

    expect(fast[0]).toBe(0);
    expect(smooth[0]).toBe(0);
    expect(fast[1]).toBeGreaterThan(80);
    expect(smooth[1]).toBeLessThan(2);
    expect(fast[5]).toBeGreaterThan(smooth[5] * 20);
  });

  test("clamps smoothing to the supported range", () => {
    expect(emaBySmoothing([100], -10)[0]).toBe(90);
    expect(emaBySmoothing([100], 10)[0]).toBeCloseTo(1);
  });
});
