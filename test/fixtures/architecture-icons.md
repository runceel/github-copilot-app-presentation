---
deck: Architecture DSL
kicker: Icons
page: 1
total: 1
---

## Icon catalog and assets/ references

Built-in icons inherit the theme text color; icons under `assets/` render unchanged

```architecture
{
  "version": 1,
  "title": "Icon catalogue",
  "description": "Every built-in icon plus user supplied icons loaded from the assets folder.",
  "canvas": { "width": 1600, "height": 900 },
  "elements": [
    {
      "type": "group",
      "id": "builtin",
      "x": 30,
      "y": 70,
      "width": 1070,
      "height": 800,
      "title": "Built-in icons",
      "layout": { "type": "grid", "columns": 3, "columnGap": 26, "rowGap": 22, "padding": 44 },
      "children": [
        { "type": "node", "id": "i-cloud", "text": "cloud", "icon": "cloud" },
        { "type": "node", "id": "i-database", "text": "database", "icon": "database" },
        { "type": "node", "id": "i-api", "text": "api", "icon": "api" },
        { "type": "node", "id": "i-user", "text": "user", "icon": "user" },
        { "type": "node", "id": "i-server", "text": "server", "icon": "server" },
        { "type": "node", "id": "i-analytics", "text": "analytics", "icon": "analytics" },
        { "type": "node", "id": "i-browser", "text": "browser", "icon": "browser" },
        { "type": "node", "id": "i-mobile", "text": "mobile", "icon": "mobile" },
        { "type": "node", "id": "i-network", "text": "network", "icon": "network" },
        { "type": "node", "id": "i-queue", "text": "queue", "icon": "queue" },
        { "type": "node", "id": "i-shield", "text": "shield", "icon": "shield" }
      ]
    },
    {
      "type": "group",
      "id": "assets",
      "x": 1150,
      "y": 70,
      "width": 420,
      "height": 800,
      "title": "assets/ icons",
      "layout": { "type": "column", "gap": 40, "padding": 44 },
      "children": [
        { "type": "node", "id": "a-svg", "text": "sample.svg", "icon": "assets/sample.svg" },
        { "type": "node", "id": "a-wide", "text": "architecture-image-sample.svg", "icon": "assets/architecture-image-sample.svg" },
        { "type": "node", "id": "a-brand", "text": "markdstage-mark.svg", "icon": "assets/brand/markdstage-mark.svg" }
      ]
    }
  ]
}
```
