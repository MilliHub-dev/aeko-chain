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
      assert.equal(docsPagesById[pageId].section, section.id, `${pageId} page.section must match ${section.id}`);
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
    /verified public surface|verified node exports|verified client methods|verified crate scope|verified program family/i,
    /current evidence|inspected external|this portal intentionally|source of truth/i,
    /coming soon|being updated|check back soon|todo:/i,
  ];
  for (const pattern of forbidden) {
    assert.doesNotMatch(content, pattern, `public docs leaked internal reference matching ${pattern}`);
  }
});

test('public copy describes developer capabilities instead of documentation derivation', () => {
  const content = JSON.stringify({ sections: docsSections, pages: docsPages });
  const forbiddenDerivationLanguage = [
    /methods exercised by current SDKs/i,
    /implemented instruction areas/i,
    /implemented program actions/i,
    /implemented instruction families/i,
    /implemented NFT lifecycle/i,
    /implemented AEKO-20 action surface/i,
    /historical draft/i,
    /older material/i,
    /draft service routes/i,
    /trace in source and tests/i,
    /current client code/i,
    /current implementation/i,
    /reference implementation/i,
    /checked-in fast installer/i,
    /documentation snippets/i,
    /throughout these docs/i,
    /socialfi prose/i,
    /conceptual material|informal examples/i,
  ];

  for (const pattern of forbiddenDerivationLanguage) {
    assert.doesNotMatch(
      content,
      pattern,
      `public docs must describe the product contract, not derivation language matching ${pattern}`,
    );
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
  assert.match(docsPage, /mobileMenuTriggerRef/);
  assert.match(docsPage, /mobileMenuPanelRef/);
  assert.match(docsPage, /event\.key === 'Escape'/);
  assert.match(docsPage, /event\.key !== 'Tab'/);
  assert.match(docsPage, /tabIndex=\{-1\}/);
});

test('legacy monolithic docs payload remains removed', async () => {
  await assert.rejects(
    source('data/docs.json'),
    (error) => error?.code === 'ENOENT',
    'legacy data/docs.json should stay removed once structured docs are active',
  );
});


test('docs page shell moves keyboard context with guide navigation', async () => {
  const docsPage = await source('pages/Docs.jsx');

  assert.match(docsPage, /Skip to documentation content/);
  assert.match(docsPage, /href="#developer-docs-content"/);
  assert.match(docsPage, /pageTitleRef/);
  assert.match(docsPage, /tabIndex=\{-1\}/);
  assert.match(docsPage, /pageTitleRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(docsPage, /document\.title = .*AEKO Developer Docs/);
  assert.match(docsPage, /restoreMobileTriggerRef/);
  assert.match(docsPage, /if \(isMobileMenuOpen\) restoreMobileTriggerRef\.current = false/);
});


test('phase 5 developer journeys are migrated as task-oriented guides', () => {
  const expected = [
    ['smart-contracts', 'build-sbf', 'available'],
    ['wallets-permissions', 'transaction-signing', 'available'],
    ['tokens-nfts', 'asset-metadata', 'available'],
    ['protocol-concepts', 'transaction-lifecycle', 'available'],
  ];

  for (const [sectionId, pageId, status] of expected) {
    const section = docsSections.find((item) => item.id === sectionId);
    const page = docsPagesById[pageId];
    assert.ok(section?.items.includes(pageId), `${pageId} must be reachable from ${sectionId}`);
    assert.equal(page?.status, status, `${pageId} must keep its public capability status`);
    assert.ok(page?.prerequisites?.length > 0, `${pageId} requires prerequisites`);
    assert.ok(page?.outcomes?.length > 0, `${pageId} requires expected outcomes`);
    assert.ok(page?.blocks?.length >= 3, `${pageId} requires a complete task guide`);
  }

  assert.ok(docsPagesById['build-sbf'].blocks.some((block) => block.type === 'steps'));
  assert.ok(docsPagesById['transaction-signing'].blocks.some((block) => block.type === 'code'));
  assert.ok(docsPagesById['asset-metadata'].blocks.some((block) => block.type === 'table'));
  assert.ok(docsPagesById['transaction-lifecycle'].blocks.some((block) => block.type === 'steps'));
});


test('browser signing guide scopes injected-wallet Mainnet support', () => {
  const page = docsPagesById['transaction-signing'];
  const serialized = JSON.stringify(page);
  assert.match(serialized, /Testnet flow/);
  assert.match(serialized, /before Mainnet/i);
  assert.match(serialized, /wallet explicitly supports the production network/i);
});
