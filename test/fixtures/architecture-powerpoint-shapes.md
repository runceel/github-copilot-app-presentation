---
layout: title
deck: Architecture shapes
---

# PowerPoint-compatible Architecture shapes

Architecture DSL v1 additive shape and connector-style coverage

---

## Native shapes and line styles

```architecture
{
  "version": 1,
  "title": "PowerPoint-compatible shapes",
  "canvas": { "width": 1400, "height": 700 },
  "elements": [
    {
      "type": "node",
      "id": "decision",
      "shape": "diamond",
      "x": 80,
      "y": 100,
      "width": 240,
      "height": 180,
      "text": "Decision"
    },
    {
      "type": "node",
      "id": "signal",
      "shape": "triangle",
      "x": 400,
      "y": 100,
      "width": 240,
      "height": 180,
      "text": "Signal"
    },
    {
      "type": "node",
      "id": "service",
      "shape": "hexagon",
      "x": 720,
      "y": 100,
      "width": 240,
      "height": 180,
      "text": "Service"
    },
    {
      "type": "node",
      "id": "input",
      "shape": "parallelogram",
      "x": 1040,
      "y": 100,
      "width": 260,
      "height": 180,
      "text": "Input"
    },
    {
      "type": "connector",
      "from": "decision",
      "to": "signal",
      "routing": "straight",
      "label": "solid"
    },
    {
      "type": "connector",
      "from": "signal",
      "to": "service",
      "routing": "straight",
      "label": "dotted",
      "style": { "dash": "1 5" }
    },
    {
      "type": "connector",
      "from": "service",
      "to": "input",
      "routing": "straight",
      "label": "dashed",
      "style": { "dash": "10 6" }
    }
  ]
}
```
