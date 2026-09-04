import * as core from "@actions/core";
import { auditUrl } from "./audit.js";
import { githubAnnotations, renderMarkdown, renderTerminal, writeReports } from "./reporters.js";
import type { FailOn } from "./types.js";

async function run(): Promise<void> {
  const url = core.getInput("url", { required: true });
  const configPath = core.getInput("config") || undefined;
  const outputDirectory = core.getInput("output-directory") || undefined;
  const browserChannel = core.getInput("browser-channel") || "chrome";
  const failOnValue = core.getInput("fail-on") || "error";
  if (!(["error", "warning", "never"].includes(failOnValue))) {
    throw new Error(`Unsupported fail-on value: ${failOnValue}`);
  }

  const report = await auditUrl(url, {
    ...(configPath ? { configPath } : {}),
    ...(outputDirectory ? { outputDirectory } : {}),
    browserChannel,
    failOn: failOnValue as FailOn,
    aiReview: core.getBooleanInput("ai-review"),
  });

  console.log(renderTerminal(report));
  const written = await writeReports(report, "all");
  for (const annotation of githubAnnotations(report)) console.log(annotation);
  await core.summary.addRaw(renderMarkdown(report)).write();

  core.setOutput("passed", report.summary.passed);
  core.setOutput("errors", report.summary.errors);
  core.setOutput("warnings", report.summary.warnings);
  core.setOutput("report-json", written.jsonPath ?? "");
  core.setOutput("report-markdown", written.markdownPath ?? "");
  if (!report.summary.passed) core.setFailed("VisualContract found visual rule violations.");
}

run().catch((error: unknown) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
