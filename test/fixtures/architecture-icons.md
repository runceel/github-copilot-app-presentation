---
deck: Architecture DSL
kicker: Icons
page: 1
total: 1
---

## アイコンのカタログと assets/ 参照

組み込みアイコンはテーマのテキスト色を継承し、`assets/` のアイコンはそのまま描かれる

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
        { "type": "node", "id": "a-png", "text": "kazuki-san-post.png", "icon": "assets/kazuki-san-post.png" },
        { "type": "node", "id": "a-jpg", "text": "profile.jpg", "icon": "assets/profile.jpg" }
      ]
    }
  ]
}
```
