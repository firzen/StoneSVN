# macOS builds and distribution

English | [简体中文](macos-distribution.zh-CN.md)

StoneSVN uses ad-hoc signing (`bundle.macOS.signingIdentity` is `-`) without an Apple developer account or signing certificate. This does not establish an Apple-verified developer identity. Installers are not notarized, so Gatekeeper may block the first launch.

## Installation and first launch

1. Download the DMG for your architecture from GitHub Releases: `x64` for Intel, `aarch64` for Apple Silicon.
2. Open the DMG and drag StoneSVN into Applications. The installation window includes Chinese/English first-launch guidance. Open Anyway may appear only after a blocked launch attempt.
3. Try opening StoneSVN. If blocked, verify the download source, open System Settings → Privacy & Security → Open Anyway, and confirm Open. The system remembers the exception; updates may require confirmation again.
4. Install the SVN CLI and verify `svn --version --quiet`. Homebrew users can run `brew install subversion`. StoneSVN detects SVN or lets you select its executable in Settings.

Managed Macs may require IT approval. Do not disable Gatekeeper globally. A damaged-app warning calls for a new download and signature checks; do not assume it is the ordinary developer-identity prompt.

## Local build

The installation background is `src-tauri/installer/dmg-background.png`. After changing its text/layout, run `swift scripts/generate-dmg-background.swift` from the project root on macOS and commit the regenerated image. Normal packaging uses the checked-in PNG.

Install Node.js, npm, Rust, and Xcode Command Line Tools, then run:

```bash
npm ci
npm run tauri build -- --bundles dmg
```

This builds for the current Mac architecture. DMGs are under `src-tauri/target/release/bundle/dmg/`. Verify signatures with:

```bash
codesign --verify --deep --strict --verbose=2 src-tauri/target/release/bundle/macos/StoneSVN.app
codesign -dv --verbose=4 src-tauri/target/release/bundle/macos/StoneSVN.app
```

Expect `Signature=adhoc`. Successful signature verification does not imply notarization or Gatekeeper trust. A local build does not replace testing the first installation of a browser-downloaded installer.

## GitHub releases

The stable workflow builds on Apple Silicon and Intel macOS runners; the shared Tauri configuration applies ad-hoc signatures to both. Apple signing/notarization secrets are unnecessary.

Keep npm, Cargo, lockfile, and Tauri versions synchronized and add notes at `docs/releases/vX.Y.Z.md`. Follow the current [release workflow](releasing.md) to prepare and publish; all platforms must build successfully before publication.

References: [Tauri ad-hoc signing](https://v2.tauri.app/distribute/sign/macos/#ad-hoc-signing), [Apple first-launch guidance](https://support.apple.com/102445).
