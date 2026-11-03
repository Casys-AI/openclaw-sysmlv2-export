export interface ElementSession {
  toFullJson(includeLibrary: boolean): string;
  rows(ids: string, fields: string): string;
}
export interface PreparedElements {
  elements: Record<string, unknown>[];
  sourceElementCount: number;
}
export interface ToolkitElementsPort {
  prepare(session: ElementSession): PreparedElements;
}
