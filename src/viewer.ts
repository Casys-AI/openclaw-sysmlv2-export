import { structuredPatch } from "diff";
import type { VersionEntry } from "./versions.ts";

/** A kept run: its versions.json entry and its directory's files by name. */
export interface ViewerVersion {
  entry: VersionEntry;
  files: Record<string, string>;
}

/** One file's unified diff hunks against the previous version. */
export interface FileChange {
  file: string;
  status: "added" | "removed" | "changed";
  hunks: { header: string; lines: string[] }[];
}

/** Files that differ between two versions, with their unified diff. */
export function changes(
  older: Record<string, string>,
  newer: Record<string, string>,
): FileChange[] {
  const names = [...new Set([...Object.keys(older), ...Object.keys(newer)])]
    .sort().filter((n) => older[n] !== newer[n]);
  return names.map((file) => ({
    file,
    status: !Object.hasOwn(older, file)
      ? "added"
      : !Object.hasOwn(newer, file)
      ? "removed"
      : "changed",
    hunks: structuredPatch(file, file, older[file] ?? "", newer[file] ?? "")
      .hunks.map((h) => ({
        header:
          `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`,
        lines: h.lines,
      })),
  }));
}

/** One self-contained page (no network, works from file://) listing the
 * versions, newest first, with their files and the changes since the previous
 * one. File texts are stored once even when several versions share them. */
export function viewerPage(versions: ViewerVersion[]): string {
  const texts: string[] = [], seen = new Map<string, number>();
  const ref = (text: string) => {
    if (!seen.has(text)) seen.set(text, texts.push(text) - 1);
    return seen.get(text)!;
  };
  const data = {
    texts,
    versions: versions.map((v, i) => ({
      ...v.entry,
      files: Object.fromEntries(
        Object.entries(v.files).sort(([a], [b]) => a < b ? -1 : 1)
          .map(([name, text]) => [name, ref(text)]),
      ),
      changes: i + 1 < versions.length
        ? changes(versions[i + 1].files, v.files)
        : null,
    })),
  };
  // "<" as <: the data can neither close its script nor open a comment.
  const json = JSON.stringify(data).replaceAll("<", "\\u003c");
  return PAGE.replace("__DATA__", () => json);
}

const PAGE = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Assembly export versions</title>
<style>
:root { color-scheme: light; --fg: #1f2328; --muted: #656d76; --line: #d8dee4; --soft: #f6f8fa; }
* { box-sizing: border-box; }
body { margin: 0; font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--fg); background: #fff; }
header { display: flex; gap: 12px; align-items: baseline; padding: 10px 16px; border-bottom: 1px solid var(--line); }
h1 { margin: 0; font-size: 15px; }
h2 { margin: 0 0 8px; font-size: 14px; }
h3 { margin: 14px 0 6px; font-size: 13px; }
main { display: grid; grid-template-columns: minmax(360px, 460px) minmax(0, 1fr); }
@media (max-width: 800px) { main { grid-template-columns: minmax(0, 1fr); } }
#list { border-right: 1px solid var(--line); overflow-x: auto; }
#detail { padding: 12px 16px; min-width: 0; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 4px 6px; text-align: left; border-bottom: 1px solid var(--line); white-space: nowrap; }
th { color: var(--muted); font-weight: 600; background: var(--soft); }
.num { text-align: right; font-variant-numeric: tabular-nums; }
#rows tr { cursor: pointer; }
#rows tr:hover { background: var(--soft); }
#rows tr.on { background: #ddf4ff; }
.error { color: #cf222e; } .warning { color: #9a6700; } .info, .muted { color: var(--muted); }
nav { display: flex; flex-wrap: wrap; gap: 4px; margin: 8px 0; }
button { font: inherit; padding: 2px 10px; border: 1px solid var(--line); border-radius: 6px; background: #fff; color: var(--fg); cursor: pointer; }
button.on { background: var(--fg); border-color: var(--fg); color: #fff; }
pre, .diff { margin: 0; overflow: auto; border: 1px solid var(--line); border-radius: 6px; background: var(--soft); font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
pre { padding: 8px 10px; }
.diff div { padding: 0 10px; white-space: pre; }
.add { background: #e6ffec; } .del { background: #ffebe9; } .hunk { background: #eaeef2; color: var(--muted); }
.k { color: #8250df; } .s { color: #0a3069; } .c { color: #6e7781; }
table.findings td { white-space: normal; vertical-align: top; }
</style>
</head>
<body>
<header><h1>Assembly export versions</h1><span class="muted" id="count"></span></header>
<main>
<section id="list"><table>
<thead><tr><th>Date (UTC)</th><th class="num">Agents</th><th title="errors / warnings / info">Findings</th><th class="num" title="procedures / rules">Inferred</th><th class="num" title="files changed since the previous version">Changed</th></tr></thead>
<tbody id="rows"></tbody>
</table></section>
<section id="detail">
<h2 id="title"></h2>
<nav id="tabs"><button data-view="files">Files</button><button data-view="changes">Changes since previous</button></nav>
<div id="body"></div>
</section>
</main>
<script id="data" type="application/json">__DATA__</script>
<script>
"use strict";
const data = JSON.parse(document.getElementById("data").textContent);
const versions = data.versions;
const KEYWORDS = new Set(("about abstract accept action alias attribute bind calc case comment" +
  " connect connection constraint def doc else end enum exhibit false first flow for from if" +
  " import in inout interface item library metadata not null occurrence or out package part" +
  " perform port private protected public redefines ref require requirement return satisfy" +
  " send specializes state subject subsets succession then to transition true use verify via").split(" "));
const TOKEN = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|([A-Za-z_]\w*)/g;
let selected = Math.max(0, versions.findIndex((v) => "#" + v.id === location.hash));
let view = "files", file = "OpenClawInstance.sysml";

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
const when = (v) => v.createdAt.slice(0, 19).replace("T", " ");

function sysml(text) {
  const pre = el("pre");
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m[3] && !KEYWORDS.has(m[3])) continue;
    pre.append(text.slice(last, m.index), el("span", m[1] ? "c" : m[2] ? "s" : "k", m[0]));
    last = m.index + m[0].length;
  }
  pre.append(text.slice(last));
  return pre;
}

function findings(text) {
  const table = el("table", "findings");
  const head = table.createTHead().insertRow();
  for (const h of ["Severity", "Code", "Subject", "Context"]) head.append(el("th", "", h));
  const body = table.createTBody();
  for (const f of JSON.parse(text)) {
    body.insertRow().append(el("td", f.severity, f.severity), el("td", "", f.code),
      el("td", "", f.subject), el("td", "", f.context));
  }
  return table;
}

function content(name, text) {
  if (name === "findings.json") return findings(text);
  if (name.endsWith(".json")) return el("pre", "", JSON.stringify(JSON.parse(text), null, 2));
  return name.endsWith(".sysml") ? sysml(text) : el("pre", "", text);
}

function changesView(v) {
  if (!v.changes) return [el("p", "muted", "First version: nothing to compare.")];
  if (!v.changes.length) return [el("p", "muted", "No file changed since the previous version.")];
  return v.changes.map((c) => {
    const lines = c.hunks.flatMap((h) => h.lines);
    const added = lines.filter((l) => l[0] === "+").length;
    const removed = lines.filter((l) => l[0] === "-").length;
    const box = el("section");
    box.append(el("h3", "", c.file + " — " + c.status + "  +" + added + " −" + removed));
    const diff = el("div", "diff");
    for (const h of c.hunks) {
      diff.append(el("div", "hunk", h.header));
      for (const l of h.lines) diff.append(el("div", l[0] === "+" ? "add" : l[0] === "-" ? "del" : "", l));
    }
    box.append(diff);
    return box;
  });
}

function render() {
  document.getElementById("count").textContent = versions.length + " versions, newest first";
  document.getElementById("rows").replaceChildren(...versions.map((v, i) => {
    const tr = el("tr", i === selected ? "on" : "");
    const sev = el("td");
    sev.append(el("span", "error", String(v.findings.error)), " / ",
      el("span", "warning", String(v.findings.warning)), " / ", el("span", "info", String(v.findings.info)));
    tr.append(el("td", "", when(v)), el("td", "num", String(v.agents)), sev,
      el("td", "num", v.inferred ? v.inferred.procedures + " / " + v.inferred.rules : "—"),
      el("td", "num", v.changes ? String(v.changes.length) : "—"));
    tr.onclick = () => { selected = i; history.replaceState(null, "", "#" + v.id); render(); };
    return tr;
  }));
  const v = versions[selected], previous = versions[selected + 1];
  document.getElementById("title").textContent = when(v) + " UTC" +
    (view === "changes" && previous ? " — since " + when(previous) : "");
  for (const b of document.querySelectorAll("#tabs button")) b.className = b.dataset.view === view ? "on" : "";
  const body = document.getElementById("body");
  if (view === "changes") return body.replaceChildren(...changesView(v));
  const names = Object.keys(v.files);
  if (!names.includes(file)) file = names[0];
  const nav = el("nav");
  for (const n of names) {
    const b = el("button", n === file ? "on" : "", n);
    b.onclick = () => { file = n; render(); };
    nav.append(b);
  }
  body.replaceChildren(nav, content(file, data.texts[v.files[file]]));
}

for (const b of document.querySelectorAll("#tabs button")) {
  b.onclick = () => { view = b.dataset.view; render(); };
}
render();
</script>
</body>
</html>
`;
