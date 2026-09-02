# Release notes

Add one `vMAJOR.MINOR.PATCH.md` file to the release preparation commit before creating a product
tag. The tag-triggered workflow uses it as the beginning of the GitHub Release notes and appends
version targets, requirements, artifact checksums, the verified commit, and GitHub's generated
change list.

Each file must contain these sections:

```markdown
## Overview

Describe the user-visible changes.

## Compatibility and migration

State whether the release is backward compatible and describe any breaking changes.

| Area | Migration |
| --- | --- |
| Version-pinned installation | Update the pinned tag to the new version. |
```
