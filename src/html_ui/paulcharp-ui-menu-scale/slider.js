// UI Menu Scale, part 3: a "Menu Scale" slider in Settings > Accessibility > User interface and
// font, under the stock lines.
//
// Setting lines are built at runtime from the settings model into a <virtual-list> (absolute slots
// positioned from --top by a [slot] rule). The stock line isn't wired to anything reusable, so this
// clones a slider slot of that section (Interface Scale when shown) as an extra slot after the last one and drives the copy itself:
// click or drag on the bar, mouse wheel, Left / Right while hovered. Gamepad focus doesn't reach it.
// The density is applied on release (the whole UI lays out again).
(function () {
    "use strict";
    // Slider lines of this section, in order of preference: the sim hides Interface Scale in some
    // contexts (Settings opened from the world map).
    var KEYS = ["OPTIONS_UI_SCALE", "OPTIONS_UI_MIN_TEXT_SIZE", "OPTIONS_UI_BACKGROUNDS_OPACITY"];
    var MARK = "data-uimenuscale-slider";
    var MIN = 0.5, MAX = 1, STEP = 0.05;
    // The menus view exposes no language code, and Community .locPak files aren't loaded there: the
    // language is recognized from how the sim translates two stock words (fs-base .locPak files).
    // [locale, label, MENU.SEARCH, MENU.EXIT]
    var LABELS = [
        ["en-US", "Menu Scale", "Search", "Exit"],
        ["fr-FR", "Échelle des menus", "Recherche", "Sortie"],
        ["de-DE", "Menüskalierung", "Suche", "Verlassen"],
        ["es-ES", "Escala de los menús", "Buscar", "Salir"],
        ["es-MX", "Escala de los menús", "Buscar", "Salir"],
        ["it-IT", "Scala dei menu", "Cerca", "Esci"],
        ["pt-BR", "Escala dos menus", "Pesquisar", "Sair"],
        ["pt-PT", "Escala dos menus", "Pesquisar", "Sair"],
        ["nl-NL", "Menuschaal", "Zoeken", "Uitgang"],
        ["pl-PL", "Skala menu", "Szukaj", "Wyjście"],
        ["ru-RU", "Масштаб меню", "Поиск", "Выход"],
        ["sv-SE", "Menyskala", "Sök", "Avsluta"],
        ["nb-NO", "Menyskala", "Søk", "Utgang"],
        ["fi-FI", "Valikoiden skaalaus", "Haku", "Poistu"],
        ["tr-TR", "Menü ölçeği", "Ara", "Çıkış"],
        ["ja-JP", "メニューのスケール", "検索", "終了"],
        ["ko-KR", "메뉴 배율", "검색", "나가기"],
        ["zh-CN", "菜单缩放", "搜索", "退出"]
    ];

    function label() {
        var loc = window.top.g_localization, text = LABELS[0][1];
        if (loc) {
            var search = loc.Translate("TT:MENU.SEARCH"), exit = loc.Translate("TT:MENU.EXIT");
            for (var i = 0; i < LABELS.length; i++) {
                if (LABELS[i][2] === search || LABELS[i][3] === exit) { text = LABELS[i][1]; break; }
            }
        }
        return text + " (mod)";
    }

    function clamp(d) { return Math.min(MAX, Math.max(MIN, Math.round(d / STEP) * STEP)); }
    function q(root, name) { return root.querySelector("[name=" + name + "]"); }

    // The one slot on screen (the list rebuilds it on page and tab changes) and its state.
    var slot = null, value = 0, dragging = false, hovered = false;
    // The label's text node, redrawn when the sim language changes.
    var labelEl = null;
    // The value box's classes and inline style (position, font size following the density); the cloned
    // component resets them when it initializes.
    var inputStyle = "", inputClass = "";
    // Each slot ends with a Separator line, hidden (.hide) in the last one. Ours is the last now: the
    // stock slot before it shows its line, ours doesn't. The list may hide it again when it refreshes
    // a slot, so render() puts it back.
    var shownSep = null;

    function separator(s) {
        for (var i = s.children.length - 1; i >= 0; i--) {
            if (s.children[i].getAttribute("separator") === "true") return s.children[i];
        }
        return null;
    }
    function separate(list) {
        var last = null, top = -Infinity;
        for (var i = 0; i < list.children.length; i++) {
            var c = list.children[i];
            if (c === slot || c.style.display === "none") continue;
            var t = parseFloat(c.style.getPropertyValue("--top"));
            if (isFinite(t) && t > top) { last = c; top = t; }
        }
        var mine = separator(slot), theirs = last && separator(last);
        if (mine && !mine.classList.contains("hide")) mine.classList.add("hide");
        if (theirs && theirs.classList.contains("hide")) { theirs.classList.remove("hide"); shownSep = theirs; }
    }

    function render() {
        if (!slot) return;
        if (slot.parentNode) separate(slot.parentNode);
        var text = label();
        if (labelEl && labelEl.textContent !== text) labelEl.textContent = text;
        q(slot, "ActiveSliderContainer").style.width = (value - MIN) / (MAX - MIN) * 100 + "%";
        var input = slot.querySelector("input");
        if (!input) return;
        if (inputStyle && input.getAttribute("style") !== inputStyle) input.setAttribute("style", inputStyle);
        if (inputClass && input.className !== inputClass) input.className = inputClass;
        input.value = uiMenuScale.scale(value).toFixed(2).replace(/0$/, "") + "x";
    }
    function sync() { if (!dragging) { value = uiMenuScale.density(); render(); } }
    function commit(v) { value = clamp(v); render(); uiMenuScale.set(value); }
    function at(e) {
        var r = q(slot, "Slider").getBoundingClientRect();
        return clamp(MIN + (e.clientX - r.left) / r.width * (MAX - MIN));
    }

    function build(stock, list) {
        var s = stock.cloneNode(true);
        s.setAttribute(MARK, "");
        s.setAttribute("slot", "99");
        s.style.setProperty("--slot", "99");
        // After the last slot, same spacing as the stock slots.
        var tops = [].map.call(list.children, function (c) { return parseFloat(c.style.getPropertyValue("--top")); })
            .filter(isFinite).sort(function (a, b) { return a - b; });
        var gap = tops.length > 1 ? tops[1] - tops[0] : 43.5;
        s.style.setProperty("--top", tops[tops.length - 1] + gap + "px");

        var text = s.querySelector("text-marquee[name=Text]");
        text.removeAttribute("data-text");
        labelEl = text.querySelector(".marquee__content span") || text;
        labelEl.textContent = label();
        var input = s.querySelector("input");
        inputStyle = input && input.getAttribute("style") || "";
        inputClass = input && input.className || "";
        if (input) { input.readOnly = true; input.setAttribute("tabindex", "-1"); }

        // The bar itself has pointer-events: none; its parent gets the mouse.
        q(s, "Sliderelement").addEventListener("mousedown", function (e) {
            dragging = true; value = at(e); render(); e.stopPropagation(); e.preventDefault();
        });
        s.addEventListener("wheel", function (e) { commit(value + (e.deltaY < 0 ? STEP : -STEP)); e.preventDefault(); e.stopPropagation(); });
        s.addEventListener("mouseenter", function () { hovered = true; });
        s.addEventListener("mouseleave", function () { hovered = false; });

        list.appendChild(s);
        slot = s;
        hovered = false;
        sync();
    }

    // Lists holding one of the KEYS lines: one native query per list instead of a walk of its slots
    // (check runs every frame while the DOM changes, e.g. hover effects).
    var KEY_SELECTOR = KEYS.map(function (k) { return "text-marquee[data-text$='." + k + "']"; }).join(",");

    function check() {
        var lists = document.querySelectorAll("virtual-list");
        var found = false;
        for (var i = 0; i < lists.length; i++) {
            var list = lists[i], stock = null, rank = KEYS.length, mine = null;
            if (!list.querySelector(KEY_SELECTOR) && !list.querySelector("[" + MARK + "]")) continue;
            for (var j = 0; j < list.children.length; j++) {
                var c = list.children[j];
                if (c.hasAttribute(MARK)) { mine = c; continue; }
                if (c.style.display === "none" || !q(c, "Sliderelement")) continue;
                var t = c.querySelector("text-marquee[name=Text]");
                var r = KEYS.indexOf((t && t.getAttribute("data-text") || "").split(".").pop());
                if (r >= 0 && r < rank) { stock = c; rank = r; }
            }
            if (stock && !mine) build(stock, list);
            else if (!stock && mine) {
                list.removeChild(mine);
                if (shownSep && list.contains(shownSep)) shownSep.classList.add("hide");
                shownSep = null;
            }
            if (stock) found = true;
        }
        if (!found) slot = null;
    }

    // Capture phase: stock handlers stop mouse events, and Coherent often ends a drag with click
    // and no mouseup.
    function release() { if (dragging) { dragging = false; commit(value); } }
    document.addEventListener("mousemove", function (e) { if (dragging && slot) { value = at(e); render(); } }, true);
    document.addEventListener("mouseup", release, true);
    document.addEventListener("click", release, true);
    window.addEventListener("keydown", function (e) {
        if (!slot || !hovered) return;
        if (e.keyCode === 37) commit(value - STEP);
        else if (e.keyCode === 39) commit(value + STEP);
        else return;
        e.preventDefault();
        e.stopPropagation();
    }, true);
    // Other views, settings.json.
    window.addEventListener("uimenuscale-density", sync);
    // The cloned slider component finishes initializing after the clone and resets its fill and
    // value: draw again shortly after.
    setInterval(sync, 500);

    var pending = false;
    new MutationObserver(function () {
        if (pending) return;
        pending = true;
        requestAnimationFrame(function () { pending = false; check(); });
    }).observe(document.documentElement, { childList: true, subtree: true });
    window.uiMenuScaleSlider = { check: check };
    check();
})();
