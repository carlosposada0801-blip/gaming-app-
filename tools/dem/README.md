# Mount Rainier elevation data

`src/scene/data/rainierDem.ts` is generated from AWS Terrain Tiles (Terrarium encoding,
derived from USGS 3DEP and SRTM; open data).

```sh
pip install numpy pillow
python3 tools/dem/fetch.py   /tmp/dem          # download and stitch tiles (z13 core, z10 surroundings)
python3 tools/dem/process.py /tmp/dem          # resample to a local meter grid around 46.825 N, 121.750 W
python3 tools/dem/route.py   /tmp/dem tools/dem # snap route waypoints to their real elevations, draw hillshade.png
python3 tools/dem/export.py  /tmp/dem src/scene/data/rainierDem.ts
```
