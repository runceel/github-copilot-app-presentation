# Test fixtures

These decks are loaded by `test/harness/deck.mjs`.

## Format

The Extension accepts an array of Markdown fragments, one per slide. Splitting the original
Markdown into fragments is the Skill's responsibility (the generative AI). Tests do not reimplement
those splitting rules; they specify the same fragments passed to the Extension.

Because fragments can contain front matter delimited by `---`, use a nonconflicting
`<!-- slide -->` line to separate slides.

```markdown
---
layout: title
---

# Title slide

<!-- slide -->

---
page: 2
total: 2
---

## Second slide
```

## Files

| File | Purpose |
| --- | --- |
| `architecture-visual.md` | Visual regression fixture. Contains only Architecture DSL, without Mermaid, to stabilize pixel comparisons |
| `layout-visual.md` | Regression fixture for H1/H2 in `layout: section`, optional kicker/footer, theme backgrounds, and PDF output |
| `standard-title.md` | DOM, coordinate, and PDF regression fixture that pins a regular slide's leading H1/H2 to the top title region |
| `print-mixed.md` | PDF regression fixture with Mermaid and Architecture DSL on one slide (a single fragment without separators) |

The PDF regression suite inserts `print-mixed.md` before the back cover in
`architecture-visual.md`, then verifies print output with Mermaid and Architecture DSL together.
