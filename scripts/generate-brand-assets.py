from __future__ import annotations

from io import BytesIO
from pathlib import Path
from shutil import copyfile
from time import sleep

try:
    from PIL import Image, ImageDraw
except ImportError as error:  # pragma: no cover - local tooling guard
    raise SystemExit(
        "Pillow is required to generate Lunumia brand derivatives."
    ) from error


ROOT = Path(__file__).resolve().parents[1]
BRAND = ROOT / "brand"
ORIGINALS = BRAND / "originals"
PUBLIC = ROOT / "public"
LANDING_PUBLIC = ROOT / "landing" / "public"
ANDROID_RES = ROOT / "android" / "app" / "src" / "main" / "res"

ICON_ORIGINAL = ORIGINALS / "lunumia-icon-approved-final.png"
MASKABLE_ORIGINAL = ORIGINALS / "lunumia-maskable-original.png"

STANDARD_MASTER = BRAND / "lunumia-symbol-1024x1024.png"
MASKABLE_MASTER = BRAND / "lunumia-maskable-1024x1024.png"

STANDARD_WEB_RASTERS = {
    PUBLIC / "favicon-16x16.png": (16, 16),
    PUBLIC / "favicon-32x32.png": (32, 32),
    PUBLIC / "icons" / "pwa-192x192.png": (192, 192),
    PUBLIC / "icons" / "pwa-512x512.png": (512, 512),
    LANDING_PUBLIC / "favicon-16x16.png": (16, 16),
    LANDING_PUBLIC / "favicon-32x32.png": (32, 32),
}

LAUNCHER_WEB_RASTERS = {
    PUBLIC / "apple-touch-icon.png": (180, 180),
    LANDING_PUBLIC / "apple-touch-icon.png": (180, 180),
}

ANDROID_DENSITIES = {
    "mdpi": (48, 108),
    "hdpi": (72, 162),
    "xhdpi": (96, 216),
    "xxhdpi": (144, 324),
    "xxxhdpi": (192, 432),
}

def require_master(path: Path) -> None:
    if not path.is_file():
        raise SystemExit(f"Missing Lunumia original asset: {path.relative_to(ROOT)}")


def load_square_master(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    if image.width != image.height or image.width < 1024:
        raise SystemExit(
            f"Official icon must be square and at least 1024px: {path.relative_to(ROOT)}"
        )
    return image


def has_official_identity(image: Image.Image) -> bool:
    """Guard against accidentally feeding the old monochrome export back in."""
    colors = image.convert("RGB").resize((256, 256)).get_flattened_data()
    dark = cyan = blue = violet = magenta = 0
    for red, green, blue_channel in colors:
        dark += max(red, green, blue_channel) < 75
        cyan += green > 145 and blue_channel > 160 and red < 95
        blue += blue_channel > 145 and 40 < green < 175 and red < 95
        violet += blue_channel > 135 and red > 65 and red > green * 1.05
        magenta += red > 140 and blue_channel > 140 and green < 105
    return min(dark, cyan, blue, violet, magenta) > 20


def resized(source: Image.Image, size: tuple[int, int]) -> Image.Image:
    return source.resize(size, Image.Resampling.LANCZOS)


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    encoded = BytesIO()
    image.save(encoded, format="PNG", optimize=True)
    data = encoded.getvalue()
    for attempt in range(5):
        try:
            path.write_bytes(data)
            return
        except OSError as error:
            # OneDrive can briefly hold a just-updated generated file. Retrying
            # keeps local regeneration deterministic without changing content.
            if error.errno != 22 or attempt == 4:
                raise
            sleep(0.05 * (attempt + 1))


def circular_icon(source: Image.Image, size: int) -> Image.Image:
    icon = resized(source, (size, size))
    scale = 4
    mask = Image.new("L", (size * scale, size * scale), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size * scale - 1, size * scale - 1), fill=255)
    icon.putalpha(mask.resize((size, size), Image.Resampling.LANCZOS))
    return icon


def sampled_navy(maskable: Image.Image) -> tuple[int, int, int, int]:
    # Android adaptive backgrounds accept a solid color. Sample it directly
    # from the official artwork instead of guessing/reconstructing a brand hue.
    return maskable.getpixel((0, 0))


def restore_brand_masters() -> None:
    copyfile(ICON_ORIGINAL, STANDARD_MASTER)
    copyfile(MASKABLE_ORIGINAL, MASKABLE_MASTER)


def write_web_rasters(
    icon: Image.Image,
    maskable: Image.Image,
) -> None:
    PUBLIC.mkdir(parents=True, exist_ok=True)
    LANDING_PUBLIC.mkdir(parents=True, exist_ok=True)
    for target, size in STANDARD_WEB_RASTERS.items():
        save_png(resized(icon, size), target)
    for target, size in LAUNCHER_WEB_RASTERS.items():
        save_png(resized(maskable, size), target)
    save_png(resized(maskable, (512, 512)), PUBLIC / "icons" / "pwa-maskable-512x512.png")


def write_android_background(maskable: Image.Image) -> None:
    red, green, blue, _ = sampled_navy(maskable)
    target = ANDROID_RES / "values" / "ic_launcher_background.xml"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<resources>\n'
        f'    <color name="ic_launcher_background">#{red:02X}{green:02X}{blue:02X}</color>\n'
        '</resources>\n',
        encoding="utf-8",
        newline="\n",
    )


def write_android_launchers(icon: Image.Image, maskable: Image.Image) -> None:
    for density, (legacy_size, foreground_size) in ANDROID_DENSITIES.items():
        directory = ANDROID_RES / f"mipmap-{density}"
        save_png(resized(icon, (legacy_size, legacy_size)), directory / "ic_launcher.png")
        save_png(circular_icon(icon, legacy_size), directory / "ic_launcher_round.png")
        # The official maskable composition is already laid out for a central
        # safe crop. Keeping the full high-resolution artwork in the adaptive
        # foreground preserves its gradient and lets Android apply the mask.
        save_png(
            resized(maskable, (foreground_size, foreground_size)),
            directory / "ic_launcher_foreground.png",
        )
    write_android_background(maskable)


def verify_dimensions() -> None:
    expected: dict[Path, tuple[int, int]] = {
        target: size for target, size in STANDARD_WEB_RASTERS.items()
    }
    expected.update(LAUNCHER_WEB_RASTERS)
    expected[PUBLIC / "icons" / "pwa-maskable-512x512.png"] = (512, 512)
    for density, (legacy_size, foreground_size) in ANDROID_DENSITIES.items():
        directory = ANDROID_RES / f"mipmap-{density}"
        expected[directory / "ic_launcher.png"] = (legacy_size, legacy_size)
        expected[directory / "ic_launcher_round.png"] = (legacy_size, legacy_size)
        expected[directory / "ic_launcher_foreground.png"] = (
            foreground_size,
            foreground_size,
        )
    for path, dimensions in expected.items():
        with Image.open(path) as generated:
            if generated.size != dimensions:
                raise SystemExit(
                    f"Unexpected dimensions for {path.relative_to(ROOT)}: "
                    f"{generated.size} != {dimensions}"
                )


def main() -> None:
    for master in (ICON_ORIGINAL, MASKABLE_ORIGINAL):
        require_master(master)

    icon = load_square_master(ICON_ORIGINAL)
    maskable = load_square_master(MASKABLE_ORIGINAL)
    for master, image in ((ICON_ORIGINAL, icon), (MASKABLE_ORIGINAL, maskable)):
        if not has_official_identity(image):
            raise SystemExit(
                f"Official cyan/blue/violet/magenta identity missing: {master.relative_to(ROOT)}"
            )

    restore_brand_masters()
    write_web_rasters(icon, maskable)
    write_android_launchers(icon, maskable)
    verify_dimensions()
    print("Lunumia approved favicon, PWA, Apple and Android icons generated and verified.")


if __name__ == "__main__":
    main()
