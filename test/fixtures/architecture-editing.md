---
deck: Architecture DSL
kicker: Editing
page: 1
total: 1
---

## Editing workflow regression fixture

`client` is a freely movable node; the layout determines the position of group `zone`

```architecture
{
  "version": 1,
  "title": "Editing fixture",
  "description": "A free node, a layout managed group, and connectors that must re-route when a node moves.",
  "canvas": { "width": 1600, "height": 900 },
  "elements": [
    {
      "type": "node",
      "id": "client",
      "text": "Client",
      "icon": "browser",
      "x": 90,
      "y": 380,
      "width": 300,
      "height": 160
    },
    {
      "type": "group",
      "id": "zone",
      "title": "Service zone",
      "x": 560,
      "y": 200,
      "width": 940,
      "height": 520,
      "layout": { "type": "row", "gap": 60, "padding": 60 },
      "children": [
        { "type": "node", "id": "api", "text": "API", "icon": "api" },
        { "type": "node", "id": "worker", "text": "Worker", "icon": "server" }
      ]
    },
    { "type": "connector", "from": "client", "to": "api", "label": "request" },
    { "type": "connector", "from": "api", "to": "worker", "label": "enqueue" }
  ]
}
```
