# Download Terrarium elevation tiles (AWS Terrain Tiles, open data) around Mount Rainier.
import math, os, subprocess, sys, time
from PIL import Image
import numpy as np

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

def tile_xy(lat, lon, z):
    n = 2 ** z
    x = (lon + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y

def fetch(z, x, y):
    p = f"{OUT}/{z}_{x}_{y}.png"
    urls = [f"https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png",
            f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"]
    for attempt in range(8):
        if os.path.exists(p) and open(p, "rb").read(8) == b"\x89PNG\r\n\x1a\n":
            return p
        subprocess.run(["curl", "-sS", "--retry", "3", "-o", p, urls[attempt % 2]], check=False)
        time.sleep(0.5 * attempt)
    raise RuntimeError(f"could not fetch tile {z}/{x}/{y}")

def mosaic(lat0, lon0, half_m, z):
    # bounding box in degrees
    dlat = half_m / 111320
    dlon = half_m / (111320 * math.cos(math.radians(lat0)))
    x0, y0 = tile_xy(lat0 + dlat, lon0 - dlon, z)
    x1, y1 = tile_xy(lat0 - dlat, lon0 + dlon, z)
    tx0, ty0, tx1, ty1 = int(x0), int(y0), int(x1), int(y1)
    W, H = (tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256
    img = np.zeros((H, W), dtype=np.float32)
    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            a = np.asarray(Image.open(fetch(z, tx, ty)).convert("RGB"), dtype=np.float32)
            e = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
            img[(ty - ty0) * 256:(ty - ty0 + 1) * 256, (tx - tx0) * 256:(tx - tx0 + 1) * 256] = e
    np.save(f"{OUT}/mosaic_z{z}.npy", img)
    print(f"z{z}: tiles x {tx0}-{tx1} y {ty0}-{ty1}  -> {W}x{H}")
    return img, tx0, ty0

if __name__ == "__main__":
    import json
    lat0, lon0 = 46.825, -121.750
    meta = {}
    for z, half in [(13, 11000), (10, 45000), (8, 175000)]:
        img, tx0, ty0 = mosaic(lat0, lon0, half, z)
        meta[z] = {"tx0": tx0, "ty0": ty0, "w": img.shape[1], "h": img.shape[0]}
    json.dump({"lat0": lat0, "lon0": lon0, "mosaics": meta}, open(f"{OUT}/meta.json", "w"))
