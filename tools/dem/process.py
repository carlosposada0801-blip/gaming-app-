import json, math, sys
import numpy as np

D = sys.argv[1]
meta = json.load(open(f"{D}/meta.json"))
LAT0, LON0 = meta["lat0"], meta["lon0"]
M_PER_DEG_LAT = 111320.0
M_PER_DEG_LON = 111320.0 * math.cos(math.radians(LAT0))
mos = {int(z): (np.load(f"{D}/mosaic_z{z}.npy"), m) for z, m in meta["mosaics"].items()}

def tile_xy(lat, lon, z):
    n = 2 ** z
    return (lon + 180) / 360 * n, (1 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) / 2 * n

def sample(lat, lon, z):
    img, m = mos[z]
    x, y = tile_xy(lat, lon, z)
    px = (x - m["tx0"]) * 256 - 0.5
    py = (y - m["ty0"]) * 256 - 0.5
    x0 = np.clip(np.floor(px).astype(int), 0, img.shape[1] - 2)
    y0 = np.clip(np.floor(py).astype(int), 0, img.shape[0] - 2)
    fx = np.clip(px - x0, 0, 1); fy = np.clip(py - y0, 0, 1)
    a = img[y0, x0]; b = img[y0, x0 + 1]; c = img[y0 + 1, x0]; d = img[y0 + 1, x0 + 1]
    return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy

def to_latlon(x, z):  # x east (m), z south (m)
    return LAT0 - z / M_PER_DEG_LAT, LON0 + x / M_PER_DEG_LON

def to_xz(lat, lon):
    return (lon - LON0) * M_PER_DEG_LON, (LAT0 - lat) * M_PER_DEG_LAT

def grid(half, n, z):
    xs = np.linspace(-half, half, n)
    X, Z = np.meshgrid(xs, xs)  # rows = z (north to south), cols = x
    lat, lon = to_latlon(X, Z)
    return sample(lat, lon, z).astype(np.float32)

if __name__ == "__main__":
    checks = {
        "Paradise (JVC)": (46.7865, -121.7353, 1646),
        "Camp Muir": (46.8355, -121.7317, 3105),
        "Columbia Crest": (46.8529, -121.7604, 4392),
        "Little Tahoma": (46.8496, -121.7130, 3415),
    }
    for name, (la, lo, want) in checks.items():
        print(f"{name:16s} DEM {float(sample(la, lo, 13)):7.0f} m   published {want} m")
    core = grid(11000, 769, 13)
    far = grid(45000, 257, 10)
    horizon = grid(175000, 385, 8)
    np.save(f"{D}/core.npy", core); np.save(f"{D}/far.npy", far); np.save(f"{D}/horizon.npy", horizon)
    print("core", core.shape, core.min(), core.max(), " far", far.shape, far.min(), far.max())
