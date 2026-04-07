import { describe, it, expect, beforeEach, vi } from "vitest";
import { isDemoMode, setDemoMode } from "./demoMode";

describe("demoMode", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("returns false when sessionStorage is empty", () => {
    expect(isDemoMode()).toBe(false);
  });

  it("returns true after setDemoMode(true)", () => {
    setDemoMode(true);
    expect(isDemoMode()).toBe(true);
  });

  it("returns false after setDemoMode(false)", () => {
    setDemoMode(true);
    setDemoMode(false);
    expect(isDemoMode()).toBe(false);
  });

  it("removes the key from sessionStorage on setDemoMode(false)", () => {
    setDemoMode(true);
    setDemoMode(false);
    expect(sessionStorage.getItem("demo_mode")).toBeNull();
  });
});
