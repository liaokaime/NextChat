import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const root = path.resolve("out");
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
assert(existsSync(path.join(root, "index.html")), "Run yarn export first");
const html = readFileSync(path.join(root, "index.html"), "utf8");
const serializedConfig = html.match(/<meta name="config" content="([^"]*)"/);
assert(serializedConfig, "Missing public build configuration");
const publicConfig = JSON.parse(
  serializedConfig[1].replaceAll("&quot;", '"').replaceAll("&amp;", "&"),
);
assert.equal(publicConfig.buildMode, "export");
assert.equal(publicConfig.isApp, true);
const config = readJson(".next/required-server-files.json").config;
assert.equal(config.output, "export", "Expected a static desktop build");
const routes = readJson(".next/server/app-paths-manifest.json");
assert(
  !Object.keys(routes).some((route) => route.startsWith("/api/")),
  "Desktop build contains API routes",
);
const actions = readJson(".next/server/server-reference-manifest.json");
assert.equal(
  Object.keys(actions.node).length,
  0,
  "Desktop build contains Node server actions",
);
assert.equal(
  Object.keys(actions.edge).length,
  0,
  "Desktop build contains Edge server actions",
);

function* files(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* files(file);
    else yield file;
  }
}

let assetCount = 0;
let chunkCount = 0;
for (const file of files(root)) {
  const content = /\.(html|js)$/.test(file) ? readFileSync(file, "utf8") : "";
  if (file.endsWith(".html")) {
    for (const [, attribute] of content.matchAll(/(?:src|href)="([^"#]+)"/g)) {
      const url = new URL(
        attribute.replaceAll("&amp;", "&"),
        "http://desktop.local/",
      );
      if (
        url.origin !== "http://desktop.local" ||
        !url.pathname.startsWith("/_next/")
      )
        continue;
      const asset = path.resolve(root, "." + decodeURIComponent(url.pathname));
      assert(
        asset.startsWith(root + path.sep) && existsSync(asset),
        `Missing desktop asset: ${url.pathname}`,
      );
      assetCount++;
    }
  }
  if (file.endsWith(".js")) {
    chunkCount++;
    // heic2any bundles Emscripten's guarded Node fs fallback in its browser
    // decoder. Native subprocess imports must never enter desktop chunks.
    assert(
      !/require\(["'](?:node:)?child_process["']\)/.test(content),
      `Node subprocess import in ${file}`,
    );
  }
}
assert(chunkCount > 1, "Expected normal JavaScript chunk splitting");
assert(assetCount > 0, "No framework assets found in exported HTML");
console.log(
  `Desktop export verified: ${chunkCount} JavaScript files, ${assetCount} HTML asset references, no API routes or server actions.`,
);
