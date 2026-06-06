#!/usr/bin/env python3
"""Gera ícones do app KRONOS CENTRAL a partir do símbolo da marca.
- iOS/PWA: quadrado full-bleed (o iOS arredonda sozinho)
- Mac: squircle arredondado com margem (estilo macOS)
"""
import os
from PIL import Image, ImageDraw, ImageEnhance

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "Ativos Kronos", "simbolo_transparente_v2.png")
ICONS = os.path.join(ROOT, "www", "assets", "icons")
BUILD = os.path.join(ROOT, "build")
os.makedirs(ICONS, exist_ok=True)
os.makedirs(BUILD, exist_ok=True)

ONIX = (21, 12, 6, 255)  # #150C06
TEX_PATH = os.path.join(ROOT, "www", "assets", "areia-onix.png")  # textura de areia sobre ônix

# símbolo, recortado na bounding box do que não é transparente
sym = Image.open(SRC).convert("RGBA")
bbox = sym.getbbox()
if bbox:
    sym = sym.crop(bbox)

# textura de fundo (areia ônix)
TEX = Image.open(TEX_PATH).convert("RGBA")

def fit(sym_img, box):
    w, h = sym_img.size
    s = min(box / w, box / h)
    return sym_img.resize((max(1, int(w * s)), max(1, int(h * s))), Image.LANCZOS)

def tex_square(size):
    """Recorte central quadrado da textura, redimensionado para 'size'.
    A textura original de areia-ônix é escura demais para a granulação
    aparecer no ícone — então realçamos brilho/contraste só aqui."""
    w, h = TEX.size
    s = min(w, h)
    left, top = (w - s) // 2, (h - s) // 2
    crop = TEX.crop((left, top, left + s, top + s)).resize((size, size), Image.LANCZOS)
    crop = ImageEnhance.Brightness(crop).enhance(1.9)   # levanta a areia do preto
    crop = ImageEnhance.Contrast(crop).enhance(1.3)      # define os grãos
    return crop

def square_icon(size, sym_scale=0.66):
    canvas = tex_square(size).copy()
    s = fit(sym, int(size * sym_scale))
    canvas.alpha_composite(s, ((size - s.width) // 2, (size - s.height) // 2))
    return canvas

def rounded_icon(size, sym_scale=0.64, margin_ratio=0.10, radius_ratio=0.225):
    """Estilo macOS: textura arredondada com margem transparente."""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    margin = int(size * margin_ratio)
    inner = size - 2 * margin
    radius = int(inner * radius_ratio)
    plate = tex_square(inner).copy()
    mask = Image.new("L", (inner, inner), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, inner - 1, inner - 1], radius=radius, fill=255)
    plate.putalpha(mask)
    s = fit(sym, int(inner * sym_scale))
    plate.alpha_composite(s, ((inner - s.width) // 2, (inner - s.height) // 2))
    canvas.alpha_composite(plate, (margin, margin))
    return canvas

# ---- iOS / PWA (full-bleed) ----
square_icon(180).save(os.path.join(ICONS, "apple-touch-icon.png"))
square_icon(192).save(os.path.join(ICONS, "icon-192.png"))
square_icon(512).save(os.path.join(ICONS, "icon-512.png"))
square_icon(512, sym_scale=0.52).save(os.path.join(ICONS, "icon-maskable-512.png"))
square_icon(32).save(os.path.join(ICONS, "favicon-32.png"))

# ---- Mac (squircle) ----
mac = rounded_icon(1024)
mac.save(os.path.join(BUILD, "icon.png"))

# .icns via iconset + iconutil
import subprocess
iconset = os.path.join(BUILD, "icon.iconset")
os.makedirs(iconset, exist_ok=True)
specs = [
    (16, "16x16"), (32, "16x16@2x"), (32, "32x32"), (64, "32x32@2x"),
    (128, "128x128"), (256, "128x128@2x"), (256, "256x256"), (512, "256x256@2x"),
    (512, "512x512"), (1024, "512x512@2x"),
]
for px, name in specs:
    rounded_icon(px).save(os.path.join(iconset, f"icon_{name}.png"))
subprocess.run(["iconutil", "-c", "icns", iconset, "-o", os.path.join(BUILD, "icon.icns")], check=True)

print("OK — ícones gerados em www/assets/icons e build/")
