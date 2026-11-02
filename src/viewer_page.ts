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
  --ink: #1d1d1f; --muted: #75716a; --faint: #9a9a9f; --line: #e3e0da; --line-strong: #d6d2c9;
  --hover: rgb(0 0 0 / 4%); --accent-soft: #efede8;
  --add: #19743c; --add-bg: #e3f1e7; --del: #b13c42; --del-bg: #f7e4e4; --warn: #8a642a; --warn-bg: #f6eedd;
  --font: -apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", sans-serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  --diagram: Helvetica, Arial, "Liberation Sans", sans-serif;
  --md-node: #fff; --md-node-def: #f3f2ef; --md-frame: #fdfcfa; --md-group: rgb(0 0 0 / 1.6%);
  --md-stroke: #2b2b2d; --md-soft: #8e8b85; --md-rule: #e1ded8; --md-edge: #4b4b4f;
  --md-halo: var(--paper); --md-dot: #e3e0da; --md-ring: rgb(29 29 31 / 10%);
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
.top select { max-width: 330px; padding: 4px 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--card); }
.meta { min-width: 0; color: var(--muted); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
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

/* Diagrams: Assembly's SysML page, as one sheet. */
.md { position: relative; height: 100%; display: grid; grid-template-rows: auto minmax(0, 1fr); }
.md-main { min-height: 0; display: flex; flex-direction: column; }
.md-stage { position: relative; flex: 1 1 0; min-height: 0; }
.md-stage[hidden], .md-sheet[hidden] { display: none; }
.md-toolbar { position: relative; z-index: 2; display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 10px 16px 0; pointer-events: none; }
.md-toolbar > * { pointer-events: auto; }
.md-title { display: flex; align-items: baseline; gap: 8px; min-width: 0; max-width: 420px; }
.md-title strong { font-size: 18px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.md-title span { font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.md-toolbar select { min-width: 140px; max-width: 280px; padding: 5px 9px; border: 1px solid var(--line); border-radius: 8px; background: var(--card); }
.md-chips, .md-tools { display: flex; gap: 2px; padding: 3px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
.md-chips:empty { display: none; }
.md-tools { margin-left: auto; }
.md-tools[hidden] { display: none; }
.md-chips button, .md-tools button, .md-chips span { all: unset; cursor: pointer; padding: 3px 9px; border-radius: 7px; font-size: 12px; font-weight: 500; color: var(--muted); }
.md-chips span { cursor: default; }
.md-chips button:hover, .md-tools button:hover { color: var(--ink); background: var(--hover); }
.md-chips .add { color: var(--add); } .md-chips .chg { color: var(--warn); } .md-chips .del { color: var(--del); }
.md-chips button[aria-pressed="false"] { text-decoration: line-through; }
.md-canvas { position: absolute; inset: 0; overflow: hidden; cursor: grab; touch-action: none; outline: none;
  background-image: radial-gradient(var(--md-dot) 0.9px, transparent 1px); background-size: 22px 22px; }
.md-canvas:active { cursor: grabbing; }
.md-canvas > svg { position: absolute; inset: 0; width: 100%; height: 100%; font-family: var(--diagram); }
.md-empty { margin: 72px 24px; color: var(--muted); max-width: 520px; }
.md-hint { position: absolute; right: 16px; bottom: 10px; font-size: 11px; color: var(--faint); pointer-events: none; }
.md-legend { position: absolute; left: 14px; bottom: 12px; z-index: 1; display: flex; flex-wrap: wrap; gap: 4px 14px; max-width: min(760px, calc(100% - 340px)); padding: 6px 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); font-size: 11px; color: var(--muted); }
.md-legend span { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.md-legend svg { width: 26px; height: 14px; overflow: visible; }

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
.md-ring-select { fill: none; stroke: var(--md-ring); stroke-width: 8; }
.md-badge circle { stroke: var(--paper); stroke-width: 2; }
.md-badge text { font-size: 10px; font-weight: 700; fill: #fff !important; text-anchor: middle; }
.hl .md-node.added > .md-body { stroke: var(--add); stroke-width: 2; }
.hl .md-node.changed > .md-body { stroke: var(--warn); stroke-width: 2; }
.hl .md-node.added.group > .md-body, .hl .md-node.added.frame > .md-body { stroke-dasharray: none; }
.md-badge { display: none; }
.hl .md-badge { display: inline; }
.md-badge.add circle { fill: var(--add); } .md-badge.chg circle { fill: var(--warn); }
.hl .md-edge.added .md-line { stroke: var(--add); stroke-width: 2; }
.hl .md-edge.changed .md-line { stroke: var(--warn); stroke-width: 2; }

.md-edge { transition: opacity .18s ease; pointer-events: none; }
.md-line { fill: none; stroke: var(--md-edge); stroke-width: 1.25; }
.md-edge.handoff .md-line, .md-edge.escalation .md-line { stroke-dasharray: 6 4; }
.md-edge.escalation .md-line { stroke: var(--warn); }
.md-edge.owner .md-line { stroke-width: 1; }
.md-edge.target .md-line { stroke-dasharray: 2 3; stroke: var(--md-soft); }
.md-edge text, .md-label { font-size: 10.5px; fill: var(--muted); paint-order: stroke; stroke: var(--md-halo); stroke-width: 4px; stroke-linejoin: round; }
.md-edge.escalation text { fill: var(--warn); }
.md-mark-line { fill: none; stroke: var(--md-edge); stroke-width: 1.25; stroke-linejoin: round; }
#md-arrow-warn .md-mark-line { stroke: var(--warn); }
.md-mark-fill { fill: var(--md-edge); }

svg.md-focus .md-edge:not(.lit) { opacity: .12; }
svg.md-focus .md-node.leaf:not(.lit) { opacity: .28; }
svg.md-focus .md-edge.lit .md-line { stroke-width: 1.8; }

/* Inspector */
.md-inspector { position: absolute; z-index: 3; right: 14px; bottom: 12px; width: 380px; max-height: min(560px, calc(100% - 70px)); overflow: auto; padding: 14px 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); backdrop-filter: blur(8px); font-size: 12px; box-shadow: 0 10px 30px rgb(0 0 0 / 6%); }
.md-inspector.is-left { left: 14px; right: auto; }
.md-inspector[hidden] { display: none; }
.md-inspector h3 { margin: 2px 26px 0 0; font-size: 15px; font-weight: 600; word-break: break-word; }
.md-inspector h3 span { font-weight: 400; color: var(--muted); }
.md-kicker { margin: 0; font-size: 10.5px; letter-spacing: .04em; color: var(--muted); }
.md-inspector .md-kicker + ul, .md-inspector .md-kicker + .md-src { margin-top: 4px; }
.md-inspector dl { display: grid; grid-template-columns: auto 1fr; gap: 3px 10px; margin: 12px 0; }
.md-inspector dt { color: var(--muted); }
.md-inspector dd { margin: 0; word-break: break-word; }
.md-inspector ul { list-style: none; margin: 0 0 12px; padding: 0; }
.md-inspector li button { all: unset; display: flex; gap: 8px; width: 100%; padding: 4px 0; border-top: 1px solid var(--line); cursor: pointer; }
.md-inspector li button:hover .md-other { text-decoration: underline; }
.md-kind { min-width: 92px; color: var(--muted); }
.md-close { all: unset; position: absolute; top: 8px; right: 12px; cursor: pointer; font-size: 17px; color: var(--muted); }
.md-status { display: inline-block; margin-top: 6px; padding: 1px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
.md-status.added { color: var(--add); background: var(--add-bg); } .md-status.changed { color: var(--warn); background: var(--warn-bg); } .md-status.removed { color: var(--del); background: var(--del-bg); }
.md-src { margin: 8px 0 4px; }
.md-src button { all: unset; cursor: pointer; font: 11.5px var(--mono); color: var(--ink); text-decoration: underline; text-decoration-color: var(--line-strong); }
.md-src button:hover { text-decoration-color: var(--ink); }
.md-inspector pre { max-height: 260px; margin: 4px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 11px; }
.md.inspecting .md-legend { display: none; }
.md.inspecting .md-sheet { padding-right: 396px; }
.md-pop { position: absolute; z-index: 3; top: 52px; right: 16px; width: 300px; max-height: 50%; overflow: auto; padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); box-shadow: 0 10px 30px rgb(0 0 0 / 6%); }
.md-pop[hidden] { display: none; }
.md-pop button { all: unset; display: block; width: 100%; padding: 4px 0; border-top: 1px solid var(--line); cursor: pointer; font: 11.5px var(--mono); color: var(--del); }
.md-canvas:focus-visible, button:focus-visible, select:focus-visible, [role="button"]:focus-visible { outline: 2px solid #797369; outline-offset: 2px; }

/* Tables: a view's elements in rows, under its diagram or alone. */
.md-sheet { flex: 0 0 auto; max-height: 44%; overflow: auto; margin: 0 12px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--card); }
.md-sheet.alone { flex: 1 1 0; max-height: none; margin-top: 8px; }
.tb-bar { position: sticky; left: 0; z-index: 4; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; padding: 10px 14px; border-bottom: 1px solid var(--line); background: var(--card); font-size: 12px; color: var(--muted); }
.tb-bar input { width: 220px; padding: 4px 9px; border: 1px solid var(--line); border-radius: 8px; background: var(--paper); font: inherit; color: var(--ink); }
.tb-bar button { all: unset; cursor: pointer; padding: 2px 8px; border: 1px solid var(--line); border-radius: 7px; color: var(--ink); }
.tb-bar button:hover { background: var(--hover); }
.tb-bar button[aria-pressed="true"] { background: var(--accent-soft); border-color: var(--line-strong); }
.tb-key { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.tb-note { margin-left: auto; font-style: italic; }
.hl tr.added > th, .hl tr.added > td { background: rgb(227 241 231 / 60%); }
.hl tr.changed > th, .hl tr.changed > td { background: rgb(246 238 221 / 60%); }
.hl tr.added > :first-child { box-shadow: inset 3px 0 var(--add); } .hl tr.changed > :first-child { box-shadow: inset 3px 0 var(--warn); }
.hl th.added { box-shadow: inset 0 -3px var(--add); } .hl th.changed { box-shadow: inset 0 -3px var(--warn); }
.hl td.added { box-shadow: inset 0 0 0 2px var(--add); } .hl td.changed { box-shadow: inset 0 0 0 2px var(--warn); }
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
.mx tr.d0 > th { padding-left: 28px; } .mx tr.d1 > th { padding-left: 44px; } .mx tr.d2 > th { padding-left: 60px; }
.mx-group > th { font-size: 11.5px; } .mx-group > th, .mx-group > td { background: var(--paper); }
.mx tr.d0 > th { font-style: italic; color: var(--muted); }
.mx-group .mx-kw { color: var(--muted); font-size: 10px; margin-right: 5px; }
.mx-group .mx-name { font-weight: 600; } .mx tr.d0 .mx-name { font-weight: 500; }
.mx-type { color: var(--muted); }
.mx-fold { all: unset; cursor: pointer; display: inline-block; width: 14px; margin-left: -16px; color: var(--muted); text-align: center; }
.mx-count { font-size: 10.5px; color: var(--muted); }
.mx tr.muted > th { color: var(--muted); }
.mx tr.dashed .mx-name { color: var(--muted); border-bottom: 1px dashed var(--line-strong); }
.mx tbody tr:hover > th, .mx tbody tr:hover > td, .mx .hc { background-image: linear-gradient(var(--hover), var(--hover)); }
.mx .selected, .mx .on { box-shadow: inset 0 0 0 2px var(--ink); }
.mx thead th.selected { box-shadow: inset 0 -3px var(--ink); }
.tb-title { color: var(--ink); font-weight: 600; }
.et { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12px; }
.et th { position: sticky; top: 0; z-index: 1; padding: 6px 10px; text-align: left; font-weight: 500; color: var(--muted); background: var(--card); border-bottom: 1px solid var(--line-strong); white-space: nowrap; }
.et th button { all: unset; cursor: pointer; font-weight: 500; color: var(--muted); }
.et th button:hover { color: var(--ink); }
.et th[aria-sort="ascending"] button::after { content: " ↑"; } .et th[aria-sort="descending"] button::after { content: " ↓"; }
.et td { padding: 5px 10px; border-bottom: 1px solid var(--line); vertical-align: top; white-space: nowrap; background: var(--card); }
.et tbody tr { cursor: pointer; }
.et tbody tr:hover > td { background-image: linear-gradient(var(--hover), var(--hover)); }
.et tr.selected > td { box-shadow: inset 0 1px var(--ink), inset 0 -1px var(--ink); }
.et tr.muted > td { color: var(--muted); }
.et-name { font-weight: 600; }
.et td.et-wrap { white-space: normal; min-width: 160px; }
.et-facet { color: var(--muted); font-style: italic; }
.et-name span { display: block; } .et-name small { color: var(--muted); font: 400 10.5px var(--mono); }
.et td.et-views { white-space: normal; min-width: 120px; }
.et-views button { all: unset; cursor: pointer; margin-right: 10px; color: var(--ink); text-decoration: underline; text-decoration-color: var(--line-strong); }
.et-views button:hover { text-decoration-color: var(--ink); }
.et-sum { display: flex; flex-wrap: wrap; gap: 10px; padding: 14px; border-bottom: 1px solid var(--line); cursor: pointer; }
.et-sum div { display: flex; flex-direction: column; gap: 2px; min-width: 120px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--paper); }
.et-sum span { font-size: 11px; color: var(--muted); }
.et-sum strong { font-size: 13px; font-weight: 600; }
.hl .et-sum.changed div { border-color: var(--warn); } .et-sum.selected div { border-color: var(--ink); }
.et-src button { all: unset; display: block; cursor: pointer; font: 11px var(--mono); text-decoration: underline; text-decoration-color: var(--line-strong); }
.et-src button:hover { text-decoration-color: var(--ink); }
.g { display: inline-block; position: relative; width: 11px; height: 11px; border: 1.2px solid var(--md-stroke); border-radius: 2px; vertical-align: middle; }
.g.h, .g.b { background: var(--md-stroke); }
.g.s { background: linear-gradient(to bottom right, transparent 50%, var(--md-stroke) 50%); }
.g.b::after { content: ""; position: absolute; left: 1.5px; right: 1.5px; top: 3.6px; height: 1.3px; background: #fff; }
.g.n { border-color: var(--line-strong); border-style: dashed; }

/* Files and changes */
nav.files { display: flex; flex-wrap: wrap; gap: 4px; margin: 0 0 10px; }
nav.files button { padding: 2px 10px; border: 1px solid var(--line); border-radius: 7px; background: var(--card); cursor: pointer; }
nav.files button.on { background: var(--ink); border-color: var(--ink); color: #fff; }
pre, .diff { margin: 0; overflow: auto; border: 1px solid var(--line); border-radius: 8px; background: var(--card); font: 12px/1.5 var(--mono); }
pre { padding: 8px 10px; }
.code { position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr); border: 1px solid var(--line); border-radius: 8px; background: var(--card); font: 12px/18px var(--mono); }
.code pre { border: 0; border-radius: 0; background: none; padding: 8px 10px; font: inherit; overflow: visible; }
.code .gutter { color: var(--faint); text-align: right; user-select: none; border-right: 1px solid var(--line); }
.code .band { position: absolute; left: 0; right: 0; background: rgb(138 100 42 / 12%); border-left: 3px solid var(--warn); pointer-events: none; }
.diff div { padding: 0 10px; white-space: pre; }
.add { background: #e6ffec; } .del { background: #ffebe9; } .hunk { background: #eaeef2; color: var(--muted); }
.k { color: #8250df; } .s { color: #0a3069; } .c { color: #6e7781; }
@media (max-width: 760px) {
  .top { flex-wrap: wrap; height: auto; padding: 8px 12px; } .meta { display: none; }
  .md-inspector { left: 8px; right: 8px; width: auto; max-height: 55%; } .md-legend, .md-hint { display: none; }
}
</style>
</head>
<body>
<header class="top">
<div class="brand"><i aria-hidden="true"></i><h1>OpenClaw <span>→ SysML v2</span></h1></div>
<select id="version" aria-label="Version"></select>
<span class="meta" id="meta"></span>
<nav class="tabs" aria-label="Pages"><button data-tab="diagrams">Diagrams</button><button data-tab="files">Files</button><button data-tab="changes">Changes</button></nav>
</header>
<main>
<section id="diagrams"><div class="md" id="md">
<div class="md-toolbar">
<div class="md-title"><strong id="view-title"></strong><span id="view-sub"></span></div>
<select id="view" aria-label="SysML view"></select>
<div class="md-chips" id="delta" role="group" aria-label="Changes since the previous version"></div>
<div class="md-tools"><button type="button" id="fit" title="Fit (0)">Fit</button><button type="button" id="zoom-in" title="Zoom in (+)" aria-label="Zoom in">+</button><button type="button" id="zoom-out" title="Zoom out (−)" aria-label="Zoom out">−</button></div>
</div>
<div class="md-main">
<div class="md-stage" id="stage">
<div class="md-canvas" id="canvas" tabindex="0" role="group" aria-label="Diagram canvas. Arrow keys pan, plus and minus zoom, zero fits, Escape clears the selection."></div>
<div class="md-legend" id="legend"></div>
<span class="md-hint">Drag or scroll to pan · ⌘/Ctrl + scroll to zoom · click an element</span>
</div>
<div class="md-sheet" id="sheet" hidden></div>
</div>
<div class="md-pop" id="removed" hidden></div>
<aside class="md-inspector" id="inspector" aria-label="Element" hidden></aside>
</div></section>
<section id="files" class="sheet" hidden></section>
<section id="changes" class="sheet" hidden></section>
</main>
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
const LEGENDS = {
  Structure: [["usage", "part usage"], ["connection", "connection : AgentBinding"], ["dashed", "disabled"]],
  Cases: [["usage", "scheduled case"], ["owner", "owner"], ["target", "unresolved targetAgent"], ["dashed", "disabled"]],
  Behaviour: [["initial", "start"], ["decision", "decision"], ["send", "hand-off or escalation"], ["final", "done"],
    ["succession", "succession"]],
};

const state = { version: 0, tab: "diagrams", view: "overview", file: "OpenClawInstance.sysml", range: null,
  // An element to select once its view is shown.
  selected: null, focus: null, hover: null, viewport: null, highlight: true, drawn: null,
  // Tables: the text filter, folded groups, the facet value shown, the sort.
  filter: "", folded: new Set(), facet: null, sort: null };

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

// Routing: #<version>[/<view>|/files|/changes]
function readHash() {
  const parts = location.hash.slice(1).split("/").map(decodeURIComponent);
  const i = versions.findIndex((v) => v.id === parts[0]);
  state.version = Math.max(0, i);
  if (parts[1] === "files" || parts[1] === "changes") state.tab = parts[1];
  else if (parts[1]) { state.tab = "diagrams"; state.view = parts[1]; }
}
function writeHash() {
  const tail = state.tab === "diagrams" ? state.view : state.tab;
  history.replaceState(null, "", "#" + encodeURIComponent(versions[state.version].id) + "/" + encodeURIComponent(tail));
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

// ---- Header
function renderHeader() {
  const select = document.getElementById("version");
  select.replaceChildren(...versions.map((v, i) => {
    const o = el("option", "", when(v) + " UTC" + (i === 0 ? " · latest" : ""));
    o.value = String(i);
    return o;
  }));
  select.value = String(state.version);
  const v = versions[state.version];
  document.getElementById("meta").textContent = [
    v.agents + " agent" + (v.agents === 1 ? "" : "s"),
    v.inferred ? "inferred " + v.inferred.procedures + " procedures, " + v.inferred.rules + " rules" : "no inference",
    v.changes ? v.changes.length + " file" + (v.changes.length === 1 ? "" : "s") + " changed" : "first version",
  ].join(" · ");
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
    delta && delta.added.includes(n.id) ? "added" : "", delta && delta.changed.includes(n.id) ? "changed" : ""];
  const g = sv("g", { class: classes.filter(Boolean).join(" "), "data-id": n.id, tabindex: 0, role: "button",
    "aria-label": (n.kw ? n.kw + " " : "") + (n.name || n.lines && n.lines.join(" ") || n.shape) });
  g.append(sv("title", {}, n.name || (n.lines || []).join(" ") || (n.label ? n.label.lines.join(" ") : n.shape)));
  const { x, y, w, h } = n, cx = x + w / 2, cy = y + h / 2;
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
  return g;
}
function drawEdge(e, delta) {
  const cls = ["md-edge", e.kind, delta && delta.added.includes(e.id) ? "added" : "", delta && delta.changed.includes(e.id) ? "changed" : ""];
  const g = sv("g", { class: cls.filter(Boolean).join(" "), "data-id": e.id });
  const arrow = e.kind === "connection" ? null : e.kind === "escalation" ? "md-arrow-warn" : "md-arrow";
  for (const p of e.pts) g.append(sv("path", { class: "md-line", d: rounded(p), "marker-end": arrow ? "url(#" + arrow + ")" : undefined }));
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
function currentView() {
  const entries = viewsOf(state.version);
  if (!entries || !entries.length) return null;
  const entry = entries.find((e) => payload(e).id === state.view) || entries[0];
  state.view = payload(entry).id;
  return { entry, view: payload(entry), delta: entry.delta };
}
function renderPicker(entries) {
  const select = document.getElementById("view");
  const groups = new Map();
  for (const e of entries) {
    const v = payload(e);
    if (!groups.has(v.group)) groups.set(v.group, []);
    const n = e.delta ? e.delta.added.length + e.delta.changed.length + e.delta.removed.length : 0;
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
  select.value = state.view;
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
// Opens a view of this version and selects one of its elements, if it has it.
function go(view, id) {
  state.tab = "diagrams";
  state.view = view;
  state.focus = id;
  render();
}
const nameOf = (n) => n.name || (n.lines || []).join(" ") || (n.label ? n.label.lines.join(" ") : n.shape);
function button(text, onclick, cls) {
  const b = el("button", cls || "", text);
  b.type = "button";
  b.onclick = onclick;
  return b;
}
function marker(delta) {
  const added = new Set(delta ? delta.added : []), changed = new Set(delta ? delta.changed : []);
  return (id) => added.has(id) ? " added" : changed.has(id) ? " changed" : "";
}

function renderDelta(cur) {
  const box = document.getElementById("delta"), d = cur.delta;
  box.replaceChildren();
  document.getElementById("removed").hidden = true;
  if (!d) return;
  if (d.isNew) { box.append(el("span", "add", "New in this version")); return; }
  const count = (ids) => ids.filter((id) => cur.view.elements[id] || headOf(cur.view, id)).length;
  const added = count(d.added), changed = count(d.changed);
  if (!added && !changed && !d.removed.length) { box.append(el("span", "", "No change since " + when(versions[state.version + 1]))); return; }
  const toggle = button("Changes", () => {
    state.highlight = !state.highlight;
    toggle.setAttribute("aria-pressed", String(state.highlight));
    document.getElementById("md").classList.toggle("hl", state.highlight);
  });
  toggle.title = "Highlight what changed since " + when(versions[state.version + 1]);
  toggle.setAttribute("aria-pressed", String(state.highlight));
  box.append(toggle);
  const cycle = (ids, cls, label) => {
    if (!ids.length) return;
    let at = -1;
    box.append(button(label, () => {
      const shown = ids.filter((id) => headOf(cur.view, id));
      if (!shown.length) return;
      at = (at + 1) % shown.length;
      select(shown[at], true);
    }, cls));
  };
  cycle(d.added, "add", "+" + added + " added");
  cycle(d.changed, "chg", "~" + changed + " changed");
  if (d.removed.length) {
    box.append(button("−" + d.removed.length + " removed", () => {
      const pop = document.getElementById("removed");
      pop.hidden = !pop.hidden;
      const before = payload(entryOf(state.version + 1, state.view));
      pop.replaceChildren(el("p", "md-kicker", "Removed since " + when(versions[state.version + 1])), ...d.removed.map((id) => {
        const n = headOf(before, id);
        return button(n ? nameOf(n) : id, () => inspect(state.version + 1, before, id, "removed"));
      }));
    }, "del"));
  }
}
function renderLegend(view) {
  const box = document.getElementById("legend");
  const items = view.scene ? LEGENDS[view.group] || [] : [];
  box.replaceChildren(...items.map(([kind, text]) => {
    const s = el("span");
    const g = sv("svg", { viewBox: "0 0 26 14", "aria-hidden": "true" });
    const add = (tag, a) => g.append(sv(tag, a));
    if (kind === "usage" || kind === "dashed") add("rect", { x: 1, y: 1, width: 24, height: 12, rx: 4, fill: "#fff", stroke: kind === "dashed" ? "#8e8b85" : "#2b2b2d", "stroke-dasharray": kind === "dashed" ? "3 2" : null });
    if (kind === "connection") add("path", { d: "M1,7 H25", stroke: "#4b4b4f", "stroke-width": 1.3 });
    if (kind === "owner" || kind === "succession") add("path", { d: "M1,7 H24 M19,3 L24,7 L19,11", stroke: "#4b4b4f", fill: "none", "stroke-width": 1.3 });
    if (kind === "target") add("path", { d: "M1,7 H24 M19,3 L24,7 L19,11", stroke: "#8e8b85", fill: "none", "stroke-dasharray": "2 2" });
    if (kind === "initial") add("circle", { cx: 13, cy: 7, r: 5, fill: "#2b2b2d" });
    if (kind === "final") { add("circle", { cx: 13, cy: 7, r: 6, fill: "#fff", stroke: "#2b2b2d" }); add("circle", { cx: 13, cy: 7, r: 3, fill: "#2b2b2d" }); }
    if (kind === "decision") add("path", { d: "M13,0 L20,7 L13,14 L6,7 Z", fill: "#fff", stroke: "#2b2b2d" });
    if (kind === "send") add("path", { d: "M2,1 H18 L24,7 L18,13 H2 Z", fill: "#fff", stroke: "#2b2b2d" });
    s.append(g, text);
    return s;
  }));
  box.hidden = !items.length;
}
function subtitle(view) {
  const t = view.table;
  if (t && t.kind === "matrix") {
    return t.rows.filter((r) => r.shape === "tool" && !r.dashed).length + " tools × " + t.columns.length + " agents · SysML allocation matrix";
  }
  return [
    ...view.scene ? [view.scene.nodes.filter((n) => !["frame", "group", "initial", "final"].includes(n.shape)).length + " elements"] : [],
    ...t ? [t.rows.length + " " + t.title.toLowerCase()] : [],
  ].join(" · ");
}

function renderDiagram(keepViewport) {
  const canvas = document.getElementById("canvas"), stage = document.getElementById("stage"), sheet = document.getElementById("sheet");
  const cur = currentView();
  const entries = viewsOf(state.version);
  closeInspector();
  if (!cur) {
    document.getElementById("view-title").textContent = "Diagrams";
    document.getElementById("view-sub").textContent = "";
    document.getElementById("view").replaceChildren();
    document.getElementById("delta").replaceChildren();
    document.getElementById("legend").hidden = true;
    stage.hidden = false;
    sheet.hidden = true;
    canvas.replaceChildren(el("p", "md-empty", "No diagrams for this version: its snapshot uses a schema this viewer does not read. Its files are under Files."));
    state.drawn = null;
    return;
  }
  renderPicker(entries);
  const { view, delta } = cur;
  document.getElementById("view-title").textContent = view.title;
  document.getElementById("view-sub").textContent = subtitle(view);
  renderDelta(cur);
  renderLegend(view);
  const keep = keepViewport && state.drawn && state.drawn.view === view.id;
  if (!keep) { state.selected = null; state.filter = ""; state.facet = null; state.sort = null; }
  document.getElementById("md").classList.toggle("hl", state.highlight);
  document.querySelector(".md-tools").hidden = !view.scene;
  stage.hidden = !view.scene;
  sheet.hidden = !view.table;
  sheet.classList.toggle("alone", !view.scene);
  state.drawn = { view: view.id, svg: null, world: null, scene: view.scene, payload: view };
  // The table first: the diagram fits in the room it leaves.
  if (view.table) {
    const at = [sheet.scrollTop, sheet.scrollLeft];
    renderTable(sheet, view, delta);
    if (keep) [sheet.scrollTop, sheet.scrollLeft] = at;
  }
  if (view.scene) drawScene(view, delta, keep);
  else canvas.replaceChildren();
  if (state.focus && headOf(view, state.focus)) state.selected = state.focus;
  if (state.selected && !headOf(view, state.selected)) state.selected = null;
  if (state.selected) select(state.selected, state.selected === state.focus); else applyFocus();
  state.focus = null;
}
function drawScene(view, delta, keep) {
  const canvas = document.getElementById("canvas");
  const svg = sv("svg", { role: "group", "aria-label": view.title + " diagram" });
  const world = sv("g", {});
  svg.append(defs(), world);
  for (const n of view.scene.nodes.filter((n) => n.shape === "frame" || n.shape === "group")) world.append(drawNode(n, delta));
  for (const e of view.scene.edges) world.append(drawEdge(e, delta));
  for (const n of view.scene.nodes.filter((n) => n.shape !== "frame" && n.shape !== "group")) world.append(drawNode(n, delta));
  canvas.replaceChildren(svg);
  // Text measured at export may still overflow with another font: squeeze it.
  for (const t of svg.querySelectorAll("text[data-max]")) {
    const max = +t.dataset.max;
    if (t.getComputedTextLength() > max) { t.setAttribute("textLength", max); t.setAttribute("lengthAdjust", "spacingAndGlyphs"); }
  }
  state.drawn.svg = svg;
  state.drawn.world = world;
  if (keep && state.viewport) applyViewport(); else fit();
}

function fit() {
  const d = state.drawn, box = document.getElementById("canvas").getBoundingClientRect();
  if (!d || !d.scene) return;
  const top = 56, margin = 24;
  const k = Math.min((box.width - 2 * margin) / Math.max(d.scene.w, 1), (box.height - top - 2 * margin) / Math.max(d.scene.h, 1), 1.25);
  state.viewport = { k, x: (box.width - d.scene.w * k) / 2, y: top + (box.height - top - d.scene.h * k) / 2 };
  applyViewport();
}
function applyViewport() {
  const d = state.drawn, v = state.viewport;
  if (d && d.world && v) d.world.setAttribute("transform", "translate(" + v.x + "," + v.y + ") scale(" + v.k + ")");
}
function zoom(f, cx, cy) {
  const v = state.viewport, box = document.getElementById("canvas").getBoundingClientRect();
  if (!v) return;
  const x = cx === undefined ? box.width / 2 : cx, y = cy === undefined ? box.height / 2 : cy;
  const k = Math.max(0.15, Math.min(3, v.k * f));
  state.viewport = { k, x: x - (x - v.x) * k / v.k, y: y - (y - v.y) * k / v.k };
  applyViewport();
}

function parents() { return new Map(state.drawn.scene.nodes.map((n) => [n.id, n.parent])); }
function related(id) {
  const scene = state.drawn.scene, up = parents();
  const within = (x) => { for (let p = x; p; p = up.get(p)) if (p === id) return true; return false; };
  const nodes = new Set([id]), edges = new Set();
  for (const e of scene.edges) {
    if (within(e.s) || within(e.t)) { edges.add(e.id); nodes.add(e.s); nodes.add(e.t); }
  }
  for (const n of scene.nodes) if (within(n.id)) nodes.add(n.id);
  return { nodes, edges };
}
function applyFocus() {
  const d = state.drawn;
  if (!d) return;
  if (d.svg) {
    const focus = state.selected || state.hover;
    const r = focus ? related(focus) : null;
    d.svg.classList.toggle("md-focus", Boolean(r));
    for (const g of d.world.querySelectorAll(".md-node")) {
      g.classList.toggle("lit", Boolean(r && r.nodes.has(g.dataset.id)));
      g.classList.toggle("selected", g.dataset.id === state.selected);
    }
    for (const g of d.world.querySelectorAll(".md-edge")) g.classList.toggle("lit", Boolean(r && r.edges.has(g.dataset.id)));
  }
  const sheet = document.getElementById("sheet");
  for (const e of sheet.querySelectorAll("[data-id]")) e.classList.toggle("selected", e.dataset.id === state.selected);
  // A selected matrix column marks its cells.
  const column = sheet.querySelector("th.mx-col.selected"), c = column ? column.dataset.col : null;
  for (const e of sheet.querySelectorAll("td[data-col]")) e.classList.toggle("on", e.dataset.col === c);
}
function select(id, center) {
  state.selected = id;
  applyFocus();
  if (!id) { closeInspector(); return; }
  const n = state.drawn.scene && state.drawn.scene.nodes.find((x) => x.id === id);
  if (center && n) {
    const box = document.getElementById("canvas").getBoundingClientRect();
    const k = Math.max(state.viewport.k, 0.9);
    state.viewport = { k, x: box.width / 2 - (n.x + n.w / 2) * k, y: box.height / 2 - (n.y + n.h / 2) * k };
    applyViewport();
  } else if (center) reveal(id);
  const d = currentView().delta;
  const status = d && d.added.includes(id) ? "added" : d && d.changed.includes(id) ? "changed" : null;
  inspect(state.version, state.drawn.payload, id, status);
}
// Scrolls a table element into view, clearing the filter and unfolding the
// groups that hide it.
function reveal(id) {
  const sheet = document.getElementById("sheet");
  const find = () => [...sheet.querySelectorAll("[data-id]")].find((e) => e.dataset.id === id);
  if (!find() && (state.filter || state.folded.size)) {
    state.filter = "";
    state.folded.clear();
    renderTable(sheet, state.drawn.payload, currentView().delta);
    applyFocus();
  }
  const e = find();
  if (e) e.scrollIntoView({ block: "center", inline: "nearest" });
}

function closeInspector() {
  const box = document.getElementById("inspector");
  box.hidden = true;
  box.parentElement.classList.remove("inspecting");
}
function inspect(vi, view, id, status) {
  const box = document.getElementById("inspector");
  const n = headOf(view, id);
  const info = view.elements[id] || { a: [], s: [] };
  let refs = info.s.slice();
  if (!n) return;
  const close = button("×", () => select(null), "md-close");
  close.title = "Close";
  close.setAttribute("aria-label", "Close inspector");
  const h = el("h3", "", nameOf(n));
  if (n.type) h.append(el("span", "", n.type));
  const parts = [close, el("p", "md-kicker", n.kw || n.shape), h];
  if (status) parts.push(el("span", "md-status " + status, status === "removed" ? "removed since " + when(versions[vi]) : status + " since " + when(versions[vi + 1])));
  if (info.a.length) {
    const dl = el("dl");
    for (const [k, v] of info.a) dl.append(el("dt", "", k), el("dd", "", v));
    parts.push(dl);
  }
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
          el("span", "md-other", o ? nameOf(o) : other));
        const li = el("li");
        li.append(b);
        ul.append(li);
        if (view.elements[e.id]) refs = refs.concat(view.elements[e.id].s.filter((s) => !refs.some((x) => x.join() === s.join())));
      }
      parts.push(el("p", "md-kicker", "Relationships · " + rel.length), ul);
    }
  }
  if (refs.length) {
    parts.push(el("p", "md-kicker", "SysML"));
    for (const [file, from, to] of refs) {
      const src = el("div", "md-src");
      const b = button(file + ":" + from + (to > from ? "–" + to : ""), () => showLines(vi, file, from, to));
      b.title = "Show in Files";
      const lines = fileText(vi, file).split("\n").slice(from - 1, to);
      const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length));
      src.append(b, sysml(lines.map((l) => l.slice(indent)).join("\n")));
      parts.push(src);
    }
  }
  box.replaceChildren(...parts);
  box.hidden = false;
  box.parentElement.classList.add("inspecting");
  const canvas = document.getElementById("canvas").getBoundingClientRect();
  const v = state.viewport;
  box.classList.toggle("is-left", Boolean(vi === state.version && n.w && v && v.x + (n.x + n.w / 2) * v.k > canvas.width / 2 + 120));
}
function showLines(vi, file, from, to) {
  state.version = vi;
  state.tab = "files";
  state.file = file;
  state.range = [from, to];
  render();
}

// ---- Tables
function renderTable(box, view, delta) {
  if (view.table.kind === "matrix") renderMatrix(box, view.table, marker(delta));
  else renderElements(box, view, view.table, marker(delta));
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
  for (const [g, text] of [["h", "host"], ["s", "sandbox"], ["b", "both"]]) {
    const k = el("span", "tb-key");
    k.append(glyph(g), text);
    bar.append(k);
  }
  bar.append(el("span", "tb-note", "SysML allocation matrix: each cell is an agent's ToolGrant"));
  const table = el("table", "mx" + (t.columns.length > 8 ? " narrow" : ""));
  const head = el("tr");
  head.append(el("th", "mx-corner", "tool ↓ · allocated to agent →"));
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
    const q = state.filter.trim().toLowerCase();
    const hit = t.rows.map((r) => !q || [r, ...up(r).map((a) => t.rows[a])].some((x) => x.name.toLowerCase().includes(q)));
    const show = hit.slice();
    t.rows.forEach((r, i) => { if (hit[i]) for (const a of up(r)) show[a] = true; });
    tbody.replaceChildren(...t.rows.flatMap((r, i) => {
      if (!show[i] || !q && up(r).some((a) => state.folded.has(t.rows[a].id))) return [];
      const tr = el("tr", (r.shape === "tool" ? "mx-tool" : "mx-group") + " d" + r.depth + (r.muted ? " muted" : "") + (r.dashed ? " dashed" : "") + mark(r.id));
      const th = el("th");
      th.dataset.id = r.id;
      th.tabIndex = 0;
      if (r.shape !== "tool") {
        const open = !state.folded.has(r.id);
        const fold = button(open ? "▾" : "▸", (e) => { e.stopPropagation(); if (open) state.folded.add(r.id); else state.folded.delete(r.id); rows(); }, "mx-fold");
        fold.setAttribute("aria-expanded", String(open));
        fold.setAttribute("aria-label", (open ? "Collapse " : "Expand ") + r.name);
        th.append(fold);
        if (r.kw) th.append(el("span", "mx-kw", r.kw));
      }
      th.append(el("span", "mx-name", r.name));
      if (r.type && r.shape !== "tool") th.append(el("span", "mx-type", r.type));
      tr.append(th);
      t.columns.forEach((c, j) => {
        const td = el("td");
        td.dataset.col = String(j);
        const cell = cells[i].get(j);
        if (cell) {
          td.dataset.id = cell[1];
          td.className = mark(cell[1]).trim();
          td.title = r.name + " · " + c.title + " · " + GLYPH_WORDS[cell[0]];
          td.append(glyph(cell[0]));
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
      const b = button((v === null ? "all" : v) + " " + n, () => { state.facet = v; renderElements(box, view, t, mark); applyFocus(); });
      b.setAttribute("aria-pressed", String(state.facet === v));
      return b;
    }));
  }
  const text = (r, c) => c < 0 ? r.name : r.values[c];
  const table = el("table", "et"), head = el("tr"), tbody = el("tbody");
  [-1, ...t.columns.keys()].forEach((c) => {
    const sorted = state.sort && state.sort.col === c;
    const th = button(c < 0 ? "name" : t.columns[c], () => {
      state.sort = sorted && state.sort.dir > 0 ? { col: c, dir: -1 } : sorted ? null : { col: c, dir: 1 };
      renderElements(box, view, t, mark);
      applyFocus();
    });
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
      (!q || [r.name, ...r.values].some((v) => v.toLowerCase().includes(q))));
    if (state.sort) shown.sort((a, b) => state.sort.dir * text(a, state.sort.col).localeCompare(text(b, state.sort.col), "en", { numeric: true }));
    tbody.replaceChildren(...shown.map((r) => {
      const tr = el("tr", (r.muted ? "muted" : "") + mark(r.id));
      tr.dataset.id = r.id;
      tr.tabIndex = 0;
      const name = el("td", "et-name");
      if (r.title) name.append(el("span", "", r.title), el("small", "", r.name));
      else name.textContent = r.name;
      tr.append(name, ...r.values.map((v, c) => el("td", (wraps[c] ? "et-wrap" : "") + (c === facet ? " et-facet" : ""), v)));
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
        const b = button(file + ":" + from + (to > from ? "–" + to : ""), (e) => { e.stopPropagation(); showLines(state.version, file, from, to); });
        b.title = "Show in Files";
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
function summary(view, head, mark) {
  const box = el("div", "et-sum" + mark(head.id));
  box.dataset.id = head.id;
  box.tabIndex = 0;
  for (const [k, v] of view.elements[head.id].a) {
    const tile = el("div");
    tile.append(el("span", "", k), el("strong", "", v));
    box.append(tile);
  }
  return box;
}

// ---- Files and changes
function renderFiles() {
  const v = versions[state.version], names = Object.keys(v.files), box = document.getElementById("files");
  if (!names.includes(state.file)) state.file = names[0];
  const nav = el("nav", "files");
  for (const n of names) {
    const b = el("button", n === state.file ? "on" : "", n);
    b.onclick = () => { state.file = n; state.range = null; render(); };
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
function renderChanges() {
  const v = versions[state.version], previous = versions[state.version + 1], box = document.getElementById("changes");
  const head = el("h2", "", when(v) + " UTC" + (previous ? " — since " + when(previous) : ""));
  if (!v.changes) return box.replaceChildren(head, el("p", "muted", "First version: nothing to compare."));
  if (!v.changes.length) return box.replaceChildren(head, el("p", "muted", "No file changed since the previous version."));
  box.replaceChildren(head, ...v.changes.map((c) => {
    const lines = c.hunks.flatMap((h) => h.lines);
    const added = lines.filter((l) => l[0] === "+").length, removed = lines.filter((l) => l[0] === "-").length;
    const section = el("section");
    section.append(el("h3", "", c.file + " — " + c.status + "  +" + added + " −" + removed));
    const diff = el("div", "diff");
    for (const h of c.hunks) {
      diff.append(el("div", "hunk", h.header));
      for (const l of h.lines) diff.append(el("div", l[0] === "+" ? "add" : l[0] === "-" ? "del" : "", l));
    }
    section.append(diff);
    return section;
  }));
}

function render(keepViewport) {
  renderHeader();
  if (state.tab === "diagrams") renderDiagram(keepViewport);
  else if (state.tab === "files") renderFiles();
  else renderChanges();
  writeHash();
}

// ---- Events
document.getElementById("version").onchange = (e) => { state.version = +e.target.value; state.range = null; render(true); };
document.getElementById("view").onchange = (e) => { state.view = e.target.value; render(); };
for (const b of document.querySelectorAll(".tabs button")) b.onclick = () => { state.tab = b.dataset.tab; render(true); };
document.getElementById("fit").onclick = fit;
document.getElementById("zoom-in").onclick = () => zoom(1.25);
document.getElementById("zoom-out").onclick = () => zoom(0.8);
const canvas = document.getElementById("canvas");
let drag = null;
canvas.addEventListener("wheel", (e) => {
  if (!state.viewport) return;
  e.preventDefault();
  const box = canvas.getBoundingClientRect();
  if (e.ctrlKey || e.metaKey) zoom(Math.exp(-e.deltaY * 0.01), e.clientX - box.left, e.clientY - box.top);
  else { state.viewport = { ...state.viewport, x: state.viewport.x - e.deltaX, y: state.viewport.y - e.deltaY }; applyViewport(); }
}, { passive: false });
canvas.addEventListener("pointerdown", (e) => {
  if (e.target.closest(".md-node") || !state.viewport) return;
  drag = { x: e.clientX, y: e.clientY, from: state.viewport };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (!drag) return;
  state.viewport = { ...drag.from, x: drag.from.x + e.clientX - drag.x, y: drag.from.y + e.clientY - drag.y };
  applyViewport();
});
canvas.addEventListener("pointerup", (e) => {
  const d = drag;
  drag = null;
  if (d && Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) < 3) select(null);
});
canvas.addEventListener("pointercancel", () => { drag = null; });
canvas.addEventListener("click", (e) => {
  const g = e.target.closest(".md-node");
  if (g) select(g.dataset.id, false);
});
canvas.addEventListener("pointerover", (e) => {
  const g = e.target.closest(".md-node.leaf");
  const id = g ? g.dataset.id : null;
  if (id !== state.hover) { state.hover = id; applyFocus(); }
});
canvas.addEventListener("keydown", (e) => {
  const g = e.target.closest && e.target.closest(".md-node");
  if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); select(g.dataset.id, false); return; }
  const v = state.viewport;
  if (e.key === "Escape") select(null);
  else if (e.key === "0") fit();
  else if (e.key === "+" || e.key === "=") zoom(1.25);
  else if (e.key === "-") zoom(0.8);
  else if (v && e.key.startsWith("Arrow")) {
    state.viewport = { ...v, x: v.x + (e.key === "ArrowLeft" ? 40 : e.key === "ArrowRight" ? -40 : 0), y: v.y + (e.key === "ArrowUp" ? 40 : e.key === "ArrowDown" ? -40 : 0) };
    applyViewport();
  } else return;
  e.preventDefault();
});
const sheet = document.getElementById("sheet");
sheet.addEventListener("click", (e) => {
  const x = e.target.closest("[data-id]");
  if (x) select(x.dataset.id, false);
});
sheet.addEventListener("keydown", (e) => {
  const x = e.target.closest("[data-id]");
  if (x && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); select(x.dataset.id, false); }
  else if (e.key === "Escape") select(null);
});
window.addEventListener("resize", () => { if (state.tab === "diagrams") fit(); });
window.addEventListener("hashchange", () => { readHash(); render(); });
readHash();
render();
</script>
</body>
</html>
`;
