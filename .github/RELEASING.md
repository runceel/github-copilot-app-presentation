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

The tag-triggered release workflow generates unpackaged, self-contained portable ZIP files for x64
and ARM64. Run the same commands locally during release validation:

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
and Desktop. npm publication authenticates through the configured Trusted Publisher and GitHub
Actions OIDC; do not add a long-lived npm token.

## Prepare the release commit

Before tagging:

1. Update `packages/markdstage-cli/package.json` to the new shared product version.
2. Update every current-release Extension and Desktop URL in `README.md` and `README.ja.md` to use
   the new tag. Do not change historical migration references.
3. Add `.github/release-notes/vMAJOR.MINOR.PATCH.md` with the overview, compatibility statement,
   breaking changes, and migration table described in `.github/release-notes/README.md`.
4. Regenerate Agent Skills if their source changed.
5. Run the validation commands above.
6. Commit and merge all release preparation changes to `main`.

Create and push the shared product tag from the verified `main` commit:

```powershell
git tag v2.3.0
git push origin v2.3.0
```

The tag starts `.github/workflows/npm-publish.yml`. The workflow:

1. Verifies the stable SemVer tag, package version, `main` ancestry, and README links.
2. Runs the complete JavaScript, browser, CLI, accessibility, performance, and PDF test suite.
3. Builds and checksums the Extension ZIP.
4. Tests and publishes the x64 and ARM64 Desktop ZIPs.
5. Publishes `@markdstage/markdstage` with npm provenance.
6. Generates release notes, creates the GitHub Release, uploads every asset, and verifies the
   published URLs.

The workflow is safe to rerun: existing npm versions are verified instead of republished, and
existing GitHub Release assets are replaced with the newly verified artifacts.

## GitHub Release

The workflow creates the GitHub Release and includes:

- Change summary and verified commit SHA
- Shared Canvas Extension, Skill, npm CLI, and Desktop version
- Breaking changes and migration table
- Supported Windows architectures and the WebView2 Runtime prerequisite
- SHA-256 for each ZIP
- Updated third-party notices when bundled open-source software changes

## Post-release verification

After the workflow succeeds:

1. Confirm the GitHub Release is marked latest and contains all six files.
2. Confirm npm shows the matching `@markdstage/markdstage` version and provenance.
3. Install the version-pinned Extension folder and verify the user-scoped Extension when applicable.
