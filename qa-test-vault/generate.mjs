#!/usr/bin/env node
/**
 * QA Test Vault Generator
 * Run from obsidian_ink/: node qa-test-vault/generate.mjs
 * Rebuilds the entire vault from scratch for visual regression testing.
 *
 * Ink files (SVGs and legacy .writing/.drawing) are copied from real captured
 * fixtures in fixtures/ rather than synthesised. Synthetic snapshots omit
 * required tldraw session fields and do not render in the plugin.
 *
 * Exceptions — kept synthetic because they must be blank:
 *   Ink/Writing/empty-writing.svg  — starting state for the buffer-lines dynamic e2e test
 *   Ink/Drawing/empty-drawing.svg  — used by empty-embed tests
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VAULT_ROOT = path.resolve(__dirname);
const FIXTURES = path.resolve(__dirname, 'fixtures');
const INK_BASE_URL = 'https://youtu.be/2arL1jh8ihA';
const PLUGIN_VERSION = '0.4.0';
const TLDRAW_VERSION = '2.1.0';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeFile(relPath, content) {
  const full = path.join(VAULT_ROOT, relPath);
  ensureDir(path.dirname(full));
  fs.writeFileSync(full, content, 'utf8');
}

// ---- Tldraw snapshot helpers ----
const DRAWING_SCHEMA = {
  schemaVersion: 2,
  sequences: {
    'com.tldraw.store': 4, 'com.tldraw.asset': 1, 'com.tldraw.camera': 1,
    'com.tldraw.document': 2, 'com.tldraw.instance': 25, 'com.tldraw.instance_page_state': 5,
    'com.tldraw.page': 1, 'com.tldraw.instance_presence': 5, 'com.tldraw.pointer': 1,
    'com.tldraw.shape': 4, 'com.tldraw.shape.draw': 2,
  },
};

function makeTldrawSnapshot(store, pageId = 'page:page1') {
  return {
    document: { store, schema: DRAWING_SCHEMA },
    session: {
      version: 0, currentPageId: pageId, exportBackground: true,
      pageStates: [{ pageId, camera: { x: 0, y: 0, z: 0.3 }, selectedShapeIds: [] }],
    },
  };
}

// ---- Embed builders ----
function buildWritingEmbed(filepath) {
  return `\n ![InkWriting](<${filepath}>) [Edit Writing](${INK_BASE_URL}?type=inkWriting&version=1)\n`;
}

function buildDrawingEmbed(filepath, width = 500, aspectRatio = 16 / 9, vb = { x: 0, y: 0, w: 500, h: 281 }) {
  const params = new URLSearchParams({
    type: 'inkDrawing', version: '1', width: String(width), aspectRatio: String(aspectRatio),
    viewBoxX: String(vb.x), viewBoxY: String(vb.y), viewBoxWidth: String(vb.w), viewBoxHeight: String(vb.h),
  });
  return `\n ![InkDrawing](<${filepath}>) [Edit Drawing](${INK_BASE_URL}?${params})\n`;
}

// ---- SVG generation ----
const WRITING_PAGE = 'page:3qj9EtNgqSCW_6knX2K9_';
const WRITING_PAGE_WIDTH = 2000;
const WRITING_LINE_HEIGHT = 150;

function makeWritingStore(extraShapes = {}) {
  return {
    'document:document': { gridSize: 10, name: '', meta: {}, id: 'document:document', typeName: 'document' },
    [WRITING_PAGE]: { meta: {}, id: WRITING_PAGE, name: 'Handwritten Note', index: 'a1', typeName: 'page' },
    'shape:writing-lines': {
      x: 0, y: 0, rotation: 0, isLocked: true, opacity: 1, meta: {},
      type: 'writing-lines', parentId: WRITING_PAGE, index: 'a1',
      props: { x: 0, y: 0, w: WRITING_PAGE_WIDTH, h: WRITING_LINE_HEIGHT * 1.5 },
      id: 'shape:writing-lines', typeName: 'shape',
    },
    'shape:writing-container': {
      x: 0, y: 0, rotation: 0, isLocked: true, opacity: 1, meta: {},
      type: 'writing-container', parentId: WRITING_PAGE, index: 'a1',
      props: { x: 0, y: 0, w: WRITING_PAGE_WIDTH, h: WRITING_LINE_HEIGHT * 1.5 },
      id: 'shape:writing-container', typeName: 'shape',
    },
    ...extraShapes,
  };
}

function createWritingSvg(filename, svgBody, store) {
  const snapshot = makeTldrawSnapshot(store, WRITING_PAGE);
  const tldrawJson = JSON.stringify(snapshot).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" direction="ltr" width="2064" height="289" viewBox="-32 -32 2064 289" stroke-linecap="round" stroke-linejoin="round" style="background-color: transparent;">
  <metadata>
    <ink plugin-version="${PLUGIN_VERSION}" file-type="inkWriting"/>
    <tldraw version="${TLDRAW_VERSION}">${tldrawJson}</tldraw>
  </metadata>
  <defs/>
  ${svgBody}
</svg>`;
  writeFile(`Ink/Writing/${filename}`, svg);
}

const DRAW_PAGE = 'page:3qj9EtNgqSCW_6knX2K9_';

function makeDrawingStore(extraShapes = {}) {
  return {
    'document:document': { gridSize: 10, name: '', meta: {}, id: 'document:document', typeName: 'document' },
    [DRAW_PAGE]: { meta: {}, id: DRAW_PAGE, name: 'Handwritten Note', index: 'a1', typeName: 'page' },
    ...extraShapes,
  };
}


function generateSvgAssets() {
  // Use real captured SVG fixtures for named files so they render correctly in the plugin.
  // Synthetic snapshots omit required tldraw session fields and do not render.
  ensureDir(path.join(VAULT_ROOT, 'Ink/Writing'));
  ensureDir(path.join(VAULT_ROOT, 'Ink/Drawing'));
  for (const name of ['hello-world.svg', 'multi-line.svg', 'dense-strokes.svg']) {
    fs.copyFileSync(path.join(FIXTURES, 'writing-fixture.svg'), path.join(VAULT_ROOT, `Ink/Writing/${name}`));
  }
  for (const name of ['simple-shape.svg', 'complex-diagram.svg', 'tiny-drawing.svg']) {
    fs.copyFileSync(path.join(FIXTURES, 'drawing-fixture.svg'), path.join(VAULT_ROOT, `Ink/Drawing/${name}`));
  }

  // Empty files remain synthetic: they must contain no strokes.
  // empty-writing.svg is the starting file for the buffer-lines dynamic e2e test.
  const writingLine = '<g transform="matrix(1,0,0,1,0,0)"><line x1="100" y1="150" x2="1900" y2="150"/></g><g><rect width="2000" height="225" opacity="0"/></g>';
  createWritingSvg('empty-writing.svg', writingLine, makeWritingStore());

  const emptyStore = makeDrawingStore();
  const emptyDrawSvg = `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 395 130" width="395" height="130" fill="none" class="ddc_ink_drawing-placeholder">
  <metadata>
    <ink plugin-version="${PLUGIN_VERSION}" file-type="inkDrawing"/>
    <tldraw version="${TLDRAW_VERSION}">${JSON.stringify(makeTldrawSnapshot(emptyStore, DRAW_PAGE)).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')}</tldraw>
  </metadata>
  <g><rect rx="10" ry="10" x="1" y="1" width="393" height="128" style="fill:none;stroke-width:1;stroke:rgb(255,255,255);stroke-opacity:0.1;"/></g>
  <g><rect rx="2" ry="2" x="189" y="56" width="18" height="18" style="fill:none;stroke-width:2;stroke:rgb(255,255,255);stroke-opacity:1;" class="stroke-shape"/>
  <circle cx="195" cy="62" style="fill:none;stroke-width:2;stroke:rgb(255,255,255);stroke-opacity:1;" r="2" class="stroke-shape"/>
  <path d="m207 68-3.086-3.086a2 2 0 0 0-2.828 0L192 74" style="fill:none;stroke-width:2;stroke:rgb(255,255,255);stroke-opacity:1;" class="stroke-shape"/></g>
</svg>`;
  writeFile('Ink/Drawing/empty-drawing.svg', emptyDrawSvg);
}

function generateLegacyAssets() {
  // Use real captured legacy fixtures so they render correctly in the plugin.
  // Synthetic snapshots omit required tldraw fields and do not render.
  ensureDir(path.join(VAULT_ROOT, 'Legacy'));
  fs.copyFileSync(
    path.join(FIXTURES, 'legacy-writing-fixture.writing'),
    path.join(VAULT_ROOT, 'Legacy/legacy-writing.writing'),
  );
  fs.copyFileSync(
    path.join(FIXTURES, 'legacy-drawing-fixture.drawing'),
    path.join(VAULT_ROOT, 'Legacy/legacy-drawing.drawing'),
  );
}

function generateTemplates() {
  writeFile('Templates/Ink-Embed-Writing.md', `# New Note from Template
Created: {{date}}

${buildWritingEmbed('Ink/Writing/hello-world.svg')}

More content here.
`);
  writeFile('Templates/Ink-Embed-Drawing.md', `# New Note with Drawing
Created: {{date}}

${buildDrawingEmbed('Ink/Drawing/simple-shape.svg')}

Notes below.
`);
}

function generateAllNotes() {
  const w = (f) => buildWritingEmbed(`Ink/Writing/${f}`);
  const d = (f, ww, ar, vb) => buildDrawingEmbed(`Ink/Drawing/${f}`, ww || 500, ar ?? 16/9, vb);
  const v1W = `\n\`\`\`handwritten-ink
{"versionAtEmbed":"${PLUGIN_VERSION}","filepath":"Legacy/legacy-writing.writing"}
\`\`\`\n`;
  const v1D = `\n\`\`\`handdrawn-ink
{"versionAtEmbed":"${PLUGIN_VERSION}","filepath":"Legacy/legacy-drawing.drawing","width":500,"aspectRatio":1}
\`\`\`\n`;

  const notes = [
    ['01 - Basic Embeds/Single Writing Embed.md', `# Single Writing Embed\n\nParagraph before.\n\n${w('hello-world.svg')}\n\nParagraph after.`],
    ['01 - Basic Embeds/Single Drawing Embed.md', `# Single Drawing Embed\n\nBefore.\n\n${d('simple-shape.svg')}\n\nAfter.`],
    ['01 - Basic Embeds/Multiple Writing Embeds.md', `# Multiple Writing Embeds\n\n${w('hello-world.svg')}\n\n${w('multi-line.svg')}\n\n${w('hello-world.svg')}`],
    ['01 - Basic Embeds/Multiple Drawing Embeds.md', `# Multiple Drawing Embeds\n\n${d('simple-shape.svg')}\n\n${d('complex-diagram.svg')}\n\n${d('simple-shape.svg')}`],
    ['01 - Basic Embeds/Mixed Writing and Drawing.md', `# Mixed\n\n${w('hello-world.svg')}\n\n${d('simple-shape.svg')}\n\n${w('multi-line.svg')}\n\n${d('complex-diagram.svg')}`],
    ['01 - Basic Embeds/Empty Embeds.md', `# Empty Embeds\n${w('empty-writing.svg')}\n${d('empty-drawing.svg')}`],
    ['02 - Legacy Format/V1 Writing Embed.md', `# V1 Writing\n${v1W}`],
    ['02 - Legacy Format/V1 Drawing Embed.md', `# V1 Drawing\n${v1D}`],
    ['02 - Legacy Format/V1 and V2 Side by Side.md', `# V1 and V2\n## V1 Writing\n${v1W}\n## V2 Writing\n${w('hello-world.svg')}\n## V1 Drawing\n${v1D}\n## V2 Drawing\n${d('simple-shape.svg')}`],
    ['03 - Density and Repetition/Many Embeds on One Page.md', `# Many Embeds\n\n${[1,2,3,4,5,6].map(i => i%2?w('hello-world.svg'):d('simple-shape.svg')).join('\n\n')}\n\nEnd.`],
    ['03 - Density and Repetition/Same Embed Repeated.md', `# Same Repeated\n\n${w('hello-world.svg')}${w('hello-world.svg')}${w('hello-world.svg')}${w('hello-world.svg')}${w('hello-world.svg')}`],
    ['03 - Density and Repetition/Same Embed Across Pages Note A.md', `# Note A\n\n${d('simple-shape.svg')}\n\nSame in multiple notes.`],
    ['03 - Density and Repetition/Same Embed Across Pages Note B.md', `# Note B\n\n${d('simple-shape.svg')}\n\nSame in multiple notes.`],
    ['03 - Density and Repetition/Dense Writing.md', `# Dense\n\n${w('dense-strokes.svg')}`],
    ['03 - Density and Repetition/Rapid Succession.md', `# Rapid\n\n${d('simple-shape.svg')}${d('simple-shape.svg')}${w('hello-world.svg')}${w('hello-world.svg')}`],
    ['04 - Obsidian Native Features/In Block Quotes.md', `# Block Quotes\n\n> ${w('hello-world.svg').trim()}\n\n> ${d('simple-shape.svg').trim()}`],
    ['04 - Obsidian Native Features/In Numbered Lists.md', `# Numbered Lists\n\n1. First\n2.${w('hello-world.svg')}\n3. Third`],
    ['04 - Obsidian Native Features/In Bullet Lists.md', `# Bullet Lists\n\n- One\n-${w('hello-world.svg')}\n- Three`],
    ['04 - Obsidian Native Features/In Native Task Lists.md', `# Native Tasks\n\n- [ ] Before\n${w('hello-world.svg')}\n- [x] After`],
    ['04 - Obsidian Native Features/In Tables.md', `# Tables\n\n| A | B |\n|---|---|\n| Text | ${d('simple-shape.svg').replace(/\n/g,' ').trim()} |`],
    ['04 - Obsidian Native Features/Transclusion Source.md', `# Transclusion Source\n\n${w('hello-world.svg')}\n\n${d('simple-shape.svg')}\n\nUse ![[Transclusion Source]]`],
    ['04 - Obsidian Native Features/Transclusion Target.md', `# Transclusion Target\n\n![[Transclusion Source]]`],
    ['04 - Obsidian Native Features/With Headings and TOC.md', `# Headings and TOC\n\n## One\n${w('hello-world.svg')}\n\n### Sub\n${d('simple-shape.svg')}\n\n## Two`],
    ['04 - Obsidian Native Features/Under Folded Heading.md', `# Folded Heading\n\n## Collapse\n\n${w('hello-world.svg')}`],
    ['04 - Obsidian Native Features/With Tags and Links.md', `# Tags and Links\n\n#ink #qa\n\n[[01 - Basic Embeds/Single Writing Embed]]\n\n${w('hello-world.svg')}`],
    ['04 - Obsidian Native Features/Adjacent to Code Blocks.md', `# Adjacent Code\n\n\`\`\`js\nconst x=1;\n\`\`\`\n\n${w('hello-world.svg')}\n\n\`\`\`text\nplain\n\`\`\``],
    ['04 - Obsidian Native Features/On Canvas (Quick Test).md', `# On Canvas\n\nAdd as canvas card. See 08e.\n\n${w('hello-world.svg')}`],
  ];

  notes.forEach(([path, content]) => writeFile(path, content));

  // 04b Callouts
  writeFile('04b - Callouts and Layout Containers/In Callouts - All Types.md',
    ['note','info','abstract','tip','warning','question','todo','example','faq'].map(t =>
      `> [!${t}]\n> ${w('hello-world.svg').replace(/\n/g,' ').trim()}`
    ).join('\n\n'));
  writeFile('04b - Callouts and Layout Containers/In Nested Callouts.md', `# Nested\n\n> [!note] Outer\n> > [!info] Inner\n> > ${w('hello-world.svg').replace(/\n/g,' ').trim()}`);
  writeFile('04b - Callouts and Layout Containers/In Collapsible Callouts.md', `# Collapsible\n\n> [!faq]+ Expanded\n> ${w('hello-world.svg').replace(/\n/g,' ').trim()}\n\n> [!faq]- Collapsed\n> ${d('simple-shape.svg').replace(/\n/g,' ').trim()}`);
  writeFile('04b - Callouts and Layout Containers/In Admonition - Code Blocks.md', `# Admonition\n\n\`\`\`ad-note\ntitle: Note\n${w('hello-world.svg').replace(/^\s+|\s+$/g,'')}\n\`\`\`\n\n\`\`\`ad-tip\n${d('simple-shape.svg').replace(/^\s+|\s+$/g,'')}\n\`\`\``);
  writeFile('04b - Callouts and Layout Containers/In List Callouts.md', `# List Callouts\n\n- ! ${w('hello-world.svg')}\n- ? ${d('simple-shape.svg')}`);
  writeFile('04b - Callouts and Layout Containers/In Columns - Multi-Column Layout.md', `# Multi-Column Layout\n\n> [!multi-column]\n>\n>> [!col|30]\n>> Left\n>> ${w('hello-world.svg').replace(/\n/g,' ')}\n>>\n>> [!col|70]\n>> Right\n>> ${d('simple-shape.svg').replace(/\n/g,' ')}`);
  writeFile('04b - Callouts and Layout Containers/In Columns - Obsidian Columns.md', `# Obsidian Columns\n\n> [!col]\n>> Left\n>> ${w('hello-world.svg').replace(/\n/g,' ')}\n>\n>> [!col-md]\n>> Right\n>> ${d('simple-shape.svg').replace(/\n/g,' ')}`);
  writeFile('04b - Callouts and Layout Containers/In Columns - MCL List Grid.md', `# MCL List Grid\n\n- Item 1 #mcl/list-grid\n- ${w('hello-world.svg').replace(/\n/g,' ')}\n- ${d('simple-shape.svg').replace(/\n/g,' ')}`);

  // 05 Settings
  writeFile('05 - Settings Variations/Writing Lines When Locked.md', `# Writing Lines When Locked\n\nToggle writingLinesWhenLocked.\n\n${w('hello-world.svg')}`);
  writeFile('05 - Settings Variations/Writing Background When Locked.md', `# Writing Background When Locked\n\nToggle writingBackgroundWhenLocked.\n\n${w('hello-world.svg')}`);
  writeFile('05 - Settings Variations/Drawing Frame When Locked.md', `# Drawing Frame When Locked\n\nToggle drawingFrameWhenLocked.\n\n${d('simple-shape.svg')}`);
  writeFile('05 - Settings Variations/Drawing Background When Locked.md', `# Drawing Background When Locked\n\nToggle drawingBackgroundWhenLocked.\n\n${d('simple-shape.svg')}`);
  writeFile('05 - Settings Variations/Stroke Limit Testing.md', `# Stroke Limit\n\n${w('dense-strokes.svg')}`);

  // 06 Sizing
  const dp = 'Ink/Drawing/simple-shape.svg';
  [[100,'Very Narrow'],[200,'Narrow'],[500,'Default'],[700,'Medium Wide'],[800,'Wide'],[1000,'Very Wide']].forEach(([ww,label]) =>
    writeFile(`06 - Sizing and Aspect Ratios/${label} (${ww}px).md`, `# ${label}\n${buildDrawingEmbed(dp, ww)}`));
  [[2,'Very Short (2:1)'],[16/9,'Short (16:9)'],[1,'Square (1:1)'],[9/16,'Tall (9:16)'],[0.5,'Very Tall (1:2)']].forEach(([ar,label]) =>
    writeFile(`06 - Sizing and Aspect Ratios/${label}.md`, `# ${label}\n${buildDrawingEmbed(dp, 500, ar)}`));
  writeFile('06 - Sizing and Aspect Ratios/Short Writing (1 line).md', `# Short Writing\n${w('hello-world.svg')}`);
  writeFile('06 - Sizing and Aspect Ratios/Long Writing (many lines).md', `# Long Writing\n${w('multi-line.svg')}`);
  writeFile('06 - Sizing and Aspect Ratios/Range of Widths and Lengths.md', `# Range\n\n${buildDrawingEmbed(dp,150,0.5)}${buildDrawingEmbed(dp,300,1)}${buildDrawingEmbed(dp,500,1.78)}${buildDrawingEmbed(dp,700,2)}${buildDrawingEmbed(dp,900,0.5)}`);
  writeFile('06 - Sizing and Aspect Ratios/Custom ViewBox.md', `# Custom ViewBox\n${buildDrawingEmbed(dp,500,1,{x:50,y:25,w:200,h:100})}`);

  // 07 Theme
  writeFile('07 - Theme and Layout/Readable Line Width.md', `# Readable Line Width\n\nLong text. Lorem ipsum dolor sit amet.\n\n${w('hello-world.svg')}`);
  writeFile('07 - Theme and Layout/Full Width Note.md', `---\ncssclasses: wide-page\n---\n\n# Full Width\n\n${d('simple-shape.svg')}`);
  writeFile('07 - Theme and Layout/Dark and Light Mode.md', `# Dark and Light\n\n${w('hello-world.svg')}\n${d('simple-shape.svg')}`);
  writeFile('07 - Theme and Layout/Minimal Theme Test.md', `# Minimal Theme\n\n${w('hello-world.svg')}`);
  writeFile('07 - Theme and Layout/Adjacent to Images.md', `# Adjacent Images\n\n${w('hello-world.svg')}\n\n![[sample.png]]\n\n${d('simple-shape.svg')}`);
  writeFile('07 - Theme and Layout/Embed After Horizontal Rule.md', `# After HR\n\n---\n${w('hello-world.svg')}`);

  // 08 Plugin
  writeFile('08 - Plugin Compatibility/Kanban - Board with Ink.md', `---\ncssclasses: kanban\n---\n\n## Column A\n- ${w('hello-world.svg')}\n\n## Column B\n- ${d('simple-shape.svg')}`);
  writeFile('08 - Plugin Compatibility/Tabs - Tabbed Ink Content.md', `# Tabs\n\n\`\`\`tabs\ntab: Tab 1\n${w('hello-world.svg')}\ntab: Tab 2\n${d('simple-shape.svg')}\n\`\`\``);
  writeFile('08 - Plugin Compatibility/Slides Extended - Presentation.md', `# Slide 1\n\n${w('hello-world.svg')}\n\n---\n\n# Slide 2\n\n${d('simple-shape.svg')}\n\n---\n\n# Slide 3`);
  writeFile('08 - Plugin Compatibility/Tasks - Alongside Ink.md', `# Tasks\n\n- [ ] Task 1\n${w('hello-world.svg')}\n- [ ] Task 2\n${d('simple-shape.svg')}\n- [x] Task 3`);
  writeFile('08 - Plugin Compatibility/Excalidraw - Coexistence.md', `# Excalidraw\n\n${w('hello-world.svg')}\n\n![[sample.excalidraw]]\n\n${d('simple-shape.svg')}`);
  writeFile('08 - Plugin Compatibility/Style Settings - Variable Widths.md', `# Style Settings\n\n${w('hello-world.svg')}`);
  writeFile('08 - Plugin Compatibility/Better Export PDF - Print Test.md', `# PDF Export\n\n${w('hello-world.svg')}\n${d('simple-shape.svg')}`);
  writeFile('08 - Plugin Compatibility/Hover Editor - Popover Test.md', `# Hover Editor\n\n[[01 - Basic Embeds/Single Writing Embed]]\n[[04 - Obsidian Native Features/Transclusion Source]]`);
  writeFile('08 - Plugin Compatibility/Webpage Export - HTML Test.md', `# HTML Export\n\n${w('hello-world.svg')}\n${d('simple-shape.svg')}`);

  // 08b Insertion
  writeFile('08b - Insertion Plugins (Templater QuickAdd Buttons)/Templater - Insert Template with Embed.md', `# Templater\n\nRun "Insert template", select Templates/Ink-Embed-Writing.md.`);
  writeFile('08b - Insertion Plugins (Templater QuickAdd Buttons)/Templater - Folder Template with Embed.md', `# Templater Folder\n\nConfigure folder template. Create new note.`);
  writeFile('08b - Insertion Plugins (Templater QuickAdd Buttons)/Templater - Daily Note Template.md', `# Templater Daily\n\nSet as daily note template. Create daily note.`);
  writeFile('08b - Insertion Plugins (Templater QuickAdd Buttons)/QuickAdd - Template Choice with Embed.md', `# QuickAdd Template\n\nCreate Template choice -> Ink-Embed-Writing. Run.`);
  writeFile('08b - Insertion Plugins (Templater QuickAdd Buttons)/QuickAdd - Capture to Note with Embed.md', `# QuickAdd Capture\n\nThis note has embed. Capture to append.\n\n${w('hello-world.svg')}`);
  writeFile('08b - Insertion Plugins (Templater QuickAdd Buttons)/QuickAdd - Macro Invoking Ink Command.md', `# QuickAdd Macro\n\nMacro runs "New handwriting section". Verify embed.`);
  writeFile('08b - Insertion Plugins (Templater QuickAdd Buttons)/Buttons - New Handwriting Button.md', `# Buttons Handwriting\n\nAdd button for "New handwriting section". Click.`);
  writeFile('08b - Insertion Plugins (Templater QuickAdd Buttons)/Buttons - New Drawing Button.md', `# Buttons Drawing\n\nAdd button for "New drawing". Click.`);
  writeFile('08b - Insertion Plugins (Templater QuickAdd Buttons)/Buttons - Insert Template with Embed.md', `# Buttons Template\n\nButton inserts Templates/Ink-Embed-Drawing.md.`);
  writeFile('08b - Insertion Plugins (Templater QuickAdd Buttons)/Core Template - Note with Embed.md', `# Core Template\n\nSettings -> Templates. Insert template. No plugin.`);

  // 08c Make/Dataview
  writeFile('08c - Make.md and Dataview/Make.md - Flow View with Ink Note.md', `# Make.md Flow\n\n${w('hello-world.svg')}\n${d('simple-shape.svg')}`);
  writeFile('08c - Make.md and Dataview/Make.md - Board View with Ink.md', `# Make.md Board\n\n${w('hello-world.svg')}`);
  writeFile('08c - Make.md and Dataview/Make.md - Database with Ink in Rows.md', `# Make.md Database\n\n${d('simple-shape.svg')}`);
  writeFile('08c - Make.md and Dataview/Dataview - List Notes Containing Ink.md', `# Dataview List\n\n\`\`\`dataview\nTABLE file.name FROM "08c - Make.md and Dataview"\n\`\`\``);
  writeFile('08c - Make.md and Dataview/Dataview - Embed Note with Ink.md', `# Dataview Embed\n\n\`\`\`dataview\nTABLE embed(link(file)) FROM "01 - Basic Embeds" LIMIT 1\n\`\`\``);
  writeFile('08c - Make.md and Dataview/Dataview - Inline with Ink Nearby.md', `# Dataview Inline\n\n\`= this.file.name\`\n\n${w('hello-world.svg')}`);
  writeFile('08c - Make.md and Dataview/Dataview - DataviewJS Block with Link.md', `# DataviewJS\n\n\`\`\`dataviewjs\ndv.paragraph(dv.fileLink("01 - Basic Embeds/Single Writing Embed", true))\n\`\`\``);

  // 08d Dashboards
  writeFile('08d - Dashboards/Dashboards - Grid with Ink Note Embed.md', `# Dashboards\n\nCreate dashboard. Embed "01 - Basic Embeds/Single Writing Embed".`);
  writeFile('08d - Dashboards/Dashboards - Grid with Dataview Block.md', `# Dashboards Dataview\n\nDashboard with Dataview block.`);
  writeFile('08d - Dashboards/Dashboard++ - MOC with Ink Notes.md', `# Dashboard++ MOC\n\n- [[01 - Basic Embeds/Single Writing Embed]]\n- [[01 - Basic Embeds/Single Drawing Embed]]`);
  writeFile('08d - Dashboards/Dashboard++ - Index with Transclusion.md', `# Dashboard++ Transclusion\n\n![[01 - Basic Embeds/Single Writing Embed]]`);

  // 08e Canvas
  writeFile('08e - Canvas/Canvas - Note Card with Ink.md', `# Canvas Card\n\n${w('hello-world.svg')}\n${d('simple-shape.svg')}`);
  writeFile('08e - Canvas/Canvas - Multiple Note Cards.md', `# Canvas Multiple\n\nAdd note cards with ink.`);
  writeFile('08e - Canvas/Canvas - Canvas Embed in Note.md', `# Canvas Embed\n\n![[Canvas for Tests.canvas]]`);
  writeFile('08e - Canvas/Canvas - Grouped Cards with Ink.md', `# Canvas Grouped\n\nGrouped cards with ink notes.`);
  writeFile('08e - Canvas/Canvas Source for Canvas Tests.md', `# Canvas Source\n\n${w('hello-world.svg')}\n${d('simple-shape.svg')}`);

  // 09 Edge
  writeFile('09 - Edge Cases and Error States/Missing File Reference.md', `# Missing File\n\n ![InkWriting](<Ink/Writing/nonexistent.svg>) [Edit Writing](${INK_BASE_URL}?type=inkWriting&version=1)`);
  writeFile('09 - Edge Cases and Error States/Broken Embed Syntax.md', `# Broken\n\n![InkWriting](<Ink/Writing/hello-world.svg>) (missing space before !)`);
  writeFile('09 - Edge Cases and Error States/Special Characters in Path.md', `# Special Chars\n\nCreate file with spaces/parens.`);
  writeFile('09 - Edge Cases and Error States/Very Long Filepath.md', `# Long Path\n\n${w('Ink/Writing/hello-world.svg')}`);
  writeFile('09 - Edge Cases and Error States/Embed in Source Mode.md', `# Source Mode\n\nSwitch to Source. V2 should not render.\n\n${w('hello-world.svg')}`);
  writeFile('09 - Edge Cases and Error States/Embed in Reading View.md', `# Reading View\n\n${w('hello-world.svg')}`);
  writeFile('09 - Edge Cases and Error States/Empty Note with Embed.md', w('hello-world.svg'));
  writeFile('09 - Edge Cases and Error States/File Without Metadata.md', `# No Metadata\n\nUse plain SVG.`);
  writeFile('09 - Edge Cases and Error States/Embed in List Continuation.md', `# List Continuation\n\n- Item\n    ${w('hello-world.svg').trim()}`);

  // 10 Cross-ref
  writeFile('10 - Cross-Reference/Source Note.md', `# Source\n\n${w('hello-world.svg')}\n${d('simple-shape.svg')}`);
  writeFile('10 - Cross-Reference/Transcluded Reference.md', `# Transcluded\n\n![[Source Note]]`);
  writeFile('10 - Cross-Reference/Same File Different Notes A.md', `# A\n\n${d('simple-shape.svg')}`);
  writeFile('10 - Cross-Reference/Same File Different Notes B.md', `# B\n\n${d('simple-shape.svg')}`);
  writeFile('10 - Cross-Reference/Same File Different Notes C.md', `# C\n\n${d('simple-shape.svg')}`);

  // 11 CodeMirror
  writeFile('11 - CodeMirror and Editor Behavior/Cursor Navigation Around Embeds.md', `# Cursor Nav\n\n${w('hello-world.svg')}`);
  writeFile('11 - CodeMirror and Editor Behavior/Split Pane - Two Notes Side by Side.md', `# Split Pane\n\n${d('simple-shape.svg')}`);
  writeFile('11 - CodeMirror and Editor Behavior/Undo Redo with Embeds.md', `# Undo Redo\n\nBefore.\n${w('hello-world.svg')}\nAdd after, Undo.`);
  writeFile('11 - CodeMirror and Editor Behavior/Paste Near Embed.md', `# Paste\n\n${w('hello-world.svg')}\n\nPaste after.`);
  writeFile('11 - CodeMirror and Editor Behavior/Search and Replace.md', `# Search\n\n${w('hello-world.svg')}`);
  writeFile('11 - CodeMirror and Editor Behavior/Native Print Export.md', `# Print\n\n${w('hello-world.svg')}\n${d('simple-shape.svg')}`);
}

function main() {
  console.log('Generating QA test vault...');
  generateSvgAssets();
  generateLegacyAssets();
  generateTemplates();
  generateAllNotes();
  writeFile('README.md', `# QA Test Vault for obsidian_ink

Self-contained vault for visual regression testing. Contains dummy markdown notes, sample ink embeds (SVG v2 and legacy v1 formats), and compatibility tests for Obsidian plugins.

All Ink files (SVGs and legacy .writing/.drawing) are copied from real captured fixtures in \`fixtures/\` so they render correctly in the plugin. The only exceptions are \`Ink/Writing/empty-writing.svg\` and \`Ink/Drawing/empty-drawing.svg\`, which are kept blank by design.

## Quick Start

1. Run \`node qa-test-vault/generate.mjs\` from the obsidian_ink project root to create/reset the vault.
2. Open the \`qa-test-vault\` folder as an Obsidian vault.
3. Install and enable the Ink plugin (symlink or copy from main project).
4. Walk through numbered sections (01–11) following instructions in each note.

## Reset

\`node qa-test-vault/generate.mjs\` rebuilds the entire vault from scratch. Run after code changes to retest.

## Structure

- **01 – Basic Embeds**: Single, multiple, mixed, empty
- **02 – Legacy Format**: v1 code block embeds (handwritten-ink, handdrawn-ink)
- **03 – Density and Repetition**: Many embeds, same embed repeated, back-to-back
- **04 – Obsidian Native Features**: Block quotes, lists, tables, transclusion, headings, code blocks
- **04b – Callouts and Layout**: Native callouts, Admonition, List Callouts, Columns (Multi-Column, Obsidian Columns, MCL)
- **05 – Settings Variations**: writingLinesWhenLocked, drawingFrameWhenLocked, etc.
- **06 – Sizing and Aspect Ratios**: Width range (100–1000px), aspect ratios, writing length
- **07 – Theme and Layout**: Readable width, full width, dark/light mode
- **08 – Plugin Compatibility**: Kanban, Tabs, Slides, Tasks, Excalidraw, export
- **08b – Insertion Plugins**: Templater, QuickAdd, Buttons, Core Templates
- **08c – Make.md and Dataview**: Flow view, board, database, queries
- **08d – Dashboards**: Grid embeds, Dashboard++ MOC
- **08e – Canvas**: Note cards, canvas embed in note, grouped cards
- **09 – Edge Cases**: Missing file, broken syntax, source/reading mode
- **10 – Cross-Reference**: Transclusion, same file across notes
- **11 – CodeMirror**: Cursor nav, split pane, undo, paste, search, print
- **12 – File Conversion**: Writing/drawing convert via pane menu (real fixture SVGs)
- **13 – Migration Test**: Legacy v1 code block embeds for migration testing
- **14 – Conversion Modal**: Multi-note embed scan and conversion modal tests
`);
  generateConversionTestAssets();
  generateMigrationTestAssets();
  generateConversionModalTestAssets();

  ensureDir('.obsidian');
  // Clear plugin persistence so onboarding tests see first-run state
  const dataPath = path.join(VAULT_ROOT, '.obsidian', 'data.json');
  if (fs.existsSync(dataPath)) fs.unlinkSync(dataPath);
  console.log('Done. Vault at', VAULT_ROOT);
}

// ─── Section 12: File Conversion ──────────────────────────────────────────────

function generateConversionTestAssets() {
  // Use real captured SVGs rather than synthetically generated ones.
  // Synthetic snapshots omit required tldraw session fields and do not render.
  ensureDir(path.join(VAULT_ROOT, 'Ink/Writing'));
  ensureDir(path.join(VAULT_ROOT, 'Ink/Drawing'));
  fs.copyFileSync(
    path.join(FIXTURES, 'writing-fixture.svg'),
    path.join(VAULT_ROOT, 'Ink/Writing/Writing To Convert.svg'),
  );
  fs.copyFileSync(
    path.join(FIXTURES, 'drawing-fixture.svg'),
    path.join(VAULT_ROOT, 'Ink/Drawing/Drawing To Convert.svg'),
  );

  writeFile('12 - File Conversion/Conversion Test.md', `# File Conversion Test

Use the three-dot (more-options) menu on each file tab to convert between writing and drawing formats.

${buildWritingEmbed('Ink/Writing/Writing To Convert.svg')}

${buildDrawingEmbed('Ink/Drawing/Drawing To Convert.svg')}
`);
}

// ─── Section 13: Migration Test ───────────────────────────────────────────────

function generateMigrationTestAssets() {
  // Use real captured legacy fixtures (same pattern as SVG fixtures in section 12).
  // Synthetic snapshots omit required tldraw fields and do not render or migrate correctly.
  ensureDir(path.join(VAULT_ROOT, 'Ink/Writing'));
  ensureDir(path.join(VAULT_ROOT, 'Ink/Drawing'));
  fs.copyFileSync(
    path.join(FIXTURES, 'legacy-writing-fixture.writing'),
    path.join(VAULT_ROOT, 'Ink/Writing/migration-test-2.writing'),
  );
  fs.copyFileSync(
    path.join(FIXTURES, 'legacy-drawing-fixture.drawing'),
    path.join(VAULT_ROOT, 'Ink/Drawing/migration-test-2.drawing'),
  );

  // Legacy code block embed helper
  function buildLegacyWritingEmbed(filepath) {
    return `\`\`\`handwritten-ink\n${JSON.stringify({ versionAtEmbed: PLUGIN_VERSION, filepath })}\n\`\`\``;
  }
  function buildLegacyDrawingEmbed(filepath) {
    return `\`\`\`handdrawn-ink\n${JSON.stringify({ versionAtEmbed: PLUGIN_VERSION, filepath, width: 500, aspectRatio: 1 })}\n\`\`\``;
  }

  writeFile('13 - Migration Test/Legacy Writing Note.md', `# Legacy Writing Note

This note contains a legacy v1 handwritten-ink embed for migration testing.
After running the migration command, this code block should be replaced with a current-format image embed.

${buildLegacyWritingEmbed('Ink/Writing/migration-test-2.writing')}

Content after the embed.
`);

  writeFile('13 - Migration Test/Legacy Drawing Note.md', `# Legacy Drawing Note

This note contains a legacy v1 handdrawn-ink embed for migration testing.
After running the migration command, this code block should be replaced with a current-format image embed.

${buildLegacyDrawingEmbed('Ink/Drawing/migration-test-2.drawing')}

Content after the embed.
`);

  writeFile('13 - Migration Test/Mixed Formats Note.md', `# Mixed Formats Note

This note contains both a legacy v1 embed AND a current-format embed.
The migration should only update the legacy embed.

${buildLegacyWritingEmbed('Ink/Writing/migration-test-2.writing')}

${buildWritingEmbed('Ink/Writing/hello-world.svg')}

Content after the embeds.
`);

  writeFile('13 - Migration Test/README.md', `# Migration Test

This folder contains test files for the "Migrate legacy ink embeds" command.
Run the command from the command palette, then verify:

1. \`Legacy Writing Note.md\` - legacy writing embed replaced with current format
2. \`Legacy Drawing Note.md\` - legacy drawing embed replaced with current format
3. \`Mixed Formats Note.md\` - only the legacy embed replaced; current format embed unchanged
4. \`Ink/Writing/migration-test-2.writing\` is gone, \`Ink/Writing/migration-test-2.svg\` exists
5. \`Ink/Drawing/migration-test-2.drawing\` is gone, \`Ink/Drawing/migration-test-2.svg\` exists
`);
}

// ─── Section 14: Conversion Modal Test ────────────────────────────────────────

function generateConversionModalTestAssets() {
  ensureDir(path.join(VAULT_ROOT, 'Ink/Writing'));
  ensureDir(path.join(VAULT_ROOT, 'Ink/Drawing'));
  fs.copyFileSync(
    path.join(FIXTURES, 'writing-fixture.svg'),
    path.join(VAULT_ROOT, 'Ink/Writing/modal-test-writing.svg'),
  );
  fs.copyFileSync(
    path.join(FIXTURES, 'drawing-fixture.svg'),
    path.join(VAULT_ROOT, 'Ink/Drawing/modal-test-drawing.svg'),
  );

  writeFile('14 - Conversion Modal/Note With Writing.md', `# Note With Writing

${buildWritingEmbed('Ink/Writing/modal-test-writing.svg')}
`);

  writeFile('14 - Conversion Modal/Note With Drawing.md', `# Note With Drawing

${buildDrawingEmbed('Ink/Drawing/modal-test-drawing.svg')}
`);

  // Second note embeds the same writing file — used to test "other notes" messaging
  writeFile('14 - Conversion Modal/Second Note With Writing.md', `# Second Note With Writing

${buildWritingEmbed('Ink/Writing/modal-test-writing.svg')}
`);
}

main();
