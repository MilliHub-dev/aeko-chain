export const EDITOR_STORAGE_KEY = 'aeko.editor.projects.v1';
export const EDITOR_MAX_FILES = 48;
export const EDITOR_MAX_SOURCE_BYTES = 768 * 1024;

export const HELLO_AEKO_SOURCE = `use aeko_program::{
    account_info::AccountInfo,
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    pubkey::Pubkey,
};

entrypoint!(process_instruction);

pub fn process_instruction(
    _program_id: &Pubkey,
    _accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    msg!("Hello from the AEKO browser editor!");
    msg!("instruction bytes: {}", instruction_data.len());
    Ok(())
}
`;

export const HELLO_AEKO_TEST = `#[test]
fn editor_test_harness_is_running() {
    assert_eq!(2 + 2, 4);
}
`;

export const EMPTY_AEKO_SOURCE = `use aeko_program::{
    account_info::AccountInfo,
    entrypoint,
    entrypoint::ProgramResult,
    pubkey::Pubkey,
};

entrypoint!(process_instruction);

pub fn process_instruction(
    _program_id: &Pubkey,
    _accounts: &[AccountInfo],
    _instruction_data: &[u8],
) -> ProgramResult {
    Ok(())
}
`;

function now() {
  return new Date().toISOString();
}

function id() {
  return globalThis.crypto?.randomUUID?.() || `project-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function normalizeEditorPath(raw) {
  const value = String(raw || '').trim().replace(/^\.\//, '');
  if (!value || value.length > 240 || value.includes('\\') || value.startsWith('/')) {
    throw new Error('Use a relative Rust path such as src/lib.rs.');
  }
  const parts = value.split('/');
  if (
    parts.length < 2
    || parts.length > 8
    || !['src', 'tests'].includes(parts[0])
    || parts.some((part) => !part || part === '.' || part === '..')
    || !value.endsWith('.rs')
  ) {
    throw new Error('Only .rs files under src/ or tests/ are supported.');
  }
  return value;
}

export function validateProjectFiles(files) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('Project needs at least src/lib.rs.');
  }
  if (files.length > EDITOR_MAX_FILES) {
    throw new Error(`Projects support at most ${EDITOR_MAX_FILES} source files.`);
  }
  const seen = new Set();
  let total = 0;
  let hasLib = false;
  for (const file of files) {
    const path = normalizeEditorPath(file.path);
    if (seen.has(path)) throw new Error(`Duplicate source path: ${path}`);
    seen.add(path);
    total += new TextEncoder().encode(String(file.content ?? '')).length;
    if (path === 'src/lib.rs') hasLib = true;
  }
  if (!hasLib) throw new Error('Project must contain src/lib.rs.');
  if (total > EDITOR_MAX_SOURCE_BYTES) {
    throw new Error(`Project source exceeds ${EDITOR_MAX_SOURCE_BYTES} bytes.`);
  }
  return true;
}

export function createStarterProject(name = 'hello-aeko') {
  const createdAt = now();
  return {
    id: id(),
    name: String(name || 'hello-aeko').trim().slice(0, 80) || 'hello-aeko',
    framework: 'native-rust',
    files: [
      { path: 'src/lib.rs', content: HELLO_AEKO_SOURCE },
      { path: 'tests/smoke.rs', content: HELLO_AEKO_TEST },
    ],
    activeFile: 'src/lib.rs',
    createdAt,
    updatedAt: createdAt,
    deployments: [],
  };
}

export function createEmptyProject(name = 'aeko-program') {
  const project = createStarterProject(name);
  return {
    ...project,
    files: [{ path: 'src/lib.rs', content: EMPTY_AEKO_SOURCE }],
    activeFile: 'src/lib.rs',
  };
}

export function cloneProject(project, name = `${project.name} copy`) {
  const next = {
    ...structuredClone(project),
    id: id(),
    name: name.slice(0, 80),
    createdAt: now(),
    updatedAt: now(),
    lastBuild: undefined,
    deployments: [],
  };
  validateProjectFiles(next.files);
  return next;
}

export function upsertFile(project, rawPath, content = '') {
  const path = normalizeEditorPath(rawPath);
  const exists = project.files.some((file) => file.path === path);
  const files = exists
    ? project.files.map((file) => (file.path === path ? { ...file, content } : file))
    : [...project.files, { path, content }];
  validateProjectFiles(files);
  return { ...project, files, activeFile: path, updatedAt: now(), lastBuild: undefined };
}

export function renameFile(project, from, to) {
  const target = normalizeEditorPath(to);
  if (from === 'src/lib.rs') throw new Error('src/lib.rs is required and cannot be renamed.');
  if (project.files.some((file) => file.path === target && file.path !== from)) {
    throw new Error(`${target} already exists.`);
  }
  const files = project.files.map((file) => (
    file.path === from ? { ...file, path: target } : file
  ));
  validateProjectFiles(files);
  return {
    ...project,
    files,
    activeFile: project.activeFile === from ? target : project.activeFile,
    updatedAt: now(),
    lastBuild: undefined,
  };
}

export function deleteFile(project, path) {
  if (path === 'src/lib.rs') throw new Error('src/lib.rs is required and cannot be deleted.');
  const files = project.files.filter((file) => file.path !== path);
  validateProjectFiles(files);
  return {
    ...project,
    files,
    activeFile: project.activeFile === path ? 'src/lib.rs' : project.activeFile,
    updatedAt: now(),
    lastBuild: undefined,
  };
}

export function setFileContent(project, path, content) {
  const files = project.files.map((file) => (file.path === path ? { ...file, content } : file));
  validateProjectFiles(files);
  return { ...project, files, updatedAt: now(), lastBuild: undefined };
}

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function loadProjects() {
  if (typeof window === 'undefined') return [];
  const parsed = safeParse(window.localStorage.getItem(EDITOR_STORAGE_KEY));
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((project) => {
    try {
      validateProjectFiles(project.files);
      return typeof project.id === 'string' && typeof project.name === 'string';
    } catch {
      return false;
    }
  });
}

export function saveProjects(projects) {
  if (typeof window === 'undefined') return;
  projects.forEach((project) => validateProjectFiles(project.files));
  window.localStorage.setItem(EDITOR_STORAGE_KEY, JSON.stringify(projects));
}

export function exportProject(project) {
  validateProjectFiles(project.files);
  const payload = {
    format: 'aeko-editor-project',
    version: 1,
    project: {
      name: project.name,
      framework: 'native-rust',
      files: project.files,
    },
  };
  return JSON.stringify(payload, null, 2);
}

export function importProject(raw) {
  const payload = typeof raw === 'string' ? safeParse(raw) : raw;
  if (!payload || payload.format !== 'aeko-editor-project' || payload.version !== 1) {
    throw new Error('This is not a supported AEKO editor project export.');
  }
  const project = createStarterProject(payload.project?.name || 'imported-aeko-program');
  const files = payload.project?.files;
  validateProjectFiles(files);
  return {
    ...project,
    files: files.map((file) => ({
      path: normalizeEditorPath(file.path),
      content: String(file.content ?? ''),
    })),
    activeFile: files.some((file) => file.path === 'src/lib.rs') ? 'src/lib.rs' : files[0].path,
  };
}

export function recordBuild(project, build) {
  return {
    ...project,
    lastBuild: {
      sourceHash: build.sourceHash,
      artifactHash: build.artifact?.sha256,
      artifactSize: build.artifact?.byteLength,
      builtAt: now(),
    },
    updatedAt: now(),
  };
}

export function recordDeployment(project, deployment) {
  return {
    ...project,
    deployments: [
      {
        network: deployment.network,
        programId: deployment.programId,
        authority: deployment.authority,
        artifactHash: deployment.artifactHash,
        deployedAt: now(),
        signature: deployment.signature,
      },
      ...(project.deployments || []).filter(
        (item) => !(item.network === deployment.network && item.programId === deployment.programId),
      ),
    ].slice(0, 25),
    updatedAt: now(),
  };
}
