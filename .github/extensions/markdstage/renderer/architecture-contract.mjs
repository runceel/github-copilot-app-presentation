// Generated from schema/architecture-v1.schema.json. Do not edit.
// Regenerate: node .github/extensions/markdstage/scripts/generate-architecture-contract.mjs
// Structural metadata only; renderer/architecture.mjs remains the semantic authority.
export const architectureContract = {
  "root": {
    "properties": {
      "$schema": {
        "type": "string",
        "description": "Schema reference for editor completion and validation. Ignored at runtime."
      },
      "version": {
        "const": 1,
        "description": "DSL grammar version. v1 accepts only 1. An omitted value is also treated as 1."
      },
      "canvas": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "width": {
            "type": "number",
            "minimum": 320,
            "maximum": 4000
          },
          "height": {
            "type": "number",
            "minimum": 180,
            "maximum": 4000
          }
        },
        "description": "Diagram logical coordinate-system size. Defaults to 1600x900."
      },
      "title": {
        "type": "string",
        "maxLength": 200,
        "description": "Accessible name for the diagram. Defaults to \"Architecture diagram\"."
      },
      "description": {
        "type": "string",
        "maxLength": 1000,
        "description": "Supplementary diagram description used by screen readers."
      },
      "elements": {
        "type": "array",
        "maxItems": 200,
        "description": "Top-level element array. A complete diagram may contain up to 200 elements and 100 connectors; parseArchitecture enforces these aggregate limits.",
        "items": {
          "$ref": "#/$defs/elementFixedL0"
        }
      }
    },
    "required": [
      "elements"
    ]
  },
  "elements": {
    "node": {
      "properties": {
        "type": {
          "description": "Element type.",
          "const": "node"
        },
        "id": {
          "type": "string",
          "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
          "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
        },
        "shape": {
          "enum": [
            "rect",
            "rounded-rect",
            "ellipse",
            "diamond",
            "triangle",
            "hexagon",
            "parallelogram"
          ]
        },
        "x": {
          "type": "number",
          "minimum": -4000,
          "maximum": 4000,
          "description": "Coordinate in the canvas coordinate system, relative to the parent group."
        },
        "y": {
          "type": "number",
          "minimum": -4000,
          "maximum": 4000,
          "description": "Coordinate in the canvas coordinate system, relative to the parent group."
        },
        "width": {
          "type": "number",
          "minimum": 1,
          "maximum": 4000,
          "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
        },
        "height": {
          "type": "number",
          "minimum": 1,
          "maximum": 4000,
          "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
        },
        "text": {
          "type": "string",
          "maxLength": 500
        },
        "icon": {
          "anyOf": [
            {
              "enum": [
                "cloud",
                "database",
                "api",
                "user",
                "server",
                "analytics",
                "browser",
                "mobile",
                "network",
                "queue",
                "shield"
              ],
              "description": "Built-in icon name. Icons render as 24x24 line art using the node textColor for the stroke, so their colors automatically adapt to all four themes."
            },
            {
              "type": "string",
              "maxLength": 200,
              "pattern": "^assets/(?:[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*/)*[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*\\.(?:[Ss][Vv][Gg]|[Pp][Nn][Gg]|[Ww][Ee][Bb][Pp]|[Jj][Pp][Gg]|[Jj][Pp][Ee][Gg])$",
              "description": "Image under assets/ used as a node icon. Raster images and SVG files loaded through <image> do not adapt to theme colors, so use artwork that remains legible against every theme background."
            }
          ],
          "description": "Built-in icon name or path to an icon under assets/."
        },
        "ariaLabel": {
          "type": "string",
          "maxLength": 300
        },
        "z": {
          "type": "number",
          "minimum": -100,
          "maximum": 100,
          "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
        },
        "style": {
          "type": "object",
          "additionalProperties": false,
          "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
          "properties": {
            "fill": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "stroke": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "textColor": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "strokeWidth": {
              "type": "number",
              "minimum": 0.5,
              "maximum": 20
            },
            "fontSize": {
              "type": "number",
              "minimum": 8,
              "maximum": 160
            },
            "opacity": {
              "type": "number",
              "minimum": 0,
              "maximum": 1
            },
            "dash": {
              "type": "string",
              "maxLength": 40,
              "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
              "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
            },
            "cornerRadius": {
              "type": "number",
              "minimum": 0,
              "maximum": 200
            }
          }
        }
      },
      "required": {
        "fixed": [
          "type",
          "id",
          "x",
          "y",
          "width",
          "height"
        ],
        "flow": [
          "type",
          "id"
        ]
      }
    },
    "group": {
      "properties": {
        "type": {
          "description": "Element type.",
          "const": "group"
        },
        "id": {
          "type": "string",
          "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
          "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
        },
        "x": {
          "type": "number",
          "minimum": -4000,
          "maximum": 4000,
          "description": "Coordinate in the canvas coordinate system, relative to the parent group."
        },
        "y": {
          "type": "number",
          "minimum": -4000,
          "maximum": 4000,
          "description": "Coordinate in the canvas coordinate system, relative to the parent group."
        },
        "width": {
          "type": "number",
          "minimum": 1,
          "maximum": 4000,
          "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
        },
        "height": {
          "type": "number",
          "minimum": 1,
          "maximum": 4000,
          "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
        },
        "title": {
          "type": "string",
          "maxLength": 200
        },
        "ariaLabel": {
          "type": "string",
          "maxLength": 300
        },
        "layout": {
          "anyOf": [
            {
              "enum": [
                "row",
                "column",
                "grid",
                "layered"
              ],
              "description": "String shorthand. Defaults are gap 36 / padding 54 / columns 3 / direction \"down\"."
            },
            {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "type"
              ],
              "properties": {
                "type": {
                  "enum": [
                    "row",
                    "column",
                    "grid",
                    "layered"
                  ]
                },
                "gap": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 240
                },
                "rowGap": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 240
                },
                "columnGap": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 240
                },
                "padding": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 400
                },
                "columns": {
                  "type": "number",
                  "minimum": 1,
                  "maximum": 12,
                  "description": "Number of grid columns. Fractional values are truncated. Ignored for row / column / layered."
                },
                "direction": {
                  "enum": [
                    "down",
                    "right"
                  ],
                  "description": "Direction in which layered ranks extend. down means top to bottom; right means left to right. Not allowed for layouts other than layered."
                }
              },
              "allOf": [
                {
                  "if": {
                    "not": {
                      "properties": {
                        "type": {
                          "const": "layered"
                        }
                      },
                      "required": [
                        "type"
                      ]
                    }
                  },
                  "then": {
                    "not": {
                      "required": [
                        "direction"
                      ]
                    }
                  }
                }
              ]
            }
          ],
          "description": "Automatic child placement. When specified, child x / y / width / height values are calculated automatically, and explicit x / y values are ignored. layered infers ranks from connectors between children."
        },
        "z": {
          "type": "number",
          "minimum": -100,
          "maximum": 100,
          "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
        },
        "style": {
          "type": "object",
          "additionalProperties": false,
          "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
          "properties": {
            "fill": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "stroke": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "textColor": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "strokeWidth": {
              "type": "number",
              "minimum": 0.5,
              "maximum": 20
            },
            "fontSize": {
              "type": "number",
              "minimum": 8,
              "maximum": 160
            },
            "opacity": {
              "type": "number",
              "minimum": 0,
              "maximum": 1
            },
            "dash": {
              "type": "string",
              "maxLength": 40,
              "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
              "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
            },
            "cornerRadius": {
              "type": "number",
              "minimum": 0,
              "maximum": 200
            }
          }
        },
        "children": {
          "type": "array",
          "maxItems": 200
        }
      },
      "required": {
        "fixed": [
          "type",
          "id",
          "x",
          "y",
          "width",
          "height"
        ],
        "flow": [
          "type",
          "id"
        ]
      },
      "if": {
        "type": "object",
        "required": [
          "layout"
        ]
      },
      "then": {
        "type": "object",
        "properties": {
          "children": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/elementFlowL1"
            }
          }
        }
      },
      "else": {
        "type": "object",
        "properties": {
          "children": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/elementFixedL1"
            }
          }
        }
      }
    },
    "image": {
      "properties": {
        "type": {
          "description": "Element type.",
          "const": "image"
        },
        "id": {
          "type": "string",
          "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
          "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
        },
        "src": {
          "type": "string",
          "maxLength": 200,
          "pattern": "^assets/(?:[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*/)*[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*\\.(?:[Ss][Vv][Gg]|[Pp][Nn][Gg]|[Ww][Ee][Bb][Pp]|[Jj][Pp][Gg]|[Jj][Pp][Ee][Gg])$",
          "description": "Image in the repository assets/ directory. Supported extensions are .svg / .png / .webp / .jpg / .jpeg, including uppercase variants. The syntax cannot represent paths containing '..', data: URIs, or external URLs."
        },
        "fit": {
          "enum": [
            "contain",
            "cover",
            "stretch"
          ]
        },
        "x": {
          "type": "number",
          "minimum": -4000,
          "maximum": 4000,
          "description": "Coordinate in the canvas coordinate system, relative to the parent group."
        },
        "y": {
          "type": "number",
          "minimum": -4000,
          "maximum": 4000,
          "description": "Coordinate in the canvas coordinate system, relative to the parent group."
        },
        "width": {
          "type": "number",
          "minimum": 1,
          "maximum": 4000,
          "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
        },
        "height": {
          "type": "number",
          "minimum": 1,
          "maximum": 4000,
          "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
        },
        "ariaLabel": {
          "type": "string",
          "maxLength": 300,
          "description": "Alternative text for the image. Defaults first to the src file name and then to the id."
        },
        "z": {
          "type": "number",
          "minimum": -100,
          "maximum": 100,
          "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
        },
        "style": {
          "type": "object",
          "additionalProperties": false,
          "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
          "properties": {
            "fill": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "stroke": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "textColor": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "strokeWidth": {
              "type": "number",
              "minimum": 0.5,
              "maximum": 20
            },
            "fontSize": {
              "type": "number",
              "minimum": 8,
              "maximum": 160
            },
            "opacity": {
              "type": "number",
              "minimum": 0,
              "maximum": 1
            },
            "dash": {
              "type": "string",
              "maxLength": 40,
              "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
              "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
            },
            "cornerRadius": {
              "type": "number",
              "minimum": 0,
              "maximum": 200
            }
          }
        }
      },
      "required": {
        "fixed": [
          "type",
          "id",
          "src",
          "x",
          "y",
          "width",
          "height"
        ],
        "flow": [
          "type",
          "id",
          "src"
        ]
      }
    },
    "connector": {
      "properties": {
        "type": {
          "description": "Element type.",
          "const": "connector"
        },
        "from": {
          "type": "string",
          "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
          "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
        },
        "to": {
          "type": "string",
          "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
          "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
        },
        "fromPort": {
          "enum": [
            "auto",
            "top",
            "right",
            "bottom",
            "left"
          ]
        },
        "toPort": {
          "enum": [
            "auto",
            "top",
            "right",
            "bottom",
            "left"
          ]
        },
        "label": {
          "type": "string",
          "maxLength": 200
        },
        "labelLayer": {
          "enum": [
            "front",
            "behind"
          ],
          "default": "front",
          "description": "Label stacking order. front renders above boxes; behind uses the connector body's stacking order."
        },
        "ariaLabel": {
          "type": "string",
          "maxLength": 300
        },
        "routing": {
          "enum": [
            "straight",
            "orthogonal",
            "polyline"
          ]
        },
        "points": {
          "type": "array",
          "maxItems": 12,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "x",
              "y"
            ],
            "properties": {
              "x": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "y": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              }
            }
          },
          "description": "Waypoints allowed only when routing is polyline."
        },
        "arrow": {
          "type": "boolean"
        },
        "lane": {
          "type": "number",
          "minimum": -12,
          "maximum": 12,
          "description": "Separation lane for parallel connectors. Fractional values are truncated."
        },
        "z": {
          "type": "number",
          "minimum": -100,
          "maximum": 100,
          "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
        },
        "style": {
          "type": "object",
          "additionalProperties": false,
          "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
          "properties": {
            "fill": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "stroke": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "textColor": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "strokeWidth": {
              "type": "number",
              "minimum": 0.5,
              "maximum": 20
            },
            "fontSize": {
              "type": "number",
              "minimum": 8,
              "maximum": 160
            },
            "opacity": {
              "type": "number",
              "minimum": 0,
              "maximum": 1
            },
            "dash": {
              "type": "string",
              "maxLength": 40,
              "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
              "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
            },
            "cornerRadius": {
              "type": "number",
              "minimum": 0,
              "maximum": 200
            }
          }
        }
      },
      "required": {
        "fixed": [
          "type",
          "from",
          "to"
        ],
        "flow": [
          "type",
          "from",
          "to"
        ]
      },
      "if": {
        "type": "object",
        "required": [
          "routing"
        ],
        "properties": {
          "routing": {
            "const": "polyline"
          }
        }
      },
      "else": {
        "type": "object",
        "properties": {
          "points": {
            "type": "array",
            "maxItems": 0,
            "description": "points may be specified only when routing is polyline."
          }
        }
      }
    }
  },
  "definitions": {
    "themeToken": {
      "enum": [
        "accent",
        "accentStrong",
        "accentSoft",
        "accentLine",
        "surface",
        "fg",
        "muted",
        "body",
        "border",
        "bg"
      ],
      "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
    },
    "literalColor": {
      "type": "string",
      "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
      "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
    },
    "color": {
      "anyOf": [
        {
          "enum": [
            "accent",
            "accentStrong",
            "accentSoft",
            "accentLine",
            "surface",
            "fg",
            "muted",
            "body",
            "border",
            "bg"
          ],
          "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
        },
        {
          "type": "string",
          "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
          "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
        }
      ],
      "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
    },
    "iconName": {
      "enum": [
        "cloud",
        "database",
        "api",
        "user",
        "server",
        "analytics",
        "browser",
        "mobile",
        "network",
        "queue",
        "shield"
      ],
      "description": "Built-in icon name. Icons render as 24x24 line art using the node textColor for the stroke, so their colors automatically adapt to all four themes."
    },
    "assetPath": {
      "type": "string",
      "maxLength": 200,
      "pattern": "^assets/(?:[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*/)*[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*\\.(?:[Ss][Vv][Gg]|[Pp][Nn][Gg]|[Ww][Ee][Bb][Pp]|[Jj][Pp][Gg]|[Jj][Pp][Ee][Gg])$",
      "description": "Image in the repository assets/ directory. Supported extensions are .svg / .png / .webp / .jpg / .jpeg, including uppercase variants. The syntax cannot represent paths containing '..', data: URIs, or external URLs."
    },
    "iconAsset": {
      "type": "string",
      "maxLength": 200,
      "pattern": "^assets/(?:[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*/)*[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*\\.(?:[Ss][Vv][Gg]|[Pp][Nn][Gg]|[Ww][Ee][Bb][Pp]|[Jj][Pp][Gg]|[Jj][Pp][Ee][Gg])$",
      "description": "Image under assets/ used as a node icon. Raster images and SVG files loaded through <image> do not adapt to theme colors, so use artwork that remains legible against every theme background."
    },
    "icon": {
      "anyOf": [
        {
          "enum": [
            "cloud",
            "database",
            "api",
            "user",
            "server",
            "analytics",
            "browser",
            "mobile",
            "network",
            "queue",
            "shield"
          ],
          "description": "Built-in icon name. Icons render as 24x24 line art using the node textColor for the stroke, so their colors automatically adapt to all four themes."
        },
        {
          "type": "string",
          "maxLength": 200,
          "pattern": "^assets/(?:[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*/)*[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*\\.(?:[Ss][Vv][Gg]|[Pp][Nn][Gg]|[Ww][Ee][Bb][Pp]|[Jj][Pp][Gg]|[Jj][Pp][Ee][Gg])$",
          "description": "Image under assets/ used as a node icon. Raster images and SVG files loaded through <image> do not adapt to theme colors, so use artwork that remains legible against every theme background."
        }
      ],
      "description": "Built-in icon name or path to an icon under assets/."
    },
    "identifier": {
      "type": "string",
      "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
      "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
    },
    "coordinate": {
      "type": "number",
      "minimum": -4000,
      "maximum": 4000,
      "description": "Coordinate in the canvas coordinate system, relative to the parent group."
    },
    "extent": {
      "type": "number",
      "minimum": 1,
      "maximum": 4000,
      "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
    },
    "zIndex": {
      "type": "number",
      "minimum": -100,
      "maximum": 100,
      "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
    },
    "canvas": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "width": {
          "type": "number",
          "minimum": 320,
          "maximum": 4000
        },
        "height": {
          "type": "number",
          "minimum": 180,
          "maximum": 4000
        }
      }
    },
    "style": {
      "type": "object",
      "additionalProperties": false,
      "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
      "properties": {
        "fill": {
          "anyOf": [
            {
              "enum": [
                "accent",
                "accentStrong",
                "accentSoft",
                "accentLine",
                "surface",
                "fg",
                "muted",
                "body",
                "border",
                "bg"
              ],
              "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
            },
            {
              "type": "string",
              "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
              "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
            }
          ],
          "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
        },
        "stroke": {
          "anyOf": [
            {
              "enum": [
                "accent",
                "accentStrong",
                "accentSoft",
                "accentLine",
                "surface",
                "fg",
                "muted",
                "body",
                "border",
                "bg"
              ],
              "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
            },
            {
              "type": "string",
              "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
              "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
            }
          ],
          "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
        },
        "textColor": {
          "anyOf": [
            {
              "enum": [
                "accent",
                "accentStrong",
                "accentSoft",
                "accentLine",
                "surface",
                "fg",
                "muted",
                "body",
                "border",
                "bg"
              ],
              "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
            },
            {
              "type": "string",
              "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
              "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
            }
          ],
          "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
        },
        "strokeWidth": {
          "type": "number",
          "minimum": 0.5,
          "maximum": 20
        },
        "fontSize": {
          "type": "number",
          "minimum": 8,
          "maximum": 160
        },
        "opacity": {
          "type": "number",
          "minimum": 0,
          "maximum": 1
        },
        "dash": {
          "type": "string",
          "maxLength": 40,
          "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
          "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
        },
        "cornerRadius": {
          "type": "number",
          "minimum": 0,
          "maximum": 200
        }
      }
    },
    "layoutObject": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type"
      ],
      "properties": {
        "type": {
          "enum": [
            "row",
            "column",
            "grid",
            "layered"
          ]
        },
        "gap": {
          "type": "number",
          "minimum": 0,
          "maximum": 240
        },
        "rowGap": {
          "type": "number",
          "minimum": 0,
          "maximum": 240
        },
        "columnGap": {
          "type": "number",
          "minimum": 0,
          "maximum": 240
        },
        "padding": {
          "type": "number",
          "minimum": 0,
          "maximum": 400
        },
        "columns": {
          "type": "number",
          "minimum": 1,
          "maximum": 12,
          "description": "Number of grid columns. Fractional values are truncated. Ignored for row / column / layered."
        },
        "direction": {
          "enum": [
            "down",
            "right"
          ],
          "description": "Direction in which layered ranks extend. down means top to bottom; right means left to right. Not allowed for layouts other than layered."
        }
      },
      "allOf": [
        {
          "if": {
            "not": {
              "properties": {
                "type": {
                  "const": "layered"
                }
              },
              "required": [
                "type"
              ]
            }
          },
          "then": {
            "not": {
              "required": [
                "direction"
              ]
            }
          }
        }
      ]
    },
    "layout": {
      "anyOf": [
        {
          "enum": [
            "row",
            "column",
            "grid",
            "layered"
          ],
          "description": "String shorthand. Defaults are gap 36 / padding 54 / columns 3 / direction \"down\"."
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "type"
          ],
          "properties": {
            "type": {
              "enum": [
                "row",
                "column",
                "grid",
                "layered"
              ]
            },
            "gap": {
              "type": "number",
              "minimum": 0,
              "maximum": 240
            },
            "rowGap": {
              "type": "number",
              "minimum": 0,
              "maximum": 240
            },
            "columnGap": {
              "type": "number",
              "minimum": 0,
              "maximum": 240
            },
            "padding": {
              "type": "number",
              "minimum": 0,
              "maximum": 400
            },
            "columns": {
              "type": "number",
              "minimum": 1,
              "maximum": 12,
              "description": "Number of grid columns. Fractional values are truncated. Ignored for row / column / layered."
            },
            "direction": {
              "enum": [
                "down",
                "right"
              ],
              "description": "Direction in which layered ranks extend. down means top to bottom; right means left to right. Not allowed for layouts other than layered."
            }
          },
          "allOf": [
            {
              "if": {
                "not": {
                  "properties": {
                    "type": {
                      "const": "layered"
                    }
                  },
                  "required": [
                    "type"
                  ]
                }
              },
              "then": {
                "not": {
                  "required": [
                    "direction"
                  ]
                }
              }
            }
          ]
        }
      ],
      "description": "Automatic child placement. When specified, child x / y / width / height values are calculated automatically, and explicit x / y values are ignored. layered infers ranks from connectors between children."
    },
    "point": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "x",
        "y"
      ],
      "properties": {
        "x": {
          "type": "number",
          "minimum": -4000,
          "maximum": 4000,
          "description": "Coordinate in the canvas coordinate system, relative to the parent group."
        },
        "y": {
          "type": "number",
          "minimum": -4000,
          "maximum": 4000,
          "description": "Coordinate in the canvas coordinate system, relative to the parent group."
        }
      }
    },
    "nodeBase": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "id"
      ],
      "properties": {
        "type": {
          "const": "node"
        },
        "id": {
          "type": "string",
          "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
          "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
        },
        "shape": {
          "enum": [
            "rect",
            "rounded-rect",
            "ellipse",
            "diamond",
            "triangle",
            "hexagon",
            "parallelogram"
          ]
        },
        "x": {
          "type": "number",
          "minimum": -4000,
          "maximum": 4000,
          "description": "Coordinate in the canvas coordinate system, relative to the parent group."
        },
        "y": {
          "type": "number",
          "minimum": -4000,
          "maximum": 4000,
          "description": "Coordinate in the canvas coordinate system, relative to the parent group."
        },
        "width": {
          "type": "number",
          "minimum": 1,
          "maximum": 4000,
          "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
        },
        "height": {
          "type": "number",
          "minimum": 1,
          "maximum": 4000,
          "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
        },
        "text": {
          "type": "string",
          "maxLength": 500
        },
        "icon": {
          "anyOf": [
            {
              "enum": [
                "cloud",
                "database",
                "api",
                "user",
                "server",
                "analytics",
                "browser",
                "mobile",
                "network",
                "queue",
                "shield"
              ],
              "description": "Built-in icon name. Icons render as 24x24 line art using the node textColor for the stroke, so their colors automatically adapt to all four themes."
            },
            {
              "type": "string",
              "maxLength": 200,
              "pattern": "^assets/(?:[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*/)*[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*\\.(?:[Ss][Vv][Gg]|[Pp][Nn][Gg]|[Ww][Ee][Bb][Pp]|[Jj][Pp][Gg]|[Jj][Pp][Ee][Gg])$",
              "description": "Image under assets/ used as a node icon. Raster images and SVG files loaded through <image> do not adapt to theme colors, so use artwork that remains legible against every theme background."
            }
          ],
          "description": "Built-in icon name or path to an icon under assets/."
        },
        "ariaLabel": {
          "type": "string",
          "maxLength": 300
        },
        "z": {
          "type": "number",
          "minimum": -100,
          "maximum": 100,
          "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
        },
        "style": {
          "type": "object",
          "additionalProperties": false,
          "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
          "properties": {
            "fill": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "stroke": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "textColor": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "strokeWidth": {
              "type": "number",
              "minimum": 0.5,
              "maximum": 20
            },
            "fontSize": {
              "type": "number",
              "minimum": 8,
              "maximum": 160
            },
            "opacity": {
              "type": "number",
              "minimum": 0,
              "maximum": 1
            },
            "dash": {
              "type": "string",
              "maxLength": 40,
              "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
              "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
            },
            "cornerRadius": {
              "type": "number",
              "minimum": 0,
              "maximum": 200
            }
          }
        }
      }
    },
    "nodeFixed": {
      "description": "x / y / width / height are required directly under a parent without a layout.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "id",
        "x",
        "y",
        "width",
        "height"
      ],
      "properties": {
        "type": {
          "const": "node"
        },
        "id": {
          "type": "string",
          "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
          "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
        },
        "shape": {
          "enum": [
            "rect",
            "rounded-rect",
            "ellipse",
            "diamond",
            "triangle",
            "hexagon",
            "parallelogram"
          ]
        },
        "x": {
          "type": "number",
          "minimum": -4000,
          "maximum": 4000,
          "description": "Coordinate in the canvas coordinate system, relative to the parent group."
        },
        "y": {
          "type": "number",
          "minimum": -4000,
          "maximum": 4000,
          "description": "Coordinate in the canvas coordinate system, relative to the parent group."
        },
        "width": {
          "type": "number",
          "minimum": 1,
          "maximum": 4000,
          "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
        },
        "height": {
          "type": "number",
          "minimum": 1,
          "maximum": 4000,
          "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
        },
        "text": {
          "type": "string",
          "maxLength": 500
        },
        "icon": {
          "anyOf": [
            {
              "enum": [
                "cloud",
                "database",
                "api",
                "user",
                "server",
                "analytics",
                "browser",
                "mobile",
                "network",
                "queue",
                "shield"
              ],
              "description": "Built-in icon name. Icons render as 24x24 line art using the node textColor for the stroke, so their colors automatically adapt to all four themes."
            },
            {
              "type": "string",
              "maxLength": 200,
              "pattern": "^assets/(?:[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*/)*[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*\\.(?:[Ss][Vv][Gg]|[Pp][Nn][Gg]|[Ww][Ee][Bb][Pp]|[Jj][Pp][Gg]|[Jj][Pp][Ee][Gg])$",
              "description": "Image under assets/ used as a node icon. Raster images and SVG files loaded through <image> do not adapt to theme colors, so use artwork that remains legible against every theme background."
            }
          ],
          "description": "Built-in icon name or path to an icon under assets/."
        },
        "ariaLabel": {
          "type": "string",
          "maxLength": 300
        },
        "z": {
          "type": "number",
          "minimum": -100,
          "maximum": 100,
          "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
        },
        "style": {
          "type": "object",
          "additionalProperties": false,
          "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
          "properties": {
            "fill": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "stroke": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "textColor": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "strokeWidth": {
              "type": "number",
              "minimum": 0.5,
              "maximum": 20
            },
            "fontSize": {
              "type": "number",
              "minimum": 8,
              "maximum": 160
            },
            "opacity": {
              "type": "number",
              "minimum": 0,
              "maximum": 1
            },
            "dash": {
              "type": "string",
              "maxLength": 40,
              "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
              "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
            },
            "cornerRadius": {
              "type": "number",
              "minimum": 0,
              "maximum": 200
            }
          }
        }
      }
    },
    "nodeFlow": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "id"
      ],
      "properties": {
        "type": {
          "const": "node"
        },
        "id": {
          "type": "string",
          "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
          "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
        },
        "shape": {
          "enum": [
            "rect",
            "rounded-rect",
            "ellipse",
            "diamond",
            "triangle",
            "hexagon",
            "parallelogram"
          ]
        },
        "x": {
          "type": "number",
          "minimum": -4000,
          "maximum": 4000,
          "description": "Coordinate in the canvas coordinate system, relative to the parent group."
        },
        "y": {
          "type": "number",
          "minimum": -4000,
          "maximum": 4000,
          "description": "Coordinate in the canvas coordinate system, relative to the parent group."
        },
        "width": {
          "type": "number",
          "minimum": 1,
          "maximum": 4000,
          "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
        },
        "height": {
          "type": "number",
          "minimum": 1,
          "maximum": 4000,
          "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
        },
        "text": {
          "type": "string",
          "maxLength": 500
        },
        "icon": {
          "anyOf": [
            {
              "enum": [
                "cloud",
                "database",
                "api",
                "user",
                "server",
                "analytics",
                "browser",
                "mobile",
                "network",
                "queue",
                "shield"
              ],
              "description": "Built-in icon name. Icons render as 24x24 line art using the node textColor for the stroke, so their colors automatically adapt to all four themes."
            },
            {
              "type": "string",
              "maxLength": 200,
              "pattern": "^assets/(?:[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*/)*[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*\\.(?:[Ss][Vv][Gg]|[Pp][Nn][Gg]|[Ww][Ee][Bb][Pp]|[Jj][Pp][Gg]|[Jj][Pp][Ee][Gg])$",
              "description": "Image under assets/ used as a node icon. Raster images and SVG files loaded through <image> do not adapt to theme colors, so use artwork that remains legible against every theme background."
            }
          ],
          "description": "Built-in icon name or path to an icon under assets/."
        },
        "ariaLabel": {
          "type": "string",
          "maxLength": 300
        },
        "z": {
          "type": "number",
          "minimum": -100,
          "maximum": 100,
          "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
        },
        "style": {
          "type": "object",
          "additionalProperties": false,
          "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
          "properties": {
            "fill": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "stroke": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "textColor": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "strokeWidth": {
              "type": "number",
              "minimum": 0.5,
              "maximum": 20
            },
            "fontSize": {
              "type": "number",
              "minimum": 8,
              "maximum": 160
            },
            "opacity": {
              "type": "number",
              "minimum": 0,
              "maximum": 1
            },
            "dash": {
              "type": "string",
              "maxLength": 40,
              "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
              "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
            },
            "cornerRadius": {
              "type": "number",
              "minimum": 0,
              "maximum": 200
            }
          }
        }
      },
      "description": "Node placed directly under a group with a layout. Position and size are calculated automatically."
    },
    "imageBase": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "id",
        "src"
      ],
      "properties": {
        "type": {
          "const": "image"
        },
        "id": {
          "type": "string",
          "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
          "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
        },
        "src": {
          "type": "string",
          "maxLength": 200,
          "pattern": "^assets/(?:[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*/)*[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*\\.(?:[Ss][Vv][Gg]|[Pp][Nn][Gg]|[Ww][Ee][Bb][Pp]|[Jj][Pp][Gg]|[Jj][Pp][Ee][Gg])$",
          "description": "Image in the repository assets/ directory. Supported extensions are .svg / .png / .webp / .jpg / .jpeg, including uppercase variants. The syntax cannot represent paths containing '..', data: URIs, or external URLs."
        },
        "fit": {
          "enum": [
            "contain",
            "cover",
            "stretch"
          ]
        },
        "x": {
          "type": "number",
          "minimum": -4000,
          "maximum": 4000,
          "description": "Coordinate in the canvas coordinate system, relative to the parent group."
        },
        "y": {
          "type": "number",
          "minimum": -4000,
          "maximum": 4000,
          "description": "Coordinate in the canvas coordinate system, relative to the parent group."
        },
        "width": {
          "type": "number",
          "minimum": 1,
          "maximum": 4000,
          "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
        },
        "height": {
          "type": "number",
          "minimum": 1,
          "maximum": 4000,
          "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
        },
        "ariaLabel": {
          "type": "string",
          "maxLength": 300,
          "description": "Alternative text for the image. Defaults first to the src file name and then to the id."
        },
        "z": {
          "type": "number",
          "minimum": -100,
          "maximum": 100,
          "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
        },
        "style": {
          "type": "object",
          "additionalProperties": false,
          "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
          "properties": {
            "fill": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "stroke": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "textColor": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "strokeWidth": {
              "type": "number",
              "minimum": 0.5,
              "maximum": 20
            },
            "fontSize": {
              "type": "number",
              "minimum": 8,
              "maximum": 160
            },
            "opacity": {
              "type": "number",
              "minimum": 0,
              "maximum": 1
            },
            "dash": {
              "type": "string",
              "maxLength": 40,
              "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
              "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
            },
            "cornerRadius": {
              "type": "number",
              "minimum": 0,
              "maximum": 200
            }
          }
        }
      }
    },
    "imageFixed": {
      "description": "x / y / width / height are required directly under a parent without a layout.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "id",
        "src",
        "x",
        "y",
        "width",
        "height"
      ],
      "properties": {
        "type": {
          "const": "image"
        },
        "id": {
          "type": "string",
          "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
          "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
        },
        "src": {
          "type": "string",
          "maxLength": 200,
          "pattern": "^assets/(?:[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*/)*[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*\\.(?:[Ss][Vv][Gg]|[Pp][Nn][Gg]|[Ww][Ee][Bb][Pp]|[Jj][Pp][Gg]|[Jj][Pp][Ee][Gg])$",
          "description": "Image in the repository assets/ directory. Supported extensions are .svg / .png / .webp / .jpg / .jpeg, including uppercase variants. The syntax cannot represent paths containing '..', data: URIs, or external URLs."
        },
        "fit": {
          "enum": [
            "contain",
            "cover",
            "stretch"
          ]
        },
        "x": {
          "type": "number",
          "minimum": -4000,
          "maximum": 4000,
          "description": "Coordinate in the canvas coordinate system, relative to the parent group."
        },
        "y": {
          "type": "number",
          "minimum": -4000,
          "maximum": 4000,
          "description": "Coordinate in the canvas coordinate system, relative to the parent group."
        },
        "width": {
          "type": "number",
          "minimum": 1,
          "maximum": 4000,
          "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
        },
        "height": {
          "type": "number",
          "minimum": 1,
          "maximum": 4000,
          "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
        },
        "ariaLabel": {
          "type": "string",
          "maxLength": 300,
          "description": "Alternative text for the image. Defaults first to the src file name and then to the id."
        },
        "z": {
          "type": "number",
          "minimum": -100,
          "maximum": 100,
          "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
        },
        "style": {
          "type": "object",
          "additionalProperties": false,
          "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
          "properties": {
            "fill": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "stroke": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "textColor": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "strokeWidth": {
              "type": "number",
              "minimum": 0.5,
              "maximum": 20
            },
            "fontSize": {
              "type": "number",
              "minimum": 8,
              "maximum": 160
            },
            "opacity": {
              "type": "number",
              "minimum": 0,
              "maximum": 1
            },
            "dash": {
              "type": "string",
              "maxLength": 40,
              "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
              "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
            },
            "cornerRadius": {
              "type": "number",
              "minimum": 0,
              "maximum": 200
            }
          }
        }
      }
    },
    "imageFlow": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "id",
        "src"
      ],
      "properties": {
        "type": {
          "const": "image"
        },
        "id": {
          "type": "string",
          "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
          "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
        },
        "src": {
          "type": "string",
          "maxLength": 200,
          "pattern": "^assets/(?:[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*/)*[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*\\.(?:[Ss][Vv][Gg]|[Pp][Nn][Gg]|[Ww][Ee][Bb][Pp]|[Jj][Pp][Gg]|[Jj][Pp][Ee][Gg])$",
          "description": "Image in the repository assets/ directory. Supported extensions are .svg / .png / .webp / .jpg / .jpeg, including uppercase variants. The syntax cannot represent paths containing '..', data: URIs, or external URLs."
        },
        "fit": {
          "enum": [
            "contain",
            "cover",
            "stretch"
          ]
        },
        "x": {
          "type": "number",
          "minimum": -4000,
          "maximum": 4000,
          "description": "Coordinate in the canvas coordinate system, relative to the parent group."
        },
        "y": {
          "type": "number",
          "minimum": -4000,
          "maximum": 4000,
          "description": "Coordinate in the canvas coordinate system, relative to the parent group."
        },
        "width": {
          "type": "number",
          "minimum": 1,
          "maximum": 4000,
          "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
        },
        "height": {
          "type": "number",
          "minimum": 1,
          "maximum": 4000,
          "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
        },
        "ariaLabel": {
          "type": "string",
          "maxLength": 300,
          "description": "Alternative text for the image. Defaults first to the src file name and then to the id."
        },
        "z": {
          "type": "number",
          "minimum": -100,
          "maximum": 100,
          "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
        },
        "style": {
          "type": "object",
          "additionalProperties": false,
          "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
          "properties": {
            "fill": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "stroke": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "textColor": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "strokeWidth": {
              "type": "number",
              "minimum": 0.5,
              "maximum": 20
            },
            "fontSize": {
              "type": "number",
              "minimum": 8,
              "maximum": 160
            },
            "opacity": {
              "type": "number",
              "minimum": 0,
              "maximum": 1
            },
            "dash": {
              "type": "string",
              "maxLength": 40,
              "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
              "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
            },
            "cornerRadius": {
              "type": "number",
              "minimum": 0,
              "maximum": 200
            }
          }
        }
      },
      "description": "Image placed directly under a group with a layout. Position and size are calculated automatically."
    },
    "connector": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "from",
        "to"
      ],
      "properties": {
        "type": {
          "const": "connector"
        },
        "from": {
          "type": "string",
          "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
          "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
        },
        "to": {
          "type": "string",
          "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
          "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
        },
        "fromPort": {
          "enum": [
            "auto",
            "top",
            "right",
            "bottom",
            "left"
          ]
        },
        "toPort": {
          "enum": [
            "auto",
            "top",
            "right",
            "bottom",
            "left"
          ]
        },
        "label": {
          "type": "string",
          "maxLength": 200
        },
        "labelLayer": {
          "enum": [
            "front",
            "behind"
          ],
          "default": "front",
          "description": "Label stacking order. front renders above boxes; behind uses the connector body's stacking order."
        },
        "ariaLabel": {
          "type": "string",
          "maxLength": 300
        },
        "routing": {
          "enum": [
            "straight",
            "orthogonal",
            "polyline"
          ]
        },
        "points": {
          "type": "array",
          "maxItems": 12,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "x",
              "y"
            ],
            "properties": {
              "x": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "y": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              }
            }
          },
          "description": "Waypoints allowed only when routing is polyline."
        },
        "arrow": {
          "type": "boolean"
        },
        "lane": {
          "type": "number",
          "minimum": -12,
          "maximum": 12,
          "description": "Separation lane for parallel connectors. Fractional values are truncated."
        },
        "z": {
          "type": "number",
          "minimum": -100,
          "maximum": 100,
          "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
        },
        "style": {
          "type": "object",
          "additionalProperties": false,
          "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
          "properties": {
            "fill": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "stroke": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "textColor": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "strokeWidth": {
              "type": "number",
              "minimum": 0.5,
              "maximum": 20
            },
            "fontSize": {
              "type": "number",
              "minimum": 8,
              "maximum": 160
            },
            "opacity": {
              "type": "number",
              "minimum": 0,
              "maximum": 1
            },
            "dash": {
              "type": "string",
              "maxLength": 40,
              "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
              "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
            },
            "cornerRadius": {
              "type": "number",
              "minimum": 0,
              "maximum": 200
            }
          }
        }
      },
      "if": {
        "type": "object",
        "required": [
          "routing"
        ],
        "properties": {
          "routing": {
            "const": "polyline"
          }
        }
      },
      "else": {
        "type": "object",
        "properties": {
          "points": {
            "type": "array",
            "maxItems": 0,
            "description": "points may be specified only when routing is polyline."
          }
        }
      }
    },
    "groupBase": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "id"
      ],
      "properties": {
        "type": {
          "const": "group"
        },
        "id": {
          "type": "string",
          "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
          "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
        },
        "x": {
          "type": "number",
          "minimum": -4000,
          "maximum": 4000,
          "description": "Coordinate in the canvas coordinate system, relative to the parent group."
        },
        "y": {
          "type": "number",
          "minimum": -4000,
          "maximum": 4000,
          "description": "Coordinate in the canvas coordinate system, relative to the parent group."
        },
        "width": {
          "type": "number",
          "minimum": 1,
          "maximum": 4000,
          "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
        },
        "height": {
          "type": "number",
          "minimum": 1,
          "maximum": 4000,
          "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
        },
        "title": {
          "type": "string",
          "maxLength": 200
        },
        "ariaLabel": {
          "type": "string",
          "maxLength": 300
        },
        "layout": {
          "anyOf": [
            {
              "enum": [
                "row",
                "column",
                "grid",
                "layered"
              ],
              "description": "String shorthand. Defaults are gap 36 / padding 54 / columns 3 / direction \"down\"."
            },
            {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "type"
              ],
              "properties": {
                "type": {
                  "enum": [
                    "row",
                    "column",
                    "grid",
                    "layered"
                  ]
                },
                "gap": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 240
                },
                "rowGap": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 240
                },
                "columnGap": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 240
                },
                "padding": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 400
                },
                "columns": {
                  "type": "number",
                  "minimum": 1,
                  "maximum": 12,
                  "description": "Number of grid columns. Fractional values are truncated. Ignored for row / column / layered."
                },
                "direction": {
                  "enum": [
                    "down",
                    "right"
                  ],
                  "description": "Direction in which layered ranks extend. down means top to bottom; right means left to right. Not allowed for layouts other than layered."
                }
              },
              "allOf": [
                {
                  "if": {
                    "not": {
                      "properties": {
                        "type": {
                          "const": "layered"
                        }
                      },
                      "required": [
                        "type"
                      ]
                    }
                  },
                  "then": {
                    "not": {
                      "required": [
                        "direction"
                      ]
                    }
                  }
                }
              ]
            }
          ],
          "description": "Automatic child placement. When specified, child x / y / width / height values are calculated automatically, and explicit x / y values are ignored. layered infers ranks from connectors between children."
        },
        "z": {
          "type": "number",
          "minimum": -100,
          "maximum": 100,
          "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
        },
        "style": {
          "type": "object",
          "additionalProperties": false,
          "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
          "properties": {
            "fill": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "stroke": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "textColor": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "strokeWidth": {
              "type": "number",
              "minimum": 0.5,
              "maximum": 20
            },
            "fontSize": {
              "type": "number",
              "minimum": 8,
              "maximum": 160
            },
            "opacity": {
              "type": "number",
              "minimum": 0,
              "maximum": 1
            },
            "dash": {
              "type": "string",
              "maxLength": 40,
              "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
              "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
            },
            "cornerRadius": {
              "type": "number",
              "minimum": 0,
              "maximum": 200
            }
          }
        },
        "children": {
          "type": "array",
          "maxItems": 200
        }
      }
    },
    "groupChildrenL1": {
      "if": {
        "type": "object",
        "required": [
          "layout"
        ]
      },
      "then": {
        "type": "object",
        "properties": {
          "children": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/elementFlowL1"
            }
          }
        }
      },
      "else": {
        "type": "object",
        "properties": {
          "children": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/elementFixedL1"
            }
          }
        }
      }
    },
    "groupChildrenL2": {
      "if": {
        "type": "object",
        "required": [
          "layout"
        ]
      },
      "then": {
        "type": "object",
        "properties": {
          "children": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/elementFlowL2"
            }
          }
        }
      },
      "else": {
        "type": "object",
        "properties": {
          "children": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/elementFixedL2"
            }
          }
        }
      }
    },
    "groupChildrenL3": {
      "if": {
        "type": "object",
        "required": [
          "layout"
        ]
      },
      "then": {
        "type": "object",
        "properties": {
          "children": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/elementFlowL3"
            }
          }
        }
      },
      "else": {
        "type": "object",
        "properties": {
          "children": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/elementFixedL3"
            }
          }
        }
      }
    },
    "groupChildrenL4": {
      "if": {
        "type": "object",
        "required": [
          "layout"
        ]
      },
      "then": {
        "type": "object",
        "properties": {
          "children": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/elementFlowL4"
            }
          }
        }
      },
      "else": {
        "type": "object",
        "properties": {
          "children": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/elementFixedL4"
            }
          }
        }
      }
    },
    "boxRequired": {
      "description": "x / y / width / height are required directly under a parent without a layout.",
      "type": "object",
      "required": [
        "x",
        "y",
        "width",
        "height"
      ]
    },
    "groupFixedL0": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "id",
        "x",
        "y",
        "width",
        "height"
      ],
      "properties": {
        "type": {
          "const": "group"
        },
        "id": {
          "type": "string",
          "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
          "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
        },
        "x": {
          "type": "number",
          "minimum": -4000,
          "maximum": 4000,
          "description": "Coordinate in the canvas coordinate system, relative to the parent group."
        },
        "y": {
          "type": "number",
          "minimum": -4000,
          "maximum": 4000,
          "description": "Coordinate in the canvas coordinate system, relative to the parent group."
        },
        "width": {
          "type": "number",
          "minimum": 1,
          "maximum": 4000,
          "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
        },
        "height": {
          "type": "number",
          "minimum": 1,
          "maximum": 4000,
          "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
        },
        "title": {
          "type": "string",
          "maxLength": 200
        },
        "ariaLabel": {
          "type": "string",
          "maxLength": 300
        },
        "layout": {
          "anyOf": [
            {
              "enum": [
                "row",
                "column",
                "grid",
                "layered"
              ],
              "description": "String shorthand. Defaults are gap 36 / padding 54 / columns 3 / direction \"down\"."
            },
            {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "type"
              ],
              "properties": {
                "type": {
                  "enum": [
                    "row",
                    "column",
                    "grid",
                    "layered"
                  ]
                },
                "gap": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 240
                },
                "rowGap": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 240
                },
                "columnGap": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 240
                },
                "padding": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 400
                },
                "columns": {
                  "type": "number",
                  "minimum": 1,
                  "maximum": 12,
                  "description": "Number of grid columns. Fractional values are truncated. Ignored for row / column / layered."
                },
                "direction": {
                  "enum": [
                    "down",
                    "right"
                  ],
                  "description": "Direction in which layered ranks extend. down means top to bottom; right means left to right. Not allowed for layouts other than layered."
                }
              },
              "allOf": [
                {
                  "if": {
                    "not": {
                      "properties": {
                        "type": {
                          "const": "layered"
                        }
                      },
                      "required": [
                        "type"
                      ]
                    }
                  },
                  "then": {
                    "not": {
                      "required": [
                        "direction"
                      ]
                    }
                  }
                }
              ]
            }
          ],
          "description": "Automatic child placement. When specified, child x / y / width / height values are calculated automatically, and explicit x / y values are ignored. layered infers ranks from connectors between children."
        },
        "z": {
          "type": "number",
          "minimum": -100,
          "maximum": 100,
          "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
        },
        "style": {
          "type": "object",
          "additionalProperties": false,
          "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
          "properties": {
            "fill": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "stroke": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "textColor": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "strokeWidth": {
              "type": "number",
              "minimum": 0.5,
              "maximum": 20
            },
            "fontSize": {
              "type": "number",
              "minimum": 8,
              "maximum": 160
            },
            "opacity": {
              "type": "number",
              "minimum": 0,
              "maximum": 1
            },
            "dash": {
              "type": "string",
              "maxLength": 40,
              "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
              "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
            },
            "cornerRadius": {
              "type": "number",
              "minimum": 0,
              "maximum": 200
            }
          }
        },
        "children": {
          "type": "array",
          "maxItems": 200
        }
      },
      "description": "x / y / width / height are required directly under a parent without a layout.",
      "allOf": [
        {
          "if": {
            "type": "object",
            "required": [
              "layout"
            ]
          },
          "then": {
            "type": "object",
            "properties": {
              "children": {
                "type": "array",
                "items": {
                  "$ref": "#/$defs/elementFlowL1"
                }
              }
            }
          },
          "else": {
            "type": "object",
            "properties": {
              "children": {
                "type": "array",
                "items": {
                  "$ref": "#/$defs/elementFixedL1"
                }
              }
            }
          }
        }
      ]
    },
    "groupFlowL0": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "id"
      ],
      "properties": {
        "type": {
          "const": "group"
        },
        "id": {
          "type": "string",
          "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
          "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
        },
        "x": {
          "type": "number",
          "minimum": -4000,
          "maximum": 4000,
          "description": "Coordinate in the canvas coordinate system, relative to the parent group."
        },
        "y": {
          "type": "number",
          "minimum": -4000,
          "maximum": 4000,
          "description": "Coordinate in the canvas coordinate system, relative to the parent group."
        },
        "width": {
          "type": "number",
          "minimum": 1,
          "maximum": 4000,
          "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
        },
        "height": {
          "type": "number",
          "minimum": 1,
          "maximum": 4000,
          "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
        },
        "title": {
          "type": "string",
          "maxLength": 200
        },
        "ariaLabel": {
          "type": "string",
          "maxLength": 300
        },
        "layout": {
          "anyOf": [
            {
              "enum": [
                "row",
                "column",
                "grid",
                "layered"
              ],
              "description": "String shorthand. Defaults are gap 36 / padding 54 / columns 3 / direction \"down\"."
            },
            {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "type"
              ],
              "properties": {
                "type": {
                  "enum": [
                    "row",
                    "column",
                    "grid",
                    "layered"
                  ]
                },
                "gap": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 240
                },
                "rowGap": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 240
                },
                "columnGap": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 240
                },
                "padding": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 400
                },
                "columns": {
                  "type": "number",
                  "minimum": 1,
                  "maximum": 12,
                  "description": "Number of grid columns. Fractional values are truncated. Ignored for row / column / layered."
                },
                "direction": {
                  "enum": [
                    "down",
                    "right"
                  ],
                  "description": "Direction in which layered ranks extend. down means top to bottom; right means left to right. Not allowed for layouts other than layered."
                }
              },
              "allOf": [
                {
                  "if": {
                    "not": {
                      "properties": {
                        "type": {
                          "const": "layered"
                        }
                      },
                      "required": [
                        "type"
                      ]
                    }
                  },
                  "then": {
                    "not": {
                      "required": [
                        "direction"
                      ]
                    }
                  }
                }
              ]
            }
          ],
          "description": "Automatic child placement. When specified, child x / y / width / height values are calculated automatically, and explicit x / y values are ignored. layered infers ranks from connectors between children."
        },
        "z": {
          "type": "number",
          "minimum": -100,
          "maximum": 100,
          "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
        },
        "style": {
          "type": "object",
          "additionalProperties": false,
          "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
          "properties": {
            "fill": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "stroke": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "textColor": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "strokeWidth": {
              "type": "number",
              "minimum": 0.5,
              "maximum": 20
            },
            "fontSize": {
              "type": "number",
              "minimum": 8,
              "maximum": 160
            },
            "opacity": {
              "type": "number",
              "minimum": 0,
              "maximum": 1
            },
            "dash": {
              "type": "string",
              "maxLength": 40,
              "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
              "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
            },
            "cornerRadius": {
              "type": "number",
              "minimum": 0,
              "maximum": 200
            }
          }
        },
        "children": {
          "type": "array",
          "maxItems": 200
        }
      },
      "allOf": [
        {
          "if": {
            "type": "object",
            "required": [
              "layout"
            ]
          },
          "then": {
            "type": "object",
            "properties": {
              "children": {
                "type": "array",
                "items": {
                  "$ref": "#/$defs/elementFlowL1"
                }
              }
            }
          },
          "else": {
            "type": "object",
            "properties": {
              "children": {
                "type": "array",
                "items": {
                  "$ref": "#/$defs/elementFixedL1"
                }
              }
            }
          }
        }
      ]
    },
    "groupFixedL1": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "id",
        "x",
        "y",
        "width",
        "height"
      ],
      "properties": {
        "type": {
          "const": "group"
        },
        "id": {
          "type": "string",
          "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
          "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
        },
        "x": {
          "type": "number",
          "minimum": -4000,
          "maximum": 4000,
          "description": "Coordinate in the canvas coordinate system, relative to the parent group."
        },
        "y": {
          "type": "number",
          "minimum": -4000,
          "maximum": 4000,
          "description": "Coordinate in the canvas coordinate system, relative to the parent group."
        },
        "width": {
          "type": "number",
          "minimum": 1,
          "maximum": 4000,
          "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
        },
        "height": {
          "type": "number",
          "minimum": 1,
          "maximum": 4000,
          "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
        },
        "title": {
          "type": "string",
          "maxLength": 200
        },
        "ariaLabel": {
          "type": "string",
          "maxLength": 300
        },
        "layout": {
          "anyOf": [
            {
              "enum": [
                "row",
                "column",
                "grid",
                "layered"
              ],
              "description": "String shorthand. Defaults are gap 36 / padding 54 / columns 3 / direction \"down\"."
            },
            {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "type"
              ],
              "properties": {
                "type": {
                  "enum": [
                    "row",
                    "column",
                    "grid",
                    "layered"
                  ]
                },
                "gap": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 240
                },
                "rowGap": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 240
                },
                "columnGap": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 240
                },
                "padding": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 400
                },
                "columns": {
                  "type": "number",
                  "minimum": 1,
                  "maximum": 12,
                  "description": "Number of grid columns. Fractional values are truncated. Ignored for row / column / layered."
                },
                "direction": {
                  "enum": [
                    "down",
                    "right"
                  ],
                  "description": "Direction in which layered ranks extend. down means top to bottom; right means left to right. Not allowed for layouts other than layered."
                }
              },
              "allOf": [
                {
                  "if": {
                    "not": {
                      "properties": {
                        "type": {
                          "const": "layered"
                        }
                      },
                      "required": [
                        "type"
                      ]
                    }
                  },
                  "then": {
                    "not": {
                      "required": [
                        "direction"
                      ]
                    }
                  }
                }
              ]
            }
          ],
          "description": "Automatic child placement. When specified, child x / y / width / height values are calculated automatically, and explicit x / y values are ignored. layered infers ranks from connectors between children."
        },
        "z": {
          "type": "number",
          "minimum": -100,
          "maximum": 100,
          "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
        },
        "style": {
          "type": "object",
          "additionalProperties": false,
          "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
          "properties": {
            "fill": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "stroke": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "textColor": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "strokeWidth": {
              "type": "number",
              "minimum": 0.5,
              "maximum": 20
            },
            "fontSize": {
              "type": "number",
              "minimum": 8,
              "maximum": 160
            },
            "opacity": {
              "type": "number",
              "minimum": 0,
              "maximum": 1
            },
            "dash": {
              "type": "string",
              "maxLength": 40,
              "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
              "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
            },
            "cornerRadius": {
              "type": "number",
              "minimum": 0,
              "maximum": 200
            }
          }
        },
        "children": {
          "type": "array",
          "maxItems": 200
        }
      },
      "description": "x / y / width / height are required directly under a parent without a layout.",
      "allOf": [
        {
          "if": {
            "type": "object",
            "required": [
              "layout"
            ]
          },
          "then": {
            "type": "object",
            "properties": {
              "children": {
                "type": "array",
                "items": {
                  "$ref": "#/$defs/elementFlowL2"
                }
              }
            }
          },
          "else": {
            "type": "object",
            "properties": {
              "children": {
                "type": "array",
                "items": {
                  "$ref": "#/$defs/elementFixedL2"
                }
              }
            }
          }
        }
      ]
    },
    "groupFlowL1": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "id"
      ],
      "properties": {
        "type": {
          "const": "group"
        },
        "id": {
          "type": "string",
          "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
          "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
        },
        "x": {
          "type": "number",
          "minimum": -4000,
          "maximum": 4000,
          "description": "Coordinate in the canvas coordinate system, relative to the parent group."
        },
        "y": {
          "type": "number",
          "minimum": -4000,
          "maximum": 4000,
          "description": "Coordinate in the canvas coordinate system, relative to the parent group."
        },
        "width": {
          "type": "number",
          "minimum": 1,
          "maximum": 4000,
          "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
        },
        "height": {
          "type": "number",
          "minimum": 1,
          "maximum": 4000,
          "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
        },
        "title": {
          "type": "string",
          "maxLength": 200
        },
        "ariaLabel": {
          "type": "string",
          "maxLength": 300
        },
        "layout": {
          "anyOf": [
            {
              "enum": [
                "row",
                "column",
                "grid",
                "layered"
              ],
              "description": "String shorthand. Defaults are gap 36 / padding 54 / columns 3 / direction \"down\"."
            },
            {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "type"
              ],
              "properties": {
                "type": {
                  "enum": [
                    "row",
                    "column",
                    "grid",
                    "layered"
                  ]
                },
                "gap": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 240
                },
                "rowGap": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 240
                },
                "columnGap": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 240
                },
                "padding": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 400
                },
                "columns": {
                  "type": "number",
                  "minimum": 1,
                  "maximum": 12,
                  "description": "Number of grid columns. Fractional values are truncated. Ignored for row / column / layered."
                },
                "direction": {
                  "enum": [
                    "down",
                    "right"
                  ],
                  "description": "Direction in which layered ranks extend. down means top to bottom; right means left to right. Not allowed for layouts other than layered."
                }
              },
              "allOf": [
                {
                  "if": {
                    "not": {
                      "properties": {
                        "type": {
                          "const": "layered"
                        }
                      },
                      "required": [
                        "type"
                      ]
                    }
                  },
                  "then": {
                    "not": {
                      "required": [
                        "direction"
                      ]
                    }
                  }
                }
              ]
            }
          ],
          "description": "Automatic child placement. When specified, child x / y / width / height values are calculated automatically, and explicit x / y values are ignored. layered infers ranks from connectors between children."
        },
        "z": {
          "type": "number",
          "minimum": -100,
          "maximum": 100,
          "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
        },
        "style": {
          "type": "object",
          "additionalProperties": false,
          "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
          "properties": {
            "fill": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "stroke": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "textColor": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "strokeWidth": {
              "type": "number",
              "minimum": 0.5,
              "maximum": 20
            },
            "fontSize": {
              "type": "number",
              "minimum": 8,
              "maximum": 160
            },
            "opacity": {
              "type": "number",
              "minimum": 0,
              "maximum": 1
            },
            "dash": {
              "type": "string",
              "maxLength": 40,
              "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
              "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
            },
            "cornerRadius": {
              "type": "number",
              "minimum": 0,
              "maximum": 200
            }
          }
        },
        "children": {
          "type": "array",
          "maxItems": 200
        }
      },
      "allOf": [
        {
          "if": {
            "type": "object",
            "required": [
              "layout"
            ]
          },
          "then": {
            "type": "object",
            "properties": {
              "children": {
                "type": "array",
                "items": {
                  "$ref": "#/$defs/elementFlowL2"
                }
              }
            }
          },
          "else": {
            "type": "object",
            "properties": {
              "children": {
                "type": "array",
                "items": {
                  "$ref": "#/$defs/elementFixedL2"
                }
              }
            }
          }
        }
      ]
    },
    "groupFixedL2": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "id",
        "x",
        "y",
        "width",
        "height"
      ],
      "properties": {
        "type": {
          "const": "group"
        },
        "id": {
          "type": "string",
          "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
          "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
        },
        "x": {
          "type": "number",
          "minimum": -4000,
          "maximum": 4000,
          "description": "Coordinate in the canvas coordinate system, relative to the parent group."
        },
        "y": {
          "type": "number",
          "minimum": -4000,
          "maximum": 4000,
          "description": "Coordinate in the canvas coordinate system, relative to the parent group."
        },
        "width": {
          "type": "number",
          "minimum": 1,
          "maximum": 4000,
          "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
        },
        "height": {
          "type": "number",
          "minimum": 1,
          "maximum": 4000,
          "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
        },
        "title": {
          "type": "string",
          "maxLength": 200
        },
        "ariaLabel": {
          "type": "string",
          "maxLength": 300
        },
        "layout": {
          "anyOf": [
            {
              "enum": [
                "row",
                "column",
                "grid",
                "layered"
              ],
              "description": "String shorthand. Defaults are gap 36 / padding 54 / columns 3 / direction \"down\"."
            },
            {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "type"
              ],
              "properties": {
                "type": {
                  "enum": [
                    "row",
                    "column",
                    "grid",
                    "layered"
                  ]
                },
                "gap": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 240
                },
                "rowGap": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 240
                },
                "columnGap": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 240
                },
                "padding": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 400
                },
                "columns": {
                  "type": "number",
                  "minimum": 1,
                  "maximum": 12,
                  "description": "Number of grid columns. Fractional values are truncated. Ignored for row / column / layered."
                },
                "direction": {
                  "enum": [
                    "down",
                    "right"
                  ],
                  "description": "Direction in which layered ranks extend. down means top to bottom; right means left to right. Not allowed for layouts other than layered."
                }
              },
              "allOf": [
                {
                  "if": {
                    "not": {
                      "properties": {
                        "type": {
                          "const": "layered"
                        }
                      },
                      "required": [
                        "type"
                      ]
                    }
                  },
                  "then": {
                    "not": {
                      "required": [
                        "direction"
                      ]
                    }
                  }
                }
              ]
            }
          ],
          "description": "Automatic child placement. When specified, child x / y / width / height values are calculated automatically, and explicit x / y values are ignored. layered infers ranks from connectors between children."
        },
        "z": {
          "type": "number",
          "minimum": -100,
          "maximum": 100,
          "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
        },
        "style": {
          "type": "object",
          "additionalProperties": false,
          "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
          "properties": {
            "fill": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "stroke": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "textColor": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "strokeWidth": {
              "type": "number",
              "minimum": 0.5,
              "maximum": 20
            },
            "fontSize": {
              "type": "number",
              "minimum": 8,
              "maximum": 160
            },
            "opacity": {
              "type": "number",
              "minimum": 0,
              "maximum": 1
            },
            "dash": {
              "type": "string",
              "maxLength": 40,
              "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
              "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
            },
            "cornerRadius": {
              "type": "number",
              "minimum": 0,
              "maximum": 200
            }
          }
        },
        "children": {
          "type": "array",
          "maxItems": 200
        }
      },
      "description": "x / y / width / height are required directly under a parent without a layout.",
      "allOf": [
        {
          "if": {
            "type": "object",
            "required": [
              "layout"
            ]
          },
          "then": {
            "type": "object",
            "properties": {
              "children": {
                "type": "array",
                "items": {
                  "$ref": "#/$defs/elementFlowL3"
                }
              }
            }
          },
          "else": {
            "type": "object",
            "properties": {
              "children": {
                "type": "array",
                "items": {
                  "$ref": "#/$defs/elementFixedL3"
                }
              }
            }
          }
        }
      ]
    },
    "groupFlowL2": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "id"
      ],
      "properties": {
        "type": {
          "const": "group"
        },
        "id": {
          "type": "string",
          "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
          "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
        },
        "x": {
          "type": "number",
          "minimum": -4000,
          "maximum": 4000,
          "description": "Coordinate in the canvas coordinate system, relative to the parent group."
        },
        "y": {
          "type": "number",
          "minimum": -4000,
          "maximum": 4000,
          "description": "Coordinate in the canvas coordinate system, relative to the parent group."
        },
        "width": {
          "type": "number",
          "minimum": 1,
          "maximum": 4000,
          "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
        },
        "height": {
          "type": "number",
          "minimum": 1,
          "maximum": 4000,
          "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
        },
        "title": {
          "type": "string",
          "maxLength": 200
        },
        "ariaLabel": {
          "type": "string",
          "maxLength": 300
        },
        "layout": {
          "anyOf": [
            {
              "enum": [
                "row",
                "column",
                "grid",
                "layered"
              ],
              "description": "String shorthand. Defaults are gap 36 / padding 54 / columns 3 / direction \"down\"."
            },
            {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "type"
              ],
              "properties": {
                "type": {
                  "enum": [
                    "row",
                    "column",
                    "grid",
                    "layered"
                  ]
                },
                "gap": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 240
                },
                "rowGap": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 240
                },
                "columnGap": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 240
                },
                "padding": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 400
                },
                "columns": {
                  "type": "number",
                  "minimum": 1,
                  "maximum": 12,
                  "description": "Number of grid columns. Fractional values are truncated. Ignored for row / column / layered."
                },
                "direction": {
                  "enum": [
                    "down",
                    "right"
                  ],
                  "description": "Direction in which layered ranks extend. down means top to bottom; right means left to right. Not allowed for layouts other than layered."
                }
              },
              "allOf": [
                {
                  "if": {
                    "not": {
                      "properties": {
                        "type": {
                          "const": "layered"
                        }
                      },
                      "required": [
                        "type"
                      ]
                    }
                  },
                  "then": {
                    "not": {
                      "required": [
                        "direction"
                      ]
                    }
                  }
                }
              ]
            }
          ],
          "description": "Automatic child placement. When specified, child x / y / width / height values are calculated automatically, and explicit x / y values are ignored. layered infers ranks from connectors between children."
        },
        "z": {
          "type": "number",
          "minimum": -100,
          "maximum": 100,
          "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
        },
        "style": {
          "type": "object",
          "additionalProperties": false,
          "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
          "properties": {
            "fill": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "stroke": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "textColor": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "strokeWidth": {
              "type": "number",
              "minimum": 0.5,
              "maximum": 20
            },
            "fontSize": {
              "type": "number",
              "minimum": 8,
              "maximum": 160
            },
            "opacity": {
              "type": "number",
              "minimum": 0,
              "maximum": 1
            },
            "dash": {
              "type": "string",
              "maxLength": 40,
              "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
              "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
            },
            "cornerRadius": {
              "type": "number",
              "minimum": 0,
              "maximum": 200
            }
          }
        },
        "children": {
          "type": "array",
          "maxItems": 200
        }
      },
      "allOf": [
        {
          "if": {
            "type": "object",
            "required": [
              "layout"
            ]
          },
          "then": {
            "type": "object",
            "properties": {
              "children": {
                "type": "array",
                "items": {
                  "$ref": "#/$defs/elementFlowL3"
                }
              }
            }
          },
          "else": {
            "type": "object",
            "properties": {
              "children": {
                "type": "array",
                "items": {
                  "$ref": "#/$defs/elementFixedL3"
                }
              }
            }
          }
        }
      ]
    },
    "groupFixedL3": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "id",
        "x",
        "y",
        "width",
        "height"
      ],
      "properties": {
        "type": {
          "const": "group"
        },
        "id": {
          "type": "string",
          "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
          "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
        },
        "x": {
          "type": "number",
          "minimum": -4000,
          "maximum": 4000,
          "description": "Coordinate in the canvas coordinate system, relative to the parent group."
        },
        "y": {
          "type": "number",
          "minimum": -4000,
          "maximum": 4000,
          "description": "Coordinate in the canvas coordinate system, relative to the parent group."
        },
        "width": {
          "type": "number",
          "minimum": 1,
          "maximum": 4000,
          "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
        },
        "height": {
          "type": "number",
          "minimum": 1,
          "maximum": 4000,
          "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
        },
        "title": {
          "type": "string",
          "maxLength": 200
        },
        "ariaLabel": {
          "type": "string",
          "maxLength": 300
        },
        "layout": {
          "anyOf": [
            {
              "enum": [
                "row",
                "column",
                "grid",
                "layered"
              ],
              "description": "String shorthand. Defaults are gap 36 / padding 54 / columns 3 / direction \"down\"."
            },
            {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "type"
              ],
              "properties": {
                "type": {
                  "enum": [
                    "row",
                    "column",
                    "grid",
                    "layered"
                  ]
                },
                "gap": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 240
                },
                "rowGap": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 240
                },
                "columnGap": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 240
                },
                "padding": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 400
                },
                "columns": {
                  "type": "number",
                  "minimum": 1,
                  "maximum": 12,
                  "description": "Number of grid columns. Fractional values are truncated. Ignored for row / column / layered."
                },
                "direction": {
                  "enum": [
                    "down",
                    "right"
                  ],
                  "description": "Direction in which layered ranks extend. down means top to bottom; right means left to right. Not allowed for layouts other than layered."
                }
              },
              "allOf": [
                {
                  "if": {
                    "not": {
                      "properties": {
                        "type": {
                          "const": "layered"
                        }
                      },
                      "required": [
                        "type"
                      ]
                    }
                  },
                  "then": {
                    "not": {
                      "required": [
                        "direction"
                      ]
                    }
                  }
                }
              ]
            }
          ],
          "description": "Automatic child placement. When specified, child x / y / width / height values are calculated automatically, and explicit x / y values are ignored. layered infers ranks from connectors between children."
        },
        "z": {
          "type": "number",
          "minimum": -100,
          "maximum": 100,
          "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
        },
        "style": {
          "type": "object",
          "additionalProperties": false,
          "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
          "properties": {
            "fill": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "stroke": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "textColor": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "strokeWidth": {
              "type": "number",
              "minimum": 0.5,
              "maximum": 20
            },
            "fontSize": {
              "type": "number",
              "minimum": 8,
              "maximum": 160
            },
            "opacity": {
              "type": "number",
              "minimum": 0,
              "maximum": 1
            },
            "dash": {
              "type": "string",
              "maxLength": 40,
              "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
              "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
            },
            "cornerRadius": {
              "type": "number",
              "minimum": 0,
              "maximum": 200
            }
          }
        },
        "children": {
          "type": "array",
          "maxItems": 200
        }
      },
      "description": "x / y / width / height are required directly under a parent without a layout.",
      "allOf": [
        {
          "if": {
            "type": "object",
            "required": [
              "layout"
            ]
          },
          "then": {
            "type": "object",
            "properties": {
              "children": {
                "type": "array",
                "items": {
                  "$ref": "#/$defs/elementFlowL4"
                }
              }
            }
          },
          "else": {
            "type": "object",
            "properties": {
              "children": {
                "type": "array",
                "items": {
                  "$ref": "#/$defs/elementFixedL4"
                }
              }
            }
          }
        }
      ]
    },
    "groupFlowL3": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "id"
      ],
      "properties": {
        "type": {
          "const": "group"
        },
        "id": {
          "type": "string",
          "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
          "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
        },
        "x": {
          "type": "number",
          "minimum": -4000,
          "maximum": 4000,
          "description": "Coordinate in the canvas coordinate system, relative to the parent group."
        },
        "y": {
          "type": "number",
          "minimum": -4000,
          "maximum": 4000,
          "description": "Coordinate in the canvas coordinate system, relative to the parent group."
        },
        "width": {
          "type": "number",
          "minimum": 1,
          "maximum": 4000,
          "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
        },
        "height": {
          "type": "number",
          "minimum": 1,
          "maximum": 4000,
          "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
        },
        "title": {
          "type": "string",
          "maxLength": 200
        },
        "ariaLabel": {
          "type": "string",
          "maxLength": 300
        },
        "layout": {
          "anyOf": [
            {
              "enum": [
                "row",
                "column",
                "grid",
                "layered"
              ],
              "description": "String shorthand. Defaults are gap 36 / padding 54 / columns 3 / direction \"down\"."
            },
            {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "type"
              ],
              "properties": {
                "type": {
                  "enum": [
                    "row",
                    "column",
                    "grid",
                    "layered"
                  ]
                },
                "gap": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 240
                },
                "rowGap": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 240
                },
                "columnGap": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 240
                },
                "padding": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 400
                },
                "columns": {
                  "type": "number",
                  "minimum": 1,
                  "maximum": 12,
                  "description": "Number of grid columns. Fractional values are truncated. Ignored for row / column / layered."
                },
                "direction": {
                  "enum": [
                    "down",
                    "right"
                  ],
                  "description": "Direction in which layered ranks extend. down means top to bottom; right means left to right. Not allowed for layouts other than layered."
                }
              },
              "allOf": [
                {
                  "if": {
                    "not": {
                      "properties": {
                        "type": {
                          "const": "layered"
                        }
                      },
                      "required": [
                        "type"
                      ]
                    }
                  },
                  "then": {
                    "not": {
                      "required": [
                        "direction"
                      ]
                    }
                  }
                }
              ]
            }
          ],
          "description": "Automatic child placement. When specified, child x / y / width / height values are calculated automatically, and explicit x / y values are ignored. layered infers ranks from connectors between children."
        },
        "z": {
          "type": "number",
          "minimum": -100,
          "maximum": 100,
          "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
        },
        "style": {
          "type": "object",
          "additionalProperties": false,
          "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
          "properties": {
            "fill": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "stroke": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "textColor": {
              "anyOf": [
                {
                  "enum": [
                    "accent",
                    "accentStrong",
                    "accentSoft",
                    "accentLine",
                    "surface",
                    "fg",
                    "muted",
                    "body",
                    "border",
                    "bg"
                  ],
                  "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                },
                {
                  "type": "string",
                  "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                  "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                }
              ],
              "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
            },
            "strokeWidth": {
              "type": "number",
              "minimum": 0.5,
              "maximum": 20
            },
            "fontSize": {
              "type": "number",
              "minimum": 8,
              "maximum": 160
            },
            "opacity": {
              "type": "number",
              "minimum": 0,
              "maximum": 1
            },
            "dash": {
              "type": "string",
              "maxLength": 40,
              "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
              "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
            },
            "cornerRadius": {
              "type": "number",
              "minimum": 0,
              "maximum": 200
            }
          }
        },
        "children": {
          "type": "array",
          "maxItems": 200
        }
      },
      "allOf": [
        {
          "if": {
            "type": "object",
            "required": [
              "layout"
            ]
          },
          "then": {
            "type": "object",
            "properties": {
              "children": {
                "type": "array",
                "items": {
                  "$ref": "#/$defs/elementFlowL4"
                }
              }
            }
          },
          "else": {
            "type": "object",
            "properties": {
              "children": {
                "type": "array",
                "items": {
                  "$ref": "#/$defs/elementFixedL4"
                }
              }
            }
          }
        }
      ]
    },
    "elementFixedL0": {
      "type": "object",
      "required": [
        "type"
      ],
      "properties": {
        "type": {
          "enum": [
            "node",
            "group",
            "image",
            "connector"
          ],
          "description": "Element type."
        }
      },
      "allOf": [
        {
          "if": {
            "type": "object",
            "required": [
              "type"
            ],
            "properties": {
              "type": {
                "const": "node"
              }
            }
          },
          "then": {
            "description": "x / y / width / height are required directly under a parent without a layout.",
            "type": "object",
            "additionalProperties": false,
            "required": [
              "type",
              "id",
              "x",
              "y",
              "width",
              "height"
            ],
            "properties": {
              "type": {
                "const": "node"
              },
              "id": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "shape": {
                "enum": [
                  "rect",
                  "rounded-rect",
                  "ellipse",
                  "diamond",
                  "triangle",
                  "hexagon",
                  "parallelogram"
                ]
              },
              "x": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "y": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "width": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "height": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "text": {
                "type": "string",
                "maxLength": 500
              },
              "icon": {
                "anyOf": [
                  {
                    "enum": [
                      "cloud",
                      "database",
                      "api",
                      "user",
                      "server",
                      "analytics",
                      "browser",
                      "mobile",
                      "network",
                      "queue",
                      "shield"
                    ],
                    "description": "Built-in icon name. Icons render as 24x24 line art using the node textColor for the stroke, so their colors automatically adapt to all four themes."
                  },
                  {
                    "type": "string",
                    "maxLength": 200,
                    "pattern": "^assets/(?:[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*/)*[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*\\.(?:[Ss][Vv][Gg]|[Pp][Nn][Gg]|[Ww][Ee][Bb][Pp]|[Jj][Pp][Gg]|[Jj][Pp][Ee][Gg])$",
                    "description": "Image under assets/ used as a node icon. Raster images and SVG files loaded through <image> do not adapt to theme colors, so use artwork that remains legible against every theme background."
                  }
                ],
                "description": "Built-in icon name or path to an icon under assets/."
              },
              "ariaLabel": {
                "type": "string",
                "maxLength": 300
              },
              "z": {
                "type": "number",
                "minimum": -100,
                "maximum": 100,
                "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
              },
              "style": {
                "type": "object",
                "additionalProperties": false,
                "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
                "properties": {
                  "fill": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "stroke": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "textColor": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "strokeWidth": {
                    "type": "number",
                    "minimum": 0.5,
                    "maximum": 20
                  },
                  "fontSize": {
                    "type": "number",
                    "minimum": 8,
                    "maximum": 160
                  },
                  "opacity": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  },
                  "dash": {
                    "type": "string",
                    "maxLength": 40,
                    "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
                    "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
                  },
                  "cornerRadius": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 200
                  }
                }
              }
            }
          }
        },
        {
          "if": {
            "type": "object",
            "required": [
              "type"
            ],
            "properties": {
              "type": {
                "const": "group"
              }
            }
          },
          "then": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "type",
              "id",
              "x",
              "y",
              "width",
              "height"
            ],
            "properties": {
              "type": {
                "const": "group"
              },
              "id": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "x": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "y": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "width": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "height": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "title": {
                "type": "string",
                "maxLength": 200
              },
              "ariaLabel": {
                "type": "string",
                "maxLength": 300
              },
              "layout": {
                "anyOf": [
                  {
                    "enum": [
                      "row",
                      "column",
                      "grid",
                      "layered"
                    ],
                    "description": "String shorthand. Defaults are gap 36 / padding 54 / columns 3 / direction \"down\"."
                  },
                  {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "type"
                    ],
                    "properties": {
                      "type": {
                        "enum": [
                          "row",
                          "column",
                          "grid",
                          "layered"
                        ]
                      },
                      "gap": {
                        "type": "number",
                        "minimum": 0,
                        "maximum": 240
                      },
                      "rowGap": {
                        "type": "number",
                        "minimum": 0,
                        "maximum": 240
                      },
                      "columnGap": {
                        "type": "number",
                        "minimum": 0,
                        "maximum": 240
                      },
                      "padding": {
                        "type": "number",
                        "minimum": 0,
                        "maximum": 400
                      },
                      "columns": {
                        "type": "number",
                        "minimum": 1,
                        "maximum": 12,
                        "description": "Number of grid columns. Fractional values are truncated. Ignored for row / column / layered."
                      },
                      "direction": {
                        "enum": [
                          "down",
                          "right"
                        ],
                        "description": "Direction in which layered ranks extend. down means top to bottom; right means left to right. Not allowed for layouts other than layered."
                      }
                    },
                    "allOf": [
                      {
                        "if": {
                          "not": {
                            "properties": {
                              "type": {
                                "const": "layered"
                              }
                            },
                            "required": [
                              "type"
                            ]
                          }
                        },
                        "then": {
                          "not": {
                            "required": [
                              "direction"
                            ]
                          }
                        }
                      }
                    ]
                  }
                ],
                "description": "Automatic child placement. When specified, child x / y / width / height values are calculated automatically, and explicit x / y values are ignored. layered infers ranks from connectors between children."
              },
              "z": {
                "type": "number",
                "minimum": -100,
                "maximum": 100,
                "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
              },
              "style": {
                "type": "object",
                "additionalProperties": false,
                "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
                "properties": {
                  "fill": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "stroke": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "textColor": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "strokeWidth": {
                    "type": "number",
                    "minimum": 0.5,
                    "maximum": 20
                  },
                  "fontSize": {
                    "type": "number",
                    "minimum": 8,
                    "maximum": 160
                  },
                  "opacity": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  },
                  "dash": {
                    "type": "string",
                    "maxLength": 40,
                    "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
                    "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
                  },
                  "cornerRadius": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 200
                  }
                }
              },
              "children": {
                "type": "array",
                "maxItems": 200
              }
            },
            "description": "x / y / width / height are required directly under a parent without a layout.",
            "allOf": [
              {
                "if": {
                  "type": "object",
                  "required": [
                    "layout"
                  ]
                },
                "then": {
                  "type": "object",
                  "properties": {
                    "children": {
                      "type": "array",
                      "items": {
                        "$ref": "#/$defs/elementFlowL1"
                      }
                    }
                  }
                },
                "else": {
                  "type": "object",
                  "properties": {
                    "children": {
                      "type": "array",
                      "items": {
                        "$ref": "#/$defs/elementFixedL1"
                      }
                    }
                  }
                }
              }
            ]
          }
        },
        {
          "if": {
            "type": "object",
            "required": [
              "type"
            ],
            "properties": {
              "type": {
                "const": "image"
              }
            }
          },
          "then": {
            "description": "x / y / width / height are required directly under a parent without a layout.",
            "type": "object",
            "additionalProperties": false,
            "required": [
              "type",
              "id",
              "src",
              "x",
              "y",
              "width",
              "height"
            ],
            "properties": {
              "type": {
                "const": "image"
              },
              "id": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "src": {
                "type": "string",
                "maxLength": 200,
                "pattern": "^assets/(?:[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*/)*[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*\\.(?:[Ss][Vv][Gg]|[Pp][Nn][Gg]|[Ww][Ee][Bb][Pp]|[Jj][Pp][Gg]|[Jj][Pp][Ee][Gg])$",
                "description": "Image in the repository assets/ directory. Supported extensions are .svg / .png / .webp / .jpg / .jpeg, including uppercase variants. The syntax cannot represent paths containing '..', data: URIs, or external URLs."
              },
              "fit": {
                "enum": [
                  "contain",
                  "cover",
                  "stretch"
                ]
              },
              "x": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "y": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "width": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "height": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "ariaLabel": {
                "type": "string",
                "maxLength": 300,
                "description": "Alternative text for the image. Defaults first to the src file name and then to the id."
              },
              "z": {
                "type": "number",
                "minimum": -100,
                "maximum": 100,
                "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
              },
              "style": {
                "type": "object",
                "additionalProperties": false,
                "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
                "properties": {
                  "fill": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "stroke": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "textColor": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "strokeWidth": {
                    "type": "number",
                    "minimum": 0.5,
                    "maximum": 20
                  },
                  "fontSize": {
                    "type": "number",
                    "minimum": 8,
                    "maximum": 160
                  },
                  "opacity": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  },
                  "dash": {
                    "type": "string",
                    "maxLength": 40,
                    "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
                    "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
                  },
                  "cornerRadius": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 200
                  }
                }
              }
            }
          }
        },
        {
          "if": {
            "type": "object",
            "required": [
              "type"
            ],
            "properties": {
              "type": {
                "const": "connector"
              }
            }
          },
          "then": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "type",
              "from",
              "to"
            ],
            "properties": {
              "type": {
                "const": "connector"
              },
              "from": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "to": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "fromPort": {
                "enum": [
                  "auto",
                  "top",
                  "right",
                  "bottom",
                  "left"
                ]
              },
              "toPort": {
                "enum": [
                  "auto",
                  "top",
                  "right",
                  "bottom",
                  "left"
                ]
              },
              "label": {
                "type": "string",
                "maxLength": 200
              },
              "labelLayer": {
                "enum": [
                  "front",
                  "behind"
                ],
                "default": "front",
                "description": "Label stacking order. front renders above boxes; behind uses the connector body's stacking order."
              },
              "ariaLabel": {
                "type": "string",
                "maxLength": 300
              },
              "routing": {
                "enum": [
                  "straight",
                  "orthogonal",
                  "polyline"
                ]
              },
              "points": {
                "type": "array",
                "maxItems": 12,
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "x",
                    "y"
                  ],
                  "properties": {
                    "x": {
                      "type": "number",
                      "minimum": -4000,
                      "maximum": 4000,
                      "description": "Coordinate in the canvas coordinate system, relative to the parent group."
                    },
                    "y": {
                      "type": "number",
                      "minimum": -4000,
                      "maximum": 4000,
                      "description": "Coordinate in the canvas coordinate system, relative to the parent group."
                    }
                  }
                },
                "description": "Waypoints allowed only when routing is polyline."
              },
              "arrow": {
                "type": "boolean"
              },
              "lane": {
                "type": "number",
                "minimum": -12,
                "maximum": 12,
                "description": "Separation lane for parallel connectors. Fractional values are truncated."
              },
              "z": {
                "type": "number",
                "minimum": -100,
                "maximum": 100,
                "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
              },
              "style": {
                "type": "object",
                "additionalProperties": false,
                "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
                "properties": {
                  "fill": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "stroke": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "textColor": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "strokeWidth": {
                    "type": "number",
                    "minimum": 0.5,
                    "maximum": 20
                  },
                  "fontSize": {
                    "type": "number",
                    "minimum": 8,
                    "maximum": 160
                  },
                  "opacity": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  },
                  "dash": {
                    "type": "string",
                    "maxLength": 40,
                    "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
                    "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
                  },
                  "cornerRadius": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 200
                  }
                }
              }
            },
            "if": {
              "type": "object",
              "required": [
                "routing"
              ],
              "properties": {
                "routing": {
                  "const": "polyline"
                }
              }
            },
            "else": {
              "type": "object",
              "properties": {
                "points": {
                  "type": "array",
                  "maxItems": 0,
                  "description": "points may be specified only when routing is polyline."
                }
              }
            }
          }
        }
      ]
    },
    "elementFixedL1": {
      "type": "object",
      "required": [
        "type"
      ],
      "properties": {
        "type": {
          "enum": [
            "node",
            "group",
            "image",
            "connector"
          ]
        }
      },
      "allOf": [
        {
          "if": {
            "type": "object",
            "required": [
              "type"
            ],
            "properties": {
              "type": {
                "const": "node"
              }
            }
          },
          "then": {
            "description": "x / y / width / height are required directly under a parent without a layout.",
            "type": "object",
            "additionalProperties": false,
            "required": [
              "type",
              "id",
              "x",
              "y",
              "width",
              "height"
            ],
            "properties": {
              "type": {
                "const": "node"
              },
              "id": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "shape": {
                "enum": [
                  "rect",
                  "rounded-rect",
                  "ellipse",
                  "diamond",
                  "triangle",
                  "hexagon",
                  "parallelogram"
                ]
              },
              "x": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "y": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "width": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "height": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "text": {
                "type": "string",
                "maxLength": 500
              },
              "icon": {
                "anyOf": [
                  {
                    "enum": [
                      "cloud",
                      "database",
                      "api",
                      "user",
                      "server",
                      "analytics",
                      "browser",
                      "mobile",
                      "network",
                      "queue",
                      "shield"
                    ],
                    "description": "Built-in icon name. Icons render as 24x24 line art using the node textColor for the stroke, so their colors automatically adapt to all four themes."
                  },
                  {
                    "type": "string",
                    "maxLength": 200,
                    "pattern": "^assets/(?:[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*/)*[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*\\.(?:[Ss][Vv][Gg]|[Pp][Nn][Gg]|[Ww][Ee][Bb][Pp]|[Jj][Pp][Gg]|[Jj][Pp][Ee][Gg])$",
                    "description": "Image under assets/ used as a node icon. Raster images and SVG files loaded through <image> do not adapt to theme colors, so use artwork that remains legible against every theme background."
                  }
                ],
                "description": "Built-in icon name or path to an icon under assets/."
              },
              "ariaLabel": {
                "type": "string",
                "maxLength": 300
              },
              "z": {
                "type": "number",
                "minimum": -100,
                "maximum": 100,
                "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
              },
              "style": {
                "type": "object",
                "additionalProperties": false,
                "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
                "properties": {
                  "fill": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "stroke": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "textColor": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "strokeWidth": {
                    "type": "number",
                    "minimum": 0.5,
                    "maximum": 20
                  },
                  "fontSize": {
                    "type": "number",
                    "minimum": 8,
                    "maximum": 160
                  },
                  "opacity": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  },
                  "dash": {
                    "type": "string",
                    "maxLength": 40,
                    "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
                    "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
                  },
                  "cornerRadius": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 200
                  }
                }
              }
            }
          }
        },
        {
          "if": {
            "type": "object",
            "required": [
              "type"
            ],
            "properties": {
              "type": {
                "const": "group"
              }
            }
          },
          "then": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "type",
              "id",
              "x",
              "y",
              "width",
              "height"
            ],
            "properties": {
              "type": {
                "const": "group"
              },
              "id": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "x": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "y": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "width": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "height": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "title": {
                "type": "string",
                "maxLength": 200
              },
              "ariaLabel": {
                "type": "string",
                "maxLength": 300
              },
              "layout": {
                "anyOf": [
                  {
                    "enum": [
                      "row",
                      "column",
                      "grid",
                      "layered"
                    ],
                    "description": "String shorthand. Defaults are gap 36 / padding 54 / columns 3 / direction \"down\"."
                  },
                  {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "type"
                    ],
                    "properties": {
                      "type": {
                        "enum": [
                          "row",
                          "column",
                          "grid",
                          "layered"
                        ]
                      },
                      "gap": {
                        "type": "number",
                        "minimum": 0,
                        "maximum": 240
                      },
                      "rowGap": {
                        "type": "number",
                        "minimum": 0,
                        "maximum": 240
                      },
                      "columnGap": {
                        "type": "number",
                        "minimum": 0,
                        "maximum": 240
                      },
                      "padding": {
                        "type": "number",
                        "minimum": 0,
                        "maximum": 400
                      },
                      "columns": {
                        "type": "number",
                        "minimum": 1,
                        "maximum": 12,
                        "description": "Number of grid columns. Fractional values are truncated. Ignored for row / column / layered."
                      },
                      "direction": {
                        "enum": [
                          "down",
                          "right"
                        ],
                        "description": "Direction in which layered ranks extend. down means top to bottom; right means left to right. Not allowed for layouts other than layered."
                      }
                    },
                    "allOf": [
                      {
                        "if": {
                          "not": {
                            "properties": {
                              "type": {
                                "const": "layered"
                              }
                            },
                            "required": [
                              "type"
                            ]
                          }
                        },
                        "then": {
                          "not": {
                            "required": [
                              "direction"
                            ]
                          }
                        }
                      }
                    ]
                  }
                ],
                "description": "Automatic child placement. When specified, child x / y / width / height values are calculated automatically, and explicit x / y values are ignored. layered infers ranks from connectors between children."
              },
              "z": {
                "type": "number",
                "minimum": -100,
                "maximum": 100,
                "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
              },
              "style": {
                "type": "object",
                "additionalProperties": false,
                "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
                "properties": {
                  "fill": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "stroke": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "textColor": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "strokeWidth": {
                    "type": "number",
                    "minimum": 0.5,
                    "maximum": 20
                  },
                  "fontSize": {
                    "type": "number",
                    "minimum": 8,
                    "maximum": 160
                  },
                  "opacity": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  },
                  "dash": {
                    "type": "string",
                    "maxLength": 40,
                    "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
                    "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
                  },
                  "cornerRadius": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 200
                  }
                }
              },
              "children": {
                "type": "array",
                "maxItems": 200
              }
            },
            "description": "x / y / width / height are required directly under a parent without a layout.",
            "allOf": [
              {
                "if": {
                  "type": "object",
                  "required": [
                    "layout"
                  ]
                },
                "then": {
                  "type": "object",
                  "properties": {
                    "children": {
                      "type": "array",
                      "items": {
                        "$ref": "#/$defs/elementFlowL2"
                      }
                    }
                  }
                },
                "else": {
                  "type": "object",
                  "properties": {
                    "children": {
                      "type": "array",
                      "items": {
                        "$ref": "#/$defs/elementFixedL2"
                      }
                    }
                  }
                }
              }
            ]
          }
        },
        {
          "if": {
            "type": "object",
            "required": [
              "type"
            ],
            "properties": {
              "type": {
                "const": "image"
              }
            }
          },
          "then": {
            "description": "x / y / width / height are required directly under a parent without a layout.",
            "type": "object",
            "additionalProperties": false,
            "required": [
              "type",
              "id",
              "src",
              "x",
              "y",
              "width",
              "height"
            ],
            "properties": {
              "type": {
                "const": "image"
              },
              "id": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "src": {
                "type": "string",
                "maxLength": 200,
                "pattern": "^assets/(?:[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*/)*[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*\\.(?:[Ss][Vv][Gg]|[Pp][Nn][Gg]|[Ww][Ee][Bb][Pp]|[Jj][Pp][Gg]|[Jj][Pp][Ee][Gg])$",
                "description": "Image in the repository assets/ directory. Supported extensions are .svg / .png / .webp / .jpg / .jpeg, including uppercase variants. The syntax cannot represent paths containing '..', data: URIs, or external URLs."
              },
              "fit": {
                "enum": [
                  "contain",
                  "cover",
                  "stretch"
                ]
              },
              "x": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "y": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "width": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "height": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "ariaLabel": {
                "type": "string",
                "maxLength": 300,
                "description": "Alternative text for the image. Defaults first to the src file name and then to the id."
              },
              "z": {
                "type": "number",
                "minimum": -100,
                "maximum": 100,
                "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
              },
              "style": {
                "type": "object",
                "additionalProperties": false,
                "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
                "properties": {
                  "fill": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "stroke": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "textColor": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "strokeWidth": {
                    "type": "number",
                    "minimum": 0.5,
                    "maximum": 20
                  },
                  "fontSize": {
                    "type": "number",
                    "minimum": 8,
                    "maximum": 160
                  },
                  "opacity": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  },
                  "dash": {
                    "type": "string",
                    "maxLength": 40,
                    "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
                    "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
                  },
                  "cornerRadius": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 200
                  }
                }
              }
            }
          }
        },
        {
          "if": {
            "type": "object",
            "required": [
              "type"
            ],
            "properties": {
              "type": {
                "const": "connector"
              }
            }
          },
          "then": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "type",
              "from",
              "to"
            ],
            "properties": {
              "type": {
                "const": "connector"
              },
              "from": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "to": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "fromPort": {
                "enum": [
                  "auto",
                  "top",
                  "right",
                  "bottom",
                  "left"
                ]
              },
              "toPort": {
                "enum": [
                  "auto",
                  "top",
                  "right",
                  "bottom",
                  "left"
                ]
              },
              "label": {
                "type": "string",
                "maxLength": 200
              },
              "labelLayer": {
                "enum": [
                  "front",
                  "behind"
                ],
                "default": "front",
                "description": "Label stacking order. front renders above boxes; behind uses the connector body's stacking order."
              },
              "ariaLabel": {
                "type": "string",
                "maxLength": 300
              },
              "routing": {
                "enum": [
                  "straight",
                  "orthogonal",
                  "polyline"
                ]
              },
              "points": {
                "type": "array",
                "maxItems": 12,
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "x",
                    "y"
                  ],
                  "properties": {
                    "x": {
                      "type": "number",
                      "minimum": -4000,
                      "maximum": 4000,
                      "description": "Coordinate in the canvas coordinate system, relative to the parent group."
                    },
                    "y": {
                      "type": "number",
                      "minimum": -4000,
                      "maximum": 4000,
                      "description": "Coordinate in the canvas coordinate system, relative to the parent group."
                    }
                  }
                },
                "description": "Waypoints allowed only when routing is polyline."
              },
              "arrow": {
                "type": "boolean"
              },
              "lane": {
                "type": "number",
                "minimum": -12,
                "maximum": 12,
                "description": "Separation lane for parallel connectors. Fractional values are truncated."
              },
              "z": {
                "type": "number",
                "minimum": -100,
                "maximum": 100,
                "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
              },
              "style": {
                "type": "object",
                "additionalProperties": false,
                "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
                "properties": {
                  "fill": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "stroke": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "textColor": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "strokeWidth": {
                    "type": "number",
                    "minimum": 0.5,
                    "maximum": 20
                  },
                  "fontSize": {
                    "type": "number",
                    "minimum": 8,
                    "maximum": 160
                  },
                  "opacity": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  },
                  "dash": {
                    "type": "string",
                    "maxLength": 40,
                    "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
                    "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
                  },
                  "cornerRadius": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 200
                  }
                }
              }
            },
            "if": {
              "type": "object",
              "required": [
                "routing"
              ],
              "properties": {
                "routing": {
                  "const": "polyline"
                }
              }
            },
            "else": {
              "type": "object",
              "properties": {
                "points": {
                  "type": "array",
                  "maxItems": 0,
                  "description": "points may be specified only when routing is polyline."
                }
              }
            }
          }
        }
      ]
    },
    "elementFlowL1": {
      "type": "object",
      "required": [
        "type"
      ],
      "properties": {
        "type": {
          "enum": [
            "node",
            "group",
            "image",
            "connector"
          ]
        }
      },
      "allOf": [
        {
          "if": {
            "type": "object",
            "required": [
              "type"
            ],
            "properties": {
              "type": {
                "const": "node"
              }
            }
          },
          "then": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "type",
              "id"
            ],
            "properties": {
              "type": {
                "const": "node"
              },
              "id": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "shape": {
                "enum": [
                  "rect",
                  "rounded-rect",
                  "ellipse",
                  "diamond",
                  "triangle",
                  "hexagon",
                  "parallelogram"
                ]
              },
              "x": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "y": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "width": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "height": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "text": {
                "type": "string",
                "maxLength": 500
              },
              "icon": {
                "anyOf": [
                  {
                    "enum": [
                      "cloud",
                      "database",
                      "api",
                      "user",
                      "server",
                      "analytics",
                      "browser",
                      "mobile",
                      "network",
                      "queue",
                      "shield"
                    ],
                    "description": "Built-in icon name. Icons render as 24x24 line art using the node textColor for the stroke, so their colors automatically adapt to all four themes."
                  },
                  {
                    "type": "string",
                    "maxLength": 200,
                    "pattern": "^assets/(?:[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*/)*[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*\\.(?:[Ss][Vv][Gg]|[Pp][Nn][Gg]|[Ww][Ee][Bb][Pp]|[Jj][Pp][Gg]|[Jj][Pp][Ee][Gg])$",
                    "description": "Image under assets/ used as a node icon. Raster images and SVG files loaded through <image> do not adapt to theme colors, so use artwork that remains legible against every theme background."
                  }
                ],
                "description": "Built-in icon name or path to an icon under assets/."
              },
              "ariaLabel": {
                "type": "string",
                "maxLength": 300
              },
              "z": {
                "type": "number",
                "minimum": -100,
                "maximum": 100,
                "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
              },
              "style": {
                "type": "object",
                "additionalProperties": false,
                "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
                "properties": {
                  "fill": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "stroke": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "textColor": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "strokeWidth": {
                    "type": "number",
                    "minimum": 0.5,
                    "maximum": 20
                  },
                  "fontSize": {
                    "type": "number",
                    "minimum": 8,
                    "maximum": 160
                  },
                  "opacity": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  },
                  "dash": {
                    "type": "string",
                    "maxLength": 40,
                    "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
                    "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
                  },
                  "cornerRadius": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 200
                  }
                }
              }
            },
            "description": "Node placed directly under a group with a layout. Position and size are calculated automatically."
          }
        },
        {
          "if": {
            "type": "object",
            "required": [
              "type"
            ],
            "properties": {
              "type": {
                "const": "group"
              }
            }
          },
          "then": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "type",
              "id"
            ],
            "properties": {
              "type": {
                "const": "group"
              },
              "id": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "x": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "y": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "width": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "height": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "title": {
                "type": "string",
                "maxLength": 200
              },
              "ariaLabel": {
                "type": "string",
                "maxLength": 300
              },
              "layout": {
                "anyOf": [
                  {
                    "enum": [
                      "row",
                      "column",
                      "grid",
                      "layered"
                    ],
                    "description": "String shorthand. Defaults are gap 36 / padding 54 / columns 3 / direction \"down\"."
                  },
                  {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "type"
                    ],
                    "properties": {
                      "type": {
                        "enum": [
                          "row",
                          "column",
                          "grid",
                          "layered"
                        ]
                      },
                      "gap": {
                        "type": "number",
                        "minimum": 0,
                        "maximum": 240
                      },
                      "rowGap": {
                        "type": "number",
                        "minimum": 0,
                        "maximum": 240
                      },
                      "columnGap": {
                        "type": "number",
                        "minimum": 0,
                        "maximum": 240
                      },
                      "padding": {
                        "type": "number",
                        "minimum": 0,
                        "maximum": 400
                      },
                      "columns": {
                        "type": "number",
                        "minimum": 1,
                        "maximum": 12,
                        "description": "Number of grid columns. Fractional values are truncated. Ignored for row / column / layered."
                      },
                      "direction": {
                        "enum": [
                          "down",
                          "right"
                        ],
                        "description": "Direction in which layered ranks extend. down means top to bottom; right means left to right. Not allowed for layouts other than layered."
                      }
                    },
                    "allOf": [
                      {
                        "if": {
                          "not": {
                            "properties": {
                              "type": {
                                "const": "layered"
                              }
                            },
                            "required": [
                              "type"
                            ]
                          }
                        },
                        "then": {
                          "not": {
                            "required": [
                              "direction"
                            ]
                          }
                        }
                      }
                    ]
                  }
                ],
                "description": "Automatic child placement. When specified, child x / y / width / height values are calculated automatically, and explicit x / y values are ignored. layered infers ranks from connectors between children."
              },
              "z": {
                "type": "number",
                "minimum": -100,
                "maximum": 100,
                "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
              },
              "style": {
                "type": "object",
                "additionalProperties": false,
                "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
                "properties": {
                  "fill": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "stroke": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "textColor": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "strokeWidth": {
                    "type": "number",
                    "minimum": 0.5,
                    "maximum": 20
                  },
                  "fontSize": {
                    "type": "number",
                    "minimum": 8,
                    "maximum": 160
                  },
                  "opacity": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  },
                  "dash": {
                    "type": "string",
                    "maxLength": 40,
                    "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
                    "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
                  },
                  "cornerRadius": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 200
                  }
                }
              },
              "children": {
                "type": "array",
                "maxItems": 200
              }
            },
            "allOf": [
              {
                "if": {
                  "type": "object",
                  "required": [
                    "layout"
                  ]
                },
                "then": {
                  "type": "object",
                  "properties": {
                    "children": {
                      "type": "array",
                      "items": {
                        "$ref": "#/$defs/elementFlowL2"
                      }
                    }
                  }
                },
                "else": {
                  "type": "object",
                  "properties": {
                    "children": {
                      "type": "array",
                      "items": {
                        "$ref": "#/$defs/elementFixedL2"
                      }
                    }
                  }
                }
              }
            ]
          }
        },
        {
          "if": {
            "type": "object",
            "required": [
              "type"
            ],
            "properties": {
              "type": {
                "const": "image"
              }
            }
          },
          "then": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "type",
              "id",
              "src"
            ],
            "properties": {
              "type": {
                "const": "image"
              },
              "id": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "src": {
                "type": "string",
                "maxLength": 200,
                "pattern": "^assets/(?:[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*/)*[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*\\.(?:[Ss][Vv][Gg]|[Pp][Nn][Gg]|[Ww][Ee][Bb][Pp]|[Jj][Pp][Gg]|[Jj][Pp][Ee][Gg])$",
                "description": "Image in the repository assets/ directory. Supported extensions are .svg / .png / .webp / .jpg / .jpeg, including uppercase variants. The syntax cannot represent paths containing '..', data: URIs, or external URLs."
              },
              "fit": {
                "enum": [
                  "contain",
                  "cover",
                  "stretch"
                ]
              },
              "x": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "y": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "width": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "height": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "ariaLabel": {
                "type": "string",
                "maxLength": 300,
                "description": "Alternative text for the image. Defaults first to the src file name and then to the id."
              },
              "z": {
                "type": "number",
                "minimum": -100,
                "maximum": 100,
                "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
              },
              "style": {
                "type": "object",
                "additionalProperties": false,
                "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
                "properties": {
                  "fill": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "stroke": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "textColor": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "strokeWidth": {
                    "type": "number",
                    "minimum": 0.5,
                    "maximum": 20
                  },
                  "fontSize": {
                    "type": "number",
                    "minimum": 8,
                    "maximum": 160
                  },
                  "opacity": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  },
                  "dash": {
                    "type": "string",
                    "maxLength": 40,
                    "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
                    "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
                  },
                  "cornerRadius": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 200
                  }
                }
              }
            },
            "description": "Image placed directly under a group with a layout. Position and size are calculated automatically."
          }
        },
        {
          "if": {
            "type": "object",
            "required": [
              "type"
            ],
            "properties": {
              "type": {
                "const": "connector"
              }
            }
          },
          "then": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "type",
              "from",
              "to"
            ],
            "properties": {
              "type": {
                "const": "connector"
              },
              "from": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "to": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "fromPort": {
                "enum": [
                  "auto",
                  "top",
                  "right",
                  "bottom",
                  "left"
                ]
              },
              "toPort": {
                "enum": [
                  "auto",
                  "top",
                  "right",
                  "bottom",
                  "left"
                ]
              },
              "label": {
                "type": "string",
                "maxLength": 200
              },
              "labelLayer": {
                "enum": [
                  "front",
                  "behind"
                ],
                "default": "front",
                "description": "Label stacking order. front renders above boxes; behind uses the connector body's stacking order."
              },
              "ariaLabel": {
                "type": "string",
                "maxLength": 300
              },
              "routing": {
                "enum": [
                  "straight",
                  "orthogonal",
                  "polyline"
                ]
              },
              "points": {
                "type": "array",
                "maxItems": 12,
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "x",
                    "y"
                  ],
                  "properties": {
                    "x": {
                      "type": "number",
                      "minimum": -4000,
                      "maximum": 4000,
                      "description": "Coordinate in the canvas coordinate system, relative to the parent group."
                    },
                    "y": {
                      "type": "number",
                      "minimum": -4000,
                      "maximum": 4000,
                      "description": "Coordinate in the canvas coordinate system, relative to the parent group."
                    }
                  }
                },
                "description": "Waypoints allowed only when routing is polyline."
              },
              "arrow": {
                "type": "boolean"
              },
              "lane": {
                "type": "number",
                "minimum": -12,
                "maximum": 12,
                "description": "Separation lane for parallel connectors. Fractional values are truncated."
              },
              "z": {
                "type": "number",
                "minimum": -100,
                "maximum": 100,
                "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
              },
              "style": {
                "type": "object",
                "additionalProperties": false,
                "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
                "properties": {
                  "fill": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "stroke": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "textColor": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "strokeWidth": {
                    "type": "number",
                    "minimum": 0.5,
                    "maximum": 20
                  },
                  "fontSize": {
                    "type": "number",
                    "minimum": 8,
                    "maximum": 160
                  },
                  "opacity": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  },
                  "dash": {
                    "type": "string",
                    "maxLength": 40,
                    "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
                    "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
                  },
                  "cornerRadius": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 200
                  }
                }
              }
            },
            "if": {
              "type": "object",
              "required": [
                "routing"
              ],
              "properties": {
                "routing": {
                  "const": "polyline"
                }
              }
            },
            "else": {
              "type": "object",
              "properties": {
                "points": {
                  "type": "array",
                  "maxItems": 0,
                  "description": "points may be specified only when routing is polyline."
                }
              }
            }
          }
        }
      ]
    },
    "elementFixedL2": {
      "type": "object",
      "required": [
        "type"
      ],
      "properties": {
        "type": {
          "enum": [
            "node",
            "group",
            "image",
            "connector"
          ]
        }
      },
      "allOf": [
        {
          "if": {
            "type": "object",
            "required": [
              "type"
            ],
            "properties": {
              "type": {
                "const": "node"
              }
            }
          },
          "then": {
            "description": "x / y / width / height are required directly under a parent without a layout.",
            "type": "object",
            "additionalProperties": false,
            "required": [
              "type",
              "id",
              "x",
              "y",
              "width",
              "height"
            ],
            "properties": {
              "type": {
                "const": "node"
              },
              "id": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "shape": {
                "enum": [
                  "rect",
                  "rounded-rect",
                  "ellipse",
                  "diamond",
                  "triangle",
                  "hexagon",
                  "parallelogram"
                ]
              },
              "x": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "y": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "width": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "height": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "text": {
                "type": "string",
                "maxLength": 500
              },
              "icon": {
                "anyOf": [
                  {
                    "enum": [
                      "cloud",
                      "database",
                      "api",
                      "user",
                      "server",
                      "analytics",
                      "browser",
                      "mobile",
                      "network",
                      "queue",
                      "shield"
                    ],
                    "description": "Built-in icon name. Icons render as 24x24 line art using the node textColor for the stroke, so their colors automatically adapt to all four themes."
                  },
                  {
                    "type": "string",
                    "maxLength": 200,
                    "pattern": "^assets/(?:[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*/)*[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*\\.(?:[Ss][Vv][Gg]|[Pp][Nn][Gg]|[Ww][Ee][Bb][Pp]|[Jj][Pp][Gg]|[Jj][Pp][Ee][Gg])$",
                    "description": "Image under assets/ used as a node icon. Raster images and SVG files loaded through <image> do not adapt to theme colors, so use artwork that remains legible against every theme background."
                  }
                ],
                "description": "Built-in icon name or path to an icon under assets/."
              },
              "ariaLabel": {
                "type": "string",
                "maxLength": 300
              },
              "z": {
                "type": "number",
                "minimum": -100,
                "maximum": 100,
                "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
              },
              "style": {
                "type": "object",
                "additionalProperties": false,
                "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
                "properties": {
                  "fill": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "stroke": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "textColor": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "strokeWidth": {
                    "type": "number",
                    "minimum": 0.5,
                    "maximum": 20
                  },
                  "fontSize": {
                    "type": "number",
                    "minimum": 8,
                    "maximum": 160
                  },
                  "opacity": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  },
                  "dash": {
                    "type": "string",
                    "maxLength": 40,
                    "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
                    "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
                  },
                  "cornerRadius": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 200
                  }
                }
              }
            }
          }
        },
        {
          "if": {
            "type": "object",
            "required": [
              "type"
            ],
            "properties": {
              "type": {
                "const": "group"
              }
            }
          },
          "then": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "type",
              "id",
              "x",
              "y",
              "width",
              "height"
            ],
            "properties": {
              "type": {
                "const": "group"
              },
              "id": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "x": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "y": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "width": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "height": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "title": {
                "type": "string",
                "maxLength": 200
              },
              "ariaLabel": {
                "type": "string",
                "maxLength": 300
              },
              "layout": {
                "anyOf": [
                  {
                    "enum": [
                      "row",
                      "column",
                      "grid",
                      "layered"
                    ],
                    "description": "String shorthand. Defaults are gap 36 / padding 54 / columns 3 / direction \"down\"."
                  },
                  {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "type"
                    ],
                    "properties": {
                      "type": {
                        "enum": [
                          "row",
                          "column",
                          "grid",
                          "layered"
                        ]
                      },
                      "gap": {
                        "type": "number",
                        "minimum": 0,
                        "maximum": 240
                      },
                      "rowGap": {
                        "type": "number",
                        "minimum": 0,
                        "maximum": 240
                      },
                      "columnGap": {
                        "type": "number",
                        "minimum": 0,
                        "maximum": 240
                      },
                      "padding": {
                        "type": "number",
                        "minimum": 0,
                        "maximum": 400
                      },
                      "columns": {
                        "type": "number",
                        "minimum": 1,
                        "maximum": 12,
                        "description": "Number of grid columns. Fractional values are truncated. Ignored for row / column / layered."
                      },
                      "direction": {
                        "enum": [
                          "down",
                          "right"
                        ],
                        "description": "Direction in which layered ranks extend. down means top to bottom; right means left to right. Not allowed for layouts other than layered."
                      }
                    },
                    "allOf": [
                      {
                        "if": {
                          "not": {
                            "properties": {
                              "type": {
                                "const": "layered"
                              }
                            },
                            "required": [
                              "type"
                            ]
                          }
                        },
                        "then": {
                          "not": {
                            "required": [
                              "direction"
                            ]
                          }
                        }
                      }
                    ]
                  }
                ],
                "description": "Automatic child placement. When specified, child x / y / width / height values are calculated automatically, and explicit x / y values are ignored. layered infers ranks from connectors between children."
              },
              "z": {
                "type": "number",
                "minimum": -100,
                "maximum": 100,
                "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
              },
              "style": {
                "type": "object",
                "additionalProperties": false,
                "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
                "properties": {
                  "fill": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "stroke": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "textColor": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "strokeWidth": {
                    "type": "number",
                    "minimum": 0.5,
                    "maximum": 20
                  },
                  "fontSize": {
                    "type": "number",
                    "minimum": 8,
                    "maximum": 160
                  },
                  "opacity": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  },
                  "dash": {
                    "type": "string",
                    "maxLength": 40,
                    "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
                    "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
                  },
                  "cornerRadius": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 200
                  }
                }
              },
              "children": {
                "type": "array",
                "maxItems": 200
              }
            },
            "description": "x / y / width / height are required directly under a parent without a layout.",
            "allOf": [
              {
                "if": {
                  "type": "object",
                  "required": [
                    "layout"
                  ]
                },
                "then": {
                  "type": "object",
                  "properties": {
                    "children": {
                      "type": "array",
                      "items": {
                        "$ref": "#/$defs/elementFlowL3"
                      }
                    }
                  }
                },
                "else": {
                  "type": "object",
                  "properties": {
                    "children": {
                      "type": "array",
                      "items": {
                        "$ref": "#/$defs/elementFixedL3"
                      }
                    }
                  }
                }
              }
            ]
          }
        },
        {
          "if": {
            "type": "object",
            "required": [
              "type"
            ],
            "properties": {
              "type": {
                "const": "image"
              }
            }
          },
          "then": {
            "description": "x / y / width / height are required directly under a parent without a layout.",
            "type": "object",
            "additionalProperties": false,
            "required": [
              "type",
              "id",
              "src",
              "x",
              "y",
              "width",
              "height"
            ],
            "properties": {
              "type": {
                "const": "image"
              },
              "id": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "src": {
                "type": "string",
                "maxLength": 200,
                "pattern": "^assets/(?:[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*/)*[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*\\.(?:[Ss][Vv][Gg]|[Pp][Nn][Gg]|[Ww][Ee][Bb][Pp]|[Jj][Pp][Gg]|[Jj][Pp][Ee][Gg])$",
                "description": "Image in the repository assets/ directory. Supported extensions are .svg / .png / .webp / .jpg / .jpeg, including uppercase variants. The syntax cannot represent paths containing '..', data: URIs, or external URLs."
              },
              "fit": {
                "enum": [
                  "contain",
                  "cover",
                  "stretch"
                ]
              },
              "x": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "y": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "width": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "height": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "ariaLabel": {
                "type": "string",
                "maxLength": 300,
                "description": "Alternative text for the image. Defaults first to the src file name and then to the id."
              },
              "z": {
                "type": "number",
                "minimum": -100,
                "maximum": 100,
                "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
              },
              "style": {
                "type": "object",
                "additionalProperties": false,
                "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
                "properties": {
                  "fill": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "stroke": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "textColor": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "strokeWidth": {
                    "type": "number",
                    "minimum": 0.5,
                    "maximum": 20
                  },
                  "fontSize": {
                    "type": "number",
                    "minimum": 8,
                    "maximum": 160
                  },
                  "opacity": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  },
                  "dash": {
                    "type": "string",
                    "maxLength": 40,
                    "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
                    "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
                  },
                  "cornerRadius": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 200
                  }
                }
              }
            }
          }
        },
        {
          "if": {
            "type": "object",
            "required": [
              "type"
            ],
            "properties": {
              "type": {
                "const": "connector"
              }
            }
          },
          "then": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "type",
              "from",
              "to"
            ],
            "properties": {
              "type": {
                "const": "connector"
              },
              "from": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "to": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "fromPort": {
                "enum": [
                  "auto",
                  "top",
                  "right",
                  "bottom",
                  "left"
                ]
              },
              "toPort": {
                "enum": [
                  "auto",
                  "top",
                  "right",
                  "bottom",
                  "left"
                ]
              },
              "label": {
                "type": "string",
                "maxLength": 200
              },
              "labelLayer": {
                "enum": [
                  "front",
                  "behind"
                ],
                "default": "front",
                "description": "Label stacking order. front renders above boxes; behind uses the connector body's stacking order."
              },
              "ariaLabel": {
                "type": "string",
                "maxLength": 300
              },
              "routing": {
                "enum": [
                  "straight",
                  "orthogonal",
                  "polyline"
                ]
              },
              "points": {
                "type": "array",
                "maxItems": 12,
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "x",
                    "y"
                  ],
                  "properties": {
                    "x": {
                      "type": "number",
                      "minimum": -4000,
                      "maximum": 4000,
                      "description": "Coordinate in the canvas coordinate system, relative to the parent group."
                    },
                    "y": {
                      "type": "number",
                      "minimum": -4000,
                      "maximum": 4000,
                      "description": "Coordinate in the canvas coordinate system, relative to the parent group."
                    }
                  }
                },
                "description": "Waypoints allowed only when routing is polyline."
              },
              "arrow": {
                "type": "boolean"
              },
              "lane": {
                "type": "number",
                "minimum": -12,
                "maximum": 12,
                "description": "Separation lane for parallel connectors. Fractional values are truncated."
              },
              "z": {
                "type": "number",
                "minimum": -100,
                "maximum": 100,
                "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
              },
              "style": {
                "type": "object",
                "additionalProperties": false,
                "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
                "properties": {
                  "fill": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "stroke": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "textColor": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "strokeWidth": {
                    "type": "number",
                    "minimum": 0.5,
                    "maximum": 20
                  },
                  "fontSize": {
                    "type": "number",
                    "minimum": 8,
                    "maximum": 160
                  },
                  "opacity": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  },
                  "dash": {
                    "type": "string",
                    "maxLength": 40,
                    "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
                    "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
                  },
                  "cornerRadius": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 200
                  }
                }
              }
            },
            "if": {
              "type": "object",
              "required": [
                "routing"
              ],
              "properties": {
                "routing": {
                  "const": "polyline"
                }
              }
            },
            "else": {
              "type": "object",
              "properties": {
                "points": {
                  "type": "array",
                  "maxItems": 0,
                  "description": "points may be specified only when routing is polyline."
                }
              }
            }
          }
        }
      ]
    },
    "elementFlowL2": {
      "type": "object",
      "required": [
        "type"
      ],
      "properties": {
        "type": {
          "enum": [
            "node",
            "group",
            "image",
            "connector"
          ]
        }
      },
      "allOf": [
        {
          "if": {
            "type": "object",
            "required": [
              "type"
            ],
            "properties": {
              "type": {
                "const": "node"
              }
            }
          },
          "then": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "type",
              "id"
            ],
            "properties": {
              "type": {
                "const": "node"
              },
              "id": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "shape": {
                "enum": [
                  "rect",
                  "rounded-rect",
                  "ellipse",
                  "diamond",
                  "triangle",
                  "hexagon",
                  "parallelogram"
                ]
              },
              "x": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "y": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "width": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "height": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "text": {
                "type": "string",
                "maxLength": 500
              },
              "icon": {
                "anyOf": [
                  {
                    "enum": [
                      "cloud",
                      "database",
                      "api",
                      "user",
                      "server",
                      "analytics",
                      "browser",
                      "mobile",
                      "network",
                      "queue",
                      "shield"
                    ],
                    "description": "Built-in icon name. Icons render as 24x24 line art using the node textColor for the stroke, so their colors automatically adapt to all four themes."
                  },
                  {
                    "type": "string",
                    "maxLength": 200,
                    "pattern": "^assets/(?:[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*/)*[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*\\.(?:[Ss][Vv][Gg]|[Pp][Nn][Gg]|[Ww][Ee][Bb][Pp]|[Jj][Pp][Gg]|[Jj][Pp][Ee][Gg])$",
                    "description": "Image under assets/ used as a node icon. Raster images and SVG files loaded through <image> do not adapt to theme colors, so use artwork that remains legible against every theme background."
                  }
                ],
                "description": "Built-in icon name or path to an icon under assets/."
              },
              "ariaLabel": {
                "type": "string",
                "maxLength": 300
              },
              "z": {
                "type": "number",
                "minimum": -100,
                "maximum": 100,
                "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
              },
              "style": {
                "type": "object",
                "additionalProperties": false,
                "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
                "properties": {
                  "fill": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "stroke": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "textColor": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "strokeWidth": {
                    "type": "number",
                    "minimum": 0.5,
                    "maximum": 20
                  },
                  "fontSize": {
                    "type": "number",
                    "minimum": 8,
                    "maximum": 160
                  },
                  "opacity": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  },
                  "dash": {
                    "type": "string",
                    "maxLength": 40,
                    "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
                    "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
                  },
                  "cornerRadius": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 200
                  }
                }
              }
            },
            "description": "Node placed directly under a group with a layout. Position and size are calculated automatically."
          }
        },
        {
          "if": {
            "type": "object",
            "required": [
              "type"
            ],
            "properties": {
              "type": {
                "const": "group"
              }
            }
          },
          "then": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "type",
              "id"
            ],
            "properties": {
              "type": {
                "const": "group"
              },
              "id": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "x": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "y": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "width": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "height": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "title": {
                "type": "string",
                "maxLength": 200
              },
              "ariaLabel": {
                "type": "string",
                "maxLength": 300
              },
              "layout": {
                "anyOf": [
                  {
                    "enum": [
                      "row",
                      "column",
                      "grid",
                      "layered"
                    ],
                    "description": "String shorthand. Defaults are gap 36 / padding 54 / columns 3 / direction \"down\"."
                  },
                  {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "type"
                    ],
                    "properties": {
                      "type": {
                        "enum": [
                          "row",
                          "column",
                          "grid",
                          "layered"
                        ]
                      },
                      "gap": {
                        "type": "number",
                        "minimum": 0,
                        "maximum": 240
                      },
                      "rowGap": {
                        "type": "number",
                        "minimum": 0,
                        "maximum": 240
                      },
                      "columnGap": {
                        "type": "number",
                        "minimum": 0,
                        "maximum": 240
                      },
                      "padding": {
                        "type": "number",
                        "minimum": 0,
                        "maximum": 400
                      },
                      "columns": {
                        "type": "number",
                        "minimum": 1,
                        "maximum": 12,
                        "description": "Number of grid columns. Fractional values are truncated. Ignored for row / column / layered."
                      },
                      "direction": {
                        "enum": [
                          "down",
                          "right"
                        ],
                        "description": "Direction in which layered ranks extend. down means top to bottom; right means left to right. Not allowed for layouts other than layered."
                      }
                    },
                    "allOf": [
                      {
                        "if": {
                          "not": {
                            "properties": {
                              "type": {
                                "const": "layered"
                              }
                            },
                            "required": [
                              "type"
                            ]
                          }
                        },
                        "then": {
                          "not": {
                            "required": [
                              "direction"
                            ]
                          }
                        }
                      }
                    ]
                  }
                ],
                "description": "Automatic child placement. When specified, child x / y / width / height values are calculated automatically, and explicit x / y values are ignored. layered infers ranks from connectors between children."
              },
              "z": {
                "type": "number",
                "minimum": -100,
                "maximum": 100,
                "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
              },
              "style": {
                "type": "object",
                "additionalProperties": false,
                "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
                "properties": {
                  "fill": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "stroke": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "textColor": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "strokeWidth": {
                    "type": "number",
                    "minimum": 0.5,
                    "maximum": 20
                  },
                  "fontSize": {
                    "type": "number",
                    "minimum": 8,
                    "maximum": 160
                  },
                  "opacity": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  },
                  "dash": {
                    "type": "string",
                    "maxLength": 40,
                    "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
                    "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
                  },
                  "cornerRadius": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 200
                  }
                }
              },
              "children": {
                "type": "array",
                "maxItems": 200
              }
            },
            "allOf": [
              {
                "if": {
                  "type": "object",
                  "required": [
                    "layout"
                  ]
                },
                "then": {
                  "type": "object",
                  "properties": {
                    "children": {
                      "type": "array",
                      "items": {
                        "$ref": "#/$defs/elementFlowL3"
                      }
                    }
                  }
                },
                "else": {
                  "type": "object",
                  "properties": {
                    "children": {
                      "type": "array",
                      "items": {
                        "$ref": "#/$defs/elementFixedL3"
                      }
                    }
                  }
                }
              }
            ]
          }
        },
        {
          "if": {
            "type": "object",
            "required": [
              "type"
            ],
            "properties": {
              "type": {
                "const": "image"
              }
            }
          },
          "then": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "type",
              "id",
              "src"
            ],
            "properties": {
              "type": {
                "const": "image"
              },
              "id": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "src": {
                "type": "string",
                "maxLength": 200,
                "pattern": "^assets/(?:[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*/)*[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*\\.(?:[Ss][Vv][Gg]|[Pp][Nn][Gg]|[Ww][Ee][Bb][Pp]|[Jj][Pp][Gg]|[Jj][Pp][Ee][Gg])$",
                "description": "Image in the repository assets/ directory. Supported extensions are .svg / .png / .webp / .jpg / .jpeg, including uppercase variants. The syntax cannot represent paths containing '..', data: URIs, or external URLs."
              },
              "fit": {
                "enum": [
                  "contain",
                  "cover",
                  "stretch"
                ]
              },
              "x": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "y": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "width": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "height": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "ariaLabel": {
                "type": "string",
                "maxLength": 300,
                "description": "Alternative text for the image. Defaults first to the src file name and then to the id."
              },
              "z": {
                "type": "number",
                "minimum": -100,
                "maximum": 100,
                "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
              },
              "style": {
                "type": "object",
                "additionalProperties": false,
                "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
                "properties": {
                  "fill": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "stroke": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "textColor": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "strokeWidth": {
                    "type": "number",
                    "minimum": 0.5,
                    "maximum": 20
                  },
                  "fontSize": {
                    "type": "number",
                    "minimum": 8,
                    "maximum": 160
                  },
                  "opacity": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  },
                  "dash": {
                    "type": "string",
                    "maxLength": 40,
                    "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
                    "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
                  },
                  "cornerRadius": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 200
                  }
                }
              }
            },
            "description": "Image placed directly under a group with a layout. Position and size are calculated automatically."
          }
        },
        {
          "if": {
            "type": "object",
            "required": [
              "type"
            ],
            "properties": {
              "type": {
                "const": "connector"
              }
            }
          },
          "then": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "type",
              "from",
              "to"
            ],
            "properties": {
              "type": {
                "const": "connector"
              },
              "from": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "to": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "fromPort": {
                "enum": [
                  "auto",
                  "top",
                  "right",
                  "bottom",
                  "left"
                ]
              },
              "toPort": {
                "enum": [
                  "auto",
                  "top",
                  "right",
                  "bottom",
                  "left"
                ]
              },
              "label": {
                "type": "string",
                "maxLength": 200
              },
              "labelLayer": {
                "enum": [
                  "front",
                  "behind"
                ],
                "default": "front",
                "description": "Label stacking order. front renders above boxes; behind uses the connector body's stacking order."
              },
              "ariaLabel": {
                "type": "string",
                "maxLength": 300
              },
              "routing": {
                "enum": [
                  "straight",
                  "orthogonal",
                  "polyline"
                ]
              },
              "points": {
                "type": "array",
                "maxItems": 12,
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "x",
                    "y"
                  ],
                  "properties": {
                    "x": {
                      "type": "number",
                      "minimum": -4000,
                      "maximum": 4000,
                      "description": "Coordinate in the canvas coordinate system, relative to the parent group."
                    },
                    "y": {
                      "type": "number",
                      "minimum": -4000,
                      "maximum": 4000,
                      "description": "Coordinate in the canvas coordinate system, relative to the parent group."
                    }
                  }
                },
                "description": "Waypoints allowed only when routing is polyline."
              },
              "arrow": {
                "type": "boolean"
              },
              "lane": {
                "type": "number",
                "minimum": -12,
                "maximum": 12,
                "description": "Separation lane for parallel connectors. Fractional values are truncated."
              },
              "z": {
                "type": "number",
                "minimum": -100,
                "maximum": 100,
                "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
              },
              "style": {
                "type": "object",
                "additionalProperties": false,
                "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
                "properties": {
                  "fill": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "stroke": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "textColor": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "strokeWidth": {
                    "type": "number",
                    "minimum": 0.5,
                    "maximum": 20
                  },
                  "fontSize": {
                    "type": "number",
                    "minimum": 8,
                    "maximum": 160
                  },
                  "opacity": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  },
                  "dash": {
                    "type": "string",
                    "maxLength": 40,
                    "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
                    "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
                  },
                  "cornerRadius": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 200
                  }
                }
              }
            },
            "if": {
              "type": "object",
              "required": [
                "routing"
              ],
              "properties": {
                "routing": {
                  "const": "polyline"
                }
              }
            },
            "else": {
              "type": "object",
              "properties": {
                "points": {
                  "type": "array",
                  "maxItems": 0,
                  "description": "points may be specified only when routing is polyline."
                }
              }
            }
          }
        }
      ]
    },
    "elementFixedL3": {
      "type": "object",
      "required": [
        "type"
      ],
      "properties": {
        "type": {
          "enum": [
            "node",
            "group",
            "image",
            "connector"
          ]
        }
      },
      "allOf": [
        {
          "if": {
            "type": "object",
            "required": [
              "type"
            ],
            "properties": {
              "type": {
                "const": "node"
              }
            }
          },
          "then": {
            "description": "x / y / width / height are required directly under a parent without a layout.",
            "type": "object",
            "additionalProperties": false,
            "required": [
              "type",
              "id",
              "x",
              "y",
              "width",
              "height"
            ],
            "properties": {
              "type": {
                "const": "node"
              },
              "id": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "shape": {
                "enum": [
                  "rect",
                  "rounded-rect",
                  "ellipse",
                  "diamond",
                  "triangle",
                  "hexagon",
                  "parallelogram"
                ]
              },
              "x": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "y": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "width": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "height": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "text": {
                "type": "string",
                "maxLength": 500
              },
              "icon": {
                "anyOf": [
                  {
                    "enum": [
                      "cloud",
                      "database",
                      "api",
                      "user",
                      "server",
                      "analytics",
                      "browser",
                      "mobile",
                      "network",
                      "queue",
                      "shield"
                    ],
                    "description": "Built-in icon name. Icons render as 24x24 line art using the node textColor for the stroke, so their colors automatically adapt to all four themes."
                  },
                  {
                    "type": "string",
                    "maxLength": 200,
                    "pattern": "^assets/(?:[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*/)*[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*\\.(?:[Ss][Vv][Gg]|[Pp][Nn][Gg]|[Ww][Ee][Bb][Pp]|[Jj][Pp][Gg]|[Jj][Pp][Ee][Gg])$",
                    "description": "Image under assets/ used as a node icon. Raster images and SVG files loaded through <image> do not adapt to theme colors, so use artwork that remains legible against every theme background."
                  }
                ],
                "description": "Built-in icon name or path to an icon under assets/."
              },
              "ariaLabel": {
                "type": "string",
                "maxLength": 300
              },
              "z": {
                "type": "number",
                "minimum": -100,
                "maximum": 100,
                "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
              },
              "style": {
                "type": "object",
                "additionalProperties": false,
                "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
                "properties": {
                  "fill": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "stroke": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "textColor": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "strokeWidth": {
                    "type": "number",
                    "minimum": 0.5,
                    "maximum": 20
                  },
                  "fontSize": {
                    "type": "number",
                    "minimum": 8,
                    "maximum": 160
                  },
                  "opacity": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  },
                  "dash": {
                    "type": "string",
                    "maxLength": 40,
                    "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
                    "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
                  },
                  "cornerRadius": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 200
                  }
                }
              }
            }
          }
        },
        {
          "if": {
            "type": "object",
            "required": [
              "type"
            ],
            "properties": {
              "type": {
                "const": "group"
              }
            }
          },
          "then": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "type",
              "id",
              "x",
              "y",
              "width",
              "height"
            ],
            "properties": {
              "type": {
                "const": "group"
              },
              "id": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "x": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "y": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "width": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "height": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "title": {
                "type": "string",
                "maxLength": 200
              },
              "ariaLabel": {
                "type": "string",
                "maxLength": 300
              },
              "layout": {
                "anyOf": [
                  {
                    "enum": [
                      "row",
                      "column",
                      "grid",
                      "layered"
                    ],
                    "description": "String shorthand. Defaults are gap 36 / padding 54 / columns 3 / direction \"down\"."
                  },
                  {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "type"
                    ],
                    "properties": {
                      "type": {
                        "enum": [
                          "row",
                          "column",
                          "grid",
                          "layered"
                        ]
                      },
                      "gap": {
                        "type": "number",
                        "minimum": 0,
                        "maximum": 240
                      },
                      "rowGap": {
                        "type": "number",
                        "minimum": 0,
                        "maximum": 240
                      },
                      "columnGap": {
                        "type": "number",
                        "minimum": 0,
                        "maximum": 240
                      },
                      "padding": {
                        "type": "number",
                        "minimum": 0,
                        "maximum": 400
                      },
                      "columns": {
                        "type": "number",
                        "minimum": 1,
                        "maximum": 12,
                        "description": "Number of grid columns. Fractional values are truncated. Ignored for row / column / layered."
                      },
                      "direction": {
                        "enum": [
                          "down",
                          "right"
                        ],
                        "description": "Direction in which layered ranks extend. down means top to bottom; right means left to right. Not allowed for layouts other than layered."
                      }
                    },
                    "allOf": [
                      {
                        "if": {
                          "not": {
                            "properties": {
                              "type": {
                                "const": "layered"
                              }
                            },
                            "required": [
                              "type"
                            ]
                          }
                        },
                        "then": {
                          "not": {
                            "required": [
                              "direction"
                            ]
                          }
                        }
                      }
                    ]
                  }
                ],
                "description": "Automatic child placement. When specified, child x / y / width / height values are calculated automatically, and explicit x / y values are ignored. layered infers ranks from connectors between children."
              },
              "z": {
                "type": "number",
                "minimum": -100,
                "maximum": 100,
                "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
              },
              "style": {
                "type": "object",
                "additionalProperties": false,
                "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
                "properties": {
                  "fill": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "stroke": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "textColor": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "strokeWidth": {
                    "type": "number",
                    "minimum": 0.5,
                    "maximum": 20
                  },
                  "fontSize": {
                    "type": "number",
                    "minimum": 8,
                    "maximum": 160
                  },
                  "opacity": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  },
                  "dash": {
                    "type": "string",
                    "maxLength": 40,
                    "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
                    "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
                  },
                  "cornerRadius": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 200
                  }
                }
              },
              "children": {
                "type": "array",
                "maxItems": 200
              }
            },
            "description": "x / y / width / height are required directly under a parent without a layout.",
            "allOf": [
              {
                "if": {
                  "type": "object",
                  "required": [
                    "layout"
                  ]
                },
                "then": {
                  "type": "object",
                  "properties": {
                    "children": {
                      "type": "array",
                      "items": {
                        "$ref": "#/$defs/elementFlowL4"
                      }
                    }
                  }
                },
                "else": {
                  "type": "object",
                  "properties": {
                    "children": {
                      "type": "array",
                      "items": {
                        "$ref": "#/$defs/elementFixedL4"
                      }
                    }
                  }
                }
              }
            ]
          }
        },
        {
          "if": {
            "type": "object",
            "required": [
              "type"
            ],
            "properties": {
              "type": {
                "const": "image"
              }
            }
          },
          "then": {
            "description": "x / y / width / height are required directly under a parent without a layout.",
            "type": "object",
            "additionalProperties": false,
            "required": [
              "type",
              "id",
              "src",
              "x",
              "y",
              "width",
              "height"
            ],
            "properties": {
              "type": {
                "const": "image"
              },
              "id": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "src": {
                "type": "string",
                "maxLength": 200,
                "pattern": "^assets/(?:[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*/)*[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*\\.(?:[Ss][Vv][Gg]|[Pp][Nn][Gg]|[Ww][Ee][Bb][Pp]|[Jj][Pp][Gg]|[Jj][Pp][Ee][Gg])$",
                "description": "Image in the repository assets/ directory. Supported extensions are .svg / .png / .webp / .jpg / .jpeg, including uppercase variants. The syntax cannot represent paths containing '..', data: URIs, or external URLs."
              },
              "fit": {
                "enum": [
                  "contain",
                  "cover",
                  "stretch"
                ]
              },
              "x": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "y": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "width": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "height": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "ariaLabel": {
                "type": "string",
                "maxLength": 300,
                "description": "Alternative text for the image. Defaults first to the src file name and then to the id."
              },
              "z": {
                "type": "number",
                "minimum": -100,
                "maximum": 100,
                "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
              },
              "style": {
                "type": "object",
                "additionalProperties": false,
                "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
                "properties": {
                  "fill": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "stroke": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "textColor": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "strokeWidth": {
                    "type": "number",
                    "minimum": 0.5,
                    "maximum": 20
                  },
                  "fontSize": {
                    "type": "number",
                    "minimum": 8,
                    "maximum": 160
                  },
                  "opacity": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  },
                  "dash": {
                    "type": "string",
                    "maxLength": 40,
                    "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
                    "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
                  },
                  "cornerRadius": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 200
                  }
                }
              }
            }
          }
        },
        {
          "if": {
            "type": "object",
            "required": [
              "type"
            ],
            "properties": {
              "type": {
                "const": "connector"
              }
            }
          },
          "then": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "type",
              "from",
              "to"
            ],
            "properties": {
              "type": {
                "const": "connector"
              },
              "from": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "to": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "fromPort": {
                "enum": [
                  "auto",
                  "top",
                  "right",
                  "bottom",
                  "left"
                ]
              },
              "toPort": {
                "enum": [
                  "auto",
                  "top",
                  "right",
                  "bottom",
                  "left"
                ]
              },
              "label": {
                "type": "string",
                "maxLength": 200
              },
              "labelLayer": {
                "enum": [
                  "front",
                  "behind"
                ],
                "default": "front",
                "description": "Label stacking order. front renders above boxes; behind uses the connector body's stacking order."
              },
              "ariaLabel": {
                "type": "string",
                "maxLength": 300
              },
              "routing": {
                "enum": [
                  "straight",
                  "orthogonal",
                  "polyline"
                ]
              },
              "points": {
                "type": "array",
                "maxItems": 12,
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "x",
                    "y"
                  ],
                  "properties": {
                    "x": {
                      "type": "number",
                      "minimum": -4000,
                      "maximum": 4000,
                      "description": "Coordinate in the canvas coordinate system, relative to the parent group."
                    },
                    "y": {
                      "type": "number",
                      "minimum": -4000,
                      "maximum": 4000,
                      "description": "Coordinate in the canvas coordinate system, relative to the parent group."
                    }
                  }
                },
                "description": "Waypoints allowed only when routing is polyline."
              },
              "arrow": {
                "type": "boolean"
              },
              "lane": {
                "type": "number",
                "minimum": -12,
                "maximum": 12,
                "description": "Separation lane for parallel connectors. Fractional values are truncated."
              },
              "z": {
                "type": "number",
                "minimum": -100,
                "maximum": 100,
                "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
              },
              "style": {
                "type": "object",
                "additionalProperties": false,
                "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
                "properties": {
                  "fill": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "stroke": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "textColor": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "strokeWidth": {
                    "type": "number",
                    "minimum": 0.5,
                    "maximum": 20
                  },
                  "fontSize": {
                    "type": "number",
                    "minimum": 8,
                    "maximum": 160
                  },
                  "opacity": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  },
                  "dash": {
                    "type": "string",
                    "maxLength": 40,
                    "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
                    "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
                  },
                  "cornerRadius": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 200
                  }
                }
              }
            },
            "if": {
              "type": "object",
              "required": [
                "routing"
              ],
              "properties": {
                "routing": {
                  "const": "polyline"
                }
              }
            },
            "else": {
              "type": "object",
              "properties": {
                "points": {
                  "type": "array",
                  "maxItems": 0,
                  "description": "points may be specified only when routing is polyline."
                }
              }
            }
          }
        }
      ]
    },
    "elementFlowL3": {
      "type": "object",
      "required": [
        "type"
      ],
      "properties": {
        "type": {
          "enum": [
            "node",
            "group",
            "image",
            "connector"
          ]
        }
      },
      "allOf": [
        {
          "if": {
            "type": "object",
            "required": [
              "type"
            ],
            "properties": {
              "type": {
                "const": "node"
              }
            }
          },
          "then": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "type",
              "id"
            ],
            "properties": {
              "type": {
                "const": "node"
              },
              "id": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "shape": {
                "enum": [
                  "rect",
                  "rounded-rect",
                  "ellipse",
                  "diamond",
                  "triangle",
                  "hexagon",
                  "parallelogram"
                ]
              },
              "x": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "y": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "width": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "height": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "text": {
                "type": "string",
                "maxLength": 500
              },
              "icon": {
                "anyOf": [
                  {
                    "enum": [
                      "cloud",
                      "database",
                      "api",
                      "user",
                      "server",
                      "analytics",
                      "browser",
                      "mobile",
                      "network",
                      "queue",
                      "shield"
                    ],
                    "description": "Built-in icon name. Icons render as 24x24 line art using the node textColor for the stroke, so their colors automatically adapt to all four themes."
                  },
                  {
                    "type": "string",
                    "maxLength": 200,
                    "pattern": "^assets/(?:[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*/)*[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*\\.(?:[Ss][Vv][Gg]|[Pp][Nn][Gg]|[Ww][Ee][Bb][Pp]|[Jj][Pp][Gg]|[Jj][Pp][Ee][Gg])$",
                    "description": "Image under assets/ used as a node icon. Raster images and SVG files loaded through <image> do not adapt to theme colors, so use artwork that remains legible against every theme background."
                  }
                ],
                "description": "Built-in icon name or path to an icon under assets/."
              },
              "ariaLabel": {
                "type": "string",
                "maxLength": 300
              },
              "z": {
                "type": "number",
                "minimum": -100,
                "maximum": 100,
                "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
              },
              "style": {
                "type": "object",
                "additionalProperties": false,
                "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
                "properties": {
                  "fill": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "stroke": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "textColor": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "strokeWidth": {
                    "type": "number",
                    "minimum": 0.5,
                    "maximum": 20
                  },
                  "fontSize": {
                    "type": "number",
                    "minimum": 8,
                    "maximum": 160
                  },
                  "opacity": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  },
                  "dash": {
                    "type": "string",
                    "maxLength": 40,
                    "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
                    "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
                  },
                  "cornerRadius": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 200
                  }
                }
              }
            },
            "description": "Node placed directly under a group with a layout. Position and size are calculated automatically."
          }
        },
        {
          "if": {
            "type": "object",
            "required": [
              "type"
            ],
            "properties": {
              "type": {
                "const": "group"
              }
            }
          },
          "then": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "type",
              "id"
            ],
            "properties": {
              "type": {
                "const": "group"
              },
              "id": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "x": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "y": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "width": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "height": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "title": {
                "type": "string",
                "maxLength": 200
              },
              "ariaLabel": {
                "type": "string",
                "maxLength": 300
              },
              "layout": {
                "anyOf": [
                  {
                    "enum": [
                      "row",
                      "column",
                      "grid",
                      "layered"
                    ],
                    "description": "String shorthand. Defaults are gap 36 / padding 54 / columns 3 / direction \"down\"."
                  },
                  {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "type"
                    ],
                    "properties": {
                      "type": {
                        "enum": [
                          "row",
                          "column",
                          "grid",
                          "layered"
                        ]
                      },
                      "gap": {
                        "type": "number",
                        "minimum": 0,
                        "maximum": 240
                      },
                      "rowGap": {
                        "type": "number",
                        "minimum": 0,
                        "maximum": 240
                      },
                      "columnGap": {
                        "type": "number",
                        "minimum": 0,
                        "maximum": 240
                      },
                      "padding": {
                        "type": "number",
                        "minimum": 0,
                        "maximum": 400
                      },
                      "columns": {
                        "type": "number",
                        "minimum": 1,
                        "maximum": 12,
                        "description": "Number of grid columns. Fractional values are truncated. Ignored for row / column / layered."
                      },
                      "direction": {
                        "enum": [
                          "down",
                          "right"
                        ],
                        "description": "Direction in which layered ranks extend. down means top to bottom; right means left to right. Not allowed for layouts other than layered."
                      }
                    },
                    "allOf": [
                      {
                        "if": {
                          "not": {
                            "properties": {
                              "type": {
                                "const": "layered"
                              }
                            },
                            "required": [
                              "type"
                            ]
                          }
                        },
                        "then": {
                          "not": {
                            "required": [
                              "direction"
                            ]
                          }
                        }
                      }
                    ]
                  }
                ],
                "description": "Automatic child placement. When specified, child x / y / width / height values are calculated automatically, and explicit x / y values are ignored. layered infers ranks from connectors between children."
              },
              "z": {
                "type": "number",
                "minimum": -100,
                "maximum": 100,
                "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
              },
              "style": {
                "type": "object",
                "additionalProperties": false,
                "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
                "properties": {
                  "fill": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "stroke": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "textColor": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "strokeWidth": {
                    "type": "number",
                    "minimum": 0.5,
                    "maximum": 20
                  },
                  "fontSize": {
                    "type": "number",
                    "minimum": 8,
                    "maximum": 160
                  },
                  "opacity": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  },
                  "dash": {
                    "type": "string",
                    "maxLength": 40,
                    "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
                    "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
                  },
                  "cornerRadius": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 200
                  }
                }
              },
              "children": {
                "type": "array",
                "maxItems": 200
              }
            },
            "allOf": [
              {
                "if": {
                  "type": "object",
                  "required": [
                    "layout"
                  ]
                },
                "then": {
                  "type": "object",
                  "properties": {
                    "children": {
                      "type": "array",
                      "items": {
                        "$ref": "#/$defs/elementFlowL4"
                      }
                    }
                  }
                },
                "else": {
                  "type": "object",
                  "properties": {
                    "children": {
                      "type": "array",
                      "items": {
                        "$ref": "#/$defs/elementFixedL4"
                      }
                    }
                  }
                }
              }
            ]
          }
        },
        {
          "if": {
            "type": "object",
            "required": [
              "type"
            ],
            "properties": {
              "type": {
                "const": "image"
              }
            }
          },
          "then": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "type",
              "id",
              "src"
            ],
            "properties": {
              "type": {
                "const": "image"
              },
              "id": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "src": {
                "type": "string",
                "maxLength": 200,
                "pattern": "^assets/(?:[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*/)*[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*\\.(?:[Ss][Vv][Gg]|[Pp][Nn][Gg]|[Ww][Ee][Bb][Pp]|[Jj][Pp][Gg]|[Jj][Pp][Ee][Gg])$",
                "description": "Image in the repository assets/ directory. Supported extensions are .svg / .png / .webp / .jpg / .jpeg, including uppercase variants. The syntax cannot represent paths containing '..', data: URIs, or external URLs."
              },
              "fit": {
                "enum": [
                  "contain",
                  "cover",
                  "stretch"
                ]
              },
              "x": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "y": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "width": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "height": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "ariaLabel": {
                "type": "string",
                "maxLength": 300,
                "description": "Alternative text for the image. Defaults first to the src file name and then to the id."
              },
              "z": {
                "type": "number",
                "minimum": -100,
                "maximum": 100,
                "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
              },
              "style": {
                "type": "object",
                "additionalProperties": false,
                "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
                "properties": {
                  "fill": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "stroke": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "textColor": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "strokeWidth": {
                    "type": "number",
                    "minimum": 0.5,
                    "maximum": 20
                  },
                  "fontSize": {
                    "type": "number",
                    "minimum": 8,
                    "maximum": 160
                  },
                  "opacity": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  },
                  "dash": {
                    "type": "string",
                    "maxLength": 40,
                    "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
                    "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
                  },
                  "cornerRadius": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 200
                  }
                }
              }
            },
            "description": "Image placed directly under a group with a layout. Position and size are calculated automatically."
          }
        },
        {
          "if": {
            "type": "object",
            "required": [
              "type"
            ],
            "properties": {
              "type": {
                "const": "connector"
              }
            }
          },
          "then": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "type",
              "from",
              "to"
            ],
            "properties": {
              "type": {
                "const": "connector"
              },
              "from": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "to": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "fromPort": {
                "enum": [
                  "auto",
                  "top",
                  "right",
                  "bottom",
                  "left"
                ]
              },
              "toPort": {
                "enum": [
                  "auto",
                  "top",
                  "right",
                  "bottom",
                  "left"
                ]
              },
              "label": {
                "type": "string",
                "maxLength": 200
              },
              "labelLayer": {
                "enum": [
                  "front",
                  "behind"
                ],
                "default": "front",
                "description": "Label stacking order. front renders above boxes; behind uses the connector body's stacking order."
              },
              "ariaLabel": {
                "type": "string",
                "maxLength": 300
              },
              "routing": {
                "enum": [
                  "straight",
                  "orthogonal",
                  "polyline"
                ]
              },
              "points": {
                "type": "array",
                "maxItems": 12,
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "x",
                    "y"
                  ],
                  "properties": {
                    "x": {
                      "type": "number",
                      "minimum": -4000,
                      "maximum": 4000,
                      "description": "Coordinate in the canvas coordinate system, relative to the parent group."
                    },
                    "y": {
                      "type": "number",
                      "minimum": -4000,
                      "maximum": 4000,
                      "description": "Coordinate in the canvas coordinate system, relative to the parent group."
                    }
                  }
                },
                "description": "Waypoints allowed only when routing is polyline."
              },
              "arrow": {
                "type": "boolean"
              },
              "lane": {
                "type": "number",
                "minimum": -12,
                "maximum": 12,
                "description": "Separation lane for parallel connectors. Fractional values are truncated."
              },
              "z": {
                "type": "number",
                "minimum": -100,
                "maximum": 100,
                "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
              },
              "style": {
                "type": "object",
                "additionalProperties": false,
                "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
                "properties": {
                  "fill": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "stroke": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "textColor": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "strokeWidth": {
                    "type": "number",
                    "minimum": 0.5,
                    "maximum": 20
                  },
                  "fontSize": {
                    "type": "number",
                    "minimum": 8,
                    "maximum": 160
                  },
                  "opacity": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  },
                  "dash": {
                    "type": "string",
                    "maxLength": 40,
                    "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
                    "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
                  },
                  "cornerRadius": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 200
                  }
                }
              }
            },
            "if": {
              "type": "object",
              "required": [
                "routing"
              ],
              "properties": {
                "routing": {
                  "const": "polyline"
                }
              }
            },
            "else": {
              "type": "object",
              "properties": {
                "points": {
                  "type": "array",
                  "maxItems": 0,
                  "description": "points may be specified only when routing is polyline."
                }
              }
            }
          }
        }
      ]
    },
    "elementFixedL4": {
      "type": "object",
      "required": [
        "type"
      ],
      "properties": {
        "type": {
          "enum": [
            "node",
            "image",
            "connector"
          ],
          "description": "Groups cannot be placed at this depth because nesting is limited to four levels."
        }
      },
      "allOf": [
        {
          "if": {
            "type": "object",
            "required": [
              "type"
            ],
            "properties": {
              "type": {
                "const": "node"
              }
            }
          },
          "then": {
            "description": "x / y / width / height are required directly under a parent without a layout.",
            "type": "object",
            "additionalProperties": false,
            "required": [
              "type",
              "id",
              "x",
              "y",
              "width",
              "height"
            ],
            "properties": {
              "type": {
                "const": "node"
              },
              "id": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "shape": {
                "enum": [
                  "rect",
                  "rounded-rect",
                  "ellipse",
                  "diamond",
                  "triangle",
                  "hexagon",
                  "parallelogram"
                ]
              },
              "x": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "y": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "width": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "height": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "text": {
                "type": "string",
                "maxLength": 500
              },
              "icon": {
                "anyOf": [
                  {
                    "enum": [
                      "cloud",
                      "database",
                      "api",
                      "user",
                      "server",
                      "analytics",
                      "browser",
                      "mobile",
                      "network",
                      "queue",
                      "shield"
                    ],
                    "description": "Built-in icon name. Icons render as 24x24 line art using the node textColor for the stroke, so their colors automatically adapt to all four themes."
                  },
                  {
                    "type": "string",
                    "maxLength": 200,
                    "pattern": "^assets/(?:[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*/)*[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*\\.(?:[Ss][Vv][Gg]|[Pp][Nn][Gg]|[Ww][Ee][Bb][Pp]|[Jj][Pp][Gg]|[Jj][Pp][Ee][Gg])$",
                    "description": "Image under assets/ used as a node icon. Raster images and SVG files loaded through <image> do not adapt to theme colors, so use artwork that remains legible against every theme background."
                  }
                ],
                "description": "Built-in icon name or path to an icon under assets/."
              },
              "ariaLabel": {
                "type": "string",
                "maxLength": 300
              },
              "z": {
                "type": "number",
                "minimum": -100,
                "maximum": 100,
                "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
              },
              "style": {
                "type": "object",
                "additionalProperties": false,
                "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
                "properties": {
                  "fill": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "stroke": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "textColor": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "strokeWidth": {
                    "type": "number",
                    "minimum": 0.5,
                    "maximum": 20
                  },
                  "fontSize": {
                    "type": "number",
                    "minimum": 8,
                    "maximum": 160
                  },
                  "opacity": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  },
                  "dash": {
                    "type": "string",
                    "maxLength": 40,
                    "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
                    "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
                  },
                  "cornerRadius": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 200
                  }
                }
              }
            }
          }
        },
        {
          "if": {
            "type": "object",
            "required": [
              "type"
            ],
            "properties": {
              "type": {
                "const": "image"
              }
            }
          },
          "then": {
            "description": "x / y / width / height are required directly under a parent without a layout.",
            "type": "object",
            "additionalProperties": false,
            "required": [
              "type",
              "id",
              "src",
              "x",
              "y",
              "width",
              "height"
            ],
            "properties": {
              "type": {
                "const": "image"
              },
              "id": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "src": {
                "type": "string",
                "maxLength": 200,
                "pattern": "^assets/(?:[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*/)*[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*\\.(?:[Ss][Vv][Gg]|[Pp][Nn][Gg]|[Ww][Ee][Bb][Pp]|[Jj][Pp][Gg]|[Jj][Pp][Ee][Gg])$",
                "description": "Image in the repository assets/ directory. Supported extensions are .svg / .png / .webp / .jpg / .jpeg, including uppercase variants. The syntax cannot represent paths containing '..', data: URIs, or external URLs."
              },
              "fit": {
                "enum": [
                  "contain",
                  "cover",
                  "stretch"
                ]
              },
              "x": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "y": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "width": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "height": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "ariaLabel": {
                "type": "string",
                "maxLength": 300,
                "description": "Alternative text for the image. Defaults first to the src file name and then to the id."
              },
              "z": {
                "type": "number",
                "minimum": -100,
                "maximum": 100,
                "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
              },
              "style": {
                "type": "object",
                "additionalProperties": false,
                "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
                "properties": {
                  "fill": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "stroke": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "textColor": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "strokeWidth": {
                    "type": "number",
                    "minimum": 0.5,
                    "maximum": 20
                  },
                  "fontSize": {
                    "type": "number",
                    "minimum": 8,
                    "maximum": 160
                  },
                  "opacity": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  },
                  "dash": {
                    "type": "string",
                    "maxLength": 40,
                    "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
                    "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
                  },
                  "cornerRadius": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 200
                  }
                }
              }
            }
          }
        },
        {
          "if": {
            "type": "object",
            "required": [
              "type"
            ],
            "properties": {
              "type": {
                "const": "connector"
              }
            }
          },
          "then": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "type",
              "from",
              "to"
            ],
            "properties": {
              "type": {
                "const": "connector"
              },
              "from": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "to": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "fromPort": {
                "enum": [
                  "auto",
                  "top",
                  "right",
                  "bottom",
                  "left"
                ]
              },
              "toPort": {
                "enum": [
                  "auto",
                  "top",
                  "right",
                  "bottom",
                  "left"
                ]
              },
              "label": {
                "type": "string",
                "maxLength": 200
              },
              "labelLayer": {
                "enum": [
                  "front",
                  "behind"
                ],
                "default": "front",
                "description": "Label stacking order. front renders above boxes; behind uses the connector body's stacking order."
              },
              "ariaLabel": {
                "type": "string",
                "maxLength": 300
              },
              "routing": {
                "enum": [
                  "straight",
                  "orthogonal",
                  "polyline"
                ]
              },
              "points": {
                "type": "array",
                "maxItems": 12,
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "x",
                    "y"
                  ],
                  "properties": {
                    "x": {
                      "type": "number",
                      "minimum": -4000,
                      "maximum": 4000,
                      "description": "Coordinate in the canvas coordinate system, relative to the parent group."
                    },
                    "y": {
                      "type": "number",
                      "minimum": -4000,
                      "maximum": 4000,
                      "description": "Coordinate in the canvas coordinate system, relative to the parent group."
                    }
                  }
                },
                "description": "Waypoints allowed only when routing is polyline."
              },
              "arrow": {
                "type": "boolean"
              },
              "lane": {
                "type": "number",
                "minimum": -12,
                "maximum": 12,
                "description": "Separation lane for parallel connectors. Fractional values are truncated."
              },
              "z": {
                "type": "number",
                "minimum": -100,
                "maximum": 100,
                "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
              },
              "style": {
                "type": "object",
                "additionalProperties": false,
                "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
                "properties": {
                  "fill": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "stroke": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "textColor": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "strokeWidth": {
                    "type": "number",
                    "minimum": 0.5,
                    "maximum": 20
                  },
                  "fontSize": {
                    "type": "number",
                    "minimum": 8,
                    "maximum": 160
                  },
                  "opacity": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  },
                  "dash": {
                    "type": "string",
                    "maxLength": 40,
                    "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
                    "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
                  },
                  "cornerRadius": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 200
                  }
                }
              }
            },
            "if": {
              "type": "object",
              "required": [
                "routing"
              ],
              "properties": {
                "routing": {
                  "const": "polyline"
                }
              }
            },
            "else": {
              "type": "object",
              "properties": {
                "points": {
                  "type": "array",
                  "maxItems": 0,
                  "description": "points may be specified only when routing is polyline."
                }
              }
            }
          }
        }
      ]
    },
    "elementFlowL4": {
      "type": "object",
      "required": [
        "type"
      ],
      "properties": {
        "type": {
          "enum": [
            "node",
            "image",
            "connector"
          ],
          "description": "Groups cannot be placed at this depth because nesting is limited to four levels."
        }
      },
      "allOf": [
        {
          "if": {
            "type": "object",
            "required": [
              "type"
            ],
            "properties": {
              "type": {
                "const": "node"
              }
            }
          },
          "then": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "type",
              "id"
            ],
            "properties": {
              "type": {
                "const": "node"
              },
              "id": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "shape": {
                "enum": [
                  "rect",
                  "rounded-rect",
                  "ellipse",
                  "diamond",
                  "triangle",
                  "hexagon",
                  "parallelogram"
                ]
              },
              "x": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "y": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "width": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "height": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "text": {
                "type": "string",
                "maxLength": 500
              },
              "icon": {
                "anyOf": [
                  {
                    "enum": [
                      "cloud",
                      "database",
                      "api",
                      "user",
                      "server",
                      "analytics",
                      "browser",
                      "mobile",
                      "network",
                      "queue",
                      "shield"
                    ],
                    "description": "Built-in icon name. Icons render as 24x24 line art using the node textColor for the stroke, so their colors automatically adapt to all four themes."
                  },
                  {
                    "type": "string",
                    "maxLength": 200,
                    "pattern": "^assets/(?:[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*/)*[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*\\.(?:[Ss][Vv][Gg]|[Pp][Nn][Gg]|[Ww][Ee][Bb][Pp]|[Jj][Pp][Gg]|[Jj][Pp][Ee][Gg])$",
                    "description": "Image under assets/ used as a node icon. Raster images and SVG files loaded through <image> do not adapt to theme colors, so use artwork that remains legible against every theme background."
                  }
                ],
                "description": "Built-in icon name or path to an icon under assets/."
              },
              "ariaLabel": {
                "type": "string",
                "maxLength": 300
              },
              "z": {
                "type": "number",
                "minimum": -100,
                "maximum": 100,
                "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
              },
              "style": {
                "type": "object",
                "additionalProperties": false,
                "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
                "properties": {
                  "fill": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "stroke": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "textColor": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "strokeWidth": {
                    "type": "number",
                    "minimum": 0.5,
                    "maximum": 20
                  },
                  "fontSize": {
                    "type": "number",
                    "minimum": 8,
                    "maximum": 160
                  },
                  "opacity": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  },
                  "dash": {
                    "type": "string",
                    "maxLength": 40,
                    "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
                    "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
                  },
                  "cornerRadius": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 200
                  }
                }
              }
            },
            "description": "Node placed directly under a group with a layout. Position and size are calculated automatically."
          }
        },
        {
          "if": {
            "type": "object",
            "required": [
              "type"
            ],
            "properties": {
              "type": {
                "const": "image"
              }
            }
          },
          "then": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "type",
              "id",
              "src"
            ],
            "properties": {
              "type": {
                "const": "image"
              },
              "id": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "src": {
                "type": "string",
                "maxLength": 200,
                "pattern": "^assets/(?:[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*/)*[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*\\.(?:[Ss][Vv][Gg]|[Pp][Nn][Gg]|[Ww][Ee][Bb][Pp]|[Jj][Pp][Gg]|[Jj][Pp][Ee][Gg])$",
                "description": "Image in the repository assets/ directory. Supported extensions are .svg / .png / .webp / .jpg / .jpeg, including uppercase variants. The syntax cannot represent paths containing '..', data: URIs, or external URLs."
              },
              "fit": {
                "enum": [
                  "contain",
                  "cover",
                  "stretch"
                ]
              },
              "x": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "y": {
                "type": "number",
                "minimum": -4000,
                "maximum": 4000,
                "description": "Coordinate in the canvas coordinate system, relative to the parent group."
              },
              "width": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "height": {
                "type": "number",
                "minimum": 1,
                "maximum": 4000,
                "description": "Width or height. When the parent group has a layout, the effective maximum depends on cell size and is validated by parseArchitecture."
              },
              "ariaLabel": {
                "type": "string",
                "maxLength": 300,
                "description": "Alternative text for the image. Defaults first to the src file name and then to the id."
              },
              "z": {
                "type": "number",
                "minimum": -100,
                "maximum": 100,
                "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
              },
              "style": {
                "type": "object",
                "additionalProperties": false,
                "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
                "properties": {
                  "fill": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "stroke": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "textColor": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "strokeWidth": {
                    "type": "number",
                    "minimum": 0.5,
                    "maximum": 20
                  },
                  "fontSize": {
                    "type": "number",
                    "minimum": 8,
                    "maximum": 160
                  },
                  "opacity": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  },
                  "dash": {
                    "type": "string",
                    "maxLength": 40,
                    "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
                    "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
                  },
                  "cornerRadius": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 200
                  }
                }
              }
            },
            "description": "Image placed directly under a group with a layout. Position and size are calculated automatically."
          }
        },
        {
          "if": {
            "type": "object",
            "required": [
              "type"
            ],
            "properties": {
              "type": {
                "const": "connector"
              }
            }
          },
          "then": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "type",
              "from",
              "to"
            ],
            "properties": {
              "type": {
                "const": "connector"
              },
              "from": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "to": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_.-]{0,63}$",
                "description": "Identifier of 1–64 characters that starts with an ASCII letter and contains only ASCII letters, digits, '.', '_', and '-'."
              },
              "fromPort": {
                "enum": [
                  "auto",
                  "top",
                  "right",
                  "bottom",
                  "left"
                ]
              },
              "toPort": {
                "enum": [
                  "auto",
                  "top",
                  "right",
                  "bottom",
                  "left"
                ]
              },
              "label": {
                "type": "string",
                "maxLength": 200
              },
              "labelLayer": {
                "enum": [
                  "front",
                  "behind"
                ],
                "default": "front",
                "description": "Label stacking order. front renders above boxes; behind uses the connector body's stacking order."
              },
              "ariaLabel": {
                "type": "string",
                "maxLength": 300
              },
              "routing": {
                "enum": [
                  "straight",
                  "orthogonal",
                  "polyline"
                ]
              },
              "points": {
                "type": "array",
                "maxItems": 12,
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "x",
                    "y"
                  ],
                  "properties": {
                    "x": {
                      "type": "number",
                      "minimum": -4000,
                      "maximum": 4000,
                      "description": "Coordinate in the canvas coordinate system, relative to the parent group."
                    },
                    "y": {
                      "type": "number",
                      "minimum": -4000,
                      "maximum": 4000,
                      "description": "Coordinate in the canvas coordinate system, relative to the parent group."
                    }
                  }
                },
                "description": "Waypoints allowed only when routing is polyline."
              },
              "arrow": {
                "type": "boolean"
              },
              "lane": {
                "type": "number",
                "minimum": -12,
                "maximum": 12,
                "description": "Separation lane for parallel connectors. Fractional values are truncated."
              },
              "z": {
                "type": "number",
                "minimum": -100,
                "maximum": 100,
                "description": "Stacking order. Defaults are -50 for groups, -10 for connectors, and 0 for nodes."
              },
              "style": {
                "type": "object",
                "additionalProperties": false,
                "description": "Appearance overrides. Omitted properties use the defaults for the element type.",
                "properties": {
                  "fill": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "stroke": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "textColor": {
                    "anyOf": [
                      {
                        "enum": [
                          "accent",
                          "accentStrong",
                          "accentSoft",
                          "accentLine",
                          "surface",
                          "fg",
                          "muted",
                          "body",
                          "border",
                          "bg"
                        ],
                        "description": "Theme-aware color token. Preferred over literal colors so the diagram remains legible when the theme changes."
                      },
                      {
                        "type": "string",
                        "pattern": "^(?:#[0-9a-fA-F]{3,8}|[Bb][Ll][Aa][Cc][Kk]|[Ww][Hh][Ii][Tt][Ee]|[Tt][Rr][Aa][Nn][Ss][Pp][Aa][Rr][Ee][Nn][Tt]|[Nn][Oo][Nn][Ee])$",
                        "description": "Literal color. Only hexadecimal notation (#rgb through #rrggbbaa) and black / white / transparent / none are supported. rgb() and other named colors such as red are not supported."
                      }
                    ],
                    "description": "Theme token name or a restricted literal color. Arbitrary CSS colors are not accepted."
                  },
                  "strokeWidth": {
                    "type": "number",
                    "minimum": 0.5,
                    "maximum": 20
                  },
                  "fontSize": {
                    "type": "number",
                    "minimum": 8,
                    "maximum": 160
                  },
                  "opacity": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  },
                  "dash": {
                    "type": "string",
                    "maxLength": 40,
                    "pattern": "^$|^\\d+(?:\\.\\d+)?(?:[ ,]+\\d+(?:\\.\\d+)?)*$",
                    "description": "Dash pattern containing only whitespace- or comma-separated non-negative numbers (for example, \"12 8\"). An empty string means no dashes."
                  },
                  "cornerRadius": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 200
                  }
                }
              }
            },
            "if": {
              "type": "object",
              "required": [
                "routing"
              ],
              "properties": {
                "routing": {
                  "const": "polyline"
                }
              }
            },
            "else": {
              "type": "object",
              "properties": {
                "points": {
                  "type": "array",
                  "maxItems": 0,
                  "description": "points may be specified only when routing is polyline."
                }
              }
            }
          }
        }
      ]
    }
  }
};
