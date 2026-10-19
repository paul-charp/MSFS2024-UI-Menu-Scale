# Agent notes

MSFS 2024 Community mod that draws the stock menus at a denser scale. How it works, storage, setup and release: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). Read it before changing `src/`.

## Layout

- `src/html_ui/paulcharp-ui-menu-scale/`: the mod (`menu-scale.js` boot, `reanchor.js`, `slider.js`, `settings.json`).
- `injections.json`: which stock cooked components get the boot hook.
- `tools/build.py`: `build`, `install`, `uninstall`, `package`, `vanilla`. Python 3.12+, stdlib only.
- `tools/inspect_ui.py`: run JS in a live view (sim in Developer Mode, port 19999). `tools/checks/audit.js` is a layout audit to run through it.

## Rules

- Never commit Asobo files. Stock components are copied from the local sim install at build time; `build/` and `dist/` are gitignored.
- No machine paths in `config.json`. Local overrides go in `config.local.json` (gitignored).
- Identifiers use the `uimenuscale` / `uiMenuScale` / `ui-menu-scale` prefix; the package folder is `paulcharp-ui-menu-scale`.
- Code runs in Coherent GT, not a browser: ES5-style JS, no `.key` on key events (use `keyCode`), drags may end with `click` and no `mouseup` (listen in the capture phase). Each view is its own JS context; `gSharedServices` is shared, `datastorage` exists in the menus view only.
- Don't hook components other mods override (list in DEVELOPMENT.md › Compatibility notes).
- Changelog entries list what changed, not why.

## Testing

- `python tools/build.py install` once, then a sim restart for new files. Edits to existing JS: `build`, then `python tools/inspect_ui.py --page N --reload` (`--list` shows the pages; menus is usually 2). Popups such as Settings › Graphics › Advanced Settings live in the notifications view (usually 3): views not reloaded keep running the old script until a sim restart.
- `window.uiMenuScale.set(d)` / `set(null)` changes or clears the density live.
- If port 19999 times out with the sim closed, an orphan `TechLogStarter.exe` may still hold it.
- Check menus, world map, notifications and the Settings line, with and without SimpleUI.
