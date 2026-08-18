---
layout: title
deck: Architecture DSL
title: Architecture DSL visual regression
---

# Architecture DSL

固定レイアウトの構成図をテーマ横断で検証する

<!-- slide -->

---
deck: Architecture DSL
kicker: Layout
page: 2
total: 4
---

## レイアウト駆動の構成図

```architecture
{
  "version": 1,
  "title": "Commerce platform architecture",
  "description": "A three-zone commerce platform with users, edge services, application services, and data stores.",
  "canvas": { "width": 1600, "height": 900 },
  "elements": [
    {
      "type": "group",
      "id": "edge-zone",
      "x": 30,
      "y": 120,
      "width": 340,
      "height": 660,
      "title": "Edge",
      "layout": { "type": "column", "gap": 70, "padding": 50 },
      "children": [
        { "type": "node", "id": "user", "text": "Customer", "icon": "user" },
        { "type": "node", "id": "web", "text": "Web front end", "icon": "server" }
      ]
    },
    {
      "type": "group",
      "id": "service-zone",
      "x": 420,
      "y": 60,
      "width": 730,
      "height": 780,
      "title": "Application services",
      "layout": {
        "type": "grid",
        "columns": 2,
        "columnGap": 110,
        "rowGap": 44,
        "padding": 54
      },
      "children": [
        { "type": "node", "id": "gateway", "text": "API gateway", "icon": "api" },
        { "type": "node", "id": "catalog", "text": "Catalog API", "icon": "api" },
        { "type": "node", "id": "orders", "text": "Order service", "icon": "server" },
        { "type": "node", "id": "queue", "text": "Event queue", "icon": "server" },
        { "type": "node", "id": "cache", "text": "Cache", "icon": "database" },
        { "type": "node", "id": "worker", "text": "Order worker", "icon": "server" }
      ]
    },
    {
      "type": "group",
      "id": "data-zone",
      "x": 1200,
      "y": 120,
      "width": 370,
      "height": 660,
      "title": "Data",
      "layout": "column",
      "children": [
        {
          "type": "node",
          "id": "sql",
          "text": "Operational DB",
          "icon": "database",
          "shape": "ellipse"
        },
        { "type": "node", "id": "blob", "text": "Object storage", "icon": "cloud" }
      ]
    },
    {
      "type": "connector",
      "from": "user",
      "to": "web",
      "fromPort": "bottom",
      "toPort": "top",
      "routing": "orthogonal",
      "label": "HTTPS"
    },
    {
      "type": "connector",
      "from": "web",
      "to": "gateway",
      "fromPort": "right",
      "toPort": "left",
      "routing": "orthogonal"
    },
    {
      "type": "connector",
      "from": "gateway",
      "to": "catalog",
      "fromPort": "right",
      "toPort": "left",
      "routing": "orthogonal",
      "label": "read"
    },
    {
      "type": "connector",
      "from": "gateway",
      "to": "orders",
      "fromPort": "bottom",
      "toPort": "top",
      "routing": "orthogonal"
    },
    {
      "type": "connector",
      "from": "orders",
      "to": "queue",
      "fromPort": "right",
      "toPort": "left",
      "routing": "orthogonal"
    },
    {
      "type": "connector",
      "from": "queue",
      "to": "worker",
      "fromPort": "bottom",
      "toPort": "top",
      "routing": "orthogonal"
    },
    {
      "type": "connector",
      "from": "catalog",
      "to": "sql",
      "fromPort": "right",
      "toPort": "left",
      "routing": "orthogonal",
      "label": "query"
    },
    {
      "type": "connector",
      "from": "worker",
      "to": "blob",
      "fromPort": "right",
      "toPort": "left",
      "routing": "orthogonal",
      "label": "archive"
    }
  ]
}
```

<!-- slide -->

---
deck: Architecture DSL
kicker: Shapes & routing
page: 3
total: 4
---

## 図形・スタイル・経路の網羅

```architecture
{
  "version": 1,
  "title": "Shape, style and routing coverage",
  "description": "Every shape, every routing mode and the supported style keys in one diagram.",
  "canvas": { "width": 1600, "height": 900 },
  "elements": [
    {
      "type": "node",
      "id": "rect",
      "shape": "rect",
      "x": 90,
      "y": 120,
      "width": 300,
      "height": 150,
      "text": "rect",
      "style": { "fill": "surface", "stroke": "accent", "strokeWidth": 3 }
    },
    {
      "type": "node",
      "id": "rounded",
      "shape": "rounded-rect",
      "x": 90,
      "y": 380,
      "width": 300,
      "height": 150,
      "text": "rounded-rect",
      "style": { "fill": "accentSoft", "stroke": "accentStrong", "cornerRadius": 36 }
    },
    {
      "type": "node",
      "id": "ellipse",
      "shape": "ellipse",
      "x": 90,
      "y": 640,
      "width": 300,
      "height": 160,
      "text": "ellipse",
      "style": { "fill": "bg", "stroke": "accentLine", "dash": "10 6" }
    },
    {
      "type": "group",
      "id": "styled-zone",
      "x": 560,
      "y": 110,
      "width": 500,
      "height": 690,
      "title": "Styled group",
      "layout": { "type": "column", "gap": 56, "padding": 56 },
      "style": { "fill": "surface", "stroke": "border" },
      "children": [
        {
          "type": "node",
          "id": "muted",
          "text": "muted text",
          "icon": "cloud",
          "style": { "textColor": "muted", "fontSize": 26 }
        },
        {
          "type": "node",
          "id": "faded",
          "text": "opacity 0.55",
          "icon": "database",
          "style": { "opacity": 0.55 }
        },
        {
          "type": "node",
          "id": "literal",
          "text": "literal color",
          "icon": "api",
          "style": { "fill": "#2b5cff", "textColor": "white", "stroke": "none" }
        }
      ]
    },
    {
      "type": "node",
      "id": "straight-target",
      "shape": "rounded-rect",
      "x": 1230,
      "y": 140,
      "width": 290,
      "height": 140,
      "text": "straight",
      "style": { "fill": "surface", "stroke": "accent" }
    },
    {
      "type": "node",
      "id": "orthogonal-target",
      "shape": "rounded-rect",
      "x": 1230,
      "y": 390,
      "width": 290,
      "height": 140,
      "text": "orthogonal",
      "style": { "fill": "surface", "stroke": "accent" }
    },
    {
      "type": "node",
      "id": "polyline-target",
      "shape": "rounded-rect",
      "x": 1230,
      "y": 640,
      "width": 290,
      "height": 140,
      "text": "polyline",
      "style": { "fill": "surface", "stroke": "accent" }
    },
    {
      "type": "connector",
      "from": "muted",
      "to": "straight-target",
      "fromPort": "right",
      "toPort": "left",
      "routing": "straight",
      "label": "straight"
    },
    {
      "type": "connector",
      "from": "faded",
      "to": "orthogonal-target",
      "fromPort": "right",
      "toPort": "left",
      "routing": "orthogonal",
      "label": "orthogonal"
    },
    {
      "type": "connector",
      "from": "literal",
      "to": "polyline-target",
      "fromPort": "right",
      "toPort": "left",
      "routing": "polyline",
      "points": [
        { "x": 1130, "y": 700 },
        { "x": 1130, "y": 710 }
      ],
      "label": "polyline"
    },
    {
      "type": "connector",
      "from": "rect",
      "to": "rounded",
      "fromPort": "bottom",
      "toPort": "top",
      "routing": "orthogonal",
      "arrow": false
    },
    {
      "type": "connector",
      "from": "rounded",
      "to": "ellipse",
      "fromPort": "bottom",
      "toPort": "top",
      "routing": "orthogonal",
      "style": { "stroke": "accentStrong", "strokeWidth": 4, "dash": "8 6" }
    }
  ]
}
```

<!-- slide -->

---
layout: backcover
deck: Architecture DSL
page: 4
total: 4
---
