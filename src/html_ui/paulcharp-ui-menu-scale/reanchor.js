// UI Menu Scale, part 2: spread the denser layout back out to the screen edges.
//
// Stock layouts are designed for a 1920 x 1080 frame (in 1080p units). With a denser
// --unscaledScreenHeight the viewport becomes wider and taller in those units (2560 x 1440 on 4K at
// 1.5x), so containers anchored to the screen edges grow while blocks anchored to their centre
// (--h-anchor/--v-anchor: 50%) keep their offsets and drift toward the middle.
//
// Growth is tracked down the tree: the viewport grew by the extra; a container anchored to both
// edges of a grown container (or sized in % of it) grew by the same amount; fixed sizes didn't.
// For every centre-anchored block whose containing block grew, this script recovers the
// container's design size (current size minus its growth) and:
//   - pins blocks lying on one side of the centre line, or aligned with a frame edge, to that edge
//     with the same margin;
//   - stretches blocks spanning nearly the whole design width to the full width, and keeps the
//     width of their right-anchored children so those don't grow;
//   - widens large edge-anchored fixed-width blocks (columns, half-width lines) in proportion;
//   - stretches tall blocks crossing the vertical centre (settings panels, lists) to the full
//     height, keeping their top and bottom margins;
//   - leaves truly centred blocks (dialogs) alone.
// Offsets are written in 1080p units, so they follow later density changes.
// Changes are applied synchronously when elements mount, before the engine reads the layout
// (blur regions are computed from element rects).
(function () {
    "use strict";
    var STRETCH_MIN = 0.85;   // of the design width
    var STRETCH_MIN_H = 0.45; // of the design height, for blocks crossing the centre line
    var WIDEN_MIN = 0.4;      // edge-anchored fixed blocks this wide (of the design width) grow in proportion
    var EDGE = 160;           // 1080p units: "aligned with the frame edge" tolerance
    var MARK = "data-uimenuscale";

    function u(n) { return "calc(var(--unscaledScreenHeight) * " + Math.round(n * 100) / 100 + "px / 1080)"; }
    function k() { return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--unscaledScreenHeight")) / 1080 || 1; }

    // Extra viewport, in 1080p units, compared with stock density.
    function extra() {
        var kk = k();
        var natural = window.uiMenuScale ? window.uiMenuScale.naturalHeight() : kk * 1080;
        var kn = natural / 1080;
        return { x: Math.max(0, innerWidth / kk - innerWidth / kn), y: Math.max(0, innerHeight / kk - innerHeight / kn) };
    }

    // Inline style lengths are calc(... * Npx / 1080) or plain px; return 1080p units or null.
    function units(v) {
        if (!v) return null;
        var m = v.match(/\* (-?[\d.]+)px \/ 1080/);
        if (m) return parseFloat(m[1]);
        m = v.match(/^(-?[\d.]+)px$/);
        return m ? parseFloat(m[1]) / k() : null;
    }
    function pct(v) { var m = (v || "").match(/(-?[\d.]+)%/); return m ? parseFloat(m[1]) / 100 : 0; }

    function remember(el) {
        if (!el.hasAttribute(MARK + "-orig")) el.setAttribute(MARK + "-orig", el.getAttribute("style") || "");
    }

    // Re-anchor one axis of a centre-anchored block against its parent's design size.
    function snapAxis(style, axis, size, design) {
        var anchorVar = axis === "x" ? "--h-anchor" : "--v-anchor";
        var prop = axis === "x" ? "left" : "top";
        var offset = units(style.getPropertyValue(prop)) || 0;
        var pivot = pct(style.getPropertyValue(axis === "x" ? "--pivot-x" : "--pivot-y"));
        var start = offset + pivot * size, end = start + size, half = design / 2;
        var toStart;
        if (start < 0 && end > 0) {                                    // crosses the centre line
            var nearStart = start <= -half + EDGE, nearEnd = end >= half - EDGE;
            if (nearStart === nearEnd) return false;                   // centred, or frame-wide
            toStart = nearStart;
        } else {
            toStart = end <= 0;
        }
        style.setProperty(anchorVar, toStart ? "0%" : "100%");
        style.setProperty(prop, "calc(var(" + anchorVar + ") + " + u(toStart ? offset + half : offset - half) + ")");
        return true;
    }

    // Children of a stretched container: anything tied to the right edge keeps its width.
    function fixChildren(container, designWidth) {
        [].forEach.call(container.children, function (c) {
            if (!c.style || (c.hasAttribute(MARK) && c.getAttribute(MARK) !== "-")) return;
            var s = c.style;
            if (pct(s.getPropertyValue("--h-anchor")) !== 0) return;
            var left = units(s.getPropertyValue("left")), right = units(s.getPropertyValue("right"));
            if (right == null) right = declaresEdge(c, "right") ? 0 : null;
            if (left == null || right == null) return;
            var width = designWidth - left - right;
            if (width <= 0 || (left < designWidth / 2 - 1 && right < designWidth / 2 - 1)) return;
            remember(c);
            if (left >= designWidth / 2 - 1) {
                s.setProperty("left", "auto");
                c.setAttribute(MARK, "fixed-right");
            } else {
                s.setProperty("right", "auto");
                c.setAttribute(MARK, "fixed-left");
            }
            s.setProperty("width", u(width));
        });
    }

    // Anchors resolve against the containing block: the nearest positioned ancestor, else the
    // viewport (e.g. the input bar's parent <entry-point> is static and 0 px tall).
    function containingBlock(el) {
        var parentStatic = el.style && getComputedStyle(el).position !== "absolute";
        for (var a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
            if (parentStatic || getComputedStyle(a).position !== "static") return a;
        }
        return null;                                   // viewport
    }
    function rectOf(cb) {
        return cb ? cb.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
    }

    // Coherent's getComputedStyle resolves right/bottom to pixels even when unset, so read what the
    // style declares: the inline property, or Asobo's edge classes. (left/top always come from
    // .absolute + the anchor, so only right/bottom tell a stretched element from a sized one.)
    function declaresEdge(el, side) {
        var v = el.style.getPropertyValue(side).trim();
        if (v && v !== "auto") return true;
        return el.classList.contains(side === "right" ? "absolute-right-position" : "absolute-bottom-position");
    }

    function fills(el, cb, axis) {
        var r = el.getBoundingClientRect(), pr = rectOf(cb);
        return axis === "x" ? Math.abs(r.width - pr.width) < 2 : Math.abs(r.height - pr.height) < 2;
    }

    // How much an element grew (1080p units) compared with stock density, per axis.
    // Viewport: the extra viewport. Fixed sizes (calc(... Npx / 1080)): 0. Sizes tied to the
    // containing block (auto with both edges set, %, our calc(100% - x)): the container's growth.
    var cache = null;
    function growth(el, axis, ex) {
        if (!el) return ex[axis];
        var key = axis + "|";
        if (cache.has(el) && cache.get(el)[key] != null) return cache.get(el)[key];
        var g = 0, s = el.style, cs = getComputedStyle(el);
        var widened = axis === "x" && el.getAttribute(MARK + "-gx");
        if (widened) {
            g = parseFloat(widened);
            var e0 = cache.get(el) || {}; e0[key] = g; cache.set(el, e0);
            return g;
        }
        var sizeProp = axis === "x" ? "width" : "height";
        var a = axis === "x" ? ["left", "right"] : ["top", "bottom"];
        var size = s.getPropertyValue(sizeProp);
        var cb = containingBlock(el);
        if (/\* -?[\d.]+px \/ 1080\)$/.test(size.trim()) && size.indexOf("100%") < 0) {
            g = 0;                                                      // fixed design size
        } else if (/%/.test(size)) {
            var m = size.match(/(\d+(?:\.\d+)?)%/);
            g = growth(cb, axis, ex) * (m ? parseFloat(m[1]) / 100 : 1);
        } else if (cs.position === "absolute") {
            g = declaresEdge(el, a[1]) ? growth(cb, axis, ex) : 0;       // tied to both edges?
        } else if (fills(el, cb, axis)) {
            g = growth(cb, axis, ex);                                   // measured: fills its container
        } else if (cs.position !== "absolute" && axis === "x") {
            var pd = el.parentElement ? getComputedStyle(el.parentElement) : null;
            var rowItem = pd && /flex/.test(pd.display) && !/column/.test(pd.flexDirection);
            g = rowItem || /inline/.test(cs.display) ? 0 : growth(el.parentElement, axis, ex);
        }
        var entry = cache.get(el) || {};
        entry[key] = g;
        cache.set(el, entry);
        return g;
    }

    // Cheap pre-filter on the inline style text: only centre-anchored blocks, blocks with a fixed
    // design width, and blocks sized by a right offset can change. Skips most elements before any getComputedStyle (the costly part).
    var CANDIDATE = /-anchor:\s*50%|(width|right):\s*calc\(var\(--unscaledScreenHeight\)/;

    function process(el, ex, kk) {
        if (!CANDIDATE.test(el.getAttribute("style") || "")) { el.setAttribute(MARK, "-"); return true; }
        // Not laid out (hidden page): retry later. Checked before any getComputedStyle, the costly
        // part: new hidden subtrees can hold hundreds of candidates.
        var r0 = el.getBoundingClientRect();
        if (!r0.width && !r0.height) return false;
        var s = el.style;
        var hx = pct(s.getPropertyValue("--h-anchor")) === 0.5, vy = pct(s.getPropertyValue("--v-anchor")) === 0.5;
        var widened = hx ? null : widen(el, ex, kk);         // x: proportional widening
        if (!hx && !vy) return widened;
        var r = el.getBoundingClientRect();
        if (!r.width && !r.height) return false;    // not laid out yet (hidden): retry later
        var cb = containingBlock(el), pr = rectOf(cb);
        // The container's design size is its current size minus how much it grew.
        var gx = hx ? growth(cb, "x", ex) : 0, gy = vy ? growth(cb, "y", ex) : 0;
        // An element that already grows with its container (%, both edges, fills it) adapts by
        // itself on that axis; re-anchoring it would apply the growth twice.
        var grewX = gx > 1 && growth(el, "x", ex) <= 1, grewY = gy > 1 && growth(el, "y", ex) <= 1;
        if (!grewX && !grewY) {
            el.setAttribute(MARK, el.hasAttribute(MARK + "-gx") ? "widen" : "-");
            return true;
        }
        var dw = pr.width / kk - gx, dh = pr.height / kk - gy;
        var w = r.width / kk, h = r.height / kk;
        var did = [];
        remember(el);

        if (grewX) {
            if (w >= dw * STRETCH_MIN) {
                // Pin to the left edge with the original margin; both margins stay the same.
                var left = units(s.getPropertyValue("left")) || 0;
                var startX = left + pct(s.getPropertyValue("--pivot-x")) * w;
                s.setProperty("--h-anchor", "0%");
                s.setProperty("--pivot-x", "0%");
                s.setProperty("left", "calc(var(--h-anchor) + " + u(startX + dw / 2) + ")");
                s.setProperty("width", "calc(100% - " + u(dw - w) + ")");
                fixChildren(el, w);
                did.push("stretch");
            } else if (snapAxis(s, "x", w, dw)) {
                did.push("x");
            }
        }
        if (grewY) {
            var top = units(s.getPropertyValue("top")) || 0;
            var start = top + pct(s.getPropertyValue("--pivot-y")) * h, end = start + h;
            if (h >= dh * STRETCH_MIN_H && start < 0 && end > 0) {
                s.setProperty("--v-anchor", "0%");
                s.setProperty("--pivot-y", "0%");
                s.setProperty("top", "calc(var(--v-anchor) + " + u(start + dh / 2) + ")");
                s.setProperty("height", "calc(100% - " + u(dh - h) + ")");
                did.push("stretch-y");
            } else if (snapAxis(s, "y", h, dh)) {
                did.push("y");
            }
        }
        if (el.hasAttribute(MARK + "-gx")) did.unshift("widen");
        el.setAttribute(MARK, did.join(",") || "kept");
        return true;
    }

    // Edge-anchored blocks with a fixed design width (columns, half-width lines) keep their share of
    // a grown container instead of leaving a gap: width += container growth x (width / design width).
    function widen(el, ex, kk) {
        var s = el.style, cs = getComputedStyle(el);
        if (cs.position !== "absolute" || /%/.test(s.getPropertyValue("width"))) {
            el.setAttribute(MARK, "-");
            return true;
        }
        if (el.hasAttribute(MARK + "-gx")) return true;
        var r = el.getBoundingClientRect();
        if (!r.width) return false;
        var cb = containingBlock(el), gx = growth(cb, "x", ex);
        var dw = rectOf(cb).width / kk - gx;
        var keepMark = pct(s.getPropertyValue("--v-anchor")) === 0.5;
        if (gx <= 1 || dw <= 0) {
            if (!keepMark) el.setAttribute(MARK, "-");
            return true;
        }
        var w = units(s.getPropertyValue("width"));
        var left = units(s.getPropertyValue("left")) || 0;

        // Tied to both edges with one offset at or past the middle: it was sized for the stock container
        // (e.g. right: 1180 in a 1770 frame = a 590 column). Keep that width.
        if (w == null && declaresEdge(el, "right") && pct(s.getPropertyValue("--h-anchor")) === 0) {
            var right = units(s.getPropertyValue("right")) || 0;
            var fixed = dw - left - right;
            if (fixed > 0 && (left >= dw / 2 - 1 || right >= dw / 2 - 1)) {
                remember(el);
                if (left >= dw / 2 - 1) { s.setProperty("left", "auto"); el.setAttribute(MARK, "fixed-right"); }
                else { s.setProperty("right", "auto"); el.setAttribute(MARK, "fixed-left"); }
                s.setProperty("width", u(fixed));
                return true;
            }
        }

        // Large fixed-width block: widen in proportion, but only in a mirrored layout (a partner
        // anchored to the opposite edge, like From/To) and never when a sibling is placed right
        // after it from the same edge or spans across it.
        if (w == null || w < dw * WIDEN_MIN || w > dw * 0.98 || !mirrored(el, left, w)) {
            if (!keepMark) el.setAttribute(MARK, "-");
            return true;
        }
        var add = gx * w / dw;
        remember(el);
        s.setProperty("width", u(w + add));
        el.setAttribute(MARK + "-gx", String(add));
        el.setAttribute(MARK, "widen");
        return true;
    }

    function mirrored(el, left, w) {
        var side = pct(el.style.getPropertyValue("--h-anchor"));      // 0 = from left, 1 = from right
        var mirror = false;
        var sibs = el.parentElement ? el.parentElement.children : [];
        for (var i = 0; i < sibs.length; i++) {
            var sb = sibs[i];
            if (sb === el || !sb.style || getComputedStyle(sb).position !== "absolute") continue;
            var ss = sb.style, sh = pct(ss.getPropertyValue("--h-anchor"));
            if (sh === 0.5) continue;                                    // centred (e.g. swap button)
            var sw = units(ss.getPropertyValue("width"));
            if (sw == null && declaresEdge(sb, "right")) return false;   // spans across
            var sl = units(ss.getPropertyValue("left")) || 0;
            if (sh === side) {
                if (side === 0 && sl >= left + w - 2) return false;      // placed after it, same edge
                if (side === 1 && sl <= left - w + 2) return false;
            } else {
                mirror = true;
            }
        }
        return mirror;
    }

    // Document order is parents before children: a child's decision uses its parent's final size.
    var SELECTOR = "[style*='-anchor']:not([" + MARK + "])";
    // Elements not laid out yet (hidden pages: hundreds in the menus view), each with its highest
    // ancestor that has no box (display: none, unlike a 0 px wrapper). Each DOM call costs about 1 us
    // in Coherent: a retry pass checks one box per hidden ancestor, and the elements' own rects only
    // once it shows. Roots are checked by box, not style: after a hover, the first rect read only runs
    // the frame's layout early, while reading a hidden root's computed style resolves the styles of
    // its hidden subtree: about 14 ms per frame in the graphics settings popup.
    var retry = new Map();
    function laidOut(e) { var r = e.getBoundingClientRect(); return !!(r.width || r.height); }
    function hasBox(e) { return e.getClientRects().length > 0; }
    function hiddenRoot(el, roots) {
        var p = el.parentElement;
        if (!p || p === document.body || hasBox(p)) return el;
        if (!roots.has(p)) roots.set(p, hiddenRoot(p, roots));
        return roots.get(p);
    }
    function scanNodes(roots, withRetry) {
        var ex = extra(), kk = k();
        if (!ex.x && !ex.y) return;
        cache = new Map();
        var list = [], shown = new Map(), hidden = new Map();
        if (withRetry) {
            retry.forEach(function (root, e) {
                if (!shown.has(root)) shown.set(root, root.isConnected ? hasBox(root) : null);
                var s = shown.get(root);
                if (s === null) retry.delete(e);
                else if (s && laidOut(e)) { retry.delete(e); list.push(e); }
            });
        }
        roots.forEach(function (n) {
            if (n.nodeType !== 1) return;
            if (n.matches && n.matches(SELECTOR)) list.push(n);
            [].push.apply(list, n.querySelectorAll(SELECTOR));
        });
        for (var i = 0; i < list.length; i++) {
            var el = list[i];
            if (el.hasAttribute(MARK)) continue;
            if (process(el, ex, kk) === false) { retry.set(el, hiddenRoot(el, hidden)); continue; }
            var m = el.getAttribute(MARK);
            if (m && m !== "-" && m !== "kept") {
                // This container changed: decisions already taken for its descendants are stale.
                cache = new Map();
                [].forEach.call(el.querySelectorAll("[" + MARK + "='-'], [" + MARK + "='kept']"), function (d) {
                    d.removeAttribute(MARK);
                    list.push(d);
                });
            }
        }
        cache = null;
    }
    function scan() { scanNodes([document.documentElement], true); }
    // New nodes: synchronously. Retries: once per frame after any DOM change (hover effects and
    // text updates change the DOM every frame).
    var retryPending = false;
    function onMutations(records) {
        var roots = [];
        records.forEach(function (rec) {
            for (var i = 0; i < rec.addedNodes.length; i++) if (rec.addedNodes[i].nodeType === 1) roots.push(rec.addedNodes[i]);
        });
        if (roots.length) scanNodes(roots, false);
        if (retry.size && !retryPending) {
            retryPending = true;
            requestAnimationFrame(function () { retryPending = false; scanNodes([], true); });
        }
    }

    // Undo everything (dev: re-evaluate this file after a restore to test changes live).
    function restore() {
        [].forEach.call(document.querySelectorAll("[" + MARK + "-orig]"), function (e) {
            e.setAttribute("style", e.getAttribute(MARK + "-orig"));
            e.removeAttribute(MARK + "-orig");
        });
        [].forEach.call(document.querySelectorAll("[" + MARK + "]"), function (e) {
            e.removeAttribute(MARK);
            e.removeAttribute(MARK + "-gx");
        });
    }

    // Other mods that place elements with stylesheet rules in the stock centred frame (inline styles
    // are handled above). Each rule is the edge-anchored equivalent, identical at stock density.
    //   SimpleUI favourites strip: left: 50% - 940, top: 50% - 194 (under the location search).
    var COMPAT_CSS =
        ".sui-fs{left:" + u(20) + " !important;top:" + u(540 - 194) + " !important}";
    if (!document.querySelector("style[data-uimenuscale-compat]")) {
        var compat = document.createElement("style");
        compat.setAttribute("data-uimenuscale-compat", "");
        compat.textContent = COMPAT_CSS;
        document.head.appendChild(compat);
    }

    if (window.uiMenuScaleReanchor) {
        window.uiMenuScaleReanchor.observer.disconnect();
        window.uiMenuScaleReanchor.restore();
    }
    // Synchronous: MutationObserver callbacks run before the next render.
    var observer = new MutationObserver(onMutations);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    // Density changes resize the viewport in 1080p units: re-evaluate on the next frame.
    window.addEventListener("resize", function () { requestAnimationFrame(function () { restore(); scan(); }); });
    window.uiMenuScaleReanchor = { observer: observer, scan: scan, scanNodes: scanNodes, restore: restore };
    scan();
})();
