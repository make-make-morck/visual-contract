#!/usr/bin/env node
import { Command, Option } from "commander";
import { auditUrl } from "./audit.js";
import { writeStarterConfig } from "./config.js";
import { githubAnnotations, renderTerminal, writeReports } from "./reporters.js";
import type { FailOn, ReportFormat } from "./types.js";

const program = new Command();

program
  .name("visual-contract")
  .description("Turn designer-authored visual rules into repeatable web UI checks.")
  .version("0.1.0");

program
  .command("init")
  .description("Create a documented visual-contract.yml starter configuration.")
  .argument("[path]", "configuration path", "visual-contract.yml")
  .option("--force", "overwrite an existing configuration", false)
  .action(async (filePath: string, options: { force: boolean }) => {
    await writeStarterConfig(filePath, options.force);
    console.log(`Created ${filePath}`);
  });

program
  .command("check")
  .description("Check a local or deployed web page against its visual contract.")
  .argument("<url>", "http:// or https:// page URL")
  .option("-c, --config <path>", "configuration path")
  .addOption(new Option("-f, --format <format>", "report format").choices(["terminal", "markdown", "json", "all"]).default("all"))
  .option("-o, --output-dir <path>", "override the report output directory")
  .option("--headed", "show the browser while checking", false)
  .option("--update-baselines", "accept current protected regions and pages as baselines", false)
  .option("--ai-review", "enable opt-in advisory OpenAI screenshot review", false)
  .addOption(new Option("--fail-on <severity>", "failure threshold").choices(["error", "warning", "never"]))
  .option("--browser-channel <channel>", "Playwright browser channel, such as chrome or msedge")
  .option("--github-annotations", "emit GitHub workflow annotations", process.env.GITHUB_ACTIONS === "true")
  .action(async (url: string, options: {
    config?: string;
    format: ReportFormat;
    outputDir?: string;
    headed: boolean;
    updateBaselines: boolean;
    aiReview: boolean;
    failOn?: FailOn;
    browserChannel?: string;
    githubAnnotations: boolean;
  }) => {
    const report = await auditUrl(url, {
      ...(options.config ? { configPath: options.config } : {}),
      ...(options.outputDir ? { outputDirectory: options.outputDir } : {}),
      ...(options.failOn ? { failOn: options.failOn } : {}),
      ...(options.browserChannel ? { browserChannel: options.browserChannel } : {}),
      ...(options.aiReview ? { aiReview: true } : {}),
      headed: options.headed,
      updateBaselines: options.updateBaselines,
    });

    if (options.format === "terminal" || options.format === "all") {
      console.log(renderTerminal(report));
    }
    await writeReports(report, options.format);
    if (options.githubAnnotations) {
      for (const annotation of githubAnnotations(report)) console.log(annotation);
    }
    process.exitCode = report.summary.passed ? 0 : 1;
  });

program.parseAsync().catch((error: unknown) => {
  console.error(`VisualContract failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
});
