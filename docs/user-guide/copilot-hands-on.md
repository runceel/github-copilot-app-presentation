# Hands-on: build a deck with GitHub Copilot

> 日本語版: [日本語](ja/copilot-hands-on.md)

This exercise follows one recorded GitHub Copilot session from the initial request through a
validated Markdown deck, selected slide captures, and PDF output. Use it after
[Create slides with GitHub Copilot](ai-assisted-authoring.md) to practice the complete
create-render-review workflow.

## What you will create

The example produces a six-slide architecture review for an internal deployment service:

- Microsoft theme
- Concise speaker notes
- An Architecture DSL system diagram
- No Architecture validation errors
- No fixed 16:9 clipping
- PNG captures of selected slides
- A 16:9 PDF

The recorded output is included in this repository:

- [Generated Markdown deck](examples/copilot-hands-on-result.md)
- [Exported PDF](examples/copilot-hands-on-result.pdf)

Generated results can vary when the same request is run again. Review the Markdown and rendered
slides rather than expecting byte-for-byte identical output.

## Prerequisites

- Open a workspace where the MarkdStage Canvas Extension is installed.
- Confirm that GitHub Copilot can create files in the workspace.
- Keep the MarkdStage Canvas visible so you can review the rendered deck as it changes.

## 1. Send the complete authoring request

The recorded run used the following prompt in an independent GitHub Copilot session:

```text
Create a six-slide architecture review deck at `docs/user-guide/examples/copilot-hands-on-result.md` for engineering leaders who are evaluating a small internal deployment service.

Use the Microsoft theme and add concise speaker notes to content slides. Include these topics: title, problem and objective, requirements, target architecture, rollout plan, and risks with next steps. Use MarkdStage Architecture DSL for the target architecture. The target flow is: Developer -> GitHub Actions -> Deployment API -> Azure Container Apps, with Deployment API also reading secrets from Azure Key Vault and writing release status to Azure SQL.

Open the complete deck in MarkdStage. Validate the Architecture DSL, inspect the fixed 16:9 layout, and correct every validation or clipping issue. Capture the title slide and architecture slide, plus any slide that still needs visual review, under `docs/user-guide/images/copilot-hands-on/`. Export the final deck to `docs/user-guide/examples/copilot-hands-on-result.pdf`.

Keep Markdown as the source of truth. Do not change existing product or manual files outside the requested example output and capture directory.
```

This request supplies the audience, slide count, theme, required content, diagram facts, output
paths, and acceptance criteria. Copilot can therefore create and verify the deck without asking
you to invoke MarkdStage actions individually.

## 2. Review the deck in Canvas

Copilot creates the complete Markdown file and opens the deck in MarkdStage. Review the following
before requesting changes:

1. Use the slide list to confirm that the requested topics are present and ordered correctly.
2. Check that the Architecture slide represents every system and connection from the prompt.
3. Open Presenter view and confirm that speaker notes support the visible content.
4. Keep the Markdown file open when wording, facts, or structure require direct review.

The Markdown file remains the source of truth. Canvas is the rendered review surface, not a
separate copy of the presentation.

## 3. Let Copilot validate the output

The prompt asks Copilot to complete three different checks:

| Check | Expected evidence |
| --- | --- |
| Architecture validation | No schema, reference, or placement errors remain |
| Fixed 16:9 inspection | No page exceeds the PDF-equivalent 1280x720 surface |
| Targeted visual review | PNG files are created only for the requested or unresolved pages |

Structured validation should run before image review. A slide can fit within 16:9 and still need
editorial revision, so inspect the captured pages for hierarchy, balance, labels, and readability.

## 4. Compare with the recorded result

The example was run on August 31, 2026, in an independent worktree session using
`gpt-5.6-luna` with medium reasoning.

| Result | Recorded value |
| --- | --- |
| Authored slides | 6 |
| Rendered pages | 7, including the automatic back cover |
| Final Architecture validation | 0 errors |
| Final fixed 16:9 inspection | 0 clipped pages; all 7 pages fit |
| Captured pages | Page 1 (title) and page 4 (target architecture) |
| Exported PDF | `examples/copilot-hands-on-result.pdf`, 148,526 bytes |

The first Architecture validation found unsupported `id` properties on connector elements.
Copilot removed those properties, reloaded the complete deck, reran Architecture validation and
fixed 16:9 inspection, and then exported the PDF.

Targeted image review then showed that the connector label pills were too prominent even though
the slide passed fixed-layout inspection. Copilot removed redundant visible labels from the
left-to-right deployment path, preserved the full relationship text in each connector's
`ariaLabel`, shortened the remaining labels to `secrets` and `status`, set their `fontSize` to 14,
and increased the spacing between the main nodes. The final diagram was validated, captured, and
exported again. The author did not need to edit the Architecture JSON directly.

![Recorded title slide created from the hands-on prompt](images/copilot-hands-on/slide-001.png)

![Recorded target architecture slide after validation](images/copilot-hands-on/slide-004.png)

The images are 1280x720 captures created for the requested pages. The final Markdown contains all
six authored slides and remains available for direct review and reuse.

## 5. Continue with focused requests

After reviewing the result, keep follow-up prompts narrow and preserve any content that should not
change.

### Refine one slide

```text
Make the problem statement on slide 2 more concise for engineering leaders.
Keep the objective and all facts unchanged, then recheck only that slide in fixed 16:9.
```

### Improve the diagram

```text
The connector label pills on the target architecture slide are too prominent.
Remove visible labels from the three left-to-right connectors because the node order already
communicates the deployment path, but preserve their meaning in ariaLabel.
Shorten the vertical labels to "secrets" and "status", use fontSize 14 for those labels,
spread the main nodes evenly, validate the Architecture DSL, and capture only that slide.
```

### Prepare the final PDF

```text
Review the complete deck for terminology consistency and speaker-note quality.
Do not add slides. Recheck Architecture and fixed 16:9 output, then replace the existing PDF.
```

Focused requests reduce unintended rewrites and allow Copilot to validate only the affected pages
before the final full-deck check.

## Related guides

- [Create slides with GitHub Copilot](ai-assisted-authoring.md)
- [Markdown authoring](markdown-authoring.md)
- [Diagrams and media](diagrams-and-media.md)
- [Presenting and export](presenting-and-export.md)
