import { test } from 'node:test';
import assert from 'node:assert/strict';
import dagre from '@dagrejs/dagre';
import { parseDiagram } from '../src/diagram/index.js';
import { createMeasurer } from '../src/layout/text.js';
import { layoutFlowchart } from '../src/layout/flowchart.js';
import { layoutSequence } from '../src/layout/sequence.js';

const measure = createMeasurer(); // estimates widths outside the browser

const finite = (...vals) => vals.every(Number.isFinite);

for (const dir of ['LR', 'TB', 'RL', 'BT']) {
  test(`flowchart ${dir}: edges are orthogonal and everything fits the canvas`, () => {
    const model = parseDiagram(`flowchart ${dir}
      subgraph A [Front]
        U([User]) --> C[Cart]
      end
      subgraph B [Back]
        C --> P{Pay?}
        P -->|yes| O[Order]
        P -->|no| R[Error]
      end
      R -.-> C
      O --> D[(DB)]
      O --> O`);
    const l = layoutFlowchart(model, { dagre, measure });
    assert.ok(l.width > 0 && l.height > 0);
    for (const n of l.nodes) {
      assert.ok(finite(n.x, n.y, n.w, n.h));
      assert.ok(n.x - n.w / 2 >= 0 && n.x + n.w / 2 <= l.width && n.y - n.h / 2 >= 0 && n.y + n.h / 2 <= l.height, n.id);
    }
    for (const e of l.edges) {
      for (let i = 1; i < e.points.length; i++) {
        const a = e.points[i - 1];
        const b = e.points[i];
        assert.ok(Math.abs(a.x - b.x) < 0.01 || Math.abs(a.y - b.y) < 0.01, `${e.id} segment ${i} is diagonal`);
      }
    }
    for (const g of l.groups) {
      const members = [...model.nodes.values()].filter((n) => n.group === g.id).map((n) => l.nodes.find((x) => x.id === n.id));
      for (const n of members) assert.ok(n.x - n.w / 2 >= g.x && n.x + n.w / 2 <= g.x + g.w, `${n.id} inside ${g.id}`);
    }
  });
}

test('sequence: columns leave room for labels, blocks wrap their messages', () => {
  const model = parseDiagram(`sequenceDiagram
    box lapis Client
      participant B as Browser
    end
    participant A as API
    participant D as Database
    B->>+A: a rather long request label that needs space
    loop retry
      A->>D: query
      D-->>A: rows
    end
    Note over A,D: note
    A->>A: self check
    A-->>-B: done`);
  const l = layoutSequence(model, { measure });
  const [b, a, d] = l.actors;
  const longLabel = l.messages[0].label.width;
  assert.ok(a.x - b.x >= longLabel + 30);
  const loop = l.blocks[0];
  const inLoop = l.messages.slice(1, 3);
  for (const m of inLoop) {
    assert.ok(m.y > loop.y && m.y < loop.y + loop.h);
    assert.ok(Math.min(m.x1, m.x2) >= loop.x && Math.max(m.x1, m.x2) <= loop.x + loop.w);
  }
  assert.equal(l.activations.length, 1);
  assert.ok(l.activations[0].h > 0);
  assert.ok(l.boxes[0].x <= b.x - b.w / 2);
  assert.ok(l.width >= d.x + d.w / 2);
});
