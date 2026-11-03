# APE RDF views and rules

[`ape.ttl`](ape.ttl) is the single source for five global SHACL SPARQL rules and
three SPARQL constraints. The Toolkit supplies the compiled element graph; the
rules materialize the derived views below. The APE adapter maps standard
validation results and shape annotations to findings.

## Native graph and selection

Projection `openmbee-v1` uses `sysml: <https://www.omg.org/spec/SysML#>` for
metaclasses and retained properties, and `urn:sysmlv2:element:<nativeId>` for
both user and library elements. Every retained element has an explicit
`sysml:isLibraryElement` boolean. The build graph is
`urn:ase:ape:openmbee:v1:build:<artifactDigest>`; `openmbee-v1` identifies this
project's projection, not a claim of identical output to another exporter.
References to omitted elements retain their native IDs; catalog completion uses
explicit library classification. No property defaults are inferred.

The pinned
[Toolkit SDK](https://github.com/Open-MBEE/sysml-toolkit/blob/v0.10.10/SDK.md#2-navigation)
uses interchange UUIDs for navigation and JSON output. The projection's
`[A-Za-z0-9_-]` alphabet mirrors
[Flexo `requireValidId`](https://github.com/Open-MBEE/flexo-mms-sysmlv2/blob/24f256378a0c54fa7cf99b5c43c9b7f6c190dfbf/src/main/kotlin/org/openmbee/flexo/sysmlv2/infrastructure/IdValidation.kt),
as referenced by the
[OpenSysML RDF mapping namespace rules](https://runtime.opensysml.org/reference/rdf-mapping/#namespaces).
The 2048-character limit is a plugin boundary, not a Toolkit ID length claim.

The syntactic slice retains the metaclasses and properties enumerated in
[`src/ape-elements.ts`](../../src/ape-elements.ts), including compiled derived
properties when supplied by the Toolkit. Nulls and empty lists are omitted. RDF
values are unordered; the views do not require collection order and the
projection emits no JSON collection annotations. For example:

```sparql
?feature sysml:ownedRedefinition/sysml:redefinedFeature/sysml:qualifiedName ?role ;
         sysml:ownedMember/sysml:value ?value .
```

## Derived vocabulary

All predicates in this section use `ape: <urn:ase:ape:v1:>`. The five global
rules have unique ascending `sh:order` values and `sh:runOnce true`; they
materialize views in their own named graphs. Their `ape:source` objects and
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

## Execution profile and portability

This is a scoped runner informed by the W3C Working Drafts for
[SHACL 1.2 SPARQL (22 October 2026)](https://www.w3.org/TR/2026/WD-shacl12-sparql-20261022/)
and
[Inference Rules (28 October 2026)](https://www.w3.org/TR/2026/WD-shacl12-inference-rules-20261028/),
not a complete SHACL Core or SHACL 1.2 implementation. It supports global
run-once SPARQL rules and SELECT node constraints with `sh:targetNode`,
`sh:targetClass` (including subclass traversal), or `sh:targetSubjectsOf`. APE
shapes use the last target and annotate code, pattern, finding and recovery;
constraints carry severity and message. The runner uses SPARQL 1.1 syntax for
its supported subset of draft forms. Unsupported or non-partitionable features
are rejected explicitly. Active focus nodes must be IRIs. Property shapes,
custom constraint components, ASK constraints, PATH substitution, and general
fixpoint inference are outside this profile. To keep results deterministic,
CONSTRUCT templates that create blank nodes are rejected. Shape, constraint, and
rule identifiers must be IRIs. A global rule’s `sh:order` must be a valid
`xsd:integer`. Report values must be IRIs or literals; blank nodes are
unsupported because parsing the report would change their identity.

Shapes occupy `urn:ase:ape:v1:shapes`; views use the named graphs above; results
use `urn:ase:ape:v1:report`, with report node
`urn:ase:ape:v1:validation-report`. Evaluation sees the union of build and view
graphs as its default graph and can address them by name; shapes and report
graphs are excluded. Each constraint executes once for all focus nodes with
scoped `VALUES` bindings. An outer-only binding fails the W3C pre-binding 002,
003, 005 and 007 cases in Oxigraph. Prefix declarations are read from the shapes
graph without fetching imports over the network. The canonical
[W3C test inventory](../../test/shacl_w3c_test.ts) records the 15 applicable
cases and the eight individual skips with reasons.

The scoped `VALUES` inside `EXISTS` is evaluated per outer row and remains O(N)
in the number of focus nodes. This approach suits scopes below about 1000
agents; that figure is not a guaranteed threshold.

A local synthetic comparison with OpenSysML 0.11.0 found seven common standard
library UUIDs matching. By default OpenSysML used qualified-name-derived IDs for
user elements, whereas the Toolkit supplied UUIDs. Its output had no
`sysml:definition` triples in the comparison and used `sysml:type`; ownership
and expression structures also differed. Consequently these views are not
claimed to run unchanged on raw OpenSysML Turtle. Neither OpenSysML nor rudof is
a runtime dependency.
