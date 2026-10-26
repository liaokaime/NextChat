import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const mode = process.env.BUILD_MODE ?? "standalone";
console.log("[Next] build mode", mode);

// Only these public Git identifiers enter the client bundle. Never expose the
// server environment or import Node APIs from app/config/build.ts.
let commitDate = "unknown";
let commitHash = "unknown";
try {
  const cwd = fileURLToPath(new URL(".", import.meta.url));
  const git = (...args) =>
    execFileSync(
      "git",
      [
        "-c",
        `safe.directory=${cwd.replaceAll("\\", "/").replace(/\/$/, "")}`,
        ...args,
      ],
      { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
  commitDate = git("log", "-1", "--format=%at000");
  commitHash = git("log", "-1", "--format=%H");
} catch {
  console.warn("[Build Config] Git metadata unavailable.");
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    rules: {
      "*.svg": { loaders: ["@svgr/webpack"], as: "*.js" },
    },
  },
  env: {
    NEXT_PUBLIC_COMMIT_DATE: commitDate,
    NEXT_PUBLIC_COMMIT_HASH: commitHash,
  },
  // Desktop runs from static files: no API routes or server actions are valid.
  // All page/layout entrypoints are .tsx; all API route entrypoints are .ts.
  ...(mode === "export" ? { pageExtensions: ["tsx"] } : {}),
  output: mode,
  images: {
    unoptimized: mode === "export",
  },
};

const CorsHeaders = [
  { key: "Access-Control-Allow-Credentials", value: "true" },
  { key: "Access-Control-Allow-Origin", value: "*" },
  {
    key: "Access-Control-Allow-Methods",
    value: "*",
  },
  {
    key: "Access-Control-Allow-Headers",
    value: "*",
  },
  {
    key: "Access-Control-Max-Age",
    value: "86400",
  },
];

if (mode !== "export") {
  nextConfig.headers = async () => {
    return [
      {
        source: "/api/:path*",
        headers: CorsHeaders,
      },
    ];
  };

  nextConfig.rewrites = async () => {
    const ret = [
      // adjust for previous version directly using "/api/proxy/" as proxy base route
      // {
      //   source: "/api/proxy/v1/:path*",
      //   destination: "https://api.openai.com/v1/:path*",
      // },
      {
        // https://{resource_name}.openai.azure.com/openai/deployments/{deploy_name}/chat/completions
        source:
          "/api/proxy/azure/:resource_name/deployments/:deploy_name/:path*",
        destination:
          "https://:resource_name.openai.azure.com/openai/deployments/:deploy_name/:path*",
      },
      {
        source: "/api/proxy/google/:path*",
        destination: "https://generativelanguage.googleapis.com/:path*",
      },
      {
        source: "/api/proxy/openai/:path*",
        destination: "https://api.openai.com/:path*",
      },
      {
        source: "/api/proxy/anthropic/:path*",
        destination: "https://api.anthropic.com/:path*",
      },
      {
        source: "/google-fonts/:path*",
        destination: "https://fonts.googleapis.com/:path*",
      },
      {
        source: "/sharegpt",
        destination: "https://sharegpt.com/api/conversations",
      },
      {
        source: "/api/proxy/alibaba/:path*",
        destination: "https://dashscope.aliyuncs.com/api/:path*",
      },
    ];

    return {
      beforeFiles: ret,
    };
  };
}

export default nextConfig;
