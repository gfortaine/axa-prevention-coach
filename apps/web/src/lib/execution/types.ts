export type ExecutionDataClass = "public" | "sanitized" | "internal" | "sensitive";
export type ExecutionBackend = "noop" | "vercel-sandbox" | "eu-private-runner";
export type ExecutionEnvironment = "demo" | "preview" | "production";
export type ExecutionProduct = "axa-prevention-coach" | "deskmate";
export type ExecutionRuntime = "node24" | "node26" | "python3.13";
export type ExecutionSessionStatus = "created" | "running" | "stopped" | "failed";

export interface ExecutionSessionInput {
  product: ExecutionProduct;
  environment: ExecutionEnvironment;
  dataClass: ExecutionDataClass;
  traceId: string;
  requestedBackend: ExecutionBackend;
  runtime: ExecutionRuntime;
  timeoutMs: number;
  vcpus?: number;
  memoryMb?: number;
  persistentSnapshots?: boolean;
  tags: Record<string, string>;
}

export interface ExecutionPolicyDecision {
  allowed: boolean;
  reason: string;
  backend: ExecutionBackend;
  persistentSnapshotsAllowed: boolean;
  maxTimeoutMs: number;
  violations: string[];
}

export interface ExecutionSession {
  id: string;
  backend: ExecutionBackend;
  status: ExecutionSessionStatus;
  traceId: string;
  product: ExecutionProduct;
  environment: ExecutionEnvironment;
  dataClass: ExecutionDataClass;
  tags: Record<string, string>;
  createdAt: string;
}

export interface ExecutionCommand {
  executable: string;
  args?: string[];
  cwd?: string;
  timeoutMs?: number;
}

export interface ExecutionResult {
  sessionId: string;
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  startedAt: string;
  finishedAt: string;
}

export interface ExecutionFile {
  path: string;
  content: string;
}

export interface PreviewUrl {
  sessionId: string;
  port: number;
  url: string;
  expiresAt?: string;
}

export interface ExecutionSnapshot {
  sessionId: string;
  snapshotId?: string;
  stoppedAt: string;
  persistent: boolean;
}

export interface AgentExecutionPlane {
  createSession(input: ExecutionSessionInput): Promise<ExecutionSession>;
  runCommand(sessionId: string, command: ExecutionCommand): Promise<ExecutionResult>;
  writeFiles(sessionId: string, files: ExecutionFile[]): Promise<void>;
  readFiles(sessionId: string, paths: string[]): Promise<ExecutionFile[]>;
  exposePort(sessionId: string, port: number): Promise<PreviewUrl>;
  stopSession(sessionId: string): Promise<ExecutionSnapshot>;
}
