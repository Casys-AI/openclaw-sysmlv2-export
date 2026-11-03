/** Copied from Assembly src/adapters/out/oxigraph/rdf.ts and the required
 * IRI helpers in src/domain/model/value-objects/element-ref.ts at commit
 * 9493e33db8251d5e0726bd3fd88dda21ea2d161d.
 *
 * Keep the RDF vocabulary, native identity and occurrence-list encoding aligned
 * with that source. Only the synchronous projection is copied: no Assembly
 * runtime, cache, native store, build service or N-Quads reader.
 *
 * Input is prepared Toolkit interchange with explicit native library IDs.
 * The caller owns compilation, native catalog completion and artifact hashing.
 * S/R/K are omitted because only repository scope and artifact digest affect RDF.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

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

function checkedNativeId(nativeId: string): string {
  if (!nativeId || nativeId.length > 2048 || nativeId.includes("\0")) {
    invalid("nativeId must contain 1–2048 characters without NUL");
  }
  return encodeIriSegment(nativeId);
}

function userElementIri(repositoryId: string, nativeId: string): string {
  return `urn:ase:model:${encodeIriSegment(repositoryId)}:${
    checkedNativeId(nativeId)
  }`;
}

function libraryElementIri(nativeId: string): string {
  return `urn:ase:library:${checkedNativeId(nativeId)}`;
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

class RdfProjectionError extends Error {
  readonly recovery =
    "Re-project from the verified canonical artifact bytes; malformed element graphs must be fixed at the compiler/normalizer boundary, not patched here.";
  constructor(
    readonly code: "RDF_PROJECTION_INVALID" | "RDF_PROJECTION_UNSUPPORTED",
    readonly context: Readonly<Record<string, unknown>>,
    message: string,
  ) {
    super(message);
    this.name = "RdfProjectionError";
  }
}

function invalid(reason: string, extra: Record<string, unknown> = {}): never {
  throw new RdfProjectionError(
    "RDF_PROJECTION_INVALID",
    { reason, ...extra },
    `Invalid element graph for RDF projection: ${reason}`,
  );
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
  readonly lines: Map<string, string>;
  property: string;
}

function quad(
  context: ProjectionContext,
  subject: string,
  predicateIri: string,
  object: string,
): void {
  context.lines.set(
    `${subject} <${predicateIri}> ${object} ${context.graph} .`,
    context.property,
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
    const refId = value["@id"];
    if (typeof refId === "string" && refId) {
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

/** Admit the graph once, independently of how many output batches it needs. */
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
  if (!Array.isArray(input.elements)) invalid("elements is not an array");
  if (
    !Array.isArray(input.libraryNativeIds) ||
    input.libraryNativeIds.some((id) =>
      typeof id !== "string" || !id || id.length > 2048 || id.includes("\0")
    )
  ) invalid("libraryNativeIds must be verified non-empty native IDs");
  const context: ProjectionContext = {
    repositoryId: build.repositoryId,
    libraryIds: new Set(input.libraryNativeIds),
    graph: iriTerm(buildGraphIri(build)),
    lines: new Map(),
    property: "",
  };
  const seen = new Set<string>();
  const sharedSubjects = new Set<string>();
  for (const element of input.elements) {
    if (!isRecord(element)) invalid("element is not an object");
    const nativeId = element["@id"];
    const metaclass = element["@type"];
    if (typeof nativeId !== "string" || !nativeId) {
      invalid("element @id is not a non-empty string");
    }
    if (typeof metaclass !== "string" || !metaclass) {
      invalid("element @type is not a non-empty string", { nativeId });
    }
    if (seen.has(nativeId)) invalid("duplicate element @id", { nativeId });
    seen.add(nativeId);
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
      !root && typeof value["@id"] === "string" && value["@id"] &&
      Object.keys(value).some((key) =>
        key !== "@id" && value[key] !== undefined
      )
    ) sharedSubjects.add(elementTerm(context, value["@id"]));
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
  context.property = "@type";
  quad(context, subject, ASE_VOCAB.rdfType, iriTerm(metaclassIri(metaclass)));
  quad(
    context,
    subject,
    ASE_VOCAB.metaclass,
    literalTerm(metaclass, XSD.string),
  );
  context.property = "@id";
  quad(context, subject, ASE_VOCAB.nativeId, literalTerm(nativeId, XSD.string));
  // Explicit aliases only; canonical Toolkit properties remain primary.
  const declaredName = element["declaredName"] ?? element["name"];
  if (typeof declaredName === "string") {
    context.property = element["declaredName"] != null
      ? "declaredName"
      : "name";
    quad(
      context,
      subject,
      ASE_VOCAB.name,
      literalTerm(declaredName, XSD.string),
    );
  }
  if (typeof element["qualifiedName"] === "string") {
    context.property = "qualifiedName";
    quad(
      context,
      subject,
      ASE_VOCAB.qualifiedName,
      literalTerm(element["qualifiedName"] as string, XSD.string),
    );
  }
  for (const key of Object.keys(element).sort(compareCodeUnits)) {
    if (key === "@id" || key === "@type") continue;
    context.property = key;
    emitProperty(context, subject, key, element[key], [nativeId, key]);
  }
}

/** One native element owns all of its blank-node labels. Never split these
 * lines between Store.load calls, which rename blank nodes per call.
 *
 * Ordinary Toolkit graphs retain only one element's statements plus native-ID
 * admission sets. Unusual embedded @id objects with fields additionally retain
 * statements about their referenced subjects for exact cross-element dedup;
 * memory for that exceptional case grows with those subjects' statements.
 */
function* projectedElements(input: ModelProjectionInput): Generator<{
  nativeId: string;
  lines: Map<string, string>;
}> {
  const { context, sharedSubjects } = prepareProjection(input);
  const sharedLines = new Set<string>();
  for (const element of input.elements) {
    const local: ProjectionContext = { ...context, lines: new Map() };
    emitElement(local, element);
    const lines = new Map<string, string>();
    for (const line of [...local.lines.keys()].sort(compareCodeUnits)) {
      const subject = line.slice(0, line.indexOf(" "));
      if (sharedSubjects.has(subject)) {
        if (sharedLines.has(line)) continue;
        sharedLines.add(line);
      }
      lines.set(line, local.lines.get(line)!);
    }
    yield { nativeId: element["@id"] as string, lines };
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
  for (const element of projectedElements(input)) {
    let elementChars = 0;
    for (const line of element.lines.keys()) elementChars += line.length + 1;
    if (lines.length && chars + elementChars > maxBatchChars) {
      yield { nquads: `${lines.join("\n")}\n`, quadCount: lines.length };
      lines = [];
      chars = 0;
    }
    for (const line of element.lines.keys()) lines.push(line);
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

export interface ElementProjectionMeasurement {
  readonly nativeId: string;
  readonly quadCount: number;
  readonly chars: number;
  readonly byPredicate: Readonly<Record<string, number>>;
  /** All list/compound statements are attributed to their top-level property.
   * Identity/type/alias statements use the source @id/@type/name property. */
  readonly byProperty: Readonly<Record<string, number>>;
}

export interface ModelProjectionMeasurement {
  readonly elementCount: number;
  readonly quadCount: number;
  readonly chars: number;
  readonly maxElementChars: number;
  readonly byPredicate: Readonly<Record<string, number>>;
  readonly byProperty: Readonly<Record<string, number>>;
}

/** Exact unique-quad measurements without a graph-sized string or statement
 * set for ordinary native input. An optional callback receives source-element
 * attribution; no per-element result map is retained. Cross-element duplicate
 * statements belong to the first source element in input order.
 */
export function measureModelProjection(
  input: ModelProjectionInput,
  onElement?: (measurement: ElementProjectionMeasurement) => void,
): ModelProjectionMeasurement {
  let quadCount = 0;
  let chars = 0;
  let maxElementChars = 0;
  const byPredicate: Record<string, number> = Object.create(null);
  const byProperty: Record<string, number> = Object.create(null);
  for (const element of projectedElements(input)) {
    let elementChars = 0;
    const predicates: Record<string, number> = Object.create(null);
    const properties: Record<string, number> = Object.create(null);
    for (const [line, property] of element.lines) {
      const predicateStart = line.indexOf(" <") + 2;
      const predicate = line.slice(
        predicateStart,
        line.indexOf(">", predicateStart),
      );
      elementChars += line.length + 1;
      predicates[predicate] = (predicates[predicate] ?? 0) + 1;
      properties[property] = (properties[property] ?? 0) + 1;
      byPredicate[predicate] = (byPredicate[predicate] ?? 0) + 1;
      byProperty[property] = (byProperty[property] ?? 0) + 1;
    }
    quadCount += element.lines.size;
    chars += elementChars;
    maxElementChars = Math.max(maxElementChars, elementChars);
    onElement?.({
      nativeId: element.nativeId,
      quadCount: element.lines.size,
      chars: elementChars,
      byPredicate: predicates,
      byProperty: properties,
    });
  }
  return {
    elementCount: input.elements.length,
    quadCount,
    chars,
    maxElementChars,
    byPredicate,
    byProperty,
  };
}

/** Sorted canonical full graph for small-input parity and byte-pinning tests.
 * Production callers must use projectModelToNQuadBatches to bound strings. */
export function projectModelToNQuads(input: ModelProjectionInput): NQuadBatch {
  const lines: string[] = [];
  for (const element of projectedElements(input)) {
    for (const line of element.lines.keys()) lines.push(line);
  }
  lines.sort(compareCodeUnits);
  return {
    nquads: lines.length ? `${lines.join("\n")}\n` : "",
    quadCount: lines.length,
  };
}
