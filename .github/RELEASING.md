# Release process

MarkdStage distributes a canvas Extension installable from GitHub Copilot, an optional Skill, a
standalone npm CLI, and MarkdStage Desktop for Windows x64 and ARM64 from the same repository.

## Versioning and compatibility

1. Use one product version for the Canvas Extension, Skill, npm CLI, and Desktop.
2. Update `packages/markdstage-cli/package.json` to that version before releasing.
3. Review the changes, compatibility, bundled open-source software, and test results.
4. Create one tag in `vMAJOR.MINOR.PATCH` format. That tag identifies every release surface and
   triggers npm publication.
5. Never move a published tag or reuse an npm package version; publish fixes under a new tag.
6. Keep `main` as the path to the latest version, and recommend a tag or commit SHA for reproducible installation.

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
npm run skills:check
cd packages\markdstage-cli
npm pack --dry-run
cd ..\..
dotnet test apps\MarkdStage.Desktop\tests\MarkdStage.Core.Tests\MarkdStage.Core.Tests.csproj -c Release
dotnet build apps\MarkdStage.Desktop\src\MarkdStage.App\MarkdStage.App.csproj -c Release -r win-x64 -p:Platform=x64
apps\MarkdStage.Desktop\scripts\Publish.ps1 -Architecture x64
apps\MarkdStage.Desktop\scripts\Publish.ps1 -Architecture arm64
```

Then reload the Extension and verify that `MarkdStage` appears in the canvas list,
`markdstage_guide` is available, and Markdown import, navigation, presenter, and PDF export all work
with the new canvas ID.

## MarkdStage CLI on npm

The standalone CLI uses the same semantic version and release tag as the Canvas Extension, Skill,
and Desktop. Commit the package version and any generated Skill updates to `main`, then create and
push the shared product tag:

```powershell
git tag v2.3.0
git push origin v2.3.0
```

`.github/workflows/npm-publish.yml` verifies that the tag matches the package version and that the
tagged commit is reachable from `main`, then publishes `@markdstage/markdstage` with provenance.
Publication authenticates through the configured npm Trusted Publisher and GitHub Actions OIDC; do
not add a long-lived npm token.

## GitHub Release

Include the following in the release notes:

- Change summary and verified commit SHA
- Shared Canvas Extension, Skill, npm CLI, and Desktop version
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
