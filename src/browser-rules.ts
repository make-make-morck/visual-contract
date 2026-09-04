import type { Page } from "playwright";
import type { Finding, VisualContractConfig, ViewportConfig } from "./types.js";

interface BrowserRuleInput {
  viewport: string;
  width: number;
  maxFindings: number;
  overflow: VisualContractConfig["rules"]["overflow"];
  contrast: VisualContractConfig["rules"]["contrast"];
  touchTargets: VisualContractConfig["rules"]["touchTargets"];
  alignment: VisualContractConfig["rules"]["alignment"];
  spacing: VisualContractConfig["rules"]["spacing"];
}

interface BrowserFinding {
  ruleId: string;
  severity: "error" | "warning" | "info";
  viewport: string;
  message: string;
  selector?: string;
  expected?: string;
  actual?: string;
  evidence?: Record<string, unknown>;
}

export async function collectBrowserFindings(
  page: Page,
  config: VisualContractConfig,
  viewport: ViewportConfig,
): Promise<Finding[]> {
  const input: BrowserRuleInput = {
    viewport: viewport.name,
    width: viewport.width,
    maxFindings: config.output.maxFindingsPerRule,
    overflow: config.rules.overflow,
    contrast: config.rules.contrast,
    touchTargets: config.rules.touchTargets,
    alignment: config.rules.alignment,
    spacing: config.rules.spacing,
  };

  return page.evaluate((options: BrowserRuleInput): BrowserFinding[] => {
    const findings: BrowserFinding[] = [];
    const counts = new Map<string, number>();

    const add = (finding: BrowserFinding): void => {
      const count = counts.get(finding.ruleId) ?? 0;
      if (count >= options.maxFindings) return;
      counts.set(finding.ruleId, count + 1);
      findings.push(finding);
    };

    const rounded = (value: number): number => Math.round(value * 100) / 100;

    const visible = (element: Element): element is HTMLElement => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
    };

    const ignored = (element: Element, selectors: string[]): boolean => selectors.some((selector) => {
      try {
        return element.matches(selector) || Boolean(element.closest(selector));
      } catch {
        return false;
      }
    });

    const selectorFor = (element: Element): string => {
      if (element.id) return `#${CSS.escape(element.id)}`;
      const segments: string[] = [];
      let current: Element | null = element;
      while (current && current !== document.documentElement && segments.length < 5) {
        let segment = current.tagName.toLowerCase();
        const className = Array.from(current.classList).find((item) => /^[a-zA-Z][\w-]*$/.test(item));
        if (className) {
          segment += `.${CSS.escape(className)}`;
        } else if (current.parentElement) {
          const siblings = Array.from(current.parentElement.children).filter((sibling) => sibling.tagName === current?.tagName);
          if (siblings.length > 1) segment += `:nth-of-type(${siblings.indexOf(current) + 1})`;
        }
        segments.unshift(segment);
        current = current.parentElement;
      }
      return segments.join(" > ");
    };

    if (options.overflow.enabled) {
      const documentWidth = Math.max(
        document.documentElement.scrollWidth,
        document.body?.scrollWidth ?? 0,
      );
      if (documentWidth > options.width + options.overflow.tolerance) {
        add({
          ruleId: "overflow/document",
          severity: "error",
          viewport: options.viewport,
          message: `Document is ${rounded(documentWidth - options.width)}px wider than the viewport.`,
          expected: `scroll width <= ${options.width + options.overflow.tolerance}px`,
          actual: `${documentWidth}px`,
        });
      }

      for (const element of Array.from(document.querySelectorAll("body *"))) {
        if (!visible(element) || ignored(element, options.overflow.ignore)) continue;
        const rect = element.getBoundingClientRect();
        const leftOverflow = Math.max(0, -rect.left);
        const rightOverflow = Math.max(0, rect.right - options.width);
        const amount = Math.max(leftOverflow, rightOverflow);
        if (amount > options.overflow.tolerance) {
          add({
            ruleId: "overflow/element",
            severity: "error",
            viewport: options.viewport,
            message: `Element extends ${rounded(amount)}px beyond the viewport.`,
            selector: selectorFor(element),
            expected: `within 0–${options.width}px`,
            actual: `${rounded(rect.left)}–${rounded(rect.right)}px`,
            evidence: { left: rounded(rect.left), right: rounded(rect.right), width: rounded(rect.width) },
          });
        }
      }
    }

    type Rgba = { r: number; g: number; b: number; a: number };
    const parseColor = (value: string): Rgba | null => {
      const match = value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)/i);
      if (!match) return null;
      return {
        r: Number(match[1]),
        g: Number(match[2]),
        b: Number(match[3]),
        a: match[4] === undefined ? 1 : Number(match[4]),
      };
    };
    const blend = (foreground: Rgba, background: Rgba): Rgba => ({
      r: foreground.r * foreground.a + background.r * (1 - foreground.a),
      g: foreground.g * foreground.a + background.g * (1 - foreground.a),
      b: foreground.b * foreground.a + background.b * (1 - foreground.a),
      a: 1,
    });
    const backgroundFor = (element: Element): Rgba => {
      const layers: Rgba[] = [];
      let current: Element | null = element;
      while (current) {
        const parsed = parseColor(getComputedStyle(current).backgroundColor);
        if (parsed && parsed.a > 0) layers.push(parsed);
        current = current.parentElement;
      }
      let result: Rgba = { r: 255, g: 255, b: 255, a: 1 };
      for (const layer of layers.reverse()) result = blend(layer, result);
      return result;
    };
    const luminance = (color: Rgba): number => {
      const convert = (channel: number): number => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * convert(color.r) + 0.7152 * convert(color.g) + 0.0722 * convert(color.b);
    };
    const contrastRatio = (a: Rgba, b: Rgba): number => {
      const first = luminance(a);
      const second = luminance(b);
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    };

    if (options.contrast.enabled) {
      for (const element of Array.from(document.querySelectorAll("body *"))) {
        if (!visible(element) || ignored(element, options.contrast.ignore)) continue;
        const hasDirectText = Array.from(element.childNodes).some(
          (node) => node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim()),
        );
        if (!hasDirectText) continue;
        const style = getComputedStyle(element);
        const foregroundRaw = parseColor(style.color);
        if (!foregroundRaw) continue;
        const background = backgroundFor(element);
        const foreground = blend(foregroundRaw, background);
        const ratio = contrastRatio(foreground, background);
        const fontSize = Number.parseFloat(style.fontSize);
        const fontWeight = Number.parseInt(style.fontWeight, 10) || 400;
        const large = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
        const required = large ? options.contrast.largeTextRatio : options.contrast.minimumRatio;
        if (ratio + 0.001 < required) {
          add({
            ruleId: "contrast/text",
            severity: "error",
            viewport: options.viewport,
            message: `Text contrast is ${rounded(ratio)}:1; this rule requires ${required}:1.`,
            selector: selectorFor(element),
            expected: `>= ${required}:1`,
            actual: `${rounded(ratio)}:1`,
            evidence: { color: style.color, backgroundColor: `rgb(${rounded(background.r)}, ${rounded(background.g)}, ${rounded(background.b)})` },
          });
        }
      }
    }

    if (options.touchTargets.enabled) {
      const targetSelector = "a[href], button, input:not([type='hidden']), select, textarea, [role='button'], [role='link'], [tabindex]:not([tabindex='-1'])";
      for (const element of Array.from(document.querySelectorAll(targetSelector))) {
        if (!visible(element) || ignored(element, options.touchTargets.ignore)) continue;
        if (element instanceof HTMLButtonElement && element.disabled) continue;
        const rect = element.getBoundingClientRect();
        if (rect.width < options.touchTargets.minimumSize || rect.height < options.touchTargets.minimumSize) {
          add({
            ruleId: "touch-target/size",
            severity: "error",
            viewport: options.viewport,
            message: `Interactive target is ${rounded(rect.width)}×${rounded(rect.height)}px.`,
            selector: selectorFor(element),
            expected: `at least ${options.touchTargets.minimumSize}×${options.touchTargets.minimumSize}px`,
            actual: `${rounded(rect.width)}×${rounded(rect.height)}px`,
          });
        }
      }
    }

    for (const group of options.alignment) {
      const elements: Element[] = [];
      const missing: string[] = [];
      for (const selector of group.selectors) {
        let matches: Element[] = [];
        try {
          matches = Array.from(document.querySelectorAll(selector)).filter(visible);
        } catch {
          missing.push(`${selector} (invalid)`);
        }
        if (matches.length === 0) missing.push(selector);
        elements.push(...matches);
      }
      if (missing.length > 0) {
        add({
          ruleId: "alignment/selector-missing",
          severity: "warning",
          viewport: options.viewport,
          message: `Alignment group \"${group.name}\" could not find: ${missing.join(", ")}.`,
        });
        continue;
      }
      const values = elements.map((element) => {
        const rect = element.getBoundingClientRect();
        if (group.edge === "left") return rect.left;
        if (group.edge === "right") return rect.right;
        if (group.edge === "top") return rect.top;
        if (group.edge === "bottom") return rect.bottom;
        if (group.edge === "centerX") return rect.left + rect.width / 2;
        return rect.top + rect.height / 2;
      });
      const spread = Math.max(...values) - Math.min(...values);
      if (spread > group.tolerance) {
        add({
          ruleId: "alignment/group",
          severity: group.severity,
          viewport: options.viewport,
          message: `Alignment group \"${group.name}\" differs by ${rounded(spread)}px on the ${group.edge} edge.`,
          expected: `spread <= ${group.tolerance}px`,
          actual: `${rounded(spread)}px`,
          evidence: { values: values.map(rounded), selectors: group.selectors },
        });
      }
    }

    for (const group of options.spacing) {
      const elements: Element[] = [];
      const missing: string[] = [];
      for (const selector of group.selectors) {
        let element: Element | null = null;
        try {
          element = document.querySelector(selector);
        } catch {
          missing.push(`${selector} (invalid)`);
        }
        if (!element || !visible(element)) missing.push(selector);
        else elements.push(element);
      }
      if (missing.length > 0) {
        add({
          ruleId: "spacing/selector-missing",
          severity: "warning",
          viewport: options.viewport,
          message: `Spacing group \"${group.name}\" could not find: ${missing.join(", ")}.`,
        });
        continue;
      }
      const rects = elements.map((element) => element.getBoundingClientRect());
      const gaps: number[] = [];
      for (let index = 1; index < rects.length; index += 1) {
        const previous = rects[index - 1];
        const current = rects[index];
        if (!previous || !current) continue;
        gaps.push(group.axis === "horizontal" ? current.left - previous.right : current.top - previous.bottom);
      }
      const spread = Math.max(...gaps) - Math.min(...gaps);
      if (spread > group.tolerance) {
        add({
          ruleId: "spacing/group",
          severity: group.severity,
          viewport: options.viewport,
          message: `Spacing group \"${group.name}\" has gap variance of ${rounded(spread)}px.`,
          expected: `gap spread <= ${group.tolerance}px`,
          actual: `${rounded(spread)}px`,
          evidence: { gaps: gaps.map(rounded), selectors: group.selectors, axis: group.axis },
        });
      }
    }

    return findings;
  }, input);
}
