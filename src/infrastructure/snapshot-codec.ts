import { EMAIL_ADDRESS_PATTERN, JWT_PATTERN } from "@logtape/redaction";
import { parseSnapshot as parse } from "../domain/model/snapshot.ts";
export function parseSnapshot(value: unknown) {
  return parse(
    value,
    (value) =>
      [EMAIL_ADDRESS_PATTERN, JWT_PATTERN].some((p) =>
        new RegExp(p.pattern.source, p.pattern.flags).test(value)
      ),
  );
}
