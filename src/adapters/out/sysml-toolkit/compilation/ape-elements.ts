import { ExportError, isRecord } from "../../../../infrastructure/error.ts";

/** Complete the syntactic APE slice from native Toolkit interchange.
 * Native catalog completion follows Assembly src/adapters/out/sysml-toolkit/compilation/compiler.ts,
 * 3 November 2026. Native IDs and explicit library classification remain.
 */
import type { ElementSession } from "../../../../application/model/diagnostics/ports/out/toolkit-elements.port.ts";
export type { ElementSession } from "../../../../application/model/diagnostics/ports/out/toolkit-elements.port.ts";

export type Element = Record<string, unknown>;

export class RdfProjectionError extends Error {
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

export function invalidProjection(
  reason: string,
  extra: Record<string, unknown> = {},
): never {
  throw new RdfProjectionError(
    "RDF_PROJECTION_INVALID",
    { reason, ...extra },
    `Invalid element graph for RDF projection: ${reason}`,
  );
}

function admitNativeId(value: unknown): string {
  if (
    typeof value !== "string" || !value || value.length > 2048 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    invalidProjection(
      "nativeId must contain 1–2048 Flexo-safe characters [A-Za-z0-9_-]",
      { nativeId: value },
    );
  }
  return value;
}

function failed(context: string, cause?: unknown): never {
  const error = new ExportError(
    "APE_GRAPH_FAILED",
    context,
    "Check the Toolkit installation and exported sources, then rebuild the APE graph.",
  );
  if (cause !== undefined) error.cause = cause;
  throw error;
}

// A syntactic projection slice only: SPARQL views own derived facts and policy.
const APE_METACLASSES = new Set([
  "Package",
  "Namespace",
  "PartUsage",
  "PartDefinition",
  "ItemUsage",
  "ItemDefinition",
  "ConnectionUsage",
  "ConnectionDefinition",
  "AttributeUsage",
  "ReferenceUsage",
  "Redefinition",
  "Subsetting",
  "Subclassification",
  "FeatureTyping",
  "FeatureReferenceExpression",
  "FeatureChainExpression",
  "LiteralString",
  "LiteralBoolean",
  "EnumerationUsage",
  "EnumerationDefinition",
]);
const APE_PROPERTIES = new Set([
  "@id",
  "@type",
  "isLibraryElement",
  "declaredName",
  "name",
  "qualifiedName",
  "owner",
  "type",
  "ownedSpecialization",
  "general",
  "ownedMember",
  "ownedRedefinition",
  "redefinedFeature",
  "ownedSubsetting",
  "subsettedFeature",
  "value",
  "referent",
  "sourceFeature",
  "targetFeature",
  "relatedFeature",
]);

function selectProperties(element: Element): Element {
  return Object.fromEntries(
    Object.entries(element).filter(([key, value]) =>
      APE_PROPERTIES.has(key) && value !== null &&
      !(Array.isArray(value) && value.length === 0)
    ),
  );
}

/** Apply the same slice to raw admitted or already catalog-completed elements.
 * Assigned values follow OpenSysML's direct feature-to-expression edge. Omitted
 * target nodes remain native-ID references. Arrays remain unordered. Empty
 * top-level lists/nulls have no statements read by the views and are omitted.
 * The input and its nested values are never mutated.
 */
export function selectApeElements(elements: readonly Element[]): Element[] {
  // Toolkit represents assigned values as FeatureValue relationships. OpenSysML
  // 0.11 projects the feature directly to its value expression.
  const sourceIds = new Set(elements.map((element) => element["@id"]));
  const assignments = new Map<
    string,
    { values: Element[]; ids: Set<string> }
  >();
  for (const element of elements) {
    if (element["@type"] !== "FeatureValue") continue;
    const feature = element.featureWithValue;
    const value = element.value;
    if (
      !isRecord(feature) || !isRecord(value) ||
      typeof feature["@id"] !== "string" || typeof value["@id"] !== "string"
    ) {
      invalidProjection("FeatureValue endpoints must be @id references", {
        nativeId: element["@id"],
      });
    }
    const id = feature["@id"];
    if (!sourceIds.has(id)) {
      invalidProjection("FeatureValue featureWithValue is absent from source", {
        nativeId: element["@id"],
        featureWithValue: id,
      });
    }
    const assigned = assignments.get(id) ??
      { values: [], ids: new Set<string>() };
    assigned.values.push(value);
    assigned.ids.add(value["@id"] as string);
    assignments.set(id, assigned);
  }
  return elements.filter((element) =>
    APE_METACLASSES.has(element["@type"] as string)
  ).map((element) => {
    const selected = selectProperties(element);
    const id = element["@id"] as string;
    const assigned = assignments.get(id);
    if (assigned) {
      selected.value = assigned.values.length === 1
        ? assigned.values[0]
        : assigned.values;
      if (Array.isArray(selected.ownedMember)) {
        const structural = selected.ownedMember.filter((member) =>
          !isRecord(member) ||
          !assigned.ids.has(member["@id"] as string)
        );
        if (structural.length) selected.ownedMember = structural;
        else delete selected.ownedMember;
      }
    }
    return selected;
  });
}

/** Complete native references before the pure RDF projection; never infer a
 * library identity from a name. Owner references introduced by catalog stubs
 * are completed too. All references retain their native IDs.
 */
export function prepareApeElements(session: ElementSession): {
  elements: Element[];
  sourceElementCount: number;
} {
  try {
    const raw: unknown = JSON.parse(session.toFullJson(false));
    if (!Array.isArray(raw)) invalidProjection("elements is not an array");
    const known = new Set<string>();
    const source: Element[] = raw.map((element) => {
      if (!isRecord(element)) invalidProjection("element is not an object");
      const nativeId = admitNativeId(element["@id"]);
      if (typeof element["@type"] !== "string" || !element["@type"]) {
        invalidProjection("element @type is not a non-empty string", {
          nativeId,
        });
      }
      if (known.has(nativeId)) {
        invalidProjection("duplicate element @id", { nativeId });
      }
      known.add(nativeId);
      if (typeof element.isLibraryElement !== "boolean") {
        failed("Malformed Toolkit full interchange for the APE graph");
      }
      return element;
    });
    const elements = selectApeElements(source);
    // All raw identities remain known even when their nodes are not projected.
    let missing = new Set<string>();
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(visit);
      else if (isRecord(value)) {
        if ("@id" in value) {
          const nativeId = admitNativeId(value["@id"]);
          if (!known.has(nativeId)) missing.add(nativeId);
        }
        for (const [key, child] of Object.entries(value)) {
          if (key !== "@id") visit(child);
        }
      }
    };
    const visitReferences = (element: Element) => {
      for (const [key, value] of Object.entries(element)) {
        if (key !== "@id") visit(value);
      }
    };
    elements.forEach(visitReferences);
    while (missing.size) {
      const ids = [...missing].sort();
      const catalog: unknown = JSON.parse(session.rows(
        JSON.stringify(ids),
        JSON.stringify([
          "name",
          "qualifiedName",
          "metaclass",
          "isLibraryElement",
          "owner",
        ]),
      ));
      if (
        !Array.isArray(catalog) || catalog.length !== ids.length ||
        catalog.some((row) =>
          !isRecord(row) || row.errors || row.isLibraryElement !== true ||
          typeof row.metaclass !== "string" || !row.metaclass
        )
      ) {
        failed(
          "Unresolved or malformed Toolkit catalog rows for the APE graph",
        );
      }
      const stubs = (catalog as Element[]).map((row, index) =>
        selectProperties({
          "@id": ids[index],
          "@type": row.metaclass,
          declaredName: row.name,
          qualifiedName: row.qualifiedName,
          isLibraryElement: true,
          ...(typeof row.owner === "string"
            ? { owner: { "@id": row.owner } }
            : {}),
        })
      );
      for (const id of ids) {
        known.add(id);
      }
      elements.push(...stubs);
      missing = new Set();
      stubs.forEach(visitReferences);
    }
    return {
      elements,
      sourceElementCount: source.length,
    };
  } catch (error) {
    if (error instanceof ExportError || error instanceof RdfProjectionError) {
      throw error;
    }
    const detail = error instanceof Error ? error.message : String(error);
    failed(
      `The Toolkit could not prepare native elements for the APE graph: ${detail}`,
      error,
    );
  }
}
