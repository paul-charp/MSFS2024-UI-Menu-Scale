"""Render the flightsim.to cover from docs/render/cover.html with headless Edge. Needs Pillow.

    python docs/render_cover.py

Writes docs/images/cover.jpg (1920x1080).
"""
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PAGE = ROOT / "docs" / "render" / "cover.html"
OUT = ROOT / "docs" / "images" / "cover.jpg"
EDGE = [
    Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
    Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
]


def edge():
    for p in EDGE:
        if p.exists():
            return str(p)
    found = shutil.which("msedge")
    if not found:
        sys.exit("render: Microsoft Edge not found")
    return found


def main():
    with tempfile.TemporaryDirectory() as tmp:
        png = Path(tmp) / "shot.png"
        subprocess.run([
            edge(), "--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
            f"--user-data-dir={Path(tmp) / 'profile'}", "--window-size=1920,1080", "--force-device-scale-factor=1",
            "--virtual-time-budget=4000", f"--screenshot={png}", PAGE.as_uri(),
        ], check=True, capture_output=True)
        Image.open(png).convert("RGB").save(OUT, quality=92, optimize=True)
    print(f"render: {OUT.relative_to(ROOT)} 1920x1080")


if __name__ == "__main__":
    main()
