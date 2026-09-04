import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AuditReport, Finding, ReportFormat } from "./types.js";

function allFindings(report: AuditReport): Finding[] {
  return report.results.flatMap((result) => result.findings);
}

function statusLabel(report: AuditReport): string {
  return report.summary.passed ? "PASS" : "FAIL";
}

function markdownCell(value: string | number | undefined): string {
  return String(value ?? "—").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

export function renderTerminal(report: AuditReport): string {
  const lines = [
    `VisualContract ${statusLabel(report)} — ${report.project}`,
    `${report.url} · ${report.results.length} viewport(s) · ${report.durationMs} ms`,
    `errors ${report.summary.errors} · warnings ${report.summary.warnings} · info ${report.summary.info} · advisory ${report.summary.advisoryFindings}`,
  ];

  for (const result of report.results) {
    lines.push("", `[${result.viewport.name}] ${result.viewport.width}×${result.viewport.height}`);
    if (result.findings.length === 0) {
      lines.push("  ✓ No findings");
      continue;
    }
    for (const item of result.findings) {
      const icon = item.severity === "error" ? "✗" : item.severity === "warning" ? "!" : "i";
      const advisory = item.advisory ? " [advisory]" : "";
      lines.push(`  ${icon} ${item.severity.toUpperCase()}${advisory} ${item.ruleId}: ${item.message}`);
      if (item.selector) lines.push(`    ${item.selector}`);
    }
  }

  for (const review of report.aiReviews) {
    lines.push("", `[${review.viewport}] AI advisory (${review.model}): ${review.summary}`);
    for (const item of review.findings) {
      lines.push(`  ~ ${item.severity.toUpperCase()} ${item.category}: ${item.message}`);
      lines.push(`    Suggestion: ${item.suggestion}`);
    }
  }
  return lines.join("\n");
}

export function renderMarkdown(report: AuditReport): string {
  const findings = allFindings(report);
  const lines = [
    `# VisualContract report: ${statusLabel(report)}`,
    "",
    `- Project: **${report.project}**`,
    `- URL: ${report.url}`,
    `- Result: **${statusLabel(report)}** (fail on \`${report.summary.failOn}\`)`,
    `- Findings: ${report.summary.errors} errors, ${report.summary.warnings} warnings, ${report.summary.info} info, ${report.summary.advisoryFindings} advisory`,
    `- Generated: ${report.generatedAt}`,
    "",
    "## Findings",
    "",
  ];

  if (findings.length === 0) {
    lines.push("No findings.");
  } else {
    lines.push("| Severity | Viewport | Rule | Selector | Message |", "| --- | --- | --- | --- | --- |");
    for (const item of findings) {
      lines.push(
        `| ${markdownCell(item.advisory ? `${item.severity} (advisory)` : item.severity)} | ${markdownCell(item.viewport)} | ${markdownCell(item.ruleId)} | ${markdownCell(item.selector)} | ${markdownCell(item.message)} |`,
      );
    }
  }

  if (report.aiReviews.length > 0) {
    lines.push("", "## AI advisory review", "", "> Advisory only. These findings never change the deterministic pass/fail result.");
    for (const review of report.aiReviews) {
      lines.push("", `### ${review.viewport} (${review.model})`, "", review.summary);
      for (const item of review.findings) {
        lines.push("", `- **${item.severity}: ${item.category}** — ${item.message} Fix: ${item.suggestion}`);
      }
    }
  }

  if (report.baselineUpdated) {
    lines.push("", "> Baselines were updated during this run. Review and commit the accepted images deliberately.");
  }
  lines.push("");
  return lines.join("\n");
}

export async function writeReports(
  report: AuditReport,
  format: ReportFormat,
): Promise<{ markdownPath?: string; jsonPath?: string }> {
  await mkdir(report.outputDirectory, { recursive: true });
  const written: { markdownPath?: string; jsonPath?: string } = {};
  if (format === "markdown" || format === "all") {
    written.markdownPath = path.join(report.outputDirectory, "report.md");
    await writeFile(written.markdownPath, renderMarkdown(report), "utf8");
  }
  if (format === "json" || format === "all") {
    written.jsonPath = path.join(report.outputDirectory, "report.json");
    await writeFile(written.jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  return written;
}

function escapeCommand(value: string): string {
  return value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

export function githubAnnotations(report: AuditReport): string[] {
  return allFindings(report)
    .filter((item) => !item.advisory && item.severity !== "info")
    .map((item) => {
      const command = item.severity === "error" ? "error" : "warning";
      const title = escapeCommand(`VisualContract · ${item.viewport} · ${item.ruleId}`);
      return `::${command} title=${title}::${escapeCommand(item.message)}`;
    });
}
