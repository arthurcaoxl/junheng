from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "images" / "wechat-share.jpg"
WIDTH, HEIGHT = 1200, 630
FOREST = "#071c14"
PAPER = "#f3f1e8"
ACID = "#c8ff3d"
MUTED = "#a9b3aa"
FONT = "/System/Library/Fonts/Hiragino Sans GB.ttc"
FONT_BOLD = "/System/Library/Fonts/STHeiti Medium.ttc"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_BOLD if bold else FONT, size=size)


canvas = Image.new("RGB", (WIDTH, HEIGHT), FOREST)
draw = ImageDraw.Draw(canvas)

# Keep the established brand system: forest, acid green, editorial type and product photography.
draw.rectangle((48, 42, 92, 86), fill=ACID)
draw.text((61, 48), "菌", font=font(25, True), fill=FOREST)
draw.text((110, 45), "菌衡有道", font=font(25, True), fill=PAPER)
draw.text((111, 78), "FUNGIBLEND", font=font(10), fill=MUTED)
draw.text((1020, 53), "01 / BRAND", font=font(12), fill=MUTED)

draw.text((48, 142), "餐前伴侣，", font=font(67, True), fill=PAPER)
draw.text((48, 229), "助力脂代谢", font=font(67, True), fill=PAPER)

draw.rectangle((48, 335, 742, 421), fill=ACID)
draw.text((69, 350), "23种菌菇精华 × 优质蛋白", font=font(25, True), fill=FOREST)
draw.text((69, 385), "× 复合维生素", font=font(25, True), fill=FOREST)
draw.text((50, 455), "每餐前一杯，让营养先到一步。", font=font(22), fill=PAPER)

hero = Image.open(ROOT / "public" / "images" / "hero.webp").convert("RGB")
hero = ImageOps.fit(hero, (356, 510), method=Image.Resampling.LANCZOS, centering=(0.5, 0.38))
canvas.paste(hero, (796, 62))
draw.rectangle((796, 62, 1151, 571), outline="#385044", width=1)
draw.rectangle((777, 480, 796, 531), fill=ACID)

draw.line((48, 555, 742, 555), fill="#385044", width=1)
draw.text((48, 576), "特殊膳食食品 · 运动营养食品", font=font(16), fill=MUTED)
draw.text((48, 603), "不是药品，不能代替药物。", font=font(13), fill=MUTED)

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
canvas.save(OUTPUT, format="JPEG", quality=90, optimize=True, progressive=True)
print(f"Created {OUTPUT} ({OUTPUT.stat().st_size} bytes)")
