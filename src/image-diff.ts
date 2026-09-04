import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

export interface ImageDiffResult {
  ratio: number;
  differentPixels: number;
  totalPixels: number;
  dimensionsMatch: boolean;
  baseline: { width: number; height: number };
  current: { width: number; height: number };
}

export async function comparePngFiles(
  baselinePath: string,
  currentPath: string,
  diffPath?: string,
): Promise<ImageDiffResult> {
  const [baselineBuffer, currentBuffer] = await Promise.all([
    readFile(baselinePath),
    readFile(currentPath),
  ]);
  const baseline = PNG.sync.read(baselineBuffer);
  const current = PNG.sync.read(currentBuffer);
  const dimensionsMatch = baseline.width === current.width && baseline.height === current.height;

  if (!dimensionsMatch) {
    return {
      ratio: 1,
      differentPixels: Math.max(baseline.width * baseline.height, current.width * current.height),
      totalPixels: Math.max(baseline.width * baseline.height, current.width * current.height),
      dimensionsMatch,
      baseline: { width: baseline.width, height: baseline.height },
      current: { width: current.width, height: current.height },
    };
  }

  const diff = new PNG({ width: baseline.width, height: baseline.height });
  const differentPixels = pixelmatch(
    baseline.data,
    current.data,
    diff.data,
    baseline.width,
    baseline.height,
    { threshold: 0.1, includeAA: false },
  );
  const totalPixels = baseline.width * baseline.height;
  if (diffPath && differentPixels > 0) {
    await mkdir(path.dirname(diffPath), { recursive: true });
    await writeFile(diffPath, PNG.sync.write(diff));
  }
  return {
    ratio: totalPixels === 0 ? 0 : differentPixels / totalPixels,
    differentPixels,
    totalPixels,
    dimensionsMatch,
    baseline: { width: baseline.width, height: baseline.height },
    current: { width: current.width, height: current.height },
  };
}
