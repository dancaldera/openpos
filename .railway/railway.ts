// NOTE: `railway config plan` always shows deploy.restartPolicyType (null -> "ON_FAILURE")
// as a phantom diff; the live API confirms ON_FAILURE is persisted. Ignore those 5 lines.
import { bucket, defineRailway, github, preserve, project, service } from "railway/iac";

export default defineRailway(() => {
  const openpos = github("dancaldera/openpos", { checkSuites: false });

  const openposReleases = bucket("openpos-releases", { region: "iad" });
  const demoApi = service("demo api", {
    source: openpos,
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "Dockerfile.api", watchPatterns: ["/apps/api/**", "/packages/data/**", "/packages/domain/**", "/Dockerfile.api", "/package.json", "/pnpm-workspace.yaml", "/pnpm-lock.yaml"] },
    healthcheck: "/api/health",
    healthcheckTimeout: 60,
    replicas: { "us-east4-eqdc4a": 1 },
    deploy: { restartPolicyMaxRetries: 3, restartPolicyType: "ON_FAILURE" },
    networking: { privateNetworkEndpoint: "demo-api" },
    env: { ALLOWED_ORIGIN: preserve(), INTERNAL_SECRET: preserve(), JWT_SECRET: preserve(), TURSO_AUTH_TOKEN: preserve(), TURSO_DATABASE_URL: preserve() },
  });
  const demoWeb = service("demo web", {
    source: openpos,
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "Dockerfile.web", watchPatterns: ["/apps/desktop/**", "/packages/data/**", "/packages/domain/**", "/packages/sync/**", "/Dockerfile.web", "/nginx.web.conf", "/package.json", "/pnpm-workspace.yaml", "/pnpm-lock.yaml"] },
    healthcheck: "/health",
    healthcheckTimeout: 60,
    replicas: { "us-east4-eqdc4a": 1 },
    deploy: { restartPolicyMaxRetries: 3, restartPolicyType: "ON_FAILURE" },
    networking: { privateNetworkEndpoint: "demo-web" },
    env: { VITE_API_URL: preserve() },
  });
  const releases = service("releases", {
    source: openpos,
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "Dockerfile.releases" },
    healthcheck: "/health",
    healthcheckTimeout: 60,
    replicas: { "us-east4-eqdc4a": 1 },
    deploy: { restartPolicyMaxRetries: 3, restartPolicyType: "ON_FAILURE" },
    domains: ["releases.openpos.xyz"],
    env: { ACCESS_KEY_ID: preserve(), BUCKET: preserve(), ENDPOINT: preserve(), REGION: preserve(), SECRET_ACCESS_KEY: preserve() },
  });
  const aldoApi = service("aldo api", {
    source: openpos,
    build: { buildCommand: "", buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "Dockerfile.api", watchPatterns: ["/apps/api/**", "/packages/data/**", "/packages/domain/**", "/Dockerfile.api", "/package.json", "/pnpm-workspace.yaml", "/pnpm-lock.yaml"] },
    start: "node dist/index.js",
    healthcheck: "/api/health",
    healthcheckTimeout: 60,
    replicas: { "us-east4-eqdc4a": 1 },
    deploy: { restartPolicyMaxRetries: 3, restartPolicyType: "ON_FAILURE" },
    networking: { privateNetworkEndpoint: "api-copy" },
    env: { ALLOWED_ORIGIN: preserve(), INTERNAL_SECRET: preserve(), JWT_SECRET: preserve(), TURSO_AUTH_TOKEN: preserve(), TURSO_DATABASE_URL: preserve() },
  });
  const aldoWeb = service("aldo web", {
    source: openpos,
    build: { buildCommand: "", buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "Dockerfile.web", watchPatterns: ["/apps/desktop/**", "/packages/data/**", "/packages/domain/**", "/packages/sync/**", "/Dockerfile.web", "/nginx.web.conf", "/package.json", "/pnpm-workspace.yaml", "/pnpm-lock.yaml"] },
    start: "",
    healthcheck: "/health",
    healthcheckTimeout: 60,
    replicas: { "us-east4-eqdc4a": 1 },
    deploy: { restartPolicyMaxRetries: 3, restartPolicyType: "ON_FAILURE" },
    networking: { privateNetworkEndpoint: "web" },
    env: { VITE_API_URL: preserve() },
  });

  return project("openpos", {
    resources: [demoApi, demoWeb, releases, aldoApi, aldoWeb, openposReleases],
  });
});
