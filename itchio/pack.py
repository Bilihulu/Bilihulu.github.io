import os, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAMES = {
    "shanhai": os.path.join(ROOT, "games", "shanhai"),
    "qingyun": os.path.join(ROOT, "games", "qingyun"),
}
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "build")
os.makedirs(OUT, exist_ok=True)

for name, src in GAMES.items():
    zippath = os.path.join(OUT, name + ".zip")
    if os.path.exists(zippath):
        os.remove(zippath)
    with zipfile.ZipFile(zippath, "w", zipfile.ZIP_DEFLATED) as z:
        for base, _, files in os.walk(src):
            for f in files:
                full = os.path.join(base, f)
                rel = os.path.relpath(full, src)  # 包内以游戏目录为根
                z.write(full, rel)
    print("built", zippath, os.path.getsize(zippath), "bytes")
