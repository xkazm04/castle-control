# Install and launch

Draft for owner review, current at `c3dea03` (2026-10-28). Windows is the first
target. Windows NSIS packaging is configured but **unsigned**; an installer
artifact, clean-machine installation and update rehearsal are not yet verified.
macOS/Linux packaging is deferred and unsigned. There is no published download
or signed updater promised by this guide. Source:
[packaging status and artifact inventory](../release/packaging.md).

## Windows installer status

The intended Windows x86_64 artifact is
`target/x86_64-pc-windows-msvc/release/bundle/nsis/Castle Control_<version>_x64-setup.exe`.
The version must match the root workspace version. Obtain a verified artifact
from the Director before treating this path as a download that exists.

An unsigned installer may trigger Windows SmartScreen or an unknown-publisher
prompt. Check its source and supplied digest before deciding to run it; a
warning is not proof that Castle Control has been signed or reviewed. Cancel
if you cannot establish that you trust the artifact. Signing, release publishing
and installation/update evidence remain owner/Director steps under
[WP 6.1](../release/packaging.md#owner-steps-and-remaining-wp-61-exits).

## Run from a normal checkout

Use Node.js 24.14.0 or newer, pnpm 11.3.0, Rust, Windows MSVC build tools/SDK
and WebView2. Native installer builds additionally need an already-installed
compatible Tauri 2 CLI. Sources: [package requirements](../../package.json),
[desktop prerequisites](../../apps/desktop/README.md#tauri-shell),
[installer build procedure](../release/packaging.md#build-the-windows-installer).

In an ordinary standalone checkout, install the locked dependencies once:

```powershell
pnpm install --frozen-lockfile
pnpm gate
```

Do not run an install over a builder worktree's shared `node_modules` junction.
The following launch commands assume dependencies are already present.

For a browser-only sample preview, from the repository root:

```powershell
pnpm --config.verify-deps-before-run=false --filter @castle-control/desktop dev
```

Open the local address Vite prints. The fixture banner must remain visible.
This mode does not log in or contact Twitch/OBS. For the embedded native
frontend and an initially unconfigured core:

```powershell
pnpm --config.verify-deps-before-run=false --filter @castle-control/desktop build
cargo run -p cc-desktop --features custom-protocol
```

Disconnected or unknown status is expected without native configuration. The
[login guide](login.md) covers the separate owner test-channel path. Native
options are rejected in Vite fixture mode. Source:
[desktop launch modes](../../apps/desktop/README.md#tauri-shell).

To build the unsigned installer, follow the exact
[packaging commands](../release/packaging.md#build-the-windows-installer),
including running `cargo tauri build` from `apps/desktop`. A plain Cargo binary
is not an installer. Keep build evidence separate from a successful install.
