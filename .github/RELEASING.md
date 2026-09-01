# Release process

MarkdStage distributes a canvas Extension installable from GitHub Copilot, an optional Skill, and
MarkdStage Desktop for Windows x64 and ARM64 from the same repository.

## Versioning and compatibility

1. Review the changes, compatibility, bundled open-source software, and test results.
2. Create a new tag in `vMAJOR.MINOR.PATCH` format.
3. Never move a published tag; publish fixes under a new tag.
4. Keep `main` as the path to the latest version, and recommend a tag or commit SHA for reproducible installation.

Migration from the former `presentation` canvas to MarkdStage is a breaking change. The canvas ID,
Extension and Skill paths, guide tool, and Desktop artifact names change, so publish the first
MarkdStage release as a major version.

| Previous | New |
| --- | --- |
| canvas ID `presentation` | canvas ID `MarkdStage` |
| tool `presentation_guide` | tool `markdstage_guide` |
| `.github/extensions/presentation/` | `.github/extensions/markdstage/` |
| `.github/skills/presentation/` | `.github/skills/markdstage/` |
| `Presentation-win-*.zip` | `MarkdStage-win-*.zip` |

Do not provide a compatibility alias for the former canvas ID.

## Extension

The shared manifest is `.github/extensions/markdstage/copilot-extension.json`. Use `markdstage` for
`name`, and update the manifest-format `version` according to the GitHub Copilot App specification
on which it depends.

Distribute the Extension through a folder URL or a ZIP for manual installation.

```text
https://github.com/runceel/markdstage/tree/<tag>/.github/extensions/markdstage
```

Keep the Extension folder free of runtime npm dependencies. Exclude the following development
assets from the distribution ZIP:

- Root `package.json` and `package-lock.json`
- `node_modules/`
- `playwright.config.mjs`
- `.github/workflows/`
- `test/`, `test-results/`, and `playwright-report/`

Include `scripts/` because it handles Markdown persistence, and `schema/` because it contains
user-facing JSON Schemas. Also include the split Mermaid assets and their manifest.

## MarkdStage Desktop

Generate unpackaged, self-contained portable ZIP files with these commands:

```powershell
apps\MarkdStage.Desktop\scripts\Publish.ps1 -Architecture x64
apps\MarkdStage.Desktop\scripts\Publish.ps1 -Architecture arm64
```

Attach the following files to the release:

- `MarkdStage-win-x64.zip`
- `MarkdStage-win-x64.zip.sha256`
- `MarkdStage-win-arm64.zip`
- `MarkdStage-win-arm64.zip.sha256`

Bundle Windows App SDK and the .NET runtime. Document WebView2 Runtime as an environment
prerequisite in the release notes.

## Validation

```powershell
npm ci
npm test
dotnet test apps\MarkdStage.Desktop\tests\MarkdStage.Core.Tests\MarkdStage.Core.Tests.csproj -c Release
dotnet build apps\MarkdStage.Desktop\src\MarkdStage.App\MarkdStage.App.csproj -c Release -r win-x64 -p:Platform=x64
apps\MarkdStage.Desktop\scripts\Publish.ps1 -Architecture x64
apps\MarkdStage.Desktop\scripts\Publish.ps1 -Architecture arm64
```

Then reload the Extension and verify that `MarkdStage` appears in the canvas list,
`markdstage_guide` is available, and Markdown import, navigation, presenter, and PDF export all work
with the new canvas ID.

## MarkdStage CLI on npm

The standalone CLI uses its own semantic version in
`packages/markdstage-cli/package.json`. Publish it with a matching
`cli-vMAJOR.MINOR.PATCH` tag; do not reuse the product release tag unless both version numbers
intentionally match.

Before tagging:

```powershell
npm run test:cli
npm run skills:check
cd packages\markdstage-cli
npm pack --dry-run
```

Commit the package version and generated Skill updates to `main`, then create and push the matching
tag:

```powershell
git tag cli-v0.1.0
git push origin cli-v0.1.0
```

`.github/workflows/npm-publish.yml` verifies that the tag matches the package version and that the
tagged commit is reachable from `main`, then publishes the public scoped package with provenance.
Never move a published CLI tag or reuse a package version.

The first publish requires an npm granular access token with permission to create and publish
`@markdstage/markdstage`, stored temporarily as the `NPM_TOKEN` GitHub Actions secret. After the first
publish:

1. Configure the package's npm Trusted Publisher for repository `runceel/markdstage` and workflow
   `npm-publish.yml`.
2. Verify one OIDC-authenticated publish, then revoke the bootstrap token on npm.
3. Delete the `NPM_TOKEN` repository secret.
4. Set npm publishing access to require two-factor authentication and disallow traditional tokens.

Subsequent publishes authenticate through GitHub Actions OIDC and generate provenance without a
long-lived npm token.

## GitHub Release

Include the following in the release notes:

- Change summary and verified commit SHA
- Target canvas, Skill, and Desktop versions
- Breaking changes and migration table
- Supported Windows architectures and the WebView2 Runtime prerequisite
- SHA-256 for each ZIP
- Updated third-party notices when bundled open-source software changes

## Post-release documentation

After publishing the GitHub Release:

1. Update the root `README.md` so every **current release** link, version-pinned Extension folder
   URL, and Desktop asset URL uses the new tag.
2. Do not rewrite historical compatibility or migration references that intentionally name an older
   version.
3. Commit the documentation update to `main` and verify that every updated URL resolves to the
   published release or one of its assets.
