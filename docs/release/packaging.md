# Packaging status (WP 6.1 first slice)

The product version comes from root `Cargo.toml`, `[workspace.package].version`.
Rust packages inherit it with `version.workspace = true`. Explicit versions in
`crates/cc-store/Cargo.toml` and `crates/cc-twitch/Cargo.toml`, every root/app/package
`package.json`, and `apps/desktop/src-tauri/tauri.conf.json` are checked mirrors,
not independent release versions. The desktop Cargo manifest is checked too.

To bump the version, change the root workspace version first, then update every
explicit mirror to that exact value in the same delivery. Refresh the workspace
package entries in `Cargo.lock` using Cargo in an authorized checkout, without
unrelated dependency upgrades. Do not edit inherited version declarations or
generated application code. Run `node scripts/version-drift.mjs`, then `pnpm gate`.
The drift check lists its inspected file count, rejects an empty inventory, and
names every mismatched or missing version. New immediate `apps/*`, `packages/*`
and `crates/*` members are discovered automatically, without a hardcoded list.
It never follows dependency junctions. Unsupported Cargo version syntax fails
with a path; the supported inheritance forms are dotted and inline workspace
inheritance. The test fixtures also prove drift and empty-inventory failures.

Windows: **unsigned today**; NSIS is the only enabled bundle target.

macOS: **unsigned today**; packaging and release jobs are deferred.

Linux: **unsigned today**; packaging and release jobs are deferred.

## Build the Windows installer

Use Windows with the project's Rust toolchain, MSVC build tools, WebView2 and an
already-installed compatible Tauri 2 CLI (`cargo tauri --version`). No npm package
or CLI is installed by this delivery. From the repository root:

```powershell
node scripts/version-drift.mjs
pnpm --config.verify-deps-before-run=false --filter @castle-control/desktop build
# Then from apps/desktop (not the repository root):
cargo tauri build --target x86_64-pc-windows-msvc --bundles nsis
```

Keep `CARGO_BUILD_JOBS=6` or lower on the shared builder. Tauri's release build
enables the desktop's custom protocol and embeds the prebuilt frontend. The
configuration enables bundling with `targets: ["nsis"]`; there is no certificate,
custom signing command or updater artifact configuration. This target selection
does not enable macOS or Linux bundles. A native executable from `cargo build`
alone is not evidence that an installer was produced.

Only attempt the release build within the Director's gate time budget. Record
its exact exit and artifact path; a timeout, missing CLI, missing toolchain,
skipped command or absent file is incomplete, never a green release result.
This slice does not claim an installer, clean-machine installation or update
rehearsal until those commands and checks have actually completed.

## Expected artifacts

This is the intended release inventory, not a claim that release jobs exist.
`<target>` is the Rust target triple; `<version>` must equal the root workspace
version. Paths below are relative to `target/<target>/release/`. The existing
`windows-latest` workflow runs `pnpm gate`, including version drift, but does not
produce or publish these release artifacts.

| OS / architecture | Rust target | Required artifact | Current status |
| --- | --- | --- | --- |
| Windows x86_64 | `x86_64-pc-windows-msvc` | `bundle/nsis/Castle Control_<version>_x64-setup.exe` | Unsigned NSIS configured; build verification pending |
| macOS x86_64 | `x86_64-apple-darwin` | `bundle/macos/Castle Control.app` and `bundle/dmg/*.dmg` | Deferred; unsigned |
| macOS arm64 | `aarch64-apple-darwin` | `bundle/macos/Castle Control.app` and `bundle/dmg/*.dmg` | Deferred; unsigned |
| Linux x86_64 | `x86_64-unknown-linux-gnu` | `bundle/deb/*.deb` and `bundle/appimage/*.AppImage` | Deferred; unsigned |
| Linux arm64 | `aarch64-unknown-linux-gnu` | `bundle/deb/*.deb` and `bundle/appimage/*.AppImage` | Deferred; unsigned |

Future release CI must enumerate each required row explicitly and fail when its
job is skipped or its expected artifact is absent. The artifact manifest must
record OS, architecture, product version, path, digest and signing status. Check
the installed tree against that manifest and launch it on a clean machine;
compilation or an upload wildcard finding no files cannot satisfy that exit.
Additional architectures require an explicit matrix/inventory update.

## Owner steps and remaining WP 6.1 exits

- **Owner step: signing.** Provision Windows signing credentials and macOS
  signing/notarization credentials through the appropriate secret store. Decide
  Linux artifact signing. Keep all keys and credentials outside the repository.
- **Owner step: updater.** Provision updater signing keys and the feed's hosting
  and publish authority. Then add signed updater artifacts and verify signatures;
  no updater feed or publishing is introduced by this slice.
- Follow-up delivery: add macOS/Linux bundle targets and the release matrix once
  the signing and release requirements are ready.
- Rehearse each release candidate as an update from the previous installed
  release: settings, ledgers and keychain entries survive, and a failed update
  leaves the previous version bootable. Record installation, launch, update and
  rollback evidence per OS/architecture. These checks remain open.

Validation and sandbox limits for this delivery are recorded in
[gate-evidence.md](../gate-evidence.md).
