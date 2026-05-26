import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const basePath = normalizeBasePath(process.env.SITE_BASE_PATH || process.env.BASE_PATH || "");

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".xml", "application/xml; charset=utf-8"]
]);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://localhost:${port}`);
    const pathname = stripBasePath(decodeURIComponent(url.pathname));
    const filePath = await resolveFile(pathname);
    const ext = path.extname(filePath);

    response.writeHead(200, {
      "Content-Type": mimeTypes.get(ext) || "application/octet-stream"
    });
    response.end(await fs.readFile(filePath));
  } catch (error) {
    const fallback = path.join(distDir, "404.html");
    response.writeHead(error.code === "ENOENT" ? 404 : 500, {
      "Content-Type": "text/html; charset=utf-8"
    });
    response.end(await fs.readFile(fallback, "utf8"));
  }
});

server.listen(port, host, () => {
  console.log(`Serving dist/ at http://${host}:${port}${basePath || ""}`);
});

async function resolveFile(pathname) {
  const safePath = pathname.replace(/^\/+/, "");
  let target = path.join(distDir, safePath);

  if (!target.startsWith(distDir)) {
    throw Object.assign(new Error("Forbidden"), { code: "EACCES" });
  }

  const stat = await fs.stat(target).catch(() => null);
  if (stat?.isDirectory()) {
    return path.join(target, "index.html");
  }
  if (stat?.isFile()) {
    return target;
  }
  if (!path.extname(target)) {
    return path.join(target, "index.html");
  }
  return target;
}

function stripBasePath(pathname) {
  if (!basePath) return pathname;
  if (pathname === basePath) return "/";
  if (pathname.startsWith(`${basePath}/`)) {
    return pathname.slice(basePath.length) || "/";
  }
  return pathname;
}

function normalizeBasePath(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed || trimmed === "/") return "";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}
