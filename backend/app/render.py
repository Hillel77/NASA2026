"""Server-side rendering of global layers as equirectangular RGBA PNGs (1440×720, 0.25°)."""
from __future__ import annotations

import io

import numpy as np
from PIL import Image

from .data.grid import NLAT, NLON
from .scoring.engine import CONSTRAINT_INFO, ST_EXCLUDED, ST_FLAGGED, ST_NODATA, ST_OK

# Red → yellow → green compatibility ramp (score 0..100)
RYG = [(0, (165, 30, 40)), (30, (215, 75, 45)), (50, (235, 185, 55)), (70, (150, 195, 70)), (100, (20, 140, 75))]
# Sequential ramp for confidence (0..100)
CONF = [(0, (40, 20, 60)), (40, (70, 70, 150)), (70, (60, 150, 190)), (100, (210, 245, 250))]
# Viridis-like ramp for raw data layers
VIRIDIS = [(0, (68, 1, 84)), (25, (59, 82, 139)), (50, (33, 145, 140)), (75, (94, 201, 98)), (100, (253, 231, 37))]
GREY = (95, 100, 112)

CONSTRAINT_COLORS = {
    1: (230, 85, 13), 2: (253, 174, 107), 4: (158, 154, 200), 8: (117, 107, 177),
    16: (49, 130, 189), 32: (214, 39, 40), 64: (140, 86, 75), 128: (44, 160, 44), 256: (200, 200, 255),
}


def ramp(values: np.ndarray, stops) -> np.ndarray:
    xs = np.array([s[0] for s in stops], np.float32)
    cols = np.array([s[1] for s in stops], np.float32)
    v = np.clip(values, xs[0], xs[-1])
    out = np.zeros(values.shape + (3,), np.float32)
    for ch in range(3):
        out[..., ch] = np.interp(v, xs, cols[:, ch])
    return out


def to_png(rgba: np.ndarray) -> bytes:
    buf = io.BytesIO()
    Image.fromarray(rgba.reshape(NLAT, NLON, 4).astype(np.uint8), "RGBA").save(buf, "PNG", optimize=False, compress_level=3)
    return buf.getvalue()


def render_score(values: np.ndarray, status: np.ndarray, alpha=215, stops=RYG, show_flagged=True) -> bytes:
    rgba = np.zeros((values.size, 4), np.float32)
    ok = (status == ST_OK) & np.isfinite(values)
    rgba[ok, :3] = ramp(values[ok], stops)
    rgba[ok, 3] = alpha
    fl = (status == ST_FLAGGED) & np.isfinite(values)
    if show_flagged and fl.any():
        # flagged cells: score colour mixed 50% with grey, so they never read as a clean "green"
        rgba[fl, :3] = 0.5 * ramp(values[fl], stops) + 0.5 * np.array(GREY)
        rgba[fl, 3] = alpha
    grey = (status == ST_NODATA) | (status == ST_EXCLUDED) | ((status == ST_OK) & ~np.isfinite(values))
    rgba[grey, :3] = GREY
    rgba[grey, 3] = 185
    return to_png(rgba)


def render_constraints(fails: np.ndarray, status: np.ndarray) -> bytes:
    rgba = np.zeros((fails.size, 4), np.float32)
    land = status > 0
    passing = land & (fails == 0) & (status != ST_NODATA)
    rgba[passing] = (40, 160, 90, 110)
    for bit in sorted(CONSTRAINT_INFO):     # lowest bit wins the colour where several fail
        m = land & (fails & bit).astype(bool) & (rgba[:, 3] < 200)
        rgba[m, :3] = CONSTRAINT_COLORS[bit]
        rgba[m, 3] = 210
    nod = status == ST_NODATA
    rgba[nod] = (*GREY, 150)
    return to_png(rgba)


def render_data(values: np.ndarray, vmin: float, vmax: float, log=False) -> bytes:
    rgba = np.zeros((values.size, 4), np.float32)
    ok = np.isfinite(values)
    v = values[ok]
    if log:
        v = np.log10(np.maximum(v, 1e-6))
        vmin, vmax = np.log10(max(vmin, 1e-6)), np.log10(max(vmax, 1e-6))
    t = (v - vmin) / max(vmax - vmin, 1e-9) * 100
    rgba[ok, :3] = ramp(t, VIRIDIS)
    rgba[ok, 3] = 215
    return to_png(rgba)
