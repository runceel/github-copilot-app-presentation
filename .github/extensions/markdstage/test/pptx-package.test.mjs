import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPptxPackage,
  inspectPptxPackage,
  PPTX_DIMENSIONS,
} from "../runtime/pptx-package.mjs";

const PNG = Buffer.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0xff, 0xd9]);

function readStoredZip(buffer) {
  const eocd = buffer.length - 22;
  assert.equal(buffer.readUInt32LE(eocd), 0x06054b50);
  assert.equal(buffer.readUInt16LE(eocd + 8), buffer.readUInt16LE(eocd + 10));
  const count = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  assert.equal(centralOffset + centralSize, eocd);
  const files = new Map();
  let cursor = centralOffset;
  for (let index = 0; index < count; index += 1) {
    assert.equal(buffer.readUInt32LE(cursor), 0x02014b50);
    assert.equal(buffer.readUInt16LE(cursor + 10), 0);
    const size = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer
      .subarray(cursor + 46, cursor + 46 + nameLength)
      .toString("utf8");
    assert.equal(buffer.readUInt32LE(localOffset), 0x04034b50);
    assert.equal(buffer.readUInt16LE(localOffset + 8), 0);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    files.set(name, buffer.subarray(dataOffset, dataOffset + size));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  assert.equal(cursor, eocd);
  return files;
}

function xml(files, name) {
  const value = files.get(name);
  assert.ok(value, `missing ${name}`);
  return value.toString("utf8");
}

function samplePackage() {
  return buildPptxPackage({
    title: 'Roadmap & "Next"',
    assets: [
      { id: "background", contentType: "image/png", data: PNG },
      { id: "photo", contentType: "image/jpeg", data: JPEG },
    ],
    slides: [
      {
        backgroundAssetId: "background",
        notes: 'Discuss <results> & "日本語".\n\n  - Open the report.',
        elements: [
          {
            type: "text",
            x: 40,
            y: 30,
            width: 600,
            height: 90,
            textInsets: { left: 5, top: 3, right: 7, bottom: 4 },
            textWrap: "none",
            paragraphs: [
              {
                alignment: "center",
                bullet: "•",
                level: 1,
                runs: [
                  {
                    text: "Editable & linked",
                    fontFace: "Aptos",
                    fontSize: "32px",
                    bold: true,
                    italic: true,
                    underline: true,
                    color: "rgb(12, 34, 56)",
                    href: "https://example.com/?a=1&b=2",
                  },
                ],
              },
            ],
          },
          {
            type: "table",
            x: 40,
            y: 150,
            width: 500,
            height: 160,
            rows: [
              {
                cells: [
                  { text: "A", fill: "#ffeecc", stroke: "#112233" },
                  { text: "B", fill: null, stroke: "#112233" },
                ],
              },
              {
                cells: [
                  { text: "C", fill: "#ffffff", stroke: "#112233" },
                  { text: "D", fill: "#ffffff", stroke: "#112233" },
                ],
              },
            ],
          },
          {
            type: "image",
            assetId: "photo",
            x: 600,
            y: 150,
            width: 240,
            height: 160,
            shape: "roundedRect",
          },
          {
            type: "shape",
            shape: "roundedRect",
            x: 40,
            y: 360,
            width: 260,
            height: 90,
            fill: "rgba(0, 128, 255, 0.5)",
            stroke: "#002244",
            strokeWidth: 2,
            opacity: 0.8,
            text: "Editable shape",
          },
          {
            type: "connector",
            points: [
              { x: 320, y: 405 },
              { x: 440, y: 405 },
              { x: 500, y: 480 },
            ],
            stroke: "#cc0000",
            strokeWidth: 3,
            dash: "dash",
            arrowEnd: "triangle",
            label: "Flow",
            labelBounds: { x: 360, y: 370, width: 100, height: 30 },
          },
        ],
      },
      { elements: [] },
    ],
  });
}

test("writes a valid stored ZIP with the required editable PowerPoint parts", () => {
  const buffer = samplePackage();
  const files = readStoredZip(buffer);
  const summary = inspectPptxPackage(buffer);
  assert.deepEqual(
    {
      valid: summary.valid,
      slideCount: summary.slideCount,
      notesCount: summary.notesCount,
      mediaCount: summary.mediaCount,
      dimensions: summary.dimensions,
      title: summary.title,
    },
    {
      valid: true,
      slideCount: 2,
      notesCount: 1,
      mediaCount: 2,
      dimensions: { widthEmu: 12192000, heightEmu: 6858000 },
      title: 'Roadmap & "Next"',
    },
  );
  assert.deepEqual(PPTX_DIMENSIONS, {
    widthPx: 1280,
    heightPx: 720,
    emusPerPx: 9525,
    widthEmu: 12192000,
    heightEmu: 6858000,
  });
  for (const name of [
    "[Content_Types].xml",
    "_rels/.rels",
    "docProps/core.xml",
    "docProps/app.xml",
    "ppt/presentation.xml",
    "ppt/_rels/presentation.xml.rels",
    "ppt/theme/theme1.xml",
    "ppt/slideMasters/slideMaster1.xml",
    "ppt/slideMasters/_rels/slideMaster1.xml.rels",
    "ppt/slideLayouts/slideLayout1.xml",
    "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
    "ppt/theme/theme2.xml",
    "ppt/notesMasters/notesMaster1.xml",
    "ppt/notesMasters/_rels/notesMaster1.xml.rels",
    "ppt/notesSlides/notesSlide1.xml",
    "ppt/notesSlides/_rels/notesSlide1.xml.rels",
    "ppt/slides/slide1.xml",
    "ppt/slides/_rels/slide1.xml.rels",
    "ppt/slides/slide2.xml",
    "ppt/slides/_rels/slide2.xml.rels",
  ]) {
    assert.ok(files.has(name), `missing ${name}`);
  }
  assert.match(
    xml(files, "ppt/presentation.xml"),
    /<p:sldSz cx="12192000" cy="6858000"/,
  );
  assert.match(
    xml(files, "ppt/slideMasters/slideMaster1.xml"),
    /<p:sldLayoutId id="2147500001" r:id="rId1"\/>/,
  );
});

test("writes theme-specific masters and five named layouts with shared artwork", () => {
  const names = ["title", "default", "center", "section", "backcover"];
  const themes = ["dark", "light"];
  const layouts = themes.flatMap((theme) =>
    names.map((name) => ({
      id: `${theme}:${name}`,
      name,
      theme,
      artworkAssetId: `${theme}-${name}`,
      elements:
        name === "title"
          ? [
              {
                type: "image",
                assetId: `${theme}-logo`,
                name: "Cover logo",
                x: 84,
                y: 40,
                width: 205,
                height: 64,
              },
            ]
          : [],
    })),
  );
  const buffer = buildPptxPackage({
    masters: themes.map((theme) => ({
      id: theme,
      theme,
      layoutIds: names.map((name) => `${theme}:${name}`),
    })),
    layouts,
    assets: [
      ...layouts.map((layout) => ({
        id: layout.artworkAssetId,
        contentType: "image/png",
        data: PNG,
      })),
      ...themes.map((theme) => ({
        id: `${theme}-logo`,
        contentType: "image/png",
        data: PNG,
      })),
      { id: "slide-1", contentType: "image/png", data: PNG },
      { id: "slide-2", contentType: "image/png", data: PNG },
    ],
    slides: [
      {
        layoutId: "dark:title",
        notes: "Layout notes",
        elements: [
          {
            type: "image",
            assetId: "slide-1",
            name: "Mermaid artwork",
            x: 320,
            y: 180,
            width: 640,
            height: 280,
          },
        ],
      },
      {
        layoutId: "light:center",
        elements: [
          {
            type: "image",
            assetId: "slide-2",
            name: "Footer artwork",
            x: 84,
            y: 640,
            width: 1112,
            height: 40,
          },
        ],
      },
    ],
  });
  const files = readStoredZip(buffer);
  const summary = inspectPptxPackage(buffer);

  assert.equal(summary.masterCount, 2);
  assert.equal(summary.layoutCount, 10);
  assert.equal(summary.notesCount, 1);
  assert.deepEqual(summary.slideLayoutTargets, [
    "slideLayout1.xml",
    "slideLayout8.xml",
  ]);
  assert.match(
    xml(files, "ppt/presentation.xml"),
    /<p:sldMasterId id="2147483648" r:id="rId1"\/><p:sldMasterId id="2147483649" r:id="rId2"\/>/,
  );
  assert.equal(
    (xml(files, "ppt/slideMasters/slideMaster1.xml").match(/<p:sldLayoutId /g) || [])
      .length,
    5,
  );
  assert.match(
    xml(files, "ppt/slideLayouts/slideLayout1.xml"),
    /matchingName="title"><p:cSld name="title">[\s\S]*name="Layout artwork"[\s\S]*name="Cover logo"[\s\S]*<p:nvPr userDrawn="1"\/>/,
  );
  assert.match(
    xml(files, "ppt/slideLayouts/slideLayout2.xml"),
    /matchingName="default"><p:cSld name="default">/,
  );
  assert.match(
    xml(files, "ppt/slideLayouts/_rels/slideLayout1.xml.rels"),
    /Type="[^"]*\/slideMaster" Target="\.\.\/slideMasters\/slideMaster1\.xml"[\s\S]*Type="[^"]*\/image"[\s\S]*Type="[^"]*\/image"/,
  );
  assert.match(
    xml(files, "ppt/slides/_rels/slide1.xml.rels"),
    /Type="[^"]*\/slideLayout" Target="\.\.\/slideLayouts\/slideLayout1\.xml"/,
  );
  assert.match(
    xml(files, "ppt/slides/slide1.xml"),
    /name="Mermaid artwork"[\s\S]*<a:off x="3048000" y="1714500"\/><a:ext cx="6096000" cy="2667000"\/>/,
  );
  assert.doesNotMatch(xml(files, "ppt/slides/slide1.xml"), /name="Slide artwork"/);
  assert.doesNotMatch(xml(files, "ppt/slides/slide1.xml"), /name="Layout artwork"/);
  assert.ok(files.has("ppt/theme/theme3.xml"));
  assert.match(
    xml(files, "ppt/notesMasters/_rels/notesMaster1.xml.rels"),
    /Target="\.\.\/theme\/theme3\.xml"/,
  );
});

test("writes speaker notes with the required PowerPoint relationships", () => {
  const files = readStoredZip(samplePackage());
  const contentTypes = xml(files, "[Content_Types].xml");
  const presentation = xml(files, "ppt/presentation.xml");
  const presentationRels = xml(files, "ppt/_rels/presentation.xml.rels");
  const slide1Rels = xml(files, "ppt/slides/_rels/slide1.xml.rels");
  const slide2Rels = xml(files, "ppt/slides/_rels/slide2.xml.rels");
  const notes = xml(files, "ppt/notesSlides/notesSlide1.xml");
  const notesRels = xml(files, "ppt/notesSlides/_rels/notesSlide1.xml.rels");
  const notesMasterRels = xml(files, "ppt/notesMasters/_rels/notesMaster1.xml.rels");
  const app = xml(files, "docProps/app.xml");

  assert.match(contentTypes, /presentationml\.notesMaster\+xml/);
  assert.match(contentTypes, /presentationml\.notesSlide\+xml/);
  assert.match(contentTypes, /PartName="\/ppt\/theme\/theme2\.xml"/);
  assert.match(presentation, /<p:notesMasterIdLst>/);
  assert.match(presentationRels, /Type="[^"]*\/notesMaster"/);
  assert.match(slide1Rels, /Type="[^"]*\/notesSlide"/);
  assert.doesNotMatch(slide2Rels, /Type="[^"]*\/notesSlide"/);
  assert.match(notesRels, /Type="[^"]*\/notesMaster"/);
  assert.match(notesRels, /Target="\.\.\/slides\/slide1\.xml"/);
  assert.match(notesMasterRels, /Target="\.\.\/theme\/theme2\.xml"/);
  assert.match(notes, /<p:ph type="body" idx="2"\/>/);
  assert.match(notes, /Discuss &lt;results&gt; &amp; &quot;日本語&quot;\./);
  assert.match(notes, /<a:t xml:space="preserve">  - Open the report\.<\/a:t>/);
  assert.match(app, /<Notes>1<\/Notes>/);
});

test("omits PowerPoint notes parts when every slide has empty notes", () => {
  const buffer = buildPptxPackage({
    slides: [{ elements: [] }, { notes: " \r\n ", elements: [] }],
  });
  const files = readStoredZip(buffer);
  const summary = inspectPptxPackage(buffer);

  assert.equal(summary.notesCount, 0);
  assert.equal(
    [...files.keys()].some(
      (name) => name.startsWith("ppt/notesSlides/") || name.startsWith("ppt/notesMasters/"),
    ),
    false,
  );
  assert.equal(files.has("ppt/theme/theme2.xml"), false);
  assert.doesNotMatch(xml(files, "ppt/presentation.xml"), /notesMasterIdLst/);
  assert.doesNotMatch(xml(files, "ppt/_rels/presentation.xml.rels"), /notesMaster/);
  assert.match(xml(files, "docProps/app.xml"), /<Notes>0<\/Notes>/);
});

test("replaces XML-prohibited characters in speaker notes", () => {
  const files = readStoredZip(
    buildPptxPackage({
      slides: [{ notes: "Before\u0000after", elements: [] }],
    }),
  );

  assert.match(xml(files, "ppt/notesSlides/notesSlide1.xml"), /Before�after/);
});

test("emits native text, hyperlinks, tables, images, shapes, and connector segments", () => {
  const files = readStoredZip(samplePackage());
  const slide = xml(files, "ppt/slides/slide1.xml");
  const rels = xml(files, "ppt/slides/_rels/slide1.xml.rels");
  assert.match(slide, /<a:t>Editable &amp; linked<\/a:t>/);
  assert.match(slide, /<a:rPr[^>]*sz="2400"[^>]*b="1"[^>]*i="1"[^>]*u="sng"/);
  assert.match(
    slide,
    /<a:off x="76200" y="285750"\/><a:ext cx="6019800" cy="857250"\/>[\s\S]*?<a:pPr algn="ctr" lvl="1" marL="304800" indent="-304800"><a:buChar char="•"\/>/,
  );
  assert.match(
    slide,
    /<a:bodyPr wrap="none" lIns="47625" tIns="28575" rIns="66675" bIns="38100"\/>/,
  );
  assert.match(slide, /<a:hlinkClick r:id="rId\d+"\/>/);
  assert.match(rels, /Target="https:\/\/example\.com\/\?a=1&amp;b=2" TargetMode="External"/);
  assert.match(slide, /<a:tbl>/);
  assert.match(slide, /<a:t>A<\/a:t>/);
  assert.match(slide, /<p:pic>[\s\S]*?<a:prstGeom prst="roundRect">/);
  assert.match(slide, /<a:prstGeom prst="roundRect">/);
  assert.match(slide, /<a:t>Editable shape<\/a:t>/);
  assert.equal((slide.match(/name="Connector \d+"/g) || []).length, 2);
  assert.equal((slide.match(/<a:tailEnd type="triangle"\/>/g) || []).length, 1);
  assert.match(slide, /<a:prstDash val="dash"\/>/);
  assert.match(slide, /<a:t>Flow<\/a:t>/);
});

test("uses Yu Gothic for Japanese theme fonts and native text", () => {
  const files = readStoredZip(
    buildPptxPackage({
      slides: [
        {
          elements: [
            {
              type: "text",
              x: 40,
              y: 40,
              width: 600,
              height: 80,
              paragraphs: [
                {
                  runs: [
                    {
                      text: "日本語の編集可能テキスト",
                      fontFace: "Segoe UI",
                      fontSize: "28px",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }),
  );
  const theme = xml(files, "ppt/theme/theme1.xml");
  const slide = xml(files, "ppt/slides/slide1.xml");

  assert.match(
    theme,
    /<a:majorFont><a:latin typeface="Aptos Display"\/><a:ea typeface="Yu Gothic"\/><a:cs typeface=""\/><a:font script="Jpan" typeface="Yu Gothic"\/><\/a:majorFont>/,
  );
  assert.match(
    theme,
    /<a:minorFont><a:latin typeface="Aptos"\/><a:ea typeface="Yu Gothic"\/><a:cs typeface=""\/><a:font script="Jpan" typeface="Yu Gothic"\/><\/a:minorFont>/,
  );
  assert.match(
    slide,
    /<a:latin typeface="Segoe UI"\/><a:ea typeface="Yu Gothic"\/>[\s\S]*?<a:t>日本語の編集可能テキスト<\/a:t>/,
  );
  assert.match(slide, /<a:rPr[^>]*lang="en-US"[^>]*noProof="1"/);
  assert.match(
    slide,
    /<a:endParaRPr lang="en-US" noProof="1"><a:ea typeface="Yu Gothic"\/><\/a:endParaRPr>/,
  );
});

test("keeps rich text and visible styling together in a configured AutoShape", () => {
  const files = readStoredZip(
    buildPptxPackage({
      slides: [
        {
          elements: [
            {
              type: "shape",
              shape: "roundedRect",
              x: 10,
              y: 20,
              width: 300,
              height: 120,
              fill: "rgba(51, 102, 153, 0.8)",
              stroke: "#cc3300",
              strokeWidth: 2,
              opacity: 0.5,
              text: {
                paragraphs: [
                  {
                    alignment: "center",
                    bullet: "•",
                    level: 1,
                    runs: [
                      {
                        text: "Linked node",
                        bold: true,
                        color: "#ffffff",
                        opacity: 0.5,
                        href: "https://example.com/node",
                      },
                    ],
                  },
                ],
              },
              verticalAlignment: "middle",
              textInsets: { left: 1, top: 2, right: 3.5, bottom: 4 },
            },
            {
              type: "shape",
              shape: "rect",
              x: 320,
              y: 20,
              width: 100,
              height: 40,
              fill: "#ffffff",
              stroke: "#000000",
              paragraphs: [{ runs: [{ text: "Top-level paragraphs" }] }],
              textWrap: "none",
            },
          ],
        },
      ],
    }),
  );
  const slide = xml(files, "ppt/slides/slide1.xml");
  const shape = /<p:sp><p:nvSpPr><p:cNvPr id="2" name="Shape 2"\/>[\s\S]*?<\/p:sp>/.exec(
    slide,
  )?.[0];
  assert.ok(shape);
  assert.match(shape, /<a:prstGeom prst="roundRect">/);
  assert.match(
    shape,
    /<a:solidFill><a:srgbClr val="336699"><a:alpha val="40000"\/><\/a:srgbClr><\/a:solidFill>/,
  );
  assert.match(
    shape,
    /<a:ln w="19050"><a:solidFill><a:srgbClr val="CC3300"><a:alpha val="50000"\/><\/a:srgbClr><\/a:solidFill><\/a:ln>/,
  );
  assert.match(
    shape,
    /<a:bodyPr wrap="square" lIns="9525" tIns="19050" rIns="33338" bIns="38100" anchor="ctr"\/>/,
  );
  assert.match(
    shape,
    /<a:pPr algn="ctr" lvl="1" marL="228600" indent="-228600"><a:buChar char="•"\/>/,
  );
  assert.match(shape, /<a:rPr[^>]*b="1"/);
  assert.match(
    shape,
    /<a:rPr[^>]*>[\s\S]*?<a:srgbClr val="FFFFFF"><a:alpha val="50000"\/>/,
  );
  assert.match(shape, /<a:t>Linked node<\/a:t>/);
  assert.match(shape, /<a:hlinkClick r:id="rId2"\/>/);
  assert.match(slide, /<a:bodyPr wrap="none"[^>]*\/>[\s\S]*<a:t>Top-level paragraphs<\/a:t>/);
});

test("writes editable syntax-colored code with exact line and paragraph spacing", () => {
  const files = readStoredZip(
    buildPptxPackage({
      slides: [
        {
          elements: [
            {
              type: "shape",
              shape: "roundedRect",
              x: 40,
              y: 80,
              width: 700,
              height: 180,
              fill: "#202838",
              stroke: "#405060",
              strokeWidth: 1,
              paragraphs: [
                {
                  lineSpacing: 20,
                  spaceBefore: 0,
                  spaceAfter: 0,
                  runs: [
                    {
                      text: "const",
                      fontFace: "Cascadia Code",
                      fontSize: "16px",
                      color: "#569CD6",
                    },
                    {
                      text: " answer = 42;",
                      fontFace: "Cascadia Code",
                      fontSize: "16px",
                      color: "#DCDCAA",
                    },
                  ],
                },
                {
                  lineSpacing: 20,
                  spaceBefore: 0,
                  spaceAfter: 0,
                  runs: [
                    {
                      text: "  return answer;",
                      fontFace: "Cascadia Code",
                      fontSize: "16px",
                      color: "#D4D4D4",
                    },
                  ],
                },
              ],
              verticalAlignment: "top",
              textInsets: { left: 24, top: 16, right: 20, bottom: 16 },
              textWrap: "none",
            },
          ],
        },
      ],
    }),
  );
  const slide = xml(files, "ppt/slides/slide1.xml");

  assert.match(slide, /<a:prstGeom prst="roundRect">/);
  assert.match(
    slide,
    /<a:bodyPr wrap="none" lIns="228600" tIns="152400" rIns="190500" bIns="152400" anchor="t"\/>/,
  );
  assert.equal(
    (slide.match(
      /<a:lnSpc><a:spcPts val="1500"\/><\/a:lnSpc><a:spcBef><a:spcPts val="0"\/><\/a:spcBef><a:spcAft><a:spcPts val="0"\/><\/a:spcAft>/g,
    ) || []).length,
    2,
  );
  assert.match(slide, /<a:latin typeface="Cascadia Code"\/>/);
  assert.match(slide, /<a:srgbClr val="569CD6">/);
  assert.match(slide, /<a:srgbClr val="DCDCAA">/);
  assert.match(slide, /<a:t xml:space="preserve">  return answer;<\/a:t>/);
});

test("emits PowerPoint-native presets for the extended Architecture shapes", () => {
  const shapes = ["diamond", "triangle", "hexagon", "parallelogram"];
  const files = readStoredZip(
    buildPptxPackage({
      slides: [
        {
          elements: shapes.map((shape, index) => ({
            type: "shape",
            shape,
            x: 20 + index * 220,
            y: 40,
            width: 180,
            height: 120,
            fill: "#ffffff",
            stroke: "#000000",
          })),
        },
      ],
    }),
  );
  const slide = xml(files, "ppt/slides/slide1.xml");
  for (const preset of shapes) {
    assert.match(slide, new RegExp(`<a:prstGeom prst="${preset}">`));
  }
});

test("emits solid and dotted DrawingML connector styles", () => {
  const files = readStoredZip(
    buildPptxPackage({
      slides: [
        {
          elements: [
            {
              type: "connector",
              points: [{ x: 20, y: 40 }, { x: 300, y: 40 }],
              stroke: "#000000",
              dash: "solid",
            },
            {
              type: "connector",
              points: [{ x: 20, y: 100 }, { x: 300, y: 100 }],
              stroke: "#000000",
              dash: "dotted",
            },
          ],
        },
      ],
    }),
  );
  const slide = xml(files, "ppt/slides/slide1.xml");
  const connectors = [...slide.matchAll(/name="Connector \d+"[\s\S]*?<\/p:sp>/g)].map(
    (match) => match[0],
  );
  assert.equal(connectors.length, 2);
  assert.doesNotMatch(connectors[0], /<a:prstDash/);
  assert.match(connectors[1], /<a:prstDash val="dot"\/>/);
});

test("places a full-slide PNG background before every native element", () => {
  const files = readStoredZip(samplePackage());
  const slide = xml(files, "ppt/slides/slide1.xml");
  const background = slide.indexOf('name="Slide background"');
  const text = slide.indexOf('name="Text 3"');
  assert.ok(background > 0 && text > background);
  assert.match(
    slide.slice(background, text),
    /<a:off x="0" y="0"\/><a:ext cx="12192000" cy="6858000"\/>/,
  );
});

test("rejects duplicate and missing asset references", () => {
  assert.throws(
    () =>
      buildPptxPackage({
        slides: [{ elements: [] }],
        assets: [
          { id: "same", data: PNG },
          { id: "same", data: PNG },
        ],
      }),
    /duplicate asset id "same"/,
  );
  assert.throws(
    () =>
      buildPptxPackage({
        slides: [
          {
            elements: [
              {
                type: "image",
                assetId: "missing",
                x: 0,
                y: 0,
                width: 10,
                height: 10,
              },
            ],
          },
        ],
      }),
    /references missing asset "missing"/,
  );
  assert.throws(
    () =>
      buildPptxPackage({
        masters: [{ id: "dark", theme: "dark", layoutIds: ["dark:default"] }],
        layouts: [{ id: "dark:default", name: "default", theme: "dark" }],
        slides: [{ layoutId: "dark:title", elements: [] }],
      }),
    /references missing layout "dark:title"/,
  );
});

test("rejects invalid slide and element models explicitly", () => {
  for (const model of [
    {},
    { slides: [] },
    { slides: [{}] },
    { slides: [{ notes: 42, elements: [] }] },
    {
      slides: [
        {
          elements: [
            { type: "shape", shape: "star", x: 0, y: 0, width: 10, height: 10 },
          ],
        },
      ],
    },
    {
      slides: [
        {
          elements: [
            {
              type: "connector",
              points: [{ x: 0, y: 0 }],
              stroke: "#000000",
            },
          ],
        },
      ],
    },
  ]) {
    assert.throws(() => buildPptxPackage(model), /Invalid PowerPoint model:/);
  }
});

test("rejects invalid AutoShape text body options and text models", () => {
  const shape = {
    type: "shape",
    shape: "rect",
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    fill: "#ffffff",
    stroke: "#000000",
    text: "Node",
  };
  const rejects = (override, expected) =>
    assert.throws(
      () =>
        buildPptxPackage({
          slides: [{ elements: [{ ...shape, ...override }] }],
        }),
      expected,
    );

  rejects({ verticalAlignment: "center" }, /verticalAlignment/);
  rejects({ textWrap: "tight" }, /textWrap/);
  rejects({ textInsets: null }, /textInsets must be an object/);
  rejects({ textInsets: { left: -1 } }, /textInsets\.left/);
  rejects({ textInsets: { top: "2" } }, /textInsets\.top/);
  rejects({ text: 42 }, /\.text must be a string or rich text object/);
  rejects({ text: { paragraphs: [] } }, /\.text\.paragraphs must be a non-empty array/);
  rejects({ text: "Node", paragraphs: [] }, /either text or paragraphs/);
  rejects({ text: undefined, paragraphs: "Node" }, /\.paragraphs must be a non-empty array/);
});
