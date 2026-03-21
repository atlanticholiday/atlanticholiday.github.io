import fs from "node:fs";
import path from "node:path";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

function getContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  switch (extension) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    default:
      return "application/octet-stream";
  }
}

function startServer() {
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url, "http://127.0.0.1");
    if (requestUrl.pathname === "/favicon.ico") {
      response.writeHead(204);
      response.end();
      return;
    }
    const relativePath = decodeURIComponent(requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname);
    const filePath = path.normalize(path.join(rootDir, relativePath));

    if (!filePath.startsWith(rootDir)) {
      response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Forbidden");
      return;
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not Found");
      return;
    }

    response.writeHead(200, { "Content-Type": getContentType(filePath) });
    fs.createReadStream(filePath).pipe(response);
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, port: address.port });
    });
  });
}

async function main() {
  if (!fs.existsSync(edgePath)) {
    throw new Error(`Microsoft Edge not found at ${edgePath}`);
  }

  const { chromium } = await import("playwright-core");
  const { server, port } = await startServer();

  try {
    const browser = await chromium.launch({
      executablePath: edgePath,
      headless: true
    });

    const page = await browser.newPage();
    const errors = [];

    page.on("pageerror", (error) => {
      errors.push(`Page error: ${error.message}`);
    });

    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(`Console error: ${message.text()}`);
      }
    });

    await page.goto(`http://127.0.0.1:${port}/tests/index.html`, {
      waitUntil: "networkidle"
    });

    await page.waitForFunction(() => Boolean(window.__testResults), null, { timeout: 15000 });

    const { title, results } = await page.evaluate(() => ({
      title: document.title,
      results: window.__testResults
    }));

    await browser.close();

    const failed = results.flatMap((suite) => suite.tests.filter((test) => !test.pass).map((test) => ({
      suite: suite.name,
      test: test.name,
      error: test.error
    })));

    console.log(title);

    if (errors.length > 0) {
      console.log("Browser errors:");
      errors.forEach((error) => console.log(`- ${error}`));
    }

    if (failed.length > 0) {
      console.log("Failures:");
      failed.forEach((failure) => {
        console.log(`- [${failure.suite}] ${failure.test}`);
        if (failure.error) {
          console.log(failure.error);
        }
      });
      process.exitCode = 1;
      return;
    }

    console.log("All browser tests passed.");
  } finally {
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
