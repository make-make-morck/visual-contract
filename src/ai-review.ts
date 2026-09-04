import { readFile } from "node:fs/promises";
import type { AiReview } from "./types.js";

type FetchLike = typeof fetch;

interface ReviewOptions {
  apiKey?: string;
  baseUrl?: string;
  model: string;
  beforePath: string;
  afterPath: string;
  viewportName: string;
  detail: "low" | "high" | "auto";
  fetchImpl?: FetchLike;
}

const reviewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "summary", "findings"],
  properties: {
    verdict: { type: "string", enum: ["pass", "review"] },
    summary: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["severity", "category", "message", "suggestion"],
        properties: {
          severity: { type: "string", enum: ["warning", "info"] },
          category: { type: "string" },
          message: { type: "string" },
          suggestion: { type: "string" },
        },
      },
    },
  },
} as const;

function toDataUrl(buffer: Buffer): string {
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

function extractOutputText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    throw new Error("OpenAI returned an invalid response.");
  }
  const response = payload as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ text?: unknown }> }>;
  };
  if (typeof response.output_text === "string") return response.output_text;
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === "string") return content.text;
    }
  }
  throw new Error("OpenAI response did not contain text output.");
}

export async function reviewScreenshots(options: ReviewOptions): Promise<AiReview> {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set. Deterministic checks still ran normally.");
  }

  const [before, after] = await Promise.all([
    readFile(options.beforePath),
    readFile(options.afterPath),
  ]);
  const endpoint = `${(options.baseUrl ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "")}/responses`;
  const request = options.fetchImpl ?? fetch;
  const response = await request(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: options.model,
      store: false,
      input: [{
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              `Review the before and after screenshots for the ${options.viewportName} viewport.`,
              "Report only meaningful visual regressions. Ignore harmless anti-aliasing, tiny rendering noise, timestamps, and expected dynamic content.",
              "The result is advisory: cite visible evidence, give a practical fix, and acknowledge ambiguity.",
            ].join(" "),
          },
          { type: "input_text", text: "BEFORE (accepted baseline)" },
          { type: "input_image", image_url: toDataUrl(before), detail: options.detail },
          { type: "input_text", text: "AFTER (current page)" },
          { type: "input_image", image_url: toDataUrl(after), detail: options.detail },
        ],
      }],
      text: {
        format: {
          type: "json_schema",
          name: "visual_contract_review",
          strict: true,
          schema: reviewSchema,
        },
      },
    }),
  });

  if (!response.ok) {
    const message = (await response.text()).slice(0, 500);
    throw new Error(`OpenAI request failed (${response.status}): ${message}`);
  }

  const text = extractOutputText(await response.json());
  const parsed = JSON.parse(text) as AiReview;
  if (!parsed || typeof parsed.summary !== "string" || !Array.isArray(parsed.findings)) {
    throw new Error("OpenAI returned JSON that did not match the review schema.");
  }
  return { ...parsed, viewport: options.viewportName, model: options.model };
}
