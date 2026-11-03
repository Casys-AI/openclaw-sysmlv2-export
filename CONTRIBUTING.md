# Contributing

## Code boundaries

- `src/domain/` depends only on domain code.
- `src/application/` depends on application and domain code, with no runtime
  dependencies. Its outbound ports describe the capabilities it needs.
- `src/adapters/` may depend on adapters, domain, application and
  infrastructure; it does not depend on composition. The toolkit worker is an
  entry point and may use composition to assemble its runtime.
- `src/infrastructure/` may depend on infrastructure, domain and application.
- `src/composition/` wires implementations to ports. The entry points are
  `cli.ts`, `plugin/core.ts`, `plugin/index.mjs`, and the toolkit worker.

Place unit tests beside the code they exercise and assembled tests in
`test/integration/`. Preserve the reviewed bytes in `test/fixtures/` and
`test/golden/`; only the dedicated updater changes goldens. Do not widen runtime
permissions when changing or testing the code.

See [the source map](src/README.md) for the ports and adapter layout.
