/** The shipped shapes, the only rule source the checks read. */
export const APE_SHAPE = "rules/ape/ape.ttl";
export const SHAPE_FILES = [APE_SHAPE, "rules/openclaw/openclaw.ttl"];

/** Where a shape file is read from: beside the bundle, or in the source tree. */
export const shapeUrl = (file: string) =>
  new URL(
    import.meta.url.endsWith(".ts") ? `../../../../${file}` : `./${file}`,
    import.meta.url,
  );
