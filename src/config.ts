import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import type {
  AiConfig,
  AlignmentEdge,
  FailOn,
  Severity,
  SpacingAxis,
  VisualContractConfig,
} from "./types.js";

const CONFIG_NAMES = ["visual-contract.yml", "visual-contract.yaml"];
const SEVERITIES = new Set<Severity>(["error", "warning", "info"]);
const FAIL_ON_VALUES = new Set<FailOn>(["error", "warning", "never"]);
const ALIGNMENT_EDGES = new Set<AlignmentEdge>([
  "left",
  "right",
  "top",
  "bottom",
  "centerX",
  "centerY",
]);
const SPACING_AXES = new Set<SpacingAxis>(["horizontal", "vertical"]);

export const DEFAULT_CONFIG: VisualContractConfig = {
  version: 1,
  project: "My web interface",
  viewports: [
    { name: "mobile", width: 390, height: 844, deviceScaleFactor: 1 },
    { name: "desktop", width: 1440, height: 900, deviceScaleFactor: 1 },
  ],
  navigation: {
    waitUntil: "networkidle",
    timeoutMs: 30_000,
    stabilizeMs: 300,
  },
  rules: {
    overflow: { enabled: true, tolerance: 1, ignore: [] },
    contrast: { enabled: true, minimumRatio: 4.5, largeTextRatio: 3, ignore: [] },
    touchTargets: { enabled: true, minimumSize: 24, ignore: [] },
    alignment: [],
    spacing: [],
    protectedRegions: [],
  },
  output: {
    directory: "visual-contract-results",
    baselineDirectory: ".visual-contract/baselines",
    failOn: "error",
    maxFindingsPerRule: 50,
  },
  browser: {},
  ai: {
    enabled: false,
    model: "gpt-5.6-terra",
    detail: "high",
    maxViewports: 2,
  },
};

export const CONFIG_TEMPLATE = `# VisualContract configuration
version: 1
project: My web interface

viewports:
  - name: mobile
    width: 390
    height: 844
  - name: desktop
    width: 1440
    height: 900

navigation:
  waitUntil: networkidle
  timeoutMs: 30000
  stabilizeMs: 300

rules:
  overflow:
    enabled: true
    tolerance: 1
    ignore: []

  contrast:
    enabled: true
    minimumRatio: 4.5
    largeTextRatio: 3
    ignore: []

  touchTargets:
    enabled: true
    minimumSize: 24
    ignore: []

  # Compare a shared edge across two or more selectors.
  alignment:
    - name: card headings
      selectors: [".card:nth-of-type(1) h2", ".card:nth-of-type(2) h2"]
      edge: top
      tolerance: 2
      severity: error

  # Check whether consecutive elements have equal gaps.
  spacing:
    - name: navigation spacing
      selectors: ["nav a:nth-of-type(1)", "nav a:nth-of-type(2)", "nav a:nth-of-type(3)"]
      axis: horizontal
      tolerance: 2
      severity: warning

  # Record with: visual-contract check <url> --update-baselines
  protectedRegions:
    - name: primary navigation
      selector: header
      maxDiffRatio: 0.01
      severity: error

output:
  directory: visual-contract-results
  baselineDirectory: .visual-contract/baselines
  failOn: error
  maxFindingsPerRule: 50

browser: {}
  # channel: chrome

# Optional and advisory. Requires OPENAI_API_KEY or --ai-review.
ai:
  enabled: false
  model: gpt-5.6-terra
  detail: high
  maxViewports: 2
`;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numberValue(value: unknown, fallback: number, minimum = 0): number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function severityValue(value: unknown, fallback: Severity): Severity {
  return typeof value === "string" && SEVERITIES.has(value as Severity) ? (value as Severity) : fallback;
}

function parseAi(raw: unknown): AiConfig {
  const input = record(raw);
  const detail = input.detail === "low" || input.detail === "auto" || input.detail === "high"
    ? input.detail
    : DEFAULT_CONFIG.ai.detail;
  return {
    enabled: booleanValue(input.enabled, DEFAULT_CONFIG.ai.enabled),
    model: stringValue(input.model, DEFAULT_CONFIG.ai.model),
    detail,
    maxViewports: Math.max(1, Math.floor(numberValue(input.maxViewports, DEFAULT_CONFIG.ai.maxViewports, 1))),
  };
}

export function normalizeConfig(rawValue: unknown): VisualContractConfig {
  if (!isRecord(rawValue)) {
    throw new Error("Configuration must be a YAML object.");
  }

  const version = rawValue.version;
  if (version !== 1) {
    throw new Error(`Unsupported configuration version: ${String(version)}. Expected version: 1.`);
  }

  const navigation = record(rawValue.navigation);
  const rules = record(rawValue.rules);
  const overflow = record(rules.overflow);
  const contrast = record(rules.contrast);
  const touchTargets = record(rules.touchTargets);
  const output = record(rawValue.output);
  const browser = record(rawValue.browser);

  const viewportsInput = Array.isArray(rawValue.viewports) ? rawValue.viewports : [];
  if (viewportsInput.length === 0) {
    throw new Error("At least one viewport is required.");
  }
  const viewports = viewportsInput.map((item, index) => {
    const viewport = record(item);
    const width = numberValue(viewport.width, 0, 1);
    const height = numberValue(viewport.height, 0, 1);
    if (width === 0 || height === 0) {
      throw new Error(`Viewport ${index + 1} must have positive width and height.`);
    }
    return {
      name: stringValue(viewport.name, `viewport-${index + 1}`),
      width: Math.floor(width),
      height: Math.floor(height),
      deviceScaleFactor: numberValue(viewport.deviceScaleFactor, 1, 0.1),
    };
  });
  const viewportNames = new Set(viewports.map((viewport) => viewport.name));
  if (viewportNames.size !== viewports.length) {
    throw new Error("Viewport names must be unique.");
  }

  const alignmentInput = Array.isArray(rules.alignment) ? rules.alignment : [];
  const alignment = alignmentInput.map((item, index) => {
    const group = record(item);
    const selectors = stringArray(group.selectors);
    if (selectors.length < 2) {
      throw new Error(`Alignment group ${index + 1} needs at least two selectors.`);
    }
    const edge = stringValue(group.edge, "left") as AlignmentEdge;
    if (!ALIGNMENT_EDGES.has(edge)) {
      throw new Error(`Alignment group ${index + 1} has an unsupported edge: ${edge}.`);
    }
    return {
      name: stringValue(group.name, `alignment-${index + 1}`),
      selectors,
      edge,
      tolerance: numberValue(group.tolerance, 2),
      severity: severityValue(group.severity, "error"),
    };
  });

  const spacingInput = Array.isArray(rules.spacing) ? rules.spacing : [];
  const spacing = spacingInput.map((item, index) => {
    const group = record(item);
    const selectors = stringArray(group.selectors);
    if (selectors.length < 3) {
      throw new Error(`Spacing group ${index + 1} needs at least three selectors.`);
    }
    const axis = stringValue(group.axis, "horizontal") as SpacingAxis;
    if (!SPACING_AXES.has(axis)) {
      throw new Error(`Spacing group ${index + 1} has an unsupported axis: ${axis}.`);
    }
    return {
      name: stringValue(group.name, `spacing-${index + 1}`),
      selectors,
      axis,
      tolerance: numberValue(group.tolerance, 2),
      severity: severityValue(group.severity, "warning"),
    };
  });

  const protectedInput = Array.isArray(rules.protectedRegions) ? rules.protectedRegions : [];
  const protectedRegions = protectedInput.map((item, index) => {
    const region = record(item);
    const selector = stringValue(region.selector, "");
    if (!selector) {
      throw new Error(`Protected region ${index + 1} needs a selector.`);
    }
    return {
      name: stringValue(region.name, `region-${index + 1}`),
      selector,
      maxDiffRatio: numberValue(region.maxDiffRatio, 0.01),
      severity: severityValue(region.severity, "error"),
    };
  });

  const waitUntil = navigation.waitUntil === "load" || navigation.waitUntil === "domcontentloaded" || navigation.waitUntil === "networkidle"
    ? navigation.waitUntil
    : DEFAULT_CONFIG.navigation.waitUntil;
  const failOn = typeof output.failOn === "string" && FAIL_ON_VALUES.has(output.failOn as FailOn)
    ? (output.failOn as FailOn)
    : DEFAULT_CONFIG.output.failOn;
  const browserChannel = typeof browser.channel === "string" && browser.channel.trim()
    ? browser.channel.trim()
    : undefined;

  return {
    version: 1,
    project: stringValue(rawValue.project, DEFAULT_CONFIG.project),
    viewports,
    navigation: {
      waitUntil,
      timeoutMs: Math.floor(numberValue(navigation.timeoutMs, DEFAULT_CONFIG.navigation.timeoutMs, 1)),
      stabilizeMs: Math.floor(numberValue(navigation.stabilizeMs, DEFAULT_CONFIG.navigation.stabilizeMs)),
    },
    rules: {
      overflow: {
        enabled: booleanValue(overflow.enabled, DEFAULT_CONFIG.rules.overflow.enabled),
        tolerance: numberValue(overflow.tolerance, DEFAULT_CONFIG.rules.overflow.tolerance),
        ignore: stringArray(overflow.ignore),
      },
      contrast: {
        enabled: booleanValue(contrast.enabled, DEFAULT_CONFIG.rules.contrast.enabled),
        minimumRatio: numberValue(contrast.minimumRatio, DEFAULT_CONFIG.rules.contrast.minimumRatio, 1),
        largeTextRatio: numberValue(contrast.largeTextRatio, DEFAULT_CONFIG.rules.contrast.largeTextRatio, 1),
        ignore: stringArray(contrast.ignore),
      },
      touchTargets: {
        enabled: booleanValue(touchTargets.enabled, DEFAULT_CONFIG.rules.touchTargets.enabled),
        minimumSize: numberValue(touchTargets.minimumSize, DEFAULT_CONFIG.rules.touchTargets.minimumSize, 1),
        ignore: stringArray(touchTargets.ignore),
      },
      alignment,
      spacing,
      protectedRegions,
    },
    output: {
      directory: stringValue(output.directory, DEFAULT_CONFIG.output.directory),
      baselineDirectory: stringValue(output.baselineDirectory, DEFAULT_CONFIG.output.baselineDirectory),
      failOn,
      maxFindingsPerRule: Math.max(1, Math.floor(numberValue(output.maxFindingsPerRule, DEFAULT_CONFIG.output.maxFindingsPerRule, 1))),
    },
    browser: browserChannel ? { channel: browserChannel } : {},
    ai: parseAi(rawValue.ai),
  };
}

export async function findConfig(cwd = process.cwd()): Promise<string> {
  for (const name of CONFIG_NAMES) {
    const candidate = path.join(cwd, name);
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next supported filename.
    }
  }
  throw new Error(`No VisualContract config found in ${cwd}. Run \"visual-contract init\" first.`);
}

export async function loadConfig(configPath?: string, cwd = process.cwd()): Promise<{ config: VisualContractConfig; path: string }> {
  const resolved = configPath ? path.resolve(cwd, configPath) : await findConfig(cwd);
  const source = await readFile(resolved, "utf8");
  let raw: unknown;
  try {
    raw = parse(source);
  } catch (error) {
    throw new Error(`Could not parse ${resolved}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { config: normalizeConfig(raw), path: resolved };
}

export async function writeStarterConfig(targetPath: string, force = false): Promise<void> {
  if (!force) {
    try {
      await access(targetPath);
      throw new Error(`${targetPath} already exists. Use --force to replace it.`);
    } catch (error) {
      if (error instanceof Error && error.message.includes("already exists")) {
        throw error;
      }
    }
  }
  await writeFile(targetPath, CONFIG_TEMPLATE, "utf8");
}
