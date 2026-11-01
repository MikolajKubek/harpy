# TODO

## Layout and rendering

- [ ] Route back edges (cycles such as *Show error → Cart*) around groups instead of across them
- [ ] Spread edge ports when several edges leave or enter the same side of a node
- [ ] Grow sequence activation bars step by step instead of showing them at full length
- [ ] Edges that start or end at a subgraph (`A --> Group`)
- [ ] `direction` inside subgraphs
- [ ] Wrap long sequence message labels and keep notes from overlapping messages
- [ ] Markdown in node labels (`"**bold** text"`)
- [ ] Optional bottom participant headers for long sequence diagrams
- [ ] Replace dagre with Harpy's own layered layout (smaller bundle, full control over groups)

## Diagram types

- [ ] Class diagrams
- [ ] State diagrams
- [ ] Entity relationship diagrams
- [ ] Timelines / journeys

## Stepping and narration

- [ ] Automatic steps: one step per sequence message when there are no markers
- [ ] Deep links to steps (`#checkout/pay`) and syncing the URL hash
- [ ] Zoom and pan to the focused part of large diagrams
- [ ] Presenter mode: fullscreen, larger narration, keyboard help overlay
- [ ] Configurable autoplay speed per diagram or per step
- [ ] Screen reader text that describes what each step adds

## Distribution

- [ ] Tag releases and document version-pinned CDN links (`@v0.2.0` instead of `@main`)
- [ ] CI: run unit and end-to-end tests, and check that `dist/` matches the sources
- [ ] Optionally inline the web fonts for a fully offline embedded build
- [ ] Export a step or the summary as SVG / PNG; record the steps as GIF or video
- [ ] CLI that renders a document to a standalone HTML file
- [ ] VS Code preview extension

## Website

- [ ] Syntax reference page and a gallery of examples
- [ ] Playground page with the side-by-side editor and shareable links
- [ ] Test corpus of real-world Mermaid snippets, compared against Harpy's parser
