import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createEmptyProject,
  createStarterProject,
  deleteFile,
  exportProject,
  importProject,
  removeDeployment,
  normalizeEditorPath,
  renameFile,
  setFileContent,
  validateProjectFiles,
} from '../features/editor/project/project.js';

test('starter project is a valid native Rust AEKO project', () => {
  const project = createStarterProject();
  assert.equal(project.framework, 'native-rust');
  assert.ok(project.files.some((file) => file.path === 'src/lib.rs'));
  assert.equal(validateProjectFiles(project.files), true);
});

test('editor paths reject traversal and unsupported roots', () => {
  assert.equal(normalizeEditorPath('src/state/mod.rs'), 'src/state/mod.rs');
  assert.throws(() => normalizeEditorPath('../Cargo.toml'));
  assert.throws(() => normalizeEditorPath('/tmp/lib.rs'));
  assert.throws(() => normalizeEditorPath('vendor/lib.rs'));
  assert.throws(() => normalizeEditorPath('src/build.sh'));
});

test('required lib file cannot be renamed or removed', () => {
  const project = createStarterProject();
  assert.throws(() => renameFile(project, 'src/lib.rs', 'src/program.rs'));
  assert.throws(() => deleteFile(project, 'src/lib.rs'));
});

test('source edits invalidate the previous build', () => {
  const project = {
    ...createStarterProject(),
    lastBuild: { sourceHash: 'old' },
  };
  const next = setFileContent(project, 'src/lib.rs', 'pub fn changed() {}');
  assert.equal(next.lastBuild, undefined);
});

test('project export/import roundtrip preserves source', () => {
  const project = createStarterProject('roundtrip');
  const imported = importProject(exportProject(project));
  assert.equal(imported.name, 'roundtrip');
  assert.deepEqual(imported.files, project.files);
});


test('empty project template keeps only the required native Rust entrypoint', () => {
  const project = createEmptyProject('blank');
  assert.equal(project.name, 'blank');
  assert.deepEqual(project.files.map((file) => file.path), ['src/lib.rs']);
  assert.match(project.files[0].content, /entrypoint!\(process_instruction\)/);
  assert.equal(validateProjectFiles(project.files), true);
});


test('closed deployments are removed only for the matching network and program', () => {
  const project = {
    ...createStarterProject('deployments'),
    deployments: [
      { network: 'testnet', programId: 'one' },
      { network: 'testnet', programId: 'two' },
      { network: 'localnet', programId: 'one' },
    ],
  };
  const next = removeDeployment(project, 'testnet', 'one');
  assert.deepEqual(
    next.deployments.map((item) => [item.network, item.programId]),
    [['testnet', 'two'], ['localnet', 'one']],
  );
});
