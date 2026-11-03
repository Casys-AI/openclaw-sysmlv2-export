# APE RDF views and rules

This directory defines the APE trial's versioned derived vocabulary. The
projector selects native Toolkit data; the five SPARQL `CONSTRUCT` views derive
all facts below. TypeScript does not derive these facts. Rules query the
materialized views and return agent IDs; their six header fields supply the
finding metadata.

## Native graph and selection

The projection keeps Assembly's native identity and vocabulary: user elements
are `urn:ase:model:{encoded repositoryId}:{encoded nativeId}`, library elements
are `urn:ase:library:{encoded nativeId}`, and the named build graph is
`urn:ase:build:{artifactDigest}`. Metaclasses use
`urn:ase:metaclass:{encoded
metaclass}`; Toolkit properties use
`urn:ase:vocab:prop:{encoded property}`. Metadata includes
`urn:ase:vocab:metaclass`, `nativeId`, `name`, and `qualifiedName`. Occurrence
lists use `urn:ase:vocab:list:{encoded property}` and
`urn:ase:vocab:OccurrenceList`, `length`, `occurrence`, `index`, and `value`;
this encoding and the native IRIs are unchanged from Assembly.

The syntactic selection retains these metaclasses:

- `Package`, `Namespace`, `PartUsage`, `PartDefinition`, `ItemUsage`,
  `ItemDefinition`, `ConnectionUsage`, `ConnectionDefinition`, `AttributeUsage`,
  `ReferenceUsage`, `Redefinition`, `Subsetting`, `Subclassification`,
  `FeatureReferenceExpression`, `FeatureChainExpression`, `LiteralString`,
  `LiteralBoolean`, `EnumerationUsage`, and `EnumerationDefinition`.

The retained properties are `@id`, `@type`, `isLibraryElement`, `declaredName`,
`name`, `qualifiedName`, `owner`, `definition`, `ownedSpecialization`,
`general`, `ownedMember`, `ownedRedefinition`, `redefinedFeature`,
`ownedSubsetting`, `subsettedFeature`, `value`, `referent`, `sourceFeature`,
`targetFeature`, and `relatedFeature`. Top-level nulls and empty lists are
omitted. Nonempty lists are retained whole, preserving their indices, order, and
duplicates. References to omitted nodes retain their native identities; catalog
completion uses explicit library classification.

For example, a feature's role is resolved through its redefinition and its
literal value through its owned member:

```sparql
?feature prop:ownedRedefinition/prop:redefinedFeature/ase:qualifiedName ?role ;
         prop:ownedMember/prop:value ?value .
```

## Derived vocabulary

All predicates in this section use the prefix `ape: <urn:ase:ape:v1:>`. The view
dependency order is declared in [`APE_VIEW_ORDER`](../../src/ape-rules.ts). Each
view is materialized in its own named graph. Their `ape:source` objects and
other source properties are native element IRIs, not copied identifiers.

| Graph `urn:ase:ape:v1:view:` | Facts and provenance                                                                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agents`                     | `agentId`, `definition`, `scope`, and `source` (the ID feature).                                                                                     |
| `delegation`                 | `delegatesTo` between agents; the source connection or policy has `from`, `to`, `source`, and, for a wildcard, `wildcardTargets true`.               |
| `messaging`                  | `canMessage` and `messagePolicy` on the sender; the policy has `messageTarget`, `from`, `to`, `source`, and, for a wildcard, `wildcardTargets true`. |
| `entries`                    | `reachedBy` associates an agent with a binding, scheduled case, or external trigger; an entry has `source` and a hook also has `hookTargets`.        |
| `exec`                       | `unapprovedHostExec` is a known boolean; `execGrant`, `execPosture`, and `source` identify supporting elements when bound.                           |

Wildcard expansion is confined to known agents in the same top-level package;
the literal wildcard flag remains explicit. An unresolved target remains
representable in SysML but does not create an imaginary agent edge. Messaging
requires an enabled policy. Structural entries include modeled bindings and
scheduled cases even when disabled; these facts do not establish runtime
liveness.

Exec recognition requires the builtin tool with ID `exec`. Host execution means
`gateway`, or `auto` with the grant on the `host` layer. It is unapproved when
effective security is `full` and ask is `off`. An unknown posture emits neither
boolean, so an unknown parent does not support a widening claim. A known absence
of an exec grant emits false based on the complete owned grant graph.

`GRANT_WIDENS_PARENT` finds an agent known not to have unapproved host exec that
delegates transitively to an agent known to have it. `LINK_CYCLE` finds members
of a delegation cycle involving at least two distinct agents.
`UNREACHABLE_OPERATOR` reports an agent without a modeled entry, incoming
non-self delegation, or enabled messaging from another agent. These are
structural findings, not assertions of runtime liveness or isolation.

## Portability

The `.rq` files are SPARQL 1.1 and can run unchanged on Oxigraph 0.4.11 when the
same build and named view graphs are loaded. Assembly's current native
`loadBuild` accepts one named build graph; an adapter must materialize these
views in an isolated build store with named-graph support. This is not a claim
that the current end-to-end Assembly integration runs unchanged.

A future shared package can contain the pure projector and selection contract,
views and rules, vocabulary, and metadata parser. Engine-specific WASM and
native loading remain separate.
