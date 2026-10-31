# Harpy

Mermaid diagrams you can step through. Each step reveals part of the diagram and comes with a
Markdown description, and a final summary step shows the whole picture.

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
      U([Customer]) --> C[Cart]
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

Mermaid, marked and DOMPurify load from jsDelivr the first time a diagram renders.
Open `examples/index.html` through a local web server to see it in action (module scripts don't load over `file://`).

## Document format

- **Diagram**: a fenced ` ```harpy ` or ` ```mermaid ` block. A document without a fence is treated as a bare diagram.
- **Steps**: `%% @step <id> "Title" [options]` lines inside the diagram. They are Mermaid comments,
  so the diagram is still valid Mermaid. Everything after a marker appears at that step and stays visible.
  Content before the first marker belongs to the first step.
- **Descriptions**: `## <id>` sections after the diagram. `## Some title {#id}` sets the title too,
  and a heading that matches a step title also works.
- **Summary**: `## summary` describes the final step, which shows the full diagram.
- **Title and intro**: an optional `# Title` and text before the fence are shown in the header.

Step options take comma-separated element references: node and subgraph ids, edge ids (`A e1@--> B`),
`A-->B`, or sequence participant ids.

| Option | Effect |
| --- | --- |
| `focus=P,C` | Highlights these elements. Otherwise the step's new elements are emphasised. |
| `show=X` | Reveals an element earlier than it is declared. |
| `hide=X` | Hides an element from this step on. |

Previous steps are dimmed so the new part stands out.

## Element

| Attribute | Values |
| --- | --- |
| `mode` | `preview` (default) or `split`: source editor side by side with live preview |
| `src` | Load the document from a URL instead of the inline `<script type="text/harpy">` |
| `theme` | `auto` (default), `light`, `dark` |
| `mermaid-theme` | Any Mermaid theme; defaults to `default` / `dark` based on `theme` |
| `no-dim` | Don't fade earlier steps |

JavaScript: `el.source`, `el.mode`, `el.step`, `el.steps`, `el.next()`, `el.prev()`, `el.goTo(indexOrId)`.
Events: `harpy-step` (`{ index, id, summary }`) and `harpy-change` (`{ source }`, fired when the source is edited).
Keyboard: `←` `→` `Home` `End` while the diagram has focus.

CSS custom properties: `--harpy-accent`, `--harpy-max-height`, `--harpy-duration`, `--harpy-dim-opacity`.

To self-host the dependencies:

```js
import { configure } from './harpy/src/harpy.js';
configure({ mermaidUrl: '/vendor/mermaid.esm.min.mjs', markedUrl: '...', purifyUrl: '...' });
// or pass an instance: configure({ mermaid })
```

## How it works

1. `source.js` splits the document into the diagram, step markers and descriptions.
2. `mermaid-adapter.js` parses the diagram prefix visible at each step with Mermaid's own parser and diffs
   the results to find what each step introduces. It then renders the **full** diagram once, so the layout
   never moves between steps, and maps the elements to SVG nodes.
3. `player.js` toggles classes per step: hidden, dimmed, focused, new. Edges and messages draw themselves in.
4. `component.js` is the `<harpy-diagram>` web component.

Step animation supports **flowcharts** and **sequence diagrams**. Other Mermaid diagram types render and
show step descriptions, but display the whole diagram at every step. Sequence activation bars and `rect`
backgrounds are always visible.

## Development

```sh
npm install
npm test            # parser unit tests (node:test)
npm run test:e2e    # drives examples/index.html in Chromium; needs network for the CDN
```

`CHROMIUM_PATH=/path/to/chrome` picks a specific browser, and `SCREENSHOTS=dir` saves screenshots.

## Website

`docs/index.html` is the project homepage. Its diagrams are hand-drawn SVG in the visual style Harpy's own
renderer is aiming for. To publish it: GitHub → Settings → Pages → Deploy from a branch → `main`, folder `/docs`.
