import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDiagram, assignSteps, aliases, resolveRefs } from '../src/diagram/index.js';
import { parseDocument } from '../src/source.js';

const edgesOf = (m) => m.edges.map((e) => `${e.from}${e.type === 'dotted' ? '-.' : e.type === 'thick' ? '==' : '--'}${e.endHead ?? ''}${e.startHead ? '<' : ''}${e.from === e.to ? '' : ''}${e.to}${e.label ? `|${e.label}|` : ''}`);

test('flowchart: shapes, labels and direction', () => {
  const m = parseDiagram(`flowchart LR
    A([Start]) --> B[(Database)]
    C{"Is it?"} --> D{{Hex}}
    E[/In/] --> F[\\Out\\] --> G[/Trap\\]
    H((Circle)) --- I(((Done)))
    J>Flag] --> K[[Sub]]
    L@{ shape: cyl, label: "Store" }`);
  assert.equal(m.direction, 'LR');
  const shape = (id) => m.nodes.get(id).shape;
  assert.deepEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'].map(shape),
    ['stadium', 'cylinder', 'diamond', 'hexagon', 'lean-right', 'lean-left', 'trapezoid', 'circle', 'doublecircle', 'asymmetric', 'subroutine', 'cylinder']);
  assert.equal(m.nodes.get('C').label, 'Is it?');
  assert.equal(m.nodes.get('L').label, 'Store');
});

test('flowchart: edge kinds, labels, chains, & and ids', () => {
  const m = parseDiagram(`graph TD
    A -->|yes| B
    A -- no --> C
    A -.-> D -. maybe .-> E
    A ==> F == big ==> G
    A --o H
    A --x I
    A <--> J
    A ~~~ K
    A ---> L
    M & N --> O & P
    Q e1@--> R
    A-->B`);
  const byPair = (a, b) => m.edges.filter((e) => e.from === a && e.to === b);
  assert.equal(byPair('A', 'B')[0].label, 'yes');
  assert.equal(byPair('A', 'C')[0].label, 'no');
  assert.equal(byPair('A', 'D')[0].type, 'dotted');
  assert.equal(byPair('D', 'E')[0].label, 'maybe');
  assert.equal(byPair('F', 'G')[0].type, 'thick');
  assert.equal(byPair('F', 'G')[0].label, 'big');
  assert.equal(byPair('A', 'H')[0].endHead, 'circle');
  assert.equal(byPair('A', 'I')[0].endHead, 'cross');
  assert.equal(byPair('A', 'J')[0].startHead, 'arrow');
  assert.equal(byPair('A', 'K')[0].type, 'invisible');
  assert.equal(byPair('A', 'L')[0].length, 2);
  assert.equal(m.edges.filter((e) => e.to === 'O' || e.to === 'P').length, 4);
  assert.equal(byPair('Q', 'R')[0].id, 'e1');
  assert.deepEqual(byPair('A', 'B').map((e) => e.id), ['L_A_B_0', 'L_A_B_1']);
});

test('flowchart: subgraphs, roles and classes', () => {
  const m = parseDiagram(`flowchart LR
    subgraph FE [Frontend]
      UI[Web app]
    end
    subgraph BE [Backend]
      API --> SVC
      subgraph Inner
        W[Worker]
      end
    end
    DB[(Postgres)]:::lapis
    UI --> API --> DB
    class BE terracotta
    classDef hot stroke:#f00
    class W hot`);
  assert.equal(m.groups.get('FE').title, 'Frontend');
  assert.equal(m.groups.get('Inner').parent, 'BE');
  assert.equal(m.nodes.get('UI').group, 'FE');
  assert.equal(m.nodes.get('W').group, 'Inner');
  assert.equal(m.groups.get('BE').role, 'terracotta');
  assert.equal(m.groups.get('Inner').role, 'terracotta');
  assert.notEqual(m.groups.get('FE').role, 'terracotta');
  assert.equal(m.nodes.get('API').role, 'terracotta');
  assert.equal(m.nodes.get('DB').role, 'lapis');
  assert.equal(m.nodes.get('W').style.stroke, '#f00');
  assert.ok(!m.nodes.has('BE'));
});

test('flowchart: errors point at the line', () => {
  assert.throws(() => parseDiagram('flowchart LR\n  A --> B\n  subgraph X\n  C'), /Line 3: Subgraph "X" is never closed/);
  assert.throws(() => parseDiagram('flowchart LR\n  A --> '), /Line 2: Expected a node after the edge/);
  assert.throws(() => parseDiagram('classDiagram\n  A <|-- B'), /flowchart.*sequenceDiagram.*classDiagram/);
});

test('sequence: participants, boxes, messages, notes, blocks', () => {
  const m = parseDiagram(`sequenceDiagram
    autonumber
    box lapis Frontend
      actor U as User
      participant B as Browser
    end
    box Backend
      participant A as API
      participant D@{ "type": "database" } as Postgres
    end
    U->>B: click
    B->>+A: POST /login
    A->>D: query
    D-->>A: rows
    Note over A,D: all inside the VPC
    alt ok
      A-->>-B: 200
    else nope
      A--xB: 401
    end
    loop every 5s
      B-)A: ping
    end
    A->>A: self`);
  assert.deepEqual([...m.participants.keys()], ['U', 'B', 'A', 'D']);
  assert.equal(m.participants.get('U').type, 'actor');
  assert.equal(m.participants.get('D').type, 'database');
  assert.equal(m.participants.get('D').label, 'Postgres');
  assert.equal(m.boxes[0].role, 'lapis');
  assert.equal(m.boxes[1].label, 'Backend');
  assert.notEqual(m.boxes[1].role, 'lapis');
  assert.equal(m.participants.get('A').role, m.boxes[1].role);
  const msgs = m.events.filter((e) => e.kind === 'message');
  assert.deepEqual(msgs.map((e) => e.number), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(msgs[1].activate, true);
  assert.equal(msgs[4].deactivate, true);
  assert.equal(msgs[3].dotted, true);
  assert.equal(msgs[5].head, 'cross');
  assert.equal(msgs[6].head, 'open');
  assert.deepEqual(m.events.filter((e) => e.kind.startsWith('block')).map((e) => e.kind), ['block-start', 'block-branch', 'block-end', 'block-start', 'block-end']);
  assert.deepEqual(m.events.find((e) => e.kind === 'note').actors, ['A', 'D']);
});

test('sequence: errors', () => {
  assert.throws(() => parseDiagram('sequenceDiagram\n  loop x\n  A->>B: y'), /Line 2: "loop" is never closed/);
  assert.throws(() => parseDiagram('sequenceDiagram\n  else x'), /Line 2: "else" is only allowed inside "alt"/);
  assert.throws(() => parseDiagram('sequenceDiagram\n  A >> B'), /Line 2: Could not understand/);
});

test('steps come from the marker above each declaration', () => {
  const doc = parseDocument(`flowchart LR
  X
%% @step a
  A --> B
%% @step b focus=A-->B,Y
  B --> C`);
  const m = parseDiagram(doc.diagram);
  const steps = assignSteps(m, doc.steps);
  assert.deepEqual(steps, [['node:X', 'node:A', 'edge:L_A_B_0', 'node:B'], ['edge:L_B_C_0', 'node:C']]);
  const warnings = [];
  assert.deepEqual(resolveRefs(doc.steps[1].focus, aliases(m), warnings, 'b'), ['edge:L_A_B_0']);
  assert.equal(warnings.length, 1);
});
