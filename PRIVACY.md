# Privacy

Deterministic VisualContract checks run on the machine or CI runner where the command is executed. They inspect the rendered DOM and styles and write reports and screenshots only to the configured local directories.

AI review is opt-in. When `ai.enabled` or `--ai-review` is used, accepted and current full-page screenshots are sent to the configured OpenAI Responses API endpoint. Screenshots may contain personal data, customer data, authentication state, or confidential application content. Do not enable AI review for such pages unless your organization has approved the data flow and retention terms.

The API request sets `store: false`. API keys are read from `OPENAI_API_KEY`; never commit them. Reports may reproduce visible UI details and should be handled according to the source application's data classification.

VisualContract does not add analytics or telemetry in v0.1.0.
