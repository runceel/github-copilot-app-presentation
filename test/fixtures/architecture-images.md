---
deck: Architecture DSL
kicker: Images
page: 1
total: 1
---

## Custom image fit modes

Compare `contain`, `cover`, `stretch`, and a node icon using the same asset

```architecture
{
  "version": 1,
  "title": "Image fit modes",
  "canvas": { "width": 1600, "height": 900 },
  "elements": [
    { "type": "node", "id": "contain-label", "text": "contain", "x": 90, "y": 70, "width": 360, "height": 80 },
    { "type": "image", "id": "contain-image", "src": "assets/architecture-image-sample.svg", "fit": "contain", "ariaLabel": "Image using contain", "x": 90, "y": 180, "width": 360, "height": 360, "style": { "stroke": "#0078d4", "strokeWidth": 4 } },
    { "type": "node", "id": "cover-label", "text": "cover", "x": 620, "y": 70, "width": 360, "height": 80 },
    { "type": "image", "id": "cover-image", "src": "assets/architecture-image-sample.svg", "fit": "cover", "ariaLabel": "Image using cover", "x": 620, "y": 180, "width": 360, "height": 360, "style": { "stroke": "#0078d4", "strokeWidth": 4 } },
    { "type": "node", "id": "stretch-label", "text": "stretch", "x": 1150, "y": 70, "width": 360, "height": 80 },
    { "type": "image", "id": "stretch-image", "src": "assets/architecture-image-sample.svg", "fit": "stretch", "ariaLabel": "Image using stretch", "x": 1150, "y": 180, "width": 360, "height": 360, "style": { "stroke": "#0078d4", "strokeWidth": 4 } },
    { "type": "node", "id": "icon-node", "text": "Select node.icon from the same picker", "icon": "assets/architecture-image-sample.svg", "x": 500, "y": 660, "width": 600, "height": 150 }
  ]
}
```
