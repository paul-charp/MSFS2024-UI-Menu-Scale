// UI Menu Scale: makes the stock menus denser on high-resolution screens.
//
// Every stock size is calc(var(--unscaledScreenHeight) * N / 1080), so at 4K everything is drawn at 2x.
// Asobo's updateScreenSize() (lib.bundle.js) computes
//     unscaledScreenHeight = window.viewportScreenHeight ?? round(vh * virtualHeight)
// and reruns on every resize and UI-scaling change. Setting window.viewportScreenHeight is therefore
// enough: all components, and the JS that measures them, lay out at the new density. The sim's own
// UI scaling option still applies on top (it multiplies --screenHeight).
(function () {
    "use strict";

    // Layout height = real height x density, never below MIN_HEIGHT (stock 1080p density).
    //   4K (2160)  -> 1620: UI at 1.5x instead of 2x
    //   1440p      -> 1080: UI at 1x instead of 1.33x
    //   1080p      -> unchanged
    // Density comes from settings.json, unless changed with the Settings slider: that
    // value is kept in the sim's data storage, shared by all views, until settings.json changes.
    var DEFAULT_DENSITY = 0.75;
    var MIN_HEIGHT = 1080;
    var STORE_KEY = "UIMENUSCALE_DENSITY";
    var SYNC_MS = 1000;

    // Respect views that set their own viewport height (embedded or fixed-size UIs).
    if (window.viewportScreenHeight != null) return;

    function valid(v) { return v > 0.3 && v <= 1; }

    var fileDensity = DEFAULT_DENSITY;

    // gSharedServices is one JS object shared by every view (localStorage isn't): the live value.
    // Asobo's data storage persists it across sessions, but only exists in the menus view (mainUi),
    // where the slider is; that view seeds the shared value when it boots.
    function dataStorage() {
        try {
            var ds = window.frameElement ? window.top.datastorage : window.datastorage;
            return ds && ds.getData ? ds : null;
        } catch (e) { return null; }
    }
    function shared() { return window.gSharedServices || null; }
    function storage() {
        return {
            get: function () {
                var sh = shared(), ds = dataStorage();
                if (sh && sh.uiMenuScaleDensity != null) return sh.uiMenuScaleDensity;
                var v = ds ? ds.getData(STORE_KEY) : null;
                if (sh && ds) sh.uiMenuScaleDensity = v || "";
                return v;
            },
            set: function (v) {
                var sh = shared(), ds = dataStorage();
                if (sh) sh.uiMenuScaleDensity = v;
                if (ds) ds.setData(STORE_KEY, v);
            },
            kind: (shared() ? "shared" : "local") + (dataStorage() ? "+datastorage" : "")
        };
    }

    // Stored as "density@fileDensity": an override set in the sim only holds while settings.json
    // still has the value it overrode, so editing the file always takes effect.
    function storedDensity() {
        var raw = String(storage().get() || "").split("@");
        var v = parseFloat(raw[0]), base = parseFloat(raw[1]);
        return valid(v) && base === fileDensity ? v : null;
    }

    function density() {
        var v = storedDensity();
        return v != null ? v : fileDensity;
    }

    // Same "natural" height Asobo computes when viewportScreenHeight is unset.
    function naturalHeight() {
        var vh = window.parent.innerHeight / window.innerHeight;
        var virtualScale = !document.body || !document.body.hasAttribute("no-virtual-scale");
        if (window.viewportRatioW) virtualScale = false;
        if (window.viewportRatioH) {
            vh /= window.viewportRatioH;
            virtualScale = false;
        }
        var w = window.innerWidth, h = window.innerHeight;
        var virtualHeight = virtualScale && w / h < 16 / 9 ? 9 * w / 16 : h;
        return Math.round(vh * virtualHeight);
    }

    function target() {
        var natural = naturalHeight();
        if (!isFinite(natural) || natural <= 0) return null;
        return Math.min(natural, Math.max(MIN_HEIGHT, Math.round(natural * density())));
    }

    var applied = null;
    function apply() {
        var d = density();
        if (d !== applied) {
            applied = d;
            window.dispatchEvent(new Event("uimenuscale-density"));
        }
        var t = target();
        if (t == null) return;
        if (window.viewportScreenHeight === t) return;
        window.viewportScreenHeight = t;
        // Asobo's listener reruns updateScreenSize() on the next frame.
        window.dispatchEvent(new Event("resize"));
    }

    // Set the density from the sim (slider); null goes back to settings.json.
    function set(v) {
        if (v != null && !valid(v)) return;
        storage().set(v == null ? "" : v + "@" + fileDensity);
        apply();
    }

    // UI scale this density gives on this screen, e.g. 1.5 on 4K at 0.75.
    function scale(d) {
        var natural = naturalHeight();
        return Math.min(natural, Math.max(MIN_HEIGHT, Math.round(natural * d))) / 1080;
    }

    // Keep the target in sync when the window or the sim resolution changes. Asobo defers its own
    // update to requestAnimationFrame, so setting the value here, synchronously, is always in time.
    function onResize() {
        var t = target();
        if (t != null) window.viewportScreenHeight = t;
    }
    window.addEventListener("resize", onResize);
    if (window.parent !== window) window.parent.addEventListener("resize", onResize);

    window.uiMenuScale = { apply: apply, set: set, density: density, scale: scale, naturalHeight: naturalHeight, storage: storage };

    // Default density: settings.json in this package. Applied once it's read, so a stored override
    // is checked against the right file value and the layout changes only once.
    function load(file) {
        var script = document.createElement("script");
        script.type = "text/javascript";
        script.charset = "utf-8";
        script.src = "/paulcharp-ui-menu-scale/" + file;
        document.head.appendChild(script);
    }
    function start() {
        apply();
        // Each view is its own JS context: pick up changes made in another view.
        setInterval(apply, SYNC_MS);
        // After the first apply, so their first pass sees the final density.
        // Part 2: spread the denser layout back to the screen edges.
        load("reanchor.js");
        // Part 3: the Settings slider, in the menus view.
        if (/\/mainUI\.html$/i.test(window.location.pathname)) load("slider.js");
    }
    var xhr = new XMLHttpRequest();
    xhr.onload = function () {
        try {
            var v = parseFloat(JSON.parse(xhr.responseText).density);
            if (valid(v)) fileDensity = v;
        } catch (e) { console.log("[ui-menu-scale] settings.json: " + e); }
        start();
    };
    xhr.onerror = start;
    xhr.open("GET", "/paulcharp-ui-menu-scale/settings.json");
    xhr.send();

    console.log("[ui-menu-scale] natural height " + naturalHeight() + ", storage " + storage().kind);
})();
