import type {
  Agent,
  Cron,
  FileRef,
  Snapshot,
} from "../../../../domain/model/snapshot.ts";
import type {
  AgentInference,
  Inference,
} from "../../../../domain/model/inference.ts";
import type { ApeReport } from "../../../../domain/model/diagnostics/ape.ts";
import type {
  CompileDiagnostics,
  ValidationSummary,
} from "../../../../domain/model/diagnostics/validation.ts";
import type { VersionEntry } from "../../../../domain/export/versions.ts";

interface InstructionSource {
  path: string;
  text: string;
  schedule?: Cron["schedule"];
  enabled?: boolean;
}
export interface OpenClawStateReader {
  collect(stateDir: string, plugins: unknown): Promise<Snapshot>;
}

export interface OpenClawInstructionReader {
  workspaceRoot(stateDir: string, path: string): string;
  collected(root: string, file: FileRef): Promise<string>;
  collectedCron(stateDir: string, jobs: Cron[]): InstructionSource[];
  collectedHeartbeat(
    stateDir: string,
    agent: Agent,
  ): Promise<InstructionSource[]>;
}

export interface ModelInferenceParser {
  parse(
    value: unknown,
    snapshot: Snapshot,
    agentId: string,
    sourcePaths: string[],
  ): AgentInference;
}

export interface SysmlArtifacts {
  emit(snapshot: Snapshot): Map<string, string>;
  library: Iterable<readonly [string, string]>;
  emitInferred(snapshot: Snapshot, inference: Inference): Map<string, string>;
}

export interface ExportFiles {
  join(...parts: string[]): string;
  mkdir(path: string, options?: { recursive: boolean }): Promise<unknown>;
  writeFile(path: string, text: string): Promise<void>;
  readVersions(outDir: string): Promise<VersionEntry[]>;
  versionFiles(dir: string): Promise<Record<string, string>>;
}

export interface ExportPorts extends OpenClawStateReader {
  serialize(value: unknown): string;
  modelError(error: unknown): string;
  instructions: OpenClawInstructionReader;
  inference: ModelInferenceParser;
  sysml: SysmlArtifacts;
  output: ExportFiles;
  validationReport(
    files: Map<string, string>,
  ): Promise<
    {
      validation: ValidationSummary;
      diagnostics: CompileDiagnostics;
      ape: ApeReport;
    }
  >;
  viewerPage(
    versions: { entry: VersionEntry; files: Record<string, string> }[],
  ): Promise<string>;
}
