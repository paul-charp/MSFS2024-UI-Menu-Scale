// Layout audit for the current view: what reanchor.js changed, and visible named elements that
// end up outside the screen. Run: python tools/inspect_ui.py [--page N] --file tools/checks/audit.js
(function () {
    var W = innerWidth, H = innerHeight, out = [];
    out.push("pages: " + [].map.call(document.querySelectorAll("ui-resource-element[resource-path*=page]"),
        function (e) { return e.getAttribute("name"); }).join(","));
    out.push("layout " + window.viewportScreenHeight + ", reanchor " + (window.fs24hidpiReanchor ? "on" : "off"));
    function visible(e) {
        for (var a = e; a && a.nodeType === 1; a = a.parentElement) {
            var cs = getComputedStyle(a);
            if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.02) return false;
        }
        return true;
    }
    function clipped(e) {   // inside a scroller or overflow:hidden ancestor: off-screen is expected
        for (var a = e.parentElement; a && a !== document.body; a = a.parentElement) {
            var cs = getComputedStyle(a);
            if (/hidden|scroll|auto/.test(cs.overflow + cs.overflowX + cs.overflowY)) return true;
        }
        return false;
    }
    var changed = [], outside = [];
    [].forEach.call(document.querySelectorAll("[data-fs24hidpi]"), function (e) {
        var m = e.getAttribute("data-fs24hidpi");
        if (m === "-" || m === "kept") return;
        var r = e.getBoundingClientRect();
        changed.push(e.getAttribute("name") + " " + m + " [" + [r.left, r.top, r.width, r.height].map(Math.round) + "]");
    });
    [].forEach.call(document.querySelectorAll("[name]"), function (e) {
        var r = e.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) return;
        if (r.left > -4 && r.top > -4 && r.right < W + 4 && r.bottom < H + 4) return;
        if (r.right <= 0 || r.bottom <= 0 || r.left >= W || r.top >= H) {
            // fully off-screen: only report if it is a layout block (has anchors) and not scrolled away
            if (!/-anchor/.test(e.getAttribute("style") || "")) return;
        }
        if (!visible(e) || clipped(e)) return;
        outside.push(e.getAttribute("name") + " [" + [r.left, r.top, r.width, r.height].map(Math.round) + "]");
    });
    out.push("changed (" + changed.length + "):");
    [].push.apply(out, changed.slice(0, 40));
    out.push("OUTSIDE the screen (" + outside.length + "):");
    [].push.apply(out, outside.slice(0, 40));
    return out.join("\n");
})()
