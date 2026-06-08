import type { ExecutionPolicyDecision, ExecutionSessionInput } from "./types";

const VERCEL_SANDBOX_MAX_TIMEOUT_MS = 5 * 60 * 1000;
const EU_PRIVATE_RUNNER_MAX_TIMEOUT_MS = 30 * 60 * 1000;
const VERCEL_SANDBOX_MAX_VCPUS = 2;
const EU_PRIVATE_RUNNER_MAX_VCPUS = 8;

const REQUIRED_TAGS = ["product", "environment", "traceId", "costCenter"] as const;

export class ExecutionPolicyError extends Error {
  readonly decision: ExecutionPolicyDecision;

  constructor(decision: ExecutionPolicyDecision) {
    super(decision.reason);
    this.name = "ExecutionPolicyError";
    this.decision = decision;
  }
}

export function evaluateExecutionPolicy(input: ExecutionSessionInput): ExecutionPolicyDecision {
  const violations: string[] = [];
  const maxTimeoutMs =
    input.requestedBackend === "eu-private-runner" ? EU_PRIVATE_RUNNER_MAX_TIMEOUT_MS : VERCEL_SANDBOX_MAX_TIMEOUT_MS;
  const maxVcpus = input.requestedBackend === "eu-private-runner" ? EU_PRIVATE_RUNNER_MAX_VCPUS : VERCEL_SANDBOX_MAX_VCPUS;

  if (!input.traceId.trim()) {
    violations.push("traceId is required.");
  }
  for (const tag of REQUIRED_TAGS) {
    if (!input.tags[tag]?.trim()) {
      violations.push(`tag '${tag}' is required.`);
    }
  }
  if (input.tags.traceId && input.tags.traceId !== input.traceId) {
    violations.push("tag 'traceId' must match traceId.");
  }
  if (input.tags.product && input.tags.product !== input.product) {
    violations.push("tag 'product' must match product.");
  }
  if (input.tags.environment && input.tags.environment !== input.environment) {
    violations.push("tag 'environment' must match environment.");
  }
  if (!Number.isInteger(input.timeoutMs) || input.timeoutMs <= 0 || input.timeoutMs > maxTimeoutMs) {
    violations.push(`timeoutMs must be between 1 and ${maxTimeoutMs}.`);
  }
  if (input.vcpus !== undefined && (!Number.isInteger(input.vcpus) || input.vcpus <= 0 || input.vcpus > maxVcpus)) {
    violations.push(`vcpus must be between 1 and ${maxVcpus}.`);
  }
  if (input.memoryMb !== undefined && (!Number.isInteger(input.memoryMb) || input.memoryMb <= 0)) {
    violations.push("memoryMb must be a positive integer when provided.");
  }

  const isPublicOrSanitized = input.dataClass === "public" || input.dataClass === "sanitized";
  const persistentSnapshotsAllowed = isPublicOrSanitized && input.environment !== "production";

  if (input.requestedBackend === "vercel-sandbox") {
    if (!isPublicOrSanitized) {
      violations.push("vercel-sandbox is allowed only for public or sanitized data.");
    }
    if (input.environment === "production") {
      violations.push("vercel-sandbox is denied for production execution.");
    }
  }

  if (input.persistentSnapshots && !persistentSnapshotsAllowed) {
    violations.push("persistent snapshots are allowed only for public/sanitized non-production sessions.");
  }

  return {
    allowed: violations.length === 0,
    reason: violations.length ? violations.join(" ") : "Execution request satisfies policy.",
    backend: input.requestedBackend,
    persistentSnapshotsAllowed,
    maxTimeoutMs,
    violations,
  };
}

export function assertExecutionAllowed(input: ExecutionSessionInput): ExecutionPolicyDecision {
  const decision = evaluateExecutionPolicy(input);
  if (!decision.allowed) {
    throw new ExecutionPolicyError(decision);
  }
  return decision;
}
