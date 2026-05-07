import fs from "node:fs";
import path from "node:path";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const host = process.env.HORARIO_HOST || "127.0.0.1";
const port = Number.parseInt(process.env.HORARIO_PORT || "5500", 10);

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"]
]);

function getContentType(filePath) {
  return contentTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream";
}

function resolveRequestPath(urlPathname) {
  const decodedPath = decodeURIComponent(urlPathname === "/" ? "/index.html" : urlPathname);
  const filePath = path.normalize(path.join(rootDir, decodedPath));

  if (!filePath.startsWith(rootDir)) {
    return null;
  }

  return filePath;
}

const server = createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${host}`);

  if (requestUrl.pathname === "/favicon.ico") {
    response.writeHead(204);
    response.end();
    return;
  }

  const filePath = resolveRequestPath(requestUrl.pathname);

  if (!filePath) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not Found");
    return;
  }

  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": getContentType(filePath)
  });
  fs.createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Horario is serving at http://${host}:${port}/`);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Horario may already be running.`);
    process.exit(0);
  }

  throw error;
});
