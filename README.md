# FS24 Hi-DPI UI (`paul-fs24-hidpi`)

Makes the Microsoft Flight Simulator 2024 menus denser on high-resolution screens. No restyle: the stock UI, just not drawn at 2x on 4K.

| Screen | Stock | With the mod |
|---|---|---|
| 4K (2160p) | 2x | 1.5x |
| 1440p | 1.33x | 1x |
| 1080p | 1x | 1x (unchanged) |

## How it works

Every stock size is `calc(var(--unscaledScreenHeight) * N / 1080)`. Asobo's `updateScreenSize()` (`Global/lib.bundle.js`) sets that variable from `window.viewportScreenHeight` when defined, else from the real height, and reruns on every resize and UI-scaling change. `hidpi.js` sets `window.viewportScreenHeight` to `max(1080, height x 0.75)`, so all components and the JS that measures them lay out at the new density. The sim's own UI scaling option still applies on top.

A denser layout alone would shrink every screen toward the centre: stock layouts are designed for a 1920×1080 frame, and at 1.5x on 4K the viewport is 2560×1440 in those units, so centre-anchored blocks drift inward while edge-anchored containers grow. `reanchor.js` fixes every centre-anchored block whose containing block grew (larger than any stock frame), against that container's recovered design size:

- blocks on one side of the centre line, or aligned with a frame edge, are pinned to that edge with the same margin;
- frame-wide blocks stretch to the full width, keeping both margins (right-anchored children keep their width);
- tall blocks crossing the centre (settings panels, lists) stretch to the full height;
- truly centred blocks (dialogs) stay centred.

Offsets are written in 1080p units, so they follow density changes. A MutationObserver applies this synchronously as pages mount, before the engine reads the layout.

Each Coherent view is a separate JS context, so the mod hooks one always-mounted component per view (see `injections.json`): `TitlePage` (menus), `Shortcut` (Esc / Select key hints and popups: the notifications view is created at startup, before Community packages mount, so the hook must be a component it creates later), `Notification_Gameplay` (notifications), `Worldmap_Pin` (world map). Panel views (toolbar, mission steps) set their own viewport height and are left alone. `build` warns if another Community mod overrides one of these components.

The script is loaded by a hidden `<img onerror>` appended to cooked components (e.g. `TitlePage`, `fs-base-ui/cookedcomps/{0CAE343C-...}.html`), copied from your local sim install at build time. Asobo files are never stored in this repo.

## Tuning

Density defaults to 0.75. Change it live (Devmode, Coherent inspector on `localhost:19999`):

```bash
python tools/inspect_ui.py "localStorage['fs24hidpi.density'] = '0.8'; fs24hidpi.apply()"
```

The value persists if Coherent keeps `localStorage`; otherwise edit `DEFAULT_DENSITY` in `src/html_ui/paul-fs24-hidpi/hidpi.js`.

## Commands

```bash
python tools/build.py install
```

`install` builds and junctions `build/paul-fs24-hidpi` into the Community folder; later `build`s are live after a sim restart. `uninstall` removes the junction. After a sim update, `build` warns if the hooked component changed.

## Limits

- Re-anchoring is a heuristic over the stock layout; a page with an unusual structure may need an exception.
- Mods that place elements with stylesheet rules in the stock centred frame need a compatibility rule (`COMPAT_CSS` in `reanchor.js`). Included: SimpleUI's favourites strip.
- The toolbar, in-game panels and the EFB keep stock size.
- Two mods overriding the same cooked component conflict. This one uses `TitlePage`, `Shortcut`, `Notification_Gameplay` and `Worldmap_Pin`; paul-fs24-ui uses `MenuBarPage`; SimpleUI uses `MasterPage`; //42 Flow uses `Startpage`, `HUD_*` and `Shortcutblock`.
