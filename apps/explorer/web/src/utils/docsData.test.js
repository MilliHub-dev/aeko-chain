import assert from 'node:assert/strict';
import test from 'node:test';
import {
  docsPageOrder,
  docsPages,
  docsPagesById,
  docsSections,
  getDocsPageOutline,
  getDocsStatus,
} from '../data/docs/index.js';

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

    for (const relatedId of page.related || []) {
      assert.ok(docsPagesById[relatedId], `${page.id} references missing related page ${relatedId}`);
    }

    for (const source of page.sources || []) {
      assert.ok(source.path, `${page.id} contains a source without a repository path`);
    }
  }
});

test('documentation contains no advertised placeholder copy', () => {
  const content = JSON.stringify(docsPages).toLowerCase();
  for (const phrase of ['coming soon', 'being updated', 'check back soon', 'todo:']) {
    assert.equal(content.includes(phrase), false, `placeholder phrase must not ship: ${phrase}`);
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
  const publicMint = docsPagesById['public-mint'];
  const programSecurity = docsPagesById['program-security'];
  const antiSpam = docsPagesById['anti-spam'];

  assert.equal(publicMint.status, 'operator');
  assert.equal(programSecurity.status, 'available');
  assert.equal(antiSpam.status, 'operator');
  assert.ok(docsSections.find((section) => section.id === 'tokens-nfts').items.includes('public-mint'));
  assert.ok(docsSections.find((section) => section.id === 'smart-contracts').items.includes('program-security'));
  assert.ok(docsSections.find((section) => section.id === 'socialfi').items.includes('anti-spam'));
});


test('removed Explorer API endpoint surface stays removed', () => {
  const serialized = JSON.stringify(docsPages);
  assert.doesNotMatch(serialized, /\{\{explorerApiUrl\}\}/);
  const visible = JSON.stringify(docsPages.map((page) => {
    const publicPage = { ...page };
    delete publicPage.id;
    delete publicPage.sources;
    return publicPage;
  }));
  assert.doesNotMatch(visible, /Explorer API/);
});
