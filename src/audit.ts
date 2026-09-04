import { access, copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { reviewScreenshots } from "./ai-review.js";
import { collectBrowserFindings } from "./browser-rules.js";
import { loadConfig } from "./config.js";
import { comparePngFiles } from "./image-diff.js";
import type {
  AuditOptions,
  AuditReport,
  FailOn,
  Finding,
  Severity,
  ViewportResult,
  VisualContractConfig,
} from "./types.js";

const severityRank: Record<Severity, number> = { info: 0, warning: 1, error: 2 };

function resolveDirectory(cwd: string, configured: string, override?: string): string {
  return path.resolve(cwd, override ?? configured);
}

function shouldFail(findings: Finding[], failOn: FailOn): boolean {
  if (failOn === "never") return false;
  const threshold = failOn === "warning" ? severityRank.warning : severityRank.error;
  return findings.some((item) => !item.advisory && severityRank[item.severity] >= threshold);
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function settlePage(page: Page, config: VisualContractConfig): Promise<void> {
  await page.addStyleTag({
    content: [
      "*, *::before, *::after {",
      "  animation-delay: 0s !important;",
      "  animation-duration: 0s !important;",
      "  transition-delay: 0s !important;",
      "  transition-duration: 0s !important;",
      "  caret-color: transparent !important;",
      "}",
    ].join("\n"),
  });
  if (config.navigation.stabilizeMs > 0) {
    await page.waitForTimeout(config.navigation.stabilizeMs);
  }
}

async function launchBrowser(options: AuditOptions, config: VisualContractConfig): Promise<Browser> {
  const channel = options.browserChannel ?? config.browser.channel ?? process.env.VISUAL_CONTRACT_BROWSER_CHANNEL;
  try {
    return await chromium.launch({
      headless: !options.headed,
      ...(channel ? { channel } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Unable to launch Chromium${channel ? ` using channel \"${channel}\"` : ""}. ` +
        `Run \"npx playwright install chromium\" or select an installed channel. ${message}`,
    );
  }
}

function runtimeFinding(viewport: string, message: string, advisory = false): Finding {
  return {
    ruleId: advisory ? "ai/review-unavailable" : "runtime/navigation",
    severity: advisory ? "warning" : "error",
    viewport,
    message,
    advisory,
  };
}

export async function auditUrl(targetUrl: string, options: AuditOptions = {}): Promise<AuditReport> {
  const startedAt = Date.now();
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    throw new Error(`Invalid URL: ${targetUrl}`);
  }
  if (!(["http:", "https:"].includes(parsedUrl.protocol))) {
    throw new Error("Only http:// and https:// URLs are supported.");
  }

  const cwd = path.resolve(options.cwd ?? process.cwd());
  const loaded = await loadConfig(options.configPath, cwd);
  const config = loaded.config;
  const configPath = loaded.path;
  const outputDirectory = resolveDirectory(cwd, config.output.directory, options.outputDirectory);
  const baselineDirectory = resolveDirectory(cwd, config.output.baselineDirectory);
  await mkdir(outputDirectory, { recursive: true });
  if (options.updateBaselines) await mkdir(baselineDirectory, { recursive: true });

  const browser = await launchBrowser(options, config);
  const results: ViewportResult[] = [];
  const aiReviews: AuditReport["aiReviews"] = [];

  try {
    for (const viewport of config.viewports) {
      const viewportStarted = Date.now();
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        ...(viewport.deviceScaleFactor ? { deviceScaleFactor: viewport.deviceScaleFactor } : {}),
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      const viewportOutput = path.join(outputDirectory, "artifacts", viewport.name);
      const viewportBaseline = path.join(baselineDirectory, viewport.name);
      await mkdir(viewportOutput, { recursive: true });
      if (options.updateBaselines) await mkdir(viewportBaseline, { recursive: true });

      const findings: Finding[] = [];
      let pageScreenshot: string | undefined;
      let baselineScreenshot: string | undefined;
      try {
        await page.goto(parsedUrl.toString(), {
          waitUntil: config.navigation.waitUntil,
          timeout: config.navigation.timeoutMs,
        });
        await settlePage(page, config);
        findings.push(...(await collectBrowserFindings(page, config, viewport)));

        const fullBaseline = path.join(viewportBaseline, "page.png");
        const fullCurrent = path.join(viewportOutput, "page.png");
        if (options.updateBaselines || options.aiReview || config.ai.enabled) {
          await page.screenshot({ path: fullCurrent, fullPage: true, animations: "disabled" });
          pageScreenshot = fullCurrent;
          if (options.updateBaselines) {
            await copyFile(fullCurrent, fullBaseline);
            baselineScreenshot = fullBaseline;
          } else if (await exists(fullBaseline)) {
            baselineScreenshot = fullBaseline;
          }
        }

        for (let index = 0; index < config.rules.protectedRegions.length; index += 1) {
          const region = config.rules.protectedRegions[index];
          if (!region) continue;
          const locator = page.locator(region.selector).first();
          if ((await locator.count()) === 0) {
            findings.push({
              ruleId: "protected-region/missing",
              severity: region.severity,
              viewport: viewport.name,
              selector: region.selector,
              message: `Protected region \"${region.name}\" was not found.`,
            });
            continue;
          }

          const safeName = `${String(index + 1).padStart(2, "0")}-${region.name.replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
          const currentPath = path.join(viewportOutput, `${safeName}.png`);
          const acceptedPath = path.join(viewportBaseline, `${safeName}.png`);
          await locator.screenshot({ path: currentPath, animations: "disabled" });

          if (options.updateBaselines) {
            await copyFile(currentPath, acceptedPath);
            continue;
          }
          if (!(await exists(acceptedPath))) {
            findings.push({
              ruleId: "protected-region/baseline-missing",
              severity: "warning",
              viewport: viewport.name,
              selector: region.selector,
              message: `No baseline exists for protected region \"${region.name}\". Run with --update-baselines.`,
            });
            continue;
          }

          const diffPath = path.join(viewportOutput, `${safeName}.diff.png`);
          const comparison = await comparePngFiles(acceptedPath, currentPath, diffPath);
          if (comparison.ratio > region.maxDiffRatio) {
            findings.push({
              ruleId: "protected-region/change",
              severity: region.severity,
              viewport: viewport.name,
              selector: region.selector,
              message: `Protected region \"${region.name}\" changed by ${(comparison.ratio * 100).toFixed(2)}% (allowed ${(region.maxDiffRatio * 100).toFixed(2)}%).`,
              expected: `diff <= ${(region.maxDiffRatio * 100).toFixed(2)}%`,
              actual: `${(comparison.ratio * 100).toFixed(2)}%`,
              evidence: { diffPath, ...comparison },
            });
          }
        }
      } catch (error) {
        findings.push(runtimeFinding(viewport.name, error instanceof Error ? error.message : String(error)));
      } finally {
        await context.close();
      }

      results.push({
        viewport,
        url: parsedUrl.toString(),
        findings,
        durationMs: Date.now() - viewportStarted,
        ...(pageScreenshot ? { pageScreenshot } : {}),
        ...(baselineScreenshot ? { baselineScreenshot } : {}),
      });
    }

    const aiEnabled = options.aiReview ?? config.ai.enabled;
    if (aiEnabled) {
      for (const result of results.slice(0, config.ai.maxViewports)) {
        if (!result.baselineScreenshot || !result.pageScreenshot) {
          result.findings.push(runtimeFinding(
            result.viewport.name,
            "AI review requires an accepted full-page baseline. Run with --update-baselines first.",
            true,
          ));
          continue;
        }
        try {
          aiReviews.push(await reviewScreenshots({
            model: process.env.OPENAI_MODEL ?? config.ai.model,
            beforePath: result.baselineScreenshot,
            afterPath: result.pageScreenshot,
            viewportName: result.viewport.name,
            detail: config.ai.detail,
          }));
        } catch (error) {
          result.findings.push(runtimeFinding(
            result.viewport.name,
            error instanceof Error ? error.message : String(error),
            true,
          ));
        }
      }
    }
  } finally {
    await browser.close();
  }

  const allFindings = results.flatMap((result) => result.findings);
  const deterministic = allFindings.filter((item) => !item.advisory);
  const failOn = options.failOn ?? config.output.failOn;

  return {
    schemaVersion: "1.0",
    project: config.project,
    url: parsedUrl.toString(),
    configPath,
    outputDirectory,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    summary: {
      passed: !shouldFail(deterministic, failOn),
      errors: deterministic.filter((item) => item.severity === "error").length,
      warnings: deterministic.filter((item) => item.severity === "warning").length,
      info: deterministic.filter((item) => item.severity === "info").length,
      advisoryFindings: allFindings.filter((item) => item.advisory).length + aiReviews.flatMap((review) => review.findings).length,
      failOn,
    },
    results,
    aiReviews,
    baselineUpdated: Boolean(options.updateBaselines),
  };
}
