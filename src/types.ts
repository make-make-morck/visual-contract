export type Severity = "error" | "warning" | "info";
export type FailOn = "error" | "warning" | "never";
export type ReportFormat = "terminal" | "markdown" | "json" | "all";
export type AlignmentEdge = "left" | "right" | "top" | "bottom" | "centerX" | "centerY";
export type SpacingAxis = "horizontal" | "vertical";

export interface ViewportConfig {
  name: string;
  width: number;
  height: number;
  deviceScaleFactor?: number;
}

export interface ToggleRule {
  enabled: boolean;
  ignore: string[];
}

export interface OverflowRule extends ToggleRule {
  tolerance: number;
}

export interface ContrastRule extends ToggleRule {
  minimumRatio: number;
  largeTextRatio: number;
}

export interface TouchTargetRule extends ToggleRule {
  minimumSize: number;
}

export interface AlignmentGroup {
  name: string;
  selectors: string[];
  edge: AlignmentEdge;
  tolerance: number;
  severity: Severity;
}

export interface SpacingGroup {
  name: string;
  selectors: string[];
  axis: SpacingAxis;
  tolerance: number;
  severity: Severity;
}

export interface ProtectedRegion {
  name: string;
  selector: string;
  maxDiffRatio: number;
  severity: Severity;
}

export interface AiConfig {
  enabled: boolean;
  model: string;
  detail: "low" | "high" | "auto";
  maxViewports: number;
}

export interface VisualContractConfig {
  version: 1;
  project: string;
  viewports: ViewportConfig[];
  navigation: {
    waitUntil: "load" | "domcontentloaded" | "networkidle";
    timeoutMs: number;
    stabilizeMs: number;
  };
  rules: {
    overflow: OverflowRule;
    contrast: ContrastRule;
    touchTargets: TouchTargetRule;
    alignment: AlignmentGroup[];
    spacing: SpacingGroup[];
    protectedRegions: ProtectedRegion[];
  };
  output: {
    directory: string;
    baselineDirectory: string;
    failOn: FailOn;
    maxFindingsPerRule: number;
  };
  browser: {
    channel?: string;
  };
  ai: AiConfig;
}

export interface Finding {
  ruleId: string;
  severity: Severity;
  viewport: string;
  message: string;
  selector?: string;
  expected?: string;
  actual?: string;
  evidence?: Record<string, unknown>;
  advisory?: boolean;
}

export interface ViewportResult {
  viewport: ViewportConfig;
  url: string;
  durationMs: number;
  findings: Finding[];
  pageScreenshot?: string;
  baselineScreenshot?: string;
}

export interface AiFinding {
  severity: "warning" | "info";
  category: string;
  message: string;
  suggestion: string;
}

export interface AiReview {
  viewport: string;
  model: string;
  verdict: "pass" | "review";
  summary: string;
  findings: AiFinding[];
}

export interface AuditSummary {
  errors: number;
  warnings: number;
  info: number;
  advisoryFindings: number;
  passed: boolean;
  failOn: FailOn;
}

export interface AuditReport {
  schemaVersion: "1.0";
  project: string;
  url: string;
  generatedAt: string;
  durationMs: number;
  configPath: string;
  outputDirectory: string;
  baselineUpdated: boolean;
  summary: AuditSummary;
  results: ViewportResult[];
  aiReviews: AiReview[];
}

export interface AuditOptions {
  configPath?: string;
  cwd?: string;
  outputDirectory?: string;
  headed?: boolean;
  updateBaselines?: boolean;
  aiReview?: boolean;
  failOn?: FailOn;
  browserChannel?: string;
}
