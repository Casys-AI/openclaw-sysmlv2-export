/** The viewer page. `__DATA__` is replaced by the versions' data and
 * `__METRICS__` by layout.ts's drawing metrics. It draws the precomputed
 * scenes as SVG in SysML v2 notation and renders the tables shaped by
 * tables.ts, on Assembly's light palette, and needs no network. */
export const PAGE = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OpenClaw SysML v2 export</title>
<style>
:root {
  color-scheme: light;
  --desk: #f3f2ef; --paper: #f6f5f2; --card: #fff; --surface: rgb(255 255 255 / 94%);
  --ink: #1d1d1f; --muted: #6f6b64; --faint: #9a9a9f; --line: #e3e0da; --line-strong: #d6d2c9;
  --hover: rgb(0 0 0 / 4%); --accent-soft: #efede8;
  --add: #19743c; --add-bg: #e3f1e7; --del: #b13c42; --del-bg: #f7e4e4; --warn: #8a642a; --warn-bg: #f6eedd;
  /* What changed since the previous version: its own hue, apart from the Doctor's. */
  --chg: #2f6aa8; --chg-bg: #e8eef7;
  --font: -apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", sans-serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  --diagram: Helvetica, Arial, "Liberation Sans", sans-serif;
  --md-node: #fff; --md-node-def: #f3f2ef; --md-frame: #fdfcfa; --md-group: rgb(0 0 0 / 1.6%);
  --md-stroke: #2b2b2d; --md-soft: #8e8b85; --md-rule: #e1ded8; --md-edge: #4b4b4f;
  --md-halo: var(--paper); --md-dot: #e3e0da; --md-ring: rgb(29 29 31 / 28%); --md-ring-hover: rgb(29 29 31 / 11%);
}
* { box-sizing: border-box; }
html, body { height: 100%; }
body { margin: 0; display: flex; flex-direction: column; overflow: hidden; font: 13px/1.45 var(--font); color: var(--ink); background: var(--desk); }
button, select { font: inherit; color: inherit; }
.top { flex: none; display: flex; align-items: center; gap: 12px; height: 52px; padding: 0 18px; }
.brand { display: flex; align-items: center; gap: 9px; min-width: 0; }
.brand i { width: 12px; height: 12px; border-radius: 50%; background: #6d4bd8; flex: none; }
.brand h1 { margin: 0; font-size: 14px; font-weight: 600; letter-spacing: -.01em; white-space: nowrap; }
.brand h1 span { color: var(--muted); font-weight: 400; }
.top select { max-width: 330px; padding: 4px 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--card); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meta { min-width: 0; color: var(--muted); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meta-verdict { all: unset; cursor: pointer; text-decoration: underline; text-decoration-color: var(--line-strong); }
.meta-verdict:hover { color: var(--ink); } .meta-verdict:disabled { cursor: default; text-decoration: none; }
.note { display: inline-flex; align-items: center; gap: 8px; min-width: 0; padding: 2px 4px 2px 10px; border: 1px solid var(--line-strong); border-radius: 999px; background: var(--card); font-size: 12px; white-space: nowrap; }
.note[hidden] { display: none; }
.note span { overflow: hidden; text-overflow: ellipsis; }
.note button { all: unset; cursor: pointer; padding: 1px 8px; border-radius: 999px; background: var(--accent-soft); font-weight: 500; }
.note button:hover { background: var(--line); }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.tabs { margin-left: auto; display: flex; gap: 2px; padding: 3px; border: 1px solid var(--line); border-radius: 10px; background: var(--card); }
.tabs button { all: unset; cursor: pointer; padding: 3px 10px; border-radius: 7px; font-size: 12px; font-weight: 500; color: var(--muted); }
.tabs button:hover { color: var(--ink); }
.tabs button[aria-current="page"] { background: var(--accent-soft); color: var(--ink); }
main { flex: 1 1 0; min-height: 0; display: flex; padding: 0 12px 12px; }
main > section { flex: 1 1 0; min-width: 0; min-height: 0; border: 1px solid var(--line); border-radius: 14px; background: var(--paper); overflow: hidden; }
main > section[hidden] { display: none; }
.sheet { overflow: auto; padding: 16px 20px; }
.sheet h2 { margin: 0 0 10px; font-size: 15px; }
.sheet h3 { margin: 16px 0 6px; font-size: 13px; }
.muted { color: var(--muted); }
/* Pickers: a readable list where the browser lets a page style it. */
@supports (appearance: base-select) {
  select, ::picker(select) { appearance: base-select; }
  select { cursor: pointer; }
  ::picker(select) { margin-top: 4px; padding: 6px; border: 1px solid var(--line); border-radius: 10px; background: var(--card); box-shadow: 0 12px 32px rgb(0 0 0 / 12%); }
  optgroup { padding-top: 6px; font-size: 11px; font-weight: 600; letter-spacing: .03em; color: var(--muted); }
  option { padding: 7px 12px; border-radius: 7px; font-size: 13.5px; font-weight: 400; letter-spacing: 0; color: var(--ink); }
  option::checkmark { display: none; }
  option:hover, option:focus-visible { background: var(--hover); outline: none; }
  option:checked { background: var(--accent-soft); font-weight: 500; }
}

/* Diagrams: Assembly's SysML page, as one sheet. */
.md { position: relative; height: 100%; display: grid; grid-template: "bar side rail" auto "main side rail" minmax(0, 1fr) / minmax(0, 1fr) auto auto; }
.md-main { grid-area: main; min-height: 0; display: flex; flex-direction: column; }
.md-stage { position: relative; flex: 1 1 0; min-height: 0; }
.md-stage[hidden], .md-sheet[hidden], .md-split[hidden] { display: none; }
.md-split { flex: none; height: 9px; margin: 0 12px; cursor: row-resize; touch-action: none; position: relative; }
.md-split::after { content: ""; position: absolute; left: 50%; top: 3px; width: 40px; height: 3px; border-radius: 2px; background: var(--line-strong); transform: translateX(-50%); }
.md-split:hover::after { background: var(--md-soft); }
.md-toolbar { grid-area: bar; position: relative; z-index: 2; display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 10px 16px 0; pointer-events: none; }
.md-toolbar > * { pointer-events: auto; }
.md-title { display: flex; align-items: baseline; gap: 8px; min-width: 0; max-width: 420px; }
.md-title strong { font-size: 18px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.md-title span { font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.md-toolbar select { min-width: 140px; max-width: 280px; padding: 5px 9px; border: 1px solid var(--line); border-radius: 8px; background: var(--card); }
.md-chip { max-width: 360px; padding: 3px 10px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); font-size: 11.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.md-chip[hidden] { display: none; }
.tb-tabs { display: inline-flex; gap: 2px; padding: 2px; border: 1px solid var(--line); border-radius: 9px; }
.tb-bar .tb-tabs button { border: 0; border-radius: 7px; color: var(--muted); font-weight: 600; }
.tb-bar .tb-tabs button[aria-pressed="true"] { color: var(--ink); background: var(--accent-soft); }
.et td.et-num { text-align: right; font-variant-numeric: tabular-nums; }
.et-tag { margin-left: 8px; padding: 0 6px; border-radius: 999px; font: 600 10.5px var(--font); color: var(--doc); background: var(--warn-bg); white-space: nowrap; }
.md-tools { display: flex; gap: 2px; padding: 3px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
.md-tools { margin-left: auto; }
.md-tools[hidden] { display: none; }
.md-tools button { all: unset; cursor: pointer; padding: 3px 9px; border-radius: 7px; font-size: 12px; font-weight: 500; color: var(--muted); }
.md-tools button:hover { color: var(--ink); background: var(--hover); }
.md-tools button:disabled { opacity: .4; cursor: default; background: none; }
.md-tools svg { display: block; width: 15px; height: 15px; margin: 1px -2px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.md-canvas { position: absolute; inset: 0; overflow: hidden; cursor: grab; touch-action: none; outline: none;
  background-image: radial-gradient(var(--md-dot) 0.9px, transparent 1px); background-size: 22px 22px; }
.md-canvas:active { cursor: grabbing; }
.md-canvas > svg { position: absolute; inset: 0; width: 100%; height: 100%; font-family: var(--diagram); }
.md-empty { margin: 72px 24px; color: var(--muted); max-width: 520px; }
.md-hint { position: absolute; right: 16px; bottom: 10px; font-size: 11px; color: var(--faint); pointer-events: none; }
.md-legend { position: absolute; left: 14px; bottom: 12px; z-index: 1; display: flex; flex-wrap: wrap; gap: 4px 14px; max-width: min(760px, calc(100% - 340px)); padding: 6px 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); font-size: 11px; color: var(--muted); }
.md-legend span { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.md-legend svg { width: 26px; height: 14px; overflow: visible; }
.md-legend.folded { padding: 3px 6px; }
.md-legend-fold { all: unset; cursor: pointer; padding: 0 4px; border-radius: 6px; color: var(--muted); }
.md-legend-fold:hover { color: var(--ink); background: var(--hover); }

/* Elements */
.md-node { cursor: pointer; transition: opacity .18s ease; }
.md-node text { fill: var(--ink); }
.md-body { fill: var(--md-node); stroke: var(--md-stroke); stroke-width: 1.15; }
.md-node.def .md-body { fill: var(--md-node-def); }
.md-node.frame > .md-body { fill: var(--md-frame); stroke: var(--md-soft); }
.md-tab { fill: var(--md-node-def); stroke: var(--md-soft); stroke-width: 1.15; }
.md-node.group > .md-body { fill: var(--md-group); stroke: var(--line-strong); stroke-dasharray: 3 3; }
.md-node.dashed > .md-body { stroke-dasharray: 4 3; }
.md-node.muted > .md-body { fill: var(--paper); stroke: var(--md-soft); }
.md-node.muted text { fill: var(--muted); }
.md-solid { fill: var(--md-stroke); stroke: var(--md-stroke); }
.md-ring { fill: var(--md-halo); stroke: var(--md-stroke); stroke-width: 1.3; }
.md-rule { stroke: var(--md-rule); }
.md-stereo { font-size: 10px; font-weight: 500; letter-spacing: .2px; fill: var(--muted) !important; }
.md-name { font-size: 12.5px; font-weight: 700; }
.md-type { font-size: 12.5px; fill: var(--muted) !important; }
.md-sect { font-size: 10px; font-style: italic; fill: var(--md-soft) !important; }
.md-row { font-size: 11.5px; }
.md-text { font-size: 12px; }
.md-group-label { font-size: 10px; font-style: italic; fill: var(--muted) !important; }
.md-actor { fill: none; stroke: var(--md-stroke); stroke-width: 1.3; stroke-linecap: round; }
.md-node.selected > .md-body { stroke: var(--ink); stroke-width: 2.2; }
/* The selection's halo, and a fainter one under the pointer, at any zoom. */
.md-ring-select { display: none; fill: none; stroke: var(--md-ring); stroke-width: 8; vector-effect: non-scaling-stroke; pointer-events: none; }
.md-node.selected > .md-ring-select { display: inline; }
.md-node.hot:not(.selected) > .md-ring-select { display: inline; stroke: var(--md-ring-hover); }
.md-badge circle { stroke: var(--paper); stroke-width: 2; }
.md-badge text { font-size: 10px; font-weight: 700; fill: #fff !important; text-anchor: middle; }
.hl .md-node.added > .md-body { stroke: var(--add); stroke-width: 2; }
.hl .md-node.changed > .md-body { stroke: var(--chg); stroke-width: 2; }
.hl .md-node.added.group > .md-body, .hl .md-node.added.frame > .md-body { stroke-dasharray: none; }
/* Changed only in its SysML: marked fainter, without a badge. */
.hl .md-node.touched > .md-body { stroke: color-mix(in srgb, var(--chg) 55%, var(--paper)); stroke-width: 1.6; }
.hl tr.touched > :first-child { --bar: inset 2px 0 color-mix(in srgb, var(--chg) 45%, var(--card)); }
.md-badge { display: none; }
.hl .md-badge { display: inline; }
.md-badge.add circle { fill: var(--add); } .md-badge.chg circle { fill: var(--chg); }
.hl .md-edge.added .md-line { stroke: var(--add); --w: 2; }
.hl .md-edge.changed .md-line { stroke: var(--chg); --w: 2; }

.md-edge { transition: opacity .18s ease; pointer-events: none; }
.md-line { fill: none; stroke: var(--md-edge); stroke-width: var(--w, 1.25); }
.md-edge.handoff .md-line, .md-edge.escalation .md-line { stroke-dasharray: 6 4; }
.md-edge.escalation .md-line { stroke: var(--warn); }
.md-edge.owner .md-line { --w: 1; }
.md-edge.target .md-line { stroke-dasharray: 2 3; stroke: var(--md-soft); }
.md-edge.delegation .md-line { --w: 1.4; }
.md-edge.trigger .md-line { stroke-dasharray: 0.1 4; stroke-linecap: round; --w: 1.6; }
.md-edge text, .md-label { font-size: 10.5px; fill: var(--muted); paint-order: stroke; stroke: var(--md-halo); stroke-width: 4px; stroke-linejoin: round; }
.md-edge.escalation text { fill: var(--warn); }
.md-mark-line { fill: none; stroke: var(--md-edge); stroke-width: 1.25; stroke-linejoin: round; }
#md-arrow-warn .md-mark-line { stroke: var(--warn); }
.md-mark-fill { fill: var(--md-edge); }

/* A selection dims what it does not relate to; the selected or hovered
   element's own edges stand out, whatever their width. */
svg.md-focus .md-edge:not(.lit):not(.hot) { opacity: .12; }
svg.md-focus .md-node.leaf:not(.lit):not(.hot) { opacity: .28; }
.md-edge.hot .md-line { stroke-width: calc(var(--w, 1.25) + .9); }
/* Zoomed out: steps, the edges between them, frame tabs and all diagram text
   fold away; screen-sized labels name each procedure and party. */
svg.md-lod :is(.md-node > text, .md-edge text, .md-tab, .md-node.step, .md-edge.inner) { display: none; }
svg.md-lod .md-edge:not(.hot) { opacity: .3; }
.md-labels { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.md-labels[hidden] { display: none; }
.md-labels > div { position: absolute; left: 0; top: 0; }
.md-lod-frame { padding: 6px 6px 0; font-size: 11px; line-height: 1.25; overflow-wrap: break-word; hyphens: auto; }
.md-lod-frame strong { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 5; overflow: hidden; font-weight: 600; }
.md-lod-frame span { display: block; margin-top: 2px; font-size: 10px; color: var(--muted); }
.hl .md-lod-frame.changed span::before { content: ""; display: inline-block; width: 6px; height: 6px; margin-right: 4px; border-radius: 50%; background: var(--chg); vertical-align: 1px; }
.md-lod-leaf { font-size: 10.5px; color: var(--muted); white-space: nowrap; }

/* Inspector */
/* Sidebar: one panel at a time beside the diagram, picked from the icon rail. */
.md-side { grid-area: side; position: relative; display: flex; flex-direction: column; width: var(--side-w, 380px); min-height: 0; border-left: 1px solid var(--line); background: var(--card); }
.md-side[hidden] { display: none; }
.md-side-head { flex: none; display: flex; align-items: center; gap: 6px; height: 46px; padding: 0 8px 0 16px; border-bottom: 1px solid var(--line); }
.md-side-head strong { font-size: 13px; font-weight: 600; }
.md-side-tools { margin-left: auto; display: flex; gap: 2px; }
.md-side-head button { all: unset; cursor: pointer; padding: 3px 8px; border-radius: 7px; font-size: 12px; color: var(--muted); }
.md-side-head button:hover { color: var(--ink); background: var(--hover); }
.md-side-head button[aria-pressed="true"] { color: var(--ink); background: var(--accent-soft); }
.md-side-head .md-copy { display: inline-flex; align-items: center; gap: 4px; }
.md-copy svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; }
.md-copy[data-flash]::after { content: attr(data-flash); font-size: 11.5px; }
.md-side-grip { position: absolute; z-index: 2; left: -4px; top: 0; bottom: 0; width: 8px; cursor: col-resize; touch-action: none; outline-offset: -2px; }
.md-side-grip:hover, .md-side-grip[data-drag] { background: linear-gradient(to right, transparent 3px, var(--line-strong) 3px 5px, transparent 5px); }
.md-rail { grid-area: rail; display: flex; flex-direction: column; align-items: center; gap: 4px; width: 46px; padding: 8px 0; border-left: 1px solid var(--line); background: var(--card); }
.md-rail button { all: unset; position: relative; display: grid; place-items: center; width: 32px; height: 32px; border-radius: 8px; color: var(--muted); cursor: pointer; }
.md-rail button:hover { color: var(--ink); background: var(--hover); }
.md-rail button[aria-pressed="true"] { color: var(--ink); background: var(--accent-soft); }
.md-rail svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.md-rail b { position: absolute; top: -1px; right: -3px; min-width: 15px; height: 15px; padding: 0 4px; border-radius: 999px; font: 600 9.5px/15px var(--font); text-align: center; color: #fff; background: var(--doc, var(--md-soft)); }
.md-rail b:empty { display: none; }
.md-rail [data-panel="changes"] b { background: var(--chg); }
.md-inspector { flex: 1 1 0; min-height: 0; overflow: auto; padding: 12px 16px 16px; font-size: 12px; outline: none; }
.md-side-empty { margin: 8px 0; color: var(--muted); }
.md-side-note { margin: 0 0 12px; font-size: 11px; color: var(--muted); }
.md-inspector h3 { margin: 2px 0 0; font-size: 15px; font-weight: 600; word-break: break-word; }
.md-inspector h3 span { font-weight: 400; color: var(--muted); }
.md-declared { margin: 1px 0 0; font: 11px var(--mono); color: var(--muted); word-break: break-word; }
.md-also { display: flex; flex-wrap: wrap; gap: 2px 12px; margin: 4px 0 0; font-size: 11.5px; }
.md-also button { all: unset; cursor: pointer; color: var(--muted); text-decoration: underline; text-decoration-color: var(--line-strong); }
.md-also button:hover { color: var(--ink); text-decoration-color: var(--ink); }
.md-kicker { margin: 0; font-size: 10.5px; letter-spacing: .04em; color: var(--muted); }
.md-inspector .md-kicker + ul, .md-inspector .md-kicker + .md-src { margin-top: 4px; }
.md-inspector dl { display: grid; grid-template-columns: auto 1fr; gap: 3px 10px; margin: 12px 0; }
.md-inspector dt { color: var(--muted); }
.md-inspector dd { margin: 0; word-break: break-word; }
.md-inspector ul { list-style: none; margin: 0 0 12px; padding: 0; }
.md-inspector li button { all: unset; display: flex; gap: 8px; width: 100%; padding: 4px 0; border-top: 1px solid var(--line); cursor: pointer; }
.md-inspector li button:hover .md-other { text-decoration: underline; }
.md-kind { min-width: 92px; color: var(--muted); }
.md-status { display: inline-block; margin-top: 6px; padding: 1px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
.md-status.added { color: var(--add); background: var(--add-bg); } .md-status.changed { color: var(--chg); background: var(--chg-bg); } .md-status.removed { color: var(--del); background: var(--del-bg); }
.md-src { margin: 0; } .md-src[open] { margin-bottom: 8px; }
.md-src button { all: unset; cursor: pointer; font: 11.5px var(--mono); color: var(--ink); text-decoration: underline; text-decoration-color: var(--line-strong); }
.md-src button:hover { text-decoration-color: var(--ink); }
.md-inspector pre { margin: 4px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 11px; }
.md-src summary { display: flex; gap: 6px; padding: 4px 0; border-top: 1px solid var(--line); cursor: pointer; list-style: none; }
.md-src summary::-webkit-details-marker { display: none; }
.md-src summary::before { content: "▸"; flex: none; width: 10px; font-size: 12px; line-height: 15px; color: var(--muted); } .md-src[open] summary::before { content: "▾"; }
.md-src[open] summary code, .md-src:not([open]) summary button { display: none; }
.md-src summary code { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 11px var(--mono); }
.md-inspector del, .md-inspector ins { display: block; text-decoration: none; }
.md-inspector del { color: var(--del); text-decoration: line-through; text-decoration-color: rgb(177 60 66 / 45%); }
.md-inspector ins { color: var(--add); }
.md-changes dl { margin: 2px 0 8px; }
.md-inspector h3 + .md-kicker { margin-top: 12px; }
.md-back { all: unset; margin-left: 10px; cursor: pointer; font-size: 11.5px; color: var(--muted); text-decoration: underline; text-decoration-color: var(--line-strong); }
.md-back:hover { color: var(--ink); }
.md-changes + .md-back { display: block; margin: -4px 0 12px; }
.md-verdict { all: unset; display: block; margin: 4px 0 12px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--paper); cursor: pointer; font-size: 12.5px; }
.md-verdict:hover { border-color: var(--line-strong); }
.md-verdict::after { content: " →"; color: var(--muted); }
/* :root lifts buttons over the all: unset of their families. */
.md-canvas:focus-visible, :root button:focus-visible, select:focus-visible, [role="button"]:focus-visible { outline: 2px solid #797369; outline-offset: 2px; }
/* A clicked element shows its selection, not the browser's focus ring. */
.md-node:focus:not(:focus-visible) { outline: none; }

/* Tables: a view's elements in rows, under its diagram or alone. */
.md-sheet { flex: 0 0 auto; max-height: 42%; overflow: auto; isolation: isolate; margin: 0 12px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--card); }
.md-sheet.alone { flex: 1 1 0; max-height: none; margin-top: 8px; }
/* What scrolls into view clears the sticky header row and the matrix's sticky first column. */
.md-sheet { scroll-padding: 40px 0 0; } .md-sheet:has(.mx) { scroll-padding: 64px 0 0 290px; }
.tb-bar { position: sticky; left: 0; z-index: 4; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; padding: 10px 14px; border-bottom: 1px solid var(--line); background: var(--card); font-size: 12px; color: var(--muted); }
.tb-bar input { width: 220px; padding: 4px 9px; border: 1px solid var(--line); border-radius: 8px; background: var(--paper); font: inherit; color: var(--ink); }
.tb-bar button { all: unset; cursor: pointer; padding: 2px 8px; border: 1px solid var(--line); border-radius: 7px; color: var(--ink); }
.tb-bar button:hover { background: var(--hover); }
.tb-bar button[aria-pressed="true"] { background: var(--accent-soft); border-color: var(--line-strong); }
.tb-key { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.tb-note { margin-left: -6px; font-style: italic; }
.tb-bar .tb-fold { margin-left: auto; border-color: transparent; color: var(--muted); }
.tb-bar .tb-fold:hover { color: var(--ink); }
.md-sheet.folded { flex: none; }
.md-sheet.folded > :not(.tb-bar), .md-sheet.folded .tb-bar > :not(.tb-title, .tb-fold) { display: none; }
.md-sheet.folded .tb-bar { border-bottom: 0; }
.hl tr.added > th, .hl tr.added > td { background: color-mix(in srgb, var(--add-bg) 60%, var(--card)); }
.hl tr.changed > th, .hl tr.changed > td { background: color-mix(in srgb, var(--chg-bg) 60%, var(--card)); }
/* A cell's marks compose: what is selected (--sel) over what changed (--bar). */
.md-sheet :is(th, td) { box-shadow: var(--sel, 0 0 #0000), var(--bar, 0 0 #0000); }
.hl tr.added > :first-child { --bar: inset 3px 0 var(--add); } .hl tr.changed > :first-child { --bar: inset 3px 0 var(--chg); }
.hl th.added { --bar: inset 0 -3px var(--add); } .hl th.changed { --bar: inset 0 -3px var(--chg); }
.hl td.added { --bar: inset 0 0 0 2px var(--add); } .hl td.changed { --bar: inset 0 0 0 2px var(--chg); }
.mx { border-collapse: separate; border-spacing: 0; font-size: 12px; }
.mx th, .mx td { border-bottom: 1px solid var(--line); background: var(--card); }
.mx thead th { position: sticky; top: 0; z-index: 2; padding: 6px 4px; vertical-align: bottom; font-weight: 500; border-bottom: 1px solid var(--line-strong); }
.mx thead th.mx-corner { left: 0; z-index: 3; min-width: 250px; padding: 6px 14px; text-align: left; font-size: 11px; font-weight: 400; font-style: italic; color: var(--muted); }
.mx-col { min-width: 88px; max-width: 120px; cursor: pointer; text-align: center; line-height: 1.25; }
.mx-col span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mx-col small { display: block; color: var(--muted); font: 10.5px var(--mono); overflow: hidden; text-overflow: ellipsis; }
.mx.narrow .mx-col { min-width: 30px; max-width: 30px; padding: 8px 0; }
.mx.narrow .mx-col span { display: none; }
.mx.narrow .mx-col small { writing-mode: vertical-rl; transform: rotate(180deg); margin: 0 auto; max-height: 120px; }
.mx tbody th { position: sticky; left: 0; z-index: 1; padding: 3px 14px; text-align: left; font-weight: 400; white-space: nowrap; cursor: pointer; border-right: 1px solid var(--line); }
.mx tbody td { padding: 2px 4px; text-align: center; }
.mx td[data-id] { cursor: pointer; }
.mx tr.d0 > th { padding-left: 28px; font-style: italic; color: var(--muted); } .mx tr.d1 > th { padding-left: 44px; } .mx tr.d2 > th { padding-left: 60px; }
.mx-group > th { font-size: 11.5px; } .mx-group > th, .mx-group > td { background: var(--paper); }
.mx-group .mx-kw { color: var(--muted); font-size: 10px; margin-right: 5px; }
.mx-group .mx-name { font-weight: 600; } .mx tr.d0 .mx-name { font-weight: 500; }
.mx-type { color: var(--muted); }
.mx-fold { all: unset; cursor: pointer; display: inline-block; width: 14px; margin-left: -16px; color: var(--muted); text-align: center; }
.mx-count { font-size: 10.5px; color: var(--muted); }
.g.mx-host { width: 7px; height: 7px; margin-left: 8px; border-width: 1px; vertical-align: 1px; }
.mx tr.muted > th { color: var(--muted); }
.mx tr.dashed .mx-name { color: var(--muted); border-bottom: 1px dashed var(--line-strong); }
.mx tbody tr:hover > th, .mx tbody tr:hover > td, .mx .hc { background-image: linear-gradient(var(--hover), var(--hover)); }
.mx .selected, .mx .on { --sel: inset 0 0 0 2px var(--ink); }
.mx thead th.selected { --sel: inset 0 -3px var(--ink); }
.tb-title { color: var(--ink); font-weight: 600; }
.et { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12px; }
.et th { position: sticky; top: 0; z-index: 1; padding: 6px 10px; text-align: left; font-weight: 500; color: var(--muted); background: var(--card); border-bottom: 1px solid var(--line-strong); white-space: nowrap; }
.et th button { all: unset; cursor: pointer; font-weight: 500; color: var(--muted); }
.et th button:hover { color: var(--ink); }
.et th[aria-sort="ascending"] button::after { content: " ↑"; } .et th[aria-sort="descending"] button::after { content: " ↓"; }
.et td { padding: 5px 10px; border-bottom: 1px solid var(--line); vertical-align: top; white-space: nowrap; background: var(--card); }
.et tbody tr { cursor: pointer; }
.et tbody tr:hover > td { background-image: linear-gradient(var(--hover), var(--hover)); }
.et tr.selected > td { --sel: inset 0 1px var(--ink), inset 0 -1px var(--ink); }
.et tr.muted > td { color: var(--muted); }
.et-name { font-weight: 600; }
.et td.et-wrap { white-space: normal; min-width: 160px; }
.et td.et-fig { white-space: normal; }
.et-fig b { display: inline-block; min-width: 3.2ch; margin-right: 6px; font-weight: 600; font-variant-numeric: tabular-nums; }
.et-fig small { color: var(--muted); font-size: 11.5px; }
.et-model { white-space: nowrap; }
.et-fig .et-plus { margin-left: 6px; padding: 0 5px; border: 1px solid var(--line); border-radius: 999px; }
.et-fig .et-chip { display: inline-block; margin: 1px 4px 1px 0; padding: 0 6px; border-radius: 999px; background: var(--accent-soft); color: var(--ink); }
.et-fig .et-flag { margin-left: 6px; color: var(--muted); }
.et-facet { color: var(--muted); font-style: italic; }
.et-name span { display: block; } .et-name small { color: var(--muted); font: 400 10.5px var(--mono); }
.et td.et-views { white-space: normal; min-width: 120px; }
.et-views button { all: unset; cursor: pointer; margin-right: 10px; color: var(--ink); text-decoration: underline; text-decoration-color: var(--line-strong); }
.et-views button:hover { text-decoration-color: var(--ink); }
.et-sum { display: flex; flex-wrap: wrap; gap: 10px; padding: 14px; border-bottom: 1px solid var(--line); cursor: pointer; }
.et-tile { display: grid; grid-template: "label label" auto "figure rest" auto / auto 1fr; align-items: baseline; gap: 0 7px; min-width: 110px; padding: 8px 12px 9px; border: 1px solid var(--line); border-radius: 10px; background: var(--paper); }
button.et-tile { cursor: pointer; text-align: left; }
button.et-tile:hover { border-color: var(--line-strong); background: var(--card); }
.et-tile span { grid-area: label; font-size: 11px; color: var(--muted); }
.et-tile strong { grid-area: figure; font-size: 20px; line-height: 1.2; font-weight: 600; letter-spacing: -.01em; }
.et-tile small { grid-area: rest; font-size: 11.5px; color: var(--muted); white-space: nowrap; }
.et-tile strong b { display: inline-flex; align-items: center; gap: 5px; margin-right: 12px; font-weight: 600; color: var(--doc); }
.et-tile strong b::before { content: ""; width: 10px; height: 10px; background: var(--doc); clip-path: var(--shape); }
.hl .et-sum.changed { box-shadow: inset 3px 0 var(--chg); } .et-sum.selected { background: var(--accent-soft); }
.et-src button { all: unset; display: grid; place-items: center; width: 22px; height: 18px; border-radius: 5px; cursor: pointer; color: var(--muted); }
.et-src button:hover { color: var(--ink); background: var(--hover); }
.et-src svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.wk { border-collapse: separate; border-spacing: 0; font-size: 12px; }
.wk th, .wk td { padding: 2px 14px; text-align: left; font-weight: 400; white-space: nowrap; vertical-align: middle; }
.wk thead th { position: sticky; top: 0; z-index: 1; background: var(--card); border-bottom: 1px solid var(--line-strong); color: var(--muted); font-weight: 500; }
.wk tbody th[data-id] { cursor: pointer; padding-left: 28px; }
.wk tbody th small { margin-left: 8px; color: var(--muted); }
.wk-agent th { padding-top: 8px; font: 600 11.5px var(--mono); }
.wk tr.muted th { color: var(--muted); }
.wk td[data-id] { cursor: pointer; }
.wk-run { display: inline-block; width: 7px; height: 7px; margin-left: 8px; border-radius: 50%; background: var(--md-soft); vertical-align: 1px; }
.wk-run.ok { background: var(--add); } .wk-run.bad { background: var(--del); }
.wk tr th.selected { --sel: inset 0 1px var(--ink), inset 0 -1px var(--ink); }
.wk-strip { display: block; overflow: visible; }
.wk-strip text { font-size: 10px; fill: var(--muted); }
.wk-strip line { stroke: var(--line-strong); }
.wk-day { fill: var(--paper); }
.wk-fire { fill: var(--md-stroke); }
.wk-band { fill: var(--md-stroke); opacity: .3; }
.wk tr.muted .wk-fire, .wk tr.muted .wk-band { fill: var(--md-soft); opacity: .45; }
.g { display: inline-block; position: relative; width: 11px; height: 11px; border: 1.2px solid var(--md-stroke); border-radius: 2px; vertical-align: middle; }
.g.h, .g.b { background: var(--md-stroke); }
.g.s { background: linear-gradient(to bottom right, transparent 50%, var(--md-stroke) 50%); }
.g.b::after { content: ""; position: absolute; left: 1.5px; right: 1.5px; top: 3.6px; height: 1.3px; background: #fff; }

/* Doctor: findings on the elements they concern. */
/* A shape per severity, so that colour is not the only cue: a diamond for an
   error, a triangle for a warning, a dot for a note. */
.doc-error, [data-doc="error"] { --doc: var(--del); --shape: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); }
.doc-warning, [data-doc="warning"] { --doc: var(--warn); --shape: polygon(50% 6%, 100% 94%, 0 94%); }
.doc-info { --doc: var(--md-soft); --shape: circle(42%); }
.sev, th[data-doc]::before, tr[data-doc] > .et-name:not(:has(span))::before, tr[data-doc] > .et-name > span::before { content: ""; display: inline-block; flex: none; width: 9px; height: 9px; margin-right: 6px; background: var(--doc); clip-path: var(--shape); vertical-align: 0; }
.wk th[data-doc]::before { margin-left: -15px; }
.md-doc path { fill: var(--doc); stroke: var(--paper); stroke-width: 2; stroke-linejoin: round; }
.md-doc text { font-size: 10px; font-weight: 700; fill: #fff !important; text-anchor: middle; }
.md-findings { list-style: none; margin: 4px 0 12px; padding: 0; }
.md-inspector .md-findings li { padding: 6px 0 6px 10px; border-top: 1px solid var(--line); box-shadow: inset 2px 0 var(--doc); }
.md-findings button.md-subject { display: inline; width: auto; padding: 0; border: 0; margin-right: 8px; font-weight: 600; }
.md-inspector li.active { background: var(--accent-soft); }
.md-inspector .md-findings li.active { box-shadow: inset 3px 0 var(--doc); }
.md-findings button.md-subject:hover { text-decoration: underline; }
.md-findings strong { margin-right: 8px; }
.md-findings code { font: 10.5px var(--mono); color: var(--doc); }
.md-findings p { margin: 2px 0 0; }
.md-findings .fix { color: var(--muted); }
.md-notes summary { margin: 4px 0; cursor: pointer; font-size: 11.5px; color: var(--muted); }
.doc-checks { margin: 2px 0 12px; padding: 10px 12px; border: 1px solid var(--line-strong); border-radius: 10px; background: var(--paper); }
.doc-checks h3 { margin: 0 0 4px; }
.doc-checks code { font: 10.5px var(--mono); color: var(--muted); }
.doc-checks p { margin: 4px 0 0; }
.doc-head { display: flex; align-items: center; gap: 0; }
.doc-code { display: inline-flex; gap: 8px; align-items: baseline; }
.doc-code strong { font-weight: 600; color: var(--doc); }
.doc-groups code { color: var(--muted); }
.doc-chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0 2px; }
.doc-chip { display: inline-flex; align-items: center; gap: 2px; padding: 1px 3px 1px 8px; border: 1px solid var(--line); border-radius: 999px; background: var(--card); }
.doc-chip.active { background: var(--accent-soft); border-color: var(--line-strong); }
.md-inspector .doc-chip button { all: unset; cursor: pointer; }
.doc-subject { font-weight: 600; padding-right: 4px; } button.doc-subject:hover { text-decoration: underline; }
.doc-chip .doc-src { display: grid; place-items: center; width: 18px; height: 16px; border-radius: 5px; color: var(--muted); }
.doc-chip .doc-src:hover { color: var(--ink); background: var(--hover); }
.doc-chip .doc-src svg { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.doc-new { padding: 0 6px; border-radius: 999px; font-size: 10px; font-weight: 600; color: var(--chg); background: var(--chg-bg); }
.doc-nested { display: flex; flex-wrap: wrap; align-items: center; gap: 0 6px; margin: 8px 0 0 10px; padding-left: 8px; border-left: 2px solid var(--line-strong); font-size: 11.5px; color: var(--muted); }
.doc-nested .doc-chips { flex-basis: 100%; margin-top: 2px; }

/* Files and changes */
nav.files { display: flex; flex-wrap: wrap; gap: 4px; margin: 0 0 10px; }
nav.files button { padding: 2px 10px; border: 1px solid var(--line); border-radius: 7px; background: var(--card); cursor: pointer; }
nav.files button.on { background: var(--ink); border-color: var(--ink); color: #fff; }
pre, .diff { margin: 0; overflow: auto; border: 1px solid var(--line); border-radius: 8px; background: var(--card); font: 12px/1.5 var(--mono); }
pre { padding: 8px 10px; }
.code { position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr); border: 1px solid var(--line); border-radius: 8px; background: var(--card); font: 12px/18px var(--mono); }
.code pre { border: 0; border-radius: 0; background: none; padding: 8px 10px; font: inherit; overflow: visible; }
.code .gutter { color: var(--faint); text-align: right; user-select: none; border-right: 1px solid var(--line); }
.code .band { position: absolute; left: 0; right: 0; background: rgb(29 29 31 / 6%); border-left: 3px solid var(--md-soft); pointer-events: none; }
.diff div { padding: 0 10px; white-space: pre; }
.add { background: #e6ffec; } .del { background: #ffebe9; } .hunk { background: #eaeef2; color: var(--muted); }
.chg-verdict { margin: -4px 0 14px; color: var(--muted); }
.chg-subjects { list-style: none; margin: 0 0 18px; padding: 0; max-width: 760px; }
.chg-subjects > li { padding: 8px 0; border-top: 1px solid var(--line); }
.chg-subject { all: unset; font-weight: 600; } button.chg-subject { cursor: pointer; } button.chg-subject:hover { text-decoration: underline; }
.chg-subjects ul { list-style: none; margin: 4px 0 0; padding: 0; }
.chg-subjects ul li { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: baseline; padding: 1px 0; }
.chg-subjects del { color: var(--del); text-decoration-color: rgb(177 60 66 / 45%); } .chg-subjects ins { color: var(--add); text-decoration: none; }
.chg-files { margin: 0 0 8px; } .chg-files > summary { padding: 6px 0; cursor: pointer; font-weight: 600; }
.chg-files section { margin: 4px 0 12px; } .chg-files h3 { margin: 8px 0 4px; font-size: 12px; font-weight: 500; color: var(--muted); }
.k { color: #8250df; } .s { color: #0a3069; } .c { color: #6e7781; }
@media (max-width: 760px) {
  .top { flex-wrap: wrap; height: auto; padding: 8px 12px; } .meta { display: none; }
  .md { grid-template: "bar rail" auto "main rail" minmax(0, 1fr) / minmax(0, 1fr) auto; } .md-legend, .md-hint { display: none; }
  .md-side { position: absolute; z-index: 5; top: 0; bottom: 0; right: 46px; width: min(420px, calc(100% - 56px)); box-shadow: -10px 0 30px rgb(0 0 0 / 8%); } .md-side-grip { display: none; }
}
</style>
</head>
<body>
<header class="top">
<div class="brand"><i aria-hidden="true"></i><h1>OpenClaw <span>→ SysML v2</span></h1></div>
<select id="version" aria-label="Version"></select>
<span class="meta" id="meta"></span>
<span class="note" id="note" role="status" hidden></span>
<nav class="tabs" aria-label="Pages"><button data-tab="diagrams">Diagrams</button><button data-tab="files">Files</button><button data-tab="changes">Changes</button></nav>
</header>
<main>
<section id="diagrams"><div class="md" id="md">
<div class="md-toolbar">
<div class="md-title"><strong id="view-title"></strong><span id="view-sub"></span></div>
<select id="view" aria-label="SysML view"></select>
<span class="md-chip" id="authority" hidden></span>
<div class="md-tools"><button type="button" id="fit" title="Fit (0)">Fit</button><button type="button" id="fit-selection" title="Fit selection (F)" aria-label="Fit selection" disabled><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 7.5V3h4.5M12.5 3H17v4.5M17 12.5V17h-4.5M7.5 17H3v-4.5"/><rect x="7" y="7" width="6" height="6" rx="1.5"/></svg></button><button type="button" id="zoom-in" title="Zoom in (+)" aria-label="Zoom in">+</button><button type="button" id="zoom-out" title="Zoom out (−)" aria-label="Zoom out">−</button></div>
</div>
<div class="md-main">
<div class="md-stage" id="stage">
<div class="md-canvas" id="canvas" tabindex="0" role="group" aria-label="Diagram canvas. Drag or scroll to pan, Command or Control and scroll to zoom. Arrow keys pan, plus and minus zoom, zero fits, F fits the selection, Enter frames an element, Escape clears the selection."></div>
<div class="md-legend" id="legend"></div>
<span class="md-hint">Drag or scroll to pan · ⌘/Ctrl + scroll to zoom · click an element</span>
</div>
<div class="md-split" id="split" role="separator" aria-orientation="horizontal" aria-label="Resize the table" title="Drag to resize" hidden></div>
<div class="md-sheet" id="sheet" hidden></div>
</div>
<aside class="md-side" id="side" aria-labelledby="side-title" hidden>
<div class="md-side-grip" id="side-grip" role="separator" aria-orientation="vertical" aria-label="Resize the sidebar" title="Drag to resize · double-click to reset" tabindex="0"></div>
<header class="md-side-head"><strong id="side-title"></strong><span class="md-side-tools" id="side-tools"></span><button type="button" id="side-collapse" title="Collapse the sidebar" aria-label="Collapse the sidebar">»</button></header>
<div class="md-inspector" id="inspector" tabindex="-1"></div>
</aside>
<nav class="md-rail" aria-label="Panels">
<button type="button" data-panel="inspector" aria-label="Inspector" title="Inspector" aria-pressed="false"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="3" width="14" height="14" rx="2.5"/><path d="M6.5 7.5h7M6.5 10.5h7M6.5 13.5h4"/></svg></button>
<button type="button" data-panel="changes" aria-label="Changes" title="Changes" aria-pressed="false"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v8M6 7h8M6 16h8"/></svg><b></b></button>
<button type="button" data-panel="doctor" aria-label="Doctor" title="Doctor" aria-pressed="false"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 10.5h3.5l2-5 4 10 2-5H18"/></svg><b></b></button>
</nav>
</div></section>
<section id="files" class="sheet" hidden></section>
<section id="changes" class="sheet" hidden></section>
</main>
<div id="live" class="sr" aria-live="polite"></div>
<script id="data" type="application/json">__DATA__</script>
<script>
"use strict";
const data = JSON.parse(document.getElementById("data").textContent);
const versions = data.versions;
const M = __METRICS__;
const NS = "http://www.w3.org/2000/svg";
const KEYWORDS = new Set(("about abstract accept action alias attribute bind calc case comment" +
  " connect connection constraint def doc else end enum exhibit false first flow for from if" +
  " import in inout interface item library metadata not null occurrence or out package part" +
  " perform port private protected public redefines ref require requirement return satisfy" +
  " send specializes state subject subsets succession then to transition true use verify via").split(" "));
const TOKEN = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|([A-Za-z_]\w*)/g;
// A legend per view (Behaviour's for all its views): what its shapes and edges mean.
const LEGENDS = {
  system: [["usage", "part usage"], ["connection", "connection : AgentBinding"], ["trigger", "hook starts agent"], ["dashed", "disabled"]],
  reach: [["usage", "agent"], ["delegation", "may delegate to"], ["mutual", "both ways"], ["trigger", "hook starts agent"], ["dashed", "absent agent"]],
  schedules: [["usage", "scheduled case"], ["owner", "owner"], ["target", "unresolved targetAgent"], ["dashed", "disabled"]],
  Behaviour: [["initial", "start"], ["decision", "decision"], ["send", "hand-off or escalation"], ["final", "done"],
    ["succession", "succession"]],
};

const state = { version: 0, tab: "diagrams", view: "overview", file: "OpenClawInstance.sysml", range: null,
  // An element to select once its view is shown.
  selected: null, focus: null, hover: null, viewport: null, highlight: true, drawn: null, doc: new Map(), panel: null,
  // The scale Fit gave the drawn scene, and the viewport it set.
  fitK: 1, fitted: null,
  // Tables: the text filter, folded groups, the facet value shown, the sort,
  // and the height a table under a diagram was dragged to.
  filter: "", folded: new Set(), facet: null, sort: null, sheetH: null, sheetFolded: false,
  // Behaviour's table: "rules" or "procedures".
  sheetTab: "rules",
  // A folded legend, read from storage once.
  legendFolded: null,
  // What the last link named that the page lacks (see follow).
  note: null,
  // Panels: where each was scrolled to (see showPanel), whether the Doctor's
  // notes are open, and whether a selection keeps the open panel.
  scrolls: new Map(), panelKey: null, notesOpen: false, limitsOpen: false, stay: false,
  // The agents a finding relates, lit together while one of them is selected.
  ring: null };

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function sv(tag, attrs, text) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]);
  if (text !== undefined) e.textContent = text;
  return e;
}
const when = (v) => v.createdAt.slice(0, 19).replace("T", " ");
const viewsOf = (i) => (versions[i] && versions[i].views) || null;
const payload = (entry) => data.views[entry.view];
const entryOf = (i, id) => (viewsOf(i) || []).find((e) => payload(e).id === id);
const fileText = (i, name) => data.texts[versions[i].files[name]];

// Routing: #<version>[/<view>[/<element>]], #<version>/files[/<file>[:<from>-<to>]]
// or #<version>/changes. A segment that does not decode is kept as written,
// and so names nothing. Opening another place adds a history entry (see
// navigate); a selection, the first render and a rewritten link replace it.
function decoded(segment) {
  try { return decodeURIComponent(segment); } catch { return segment; }
}
// Reads the place a link names; returns the version and element it asked for.
function readHash() {
  const [version, place, ...rest] = location.hash.slice(1).split("/").map(decoded);
  const target = rest.join("/");
  state.version = Math.max(0, versions.findIndex((v) => v.id === version));
  state.focus = null;
  if (place === "files") {
    const [, file, from, to] = /^(.*?)(?::(\d+)(?:-(\d+))?)?$/.exec(target);
    state.tab = "files";
    state.file = file || state.file;
    state.range = from ? [+from, +(to || from)] : null;
  } else if (place === "changes") state.tab = "changes";
  else {
    state.tab = "diagrams";
    if (place) state.view = place;
    state.focus = target || null;
  }
  return { version: version || null, element: state.focus };
}
let pushNext = false;
function writeHash() {
  const tail = state.tab === "files" ? ["files", state.file + (state.range ? ":" + state.range[0] + "-" + state.range[1] : "")]
    : state.tab === "changes" ? ["changes"]
    : [state.view, ...state.selected && shownView() === state.view ? [state.selected] : []];
  const hash = "#" + [versions[state.version].id, ...tail].map(encodeURIComponent).join("/");
  if (hash !== location.hash) history[pushNext ? "pushState" : "replaceState"](null, "", hash);
  pushNext = false;
}
// Opens another place: a version, a view, a tab or a file.
function navigate(change, keepViewport) {
  Object.assign(state, change);
  state.note = null;
  pushNext = true;
  render(keepViewport);
}
// Shows the place a link names, and notes what it names that this page lacks.
function follow() {
  const asked = readHash();
  render();
  state.note = asked.version && versions[state.version].id !== asked.version ? missing("VERSION_NOT_FOUND", asked.version)
    : asked.element && state.selected !== asked.element ? missing("ELEMENT_NOT_FOUND", asked.element) : null;
  renderNote();
}
// What a link named and this page does not show, by code; the text on screen
// stays short, the exact sentence is the tooltip.
function missing(code, id) {
  if (code === "VERSION_NOT_FOUND") return { code, text: "No version " + id, detail: "This page has no version " + id + "; it shows the latest one." };
  if (code === "ELEMENT_NOT_FOUND") return { code, text: id + " is not in this view", detail: "No element " + id + " in this view of this version." };
  // The asked-for view: the nearest version that has it opens it.
  const has = versions.map((_, i) => i).filter((i) => entryOf(i, id)).sort((a, b) => Math.abs(a - state.version) - Math.abs(b - state.version));
  const title = has.length ? payload(entryOf(has[0], id)).title : id;
  // A Behaviour view is missing because this version ran no inference.
  const why = id.startsWith("behaviour:") && !versions[state.version].inferred ? " · inference not run" : " is not in this version";
  return { code, text: title + why, detail: "No view " + id + " in this version" + (has.length ? "; " + plural(has.length, "version") + " of this page have it." : " nor in any other."),
    recovery: has.length ? { label: when(versions[has[0]]), go: () => navigate({ version: has[0] }, true) } : null };
}
function renderNote() {
  const box = document.getElementById("note");
  const entries = state.tab === "diagrams" && viewsOf(state.version);
  const n = entries && entries.length && shownView() !== state.view ? missing("VIEW_NOT_FOUND", state.view) : state.note;
  box.hidden = !n;
  if (!n) { box.replaceChildren(); delete box.dataset.code; return; }
  box.dataset.code = n.code;
  box.title = n.code + ": " + n.detail;
  box.replaceChildren(el("span", "", n.text), ...n.recovery ? [button(n.recovery.label + " →", n.recovery.go)] : []);
}

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

// Per-viewer conveniences kept between visits: the sidebar's width, a folded
// legend, a hint already seen. Storage may be unavailable.
const WIDTH_KEY = "openclaw-sysmlv2-viewer:sidebar-width", LEGEND_KEY = "openclaw-sysmlv2-viewer:legend-folded",
  HINT_KEY = "openclaw-sysmlv2-viewer:hint-seen";
function stored(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function store(key, value) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}

// ---- Header
// What went into a version against the previous one (viewer.ts's inputs), as
// a glyph for the version picker and words for the header.
function verdict(v) {
  const reemitted = v.diff && v.diff.groups.some((g) => g.group !== "diagnostics");
  const touched = (v.views || []).reduce((n, e) => n + (e.delta && e.delta.touched ? e.delta.touched.length : 0), 0);
  if (v.inputs === "changed") return { glyph: "●", words: "Configuration changed" };
  if (v.inputs === "inference") return { glyph: "◆", words: "Inference changed" };
  if (v.inputs === "schema") return { glyph: "◇", words: "Not comparable", detail: "The previous version's snapshot uses a format this viewer does not read." };
  if (v.inputs === "same") return reemitted ? { glyph: "◆", words: "Same configuration · SysML re-emitted (" + (touched || v.changes.length) + ")" } : { glyph: "○", words: "Same configuration" };
  return { glyph: "", words: "First version" };
}
// The inference of a version, and whether its model checks ran.
function inferenceWords(v) {
  if (!v.inferred) return "inference not run";
  const failed = v.inferred.failed ? " · inference failed: " + v.inferred.failed : "";
  if (v.inferred.reused) return "inferred " + v.inferred.reused.from.map((id) => when(versions.find((x) => x.id === id) || { createdAt: id })).join(", ") + " · sources unchanged" + failed;
  return "inferred " + plural(v.inferred.procedures, "procedure") + ", " + plural(v.inferred.rules, "rule") + failed;
}
const CHECKS_WORDS = { "not-run": "checks not run", failed: "checks failed", unrecorded: "checks not recorded" };
function renderHeader() {
  const select = document.getElementById("version");
  select.replaceChildren(...versions.map((v, i) => {
    const c = v.checks && v.checks.state !== "verified" ? " · not checked" : "", f = v.inferred && v.inferred.failed ? " · inference failed" : "";
    const o = el("option", "", (verdict(v).glyph || " ") + " " + when(v) + " UTC" + (i === 0 ? " · latest" : "") + c + f);
    o.value = String(i);
    return o;
  }));
  select.value = String(state.version);
  const v = versions[state.version], said = verdict(v);
  const go = button(said.words, () => navigate({ tab: "changes" }), "meta-verdict");
  go.title = (said.detail ? said.detail + " " : "") + "Show the file diff";
  go.disabled = !v.changes;
  const checks = v.checks && CHECKS_WORDS[v.checks.state];
  document.getElementById("meta").replaceChildren(go, " · " + inferenceWords(v), ...checks ? [" · ", button(checks, () => { navigate({ tab: "diagrams" }); openPanel("doctor"); }, "meta-verdict")] : []);
  for (const b of document.querySelectorAll(".tabs button")) {
    if (b.dataset.tab === state.tab) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  }
  for (const id of ["diagrams", "files", "changes"]) document.getElementById(id).hidden = id !== state.tab;
}

// ---- Diagram drawing
function txt(x, y, text, cls, anchor, max) {
  const t = sv("text", { x, y, class: cls, "text-anchor": anchor });
  t.textContent = text;
  if (max) t.dataset.max = String(max);
  return t;
}
function rounded(p) {
  const pts = [];
  for (let i = 0; i < p.length; i += 2) pts.push([p[i], p[i + 1]]);
  let d = "M" + pts[0][0] + "," + pts[0][1];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const d0 = Math.hypot(b[0] - a[0], b[1] - a[1]), d1 = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const r = Math.min(8, d0 / 2, d1 / 2);
    if (r < 0.5) { d += " L" + b[0] + "," + b[1]; continue; }
    d += " L" + (b[0] + (a[0] - b[0]) * r / d0) + "," + (b[1] + (a[1] - b[1]) * r / d0) +
      " Q" + b[0] + "," + b[1] + " " + (b[0] + (c[0] - b[0]) * r / d1) + "," + (b[1] + (c[1] - b[1]) * r / d1);
  }
  const last = pts[pts.length - 1];
  return d + " L" + last[0] + "," + last[1];
}

function drawBlock(g, n) {
  const def = n.kw && /def»$/.test(n.kw);
  g.append(sv("rect", { class: "md-body", x: n.x, y: n.y, width: n.w, height: n.h, rx: def ? 1.5 : 9 }));
  const cx = n.x + n.w / 2, inner = n.w - 2 * M.padX;
  let cy = n.y + M.padTop;
  if (n.kw) { g.append(txt(cx, cy + 10, n.kw, "md-stereo", "middle")); cy += M.kwH; }
  const head = txt(cx, cy + 13, "", "", "middle", inner);
  head.append(sv("tspan", { class: "md-name" }, n.name));
  if (n.type && !n.split) head.append(sv("tspan", { class: "md-type" }, n.type));
  g.append(head);
  cy += M.nameH;
  if (n.split) { g.append(txt(cx, cy + 13, n.type, "md-type", "middle", inner)); cy += M.nameH; }
  cy += 4;
  for (const [title, rows] of n.comps || []) {
    g.append(sv("line", { class: "md-rule", x1: n.x, x2: n.x + n.w, y1: cy + 2, y2: cy + 2 }));
    g.append(txt(cx, cy + M.sectH, title, "md-sect", "middle"));
    cy += M.sectGap + M.sectH;
    for (const row of rows) { g.append(txt(n.x + M.padX, cy + 11, row, "md-row", null, inner)); cy += M.rowH; }
  }
}
function drawFrame(g, n) {
  const def = n.kw && /(def|package)»$/.test(n.kw);
  g.append(sv("rect", { class: "md-body", x: n.x, y: n.y, width: n.w, height: n.h, rx: def ? 2 : 10 }));
  const tab = Math.min(n.w, n.tab || 120);
  g.append(sv("path", { class: "md-tab", d: def
    ? "M" + n.x + "," + n.y + " H" + (n.x + tab) + " V" + (n.y + M.tabH - 6) + " L" + (n.x + tab - 6) + "," + (n.y + M.tabH) + " H" + n.x + " Z"
    : "M" + (n.x + 10) + "," + n.y + " H" + (n.x + tab) + " V" + (n.y + M.tabH - 8) + " Q" + (n.x + tab) + "," + (n.y + M.tabH) + " " + (n.x + tab - 8) + "," + (n.y + M.tabH) + " H" + n.x + " V" + (n.y + 10) + " Q" + n.x + "," + n.y + " " + (n.x + 10) + "," + n.y + " Z" }));
  const t = txt(n.x + 12, n.y + 16, "", "", null, tab - 18);
  t.append(sv("tspan", { class: "md-stereo" }, n.kw), sv("tspan", { class: "md-name", dx: 5 }, n.name));
  if (n.type) t.append(sv("tspan", { class: "md-type" }, n.type));
  g.append(t);
  let y = n.y + M.tabH + 14;
  if (n.title) { g.append(txt(n.x + 16, y + 12, n.title, "md-name", null, n.w - 32)); y += M.headH + 2; }
  for (const line of n.head || []) { g.append(txt(n.x + 16, y + 11, line, "md-sect", null, n.w - 32)); y += M.headH; }
}
function drawNode(n, delta) {
  const classes = ["md-node", n.shape, n.shape === "frame" || n.shape === "group" ? "container" : "leaf",
    n.kw && /def»$/.test(n.kw) ? "def" : "", n.muted ? "muted" : "", n.dashed ? "dashed" : "",
    delta && delta.added.includes(n.id) ? "added" : "", delta && delta.changed.includes(n.id) ? "changed" : "",
    delta && delta.touched.includes(n.id) ? "touched" : ""];
  const doc = state.doc.get(n.id), status = delta && delta.added.includes(n.id) ? "added" : delta && delta.changed.includes(n.id) ? "changed" : "";
  const g = sv("g", { class: classes.filter(Boolean).join(" "), "data-id": n.id, tabindex: 0, role: "button",
    "aria-label": [(n.kw || n.shape) + " " + labelOf(n), status, doc && "worst finding " + doc.worst].filter(Boolean).join(", ") });
  g.append(sv("title", {}, labelOf(n)));
  const { x, y, w, h } = n, cx = x + w / 2, cy = y + h / 2;
  g.append(n.shape === "initial" || n.shape === "final" ? sv("circle", { class: "md-ring-select", cx, cy, r: w / 2 })
    : n.shape === "decision" ? sv("path", { class: "md-ring-select", d: "M" + cx + "," + y + " L" + (x + w) + "," + cy + " L" + cx + "," + (y + h) + " L" + x + "," + cy + " Z" })
    : sv("rect", { class: "md-ring-select", x, y, width: w, height: h, rx: n.shape === "action" ? 14 : 9 }));
  switch (n.shape) {
    case "frame": drawFrame(g, n); break;
    case "group":
      g.append(sv("rect", { class: "md-body", x, y, width: w, height: h, rx: 8 }));
      g.append(txt(x + 12, y + 19, n.name, "md-group-label"));
      break;
    case "initial": g.append(sv("circle", { class: "md-body md-solid", cx, cy, r: w / 2 })); break;
    case "final":
      g.append(sv("circle", { class: "md-ring", cx, cy, r: w / 2 }));
      g.append(sv("circle", { class: "md-body md-solid", cx, cy, r: w / 2 - 4 }));
      break;
    case "decision":
      g.append(sv("path", { class: "md-body", d: "M" + cx + "," + y + " L" + (x + w) + "," + cy + " L" + cx + "," + (y + h) + " L" + x + "," + cy + " Z" }));
      if (n.label) n.label.lines.forEach((l, i) => g.append(txt(n.label.x + 2, n.label.y + (i + 1) * M.lineH - 3, l, "md-text")));
      break;
    case "action":
    case "send": {
      const tip = n.shape === "send" ? 14 : 0;
      g.append(sv("path", { class: "md-body", d: n.shape === "send"
        ? "M" + (x + 6) + "," + y + " H" + (x + w - tip) + " L" + (x + w) + "," + cy + " L" + (x + w - tip) + "," + (y + h) + " H" + (x + 6) + " Q" + x + "," + (y + h) + " " + x + "," + (y + h - 6) + " V" + (y + 6) + " Q" + x + "," + y + " " + (x + 6) + "," + y + " Z"
        : "M" + (x + 14) + "," + y + " H" + (x + w - 14) + " Q" + (x + w) + "," + y + " " + (x + w) + "," + (y + 14) + " V" + (y + h - 14) + " Q" + (x + w) + "," + (y + h) + " " + (x + w - 14) + "," + (y + h) + " H" + (x + 14) + " Q" + x + "," + (y + h) + " " + x + "," + (y + h - 14) + " V" + (y + 14) + " Q" + x + "," + y + " " + (x + 14) + "," + y + " Z" }));
      const lines = n.lines || [], tx = x + (w - tip) / 2;
      let top = y + (h - lines.length * M.lineH - (n.kw ? M.kwH : 0)) / 2;
      if (n.kw) { g.append(txt(tx, top + 10, n.kw, "md-stereo", "middle")); top += M.kwH; }
      lines.forEach((l, i) => g.append(txt(tx, top + (i + 1) * M.lineH - 3, l, "md-text", "middle", w - tip - 16)));
      break;
    }
    case "actor": {
      const ax = cx, ay = y + 4;
      g.append(sv("rect", { x, y, width: w, height: h, fill: "transparent" }));
      g.append(sv("circle", { class: "md-actor", cx: ax, cy: ay + 6, r: 6 }));
      g.append(sv("path", { class: "md-actor", d: "M" + ax + "," + (ay + 12) + " V" + (ay + 30) + " M" + (ax - 12) + "," + (ay + 19) + " H" + (ax + 12) + " M" + (ax - 10) + "," + (ay + 43) + " L" + ax + "," + (ay + 30) + " L" + (ax + 10) + "," + (ay + 43) }));
      g.append(txt(cx, y + h - 2, n.name, "md-name", "middle"));
      break;
    }
    default: drawBlock(g, n);
  }
  const mark = delta && (delta.added.includes(n.id) ? "add" : delta.changed.includes(n.id) ? "chg" : "");
  if (mark && n.shape !== "initial" && n.shape !== "final") {
    const b = sv("g", { class: "md-badge " + mark });
    b.append(sv("circle", { cx: x + w - 2, cy: y + 2, r: 8 }), txt(x + w - 2, y + 5.5, mark === "add" ? "+" : "~"));
    g.append(b);
  }
  if (doc) {
    const b = sv("g", { class: "md-doc doc-" + doc.worst });
    b.append(sv("title", {}, doc.codes), sv("path", { d: severityPath(doc.worst, x + 2, y + 2) }), txt(x + 2, y + (doc.worst === "error" ? 5.5 : 6.5), "!"));
    g.append(b);
  }
  return g;
}
// A diamond for an error, a triangle for a warning, around (cx, cy).
function severityPath(severity, cx, cy) {
  return severity === "error" ? "M" + cx + "," + (cy - 10) + " L" + (cx + 10) + "," + cy + " L" + cx + "," + (cy + 10) + " L" + (cx - 10) + "," + cy + " Z"
    : "M" + cx + "," + (cy - 9) + " L" + (cx + 10) + "," + (cy + 8) + " L" + (cx - 10) + "," + (cy + 8) + " Z";
}
function drawEdge(e, delta, inner) {
  const cls = ["md-edge", e.kind, inner ? "inner" : "", delta && delta.added.includes(e.id) ? "added" : "", delta && delta.changed.includes(e.id) ? "changed" : ""];
  const g = sv("g", { class: cls.filter(Boolean).join(" "), "data-id": e.id });
  const arrow = e.kind === "connection" ? null : e.kind === "escalation" ? "md-arrow-warn" : "md-arrow";
  // A pair that delegates both ways is one edge with an arrowhead at each end.
  e.pts.forEach((p, i) => g.append(sv("path", { class: "md-line", d: rounded(p), "marker-end": arrow ? "url(#" + arrow + ")" : undefined,
    "marker-start": e.mutual && i === 0 ? "url(#" + arrow + ")" : undefined })));
  if (e.label) e.label.lines.forEach((l, i) => g.append(txt(e.label.x + 3, e.label.y + 11 + i * 13, l)));
  return g;
}
function defs() {
  const d = sv("defs", {});
  for (const id of ["md-arrow", "md-arrow-warn"]) {
    const m = sv("marker", { id, viewBox: "0 0 12 10", markerWidth: 12, markerHeight: 10, refX: 11, refY: 5, orient: "auto-start-reverse", markerUnits: "userSpaceOnUse" });
    m.append(sv("path", { d: "M1,1 L11,5 L1,9", class: "md-mark-line" }));
    d.append(m);
  }
  return d;
}

// ---- Diagram page
// The view asked for (state.view) stays asked for across versions; a version
// without it shows its first view.
function currentView() {
  const entries = viewsOf(state.version);
  if (!entries || !entries.length) return null;
  const entry = entries.find((e) => payload(e).id === state.view) || entries[0];
  return { entry, view: payload(entry), delta: entry.delta };
}
const shownView = () => state.drawn && state.drawn.view;
function renderPicker(entries, shown) {
  const select = document.getElementById("view");
  const groups = new Map();
  for (const e of entries) {
    const v = payload(e);
    if (!groups.has(v.group)) groups.set(v.group, []);
    const n = marked(e, v) ? e.delta.count : 0;
    const o = el("option", "", v.title + (e.delta && e.delta.isNew ? " · new" : n ? " · " + n + (n === 1 ? " change" : " changes") : ""));
    o.value = v.id;
    groups.get(v.group).push(o);
  }
  select.replaceChildren(...[...groups].map(([name, options]) => {
    const g = el("optgroup");
    g.label = name;
    g.append(...options);
    return g;
  }));
  select.value = shown;
}
// An element's header: a drawn node, or a row, column or cell of the table.
function headOf(view, id) {
  const n = view.scene && view.scene.nodes.find((x) => x.id === id);
  const t = view.table;
  if (n || !t) return n || null;
  if (t.kind === "matrix") {
    const cell = t.cells.find((c) => c[3] === id);
    if (cell) return { id, kw: "allocation", name: t.rows[cell[0]].name + " → " + t.columns[cell[1]].name };
    return t.columns.find((c) => c.id === id) || t.rows.find((r) => r.id === id) || null;
  }
  return t.rows.find((r) => r.id === id) || (t.summary && t.summary.id === id ? t.summary : null);
}
// Opens a view of this version and selects one of its elements, if it has
// it; the open panel stays when asked.
function go(view, id, stay, ring) {
  navigate({ tab: "diagrams", view, focus: id, stay: Boolean(stay), ring: ring || null });
}
const nameOf = (n) => n.name || (n.lines || []).join(" ") || (n.label ? n.label.lines.join(" ") : n.shape);
// An element's readable name: its scene title or row title, the version's
// label for its id (viewer.ts's labels), else its declared name.
const labelOf = (n) => n.title || (versions[state.version].labels || {})[n.id] || nameOf(n);
function button(text, onclick, cls) {
  const b = el("button", cls || "", text);
  b.type = "button";
  b.onclick = onclick;
  return b;
}
function marker(delta) {
  const added = new Set(delta ? delta.added : []), changed = new Set(delta ? delta.changed : []), touched = new Set(delta ? delta.touched : []);
  return (id) => added.has(id) ? " added" : changed.has(id) ? " changed" : touched.has(id) ? " touched" : "";
}
// The changes the shown view marks (see marked); what changed only in its
// SysML is marked, fainter, only when the configuration changed.
function changeMarks() {
  const cur = currentView();
  if (!cur || !marked(cur.entry, cur.view)) return null;
  return { ...cur.delta, touched: versions[state.version].inputs === "changed" ? cur.delta.touched : [] };
}

// The rail's counts: what changed in this view, and the doctor's errors and
// warnings, coloured by the worst.
function renderRail(cur) {
  const d = cur && cur.delta, before = d && !d.isNew && payload(entryOf(state.version + 1, cur.view.id));
  const n = cur && marked(cur.entry, cur.view) ? d.count : 0;
  const changes = rail("changes");
  changes.querySelector("b").textContent = n ? String(n) : "";
  changes.title = d && d.isNew ? "Changes: new in this version" : before ? "Changes since " + when(versions[state.version + 1]) : "Changes";
  const v = versions[state.version], findings = v.findings || [], checked = !v.checks || v.checks.state === "verified";
  const errors = findings.filter((f) => f.severity === "error").length, warnings = findings.filter((f) => f.severity === "warning").length;
  const doctor = rail("doctor"), badge = doctor.querySelector("b");
  // Unchecked, the badge is a neutral "?" whatever the collector noted.
  badge.textContent = !checked ? "?" : errors + warnings ? String(errors + warnings) : "";
  badge.className = !checked ? "doc-info" : errors ? "doc-error" : "doc-warning";
  doctor.title = "Doctor: " + (!checked ? CHECKS_WORDS[v.checks.state] : plural(errors, "error") + ", " + plural(warnings, "warning"));
}
const rail = (name) => document.querySelector('.md-rail [data-panel="' + name + '"]');
// Whether a view's changes are marked: not when the configuration is the same
// or not comparable, and only Behaviour when only the inference changed.
function marked(entry, view) {
  const inputs = versions[state.version].inputs;
  return Boolean(entry.delta && !entry.delta.isNew && inputs !== "same" && inputs !== "schema" &&
    (inputs !== "inference" || view.group === "Behaviour"));
}
// The ids of a delta that this view shows.
const shown = (ids, view) => ids.filter((id) => headOf(view, id));
// What was added, changed and removed since the previous version, with the
// values that changed; each entry opens its element.
function showChanges(cur) {
  const d = cur && cur.delta;
  if (!d || d.isNew) {
    showPanel("changes", [el("p", "md-side-empty", d ? "New in this version: the previous one has no such view." : "First version: nothing to compare.")]);
    return;
  }
  const before = payload(entryOf(state.version + 1, cur.view.id)), v = versions[state.version];
  const parts = [el("p", "md-side-note", "Since " + when(versions[state.version + 1]))];
  // With the same configuration, or only another inference outside Behaviour,
  // nothing is listed: one line says so and leads to the file diff.
  if (!marked(cur.entry, cur.view)) {
    const said = v.inputs === "inference" ? { words: "Same configuration · inference changed" } : verdict(v);
    parts.push(button(said.words, () => navigate({ tab: "changes" }), "md-verdict"));
    showPanel("changes", parts);
    return;
  }
  const group = (label, ids, view, open, diff) => {
    if (!ids.length) return;
    const ul = el("ul", "md-changes");
    for (const id of ids) {
      const n = headOf(view, id), b = button("", () => open(id)), li = el("li");
      if (view === cur.view) li.dataset.subject = id;
      b.append(el("span", "md-other", labelOf(n)), el("span", "md-kind", n.kw || n.shape || ""));
      li.append(b);
      const dl = diff && attributes((view.elements[id] || { a: [] }).a, (before.elements[id] || { a: [] }).a, true);
      if (dl && dl.childElementCount) li.append(dl);
      ul.append(li);
    }
    parts.push(el("p", "md-kicker", label + " · " + ids.length), ul);
  };
  group("Added", shown(d.added, cur.view), cur.view, (id) => stayOn(cur.view.id, id), false);
  group("Changed", shown(d.changed, cur.view), cur.view, (id) => stayOn(cur.view.id, id), true);
  group("Removed", shown(d.removed, before), before, (id) => inspect(state.version + 1, before, id, "removed"), false);
  const touched = shown(d.touched, cur.view).length;
  if (parts.length === 1) parts.push(el("p", "md-side-empty", "No change in this view."));
  if (touched) parts.push(button(touched + " changed in their SysML only: show the file diff", () => navigate({ tab: "changes" }), "md-back"));
  const highlight = button("Highlight", () => {
    state.highlight = !state.highlight;
    highlight.setAttribute("aria-pressed", String(state.highlight));
    document.getElementById("md").classList.toggle("hl", state.highlight);
  });
  highlight.title = "Mark what changed in the diagram and the table";
  highlight.setAttribute("aria-pressed", String(state.highlight));
  showPanel("changes", parts, [highlight]);
}
function renderLegend(view) {
  const box = document.getElementById("legend");
  const items = view.scene ? LEGENDS[view.id] || LEGENDS[view.group] || [] : [];
  const keys = items.map(([kind, text]) => {
    const s = el("span");
    const g = sv("svg", { viewBox: "0 0 26 14", "aria-hidden": "true" });
    const add = (tag, a) => g.append(sv(tag, a));
    if (kind === "usage" || kind === "dashed") add("rect", { x: 1, y: 1, width: 24, height: 12, rx: 4, fill: "#fff", stroke: kind === "dashed" ? "#8e8b85" : "#2b2b2d", "stroke-dasharray": kind === "dashed" ? "3 2" : null });
    if (kind === "connection") add("path", { d: "M1,7 H25", stroke: "#4b4b4f", "stroke-width": 1.3 });
    if (kind === "owner" || kind === "succession" || kind === "delegation") add("path", { d: "M1,7 H24 M19,3 L24,7 L19,11", stroke: "#4b4b4f", fill: "none", "stroke-width": 1.3 });
    if (kind === "mutual") add("path", { d: "M2,7 H24 M19,3 L24,7 L19,11 M7,3 L2,7 L7,11", stroke: "#4b4b4f", fill: "none", "stroke-width": 1.3 });
    if (kind === "trigger") add("path", { d: "M1,7 H22 M19,3 L24,7 L19,11", stroke: "#4b4b4f", fill: "none", "stroke-width": 1.4, "stroke-dasharray": "0.1 3.2", "stroke-linecap": "round" });
    if (kind === "target") add("path", { d: "M1,7 H24 M19,3 L24,7 L19,11", stroke: "#8e8b85", fill: "none", "stroke-dasharray": "2 2" });
    if (kind === "initial") add("circle", { cx: 13, cy: 7, r: 5, fill: "#2b2b2d" });
    if (kind === "final") { add("circle", { cx: 13, cy: 7, r: 6, fill: "#fff", stroke: "#2b2b2d" }); add("circle", { cx: 13, cy: 7, r: 3, fill: "#2b2b2d" }); }
    if (kind === "decision") add("path", { d: "M13,0 L20,7 L13,14 L6,7 Z", fill: "#fff", stroke: "#2b2b2d" });
    if (kind === "send") add("path", { d: "M2,1 H18 L24,7 L18,13 H2 Z", fill: "#fff", stroke: "#2b2b2d" });
    s.append(g, text);
    return s;
  });
  // Folded, the legend is one button; the choice is kept between visits.
  if (state.legendFolded === null) state.legendFolded = stored(LEGEND_KEY) === "1";
  const folded = state.legendFolded;
  const fold = button(folded ? "Legend" : "‹", () => {
    state.legendFolded = !folded;
    store(LEGEND_KEY, folded ? null : "1");
    renderLegend(view);
  }, "md-legend-fold");
  fold.title = folded ? "Show the legend" : "Hide the legend";
  fold.setAttribute("aria-expanded", String(!folded));
  box.classList.toggle("folded", folded);
  box.replaceChildren(...folded ? [] : keys, fold);
  box.hidden = !items.length;
}
// When a Behaviour view's inference was made: an earlier run's, reused
// because its sources did not change (export-instance.ts's inferredIn).
function inferredIn(view) {
  const ref = versions[state.version].files["inference.json"], agent = view.id.slice("behaviour:".length);
  if (ref === undefined) return null;
  const a = (JSON.parse(data.texts[ref]).agents || []).find((x) => x.agentId === agent);
  return a && a.inferredIn && a.inferredIn !== versions[state.version].id ? a.inferredIn : null;
}
function subtitle(view) {
  const t = view.table;
  if (view.group === "Behaviour" && inferredIn(view)) {
    const at = versions.find((v) => v.id === inferredIn(view));
    return "inferred " + (at ? when(at) : inferredIn(view)) + " · sources unchanged";
  }
  if (t && t.kind === "matrix") {
    return t.rows.filter((r) => r.shape === "tool" && !r.dashed).length + " tools × " + t.columns.length + " agents · SysML allocation matrix";
  }
  return [
    ...view.scene ? [view.scene.nodes.filter((n) => !["frame", "group", "initial", "final"].includes(n.shape)).length + " elements"] : [],
    ...t && t.kind === "elements" ? [t.rows.length + " " + (t.rows.length === 1 ? t.title.replace(/s$/, "") : t.title).toLowerCase()] : [],
  ].join(" · ");
}

function renderDiagram(keepViewport) {
  const canvas = document.getElementById("canvas"), stage = document.getElementById("stage"), sheet = document.getElementById("sheet");
  const cur = currentView();
  const entries = viewsOf(state.version);
  renderRail(cur);
  if (!cur) {
    document.getElementById("view-title").textContent = "Diagrams";
    document.getElementById("view-sub").textContent = "";
    document.getElementById("view").replaceChildren();
    document.getElementById("legend").hidden = true;
    stage.hidden = false;
    sheet.hidden = true;
    document.getElementById("split").hidden = true;
    canvas.replaceChildren(el("p", "md-empty", "No diagrams for this version: its snapshot uses a schema this viewer does not read. Its files are under Files."));
    state.drawn = null;
    collapse();
    return;
  }
  const { view } = cur;
  renderPicker(entries, view.id);
  document.getElementById("view-title").textContent = view.title;
  document.getElementById("view-sub").textContent = subtitle(view);
  // Behaviour's authority: where exec runs and what the agent may send through.
  const authority = document.getElementById("authority");
  authority.hidden = !view.authority;
  if (view.authority) {
    authority.textContent = view.authority.text;
    authority.title = "exec runs " + (view.authority.exec.join(", ") || "nowhere: not granted") + (view.authority.ask ? " · ask " + view.authority.ask : "") +
      (view.authority.outbound.length ? " · may send through " + view.authority.outbound.join(", ") : "");
  }
  renderLegend(view);
  const keep = keepViewport && state.drawn && state.drawn.view === view.id, kept = keep && state.drawn.scene;
  if (!keep) { state.selected = null; state.filter = ""; state.facet = null; state.sort = null; }
  document.getElementById("md").classList.toggle("hl", state.highlight);
  document.querySelector(".md-tools").hidden = !view.scene;
  const listed = Boolean(view.table || view.procedures);
  stage.hidden = !view.scene && listed;
  sheet.hidden = !listed;
  sheet.classList.toggle("alone", !view.scene);
  const folded = Boolean(view.scene && state.sheetFolded);
  document.getElementById("split").hidden = !(view.scene && listed) || folded;
  sheet.classList.toggle("folded", folded);
  sheet.style.height = view.scene && state.sheetH && !folded ? state.sheetH + "px" : "";
  sheet.style.maxHeight = view.scene && state.sheetH && !folded ? "none" : "";
  state.drawn = { view: view.id, svg: null, world: null, scene: view.scene, payload: view };
  state.doc = marks(state.version);
  // The table first: the diagram fits in the room it leaves.
  if (listed) {
    const at = [sheet.scrollTop, sheet.scrollLeft];
    renderTable(sheet, view, changeMarks());
    if (keep) [sheet.scrollTop, sheet.scrollLeft] = at;
  }
  if (view.scene) drawScene(view, changeMarks(), kept);
  else canvas.replaceChildren(...view.table ? [] : [el("p", "md-empty", "Nothing to show in this view for this version.")]);
  // An element opened from elsewhere shows in the inspector; otherwise the
  // open panel follows the version and the view.
  const focus = state.focus && headOf(view, state.focus) ? state.focus : null, stay = state.stay;
  state.focus = null;
  state.stay = false;
  if (state.selected && !headOf(view, state.selected)) state.selected = null;
  if (focus) select(focus, true, stay, state.ring); else applyFocus();
  if (state.panel && (!focus || stay)) openPanel(state.panel);
}
function drawScene(view, delta, keep) {
  const canvas = document.getElementById("canvas"), scene = view.scene;
  const svg = sv("svg", { role: "group", "aria-label": view.title + " diagram" });
  const world = sv("g", {});
  svg.append(defs(), world);
  const nodes = new Map(scene.nodes.map((n) => [n.id, n]));
  // A procedure's steps, and the edges between them, fold away when zoomed out.
  const step = (id) => { const p = nodes.get(nodes.get(id).parent); return Boolean(p && p.shape === "frame"); };
  for (const n of scene.nodes.filter((n) => n.shape === "frame" || n.shape === "group")) world.append(drawNode(n, delta));
  for (const e of scene.edges) world.append(drawEdge(e, delta, step(e.s) && step(e.t)));
  for (const n of scene.nodes.filter((n) => n.shape !== "frame" && n.shape !== "group")) {
    const g = drawNode(n, delta);
    if (step(n.id)) g.classList.add("step");
    world.append(g);
  }
  const labels = zoomedOutLabels(scene, delta);
  canvas.replaceChildren(svg, labels);
  // Text measured at export may still overflow with another font: squeeze it.
  for (const t of svg.querySelectorAll("text[data-max]")) {
    const max = +t.dataset.max;
    if (t.getComputedTextLength() > max) { t.setAttribute("textLength", max); t.setAttribute("lengthAdjust", "spacingAndGlyphs"); }
  }
  Object.assign(state.drawn, { svg, world, nodes, labels, lod: false, framed: scene.nodes.some((n) => n.shape === "frame") });
  if (keep && state.viewport) applyViewport(); else fit();
}

// Below this scale a diagram's rows (11.5 px) are too small to read.
const READABLE = 0.5;
// Fits the whole scene in the canvas. A scene taller than wide that would be
// unreadable whole fits its width instead, from its top.
function fit() {
  const d = state.drawn, box = document.getElementById("canvas").getBoundingClientRect();
  if (!d || !d.scene) return;
  const margin = 24, kw = (box.width - 2 * margin) / Math.max(d.scene.w, 1);
  const whole = Math.min(kw, (box.height - 2 * margin) / Math.max(d.scene.h, 1), 1.25);
  const tall = d.scene.h > d.scene.w && whole < READABLE, k = tall ? Math.min(kw, 1.25) : whole;
  state.viewport = { k, x: (box.width - d.scene.w * k) / 2, y: tall ? margin : (box.height - d.scene.h * k) / 2 };
  state.fitK = whole;
  state.fitted = state.viewport;
  applyViewport();
}
// Fits again after the canvas changed size, unless the user moved the view.
function refit() {
  if (state.viewport === state.fitted) fit();
}
// Folds the table under a diagram to its bar, for every view, and back.
function foldButton(folded) {
  const b = button(folded ? "Show table" : "Hide table", () => {
    state.sheetFolded = !folded;
    render(true);
    refit();
  }, "tb-fold");
  b.setAttribute("aria-expanded", String(!folded));
  b.dataset.key = "fold-table";
  return b;
}
// The part of the canvas the sidebar leaves visible. A narrow window lays the
// sidebar over the canvas; when it leaves under 200 px, framing uses it all.
function room() {
  const c = document.getElementById("canvas").getBoundingClientRect(), side = document.getElementById("side");
  const over = !side.hidden && getComputedStyle(side).position === "absolute";
  const w = over ? Math.min(c.right, side.getBoundingClientRect().left) - c.left : c.width;
  return { w: w < 200 ? c.width : w, h: c.height };
}
// Frames an element in the visible room: a step frames its procedure, at
// most at 1:1; a frame taller than the room shows from its top, at a scale
// its steps read at (0.75), and the wheel scrolls down it.
function fitTo(id) {
  frameBox(state.drawn.nodes.get(scopeOf(id)));
}
// The box around some nodes.
function boxOf(ids) {
  const ns = [...ids].map((id) => state.drawn.nodes.get(id)).filter(Boolean);
  const x = Math.min(...ns.map((n) => n.x)), y = Math.min(...ns.map((n) => n.y));
  return { x, y, w: Math.max(...ns.map((n) => n.x + n.w)) - x, h: Math.max(...ns.map((n) => n.y + n.h)) - y };
}
function frameBox(n) {
  const r = room(), margin = 32;
  const kw = (r.w - 2 * margin) / n.w, whole = Math.min(kw, (r.h - 2 * margin) / n.h);
  const k = Math.min(1, Math.max(whole, Math.min(0.75, kw))), over = n.h * k > r.h - 2 * margin;
  state.viewport = { k, x: (r.w - n.w * k) / 2 - n.x * k, y: over ? margin - n.y * k : (r.h - n.h * k) / 2 - n.y * k };
  applyViewport();
}
// Pans the least that brings a node back beside a sidebar that just opened.
function keepInView(n) {
  const v = state.viewport, w = room().w, margin = 16;
  const left = v.x + n.x * v.k, right = left + n.w * v.k;
  const dx = right > w - margin ? Math.max(w - margin - right, margin - left) : 0;
  if (dx) { state.viewport = { ...v, x: v.x + dx }; applyViewport(); }
}
function applyViewport() {
  const d = state.drawn, v = state.viewport;
  if (!(d && d.world && v)) return;
  d.world.setAttribute("transform", "translate(" + v.x + "," + v.y + ") scale(" + v.k + ")");
  semanticZoom(d, v);
}
// ---- Semantic zoom: zoomed out under LOD_IN, a view of procedures shows
// them as titled frames, steps folded, until it zooms back in past LOD_OUT.
const LOD_IN = 0.4, LOD_OUT = 0.46;
function semanticZoom(d, v) {
  const lod = d.framed && (v.k < LOD_IN || d.lod && v.k <= LOD_OUT);
  if (lod !== d.lod) {
    d.lod = lod;
    d.svg.classList.toggle("md-lod", lod);
    d.labels.hidden = !lod;
  }
  if (lod) placeLabels(d, v);
}
// Each procedure's title and step count, and the name of each party, in
// screen-sized text over the diagram.
function zoomedOutLabels(scene, delta) {
  const box = el("div", "md-labels");
  box.setAttribute("aria-hidden", "true");
  box.hidden = true;
  const touched = new Set(delta ? [...delta.added, ...delta.changed] : []);
  for (const n of scene.nodes) {
    if (n.shape === "frame") {
      const steps = scene.nodes.filter((x) => x.parent === n.id && x.shape !== "initial" && x.shape !== "final");
      const label = el("div", "md-lod-frame" + (steps.some((x) => touched.has(x.id)) ? " changed" : ""));
      label.append(el("strong", "", n.title || n.name), el("span", "", plural(steps.length, "step")));
      label.dataset.id = n.id;
      box.append(label);
    } else if (!n.parent) {
      const label = el("div", "md-lod-leaf", labelOf(n));
      label.dataset.id = n.id;
      box.append(label);
    }
  }
  return box;
}
function placeLabels(d, v) {
  for (const label of d.labels.children) {
    const n = d.nodes.get(label.dataset.id), x = v.x + n.x * v.k, y = v.y + n.y * v.k, w = n.w * v.k;
    // A frame's label fills its top; a party's sits under it.
    label.style.transform = label.classList.contains("md-lod-frame")
      ? "translate(" + x + "px," + y + "px)" : "translate(" + (x + w / 2) + "px," + (y + n.h * v.k + 3) + "px) translateX(-50%)";
    if (label.classList.contains("md-lod-frame")) label.style.width = w + "px";
  }
}
function zoom(f, cx, cy) {
  const v = state.viewport, box = document.getElementById("canvas").getBoundingClientRect();
  if (!v) return;
  const x = cx === undefined ? box.width / 2 : cx, y = cy === undefined ? box.height / 2 : cy;
  // Zooming out stops at 0.15, or at Fit when Fit is smaller.
  const k = Math.max(Math.min(0.15, state.fitK), Math.min(3, v.k * f));
  state.viewport = { k, x: x - (x - v.x) * k / v.k, y: y - (y - v.y) * k / v.k };
  applyViewport();
}

// An element, what it contains, and what their edges reach.
function related(id) {
  const scene = state.drawn.scene, up = (x) => state.drawn.nodes.get(x).parent;
  const within = (x) => { for (let p = x; p; p = up(p)) if (p === id) return true; return false; };
  const nodes = new Set([id]), edges = new Set(), out = new Set();
  for (const e of scene.edges) {
    const from = within(e.s), to = within(e.t);
    if (from || to) { edges.add(e.id); nodes.add(e.s); nodes.add(e.t); }
    if (from !== to) out.add(e.id);
  }
  for (const n of scene.nodes) if (within(n.id)) nodes.add(n.id);
  return { nodes, edges, out };
}
// The procedure frame a step sits in, or the element itself.
function scopeOf(id) {
  const p = state.drawn.nodes.get(state.drawn.nodes.get(id).parent);
  return p && p.shape === "frame" ? p.id : id;
}
// A selection lights what its scope relates to (a step, its whole procedure)
// and dims the rest; hovering only marks the element and its own edges.
function applyFocus() {
  const d = state.drawn;
  if (!d) return;
  if (d.svg) {
    const sel = d.nodes.has(state.selected) ? state.selected : null;
    // A finding's related agents light up together, with the edges among them.
    const ring = sel && state.ring && state.ring.has(sel) ? state.ring : null;
    const among = ring && new Set(d.scene.edges.filter((e) => ring.has(e.s) && ring.has(e.t)).map((e) => e.id));
    const r = ring ? { nodes: ring, edges: among } : sel ? related(scopeOf(sel)) : null;
    const hot = ring ? among : new Set([sel, d.nodes.has(state.hover) ? state.hover : null].flatMap((x) => x ? [...related(x).out] : []));
    d.svg.classList.toggle("md-focus", Boolean(r));
    for (const g of d.world.querySelectorAll(".md-node")) {
      g.classList.toggle("lit", Boolean(r && r.nodes.has(g.dataset.id)));
      g.classList.toggle("selected", g.dataset.id === state.selected);
      g.classList.toggle("hot", g.dataset.id === state.hover);
    }
    for (const g of d.world.querySelectorAll(".md-edge")) {
      g.classList.toggle("lit", Boolean(r && r.edges.has(g.dataset.id)));
      g.classList.toggle("hot", hot.has(g.dataset.id));
    }
    document.getElementById("fit-selection").disabled = !sel;
  }
  const sheet = document.getElementById("sheet");
  for (const e of sheet.querySelectorAll("[data-id]")) {
    e.classList.toggle("selected", e.dataset.id === state.selected);
    const doc = state.doc.get(e.dataset.id), name = e.querySelector(".et-name");
    if (doc) e.dataset.doc = doc.worst; else delete e.dataset.doc;
    if (name) name.title = doc ? doc.codes : "";
  }
  markEntries();
  // A selected matrix column marks its cells.
  const column = sheet.querySelector("th.mx-col.selected"), c = column ? column.dataset.col : null;
  for (const e of sheet.querySelectorAll("td[data-col]")) e.classList.toggle("on", e.dataset.col === c);
}
// Selects an element, shows it in the inspector unless the open panel stays
// (a Doctor or Changes entry), and frames or reveals it when asked.
function select(id, center, stay, ring) {
  state.selected = id;
  state.ring = ring || null;
  // Acting on the page answers a link's note.
  if (state.note) { state.note = null; renderNote(); }
  applyFocus();
  writeHash();
  if (!id) { if (state.panel === "inspector") openPanel("inspector"); return; }
  const d = currentView().delta;
  const status = d && d.added.includes(id) ? "added" : d && d.changed.includes(id) ? "changed" : null;
  // The inspector opens first: framing uses the room it leaves.
  const n = state.drawn.nodes && state.drawn.nodes.get(id), before = room().w;
  if (!stay) inspect(state.version, state.drawn.payload, id, status);
  const h = headOf(state.drawn.payload, id);
  announce((stay ? "Selected " : "Inspector: ") + labelOf(h));
  const lit = ring && [...ring].filter((x) => state.drawn.nodes && state.drawn.nodes.has(x));
  if (center && lit && lit.length > 1) frameBox(boxOf(lit));
  else if (center && n) fitTo(id);
  else if (center) reveal(id);
  else if (n && room().w < before) keepInView(n);
}
// Scrolls a table element into view; when the filter, the facet or folded
// groups hide it, it clears them all.
function reveal(id) {
  const sheet = document.getElementById("sheet");
  const find = () => [...sheet.querySelectorAll("[data-id]")].find((e) => e.dataset.id === id);
  if (!find() && (state.filter || state.folded.size || state.facet !== null)) {
    state.filter = "";
    state.facet = null;
    state.folded.clear();
    renderTable(sheet, state.drawn.payload, changeMarks());
    applyFocus();
  }
  const e = find();
  if (e) e.scrollIntoView({ block: "center", inline: "nearest" });
}

const PANELS = { inspector: "Inspector", changes: "Changes", doctor: "Doctor" };
// Shows a panel of this version and view; the inspector shows the selection.
function openPanel(name) {
  if (name === "changes") showChanges(currentView());
  else if (name === "doctor") showDoctor();
  else if (state.selected) select(state.selected, false);
  else showPanel("inspector", [el("p", "md-side-empty", "Select an element in the diagram or the table.")]);
}
// Fills the sidebar with one panel and opens it if it was collapsed.
// A panel's entries mark the selection.
function markEntries() {
  for (const e of document.querySelectorAll("#inspector [data-subject]")) e.classList.toggle("active", e.dataset.subject === state.selected);
}
// Each panel, for a version and view (and the inspector, for an element),
// opens again where it was scrolled to.
function showPanel(name, parts, tools, element) {
  const box = document.getElementById("inspector");
  document.getElementById("side-title").textContent = PANELS[name];
  document.getElementById("side-tools").replaceChildren(...tools || []);
  const inside = box.contains(document.activeElement), side = document.getElementById("side"), opened = side.hidden;
  box.replaceChildren(...parts);
  side.hidden = false;
  if (inside) box.focus({ preventScroll: true });
  // A diagram at Fit fits the room the sidebar leaves.
  if (opened && state.tab === "diagrams") refit();
  state.panelKey = [name, state.version, name === "doctor" ? "" : shownView(), element || ""].join("|");
  box.scrollTop = state.scrolls.get(state.panelKey) || 0;
  markEntries();
  state.panel = name;
  for (const b of document.querySelectorAll(".md-rail [data-panel]")) b.setAttribute("aria-pressed", String(b.dataset.panel === name));
}
function collapse() {
  const side = document.getElementById("side"), closed = side.hidden;
  side.hidden = true;
  state.panel = null;
  for (const b of document.querySelectorAll(".md-rail [data-panel]")) b.setAttribute("aria-pressed", "false");
  if (!closed && state.tab === "diagrams") refit();
}
// An element's attributes; against the previous version's, a changed value
// shows struck through above the new one. Only the differences when asked.
function attributes(now, before, onlyChanged) {
  const is = new Map(now), was = new Map(before || now), dl = el("dl");
  for (const k of new Set([...is.keys(), ...was.keys()])) {
    const a = was.get(k), b = is.get(k);
    if (onlyChanged && a === b) continue;
    const dd = el("dd", "", a === b ? b : "");
    if (a !== b && a !== undefined) dd.append(el("del", "", a));
    if (a !== b && b !== undefined) dd.append(el("ins", "", b));
    dl.append(el("dt", "", k), dd);
  }
  return dl;
}
function inspect(vi, view, id, status) {
  const n = headOf(view, id);
  const info = view.elements[id] || { a: [], s: [] };
  let refs = info.s.slice();
  if (!n) return;
  // Its readable name, and its declared name and type when they differ.
  const h = el("h3", "", labelOf(n)), declared = (n.name || "") + (n.type || "");
  if (labelOf(n) === nameOf(n) && n.type) h.append(el("span", "", n.type));
  const parts = [el("p", "md-kicker", n.kw || n.shape), h, ...labelOf(n) !== nameOf(n) && declared ? [el("p", "md-declared", declared)] : []];
  if (vi === state.version) parts.push(...alsoIn(view, id));
  if (status) {
    const line = el("div");
    line.append(el("span", "md-status " + status, status === "removed" ? "removed since " + when(versions[vi]) : status + " since " + when(versions[vi + 1])),
      button("All changes", () => openPanel("changes"), "md-back"));
    parts.push(line);
  }
  // Its findings, worst first; notes fold away.
  const mine = (versions[vi].findings || []).filter((f) => f.subject === id).sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity));
  const notes = mine.filter((f) => f.severity === "info"), open = mine.filter((f) => f.severity !== "info");
  if (open.length) parts.push(findingList(open));
  if (notes.length) {
    const d = el("details", "md-notes");
    d.append(el("summary", "", plural(notes.length, "note")), findingList(notes));
    parts.push(d);
  }
  const prev = status === "changed" && entryOf(vi + 1, view.id), was = prev && payload(prev).elements[id];
  if (info.a.length) parts.push(attributes(info.a, was ? was.a : null, false));
  if (vi === state.version && state.drawn && state.drawn.scene) {
    const rel = state.drawn.scene.edges.filter((e) => e.s === id || e.t === id);
    if (rel.length) {
      const ul = el("ul");
      for (const e of rel) {
        const out = e.s === id, other = out ? e.t : e.s;
        const o = view.scene.nodes.find((x) => x.id === other);
        const label = e.label ? e.label.lines.join(" ") : "";
        const b = button("", () => select(other, true));
        b.append(el("span", "md-kind", (out ? "→ " : "← ") + (e.kind === "connection" && label ? "connection · " + label : label || e.kind)),
          el("span", "md-other", o ? labelOf(o) : other));
        const li = el("li");
        li.append(b);
        ul.append(li);
        if (view.elements[e.id]) refs = refs.concat(view.elements[e.id].s.filter((s) => !refs.some((x) => x.join() === s.join())));
      }
      parts.push(el("p", "md-kicker", "Relationships · " + rel.length), ul);
    }
  }
  // Each piece of SysML folds to its first line; a lone piece shows open.
  if (refs.length) {
    parts.push(el("p", "md-kicker", "SysML · " + refs.length));
    for (const [file, from, to] of refs) {
      const lines = fileText(vi, file).split("\n").slice(from - 1, to);
      const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length));
      const src = el("details", "md-src"), summary = el("summary");
      const b = button(file + ":" + from + (to > from ? "–" + to : ""), () => showLines(vi, file, from, to));
      b.title = "Show in Files";
      summary.append(el("code", "", lines[0].trim()), b);
      src.open = refs.length === 1;
      src.append(summary, sysml(lines.map((l) => l.slice(indent)).join("\n")));
      parts.push(src);
    }
  }
  showPanel("inspector", parts, vi === state.version && id === state.selected ? [copyLink()] : [], vi + "|" + id);
}
// Copies the link to the selection: this version, view and element.
function copyLink() {
  const b = button("", () => Promise.resolve().then(() => navigator.clipboard.writeText(location.href))
    .then(() => flash(b, "Copied"), () => flash(b, "Not copied")), "md-copy");
  b.title = "Copy link";
  b.setAttribute("aria-label", "Copy link");
  const g = sv("svg", { viewBox: "0 0 20 20", "aria-hidden": "true" });
  g.append(sv("path", { d: "M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-1 1M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l1-1" }));
  b.append(g);
  return b;
}
function flash(b, text) {
  b.dataset.flash = text;
  announce(text);
  setTimeout(() => delete b.dataset.flash, 1600);
}
// Says what an action did to assistive technologies.
function announce(text) {
  const live = document.getElementById("live");
  live.textContent = "";
  requestAnimationFrame(() => { live.textContent = text; });
}
// The other views of this version that show an agent, as links, read from
// its Overview row; a Behaviour party stands for its agent.
function alsoIn(view, id) {
  const agent = id.startsWith("party:") ? "agent:" + id.slice(6) : id;
  const overview = entryOf(state.version, "overview"), t = overview && payload(overview).table;
  const row = t && t.rows.find((r) => r.id === agent && r.views);
  if (!row) return [];
  const ids = ["overview", ...row.views].filter((v) => v !== view.id);
  const p = el("p", "md-also");
  p.title = "Also in these views";
  p.append(...ids.map((v) => {
    const w = payload(entryOf(state.version, v));
    return button(w.group === "Behaviour" ? "Behaviour" : w.title, () => go(v, agent));
  }));
  return [p];
}
// ---- Doctor
const SEVERITIES = ["error", "warning", "info"];
const plural = (n, word) => n + " " + word + (n === 1 ? "" : "s");
// The worst error or warning per element of a version (notes mark nothing),
// with the codes of its errors and warnings, worst first, as a tooltip.
function marks(vi) {
  const m = new Map(), rank = (f) => SEVERITIES.indexOf(f.severity);
  const marked = (versions[vi].findings || []).filter((f) => f.severity !== "info").sort((a, b) => rank(a) - rank(b));
  for (const f of marked) {
    const line = f.code + " (" + f.severity + ")", s = m.get(f.subject);
    if (!s) m.set(f.subject, { worst: f.severity, codes: line });
    else if (!s.codes.split("\n").includes(line)) s.codes += "\n" + line;
  }
  return m;
}
// The view of a version that shows an element: the current one if it does.
function viewOf(vi, id) {
  const entries = viewsOf(vi) || [];
  const e = [entries.find((x) => payload(x).id === shownView()), ...entries].find((x) => x && headOf(payload(x), id));
  return e ? payload(e) : null;
}
// An element's own findings, in the inspector.
function findingList(findings) {
  const ul = el("ul", "md-findings");
  for (const f of findings) {
    const li = el("li", "doc-" + f.severity), top = el("div");
    top.append(el("i", "sev"), codeOf(f.code, null));
    li.append(top, el("p", "", f.context), el("p", "fix", f.recovery));
    ul.append(li);
  }
  return ul;
}
// A finding's code in discreet mono, its label beside it when the code needs
// one; the APE pattern it checks is its tooltip.
const CODE_LABELS = { PROSE_NOT_ENFORCED: "not enforced by config" };
function codeOf(code, pattern) {
  const c = el("code", "", code);
  if (pattern) c.title = "APE pattern " + pattern;
  if (!CODE_LABELS[code]) return c;
  const s = el("span", "doc-code");
  s.append(el("strong", "", CODE_LABELS[code]), c);
  return s;
}
// Shows a panel entry's element without leaving the panel, with the agents a
// finding relates lit and framed together; a narrow window, where the
// sidebar covers the diagram, folds the sidebar away.
function stayOn(view, id, ring) {
  if (matchMedia("(max-width: 760px)").matches) collapse();
  if (view === shownView()) select(id, true, true, ring); else go(view, id, true, ring);
}
// The Doctor of a version: whether its checks ran, what is new since the
// last checked version, then its findings by code (viewer.ts's
// doctor.groups): the rules' errors and warnings open, notes and the
// export's limits folded, what was resolved last.
function showDoctor() {
  const v = versions[state.version], groups = merged(v.doctor.groups);
  const rules = groups.filter((g) => g.source === "rule"), notes = groups.filter((g) => g.source === "note"), limits = groups.filter((g) => g.source === "collector");
  const parts = [...checksHead(v, rules), ...sinceLine(v)];
  if (rules.length) parts.push(groupList(nested(rules)));
  for (const [list, word, open] of [[notes, "note", "notesOpen"], [limits, "export limit", "limitsOpen"]]) {
    if (!list.length) continue;
    const d = el("details", "md-notes");
    d.open = state[open];
    d.ontoggle = () => { state[open] = d.open; };
    d.append(el("summary", "", plural(list.reduce((n, g) => n + g.subjects.length, 0), word)), groupList(list));
    parts.push(d);
  }
  const resolved = v.doctor.delta && v.doctor.delta.resolved;
  if (resolved && resolved.length) parts.push(resolvedList(v.doctor.delta));
  showPanel("doctor", parts);
}
// The title: the counts only when the checks ran, else why not and what to do.
function checksHead(v, rules) {
  const c = v.checks || { state: "verified" };
  if (c.state === "verified") {
    const n = (s) => rules.filter((g) => g.severity === s).reduce((k, g) => k + g.subjects.length, 0);
    const h = el("h3", "", n("error") || n("warning") ? [n("error") ? plural(n("error"), "error") : "", n("warning") ? plural(n("warning"), "warning") : ""].filter(Boolean).join(" · ") : "No error or warning");
    if (c.rules) h.title = plural(c.rules, "rule") + " checked";
    return [h];
  }
  const head = { "not-run": "Checks not run", failed: "Checks failed", unrecorded: "Checks not recorded" }[c.state];
  const box = el("div", "doc-checks");
  box.append(el("h3", "", head), ...c.code ? [el("code", "", c.code)] : [], ...c.recovery ? [el("p", "", c.recovery)] : []);
  return [box];
}
// What is new and resolved since the last checked version.
function sinceLine(v) {
  const d = v.doctor.delta;
  if (!d) return [];
  const p = el("p", "md-side-note", "Since " + when(versions.find((x) => x.id === d.against)) + ": " +
    (d.new.length || d.resolved.length ? [d.new.length ? d.new.length + " new" : "", d.resolved.length ? d.resolved.length + " resolved" : ""].filter(Boolean).join(" · ") : "nothing new"));
  p.title = plural(d.newRule.length, "finding") + " of a new rule, " + plural(d.notComparable.length, "finding") + " not comparable";
  return [p];
}
// One group per severity, code and source; a recovery naming a path (one
// group each in the data) is kept per subject.
function merged(groups) {
  const out = new Map();
  for (const g of groups) {
    const key = [g.severity, g.code, g.source].join("|");
    if (!out.has(key)) out.set(key, { ...g, subjects: [] });
    out.get(key).subjects.push(...g.subjects.map((s) => ({ ...s, recovery: g.recovery })));
  }
  return [...out.values()];
}
// A grant that widens a parent's exec sits under that parent's
// EXEC_WITHOUT_APPROVAL, as the agents its finding relates.
function nested(rules) {
  const exec = rules.find((g) => g.code === "EXEC_WITHOUT_APPROVAL"), widens = rules.find((g) => g.code === "APE_GRANT_WIDENS_PARENT");
  if (!exec || !widens) return rules;
  const under = (s) => widens.subjects.filter((w) => (w.related || []).includes(s.id));
  exec.subjects = exec.subjects.map((s) => ({ ...s, widened: { ...widens, subjects: under(s) } }));
  const placed = new Set(exec.subjects.flatMap((s) => s.widened.subjects));
  widens.subjects = widens.subjects.filter((w) => !placed.has(w));
  return rules.filter((g) => g.subjects.length);
}
function groupList(groups) {
  const ul = el("ul", "md-findings doc-groups");
  for (const g of groups) {
    const li = el("li", "doc-" + g.severity), head = el("div", "doc-head");
    head.append(el("i", "sev"), codeOf(g.code, g.pattern));
    li.append(head, ...subjectRows(g));
    ul.append(li);
  }
  return ul;
}
// A text every subject shares shows once; a subject's own text is its
// chip's tooltip.
function subjectRows(g) {
  const same = (k) => g.subjects.every((s) => s[k] === g.subjects[0][k]);
  const chips = el("div", "doc-chips");
  chips.append(...g.subjects.map((s) => subjectChip(g, s, [same("context") ? "" : s.context, same("recovery") ? "" : s.recovery])));
  const rows = [...same("context") ? [el("p", "", g.subjects[0].context)] : [], chips, ...same("recovery") ? [el("p", "fix", g.subjects[0].recovery)] : []];
  for (const s of g.subjects.filter((x) => x.widened && x.widened.subjects.length)) {
    const sub = el("div", "doc-nested doc-" + s.widened.severity), chips = el("div", "doc-chips");
    chips.append(...s.widened.subjects.map((w) => subjectChip(s.widened, w, [w.context])));
    sub.title = s.widened.subjects[0].recovery;
    sub.append(el("i", "sev"), codeOf(s.widened.code, s.widened.pattern), el("span", "", "toward " + s.label), chips);
    rows.push(sub);
  }
  return rows;
}
// A subject: its readable name, which selects and frames it (the agents a
// finding relates, in Reach when there is one), new since the last checked
// version or of a new rule, and a link to its SysML lines.
function subjectChip(g, s, own) {
  const vi = state.version, d = versions[vi].doctor.delta;
  const tagged = (list) => d && d[list].some((x) => x.code === g.code && x.subject === s.id);
  const chip = el("span", "doc-chip");
  chip.dataset.subject = s.id;
  const reach = s.related && entryOf(vi, "reach") && headOf(payload(entryOf(vi, "reach")), s.id) ? "reach" : null;
  const v = reach ? payload(entryOf(vi, "reach")) : viewOf(vi, s.id);
  const name = v ? button(s.label, () => stayOn(v.id, s.id, s.related ? new Set([s.id, ...s.related]) : null), "doc-subject") : el("span", "doc-subject", s.label);
  name.title = own.filter(Boolean).join("\n") || s.context;
  chip.append(name);
  if (tagged("new")) chip.append(el("small", "doc-new", "new"));
  else if (tagged("newRule")) chip.append(el("small", "doc-new", "new rule"));
  const ref = v && v.elements[s.id] && v.elements[s.id].s[0];
  if (ref) {
    const src = button("", () => showLines(vi, ref[0], ref[1], ref[2]), "doc-src");
    src.title = ref[0] + ":" + ref[1] + (ref[2] > ref[1] ? "–" + ref[2] : "") + " · Show in Files";
    src.setAttribute("aria-label", src.title);
    src.append(sourceIcon());
    chip.append(src);
  }
  return chip;
}
// What the last checked version had and this one no longer has; an element
// gone since opens as it was.
function resolvedList(d) {
  const at = versions.findIndex((x) => x.id === d.against), det = el("details", "md-notes"), ul = el("div", "doc-chips");
  for (const r of d.resolved) {
    const now = viewOf(state.version, r.subject), then = viewOf(at, r.subject), chip = el("span", "doc-chip doc-" + r.severity);
    const b = button(r.label, () => now ? stayOn(now.id, r.subject) : then && inspect(at, then, r.subject, null), "doc-subject");
    b.title = r.code;
    chip.append(el("i", "sev"), b);
    ul.append(chip);
  }
  det.append(el("summary", "", plural(d.resolved.length, "resolved finding")), ul);
  return det;
}
function showLines(vi, file, from, to) {
  navigate({ version: vi, tab: "files", file, range: [from, to] });
}

// ---- Tables
function renderTable(box, view, delta) {
  const t = view.table, mark = marker(delta);
  if (view.procedures && (state.sheetTab === "procedures" || !t)) renderProcedures(box, view, mark);
  else if (t.kind === "matrix") renderMatrix(box, t, mark);
  else if (t.kind === "week") renderWeek(box, t, mark);
  else renderElements(box, view, t, mark);
  const bar = box.querySelector(".tb-bar");
  if (view.procedures && t) bar.querySelector(".tb-title").replaceWith(sheetTabs(view));
  if (view.scene) bar.append(foldButton(state.sheetFolded));
}
// Behaviour's table shows its rules or its procedures, for every Behaviour view.
function sheetTabs(view) {
  const tabs = el("span", "tb-tabs");
  tabs.append(...[["rules", "Rules", view.table.rows.length], ["procedures", "Procedures", view.procedures.length]].map(([key, label, n]) => {
    const b = button(label + " " + n, () => keepFocus(() => { state.sheetTab = key; renderTable(document.getElementById("sheet"), view, changeMarks()); applyFocus(); }));
    b.dataset.key = "sheet-tab:" + key;
    b.setAttribute("aria-pressed", String((state.sheetTab === "procedures") === (key === "procedures")));
    return b;
  }));
  return tabs;
}
// A view's procedures (views.ts's procedures), in drawing order: a row
// frames its procedure.
function renderProcedures(box, view, mark) {
  const bar = el("div", "tb-bar"), table = el("table", "et"), head = el("tr"), tbody = el("tbody");
  bar.append(el("strong", "tb-title", "Procedures"));
  head.append(...["procedure", "trigger", "steps"].map((c) => el("th", "", c)));
  tbody.append(...view.procedures.map((p) => {
    const tr = el("tr", mark(p.id).trim());
    tr.dataset.id = p.id;
    tr.tabIndex = 0;
    tr.append(el("td", "et-name", p.title), el("td", "et-wrap", p.trigger), el("td", "et-num", String(p.steps)));
    return tr;
  }));
  const thead = el("thead");
  thead.append(head);
  table.append(thead, tbody);
  box.replaceChildren(bar, table);
}
function search(label) {
  const input = el("input");
  input.type = "search";
  input.placeholder = label;
  input.setAttribute("aria-label", label);
  input.value = state.filter;
  return input;
}
const GLYPH_WORDS = { h: "on the host", s: "in the sandbox", b: "on the host and in the sandbox" };
function glyph(g) { return el("i", "g " + g); }
// Tools × agents. Group and provider rows count the tools each agent holds
// under them; a filter shows the matching tools with their groups.
function renderMatrix(box, t, mark) {
  const index = new Map(t.rows.map((r, i) => [r.id, i]));
  const up = (r) => { const out = []; for (let p = r.parent; p; p = t.rows[index.get(p)].parent) out.push(index.get(p)); return out; };
  const cells = t.rows.map(() => new Map()), counts = t.rows.map(() => t.columns.map(() => 0));
  for (const [r, c, g, id] of t.cells) {
    cells[r].set(c, [g, id]);
    for (const a of up(t.rows[r])) counts[a][c]++;
  }
  const input = search("Filter tools");
  const groups = t.rows.filter((r) => r.shape !== "tool").map((r) => r.id);
  const bar = el("div", "tb-bar");
  bar.append(input, button("Expand all", () => { state.folded.clear(); rows(); }), button("Collapse all", () => { groups.forEach((g) => state.folded.add(g)); rows(); }));
  // Tools by how many agents hold them (tables.ts's held); a second click clears.
  const held = el("span", "tb-key", "held by");
  bar.append(held, ...["all", "shared", "one", "none"].map((h) => {
    const n = t.rows.filter((r) => r.held === h).length;
    const b = button(h + " " + n, () => keepFocus(() => { state.facet = state.facet === h ? null : h; rows(); }));
    b.dataset.key = "held:" + h;
    b.setAttribute("aria-pressed", String(state.facet === h));
    b.title = { all: "Tools every agent holds", shared: "Tools some agents hold", one: "Tools one agent holds", none: "Declared tools no agent holds" }[h];
    b.disabled = !n;
    return b;
  }));
  for (const [g, text] of [["h", "host"], ["s", "sandbox"], ["b", "both"]]) {
    const k = el("span", "tb-key");
    k.append(glyph(g), text);
    bar.append(k);
  }
  const table = el("table", "mx" + (t.columns.length > 8 ? " narrow" : ""));
  const head = el("tr");
  const corner = el("th", "mx-corner", "tool ↓ · allocated to agent →");
  corner.title = "SysML allocation matrix: each cell is an agent's ToolGrant";
  head.append(corner);
  t.columns.forEach((c, i) => {
    const th = el("th", "mx-col" + mark(c.id));
    th.dataset.id = c.id;
    th.dataset.col = String(i);
    th.tabIndex = 0;
    th.title = c.title + " · " + c.name + c.type;
    th.append(el("span", "", c.title), el("small", "", c.name.replace(/^agent_/, "")));
    head.append(th);
  });
  const thead = el("thead"), tbody = el("tbody");
  thead.append(head);
  table.append(thead, tbody);
  const rows = () => {
    const q = state.filter.trim().toLowerCase(), h = state.facet;
    for (const b of bar.querySelectorAll("[data-key^='held:']")) b.setAttribute("aria-pressed", String(b.dataset.key === "held:" + h));
    // A filter or a holders facet shows the matching tools with their groups, unfolded.
    const hit = t.rows.map((r) => (!q || [r, ...up(r).map((a) => t.rows[a])].some((x) => x.name.toLowerCase().includes(q))) &&
      (!h || r.held === h));
    const show = hit.slice();
    t.rows.forEach((r, i) => { if (hit[i]) for (const a of up(r)) show[a] = true; });
    tbody.replaceChildren(...t.rows.flatMap((r, i) => {
      if (!show[i] || !q && !h && up(r).some((a) => state.folded.has(t.rows[a].id))) return [];
      const tr = el("tr", (r.shape === "tool" ? "mx-tool" : "mx-group") + " d" + r.depth + (r.muted ? " muted" : "") + (r.dashed ? " dashed" : "") + mark(r.id));
      const th = el("th");
      th.dataset.id = r.id;
      th.tabIndex = 0;
      if (r.shape !== "tool") {
        const open = !state.folded.has(r.id);
        const fold = button(open ? "▾" : "▸", (e) => { e.stopPropagation(); if (open) state.folded.add(r.id); else state.folded.delete(r.id); keepFocus(rows); }, "mx-fold");
        fold.dataset.key = "fold:" + r.id;
        fold.setAttribute("aria-expanded", String(open));
        fold.setAttribute("aria-label", (open ? "Collapse " : "Expand ") + r.name);
        th.append(fold);
        if (r.kw) th.append(el("span", "mx-kw", r.kw));
      }
      th.append(el("span", "mx-name", r.name));
      if (r.type && r.shape !== "tool") th.append(el("span", "mx-type", r.type));
      if (r.host) {
        const host = glyph("h");
        host.classList.add("mx-host");
        host.title = "Granted on the host to some agent";
        th.append(host);
      }
      tr.append(th);
      t.columns.forEach((c, j) => {
        const td = el("td");
        td.dataset.col = String(j);
        const cell = cells[i].get(j);
        if (cell) {
          td.dataset.id = cell[1];
          td.className = mark(cell[1]).trim();
          td.title = r.name + " · " + c.title + " · " + GLYPH_WORDS[cell[0]] + (td.className ? " · " + td.className : "");
          td.append(glyph(cell[0]), el("span", "sr", td.title));
        } else if (counts[i][j]) td.append(el("span", "mx-count", String(counts[i][j])));
        tr.append(td);
      });
      return [tr];
    }));
    applyFocus();
  };
  input.oninput = () => { state.filter = input.value; rows(); };
  // Hovering a cell lights its column.
  let lit = null;
  table.onpointerover = (e) => {
    const c = e.target.closest("[data-col]"), col = c ? c.dataset.col : null;
    if (col === lit) return;
    lit = col;
    for (const x of table.querySelectorAll("[data-col]")) x.classList.toggle("hc", x.dataset.col === col);
  };
  table.onpointerleave = () => { lit = null; for (const x of table.querySelectorAll(".hc")) x.classList.remove("hc"); };
  rows();
  box.replaceChildren(bar, table);
}
// The rules of a Behaviour view that a PROSE_NOT_ENFORCED finding names: its
// subject is the agent, the rule is named in its context.
function unenforcedRules(view) {
  if (view.group !== "Behaviour") return new Set();
  const agent = "agent:" + view.id.slice("behaviour:".length);
  const words = (versions[state.version].findings || []).filter((f) => f.code === "PROSE_NOT_ENFORCED" && f.subject === agent)
    .flatMap((f) => f.context.split(/[^\w.:-]+/));
  return new Set(view.table.rows.map((r) => r.id).filter((id) => words.includes(id.slice("rule:".length))));
}
// An Overview figure (tables.ts's figures): its number aligned, its split
// small beside it, what it counts in the tooltip; the full value too.
const FLAGS = { search: ["⌕", "memory search"], curated: ["✦", "curated memory (MEMORY.md)"], daily: ["▦", "daily notes"] };
function figureCell(column, f, value) {
  const td = el("td", "et-fig");
  td.title = value + (f.names && f.names.length ? "\n" + f.names.join("\n") : "");
  if (column === "model") {
    td.append(el("span", "et-model", value.split(" · ")[0]));
    if (f.n) td.append(el("small", "et-plus", "+" + f.n));
    return td;
  }
  if (f.n !== undefined) td.append(el("b", "", f.of === 0 ? "—" : f.of !== undefined ? f.n + "/" + f.of : String(f.n)));
  // Channels show their types; context its non-zero parts; a tool count's
  // split by origin stays in the tooltip.
  if (column === "channels") td.append(...(f.parts || []).map(([type, n]) => el("small", "et-chip", type + (n > 1 ? " " + n : ""))));
  else if (column === "context") td.append(el("small", "", f.parts.filter(([, n]) => n).map(([label, n]) => n + " " + label).join(" · ")));
  for (const flag of f.flags || []) {
    const [glyph, words] = FLAGS[flag] || [flag, flag];
    const g = el("small", "et-flag", glyph);
    g.title = words;
    td.append(g);
  }
  return td;
}
// Elements with some of their attributes, sortable by column and filtered by
// text and by the facet column's values; each row links to its SysML lines
// and to the other views that show it. A summary's attributes come first.
function renderElements(box, view, t, mark) {
  const facet = t.columns.indexOf(t.facet);
  const input = search("Filter " + t.title.toLowerCase());
  const bar = el("div", "tb-bar");
  bar.append(el("strong", "tb-title", t.title), input);
  if (facet >= 0) {
    const values = [null, ...new Set(t.rows.map((r) => r.values[facet]))];
    bar.append(...values.map((v) => {
      const n = t.rows.filter((r) => v === null || r.values[facet] === v).length;
      const b = button((v === null ? "all" : v) + " " + n, () => keepFocus(() => { state.facet = v; renderTable(box, view, changeMarks()); applyFocus(); }));
      b.dataset.key = "facet:" + v;
      b.setAttribute("aria-pressed", String(state.facet === v));
      return b;
    }));
  }
  const text = (r, c) => c < 0 ? r.title || r.name : r.values[c];
  const unenforced = unenforcedRules(view);
  const table = el("table", "et"), head = el("tr"), tbody = el("tbody");
  [-1, ...t.columns.keys()].forEach((c) => {
    const sorted = state.sort && state.sort.col === c;
    const th = button(c < 0 ? "name" : t.columns[c], () => keepFocus(() => {
      state.sort = sorted && state.sort.dir > 0 ? { col: c, dir: -1 } : sorted ? null : { col: c, dir: 1 };
      renderTable(box, view, changeMarks());
      applyFocus();
    }));
    th.dataset.key = "sort:" + c;
    const cell = el("th");
    if (sorted) cell.setAttribute("aria-sort", state.sort.dir > 0 ? "ascending" : "descending");
    cell.append(th);
    head.append(cell);
  });
  const linked = t.rows.some((r) => r.views);
  if (linked) head.append(el("th", "", "views"));
  head.append(el("th", "", "SysML"));
  const thead = el("thead");
  thead.append(head);
  table.append(thead, tbody);
  // Long values wrap; short ones stay on one line.
  const wraps = t.columns.map((_, c) => t.rows.some((r) => r.values[c].length > 24));
  const rows = () => {
    const q = state.filter.trim().toLowerCase();
    const shown = t.rows.filter((r) => (facet < 0 || state.facet === null || r.values[facet] === state.facet) &&
      (!q || [r.title || "", r.name, ...r.values].some((v) => v.toLowerCase().includes(q))));
    if (state.sort) shown.sort((a, b) => state.sort.dir * text(a, state.sort.col).localeCompare(text(b, state.sort.col), "en", { numeric: true }));
    tbody.replaceChildren(...shown.map((r) => {
      const tr = el("tr", (r.muted ? "muted" : "") + mark(r.id));
      tr.dataset.id = r.id;
      tr.tabIndex = 0;
      const name = el("td", "et-name");
      if (r.title) name.append(el("span", "", r.title), el("small", "", r.name));
      else name.textContent = r.name;
      if (unenforced.has(r.id)) name.append(el("small", "et-tag doc-warning", CODE_LABELS.PROSE_NOT_ENFORCED));
      tr.append(name, ...r.values.map((v, c) => r.figures && r.figures[t.columns[c]] ? figureCell(t.columns[c], r.figures[t.columns[c]], v)
        : el("td", (wraps[c] ? "et-wrap" : "") + (c === facet ? " et-facet" : ""), v)));
      if (linked) {
        const links = el("td", "et-views");
        for (const id of r.views || []) {
          const v = payload(entryOf(state.version, id));
          links.append(button(v.group === "Behaviour" ? "Behaviour" : v.title, (e) => { e.stopPropagation(); go(id, r.id); }));
        }
        tr.append(links);
      }
      // Its own declaration; the inspector lists the others.
      const src = el("td", "et-src");
      for (const [file, from, to] of view.elements[r.id].s.slice(0, 1)) {
        const b = button("", (e) => { e.stopPropagation(); showLines(state.version, file, from, to); });
        b.title = file + ":" + from + (to > from ? "–" + to : "") + " · Show in Files";
        b.setAttribute("aria-label", b.title);
        b.append(sourceIcon());
        src.append(b);
      }
      tr.append(src);
      return tr;
    }));
    applyFocus();
  };
  input.oninput = () => { state.filter = input.value; rows(); };
  rows();
  box.replaceChildren(...t.summary ? [summary(view, t.summary, mark)] : [], bar, table);
}
// When each scheduled task fires in a week, hour by hour, under the agent it
// wakes. Hours are in each task's own time zone; an interval under a day fires
// all week, from an unknown start.
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], HOUR = 5, DAY = 24 * HOUR + 4;
function strip(row) {
  const g = sv("svg", { class: "wk-strip", width: 7 * DAY - 4, height: 16, "aria-hidden": "true" });
  DAYS.forEach((_, d) => g.append(sv("rect", { class: "wk-day", x: d * DAY, y: 0, width: 24 * HOUR, height: 16 })));
  if (row.everyMs && row.everyMs < 86400000) {
    const band = sv("rect", { class: "wk-band", x: 0, y: 5, width: 7 * DAY - 4, height: 6 });
    band.append(sv("title", {}, row.when + ", all week"));
    g.append(band);
  }
  for (const [hour, times] of row.fires || []) {
    const d = Math.floor(hour / 24), h = hour % 24;
    const r = sv("rect", { class: "wk-fire", x: d * DAY + h * HOUR, y: 2, width: HOUR - 1, height: 12, rx: 1 });
    r.append(sv("title", {}, DAYS[d] + " " + String(h).padStart(2, "0") + ":00 · " + times + (times === 1 ? " time" : " times")));
    g.append(r);
  }
  return g;
}
function renderWeek(box, t, mark) {
  const bar = el("div", "tb-bar");
  const key = (cls, text) => {
    const k = el("span", "tb-key");
    const g = sv("svg", { width: 14, height: 12, "aria-hidden": "true" });
    g.append(sv("rect", cls === "wk-band" ? { class: cls, x: 0, y: 3, width: 14, height: 6 } : { class: cls, x: 5, y: 0, width: 4, height: 12, rx: 1 }));
    k.append(g, text);
    return k;
  };
  const local = el("span", "tb-note", "local hours");
  local.title = "Hours in each task's own time zone";
  bar.append(el("strong", "tb-title", "Week"), local, key("wk-fire", "fires in that hour"), key("wk-band", "interval, all week"));
  const table = el("table", "wk"), head = el("tr"), axis = sv("svg", { class: "wk-strip", width: 7 * DAY - 4, height: 16, "aria-hidden": "true" });
  DAYS.forEach((name, d) => {
    axis.append(sv("text", { x: d * DAY + 12 * HOUR, y: 11, "text-anchor": "middle" }, name));
    for (const h of [6, 12, 18]) axis.append(sv("line", { x1: d * DAY + h * HOUR, x2: d * DAY + h * HOUR, y1: 13, y2: 16 }));
  });
  const th = el("th");
  th.append(axis);
  head.append(el("th", "", "task"), th);
  const thead = el("thead"), tbody = el("tbody");
  thead.append(head);
  const agents = [...new Set(t.rows.map((r) => r.agent))].sort((a, b) => a === null ? 1 : b === null ? -1 : a < b ? -1 : 1);
  for (const agent of agents) {
    const group = el("tr", "wk-agent"), cell = el("th", "", agent === null ? "no agent" : agent);
    cell.colSpan = 2;
    group.append(cell);
    tbody.append(group);
    for (const r of t.rows.filter((x) => x.agent === agent)) {
      const tr = el("tr", (r.enabled ? "" : "muted") + mark(r.node));
      const name = el("th");
      name.dataset.id = r.node;
      name.tabIndex = 0;
      const how = r.fires ? r.zone || "gateway time" : r.everyMs && r.everyMs < 86400000 ? "" : r.everyMs ? "start unknown" : "not weekly";
      name.append(el("span", "", r.label), el("small", "", r.when + (how ? " · " + how : "")));
      // The last run's status (runtime state, never a change) and the model.
      if (r.lastRun) {
        const run = el("i", "wk-run " + (r.lastRun === "ok" ? "ok" : "bad"));
        run.title = "Last run: " + r.lastRun;
        name.append(run);
      }
      name.title = [r.model ? "model " + r.model : "", r.lastRun ? "last run " + r.lastRun : ""].filter(Boolean).join(" · ");
      // Its strip selects the task too.
      const td = el("td");
      td.dataset.id = r.node;
      td.append(strip(r));
      tr.append(name, td);
      tbody.append(tr);
    }
  }
  table.append(thead, tbody);
  box.replaceChildren(bar, table);
}
function sourceIcon() {
  const g = sv("svg", { viewBox: "0 0 16 16", "aria-hidden": "true" });
  g.append(sv("path", { d: "M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5" }));
  return g;
}
// Where the Overview's totals lead: a view and, for Tools, the one group to
// show unfolded. The labels are those of views.ts's instanceTotals.
const TILE_VIEWS = { tools: ["tools"], plugins: ["tools", "origin:plugin"], "MCP servers": ["tools", "origin:mcp"],
  "channel accounts": ["system"], "scheduled tasks": ["schedules"] };
// The instance's totals as tiles, after the Doctor's: a tile opens what it
// counts, and the band around them selects the instance.
function summary(view, head, mark) {
  const box = el("div", "et-sum" + mark(head.id));
  box.dataset.id = head.id;
  box.tabIndex = 0;
  box.append(doctorTile(), ...view.elements[head.id].a.map(([label, value]) => {
    const [target, group] = TILE_VIEWS[label] || [];
    return tile(label, value, target && entryOf(state.version, target) ? () => openCount(target, group) : null);
  }));
  return box;
}
// A total's figure, large, and the rest of its value beside it.
function tile(label, value, open) {
  const t = open ? button("", (e) => { e.stopPropagation(); open(); }, "et-tile") : el("div", "et-tile");
  const [, figure, rest] = /^(\d+)(?: · )?(.*)$/.exec(value) || [null, value, ""];
  t.append(el("span", "", label), el("strong", "", figure), el("small", "", rest));
  return t;
}
// The Doctor's errors and warnings, each count in its severity's colour.
function doctorTile() {
  const v = versions[state.version], findings = v.findings || [], count = (s) => findings.filter((f) => f.severity === s).length;
  if (v.checks && v.checks.state !== "verified") return tile("doctor", "? · " + CHECKS_WORDS[v.checks.state], () => openPanel("doctor"));
  const t = tile("doctor", "0", () => openPanel("doctor")), shown = ["error", "warning"].filter((s) => count(s));
  t.title = [plural(count("error"), "error"), plural(count("warning"), "warning"), plural(count("info"), "note")].join(", ");
  if (shown.length) t.querySelector("strong").replaceChildren(...shown.map((s) => el("b", "doc-" + s, String(count(s)))));
  return t;
}
// Opens the view a total counts; a Tools group shows alone, its own groups folded.
function openCount(view, group) {
  const t = payload(entryOf(state.version, view)).table;
  const folded = t && t.kind === "matrix" ? new Set(group ? t.rows.filter((r) => r.shape !== "tool" && r.id !== group).map((r) => r.id) : []) : state.folded;
  navigate({ tab: "diagrams", view, folded });
  if (group) reveal(group);
}

// ---- Files and changes
function renderFiles() {
  const v = versions[state.version], names = Object.keys(v.files), box = document.getElementById("files");
  if (!names.includes(state.file)) state.file = names[0];
  const nav = el("nav", "files");
  for (const n of names) {
    const b = el("button", n === state.file ? "on" : "", n);
    b.onclick = () => navigate({ file: n, range: null });
    nav.append(b);
  }
  const text = data.texts[v.files[state.file]];
  let body;
  if (state.file.endsWith(".json")) body = el("pre", "", JSON.stringify(JSON.parse(text), null, 2));
  else {
    body = el("div", "code");
    const count = text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
    body.append(el("pre", "gutter", Array.from({ length: count }, (_, i) => i + 1).join("\n")),
      state.file.endsWith(".sysml") ? sysml(text) : el("pre", "", text));
    if (state.range) {
      const band = el("div", "band");
      band.style.top = (8 + (state.range[0] - 1) * 18) + "px";
      band.style.height = ((state.range[1] - state.range[0] + 1) * 18) + "px";
      body.append(band);
    }
  }
  box.replaceChildren(el("h2", "", when(v) + " UTC — files"), nav, body);
  if (state.range) box.scrollTop = body.offsetTop + 8 + (state.range[0] - 1) * 18 - 96;
}
// What changed since the previous version: per element first (viewer.ts's
// diff.subjects), then the files by group, folded except the instance's and
// the inferred SysML when short.
function renderChanges() {
  const v = versions[state.version], previous = versions[state.version + 1], box = document.getElementById("changes");
  const head = el("h2", "", when(v) + " UTC" + (previous ? " — since " + when(previous) : ""));
  if (!v.changes) return box.replaceChildren(head, el("p", "muted", "First version: nothing to compare."));
  const said = verdict(v);
  box.replaceChildren(head, el("p", "chg-verdict", said.words + (said.detail ? ": " + said.detail : "")), ...subjectChanges(v), ...fileGroups(v));
}
function subjectChanges(v) {
  const subjects = v.diff && v.diff.subjects;
  if (!subjects) return [];
  if (!subjects.length) return [el("p", "muted", "No configuration difference.")];
  const ul = el("ul", "chg-subjects");
  for (const s of subjects) {
    const li = el("li"), view = viewOf(state.version, s.id);
    li.append(view ? button(s.label, () => go(view.id, s.id), "chg-subject") : el("strong", "chg-subject", s.label));
    const bullets = el("ul");
    bullets.append(...s.bullets.map(bullet));
    li.append(bullets);
    ul.append(li);
  }
  return [ul];
}
// One change of an element: what changed (the field, or the change's kind),
// a value struck through above the new one, items added and removed.
function bullet(b) {
  const li = el("li"), what = b.field || b.kind.split(".").slice(1).join(" ");
  li.append(el("span", "md-kind", what));
  if (b.before !== undefined) li.append(el("del", "", b.before), " → ", el("ins", "", b.after));
  if (b.added && b.added.length) li.append(el("ins", "", "+ " + b.added.join(", ")));
  if (b.removed && b.removed.length) li.append(el("del", "", "− " + b.removed.join(", ")));
  return li;
}
const GROUP_TITLES = { instance: "Instance", inferred: "Inferred behaviour", library: "Library", data: "Data", diagnostics: "Diagnostics" };
function fileGroups(v) {
  const groups = v.diff ? v.diff.groups : [{ group: "files", files: v.changes.map((c) => c.file) }];
  return groups.map((g) => {
    const files = g.files.map((name) => v.changes.find((c) => c.file === name)).filter(Boolean);
    const size = files.reduce((n, c) => n + c.hunks.reduce((k, h) => k + h.lines.length, 0), 0);
    const d = el("details", "chg-files");
    d.open = (g.group === "instance" || g.group === "inferred") && size <= 400;
    d.append(el("summary", "", (GROUP_TITLES[g.group] || "Files") + " · " + files.map(fileLine).join(", ")), ...files.map(fileDiff));
    return d;
  });
}
// A file's count of lines added and removed; inference that did not run is
// not a removal.
function fileLine(c) {
  const lines = c.hunks.flatMap((h) => h.lines);
  if (c.status === "removed" && !versions[state.version].inferred && /^(OpenClawInferred\.sysml|inference\.json)$/.test(c.file)) return c.file + " (inference not run)";
  return c.file + " +" + lines.filter((l) => l[0] === "+").length + " −" + lines.filter((l) => l[0] === "-").length;
}
function fileDiff(c) {
  const section = el("section");
  section.append(el("h3", "", c.file + " — " + c.status));
  const diff = el("div", "diff");
  for (const h of c.hunks) {
    diff.append(el("div", "hunk", h.header));
    for (const l of h.lines) diff.append(el("div", l[0] === "+" ? "add" : l[0] === "-" ? "del" : "", l));
  }
  section.append(diff);
  return section;
}

function render(keepViewport) {
  keepFocus(() => {
    renderHeader();
    if (state.tab === "diagrams") renderDiagram(keepViewport);
    else if (state.tab === "files") renderFiles();
    else renderChanges();
  });
  renderNote();
  const place = state.tab === "files" ? "Files" : state.tab === "changes" ? "Changes" : state.drawn ? state.drawn.payload.title : "Diagrams";
  document.title = place + " · " + when(versions[state.version]) + " · OpenClaw SysML v2";
  writeHash();
}

// A re-render replaces the focused control: focus goes to its successor, the
// element with the same key (data-key, or data-id and tag), when there is one.
function keepFocus(rerender) {
  const a = document.activeElement;
  const key = a && a !== document.body && (a.dataset.key ? '[data-key="' + CSS.escape(a.dataset.key) + '"]'
    : a.dataset.id ? a.tagName.toLowerCase() + '[data-id="' + CSS.escape(a.dataset.id) + '"]' : null);
  rerender();
  if (key && !a.isConnected) {
    const b = document.querySelector(key);
    if (b) b.focus({ preventScroll: true });
  }
}

// ---- Events
// Another version keeps the view, but its table may have other columns.
document.getElementById("version").onchange = (e) => navigate({ version: +e.target.value, range: null, sort: null, facet: null }, true);
document.getElementById("view").onchange = (e) => navigate({ view: e.target.value });
for (const b of document.querySelectorAll(".tabs button")) b.onclick = () => navigate({ tab: b.dataset.tab }, true);
// The rail opens a panel, or collapses the sidebar when it is already open.
for (const b of document.querySelectorAll(".md-rail [data-panel]")) {
  b.onclick = () => state.panel === b.dataset.panel ? collapse() : openPanel(b.dataset.panel);
}
document.getElementById("side-collapse").onclick = collapse;
const panelBox = document.getElementById("inspector");
panelBox.addEventListener("scroll", () => { if (state.panelKey) state.scrolls.set(state.panelKey, panelBox.scrollTop); });
// Dragging the sidebar's edge, or its arrow keys, sets its width, kept for the
// next visit; a double click restores the default.
const side = document.getElementById("side"), grip = document.getElementById("side-grip");
function sideWidth(w) {
  const md = document.getElementById("md");
  if (w) md.style.setProperty("--side-w", w + "px"); else md.style.removeProperty("--side-w");
  store(WIDTH_KEY, w ? String(w) : null);
}
const clampWidth = (w) => Math.round(Math.max(300, Math.min(document.getElementById("md").getBoundingClientRect().width * 0.6, w)));
grip.addEventListener("pointerdown", (e) => { grip.setPointerCapture(e.pointerId); grip.dataset.drag = "1"; });
grip.addEventListener("pointermove", (e) => { if (grip.dataset.drag) sideWidth(clampWidth(side.getBoundingClientRect().right - e.clientX)); });
for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) grip.addEventListener(type, () => { delete grip.dataset.drag; });
grip.addEventListener("dblclick", () => sideWidth(null));
grip.addEventListener("keydown", (e) => {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  e.preventDefault();
  sideWidth(clampWidth(side.offsetWidth + (e.key === "ArrowLeft" ? 24 : -24)));
});
if (Number(stored(WIDTH_KEY)) >= 300) document.getElementById("md").style.setProperty("--side-w", stored(WIDTH_KEY) + "px");
document.getElementById("fit").onclick = fit;
// Frames the selection, or fits the whole scene when nothing drawn is selected.
function frame() {
  if (state.drawn && state.drawn.nodes && state.drawn.nodes.has(state.selected)) fitTo(state.selected); else fit();
}
document.getElementById("fit-selection").onclick = frame;
document.getElementById("zoom-in").onclick = () => zoom(1.25);
document.getElementById("zoom-out").onclick = () => zoom(0.8);
const canvas = document.getElementById("canvas");
// The gestures' hint goes once the canvas has been used.
const hint = document.querySelector(".md-hint");
hint.hidden = stored(HINT_KEY) === "1";
function used() {
  if (!hint.hidden) { hint.hidden = true; store(HINT_KEY, "1"); }
}
canvas.addEventListener("wheel", (e) => {
  if (!state.viewport) return;
  used();
  e.preventDefault();
  const box = canvas.getBoundingClientRect();
  if (e.ctrlKey || e.metaKey) zoom(Math.exp(-e.deltaY * 0.01), e.clientX - box.left, e.clientY - box.top);
  else { state.viewport = { ...state.viewport, x: state.viewport.x - e.deltaX, y: state.viewport.y - e.deltaY }; applyViewport(); }
}, { passive: false });
// Dragging pans, from the background or from an element; a press that does
// not move is a click. Two fingers pinch to zoom.
const pointers = new Map();
let press = null, pinch = null;
function spread() {
  const [[ax, ay], [bx, by]] = [...pointers.values()], box = canvas.getBoundingClientRect();
  return { d: Math.hypot(bx - ax, by - ay), x: (ax + bx) / 2 - box.left, y: (ay + by) / 2 - box.top };
}
canvas.addEventListener("pointerdown", (e) => {
  if (!state.viewport) return;
  used();
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
  if (pointers.size === 2) { pinch = spread(); press = null; }
  else press = { x: e.clientX, y: e.clientY, from: state.viewport, moved: false };
});
canvas.addEventListener("pointermove", (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
  if (pinch && pointers.size === 2) {
    const now = spread();
    zoom(now.d / pinch.d, now.x, now.y);
    state.viewport = { ...state.viewport, x: state.viewport.x + now.x - pinch.x, y: state.viewport.y + now.y - pinch.y };
    applyViewport();
    pinch = now;
    return;
  }
  if (!press) return;
  const dx = e.clientX - press.x, dy = e.clientY - press.y;
  if (!press.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
  // Captured only once it pans, so that a click still reaches its element.
  if (!press.moved) { press.moved = true; canvas.setPointerCapture(e.pointerId); }
  state.viewport = { ...press.from, x: press.from.x + dx, y: press.from.y + dy };
  applyViewport();
});
function release(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
}
let panned = false;
canvas.addEventListener("pointerup", (e) => {
  const p = press;
  release(e);
  press = null;
  panned = Boolean(p && p.moved);
  if (p && !p.moved && !e.target.closest(".md-node")) select(null);
});
canvas.addEventListener("pointercancel", (e) => { release(e); press = null; });
canvas.addEventListener("click", (e) => {
  const g = !panned && e.target.closest(".md-node");
  panned = false;
  // Zoomed out, a click also frames what it selects, to read it.
  if (g) select(g.dataset.id, state.drawn.lod);
});
// Safari pinches with gesture events rather than ctrl + wheel.
let gesture = 1;
canvas.addEventListener("gesturestart", (e) => { e.preventDefault(); gesture = 1; });
canvas.addEventListener("gesturechange", (e) => {
  e.preventDefault();
  // A touch pinch already zooms through its two pointers.
  if (pointers.size >= 2) return;
  const box = canvas.getBoundingClientRect();
  zoom(e.scale / gesture, e.clientX - box.left, e.clientY - box.top);
  gesture = e.scale;
});
function hover(id) {
  if (id !== state.hover) { state.hover = id; applyFocus(); }
}
canvas.addEventListener("pointerover", (e) => {
  const g = e.target.closest(state.drawn && state.drawn.lod ? ".md-node.leaf, .md-node.frame" : ".md-node.leaf");
  hover(g ? g.dataset.id : null);
});
canvas.addEventListener("pointerleave", () => hover(null));
canvas.addEventListener("keydown", (e) => {
  const g = e.target.closest && e.target.closest(".md-node");
  // Enter selects and frames an element; Space only selects it.
  if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); select(g.dataset.id, e.key === "Enter"); return; }
  const v = state.viewport;
  // Command, Control and Option shortcuts stay the browser's.
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === "Escape") select(null);
  else if (e.key === "0") fit();
  else if (e.key === "f" || e.key === "F") frame();
  else if (e.key === "+" || e.key === "=") zoom(1.25);
  else if (e.key === "-") zoom(0.8);
  else if (v && e.key.startsWith("Arrow")) {
    state.viewport = { ...v, x: v.x + (e.key === "ArrowLeft" ? 40 : e.key === "ArrowRight" ? -40 : 0), y: v.y + (e.key === "ArrowUp" ? 40 : e.key === "ArrowDown" ? -40 : 0) };
    applyViewport();
  } else return;
  e.preventDefault();
});
const sheet = document.getElementById("sheet");
// A table row of a drawn element (a scheduled task's week) frames it.
const drawn = (id) => Boolean(state.drawn && state.drawn.scene && state.drawn.scene.nodes.some((n) => n.id === id));
sheet.addEventListener("click", (e) => {
  const x = e.target.closest("[data-id]");
  if (x) select(x.dataset.id, drawn(x.dataset.id));
});
sheet.addEventListener("keydown", (e) => {
  if (e.target.dataset.id && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); select(e.target.dataset.id, drawn(e.target.dataset.id)); }
  else if (e.key === "Escape") select(null);
});
// Dragging the splitter sets the table's height; a view at Fit fits again.
const split = document.getElementById("split");
split.addEventListener("pointerdown", (e) => { split.setPointerCapture(e.pointerId); split.dataset.drag = "1"; });
split.addEventListener("pointermove", (e) => {
  if (!split.dataset.drag) return;
  // At least 80 px of table, and 120 px of diagram above it.
  const bottom = sheet.getBoundingClientRect().bottom, room = document.querySelector(".md-main").getBoundingClientRect().height;
  state.sheetH = Math.round(Math.max(80, Math.min(room - 120, bottom - e.clientY - 4)));
  sheet.style.height = state.sheetH + "px";
  sheet.style.maxHeight = "none";
});
for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
  split.addEventListener(type, () => { if (split.dataset.drag) { delete split.dataset.drag; refit(); } });
}
window.addEventListener("resize", () => { if (state.tab === "diagrams") refit(); });
window.addEventListener("hashchange", follow);
follow();
</script>
</body>
</html>
`;
