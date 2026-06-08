import { assertExecutionAllowed } from "./policy";
import type {
  AgentExecutionPlane,
  ExecutionCommand,
  ExecutionFile,
  ExecutionResult,
  ExecutionSession,
  ExecutionSessionInput,
  ExecutionSnapshot,
  PreviewUrl,
} from "./types";

export class NoopExecutionPlane implements AgentExecutionPlane {
  private readonly sessions = new Map<string, ExecutionSession>();
  private readonly files = new Map<string, Map<string, string>>();

  async createSession(input: ExecutionSessionInput): Promise<ExecutionSession> {
    assertExecutionAllowed(input);
    const id = `noop-${input.traceId.replace(/[^a-zA-Z0-9_-]/g, "-")}-${Date.now()}`;
    const session: ExecutionSession = {
      id,
      backend: "noop",
      status: "created",
      traceId: input.traceId,
      product: input.product,
      environment: input.environment,
      dataClass: input.dataClass,
      tags: { ...input.tags },
      createdAt: new Date().toISOString(),
    };
    this.sessions.set(id, session);
    this.files.set(id, new Map());
    return session;
  }

  async runCommand(sessionId: string, command: ExecutionCommand): Promise<ExecutionResult> {
    this.requireSession(sessionId);
    const startedAt = new Date().toISOString();
    const commandLine = [command.executable, ...(command.args || [])].join(" ");
    return {
      sessionId,
      command: commandLine,
      exitCode: 0,
      stdout: `noop: command not executed: ${commandLine}`,
      stderr: "",
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  }

  async writeFiles(sessionId: string, files: ExecutionFile[]): Promise<void> {
    this.requireSession(sessionId);
    const sessionFiles = this.files.get(sessionId);
    if (!sessionFiles) {
      throw new Error(`No file store for execution session ${sessionId}.`);
    }
    for (const file of files) {
      sessionFiles.set(file.path, file.content);
    }
  }

  async readFiles(sessionId: string, paths: string[]): Promise<ExecutionFile[]> {
    this.requireSession(sessionId);
    const sessionFiles = this.files.get(sessionId);
    if (!sessionFiles) {
      throw new Error(`No file store for execution session ${sessionId}.`);
    }
    return paths.map((path) => ({ path, content: sessionFiles.get(path) || "" }));
  }

  async exposePort(sessionId: string, port: number): Promise<PreviewUrl> {
    this.requireSession(sessionId);
    return {
      sessionId,
      port,
      url: `noop://execution-preview/${sessionId}/${port}`,
    };
  }

  async stopSession(sessionId: string): Promise<ExecutionSnapshot> {
    const session = this.requireSession(sessionId);
    const stoppedAt = new Date().toISOString();
    this.sessions.set(sessionId, { ...session, status: "stopped" });
    return {
      sessionId,
      stoppedAt,
      persistent: false,
    };
  }

  private requireSession(sessionId: string): ExecutionSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Unknown execution session ${sessionId}.`);
    }
    return session;
  }
}
