import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig, normalizeConfig, writeStarterConfig } from "../src/config.js";

describe("configuration", () => {
  it("normalizes a minimal valid configuration", () => {
    const config = normalizeConfig({ version: 1, viewports: [{ name: "phone", width: 390, height: 844 }] });
    expect(config.project).toBe("My web interface");
    expect(config.rules.contrast.minimumRatio).toBe(4.5);
    expect(config.viewports[0]?.name).toBe("phone");
  });

  it("rejects duplicate viewport names", () => {
    expect(() => normalizeConfig({
      version: 1,
      viewports: [
        { name: "same", width: 390, height: 844 },
        { name: "same", width: 1280, height: 800 },
      ],
    })).toThrow(/unique/);
  });

  it("creates and reloads the starter file", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "visual-contract-config-"));
    const configPath = path.join(directory, "visual-contract.yml");
    await writeStarterConfig(configPath);
    expect(await readFile(configPath, "utf8")).toContain("protectedRegions");
    expect((await loadConfig(configPath)).config.version).toBe(1);
    await expect(writeStarterConfig(configPath)).rejects.toThrow(/already exists/);
  });
});
