# MarkdStage design system

## Brand idea

MarkdStage turns written Markdown into something ready to perform. The visual identity combines the Markdown heading mark `#` with the physical language of a stage spotlight: focused light, a dark surrounding field, and one clear place for attention.

The product should feel creator-first, exact, and quietly theatrical. It is a technical tool with a point of view, not presentation software decorated with generic gradients or playback symbols.

## Logo system

The primary symbol is a geometric `#` illuminated by an amber beam on a Midnight Ink tile.

- `assets/brand/markdstage-mark.svg`: standalone symbol
- `assets/brand/markdstage-lockup.svg`: symbol, wordmark, and tagline
- `assets/brand/markdstage-banner.svg`: repository header
- `apps/MarkdStage.Desktop/src/MarkdStage.App/Assets/AppIcon.svg`: Windows application master icon

Use the symbol alone for square icons and compact product chrome. Use the lockup when the product name must be learned. Do not place the logo or wordmark on user-created slides or exported PDFs unless the author explicitly selects it as deck content or theme metadata.

## Color

| Role | Value | Use |
| --- | --- | --- |
| Midnight Ink | `#0B1020` | Primary dark field and brand background |
| Stage Navy | `#151B2F` | Elevated shell surfaces and title bars |
| Spotlight Amber | `#FFB547` | Primary actions, focus moments, and the illuminated brand accent |
| Warm Light | `#FFD77A` | Highlight edge, glow, and secondary emphasis |
| Paper | `#F7F4ED` | Primary text and the Markdown mark |
| Cool Copy | `#C8CEDD` | Supporting text on dark brand surfaces |

Use a restrained strategy: Midnight Ink owns the surface, Paper carries information, and Spotlight Amber identifies the single action or focal point. Amber is not a decorative scatter color.

## Typography

Use the platform system stack:

```css
"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif
```

Windows uses Segoe UI through native controls. Display copy is heavy, tightly tracked, and short; operating UI remains workmanlike and highly legible. Monospace is reserved for Markdown, code, identifiers, and measured data.

## Canvas shell

The empty MarkdStage canvas is a backstage-to-stage threshold:

- The promise sits on the left in large Paper text.
- An oversized `#` occupies the right side inside the spotlight.
- `Open Markdown` is the only primary action.
- Navigation chrome recedes after a deck loads.

Deck themes remain content-controlled. MarkdStage branding may shape the empty state and operating chrome but must not silently recolor an author's `dark`, `light`, `microsoft`, or `custom` deck.

## Windows shell

MarkdStage Desktop follows native WinUI structure and behavior. Brand expression is concentrated in the application icon, app identity, title bar, and empty/first-run moments; controls remain native, accessible, and familiar.

Light mode uses Paper with Midnight Ink text. Dark mode uses Stage Navy with Paper text. High contrast always defers to system colors.

## Voice and copy

- Lead with the result: Markdown becomes ready to present.
- Prefer short action labels: `Open Markdown`, `Start presentation`, `Save as PDF`.
- Use “MarkdStage” for the product and canvas identity.
- Use “presentation”, “presenter”, “slide”, and “deck” normally when they describe product concepts.
- Describe GitHub Copilot as an integration, not as part of the MarkdStage brand name.

Primary tagline:

> Markdown, ready for the stage.

Alternate tagline:

> Markdown, take the stage.

## Accessibility

- Body and control text must meet WCAG AA contrast.
- Spotlight effects must never be the only carrier of meaning.
- Focus indicators use a high-contrast theme color and remain visible in forced-colors mode.
- Motion must respect `prefers-reduced-motion`.
- Icons require accessible names unless they are decorative.
- Branding changes must preserve keyboard navigation and semantic slide output.
