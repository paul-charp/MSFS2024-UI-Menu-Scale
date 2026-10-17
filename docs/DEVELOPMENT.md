# Development

## How it works

Every stock size is `calc(var(--unscaledScreenHeight) * N / 1080)`. Asobo's `updateScreenSize()` (`Global/lib.bundle.js`) sets that variable from `window.viewportScreenHeight` when defined, else from the real height, and reruns on every resize and UI-scaling change. `menu-scale.js` sets `window.viewportScreenHeight` to `min(height, max(1080, height x density))`, so all components and the JS that measures them lay out at the new density. The sim's own Interface Scale (`--uiScale`) still applies on top.

A denser layout alone would shrink every screen toward the centre: stock layouts are designed for a 1920×1080 frame, and at 1.5x on 4K the viewport is 2560×1440 in those units, so centre-anchored blocks drift inward while edge-anchored containers grow. `reanchor.js` fixes every centre-anchored block whose containing block grew (larger than any stock frame), against that container's recovered design size:

- blocks on one side of the centre line, or aligned with a frame edge, are pinned to that edge with the same margin;
- frame-wide blocks stretch to the full width, keeping both margins (right-anchored children keep their width);
- tall blocks crossing the centre (settings panels, lists) stretch to the full height;
- truly centred blocks (dialogs) stay centred.

Offsets are written in 1080p units, so they follow density changes. A MutationObserver applies this synchronously as pages mount, before the engine reads the layout.

Each Coherent view is a separate JS context, so the mod hooks one always-mounted component per view (see `injections.json`): `TitlePage` (menus), `Shortcut` (Esc / Select key hints and popups: the notifications view is created at startup, before Community packages mount, so the hook must be a component it creates later), `Notification_Gameplay` (notifications), `Worldmap_Pin` (world map). Panel views (toolbar, mission steps) set their own viewport height and are left alone. `build` warns if another Community mod overrides one of these components.

The script is loaded by a hidden `<img onerror>` appended to cooked components (e.g. `TitlePage`, `fs-base-ui/cookedcomps/{0CAE343C-...}.html`), copied from your local sim install at build time. Asobo files are never stored in this repo; the release zip contains the four hooked components.

## Density and storage

- `settings.json` holds the default density, read with an async XHR at startup in each view.
- A value set with the slider is stored as `density@fileDensity` under `UIMENUSCALE_DENSITY` in Asobo's `datastorage` (persistent, menus view only), and mirrored in `gSharedServices.uiMenuScaleDensity`, one object shared by every view (`localStorage` is per view). Each view re-applies once a second.
- The override only holds while `settings.json` still has the value it overrode, so editing the file always takes effect.
- `window.uiMenuScale.set(null)` from the Coherent debugger clears the override.

## Settings slider

`slider.js` (menus view only) clones a stock slider line of Settings › Accessibility › User interface and font (`OPTIONS_UI_SCALE` when a mod shows it, else Minimum Text Size or Background Opacity) into the page's `<virtual-list>`, as an extra slot after the last one, and drives the copy itself. Notes:

- the slot keeps a `slot` attribute (the `[slot]` rule positions it from `--top`);
- `Slider` has `pointer-events: none`, so the mouse goes to `Sliderelement`;
- Coherent often ends a drag with `click` and no `mouseup`, and stock handlers stop propagation: listeners use the capture phase;
- the cloned component re-initializes after the clone, resetting the fill, value, classes and style of the value box: `render()` puts them back, and runs every 500 ms;
- Coherent key events have no `.key`: use `keyCode`.

## Commands

```bash
python tools/build.py install
```

- `build`: assemble `build/paulcharp-ui-menu-scale/` from `src/`, the hooked stock components, `layout.json` and `manifest.json`. Edit `config.json` for your sim and Community paths.
- `install`: build, then junction the build into the Community folder. New files need a sim restart; edits to existing JS only need a build and a view reload.
- `uninstall`: remove the junction.
- `package`: build, then zip to `dist/paulcharp-ui-menu-scale-<version>.zip` (package folder at the root).
- `vanilla`: refresh `stock.lock.json` after a sim update. `build` warns when a hooked component changed since.

`tools/inspect_ui.py` evaluates JS in a view through the Coherent debugger (sim in Developer Mode, port 19999): `--list`, `--page N`, `--reload`, `--file`.

## Release

1. Bump `version` in `config.json` and add a `CHANGELOG.md` entry.
2. `python tools/build.py package`, install the zip in a clean Community folder and check the menus, world map and Settings line.
3. Tag `v<version>`, create a GitHub release with the zip and the changelog entry.
4. Upload the same zip to flightsim.to (description in `docs/flightsim-to.md`).

## Compatibility notes

- Mods that place elements with stylesheet rules in the stock centred frame need a compatibility rule (`COMPAT_CSS` in `reanchor.js`). Included: SimpleUI's favourites strip.
- Components used by other mods (avoid hooking them): SimpleUI `MasterPage`; //42 Flow `Startpage`, `HUD_*`, `Shortcutblock`; paul-fs24-ui `MenuBarPage`; paul-fs24-lite `BlurPage`, `Panel_Header`, `Gauge_Circular`.
