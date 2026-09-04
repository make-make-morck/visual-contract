import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { reviewScreenshots } from "../src/ai-review.js";

describe("AI advisory review", () => {
  it("uses structured output and returns advisory findings", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "visual-contract-ai-"));
    const before = path.join(directory, "before.png");
    const after = path.join(directory, "after.png");
    await Promise.all([writeFile(before, Buffer.from("before")), writeFile(after, Buffer.from("after"))]);
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { store?: boolean; text?: { format?: { type?: string } } };
      expect(body.store).toBe(false);
      expect(body.text?.format?.type).toBe("json_schema");
      return new Response(JSON.stringify({
        output_text: JSON.stringify({
          verdict: "review",
          summary: "A primary control moved.",
          findings: [{ severity: "warning", category: "layout", message: "Button moved.", suggestion: "Restore its anchor." }],
        }),
      }), { status: 200, headers: { "content-type": "application/json" } });
    });

    const result = await reviewScreenshots({
      apiKey: "test-key",
      model: "test-model",
      beforePath: before,
      afterPath: after,
      viewportName: "mobile",
      detail: "low",
      fetchImpl,
    });
    expect(result.viewport).toBe("mobile");
    expect(result.findings).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
