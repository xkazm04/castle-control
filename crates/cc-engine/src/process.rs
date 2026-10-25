// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-engine/src/claude_cli.rs.
//! The sole spawn door, shared by calls and probes. Never uses a shell.
use crate::{
    EngineClass, Failure, Prices, Result,
    api::{Answer, MAX_OUTPUT},
    process_tree::Tree,
    stream::TurnParser,
};
use cc_types::CliProvider;
use std::{
    fs::{self, File},
    path::{Path, PathBuf},
    process::Stdio,
    time::{Duration, Instant},
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    process::{Child, Command},
};

/// Host-supplied OS-keychain broker. It accepts a label, never an environment name
/// or a file path. This crate deliberately does not implement credential storage.
pub trait Keychain: Send + Sync {
    fn load(&self, label: &str) -> Result<String>;
}
pub struct NoKeychain;
impl Keychain for NoKeychain {
    fn load(&self, _: &str) -> Result<String> {
        Err(Failure::Auth)
    }
}

pub struct SpawnDoor {
    root: PathBuf,
    _ownership: File,
}
struct Run {
    path: PathBuf,
    tree: Tree,
}
impl Drop for Run {
    fn drop(&mut self) {
        // Retire descendants before cleanup. A locked directory is left to startup
        // sweep; never traverse child-created paths recursively.
        let _termination = self.tree.terminate();
        let _cleanup = fs::remove_dir(&self.path);
    }
}
impl SpawnDoor {
    /// A private control directory, separate from the Store and from all project trees.
    /// A kernel file lock excludes a second live host before the startup orphan sweep.
    pub fn new(root: impl AsRef<Path>) -> Result<Self> {
        fs::create_dir_all(root.as_ref()).map_err(|_| Failure::Supervision)?;
        let root = fs::canonicalize(root).map_err(|_| Failure::Supervision)?;
        let ownership = File::options()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(root.join("owner.lock"))
            .map_err(|_| Failure::Supervision)?;
        ownership.try_lock().map_err(|_| Failure::Supervision)?;
        let door = Self {
            root,
            _ownership: ownership,
        };
        door.sweep()?;
        Ok(door)
    }
    pub(crate) fn posture_target(&self) -> Result<PathBuf> {
        let target = self.root.join(format!("probe-{}", ulid::Ulid::new()));
        // Positive control: this location is writable outside the child sandbox.
        let file = File::options()
            .create_new(true)
            .write(true)
            .open(&target)
            .map_err(|_| Failure::Posture)?;
        drop(file);
        fs::remove_file(&target).map_err(|_| Failure::Posture)?;
        Ok(target)
    }
    fn sweep(&self) -> Result<usize> {
        let mut count = 0;
        for entry in fs::read_dir(&self.root).map_err(|_| Failure::Supervision)? {
            let entry = entry.map_err(|_| Failure::Supervision)?;
            let name = entry.file_name();
            let Some(id) = name.to_str() else { continue };
            if id.parse::<ulid::Ulid>().is_err() {
                continue;
            }
            // Never traverse or delete a symlink/junction, or unknown payloads.
            let metadata = fs::symlink_metadata(entry.path()).map_err(|_| Failure::Supervision)?;
            if !metadata.is_dir() || metadata.file_type().is_symlink() {
                return Err(Failure::Supervision);
            }
            crate::process_tree::sweep(id)?;
            fs::remove_dir(entry.path()).map_err(|_| Failure::Supervision)?;
            count += 1;
        }
        Ok(count)
    }
    fn spawn(
        &self,
        executable: &Path,
        args: &[String],
        key: Option<(&str, &str)>,
        vault: &dyn Keychain,
    ) -> Result<(Child, Run)> {
        if !executable.is_absolute() || !executable.is_file() {
            return Err(Failure::Unavailable);
        }
        #[cfg(windows)]
        if executable.extension().and_then(|ext| ext.to_str()) != Some("exe") {
            return Err(Failure::Invalid);
        }
        let id = ulid::Ulid::new().to_string();
        let path = self.root.join(&id);
        let tree = Tree::new(&id)?;
        fs::create_dir(&path).map_err(|_| Failure::Supervision)?;
        let run = Run { path, tree };
        let mut command = Command::new(executable);
        command
            .args(args)
            .current_dir(&run.path)
            .env_clear()
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        // Keep only OS/runtime and user login locations. No PATH resolution, proxy,
        // provider keys, CLI sessions, plugin variables or parent configuration leaks.
        for name in [
            "SystemRoot",
            "WINDIR",
            "USERPROFILE",
            "HOME",
            "APPDATA",
            "LOCALAPPDATA",
            "TEMP",
            "TMP",
        ] {
            if let Some(value) = std::env::var_os(name) {
                command.env(name, value);
            }
        }
        if let Some((label, variable)) = key {
            let secret = vault.load(label)?;
            command.env(variable, &secret);
        }
        #[cfg(windows)]
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        let mut child = command.spawn().map_err(|_| Failure::Unavailable)?;
        if let Err(error) = run.tree.attach(&child) {
            // kill_on_drop is the fallback if assignment fails before supervision exists.
            let _kill = child.start_kill();
            return Err(error);
        }
        Ok((child, run))
    }
    #[allow(clippy::too_many_arguments)]
    pub(crate) async fn turn(
        &self,
        executable: &Path,
        args: &[String],
        prompt: &str,
        provider: CliProvider,
        class: EngineClass,
        prices: Prices,
        key: Option<(&str, &str)>,
        vault: &dyn Keychain,
        limits: (u64, u64),
    ) -> Result<Answer> {
        if crate::model::live(class) {
            return Err(Failure::CliOnLive);
        }
        if prompt.len() > MAX_OUTPUT {
            return Err(Failure::Invalid);
        }
        let (mut child, run) = self.spawn(executable, args, key, vault)?;
        let started = Instant::now();
        let operation = async {
            let mut stdin = child.stdin.take().ok_or(Failure::Supervision)?;
            // Deadline includes a blocked stdin, output, and exit collection.
            stdin
                .write_all(prompt.as_bytes())
                .await
                .map_err(|_| Failure::Unavailable)?;
            stdin.shutdown().await.map_err(|_| Failure::Unavailable)?;
            drop(stdin);
            let mut stdout = child.stdout.take().ok_or(Failure::Supervision)?;
            let mut parser = TurnParser::default();
            let mut pending = Vec::new();
            let mut buffer = [0u8; 4096];
            let mut received = 0usize;
            let mut exit = None;
            loop {
                let n = tokio::select! {
                    status = child.wait(), if exit.is_none() => {
                        exit = Some(status.map_err(|_| Failure::Unavailable)?);
                        // A descendant may have inherited the stdout writer. Kill the
                        // remainder of the tree as soon as the root exits, then drain.
                        run.tree.terminate()?;
                        continue;
                    }
                    read = tokio::time::timeout(Duration::from_millis(limits.1), stdout.read(&mut buffer)) => {
                        read.map_err(|_| Failure::Timeout)?.map_err(|_| Failure::Unavailable)?
                    }
                };
                if n == 0 {
                    break;
                }
                received += n;
                if received > MAX_OUTPUT {
                    return Err(Failure::Parse);
                }
                pending.extend_from_slice(&buffer[..n]);
                while let Some(end) = pending.iter().position(|b| *b == b'\n') {
                    let line: Vec<_> = pending.drain(..=end).collect();
                    if line.iter().any(|b| !b.is_ascii_whitespace()) {
                        parser.feed(&line, provider)?;
                    }
                }
            }
            // A truncated JSONL frame is a failure, even when earlier frames look good.
            if !pending.is_empty() {
                return Err(Failure::Parse);
            }
            let status = match exit {
                Some(status) => status,
                None => child.wait().await.map_err(|_| Failure::Unavailable)?,
            };
            let mut answer = parser.finish(prices)?;
            if !status.success() {
                answer.failure = Some(Failure::Unavailable);
                answer.model_served = None;
                answer.thread_id = None;
            }
            answer.total_ms = started.elapsed().as_millis() as u64;
            Ok(answer)
        };
        let result = tokio::time::timeout(Duration::from_millis(limits.0), operation)
            .await
            .map_err(|_| Failure::Timeout)
            .and_then(|result| result);
        if result.is_err() {
            stop(&mut child, &run.tree).await?;
        }
        // Job close kills descendants even after a successful parent exit.
        drop(run);
        result
    }
    pub(crate) async fn capture(
        &self,
        executable: &Path,
        args: &[String],
        key: Option<(&str, &str)>,
        vault: &dyn Keychain,
    ) -> Result<(bool, Vec<u8>)> {
        let (mut child, run) = self.spawn(executable, args, key, vault)?;
        drop(child.stdin.take());
        let operation = async {
            let stdout = child.stdout.take().ok_or(Failure::Supervision)?;
            let mut bytes = Vec::new();
            stdout
                .take((MAX_OUTPUT + 1) as u64)
                .read_to_end(&mut bytes)
                .await
                .map_err(|_| Failure::Unavailable)?;
            if bytes.len() > MAX_OUTPUT {
                return Err(Failure::Parse);
            }
            let success = child
                .wait()
                .await
                .map_err(|_| Failure::Unavailable)?
                .success();
            Ok((success, bytes))
        };
        let result = tokio::time::timeout(Duration::from_secs(10), operation)
            .await
            .map_err(|_| Failure::Timeout)
            .and_then(|r| r);
        if result.is_err() {
            stop(&mut child, &run.tree).await?;
        }
        drop(run);
        result
    }
}
async fn stop(child: &mut Child, tree: &Tree) -> Result<()> {
    // EOF is the polite stop; allow a short completion grace before killing the job.
    drop(child.stdin.take());
    match tokio::time::timeout(Duration::from_millis(100), child.wait()).await {
        Ok(Ok(_)) => return Ok(()),
        Ok(Err(_)) => return Err(Failure::Supervision),
        Err(_) => {}
    }
    tree.terminate()?;
    child.start_kill().map_err(|_| Failure::Supervision)?;
    tokio::time::timeout(Duration::from_secs(2), child.wait())
        .await
        .map_err(|_| Failure::Supervision)?
        .map_err(|_| Failure::Supervision)?;
    Ok(())
}
