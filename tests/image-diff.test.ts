import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { comparePngFiles } from "../src/image-diff.js";

function solidPng(red: number): Buffer {
  const png = new PNG({ width: 2, height: 2 });
  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = red;
    png.data[index + 1] = 0;
    png.data[index + 2] = 0;
    png.data[index + 3] = 255;
  }
  return PNG.sync.write(png);
}

describe("PNG comparison", () => {
  it("reports identical and changed images", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "visual-contract-images-"));
    const baseline = path.join(directory, "baseline.png");
    const same = path.join(directory, "same.png");
    const changed = path.join(directory, "changed.png");
    await Promise.all([
      writeFile(baseline, solidPng(255)),
      writeFile(same, solidPng(255)),
      writeFile(changed, solidPng(0)),
    ]);
    expect((await comparePngFiles(baseline, same)).ratio).toBe(0);
    expect((await comparePngFiles(baseline, changed)).ratio).toBe(1);
  });
});
