/** Copied from Assembly src/adapters/out/oxigraph/rdf.ts and the required
 * IRI helpers in src/domain/model/value-objects/element-ref.ts, 3 November 2026.
 *
 * Keep the RDF vocabulary, native identity and occurrence-list encoding aligned
 * with that source. Only the synchronous projection is copied: no Assembly
 * runtime, cache, native store, build service or N-Quads reader.
 *
 * Input is prepared Toolkit interchange with explicit native library IDs.
 * The caller owns compilation, native catalog completion and artifact hashing.
 * S/R/K are omitted because only repository scope and artifact digest affect RDF.
 */

import {
  invalidProjection as invalid,
  RdfProjectionError,
} from "./ape-elements.ts";
import { isRecord } from "./error.ts";

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

const iriEncoder = new TextEncoder();
function encodeIriSegment(value: string): string {
  let out = "";
  for (const byte of iriEncoder.encode(value)) {
    const char = String.fromCharCode(byte);
    out += /^[A-Za-z0-9._-]$/.test(char)
      ? char
      : `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return out;
}

function userElementIri(repositoryId: string, nativeId: string): string {
  return `urn:ase:model:${encodeIriSegment(repositoryId)}:${
    encodeIriSegment(nativeId)
  }`;
}

function libraryElementIri(nativeId: string): string {
  return `urn:ase:library:${encodeIriSegment(nativeId)}`;
}

function buildGraphIri(build: ModelProjectionInput["build"]): string {
  return `urn:ase:build:${build.artifactDigest}`;
}

const ASE_VOCAB = Object.freeze({
  base: "urn:ase:vocab:",
  rdfType: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
  metaclass: "urn:ase:vocab:metaclass",
  nativeId: "urn:ase:vocab:nativeId",
  name: "urn:ase:vocab:name",
  qualifiedName: "urn:ase:vocab:qualifiedName",
  occurrenceList: "urn:ase:vocab:OccurrenceList",
  length: "urn:ase:vocab:length",
  occurrence: "urn:ase:vocab:occurrence",
  index: "urn:ase:vocab:index",
  value: "urn:ase:vocab:value",
  nullValue: "urn:ase:vocab:null",
});

const XSD = Object.freeze({
  string: "http://www.w3.org/2001/XMLSchema#string",
  integer: "http://www.w3.org/2001/XMLSchema#integer",
  double: "http://www.w3.org/2001/XMLSchema#double",
  boolean: "http://www.w3.org/2001/XMLSchema#boolean",
});

/** Canonical Toolkit property name → reversible predicate IRI. */
function propPredicate(property: string): string {
  return `urn:ase:vocab:prop:${encodeIriSegment(property)}`;
}
function listPredicate(property: string): string {
  return `urn:ase:vocab:list:${encodeIriSegment(property)}`;
}
function metaclassIri(metaclass: string): string {
  return `urn:ase:metaclass:${encodeIriSegment(metaclass)}`;
}

// --- N-Quads formatting ---

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
const blankTerm = (label: string): string => `_:${label}`;
function literalTerm(value: string, datatype: string): string {
  const lexical = `"${escapeNQuadsLiteral(value)}"`;
  return datatype === XSD.string ? lexical : `${lexical}^^<${datatype}>`;
}

const utf8 = new TextEncoder();
/** Blank-node-safe, injective segment encoding (`_` introduces escapes). */
function blankSegment(value: string): string {
  let out = "";
  for (const byte of utf8.encode(value)) {
    const char = String.fromCharCode(byte);
    out += /^[A-Za-z0-9-]$/.test(char)
      ? char
      : `_x${byte.toString(16).toUpperCase().padStart(2, "0")}_`;
  }
  return out;
}
/** Length-frame the escaped segments: `_` also occurs inside an escape,
 * so it cannot by itself separate paths such as ["a_b"] and ["a","x5F","b"]. */
const blankLabel = (path: readonly string[]): string =>
  `b${
    path.map((segment) => {
      const encoded = blankSegment(segment);
      return `_${encoded.length}_${encoded}`;
    }).join("")
  }`;

// --- Projection core ---

interface ProjectionContext {
  readonly repositoryId: string;
  readonly libraryIds: ReadonlySet<string>;
  readonly graph: string;
  readonly lines: Set<string>;
}

function quad(
  context: ProjectionContext,
  subject: string,
  predicateIri: string,
  object: string,
): void {
  context.lines.add(
    `${subject} <${predicateIri}> ${object} ${context.graph} .`,
  );
}

function elementTerm(context: ProjectionContext, nativeId: string): string {
  return iriTerm(
    context.libraryIds.has(nativeId)
      ? libraryElementIri(nativeId)
      : userElementIri(context.repositoryId, nativeId),
  );
}

function scalarTerm(value: string | number | boolean): string {
  if (typeof value === "string") return literalTerm(value, XSD.string);
  if (typeof value === "boolean") {
    return literalTerm(value ? "true" : "false", XSD.boolean);
  }
  if (!Number.isFinite(value)) {
    throw new RdfProjectionError(
      "RDF_PROJECTION_UNSUPPORTED",
      { reason: "Non-finite numbers have no canonical JSON/RDF form" },
      "Unsupported element value: non-finite number",
    );
  }
  return Number.isSafeInteger(value)
    ? literalTerm(String(value), XSD.integer)
    : literalTerm(String(value), XSD.double);
}

/** Object term for any value; emits extra quads for compound values. */
function termForValue(
  context: ProjectionContext,
  value: unknown,
  path: readonly string[],
): string {
  if (value === null) return iriTerm(ASE_VOCAB.nullValue);
  if (
    typeof value === "string" || typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return scalarTerm(value);
  }
  if (Array.isArray(value)) return emitList(context, value, path);
  if (isRecord(value)) {
    if ("@id" in value) {
      const refId = value["@id"] as string;
      const term = elementTerm(context, refId);
      // An embedded object beyond a bare reference keeps its extra
      // properties, stated about the referenced element.
      for (const key of Object.keys(value).sort(compareCodeUnits)) {
        if (key === "@id") continue;
        emitProperty(context, term, key, value[key], [...path, key]);
      }
      return term;
    }
    const term = blankTerm(blankLabel(path));
    for (const key of Object.keys(value).sort(compareCodeUnits)) {
      emitProperty(context, term, key, value[key], [...path, key]);
    }
    return term;
  }
  throw new RdfProjectionError(
    "RDF_PROJECTION_UNSUPPORTED",
    { reason: `Unsupported value type ${typeof value}` },
    "Unsupported element value type",
  );
}

/** Occurrence list node; the authoritative order/duplicates record. */
function emitList(
  context: ProjectionContext,
  items: readonly unknown[],
  path: readonly string[],
): string {
  const list = blankTerm(blankLabel(path));
  quad(context, list, ASE_VOCAB.rdfType, iriTerm(ASE_VOCAB.occurrenceList));
  quad(
    context,
    list,
    ASE_VOCAB.length,
    literalTerm(String(items.length), XSD.integer),
  );
  items.forEach((item, index) => {
    const occurrence = blankTerm(blankLabel([...path, `#${index}`]));
    quad(context, list, ASE_VOCAB.occurrence, occurrence);
    quad(
      context,
      occurrence,
      ASE_VOCAB.index,
      literalTerm(String(index), XSD.integer),
    );
    quad(
      context,
      occurrence,
      ASE_VOCAB.value,
      termForValue(context, item, [...path, `#${index}`, "v"]),
    );
  });
  return list;
}

function emitProperty(
  context: ProjectionContext,
  subject: string,
  property: string,
  value: unknown,
  path: readonly string[],
): void {
  if (value === undefined) return;
  if (Array.isArray(value)) {
    const list = emitList(context, value, path);
    quad(context, subject, listPredicate(property), list);
    // Direct triples: query convenience. Duplicates collapse here; the
    // occurrence list above remains the roundtrip authority.
    value.forEach((item, index) => {
      quad(
        context,
        subject,
        propPredicate(property),
        termForValue(context, item, [...path, `#${index}`, "v"]),
      );
    });
    return;
  }
  quad(
    context,
    subject,
    propPredicate(property),
    termForValue(context, value, path),
  );
}

export interface ModelProjectionInput {
  readonly build: {
    readonly repositoryId: string;
    readonly artifactDigest: string;
  };
  readonly elements: readonly Record<string, unknown>[];
  readonly libraryNativeIds: readonly string[];
}

/** Validate projection-owned build metadata and locate shared embedded facts. */
function prepareProjection(input: ModelProjectionInput): {
  context: ProjectionContext;
  sharedSubjects: Set<string>;
} {
  const build = input.build;
  if (
    typeof build?.repositoryId !== "string" || !build.repositoryId ||
    build.repositoryId.length > 512
  ) invalid("repositoryId must contain 1–512 characters");
  if (
    typeof build.artifactDigest !== "string" ||
    !/^[0-9a-f]{64}$/.test(build.artifactDigest)
  ) {
    invalid("artifactDigest must be 64 lowercase hex characters");
  }
  const context: ProjectionContext = {
    repositoryId: build.repositoryId,
    libraryIds: new Set(input.libraryNativeIds),
    graph: iriTerm(buildGraphIri(build)),
    lines: new Set(),
  };
  const sharedSubjects = new Set<string>();
  for (const element of input.elements) {
    collectSharedSubjects(context, element, sharedSubjects, true);
  }
  return { context, sharedSubjects };
}

/** Only embedded references with fields can repeat a different native
 * element's ground statements. Bare native references need no global set. */
function collectSharedSubjects(
  context: ProjectionContext,
  value: unknown,
  sharedSubjects: Set<string>,
  root = false,
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectSharedSubjects(context, item, sharedSubjects);
    }
  } else if (isRecord(value)) {
    if (
      !root && "@id" in value &&
      Object.keys(value).some((key) =>
        key !== "@id" && value[key] !== undefined
      )
    ) sharedSubjects.add(elementTerm(context, value["@id"] as string));
    for (const [key, child] of Object.entries(value)) {
      if (key !== "@id") collectSharedSubjects(context, child, sharedSubjects);
    }
  }
}

function emitElement(
  context: ProjectionContext,
  element: Record<string, unknown>,
): void {
  const nativeId = element["@id"] as string;
  const metaclass = element["@type"] as string;
  const subject = elementTerm(context, nativeId);
  quad(context, subject, ASE_VOCAB.rdfType, iriTerm(metaclassIri(metaclass)));
  quad(
    context,
    subject,
    ASE_VOCAB.metaclass,
    literalTerm(metaclass, XSD.string),
  );
  quad(context, subject, ASE_VOCAB.nativeId, literalTerm(nativeId, XSD.string));
  // Explicit aliases only; canonical Toolkit properties remain primary.
  const declaredName = element["declaredName"] ?? element["name"];
  if (typeof declaredName === "string") {
    quad(
      context,
      subject,
      ASE_VOCAB.name,
      literalTerm(declaredName, XSD.string),
    );
  }
  if (typeof element["qualifiedName"] === "string") {
    quad(
      context,
      subject,
      ASE_VOCAB.qualifiedName,
      literalTerm(element["qualifiedName"] as string, XSD.string),
    );
  }
  for (const key of Object.keys(element).sort(compareCodeUnits)) {
    if (key === "@id" || key === "@type") continue;
    emitProperty(context, subject, key, element[key], [nativeId, key]);
  }
}

/** One native element owns all of its blank-node labels. Never split these
 * lines between Store.load calls, which rename blank nodes per call.
 *
 * Ordinary Toolkit graphs retain only one element's statements.
 * Unusual embedded @id objects with fields additionally retain
 * statements about their referenced subjects for exact cross-element dedup;
 * memory for that exceptional case grows with those subjects' statements.
 */
function* projectedElements(
  input: ModelProjectionInput,
): Generator<Set<string>> {
  const { context, sharedSubjects } = prepareProjection(input);
  const sharedLines = new Set<string>();
  for (const element of input.elements) {
    const local: ProjectionContext = { ...context, lines: new Set() };
    emitElement(local, element);
    const lines = new Set<string>();
    for (const line of [...local.lines].sort(compareCodeUnits)) {
      const subject = line.slice(0, line.indexOf(" "));
      if (sharedSubjects.has(subject)) {
        if (sharedLines.has(line)) continue;
        sharedLines.add(line);
      }
      lines.add(line);
    }
    yield lines;
  }
}

export interface NQuadBatch {
  readonly nquads: string;
  readonly quadCount: number;
}

/** Complete-element batches, measured in JS string characters including each
 * trailing newline. A single element larger than maxBatchChars is explicitly
 * emitted alone above the requested size: splitting it would change blank-node
 * identity on load. No batch string otherwise exceeds maxBatchChars.
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
    if (chars >= maxBatchChars) {
      yield { nquads: `${lines.join("\n")}\n`, quadCount: lines.length };
      lines = [];
      chars = 0;
    }
  }
  if (lines.length) {
    yield { nquads: `${lines.join("\n")}\n`, quadCount: lines.length };
  }
}
