# Harpy

Diagrams in Mermaid syntax that unfold step by step. Each step reveals part of the diagram and
comes with a Markdown description, and a final summary step shows the whole picture. Harpy draws
diagrams with its own renderer, in its own visual style: colour-coded responsibilities, right-angled
connectors, and a night and a parchment theme.

## Usage

No build step. Import the module and write a `<harpy-diagram>`:

```html
<script type="module" src="harpy/src/harpy.js"></script>

<harpy-diagram>
  <script type="text/harpy">
    # Checkout flow

    ```harpy
    flowchart LR
    %% @step cart "Filling the cart"
      subgraph FE [Storefront]
        U([Customer]) --> C[Cart]
      end
    %% @step pay "Paying" focus=P
      C --> P{Payment OK?}
      P -->|yes| O[Create order]
    ```

    ## cart
    The customer adds items. Nothing is persisted yet.

    ## pay
    The payment provider answers synchronously.

    ## summary
    The flow stays stateless until **Create order**.
  </script>
</harpy-diagram>
```

dagre (flowchart layout), the web fonts, marked and DOMPurify load from CDNs the first time a
diagram renders. Open `examples/index.html` through a local web server to try it
(`python3 -m http.server`, then `/examples/`). Module scripts don't load over `file://`.

## Document format

- **Diagram**: a fenced ` ```harpy ` or ` ```mermaid ` block. A document without a fence is treated as a bare diagram.
- **Steps**: `%% @step <id> "Title" [options]` lines inside the diagram. They are Mermaid comments,
  so the source is still valid Mermaid. Everything declared after a marker appears at that step and stays.
  Content before the first marker belongs to the first step.
- **Descriptions**: `## <id>` sections after the diagram. `## Some title {#id}` sets the title too,
  and a heading that matches a step title also works.
- **Summary**: `## summary` describes the final step, which shows the full diagram.
- **Title and intro**: an optional `# Title` and text before the fence are shown in the header.

Step options take comma-separated references: node, subgraph and edge ids (`A e1@--> B`), `A-->B`,
participant ids or names, box names.

| Option | Effect |
| --- | --- |
| `focus=P,C` | Highlights these elements. Without it, the step's new elements are highlighted. |
| `show=X` | Reveals an element earlier than it is declared. |
| `hide=X` | Hides an element from this step on. |

### Colours and groups

Colours mark responsibilities. The palette is `bronze` (neutral), `verdigris`, `lapis`,
`terracotta`, `porphyry` and `laurel`.

- Each top-level flowchart `subgraph` and each sequence `box` gets the next palette colour, and the
  nodes and participants inside take it on. Messages are drawn in the sender's colour.
- Choose a colour with a class: `class API lapis`, `DB[(Orders)]:::verdigris`, or `box lapis Client`.
  Unknown classes are ignored, so the source still renders in Mermaid.
- Sequence participants can be typed: `participant D@{ "type": "database" } as Users DB`, or `actor U`.

### Supported syntax

- **Flowchart** (`flowchart` / `graph`, any direction): all node shapes including `A@{ shape: cyl }`,
  chains, `&`, edge ids, `|labels|` and inline labels, solid / dotted / thick / invisible edges, arrow,
  circle and cross heads, edge length, nested subgraphs, `classDef`, `class`, `:::class`, `style`.
- **Sequence** (`sequenceDiagram`): participants, actors, typed participants, `create participant`,
  `box`, all arrow types, `+`/`-` activation and `activate`/`deactivate`, notes, `loop`, `alt`/`else`,
  `opt`, `par`/`and`, `critical`/`option`, `break`, `rect`, `autonumber`.

Syntax errors are reported with the line number. Other Mermaid diagram types are not supported yet.

## Element

| Attribute | Values |
| --- | --- |
| `mode` | `preview` (default) or `split`: source editor side by side with live preview |
| `src` | Load the document from a URL instead of the inline `<script type="text/harpy">` |
| `theme` | `auto` (default, follows the system), `light` (parchment), `dark` (night) |
| `no-dim` | Don't fade earlier steps |

JavaScript: `el.source`, `el.mode`, `el.step`, `el.steps`, `el.next()`, `el.prev()`, `el.goTo(indexOrId)`.
Events: `harpy-step` (`{ index, id, summary }`) and `harpy-change` (`{ source }`, fired when the source is edited).
Keyboard: `←` `→` `Home` `End` while the diagram has focus. The play button steps through automatically.

CSS custom properties: `--harpy-accent`, `--harpy-max-height`, `--harpy-dim-opacity`.

To self-host the dependencies:

```js
import { configure } from './harpy/src/harpy.js';
configure({ dagreUrl: '/vendor/dagre.esm.js', fonts: '/fonts.css', markedUrl: '...', purifyUrl: '...' });
// or pass a module: configure({ dagre })
```

## How it works

1. `source.js` splits the document into the diagram, step markers and descriptions.
2. `diagram/` parses Mermaid flowchart and sequence syntax into a model. Every element records the
   line it was declared on, which assigns it to a step.
3. `layout/` places everything. Flowcharts use dagre for node and subgraph placement, then Harpy
   routes edges at right angles with bends between ranks. Sequence layout is Harpy's own.
4. `render/` draws SVG. Every element belongs to a unit (`node:A`, `edge:e1`, `msg:msg-3`...).
5. `player.js` sets each unit's state per step (hidden, current, past) and draws edges in.
6. `component.js` is the `<harpy-diagram>` web component.

## Website

`docs/index.html` is the project homepage, using the live component. `docs/src` is a symlink to
`src/` for local development. `.github/workflows/pages.yml` copies the library in and publishes `docs/`;
enable it under Settings → Pages → Source: GitHub Actions.

## Development

```sh
npm install
npm test            # parser and layout unit tests (node:test)
npm run test:e2e    # drives examples/index.html in Chromium; needs network for the CDNs
```

`CHROMIUM_PATH=/path/to/chrome` picks a specific browser, and `SCREENSHOTS=dir` saves screenshots.
