const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const source = fs.readFileSync(path.join(__dirname, '../js/site-i18n.js'), 'utf8');
const code = source.slice(source.indexOf('    function loadPartners()'), source.indexOf('    loadPartials().then'));
class Node {
    constructor() { this.children = []; this.events = {}; this.hidden = false; }
    appendChild(child) { this.children.push(child); }
    addEventListener(event, fn) { this.events[event] = fn; }
    contains(node) { return node === this; }
    scrollTo(options) { this.scrollLeft = options.left; this.lastBehavior = options.behavior; }
}
async function setup(partners, reduced = false) {
    const section = new Node(), track = new Node(), controls = new Node(), pause = new Node(), prev = new Node(), next = new Node();
    section.hidden = true;
    track.scrollWidth = 1200; track.clientWidth = 400; track.scrollLeft = 0;
    const nodes = {'[data-partner-track]': track, '[data-partner-controls]': controls, '[data-partner-pause]': pause, '[data-partner-prev]': prev, '[data-partner-next]': next};
    section.querySelector = selector => nodes[selector];
    const document = {hidden: false, querySelector: () => section, createElement: () => new Node(), addEventListener() {}};
    let callback = null;
    const window = {apiUrl: p => p, assetUrl: p => p, matchMedia: () => ({matches: reduced, addEventListener() {}}), addEventListener() {}};
    const context = {document, window, activeLocale: 'en', fetch: async () => ({ok: true, json: async () => ({partners})}), setInterval(fn) {callback = fn; return 1;}, clearInterval() {callback = null;}};
    vm.createContext(context); vm.runInContext(code, context); await context.loadPartners();
    return {section, track, pause, prev, next, tick: () => callback && callback(), running: () => !!callback};
}
(async () => {
    const partner = {name: 'Partner Example', logoUrl: '/img/logo.png', websiteUrl: 'https://example.com/'};
    assert.equal((await setup([])).section.hidden, true);
    let ui = await setup([partner]);
    assert.equal(ui.section.hidden, false);
    const link = ui.track.children[0];
    assert.equal(link.href, partner.websiteUrl); assert.equal(link.target, '_blank'); assert.equal(link.rel, 'noopener noreferrer');
    assert.equal(link.children[0].src, partner.logoUrl);
    assert.equal(link.children[0].alt, '');
    assert.equal(link.children[1].textContent, partner.name);
    ui.tick(); assert.equal(ui.track.scrollLeft, 400);
    ui.next.events.click(); assert.equal(ui.track.scrollLeft, 800);
    ui.next.events.click(); assert.equal(ui.track.scrollLeft, 0);
    ui.prev.events.click(); assert.equal(ui.track.scrollLeft, 800);
    ui.section.events.mouseenter(); assert.equal(ui.running(), false);
    ui.section.events.mouseleave(); assert.equal(ui.running(), true);
    ui.section.events.focusin(); assert.equal(ui.running(), false);
    ui.section.events.focusout({relatedTarget: null}); assert.equal(ui.running(), true);
    ui.pause.events.click(); assert.equal(ui.running(), false); assert.equal(ui.pause.textContent, 'Resume');
    ui.pause.events.click(); assert.equal(ui.running(), true);
    ui = await setup([partner], true); assert.equal(ui.running(), false);
    ui.next.events.click(); assert.equal(ui.track.lastBehavior, 'auto');
    assert.equal((await setup([{...partner, websiteUrl: 'javascript:alert(1)'}])).section.hidden, true);
    console.log('Partner DOM checks passed: empty state, safe new-tab logo links, navigation/wrap, autoplay pause, focus and reduced motion.');
})();
