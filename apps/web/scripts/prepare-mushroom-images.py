"""Prepare local, square WebP mushroom photography without altering source files.

Sources and licenses (Wikimedia Commons):
- hericium: Hericium_erinaceus_104664221.jpg, Becky, CC0 1.0
- enoki: Enoki_mushroom.jpg, Mitrofresh, CC BY-SA
- bamboo-fungus: Phallus_indusiatus.jpg, Jorge Ochoa, CC BY-SA
- morel: Morchella_esculenta_36771717.jpg, Tom Zucker-Scharff, CC BY 4.0
- reishi: Ganoderma_lucidum_01.jpg, Eric Steinert, CC BY-SA 3.0
- cordyceps: Cordyceps_Militaris.jpg, mushroomclinicaltrials.com, CC BY 2.0
- maitake: Grifola_frondosa_2014_G1.jpg, George Chernilevsky, public domain
- truffle: Tuber_melanosporum_-_trufa_negra,_Ágreda,_España.jpg, Diego Delso, CC BY-SA 3.0

Source pages use https://commons.wikimedia.org/wiki/File:<filename>.
Images are center-cropped and resized; source photography remains unchanged.
"""

from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT.parent / "reference-assets" / "mushroom-sources"
OUTPUT = ROOT / "public" / "images" / "mushrooms"
EXPECTED = {
    "hericium", "enoki", "bamboo-fungus", "morel",
    "reishi", "cordyceps", "maitake", "truffle",
}

OUTPUT.mkdir(parents=True, exist_ok=True)
available = {path.stem for path in SOURCES.glob("*.jpg")}
missing = EXPECTED - available
if missing:
    raise SystemExit(f"Missing source images: {', '.join(sorted(missing))}")

for name in sorted(EXPECTED):
    with Image.open(SOURCES / f"{name}.jpg") as source:
        image = ImageOps.exif_transpose(source).convert("RGB")
        image = ImageOps.fit(image, (1200, 1200), Image.Resampling.LANCZOS)
        image.save(OUTPUT / f"{name}.webp", "WEBP", quality=84, method=6)
        print(f"Prepared {name}.webp")
