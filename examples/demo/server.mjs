import { createReadStream } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT ?? 4173);

const server = createServer((request, response) => {
  const requestPath = request.url === "/" ? "/pass.html" : (request.url ?? "/pass.html");
  const filePath = normalize(join(root, requestPath.split("?")[0] ?? "/pass.html"));
  if (!filePath.startsWith(root)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  response.setHeader("content-type", extname(filePath) === ".html" ? "text/html; charset=utf-8" : "text/plain; charset=utf-8");
  const stream = createReadStream(filePath);
  stream.on("error", () => response.writeHead(404).end("Not found"));
  stream.pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`VisualContract demo: http://127.0.0.1:${port}`);
});
