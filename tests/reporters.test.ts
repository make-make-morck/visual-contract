import { describe, expect, it } from "vitest";
import { githubAnnotations, renderMarkdown, renderTerminal } from "../src/reporters.js";
import type { AuditReport } from "../src/types.js";

const report: AuditReport = {
  schemaVersion: "1.0",
  project: "Fixture",
  url: "https://example.test/",
  generatedAt: "2026-01-01T00:00:00.000Z",
  durationMs: 12,
  configPath: "/visual-contract.yml",
  outputDirectory: "/results",
  baselineUpdated: false,
  summary: { errors: 1, warnings: 0, info: 0, advisoryFindings: 0, passed: false, failOn: "error" },
  results: [{
    viewport: { name: "mobile", width: 390, height: 844 },
    url: "https://example.test/",
    durationMs: 10,
    findings: [{ ruleId: "overflow/document", severity: "error", viewport: "mobile", message: "Too wide | by 10px" }],
  }],
  aiReviews: [],
};

describe("reporters", () => {
  it("renders concise terminal and Markdown output", () => {
    expect(renderTerminal(report)).toContain("VisualContract FAIL");
    expect(renderMarkdown(report)).toContain("Too wide \\| by 10px");
  });

  it("emits GitHub annotations", () => {
    expect(githubAnnotations(report)).toEqual([
      "::error title=VisualContract · mobile · overflow/document::Too wide | by 10px",
    ]);
  });
});
