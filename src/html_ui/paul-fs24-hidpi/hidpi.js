// FS24 Hi-DPI UI: makes the stock menus denser on high-resolution screens.
//
// Every stock size is calc(var(--unscaledScreenHeight) * N / 1080), so at 4K everything is drawn at 2x.
// Asobo's updateScreenSize() (lib.bundle.js) computes
//     unscaledScreenHeight = window.viewportScreenHeight ?? round(vh * virtualHeight)
// and reruns on every resize and UI-scaling change. Setting window.viewportScreenHeight is therefore
// enough: all components, and the JS that measures them, lay out at the new density. The sim's own
// UI scaling option still applies on top (it multiplies --screenHeight).
(function () {
    "use strict";

    // Layout height = real height x DENSITY, never below MIN_HEIGHT (stock 1080p density).
    //   4K (2160)  -> 1620: UI at 1.5x instead of 2x
    //   1440p      -> 1080: UI at 1x instead of 1.33x
    //   1080p      -> unchanged
    // Override live (persists): localStorage["fs24hidpi.density"] = "0.8", then fs24hidpi.apply()
    var DEFAULT_DENSITY = 0.75;
    var MIN_HEIGHT = 1080;

    // Respect views that set their own viewport height (embedded or fixed-size UIs).
    if (window.viewportScreenHeight != null) return;

    function density() {
        try {
            var v = parseFloat(window.localStorage.getItem("fs24hidpi.density"));
            if (v > 0.3 && v <= 1) return v;
        } catch (e) { /* storage unavailable */ }
        return DEFAULT_DENSITY;
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

    function apply() {
        var t = target();
        if (t == null) return;
        if (window.viewportScreenHeight === t) return;
        window.viewportScreenHeight = t;
        // Asobo's listener reruns updateScreenSize() on the next frame.
        window.dispatchEvent(new Event("resize"));
    }

    // Keep the target in sync when the window or the sim resolution changes. Asobo defers its own
    // update to requestAnimationFrame, so setting the value here, synchronously, is always in time.
    function onResize() {
        var t = target();
        if (t != null) window.viewportScreenHeight = t;
    }
    window.addEventListener("resize", onResize);
    if (window.parent !== window) window.parent.addEventListener("resize", onResize);

    window.fs24hidpi = { apply: apply, density: density, naturalHeight: naturalHeight };
    apply();

    // Part 2: spread the denser layout back to the screen edges.
    var script = document.createElement("script");
    script.type = "text/javascript";
    script.src = "/paul-fs24-hidpi/reanchor.js";
    document.head.appendChild(script);
    console.log("[paul-fs24-hidpi] layout height " + window.viewportScreenHeight + " (natural " + naturalHeight() + ")");
})();
