use {
    anyhow::{anyhow, Context, Result},
    std::{collections::BTreeSet, fs, io::ErrorKind, path::Path},
};

pub const REGISTRY_SCHEMA_VERSION: u32 = 2;
pub const REGISTRY_SCHEMA_KEY: &str = "AEKO_REGISTRY_SCHEMA_VERSION";
pub const CHAIN_GENESIS_KEY: &str = "AEKO_CHAIN_GENESIS_HASH";
const IN_PROGRESS_FILE: &str = ".aeko-bootstrap-in-progress";
const CHAIN_BINDING_FILE: &str = ".aeko-chain-binding";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LifecycleAction {
    Initialize,
    ResumeInitialize,
    Verify,
    CompletePending,
    BeginReset,
    ResumeReset,
}

impl LifecycleAction {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Initialize => "initialize",
            Self::ResumeInitialize => "resume-initialize",
            Self::Verify => "verify",
            Self::CompletePending => "complete-pending",
            Self::BeginReset => "begin-reset",
            Self::ResumeReset => "resume-reset",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LifecycleDecision {
    pub action: LifecycleAction,
    pub registry_preexisted: bool,
    pub registry_genesis: Option<String>,
    pub reset_in_progress: bool,
}

impl LifecycleDecision {
    pub fn allows_recreation(&self) -> bool {
        matches!(
            self.action,
            LifecycleAction::Initialize
                | LifecycleAction::ResumeInitialize
                | LifecycleAction::BeginReset
                | LifecycleAction::ResumeReset
        )
    }

    pub fn strict_registry_guard(&self) -> bool {
        self.registry_preexisted && !self.allows_recreation()
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ProgressKind {
    Initialize,
    Reset,
}

impl ProgressKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::Initialize => "initialize",
            Self::Reset => "reset",
        }
    }

    fn parse(value: &str) -> Result<Self> {
        match value.trim() {
            "initialize" => Ok(Self::Initialize),
            "reset" => Ok(Self::Reset),
            other => Err(anyhow!("unknown bootstrap progress mode {other:?}")),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct ProgressMarker {
    kind: ProgressKind,
    genesis: String,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
struct RegistryMetadata {
    schema_version: Option<u32>,
    genesis: Option<String>,
}

pub fn prepare(
    roots: &[&Path],
    registry_path: &Path,
    live_genesis: &str,
    reset_requested: bool,
) -> Result<LifecycleDecision> {
    if roots.is_empty() {
        return Err(anyhow!(
            "bootstrap lifecycle requires at least one persistent root"
        ));
    }
    if live_genesis.trim().is_empty() {
        return Err(anyhow!("live genesis hash must not be empty"));
    }
    for root in roots {
        fs::create_dir_all(root)
            .with_context(|| format!("creating bootstrap lifecycle root {}", root.display()))?;
    }

    let registry_preexisted = registry_path.is_file();
    let registry_metadata = read_registry_metadata(registry_path)?;
    validate_registry_metadata(&registry_metadata)?;
    if registry_preexisted && !reset_requested && registry_metadata.genesis.is_none() {
        return Err(anyhow!(
            "canonical registry is missing a current genesis binding; expected {REGISTRY_SCHEMA_KEY}={REGISTRY_SCHEMA_VERSION} and {CHAIN_GENESIS_KEY}. Schema-less or unbound registries are unsupported; restore the matching registry/state volume or set AEKO_RESET_LEDGER=1 for an intentional new chain"
        ));
    }
    let binding_genesis = read_consistent_binding(roots)?;
    let progress = read_consistent_progress(roots)?;

    if reset_requested {
        if let Some(progress) = progress.as_ref() {
            if progress.genesis == live_genesis && progress.kind == ProgressKind::Reset {
                return Ok(LifecycleDecision {
                    action: LifecycleAction::ResumeReset,
                    registry_preexisted,
                    registry_genesis: registry_metadata.genesis,
                    reset_in_progress: true,
                });
            }
        }

        if binding_genesis.as_deref() == Some(live_genesis)
            && registry_metadata.genesis.as_deref() == Some(live_genesis)
        {
            return Ok(LifecycleDecision {
                action: LifecycleAction::Verify,
                registry_preexisted,
                registry_genesis: registry_metadata.genesis,
                reset_in_progress: false,
            });
        }

        purge_roots(roots)?;
        write_progress(roots, ProgressKind::Reset, live_genesis)?;
        return Ok(LifecycleDecision {
            action: LifecycleAction::BeginReset,
            registry_preexisted: false,
            registry_genesis: None,
            reset_in_progress: true,
        });
    }

    if let Some(progress) = progress {
        if progress.genesis != live_genesis {
            return Err(anyhow!(
                "bootstrap is incomplete for genesis {}, but the validator currently reports genesis {}; restore the intended validator/volumes or perform an explicit chain reset",
                progress.genesis,
                live_genesis
            ));
        }
        return Ok(LifecycleDecision {
            action: match progress.kind {
                ProgressKind::Initialize => LifecycleAction::ResumeInitialize,
                ProgressKind::Reset => LifecycleAction::ResumeReset,
            },
            registry_preexisted,
            registry_genesis: registry_metadata.genesis,
            reset_in_progress: progress.kind == ProgressKind::Reset,
        });
    }

    if let Some(bound) = binding_genesis.as_deref() {
        if bound != live_genesis {
            return Err(anyhow!(
                "persisted bootstrap state is bound to genesis {bound}, but the validator reports {live_genesis}; refusing to reuse foreign-chain state without an explicit reset"
            ));
        }
    }

    if registry_preexisted {
        match registry_metadata.genesis.as_deref() {
            Some(genesis) if genesis != live_genesis => Err(anyhow!(
                "canonical registry is bound to genesis {genesis}, but the validator reports {live_genesis}; refusing automatic destructive reconciliation without an explicit reset"
            )),
            Some(_) => Ok(LifecycleDecision {
                action: if binding_genesis.is_some() {
                    LifecycleAction::Verify
                } else {
                    LifecycleAction::CompletePending
                },
                registry_preexisted: true,
                registry_genesis: registry_metadata.genesis,
                reset_in_progress: false,
            }),
            None => Err(anyhow!(
                "canonical registry is missing a current genesis binding; expected {REGISTRY_SCHEMA_KEY}={REGISTRY_SCHEMA_VERSION} and {CHAIN_GENESIS_KEY}. Schema-less or unbound registries are unsupported; restore the matching registry/state volume or set AEKO_RESET_LEDGER=1 for an intentional new chain"
            )),
        }
    } else {
        if binding_genesis.is_some() {
            return Err(anyhow!(
                "completed bootstrap chain binding exists for genesis {live_genesis}, but the canonical registry is missing; restore the registry/state volume instead of silently recreating established state"
            ));
        }
        if roots_have_untracked_state(roots)? {
            return Err(anyhow!(
                "bootstrap artifacts exist without a canonical registry or in-progress marker; state provenance is ambiguous, so startup fails closed"
            ));
        }
        write_progress(roots, ProgressKind::Initialize, live_genesis)?;
        Ok(LifecycleDecision {
            action: LifecycleAction::Initialize,
            registry_preexisted: false,
            registry_genesis: None,
            reset_in_progress: false,
        })
    }
}

pub fn registry_metadata_prefix(live_genesis: &str) -> String {
    format!("{REGISTRY_SCHEMA_KEY}={REGISTRY_SCHEMA_VERSION}\n{CHAIN_GENESIS_KEY}={live_genesis}\n")
}

pub fn mark_complete(roots: &[&Path], live_genesis: &str) -> Result<()> {
    let binding = registry_metadata_prefix(live_genesis);
    for root in roots {
        write_atomic(&root.join(CHAIN_BINDING_FILE), &binding)?;
    }
    for root in roots {
        match fs::remove_file(root.join(IN_PROGRESS_FILE)) {
            Ok(()) => {}
            Err(error) if error.kind() == ErrorKind::NotFound => {}
            Err(error) => {
                return Err(error).with_context(|| {
                    format!("removing bootstrap progress marker in {}", root.display())
                })
            }
        }
    }
    Ok(())
}

fn validate_registry_metadata(metadata: &RegistryMetadata) -> Result<()> {
    if let Some(version) = metadata.schema_version {
        if version != REGISTRY_SCHEMA_VERSION {
            return Err(anyhow!(
                "unsupported canonical registry schema version {version}; expected {REGISTRY_SCHEMA_VERSION}"
            ));
        }
    }
    if metadata.genesis.is_some() && metadata.schema_version != Some(REGISTRY_SCHEMA_VERSION) {
        return Err(anyhow!(
            "canonical registry contains {CHAIN_GENESIS_KEY} without {REGISTRY_SCHEMA_KEY}={REGISTRY_SCHEMA_VERSION}"
        ));
    }
    Ok(())
}

fn read_registry_metadata(path: &Path) -> Result<RegistryMetadata> {
    let contents = match fs::read_to_string(path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(RegistryMetadata::default()),
        Err(error) => return Err(error).with_context(|| format!("reading {}", path.display())),
    };
    let mut metadata = RegistryMetadata::default();
    for line in contents.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let line = line.strip_prefix("export ").unwrap_or(line);
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        match key.trim() {
            REGISTRY_SCHEMA_KEY => {
                metadata.schema_version = Some(value.trim().parse::<u32>().with_context(|| {
                    format!("invalid {REGISTRY_SCHEMA_KEY} in {}", path.display())
                })?);
            }
            CHAIN_GENESIS_KEY => {
                let value = value.trim();
                if !value.is_empty() {
                    metadata.genesis = Some(value.to_string());
                }
            }
            _ => {}
        }
    }
    Ok(metadata)
}

fn read_consistent_binding(roots: &[&Path]) -> Result<Option<String>> {
    let mut values = BTreeSet::new();
    for root in roots {
        let metadata = read_registry_metadata(&root.join(CHAIN_BINDING_FILE))?;
        validate_registry_metadata(&metadata)?;
        if let Some(genesis) = metadata.genesis {
            values.insert(genesis);
        }
    }
    if values.len() > 1 {
        return Err(anyhow!(
            "bootstrap persistent roots disagree on chain binding: {}",
            values.into_iter().collect::<Vec<_>>().join(", ")
        ));
    }
    Ok(values.into_iter().next())
}

fn read_consistent_progress(roots: &[&Path]) -> Result<Option<ProgressMarker>> {
    let mut markers = Vec::new();
    for root in roots {
        let path = root.join(IN_PROGRESS_FILE);
        let contents = match fs::read_to_string(&path) {
            Ok(contents) => contents,
            Err(error) if error.kind() == ErrorKind::NotFound => continue,
            Err(error) => return Err(error).with_context(|| format!("reading {}", path.display())),
        };
        let mut mode = None;
        let mut genesis = None;
        for line in contents.lines() {
            let Some((key, value)) = line.trim().split_once('=') else {
                continue;
            };
            match key.trim() {
                "AEKO_BOOTSTRAP_MODE" => mode = Some(ProgressKind::parse(value)?),
                CHAIN_GENESIS_KEY => genesis = Some(value.trim().to_string()),
                _ => {}
            }
        }
        markers.push(ProgressMarker {
            kind: mode
                .ok_or_else(|| anyhow!("{} is missing AEKO_BOOTSTRAP_MODE", path.display()))?,
            genesis: genesis
                .filter(|value| !value.is_empty())
                .ok_or_else(|| anyhow!("{} is missing {CHAIN_GENESIS_KEY}", path.display()))?,
        });
    }
    let Some(first) = markers.first().cloned() else {
        return Ok(None);
    };
    if markers.iter().any(|marker| marker != &first) {
        return Err(anyhow!(
            "bootstrap persistent roots disagree on in-progress lifecycle state"
        ));
    }
    Ok(Some(first))
}

fn write_progress(roots: &[&Path], kind: ProgressKind, live_genesis: &str) -> Result<()> {
    let contents = format!(
        "AEKO_BOOTSTRAP_MODE={}\n{CHAIN_GENESIS_KEY}={live_genesis}\n",
        kind.as_str()
    );
    for root in roots {
        write_atomic(&root.join(IN_PROGRESS_FILE), &contents)?;
    }
    Ok(())
}

fn purge_roots(roots: &[&Path]) -> Result<()> {
    for root in roots {
        fs::create_dir_all(root)
            .with_context(|| format!("creating reset root {}", root.display()))?;
        for entry in
            fs::read_dir(root).with_context(|| format!("reading reset root {}", root.display()))?
        {
            let path = entry?.path();
            if path.is_dir() {
                fs::remove_dir_all(&path).with_context(|| {
                    format!("removing stale reset directory {}", path.display())
                })?;
            } else {
                fs::remove_file(&path)
                    .with_context(|| format!("removing stale reset file {}", path.display()))?;
            }
        }
    }
    Ok(())
}

fn roots_have_untracked_state(roots: &[&Path]) -> Result<bool> {
    for root in roots {
        for entry in fs::read_dir(root)
            .with_context(|| format!("reading bootstrap root {}", root.display()))?
        {
            let name = entry?.file_name();
            let name = name.to_string_lossy();
            if name != IN_PROGRESS_FILE && name != CHAIN_BINDING_FILE {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

fn write_atomic(target: &Path, contents: &str) -> Result<()> {
    let file_name = target
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| anyhow!("invalid lifecycle file path {}", target.display()))?;
    let temp = target.with_file_name(format!("{file_name}.tmp"));
    fs::write(&temp, contents).with_context(|| format!("writing {}", temp.display()))?;
    fs::rename(&temp, target).with_context(|| format!("publishing {}", target.display()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        process,
        time::{SystemTime, UNIX_EPOCH},
    };

    struct TestDir(std::path::PathBuf);

    impl TestDir {
        fn new(label: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir()
                .join(format!("aeko-lifecycle-{label}-{}-{nonce}", process::id()));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn write_registry(root: &Path, metadata: &str) {
        fs::write(root.join("registry.env"), metadata).unwrap();
    }

    #[test]
    fn fresh_bootstrap_is_resumable_without_operator_reset_flag() {
        let root = TestDir::new("fresh-resume");
        let registry = root.path().join("registry.env");
        let first = prepare(&[root.path()], &registry, "genesis-a", false).unwrap();
        assert_eq!(first.action, LifecycleAction::Initialize);
        fs::write(root.path().join("partial-key.json"), "partial").unwrap();
        let resumed = prepare(&[root.path()], &registry, "genesis-a", false).unwrap();
        assert_eq!(resumed.action, LifecycleAction::ResumeInitialize);
        assert!(resumed.allows_recreation());
    }

    #[test]
    fn interrupted_reset_resumes_after_reset_flag_is_cleared() {
        let root = TestDir::new("reset-resume");
        fs::write(root.path().join("old-registry.env"), "stale").unwrap();
        let registry = root.path().join("registry.env");
        let reset = prepare(&[root.path()], &registry, "genesis-b", true).unwrap();
        assert_eq!(reset.action, LifecycleAction::BeginReset);
        fs::write(root.path().join("partial-key.json"), "partial").unwrap();
        let resumed = prepare(&[root.path()], &registry, "genesis-b", false).unwrap();
        assert_eq!(resumed.action, LifecycleAction::ResumeReset);
        assert!(resumed.allows_recreation());
    }

    #[test]
    fn completed_same_genesis_state_verifies_without_reinitialization() {
        let root = TestDir::new("verify");
        let registry = root.path().join("registry.env");
        write_registry(root.path(), &registry_metadata_prefix("genesis-a"));
        mark_complete(&[root.path()], "genesis-a").unwrap();
        let decision = prepare(&[root.path()], &registry, "genesis-a", false).unwrap();
        assert_eq!(decision.action, LifecycleAction::Verify);
        assert!(decision.strict_registry_guard());
    }

    #[test]
    fn foreign_genesis_registry_fails_closed_without_explicit_reset() {
        let root = TestDir::new("foreign");
        let registry = root.path().join("registry.env");
        write_registry(root.path(), &registry_metadata_prefix("genesis-old"));
        let error = prepare(&[root.path()], &registry, "genesis-new", false)
            .unwrap_err()
            .to_string();
        assert!(error.contains("explicit reset"));
        assert!(root.path().join("registry.env").is_file());
    }

    #[test]
    fn schema_less_registry_fails_closed_without_explicit_reset() {
        let root = TestDir::new("schema-less");
        let registry = root.path().join("registry.env");
        write_registry(root.path(), "AEKO_SOCIAL_POSTS_STATE=stale-address\n");
        let error = prepare(&[root.path()], &registry, "genesis-a", false)
            .unwrap_err()
            .to_string();
        assert!(error.contains("Schema-less or unbound registries are unsupported"));
        assert!(error.contains("AEKO_RESET_LEDGER=1"));
        assert!(registry.is_file());
    }

    #[test]
    fn schema_less_registry_cannot_hide_behind_progress_marker() {
        let root = TestDir::new("schema-less-progress");
        let registry = root.path().join("registry.env");
        write_registry(root.path(), "AEKO_SOCIAL_POSTS_STATE=stale-address\n");
        write_progress(&[root.path()], ProgressKind::Initialize, "genesis-a").unwrap();

        let error = prepare(&[root.path()], &registry, "genesis-a", false)
            .unwrap_err()
            .to_string();
        assert!(error.contains("Schema-less or unbound registries are unsupported"));
    }

    #[test]
    fn explicit_reset_replaces_schema_less_registry() {
        let root = TestDir::new("schema-less-reset");
        let registry = root.path().join("registry.env");
        write_registry(root.path(), "AEKO_SOCIAL_POSTS_STATE=stale-address\n");
        let decision = prepare(&[root.path()], &registry, "genesis-b", true).unwrap();
        assert_eq!(decision.action, LifecycleAction::BeginReset);
        assert!(decision.allows_recreation());
        assert!(!registry.exists());
    }

    #[test]
    fn missing_registry_with_completed_binding_fails_closed() {
        let root = TestDir::new("missing-registry");
        mark_complete(&[root.path()], "genesis-a").unwrap();
        let error = prepare(
            &[root.path()],
            &root.path().join("registry.env"),
            "genesis-a",
            false,
        )
        .unwrap_err()
        .to_string();
        assert!(error.contains("canonical registry is missing"));
    }

    #[test]
    fn untracked_artifacts_without_registry_or_marker_are_ambiguous() {
        let root = TestDir::new("ambiguous");
        fs::write(root.path().join("state-key.json"), "orphan").unwrap();
        let error = prepare(
            &[root.path()],
            &root.path().join("registry.env"),
            "genesis-a",
            false,
        )
        .unwrap_err()
        .to_string();
        assert!(error.contains("provenance is ambiguous"));
    }

    #[test]
    fn completion_publishes_binding_and_removes_progress_marker() {
        let root = TestDir::new("complete");
        let registry = root.path().join("registry.env");
        prepare(&[root.path()], &registry, "genesis-a", false).unwrap();
        write_registry(root.path(), &registry_metadata_prefix("genesis-a"));
        mark_complete(&[root.path()], "genesis-a").unwrap();
        assert!(!root.path().join(IN_PROGRESS_FILE).exists());
        let decision = prepare(&[root.path()], &registry, "genesis-a", false).unwrap();
        assert_eq!(decision.action, LifecycleAction::Verify);
    }
}
