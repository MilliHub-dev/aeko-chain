use {
    clap::ArgMatches,
    reqwest::blocking::Client,
    semver::Version,
    serde_derive::{Deserialize, Serialize},
    std::{
        env,
        error::Error,
        fmt, fs,
        io::{self, IsTerminal, Write},
        path::{Path, PathBuf},
        process::{self, Command, Stdio},
        time::{Duration, SystemTime, UNIX_EPOCH},
    },
};

const DEFAULT_REPOSITORY: &str = "MilliHub-dev/aeko-chain";
const UPDATE_CACHE_TTL_SECS: u64 = 24 * 60 * 60;
const POSIX_INSTALLER: &str = include_str!("../../../install/aeko-cli-install.sh");
const WINDOWS_INSTALLER: &str = include_str!("../../../install/aeko-cli-install.ps1");

#[derive(Debug)]
pub enum UpdateError {
    Http(String),
    Io(io::Error),
    InvalidRelease(String),
    Installer(String),
    UnsupportedPlatform(String),
}

impl fmt::Display for UpdateError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Http(message) => write!(f, "update service error: {message}"),
            Self::Io(error) => write!(f, "update I/O error: {error}"),
            Self::InvalidRelease(message) => write!(f, "invalid AEKO release: {message}"),
            Self::Installer(message) => write!(f, "AEKO installer failed: {message}"),
            Self::UnsupportedPlatform(platform) => {
                write!(f, "self-update is not available on {platform}")
            }
        }
    }
}

impl Error for UpdateError {}

impl From<io::Error> for UpdateError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

#[derive(Clone, Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    html_url: String,
}

#[derive(Debug, Deserialize, Serialize)]
struct CachedRelease {
    checked_at_unix: u64,
    tag_name: String,
    html_url: String,
}

fn repository() -> String {
    env::var("AEKO_GITHUB_REPOSITORY")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_REPOSITORY.to_string())
}

fn release_api_url() -> String {
    env::var("AEKO_CLI_RELEASE_API_URL")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| {
            format!(
                "https://api.github.com/repos/{}/releases/latest",
                repository()
            )
        })
}

fn fetch_latest_release() -> Result<GithubRelease, UpdateError> {
    let client = Client::builder()
        .user_agent(format!("aeko-cli/{}", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|error| UpdateError::Http(error.to_string()))?;
    let release = client
        .get(release_api_url())
        .send()
        .and_then(|response| response.error_for_status())
        .map_err(|error| UpdateError::Http(error.to_string()))?
        .json::<GithubRelease>()
        .map_err(|error| UpdateError::Http(error.to_string()))?;
    validate_release_tag(&release.tag_name)?;
    Ok(release)
}

fn validate_release_tag(tag: &str) -> Result<(), UpdateError> {
    let safe = !tag.is_empty()
        && tag.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-')
        });
    if !safe {
        return Err(UpdateError::InvalidRelease(format!(
            "unsupported release tag {tag:?}"
        )));
    }

    let supported = semver_from_release_tag(tag).is_some() || cli_main_commit(tag).is_some();
    if !supported {
        return Err(UpdateError::InvalidRelease(format!(
            "unsupported release channel {tag:?}; expected v<semver> or cli-main-<commit>"
        )));
    }
    Ok(())
}

fn semver_from_release_tag(tag: &str) -> Option<Version> {
    Version::parse(tag.strip_prefix('v')?).ok()
}

fn cli_main_commit(tag: &str) -> Option<u32> {
    let commit = tag.strip_prefix("cli-main-")?;
    let short = commit.get(..8)?;
    if !short.chars().all(|character| character.is_ascii_hexdigit()) {
        return None;
    }
    u32::from_str_radix(short, 16).ok()
}

fn current_source_commit() -> Option<u32> {
    let commit = aeko_version::Version::default().commit;
    (commit != 0).then_some(commit)
}

fn release_is_newer(
    release_tag: &str,
    current_version: &Version,
    current_commit: Option<u32>,
) -> Option<bool> {
    if let Some(release_version) = semver_from_release_tag(release_tag) {
        return Some(release_version > *current_version);
    }
    if let Some(release_commit) = cli_main_commit(release_tag) {
        return current_commit.map(|commit| release_commit != commit);
    }
    None
}

fn update_status(release_tag: &str) -> Option<bool> {
    let current_version = Version::parse(env!("CARGO_PKG_VERSION")).ok()?;
    release_is_newer(release_tag, &current_version, current_source_commit())
}

fn current_version_label() -> String {
    match current_source_commit() {
        Some(commit) => format!("{} (src:{commit:08x})", env!("CARGO_PKG_VERSION")),
        None => format!("{} (untraceable source build)", env!("CARGO_PKG_VERSION")),
    }
}

fn now_unix() -> Option<u64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_secs())
}

fn update_cache_path() -> Option<PathBuf> {
    if let Some(path) = env::var_os("AEKO_UPDATE_CACHE_FILE") {
        return Some(PathBuf::from(path));
    }

    #[cfg(target_os = "windows")]
    {
        env::var_os("LOCALAPPDATA")
            .filter(|value| !value.is_empty())
            .map(PathBuf::from)
            .map(|base| base.join("Aeko").join("update-check.json"))
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Some(base) = env::var_os("XDG_CACHE_HOME").filter(|value| !value.is_empty()) {
            return Some(PathBuf::from(base).join("aeko").join("update-check.json"));
        }
        env::var_os("HOME")
            .filter(|value| !value.is_empty())
            .map(PathBuf::from)
            .map(|home| home.join(".cache").join("aeko").join("update-check.json"))
    }
}

fn read_cached_release() -> Option<GithubRelease> {
    let contents = fs::read_to_string(update_cache_path()?).ok()?;
    let cached: CachedRelease = serde_json::from_str(&contents).ok()?;
    let age = now_unix()?.checked_sub(cached.checked_at_unix)?;
    if age > UPDATE_CACHE_TTL_SECS {
        return None;
    }
    validate_release_tag(&cached.tag_name).ok()?;
    Some(GithubRelease {
        tag_name: cached.tag_name,
        html_url: cached.html_url,
    })
}

fn cache_release(release: &GithubRelease) {
    let Some(path) = update_cache_path() else {
        return;
    };
    let Some(checked_at_unix) = now_unix() else {
        return;
    };
    let cached = CachedRelease {
        checked_at_unix,
        tag_name: release.tag_name.clone(),
        html_url: release.html_url.clone(),
    };
    let Ok(contents) = serde_json::to_vec(&cached) else {
        return;
    };
    if let Some(parent) = path.parent() {
        if fs::create_dir_all(parent).is_err() {
            return;
        }
    }
    let _ = fs::write(path, contents);
}

fn latest_release_for_notice() -> Result<Option<GithubRelease>, UpdateError> {
    if read_cached_release().is_some() {
        return Ok(None);
    }
    let release = fetch_latest_release()?;
    cache_release(&release);
    Ok(Some(release))
}

fn env_flag(name: &str) -> bool {
    env::var(name)
        .ok()
        .map(|value| {
            matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "1" | "true" | "yes" | "on"
            )
        })
        .unwrap_or(false)
}

fn prompt_yes_no(question: &str) -> Result<bool, UpdateError> {
    loop {
        eprint!("{question} [Y/n] ");
        io::stderr().flush()?;
        let mut input = String::new();
        io::stdin().read_line(&mut input)?;
        match input.trim().to_ascii_lowercase().as_str() {
            "" | "y" | "yes" => return Ok(true),
            "n" | "no" => return Ok(false),
            _ => eprintln!("Please answer yes or no."),
        }
    }
}

fn install_dir() -> Result<PathBuf, UpdateError> {
    let executable = env::current_exe()?;
    executable.parent().map(Path::to_path_buf).ok_or_else(|| {
        UpdateError::Installer(format!(
            "cannot determine the installation directory for {}",
            executable.display()
        ))
    })
}

fn configure_installer_environment(command: &mut Command, release: &GithubRelease, dir: &Path) {
    command
        .env("AEKO_GITHUB_REPOSITORY", repository())
        .env("AEKO_VERSION", &release.tag_name)
        .env("AEKO_INSTALL_DIR", dir);
}

fn install_release(release: &GithubRelease) -> Result<(), UpdateError> {
    validate_release_tag(&release.tag_name)?;
    let dir = install_dir()?;

    match env::consts::OS {
        "linux" => {
            let mut command = Command::new("sh");
            configure_installer_environment(&mut command, release, &dir);
            let mut child = command
                .stdin(Stdio::piped())
                .stdout(Stdio::inherit())
                .stderr(Stdio::inherit())
                .spawn()?;
            child
                .stdin
                .take()
                .ok_or_else(|| UpdateError::Installer("unable to open installer stdin".into()))?
                .write_all(POSIX_INSTALLER.as_bytes())?;
            let status = child.wait()?;
            if !status.success() {
                return Err(UpdateError::Installer(format!(
                    "Linux installer exited with {status}"
                )));
            }
            println!("AEKO CLI is updated to {}.", release.tag_name);
            Ok(())
        }
        "windows" => {
            let mut command = Command::new("powershell.exe");
            command.args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                "-",
            ]);
            configure_installer_environment(&mut command, release, &dir);
            command.env("AEKO_WAIT_FOR_PID", process::id().to_string());
            let mut child = command
                .stdin(Stdio::piped())
                .stdout(Stdio::inherit())
                .stderr(Stdio::inherit())
                .spawn()?;
            child
                .stdin
                .take()
                .ok_or_else(|| UpdateError::Installer("unable to open installer stdin".into()))?
                .write_all(WINDOWS_INSTALLER.as_bytes())?;
            println!(
                "AEKO update {} started. The Windows installer will replace the binaries after this CLI process exits.",
                release.tag_name
            );
            Ok(())
        }
        platform => Err(UpdateError::UnsupportedPlatform(platform.to_string())),
    }
}

pub fn run(matches: &ArgMatches<'_>) -> Result<(), UpdateError> {
    let release = fetch_latest_release()?;
    cache_release(&release);
    let status = update_status(&release.tag_name);

    println!("Current AEKO CLI: {}", current_version_label());
    println!("Latest AEKO CLI:  {}", release.tag_name);
    println!("Release:          {}", release.html_url);

    if matches.is_present("check") {
        match status {
            Some(true) => println!("Update available. Run `aeko update` to install it."),
            Some(false) => println!("AEKO CLI is up to date."),
            None => println!(
                "The current build cannot be compared safely. Run `aeko update --force` to install the latest published release."
            ),
        }
        return Ok(());
    }

    if status == Some(false) && !matches.is_present("force") {
        println!("AEKO CLI is already up to date.");
        return Ok(());
    }

    if status.is_none() && !matches.is_present("force") {
        println!(
            "The current build has no traceable source commit, so AEKO will not replace it automatically."
        );
        println!("Use `aeko update --force` if you want to install the latest published release.");
        return Ok(());
    }

    let confirmed = if matches.is_present("yes") {
        true
    } else if io::stdin().is_terminal() && io::stderr().is_terminal() {
        prompt_yes_no("Install the latest AEKO CLI now?")?
    } else {
        return Err(UpdateError::Installer(
            "confirmation requires an interactive terminal; use `aeko update --yes`".into(),
        ));
    };

    if confirmed {
        install_release(&release)?;
    } else {
        println!("Update cancelled.");
    }
    Ok(())
}

pub fn maybe_prompt_for_update() {
    if env_flag("AEKO_NO_UPDATE_CHECK") || env::var_os("CI").is_some() {
        return;
    }
    if !io::stdin().is_terminal() || !io::stderr().is_terminal() {
        return;
    }

    let release = match latest_release_for_notice() {
        Ok(Some(release)) => release,
        Ok(None) | Err(_) => return,
    };
    if update_status(&release.tag_name) != Some(true) {
        return;
    }

    eprintln!();
    eprintln!(
        "AEKO CLI update available: {} -> {}",
        current_version_label(),
        release.tag_name
    );
    match prompt_yes_no("Update now?") {
        Ok(true) => {
            if let Err(error) = install_release(&release) {
                eprintln!("aeko: automatic update failed: {error}");
                eprintln!("Run `aeko update` to retry with full diagnostics.");
            }
        }
        Ok(false) => eprintln!("Run `aeko update` whenever you are ready."),
        Err(_) => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn semver_release_comparison_is_ordered() {
        let current = Version::parse("2.0.0").unwrap();
        assert_eq!(release_is_newer("v2.0.1", &current, None), Some(true));
        assert_eq!(release_is_newer("v2.0.0", &current, None), Some(false));
        assert_eq!(release_is_newer("v1.9.9", &current, None), Some(false));
    }

    #[test]
    fn main_release_comparison_uses_embedded_source_commit() {
        let current = Version::parse("2.0.0").unwrap();
        assert_eq!(
            release_is_newer("cli-main-0123456789ab", &current, Some(0x0123_4567)),
            Some(false)
        );
        assert_eq!(
            release_is_newer("cli-main-89abcdef0123", &current, Some(0x0123_4567)),
            Some(true)
        );
        assert_eq!(
            release_is_newer("cli-main-89abcdef0123", &current, None),
            None
        );
    }

    #[test]
    fn release_tags_are_restricted_to_supported_channels() {
        assert!(validate_release_tag("v2.0.1").is_ok());
        assert!(validate_release_tag("cli-main-89abcdef0123").is_ok());
        assert!(validate_release_tag("release/latest").is_err());
        assert!(validate_release_tag("arbitrary-tag").is_err());
    }
}
