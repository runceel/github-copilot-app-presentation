---
theme: light
deck: MarkdStage
size: normal
---

## Make the system make sense.

```architecture
{
  "version": 1,
  "title": "A simple request path",
  "canvas": { "width": 1100, "height": 420 },
  "elements": [
    {
      "type": "group", "id": "application",
      "title": "Application", "x": 370, "y": 65,
      "width": 660, "height": 280,
      "children": [
        {
          "type": "node", "id": "api", "text": "API",
          "icon": "api", "x": 45, "y": 75,
          "width": 225, "height": 130
        },
        {
          "type": "node", "id": "data", "text": "Database",
          "icon": "database", "x": 385, "y": 75,
          "width": 225, "height": 130
        }
      ]
    },
    {
      "type": "node", "id": "browser", "text": "Browser",
      "icon": "browser", "x": 35, "y": 140,
      "width": 225, "height": 130
    },
    {
      "type": "connector", "from": "browser", "to": "api",
      "label": "HTTPS", "arrow": true
    },
    {
      "type": "connector", "from": "api", "to": "data",
      "label": "Query", "arrow": true
    }
  ]
}
```
