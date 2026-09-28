import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  docsPageOrder,
  docsPages,
  docsPagesById,
  docsSections,
  getDocsPageOutline,
  getDocsStatus,
} from '../data/docs/index.js';

const root = new URL('../', import.meta.url);

async function source(filePath) {
  return readFile(new URL(filePath, root), 'utf8');
}

test('documentation navigation resolves every page exactly once', () => {
  const pageIds = docsPages.map((page) => page.id);
  assert.equal(new Set(pageIds).size, pageIds.length, 'page ids must be unique');
  assert.equal(new Set(docsPageOrder).size, docsPageOrder.length, 'navigation ids must be unique');
  assert.deepEqual(new Set(docsPageOrder), new Set(pageIds));

  for (const section of docsSections) {
    assert.ok(section.id, 'section id is required');
    assert.ok(section.title, `section ${section.id} must have a title`);
    assert.ok(section.items.length > 0, `section ${section.id} must contain pages`);
    for (const pageId of section.items) {
      assert.ok(docsPagesById[pageId], `section ${section.id} references missing page ${pageId}`);
    }
  }
});

test('documentation pages have meaningful structured content and valid relationships', () => {
  const allowedStatuses = new Set(['available', 'testnet', 'local', 'operator', 'design']);
  for (const page of docsPages) {
    assert.ok(page.title, `${page.id} must have a title`);
    assert.ok(page.summary, `${page.id} must have a summary`);
    assert.ok(allowedStatuses.has(page.status), `${page.id} has unknown status ${page.status}`);
    assert.ok(page.blocks?.length > 0, `${page.id} must have content blocks`);
    assert.ok(getDocsStatus(page.status)?.label, `${page.id} status must render a label`);
    assert.equal(Object.prototype.hasOwnProperty.call(page, 'sources'), false, `${page.id} must not expose source metadata`);
    for (const relatedId of page.related || []) {
      assert.ok(docsPagesById[relatedId], `${page.id} references missing related page ${relatedId}`);
    }
  }
});

test('public documentation never exposes internal repository or file references', () => {
  const content = JSON.stringify({ sections: docsSections, pages: docsPages });
  const forbidden = [
    /CLAUDE\.md/i,
    /README\.md/i,
    /\b[^\s"']+\.md\b/i,
    /\b(?:apps|programs|docs|contracts|scripts|src)\//i,
    /\b(?:monorepo|repository|codebase|markdown)\b/i,
    /raw\.githubusercontent\.com/i,
    /github\.com\/[^\s"']+\/(?:blob|tree)\//i,
    /implementation references|edit docs source|source policy/i,
    /coming soon|being updated|check back soon|todo:/i,
  ];
  for (const pattern of forbidden) {
    assert.doesNotMatch(content, pattern, `public docs leaked internal reference matching ${pattern}`);
  }
});

test('on-page outline ids are stable and unique within each page', () => {
  for (const page of docsPages) {
    const outline = getDocsPageOutline(page);
    const ids = outline.map((item) => item.id);
    assert.equal(new Set(ids).size, ids.length, `${page.id} has duplicate outline anchors`);
    for (const item of outline) {
      assert.ok(item.id, `${page.id} outline item requires an id`);
      assert.ok(item.title, `${page.id} outline item requires a title`);
    }
  }
});

test('planned policy and security guides remain explicit and status-scoped', () => {
  assert.equal(docsPagesById['public-mint'].status, 'operator');
  assert.equal(docsPagesById['program-security'].status, 'available');
  assert.equal(docsPagesById['anti-spam'].status, 'operator');
  assert.equal(docsPagesById['bridge-status'].status, 'design');
  assert.equal(docsPagesById['creator-coins'].status, 'design');
  assert.equal(docsPagesById['governance-status'].status, 'design');
});

test('Explorer API endpoint surface remains public and copyable', async () => {
  const serialized = JSON.stringify(docsPages);
  assert.match(serialized, /\{\{explorerApiUrl\}\}/);
  assert.match(serialized, /Explorer API/);
  const panel = await source('components/NetworkToolsPanel.jsx');
  const renderer = await source('components/docs/DocsContent.jsx');
  assert.match(panel, /label="Explorer API"/);
  assert.match(panel, /config\.explorerApiUrl/);
  assert.match(renderer, /explorerApiUrl/);
});

test('renderer and page shell do not expose implementation-source UI', async () => {
  const renderer = await source('components/docs/DocsContent.jsx');
  const docsPage = await source('pages/Docs.jsx');
  assert.doesNotMatch(renderer, /GitHubSourceLink|page\.sources|Implementation references|github\.com\/MilliHub-dev/);
  assert.doesNotMatch(docsPage, /Edit docs source|Source policy|github\.com\/MilliHub-dev|implementation source/i);
  assert.doesNotMatch(docsPage, /dangerouslySetInnerHTML|docs\.json/);
});

test('legacy monolithic docs payload remains removed', async () => {
  await assert.rejects(
    source('data/docs.json'),
    (error) => error?.code === 'ENOENT',
    'legacy data/docs.json should stay removed once structured docs are active',
  );
});
