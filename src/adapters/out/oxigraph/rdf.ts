/** Pure projection of the admitted APE slice using the public OpenMBEE
 * SysML vocabulary and element namespace. This unordered graph carries only
 * retained compiled values; it adds no derived SysML facts or JSON annotations.
 * Public Flexo/OpenSysML mapping: https://runtime.opensysml.org/reference/rdf-mapping/
 * (3 November 2026). Batching/formatting helpers adapted from Assembly
 * src/adapters/out/oxigraph/rdf.ts, 3 November 2026.
 */
import {
  invalidProjection as invalid,
  RdfProjectionError,
} from "../sysml-toolkit/compilation/ape-elements.ts";
import { isRecord } from "../../../infrastructure/error.ts";

export const APE_PROJECTION_VERSION = "openmbee-v2";
export const BUILD_GRAPH_PREFIX = "urn:ase:ape:openmbee:v2:build:";

const SYSML = "https://www.omg.org/spec/SysML#";
const ELEMENT = "urn:sysmlv2:element:";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const XSD = Object.freeze({
  string: "http://www.w3.org/2001/XMLSchema#string",
  integer: "http://www.w3.org/2001/XMLSchema#integer",
  double: "http://www.w3.org/2001/XMLSchema#double",
  boolean: "http://www.w3.org/2001/XMLSchema#boolean",
});

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function escapeNQuadsLiteral(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0) as number;
    if (char === '"') out += '\\"';
    else if (char === "\\") out += "\\\\";
    else if (char === "\n") out += "\\n";
    else if (char === "\r") out += "\\r";
    else if (char === "\t") out += "\\t";
    else if (code < 0x20) {
      out += `\\u${code.toString(16).toUpperCase().padStart(4, "0")}`;
    } else out += char;
  }
  return out;
}

const iriTerm = (iri: string): string => `<${iri}>`;
// Native IDs have already passed the single admission boundary in ape-elements.
const elementTerm = (nativeId: string): string => iriTerm(ELEMENT + nativeId);
const literalTerm = (value: string, datatype: string): string =>
  `"${escapeNQuadsLiteral(value)}"^^<${datatype}>`;

function unsupported(reason: string): never {
  throw new RdfProjectionError(
    "RDF_PROJECTION_UNSUPPORTED",
    { reason },
    `Unsupported element value: ${reason}`,
  );
}

function scalarTerm(value: string | number | boolean): string {
  if (typeof value === "string") return literalTerm(value, XSD.string);
  if (typeof value === "boolean") {
    return literalTerm(value ? "true" : "false", XSD.boolean);
  }
  if (!Number.isFinite(value)) {
    unsupported("Non-finite numbers have no canonical JSON/RDF form");
  }
  return Number.isSafeInteger(value)
    ? literalTerm(String(value), XSD.integer)
    : literalTerm(String(value), XSD.double);
}

interface ProjectionContext {
  readonly graph: string;
  readonly lines: Set<string>;
}

function quad(
  context: ProjectionContext,
  subject: string,
  predicate: string,
  object: string,
): void {
  context.lines.add(`${subject} <${predicate}> ${object} ${context.graph} .`);
}

/** Embedded references may carry retained facts about their target. */
function termForValue(context: ProjectionContext, value: unknown): string {
  if (
    typeof value === "string" || typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return scalarTerm(value);
  }
  if (isRecord(value) && "@id" in value) {
    const subject = elementTerm(value["@id"] as string);
    emitProperties(context, subject, value);
    return subject;
  }
  if (Array.isArray(value)) unsupported("Nested arrays are not supported");
  if (isRecord(value)) unsupported("Nested objects must be @id references");
  unsupported(`Unsupported value type ${typeof value}`);
}

function emitProperty(
  context: ProjectionContext,
  subject: string,
  property: string,
  value: unknown,
): void {
  // Absence has no statement, including null members of retained arrays.
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item !== null && item !== undefined) {
        quad(context, subject, SYSML + property, termForValue(context, item));
      }
    }
  } else {
    quad(context, subject, SYSML + property, termForValue(context, value));
  }
}

function emitProperties(
  context: ProjectionContext,
  subject: string,
  element: Record<string, unknown>,
): void {
  for (const key of Object.keys(element).sort(compareCodeUnits)) {
    if (key === "@id") continue;
    if (key === "@type") {
      quad(context, subject, RDF_TYPE, iriTerm(SYSML + element[key]));
    } else {
      emitProperty(context, subject, key, element[key]);
    }
  }
}

export interface ModelProjectionInput {
  readonly build: { readonly artifactDigest: string };
  readonly elements: readonly Record<string, unknown>[];
}

/** Only enriched embedded references can repeat another element's statements.
 * Track those subjects, rather than retaining the entire projected graph.
 */
function collectSharedSubjects(
  value: unknown,
  shared: Set<string>,
  root = false,
): void {
  if (Array.isArray(value)) {
    for (const item of value) collectSharedSubjects(item, shared);
  } else if (isRecord(value)) {
    if (
      !root && "@id" in value &&
      Object.keys(value).some((key) =>
        key !== "@id" && value[key] !== null && value[key] !== undefined
      )
    ) {
      shared.add(elementTerm(value["@id"] as string));
    }
    for (const [key, child] of Object.entries(value)) {
      if (key !== "@id") collectSharedSubjects(child, shared);
    }
  }
}

function* projectedElements(input: ModelProjectionInput): Generator<string[]> {
  if (
    typeof input.build?.artifactDigest !== "string" ||
    !/^[0-9a-f]{64}$/.test(input.build.artifactDigest)
  ) {
    invalid("artifactDigest must be 64 lowercase hex characters");
  }
  const graph = iriTerm(BUILD_GRAPH_PREFIX + input.build.artifactDigest);
  const sharedSubjects = new Set<string>();
  for (const element of input.elements) {
    collectSharedSubjects(element, sharedSubjects, true);
  }
  const sharedLines = new Set<string>();
  for (const element of input.elements) {
    const context: ProjectionContext = { graph, lines: new Set() };
    const subject = elementTerm(element["@id"] as string);
    quad(
      context,
      subject,
      SYSML + "elementId",
      literalTerm(element["@id"] as string, XSD.string),
    );
    emitProperties(context, subject, element);
    const lines: string[] = [];
    for (const line of [...context.lines].sort(compareCodeUnits)) {
      const subject = line.slice(0, line.indexOf(" "));
      if (sharedSubjects.has(subject)) {
        if (sharedLines.has(line)) continue;
        sharedLines.add(line);
      }
      lines.push(line);
    }
    yield lines;
  }
}

export interface NQuadBatch {
  readonly nquads: string;
  readonly quadCount: number;
}

/** Deterministic, complete-element batches measured in JS string characters,
 * including trailing newlines. An element larger than maxBatchChars is emitted
 * alone above that target; other batches never exceed it. Ordinary projection
 * retains one element and one batch, plus duplicate facts for enriched targets.
 */
export function* projectModelToNQuadBatches(
  input: ModelProjectionInput,
  maxBatchChars = 4 * 1024 * 1024,
): Generator<NQuadBatch> {
  if (!Number.isSafeInteger(maxBatchChars) || maxBatchChars <= 0) {
    invalid("maxBatchChars must be a positive safe integer");
  }
  let lines: string[] = [];
  let chars = 0;
  for (const elementLines of projectedElements(input)) {
    let elementChars = 0;
    for (const line of elementLines) elementChars += line.length + 1;
    if (lines.length && chars + elementChars > maxBatchChars) {
      yield { nquads: `${lines.join("\n")}\n`, quadCount: lines.length };
      lines = [];
      chars = 0;
    }
    for (const line of elementLines) lines.push(line);
    chars += elementChars;
    if (lines.length && chars >= maxBatchChars) {
      yield { nquads: `${lines.join("\n")}\n`, quadCount: lines.length };
      lines = [];
      chars = 0;
    }
  }
  if (lines.length) {
    yield { nquads: `${lines.join("\n")}\n`, quadCount: lines.length };
  }
}
