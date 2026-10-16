"""Build tool for the paul-fs24-hidpi community package.

    python tools/build.py vanilla     refresh stock.lock.json (hash of each hooked stock component)
    python tools/build.py build       assemble build/<package>/ with the hook, layout.json, manifest.json
    python tools/build.py install     build, then junction build/<package> into the Community folder
    python tools/build.py uninstall   remove the Community junction
"""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
BUILD = ROOT / "build"
VANILLA = ROOT / "vanilla"
LOCK = ROOT / "stock.lock.json"
VANILLA_EXTS = {".html", ".css", ".js", ".json", ".svg", ".uxml", ".xml", ".ts"}
# Mirrored per package; cookedcomps/ is the compiled DOM the 2024 menus actually render.
VANILLA_DIRS = ["html_ui", "components", "cookedcomps"]
MARK_BEGIN = "<!-- paul-fs24-hidpi:begin -->"
MARK_END = "<!-- paul-fs24-hidpi:end -->"
# Seconds between 1601-01-01 (Windows FILETIME epoch) and 1970-01-01.
FILETIME_EPOCH = 11644473600


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write_json(path, data):
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def target(inj):
    """Package-relative path of the stock cooked component we override."""
    return f"cookedcomps/{{{inj['guid']}}}.html"


def stock_file(cfg, inj):
    return Path(cfg["sim_packages"]) / inj["package"] / target(inj)


def cmd_vanilla(cfg, injections):
    """Mirror stock UI text files so `git diff vanilla/` shows what each sim update changed."""
    # Asobo ships updates without bumping package_version (SU7 kept fs-base-ui at 0.1.10),
    # so `git diff vanilla/` is the only reliable change signal.
    for pkg in cfg["vanilla_packages"]:
        src = Path(cfg["sim_packages"]) / pkg
        dst = VANILLA / pkg
        if dst.exists():
            shutil.rmtree(dst)
        count = 0
        for sub in VANILLA_DIRS:
            if not (src / sub).is_dir():
                continue
            for f in (src / sub).rglob("*"):
                rel = f.relative_to(src)
                if f.is_file() and f.suffix.lower() in VANILLA_EXTS and ".vscode" not in rel.parts:
                    out = dst / rel
                    out.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(f, out)
                    count += 1
        shutil.copy2(src / "manifest.json", dst / "manifest.json")
        version = load_json(src / "manifest.json").get("package_version")
        print(f"vanilla: {pkg} {version}: {count} files")

    lock = {target(inj): sha256(stock_file(cfg, inj)) for inj in injections}
    write_json(LOCK, lock)
    print(f"vanilla: wrote {LOCK.name} ({len(lock)} targets)")


def inject(html, inj):
    """Append a hidden <img onerror> hook inside the component's root element.

    Cooked components are inserted as HTML strings, so <script> tags never run; an onerror
    handler does. It loads our boot script once per shell. Same pattern as //42 Flow and paul-fs24-ui.
    """
    if MARK_BEGIN in html:
        raise ValueError("stock file already contains our markers")
    root_end = html.rfind("</ui-resource-element>")
    if root_end < 0:
        raise ValueError("no root </ui-resource-element> in cooked component")
    hook = (
        f'{MARK_BEGIN}<svg x="0px" y="0px" width="0px" height="0px" viewBox="0 0 1 1"><foreignObject>'
        f'<img src onerror="(() => {{ if (!window.{inj['flag']}) {{ window.{inj['flag']} = true; '
        f"var s = document.createElement('script'); s.type = 'text/javascript'; s.src = '{inj['boot']}'; "
        f'document.head.appendChild(s); }} }})()"></img>'
        f"</foreignObject></svg>{MARK_END}"
    )
    return html[:root_end] + hook + html[root_end:]


def filetime(path):
    return int((path.stat().st_mtime + FILETIME_EPOCH) * 10_000_000)


def cmd_build(cfg, injections):
    pkg_dir = BUILD / cfg["package_name"]
    if pkg_dir.exists():
        shutil.rmtree(pkg_dir)
    shutil.copytree(SRC, pkg_dir)

    lock = load_json(LOCK) if LOCK.exists() else {}
    stale = []
    for inj in injections:
        stock = stock_file(cfg, inj)
        if not stock.exists():
            sys.exit(f"build: stock file missing (sim update moved it?): {stock}")
        if lock.get(target(inj)) != sha256(stock):
            stale.append(target(inj))
        out = pkg_dir / target(inj)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(inject(stock.read_text(encoding="utf-8-sig"), inj), encoding="utf-8")
        # The cooked .json (animations, exposed children) ships alongside the .html.
        shutil.copy2(stock.with_suffix(".json"), out.with_suffix(".json"))
        print(f"build: hooked {inj['component']} -> {target(inj)}")

    content = []
    for f in sorted(p for p in pkg_dir.rglob("*") if p.is_file()):
        content.append({
            "path": f.relative_to(pkg_dir).as_posix(),
            "size": f.stat().st_size,
            "date": filetime(f),
        })
    write_json(pkg_dir / "layout.json", {"content": content})

    deps = []
    for name in sorted({inj["package"] for inj in injections}):
        stock_manifest = load_json(Path(cfg["sim_packages"]) / name / "manifest.json")
        deps.append({"name": name, "package_version": stock_manifest["package_version"]})
    write_json(pkg_dir / "manifest.json", {
        "dependencies": deps,
        "content_type": "MISC",
        "title": cfg["title"],
        "manufacturer": "",
        "creator": cfg["creator"],
        "package_version": cfg["version"],
        "minimum_game_version": "1.8.16",
        "builder": "Microsoft Flight Simulator 2024",
        "package_order_hint": "",
        "release_notes": {"neutral": {"LastUpdate": time.strftime("%Y-%m-%d"), "OlderHistory": ""}},
    })
    print(f"build: {len(content)} files -> {pkg_dir}")

    # Another Community mod overriding the same cooked component wins or loses depending on load
    # order; either way one of the two mods silently stops working.
    community = Path(cfg["community"])
    if community.is_dir():
        for inj in injections:
            name = target(inj).split("/")[-1].lower()
            for other in community.iterdir():
                if other.name == cfg["package_name"]:
                    continue
                cc = other / "cookedcomps"
                if cc.is_dir() and any(f.name.lower() == name for f in cc.iterdir()):
                    print(f"build: WARNING {other.name} also overrides {inj['component']} ({name})")

    if stale:
        print("build: WARNING stock changed since the last `vanilla` snapshot:")
        for t in stale:
            print(f"  {t}")
        print("  run `python tools/build.py vanilla` after checking the component still has the same root.")


def community_link(cfg):
    return Path(cfg["community"]) / cfg["package_name"]


def cmd_install(cfg, injections):
    cmd_build(cfg, injections)
    link = community_link(cfg)
    target = BUILD / cfg["package_name"]
    if link.exists() or os.path.lexists(link):
        if not link.is_junction():
            sys.exit(f"install: {link} exists and is not our junction; remove it by hand")
        print(f"install: junction already in place: {link}")
        return
    subprocess.run(["cmd", "/c", "mklink", "/J", str(link), str(target)], check=True)
    print("install: restart the sim to pick up new files; JS edits only need a rebuild + UI reload")


def cmd_uninstall(cfg, injections):
    link = community_link(cfg)
    if not os.path.lexists(link):
        print("uninstall: nothing installed")
        return
    if not link.is_junction():
        sys.exit(f"uninstall: {link} is not a junction; refusing to delete it")
    os.rmdir(link)  # removes the junction only, never the build output
    print(f"uninstall: removed {link}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=["vanilla", "build", "install", "uninstall"])
    args = parser.parse_args()
    cfg = load_json(ROOT / "config.json")
    injections = load_json(ROOT / "injections.json")["injections"]
    globals()[f"cmd_{args.command}"](cfg, injections)


if __name__ == "__main__":
    main()
