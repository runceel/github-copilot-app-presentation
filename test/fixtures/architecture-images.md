---
deck: Architecture DSL
kicker: Images
page: 1
total: 1
---

## カスタム画像の表示方法

`contain`、`cover`、`stretch` と node icon を同じ asset で比較する

```architecture
{
  "version": 1,
  "title": "Image fit modes",
  "canvas": { "width": 1600, "height": 900 },
  "elements": [
    { "type": "node", "id": "contain-label", "text": "contain", "x": 90, "y": 70, "width": 360, "height": 80 },
    { "type": "image", "id": "contain-image", "src": "assets/kazuki-san-post.png", "fit": "contain", "ariaLabel": "contain の画像", "x": 90, "y": 180, "width": 360, "height": 360, "style": { "stroke": "#0078d4", "strokeWidth": 4 } },
    { "type": "node", "id": "cover-label", "text": "cover", "x": 620, "y": 70, "width": 360, "height": 80 },
    { "type": "image", "id": "cover-image", "src": "assets/kazuki-san-post.png", "fit": "cover", "ariaLabel": "cover の画像", "x": 620, "y": 180, "width": 360, "height": 360, "style": { "stroke": "#0078d4", "strokeWidth": 4 } },
    { "type": "node", "id": "stretch-label", "text": "stretch", "x": 1150, "y": 70, "width": 360, "height": 80 },
    { "type": "image", "id": "stretch-image", "src": "assets/kazuki-san-post.png", "fit": "stretch", "ariaLabel": "stretch の画像", "x": 1150, "y": 180, "width": 360, "height": 360, "style": { "stroke": "#0078d4", "strokeWidth": 4 } },
    { "type": "node", "id": "icon-node", "text": "node.icon も同じ picker から選択", "icon": "assets/kazuki-san-post.png", "x": 500, "y": 660, "width": 600, "height": 150 }
  ]
}
```
