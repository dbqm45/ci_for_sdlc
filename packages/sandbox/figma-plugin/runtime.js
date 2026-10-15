/*
 * Runtime of the "CI sandbox" Figma plugin (docs/TEST-DATA-GENERATOR.md, 4.2). `npm run sandbox:figma-plugin` puts
 * this text, unchanged, into code.js after the frames of the world, so it is plain JavaScript without imports, and
 * without optional chaining or object spread, which older plugin sandboxes rejected.
 *
 * Every frame it makes carries shared plugin data ci_sandbox.id = the frame id of the world (1:1, 2:3…). Figma gives
 * the frame a node id of its own; the seeder reads the mapping back through the REST API (plugin_data=shared).
 * The plugin touches only frames and pages it marked, and refuses to seed a file with layers it did not make.
 */
var NS = 'ci_sandbox';
var FONT = { family: 'Inter', style: 'Regular' };
var FRAME_W = 360;
var FRAME_H = 640;
var GAP = 80;
var COLUMNS = 5;
var PAD = 24;

/** world: { targets: { seed: Frame[], 'mutate:<scenario>': Frame[] } }; Frame: { id, page, name, texts, transitions }. */
async function runSandbox(figma, world, command) {
  var target = command === 'reset' ? [] : world.targets[command];
  if (!target) {
    figma.closePlugin('CI sandbox: unknown command "' + command + '"');
    return;
  }
  var pages = figma.root.children.slice();
  for (var i = 0; i < pages.length; i++) await pages[i].loadAsync();

  var want = {};
  target.forEach(function (f) { want[f.id] = f; });
  var marked = {};
  var foreign = 0;
  var stale = [];
  pages.forEach(function (page) {
    page.children.slice().forEach(function (node) {
      var id = node.getSharedPluginData(NS, 'id');
      if (!id) foreign++;
      else if (!want[id] || marked[id]) stale.push(node);
      else marked[id] = node;
    });
  });
  if (foreign && target.length) {
    figma.closePlugin('CI sandbox: this file has ' + foreign + ' layer(s) the plugin did not make — run it in the empty sandbox file. Nothing was changed.');
    return;
  }
  stale.forEach(function (node) { node.remove(); });
  var removed = stale.length;

  // Pass 1: every frame on its page, with its name. Real node ids are known only once the frames exist.
  var real = {};
  var created = 0;
  var onPage = {};
  for (var j = 0; j < target.length; j++) {
    var f = target[j];
    var page = pageNamed(figma, f.page);
    var slot = onPage[f.page] = (onPage[f.page] || 0) + 1;
    var node = marked[f.id];
    if (!node) {
      node = figma.createFrame();
      node.setSharedPluginData(NS, 'id', f.id);
      node.resize(FRAME_W, FRAME_H);
      node.x = ((slot - 1) % COLUMNS) * (FRAME_W + GAP);
      node.y = Math.floor((slot - 1) / COLUMNS) * (FRAME_H + GAP);
      page.appendChild(node);
      marked[f.id] = node;
      created++;
    } else if (node.parent !== page) page.appendChild(node);
    if (node.name !== f.name) node.name = f.name;
    real[f.id] = node.id;
  }

  // Pass 2: texts and prototype links, rebuilt only when they changed.
  var fontLoaded = false;
  var updated = 0;
  for (var k = 0; k < target.length; k++) {
    var frame = target[k];
    var host = marked[frame.id];
    var stamp = JSON.stringify([frame.name, frame.page, frame.texts, frame.transitions.map(function (t) { return real[t] || null; })]);
    if (host.getSharedPluginData(NS, 'stamp') === stamp) continue;
    if (!fontLoaded) {
      await figma.loadFontAsync(FONT);
      fontLoaded = true;
    }
    host.children.slice().forEach(function (child) { child.remove(); });
    var y = PAD;
    for (var t = 0; t < frame.texts.length; t++) {
      var text = figma.createText();
      text.fontName = FONT;
      text.characters = frame.texts[t];
      text.x = PAD;
      text.y = y;
      host.appendChild(text);
      y += 32;
    }
    for (var d = 0; d < frame.transitions.length; d++) {
      var dest = frame.transitions[d];
      if (!real[dest]) continue;
      // One button per destination: two navigations on one click would conflict.
      var button = figma.createRectangle();
      button.name = '→ ' + want[dest].name;
      button.resize(FRAME_W - 2 * PAD, 40);
      button.x = PAD;
      button.y = y + 8;
      host.appendChild(button);
      await button.setReactionsAsync([{ trigger: { type: 'ON_CLICK' }, actions: [{ type: 'NODE', destinationId: real[dest], navigation: 'NAVIGATE', transition: null, preserveScrollPosition: false }] }]);
      y += 56;
    }
    host.setSharedPluginData(NS, 'stamp', stamp);
    updated++;
  }

  // Pages the plugin made and left empty go; a file keeps at least one page.
  var dropped = 0;
  var all = figma.root.children.slice();
  for (var p = 0; p < all.length; p++) {
    var pg = all[p];
    if (pg.getSharedPluginData(NS, 'page') !== '1' || pg.children.length || figma.root.children.length < 2) continue;
    if (figma.currentPage === pg) await figma.setCurrentPageAsync(figma.root.children.filter(function (x) { return x !== pg; })[0]);
    pg.remove();
    dropped++;
  }

  figma.closePlugin('CI sandbox ' + command + ': ' + target.length + ' frame(s) in the world; ' + created + ' created, ' +
    (updated - created) + ' updated, ' + removed + ' removed' + (dropped ? ', ' + dropped + ' empty page(s) removed' : ''));
}

function pageNamed(figma, name) {
  var found = figma.root.children.filter(function (p) { return p.name === name; })[0];
  if (found) return found;
  var page = figma.createPage();
  page.name = name;
  page.setSharedPluginData(NS, 'page', '1');
  return page;
}
