import {
  defaultGraph,
  literal,
  namedNode,
  Quad,
  quad,
  type Store,
  type Term,
} from "./oxigraph.ts";
import {
  admitConstruct,
  admitSelect,
  type AdmittedSelect,
  bindFocus,
} from "./shacl-query.ts";

export const SH = "http://www.w3.org/ns/shacl#";
export const SHAPES_GRAPH = "urn:ase:ape:v1:shapes";
export const REPORT_GRAPH = "urn:ase:ape:v1:report";
const REPORT_NODE = "urn:ase:ape:v1:validation-report";
const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const XSD = "http://www.w3.org/2001/XMLSchema#";
const APE = "urn:ase:ape:v1:";
const OWL = "http://www.w3.org/2002/07/owl#";
type Row = Map<string, Term>;
type Resource = Extract<Term, { termType: "NamedNode" | "BlankNode" }>;
type Properties = Map<string, Term[]>;

export class ShaclStageError extends Error {
  constructor(
    readonly stage: "loading" | "view" | "rule",
    cause: unknown,
    readonly file?: string,
  ) {
    super(`SHACL ${stage} failed`, { cause });
    this.name = "ShaclStageError";
  }
}
export interface ShaclConstraint {
  sourceShape: Resource;
  sourceConstraint: Resource;
  severity: string;
  messages: readonly Term[];
  compiled: AdmittedSelect;
}
export interface ShaclShape {
  node: Resource;
  targets: { predicate: string; value: Term }[];
  constraints: ShaclConstraint[];
}
export interface ShaclRule {
  node: Resource;
  order: number;
  graph: string;
  name: string;
  query: string;
}
export interface ShaclProgram {
  shapesGraph: string;
  file?: string;
  shapes: ShaclShape[];
  rules: ShaclRule[];
}
export interface ShaclResult {
  focusNode: Resource;
  sourceShape: Resource;
  sourceConstraint: Resource;
  severity: string;
  value: Term;
  path?: Term;
  messages: Term[];
}

function fail(message: string): never {
  throw new Error(message);
}
function rows(
  store: Store,
  query: string,
  options?: Parameters<Store["query"]>[1],
): Row[] {
  const result = store.query(query, options);
  if (!Array.isArray(result) || result.some((row) => !(row instanceof Map))) {
    fail("Expected SELECT results");
  }
  return result as Row[];
}
function resource(term: Term): Resource {
  if (term.termType !== "NamedNode" && term.termType !== "BlankNode") {
    fail("Expected an RDF resource");
  }
  return term as Resource;
}
function iri(term: Term): string {
  if (term.termType !== "NamedNode") fail("Expected an IRI");
  return term.value;
}
function text(term: Term): string {
  if (term.termType !== "Literal") fail("Expected a literal");
  return term.value;
}
function queryText(term: Term): string {
  if (term.termType !== "Literal" || term.datatype.value !== XSD + "string") {
    fail("SPARQL query must be an xsd:string literal");
  }
  return term.value;
}
function messageText(term: Term): string {
  if (
    term.termType !== "Literal" ||
    ![XSD + "string", RDF + "langString", RDF + "dirLangString"].includes(
      term.datatype.value,
    )
  ) fail("sh:message must be a string or language-tagged literal");
  return term.value;
}
function sourceFile(
  file: string | undefined,
  node: Resource | undefined,
): string | undefined {
  return node ? `${file ?? "<shapes>"}#${node.value}` : file;
}
function get(properties: Properties | undefined, name: string): Term[] {
  return properties?.get(name) ?? [];
}
function single(
  properties: Properties | undefined,
  name: string,
  required = false,
): Term | undefined {
  const values = get(properties, name);
  if (values.length > 1 || (required && !values.length)) {
    fail(`Expected ${required ? "one" : "at most one"} ${name}`);
  }
  return values[0];
}
function deactivated(properties: Properties): boolean {
  const value = single(properties, SH + "deactivated");
  if (!value) return false;
  if (
    value.termType !== "Literal" || value.datatype.value !== XSD + "boolean" ||
    !["true", "false", "1", "0"].includes(value.value)
  ) fail("sh:deactivated must be a literal boolean");
  return value.value === "true" || value.value === "1";
}

/** Read and admit the bounded profile once; metadata never enters the data dataset. */
export function readShaclProgram(
  store: Store,
  shapesGraph = SHAPES_GRAPH,
  file?: string,
): ShaclProgram {
  let activeNode: Resource | undefined;
  try {
    const nodes = new Map<string, { node: Resource; properties: Properties }>();
    for (
      const row of rows(store, "SELECT ?s ?p ?o WHERE { ?s ?p ?o }", {
        default_graph: namedNode(shapesGraph),
        named_graphs: [],
      })
    ) {
      const node = resource(row.get("s")!);
      const key = node.toString();
      if (!nodes.has(key)) nodes.set(key, { node, properties: new Map() });
      const properties = nodes.get(key)!.properties;
      const predicate = iri(row.get("p")!);
      properties.set(predicate, [...get(properties, predicate), row.get("o")!]);
    }
    const propertiesOf = (node: Term) => nodes.get(node.toString())?.properties;
    // Expected reports and unrelated RDF may share the Turtle fixture. Only
    // schema subjects participate in profile admission; report links do not.
    const reportProperties = new Set([
      "conforms",
      "result",
      "focusNode",
      "resultMessage",
      "resultSeverity",
      "sourceShape",
      "sourceConstraint",
      "sourceConstraintComponent",
      "value",
      "resultPath",
      "detail",
    ]);
    const schemaNodes = [...nodes.values()].filter(({ properties }) =>
      [...properties.keys()].some((p) =>
        p.startsWith(SH) && !reportProperties.has(p.slice(SH.length))
      ) ||
      get(properties, RDF + "type").some((t) =>
        t.value.startsWith(SH) &&
        ![SH + "ValidationReport", SH + "ValidationResult"].includes(t.value)
      )
    );
    const allowed = new Set([
      "targetNode",
      "targetClass",
      "targetSubjectsOf",
      "sparql",
      "severity",
      "message",
      "prefixes",
      "declare",
      "prefix",
      "namespace",
      "select",
      "deactivated",
      "construct",
      "runOnce",
      "order",
      "name",
      "description",
    ]);
    const types = new Set([
      "NodeShape",
      "SPARQLConstraint",
      "SPARQLRule",
      "PrefixDeclaration",
    ]);
    for (const { node, properties } of schemaNodes) {
      activeNode = node;
      for (const name of ["select", "construct"]) {
        const value = single(properties, SH + name);
        if (value) queryText(value);
      }
      get(properties, SH + "message").forEach(messageText);
      for (const predicate of properties.keys()) {
        if (
          predicate.startsWith(SH) && !allowed.has(predicate.slice(SH.length))
        ) fail(`Unsupported SHACL feature ${predicate}`);
      }
      for (const type of get(properties, RDF + "type")) {
        if (
          type.value.startsWith(SH) && !types.has(type.value.slice(SH.length))
        ) fail(`Unsupported SHACL type ${type.value}`);
      }
    }
    const prefixes = (properties: Properties): Record<string, string> => {
      const declarations: Record<string, string> = {};
      const seen = new Set<string>();
      const visit = (node: Term) => {
        resource(node);
        if (seen.has(node.toString())) return;
        seen.add(node.toString());
        const p = propertiesOf(node);
        for (const declaration of get(p, SH + "declare")) {
          const d = propertiesOf(resource(declaration));
          const prefix = text(single(d, SH + "prefix", true)!);
          const namespace = single(d, SH + "namespace", true)!;
          if (
            namespace.termType !== "Literal" ||
            namespace.datatype.value !== XSD + "anyURI"
          ) fail("sh:namespace must be xsd:anyURI");
          if (
            Object.hasOwn(declarations, prefix) &&
            declarations[prefix] !== namespace.value
          ) fail("Conflicting prefix declarations");
          declarations[prefix] = namespace.value;
        }
        for (const imported of get(p, OWL + "imports")) visit(imported);
      };
      for (const node of get(properties, SH + "prefixes")) visit(node);
      return declarations;
    };
    const severity = (constraint: Properties, shape: Properties): string => {
      const value = single(constraint, SH + "severity") ??
        single(shape, SH + "severity");
      const name = value ? iri(value) : SH + "Violation";
      if (![SH + "Violation", SH + "Warning", SH + "Info"].includes(name)) {
        fail("Unsupported result severity");
      }
      return name;
    };
    const messages = (constraint: Properties, shape: Properties): Term[] => {
      const result = get(constraint, SH + "message").length
        ? get(constraint, SH + "message")
        : get(shape, SH + "message");
      result.forEach(messageText);
      return result;
    };
    const shapes: ShaclShape[] = [];
    const rules: ShaclRule[] = [];
    const usedConstraints = new Set<string>();
    for (const { node, properties } of schemaNodes) {
      activeNode = node;
      const isRule = get(properties, RDF + "type").some((v) =>
        v.value === SH + "SPARQLRule"
      );
      if (isRule) {
        const once = single(properties, SH + "runOnce", true)!;
        if (
          once.termType !== "Literal" ||
          once.datatype.value !== XSD + "boolean" ||
          !["true", "1"].includes(once.value)
        ) fail("Only global sh:runOnce true rules are supported");
        const order = single(properties, SH + "order", true)!;
        if (
          order.termType !== "Literal" ||
          !(order.datatype.value === XSD + "integer"
            ? /^[+-]?[0-9]+$/.test(order.value)
            : order.datatype.value === XSD + "decimal" &&
              /^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$/.test(order.value))
        ) fail("sh:order must be a valid xsd:integer or xsd:decimal");
        const orderValue = Number(order.value);
        if (!Number.isFinite(orderValue)) fail("sh:order must be finite");
        const graph = iri(single(properties, APE + "graph", true)!);
        if ([shapesGraph, REPORT_GRAPH].includes(graph)) {
          fail("Rule cannot write the shapes or report graph");
        }
        rules.push({
          node,
          order: orderValue,
          graph,
          name: text(single(properties, APE + "name", true)!),
          query: admitConstruct(
            queryText(single(properties, SH + "construct", true)!),
            prefixes(properties),
          ),
        });
      }
      const targets = ["targetNode", "targetClass", "targetSubjectsOf"].flatMap(
        (name) =>
          get(properties, SH + name).map((value) => ({
            predicate: name,
            value,
          })),
      );
      const isShape = get(properties, RDF + "type").some((v) =>
        v.value === SH + "NodeShape"
      ) || targets.length > 0 || get(properties, SH + "sparql").length > 0;
      if (!isShape) {
        continue;
      }
      if (
        get(properties, RDF + "type").some((t) =>
          t.value === "http://www.w3.org/2000/01/rdf-schema#Class"
        )
      ) {
        fail("Implicit class targets are unsupported");
      }
      const skip = deactivated(properties);
      const constraints: ShaclConstraint[] = [];
      for (const ref of get(properties, SH + "sparql")) {
        activeNode = resource(ref);
        usedConstraints.add(ref.toString());
        const c = propertiesOf(ref);
        if (!c) {
          fail("Missing SPARQL constraint definition");
        }
        if (deactivated(c!) || skip) {
          continue;
        }
        constraints.push({
          sourceShape: node,
          sourceConstraint: ref as Resource,
          severity: severity(c!, properties),
          messages: messages(c!, properties),
          compiled: admitSelect(
            queryText(single(c, SH + "select", true)!),
            prefixes(c!),
          ),
        });
      }
      if (!skip) {
        shapes.push({ node, targets, constraints });
      }
    }
    for (const { node, properties } of schemaNodes) {
      activeNode = node;
      const isRule = rules.some((r) => r.node.equals(node));
      const isConstraint = usedConstraints.has(node.toString());
      const isShape = get(properties, RDF + "type").some((v) =>
        v.value === SH + "NodeShape"
      ) || get(properties, SH + "sparql").length > 0 ||
        ["targetNode", "targetClass", "targetSubjectsOf"].some((p) =>
          get(properties, SH + p).length
        );
      for (const name of ["construct", "runOnce", "order"]) {
        if (get(properties, SH + name).length && !isRule) {
          fail(`${name} requires a global SPARQLRule`);
        }
      }
      for (const name of ["select", "prefixes"]) {
        if (
          get(properties, SH + name).length &&
          !(isConstraint || (name === "prefixes" && isRule))
        ) {
          fail(`${name} requires an attached constraint or global rule`);
        }
      }
      for (const name of ["severity", "message", "deactivated"]) {
        if (
          get(properties, SH + name).length && !(isShape || isConstraint)
        ) {
          fail(`${name} requires a shape or constraint`);
        }
      }
      if (isRule && (isShape || isConstraint)) {
        fail("Global rules cannot also be shapes or constraints");
      }
    }
    rules.sort((a, b) => a.order - b.order);
    if (rules.some((r, i) => i > 0 && rules[i - 1].order === r.order)) {
      fail("Rule sh:order values must be unique");
    }
    shapes.sort((a, b) => ordinal(a.node.toString(), b.node.toString()));
    for (const shape of shapes) {
      shape.constraints.sort((a, b) =>
        ordinal(a.sourceConstraint.toString(), b.sourceConstraint.toString())
      );
    }
    return { shapesGraph, file, shapes, rules };
  } catch (cause) {
    throw new ShaclStageError("loading", cause, sourceFile(file, activeNode));
  }
}

/** Explicitly restrict both sides of the dataset; GRAPH ?g cannot expose metadata. */
export function shaclDataOptions(
  store: Store,
  shapesGraph = SHAPES_GRAPH,
): NonNullable<Parameters<Store["query"]>[1]> {
  const graphs = rows(
    store,
    "SELECT DISTINCT ?g WHERE { GRAPH ?g { ?s ?p ?o } }",
  )
    .map((row) => row.get("g")!)
    .filter((g) => g.value !== shapesGraph && g.value !== REPORT_GRAPH)
    .map(resource);
  return { default_graph: [defaultGraph(), ...graphs], named_graphs: graphs };
}

export function materializeShaclRules(store: Store, program: ShaclProgram) {
  const views: { file: string; graph: string; ms: number; quads: number }[] =
    [];
  let derivedQuads = 0;
  for (const rule of program.rules) {
    const started = performance.now();
    try {
      const result = store.query(
        rule.query,
        shaclDataOptions(store, program.shapesGraph),
      );
      if (
        !Array.isArray(result) ||
        result.some((value) => !(value instanceof Quad))
      ) fail("Rule must CONSTRUCT RDF quads");
      const before = store.size;
      for (const value of result as Quad[]) {
        store.add(
          quad(
            value.subject,
            value.predicate,
            value.object,
            namedNode(rule.graph),
          ),
        );
      }
      const quads = store.size - before;
      derivedQuads += quads;
      views.push({
        file: program.file ?? rule.name,
        graph: rule.graph,
        ms: performance.now() - started,
        quads,
      });
    } catch (cause) {
      throw new ShaclStageError(
        "view",
        cause,
        sourceFile(program.file, rule.node),
      );
    }
  }
  return { views, derivedQuads };
}

function focusNodes(
  store: Store,
  shape: ShaclShape,
  options: Parameters<Store["query"]>[1],
): string[] {
  const found = new Set<string>();
  for (const target of shape.targets) {
    if (target.predicate === "targetNode") {
      found.add(iri(target.value));
      continue;
    }
    const predicate = iri(target.value);
    const pattern = target.predicate === "targetClass"
      ? `?this a ?class . ?class <http://www.w3.org/2000/01/rdf-schema#subClassOf>* ${
        namedNode(predicate)
      }`
      : `?this ${namedNode(predicate)} ?value`;
    for (
      const row of rows(
        store,
        `SELECT DISTINCT ?this WHERE { ${pattern} }`,
        options,
      )
    ) found.add(iri(row.get("this")!));
  }
  return [...found].sort();
}
function interpolate(message: Term, row: Row): Term {
  const value = messageText(message).replace(
    /\{[?$]([A-Za-z_][A-Za-z0-9_]*)\}/g,
    (whole, variable: string) => row.get(variable)?.value ?? whole,
  );
  if (message.termType !== "Literal") fail("Result message must be a literal");
  return literal(
    value,
    message.language
      ? {
        language: message.language,
        ...(message.direction ? { direction: message.direction } : {}),
      }
      : message.datatype,
  );
}
function ordinal(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
function resultKey(result: ShaclResult): string {
  return JSON.stringify([
    result.sourceShape.toString(),
    result.sourceConstraint.toString(),
    result.focusNode.toString(),
    result.severity,
    result.value.toString(),
    result.path?.toString(),
    result.messages.map((m) => m.toString()).sort(),
  ]);
}

/** One admitted, batched SELECT per active constraint, including empty focus sets. */
export function validateShacl(store: Store, program: ShaclProgram) {
  let activeNode: Resource | undefined;
  try {
    const options = shaclDataOptions(store, program.shapesGraph);
    const results: ShaclResult[] = [];
    const queries: {
      sourceShape: Resource;
      sourceConstraint: Resource;
      ms: number;
      results: number;
    }[] = [];
    for (const shape of program.shapes) {
      activeNode = shape.node;
      const focuses = focusNodes(store, shape, options);
      for (const constraint of shape.constraints) {
        activeNode = constraint.sourceConstraint;
        const started = performance.now();
        const selected = rows(
          store,
          bindFocus(constraint.compiled, focuses),
          options,
        );
        for (const row of selected) {
          const failure = row.get("failure");
          if (
            failure?.termType === "Literal" &&
            failure.datatype.value === XSD + "boolean" &&
            ["true", "1"].includes(failure.value)
          ) fail("SPARQL constraint reported failure=true");
          const focusNode = resource(
            row.get("this") ?? fail("Constraint result is missing this"),
          );
          if (
            focusNode.termType !== "NamedNode" ||
            !focuses.includes(focusNode.value)
          ) fail("Constraint returned an unbound focus node");
          const path = row.get("path");
          if (path && path.termType !== "NamedNode") {
            fail("Result path must be an IRI");
          }
          const message = row.get("message");
          results.push({
            focusNode,
            sourceShape: shape.node,
            sourceConstraint: constraint.sourceConstraint,
            severity: constraint.severity,
            value: row.get("value") ?? focusNode,
            ...(path ? { path } : {}),
            messages: (message ? [message] : constraint.messages).map((m) =>
              interpolate(m, row)
            ),
          });
        }
        queries.push({
          sourceShape: shape.node,
          sourceConstraint: constraint.sourceConstraint,
          ms: performance.now() - started,
          results: selected.length,
        });
      }
    }
    results.sort((a, b) => ordinal(resultKey(a), resultKey(b)));
    const graph = namedNode(REPORT_GRAPH);
    for (const old of store.match(null, null, null, graph)) store.delete(old);
    const report = namedNode(REPORT_NODE);
    const triples: Quad[] = [];
    const add = (subject: Resource, predicate: string, object: Term) => {
      if (!["NamedNode", "BlankNode", "Literal"].includes(object.termType)) {
        fail("Unsupported report RDF term");
      }
      triples.push(
        quad(
          subject,
          namedNode(predicate),
          object as Parameters<typeof quad>[2],
        ),
      );
    };
    add(report, RDF + "type", namedNode(SH + "ValidationReport"));
    add(
      report,
      SH + "conforms",
      literal(results.length ? "false" : "true", namedNode(XSD + "boolean")),
    );
    results.forEach((result, index) => {
      const node = namedNode(
        `${REPORT_NODE}:result:${String(index + 1).padStart(6, "0")}`,
      );
      add(report, SH + "result", node);
      add(node, RDF + "type", namedNode(SH + "ValidationResult"));
      add(node, SH + "focusNode", result.focusNode);
      add(node, SH + "sourceShape", result.sourceShape);
      add(node, SH + "sourceConstraint", result.sourceConstraint);
      add(
        node,
        SH + "sourceConstraintComponent",
        namedNode(SH + "SPARQLConstraintComponent"),
      );
      add(node, SH + "resultSeverity", namedNode(result.severity));
      add(node, SH + "value", result.value);
      if (result.path) add(node, SH + "resultPath", result.path);
      for (const message of result.messages) {
        add(node, SH + "resultMessage", message);
      }
    });
    for (const triple of triples) {
      store.add(quad(triple.subject, triple.predicate, triple.object, graph));
    }
    const validationReport = [
      ...new Set(triples.map((q) => `${q.toString()} .`)),
    ].sort().join("\n") + "\n";
    return { validationReport, results, queries };
  } catch (cause) {
    throw new ShaclStageError(
      "rule",
      cause,
      sourceFile(program.file, activeNode),
    );
  }
}
