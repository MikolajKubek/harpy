import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDocument, parseStepMarker, diagramPrefix, dedent } from '../src/source.js';

test('dedent strips common indentation and blank edges', () => {
  assert.equal(dedent('\n    a\n      b\n\n    c\n  \n'), 'a\n  b\n\nc');
});

test('a bare diagram has no descriptions', () => {
  const doc = parseDocument('flowchart LR\n%% @step one\nA --> B');
  assert.equal(doc.diagram, 'flowchart LR\n%% @step one\nA --> B');
  assert.equal(doc.title, null);
  assert.deepEqual(doc.steps.map((s) => [s.id, s.line]), [['one', 1]]);
});

test('step markers: id, quoted title, list options and extra options', () => {
  const s = parseStepMarker(` pay "Paying the bill" focus=P,C show=A-->B hide=X speed=slow`);
  assert.equal(s.id, 'pay');
  assert.equal(s.title, 'Paying the bill');
  assert.deepEqual(s.focus, ['P', 'C']);
  assert.deepEqual(s.show, ['A-->B']);
  assert.deepEqual(s.hide, ['X']);
  assert.deepEqual(s.options, { speed: 'slow' });
});

test('markers without ids get generated, duplicate ids are made unique', () => {
  const doc = parseDocument('graph TD\n%% @step\nA\n%% @step a\nB\n%% @step a\nC\n%% @step summary\nD');
  assert.deepEqual(doc.steps.map((s) => s.id), ['step-1', 'a', 'a-2', 'summary-step']);
  assert.equal(doc.steps[0].focus, null);
});

test('markdown document: title, intro, fenced diagram, sections and summary', () => {
  const doc = parseDocument(`
    # Checkout

    Intro *text*.

    \`\`\`harpy
    flowchart LR
    %% @step cart "Cart"
      A --> B
    %% @step pay
      B --> C
    \`\`\`

    ## cart
    About the **cart**.

    ### still part of cart

    ## Paying up {#pay}
    Pay text.

    ## Summary
    All of it.

    ## nope
    Orphan.
  `);
  assert.equal(doc.title, 'Checkout');
  assert.equal(doc.intro, 'Intro *text*.');
  assert.equal(doc.diagram, 'flowchart LR\n%% @step cart "Cart"\n  A --> B\n%% @step pay\n  B --> C');
  assert.equal(doc.descriptions.get('cart'), 'About the **cart**.\n\n### still part of cart');
  assert.equal(doc.descriptions.get('pay'), 'Pay text.');
  assert.equal(doc.steps[1].title, 'Paying up');
  assert.deepEqual(doc.summary, { title: null, body: 'All of it.' });
  assert.equal(doc.warnings.length, 1);
  assert.match(doc.warnings[0], /nope/);
});

test('sections can be matched by step title, and headings inside code blocks are ignored', () => {
  const doc = parseDocument('```mermaid\ngraph TD\n%% @step a "First part"\nA\n```\n## First part\n```\n## not a heading\n```\n');
  assert.equal(doc.descriptions.get('a'), '```\n## not a heading\n```');
});

test('longer closing fences close the diagram, shorter ones do not', () => {
  const doc = parseDocument('````harpy\ngraph TD\n```\nA\n`````\n## x\n');
  assert.equal(doc.diagram, 'graph TD\n```\nA');
});

test('diagramPrefix returns everything visible at a step', () => {
  const doc = parseDocument('graph TD\nX\n%% @step a\nA\n%% @step b\nB');
  assert.equal(diagramPrefix(doc.diagram, doc.steps, 0), 'graph TD\nX\n%% @step a\nA');
  assert.equal(diagramPrefix(doc.diagram, doc.steps, 1), doc.diagram);
});
