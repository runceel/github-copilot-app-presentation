---
title: PPTX fallback region test cases
theme: custom
theme-file: theme.css
layout: title
---

# PPTX fallback regions
## Layout-owned and element-sized artwork

Issue #111 manual regression deck

---

## No full-slide fallback

- Editable heading
- Editable paragraph and **emphasis**
- No kicker, image effect, diagram, or custom HTML

Expected: only the generated footer is cropped; no full-slide picture exists.

---
deck: Issue 111
kicker: Page decoration
page: 3
total: 9
size: normal
---

## One-digit page number

> Decorations are cropped to their painted bounds while the text stays editable.

The text remains editable above those pictures.

---
layout: center
deck: Issue 111
page: 10
total: 12
---

## Two-digit centered footer

The footer decoration keeps the measured width for `10 / 12`.

---
theme: light
---

## Multiple Mermaid regions

### Flowchart

```mermaid
flowchart LR
  A[Source] --> B[Clip] --> C[Editable PPTX]
```

### Sequence

```mermaid
sequenceDiagram
  Browser->>Writer: clipped PNG
  Writer-->>PowerPoint: positioned picture
```

Expected: two element-sized Mermaid pictures, not one full-slide picture.

---
size: normal
---

## Native PNG, SVG, GIF, and JPEG

**PNG** <img src="/assets/readme/architecture-dsl.png" alt="PNG sample" style="width:420px;height:100px;object-fit:contain">
**SVG** <img src="/assets/sample.svg" alt="SVG sample" style="width:300px;height:60px;object-fit:contain">
**GIF 1x1 codec probe** <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" alt="GIF sample" style="width:300px;height:28px;object-fit:fill;border:8px solid #22c55e">
**JPEG 1x1 codec probe** <img src="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAEf/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABAf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=" alt="JPEG sample" style="width:300px;height:28px;object-fit:fill;border:8px solid #f97316">

---

## Cropped and unsupported image rendering

**`object-fit: cover`**

<img src="/assets/readme/architecture-editor.png" alt="Cover fit" style="width:520px;height:140px;object-fit:cover;border:3px solid #38bdf8">

**`object-fit: none`**

<img src="/assets/sample.svg" alt="None fit" style="width:420px;height:100px;object-fit:none">

---

## Effects and arbitrary HTML

```js
const fallback = "shadow only";
```

| Native | Table |
| --- | --- |
| Text | stays editable |

<p style="width:70%;transform:rotate(1deg);background:#172554;border:2px solid #38bdf8;padding:8px">Rotated HTML fallback</p>

Expected: code and table shadows plus the transformed paragraph use bounded pictures.

---
theme: light
deck: Issue 111
page: 9
total: 9
---

## Horizontal rule and footer

Editable content above the rule.

<hr style="border-top:4px dashed #f97316">

Editable content below the rule.

Expected: the rule and footer are independent bounded fallback pictures.
