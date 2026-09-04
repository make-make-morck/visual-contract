import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditUrl } from "../src/audit.js";

let server: Server;
let origin = "";
let directory = "";
let configPath = "";

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "visual-contract-e2e-"));
  configPath = path.join(directory, "visual-contract.yml");
  await writeFile(configPath, `version: 1
project: e2e fixture
viewports:
  - { name: desktop, width: 800, height: 600 }
navigation: { waitUntil: load, timeoutMs: 10000, stabilizeMs: 0 }
rules:
  overflow: { enabled: true, tolerance: 1, ignore: [] }
  contrast: { enabled: false, minimumRatio: 4.5, largeTextRatio: 3, ignore: [] }
  touchTargets: { enabled: false, minimumSize: 24, ignore: [] }
  alignment: []
  spacing: []
  protectedRegions: []
output:
  directory: results
  baselineDirectory: baselines
  failOn: error
  maxFindingsPerRule: 20
browser: {}
ai: { enabled: false, model: gpt-5.6-terra, detail: low, maxViewports: 1 }
`, "utf8");

  server = createServer((request, response) => {
    const broken = request.url === "/fail";
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<!doctype html><meta name="viewport" content="width=device-width"><style>*{box-sizing:border-box}body{margin:0}.fixture{width:${broken ? "120vw" : "100%"};height:40px;background:#222}</style><div class="fixture"></div>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  origin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

function localBrowser(): { browserChannel?: string } {
  return process.platform === "win32" && !process.env.CI ? { browserChannel: "chrome" } : {};
}

describe("browser audit", () => {
  it("passes a conforming page", async () => {
    const report = await auditUrl(`${origin}/pass`, { cwd: directory, configPath, ...localBrowser() });
    expect(report.summary.passed).toBe(true);
    expect(report.summary.errors).toBe(0);
  });

  it("fails horizontal overflow", async () => {
    const report = await auditUrl(`${origin}/fail`, { cwd: directory, configPath, ...localBrowser() });
    expect(report.summary.passed).toBe(false);
    expect(report.results[0]?.findings.some((finding) => finding.ruleId === "overflow/document")).toBe(true);
  });
});
