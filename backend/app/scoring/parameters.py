"""
Parameter catalogue.

Each parameter defines
  * which Earth layer(s) it uses and what that quantity physically is,
  * the similarity function and its default tolerance,
  * the data-quality factor q used by the confidence model
        measured / satellite        q = 1.0
        reanalysis (MERRA-2, CERES) q = 0.9
        modelled from measurements  q = 0.7
        proxy index                 q = 0.4
  * the terrestrial *reproducibility class* of the condition:
        direct      – reproducible outdoors at a field site
        partial     – only partially reproducible outdoors
        laboratory  – needs a laboratory facility (vacuum/thermal chamber, beam line ...)
        impossible  – cannot be realistically reproduced on Earth for sustained periods
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

import numpy as np

from . import similarity as sim

SRC = {
    "power_merra2": {
        "name": "NASA POWER v10 – MERRA-2 meteorology (monthly climatology 2001-2020)",
        "url": "https://power.larc.nasa.gov/ (AWS Open Data: s3://nasa-power)",
        "resolution": "0.5° × 0.625° (~55 km)", "period": "2001–2020",
    },
    "power_ceres": {
        "name": "NASA POWER v10 – CERES SYN1deg solar (monthly climatology 2001-2020)",
        "url": "https://power.larc.nasa.gov/ (AWS Open Data: s3://nasa-power)",
        "resolution": "1° × 1° (~110 km)", "period": "2001–2020",
    },
    "dem": {
        "name": "AWS Terrain Tiles (Mapzen terrarium; SRTM, GMTED2010, ETOPO1 mosaic)",
        "url": "https://registry.opendata.aws/terrain-tiles/",
        "resolution": "zoom-6 pixels (~2.4 km at equator) aggregated to 0.25°", "period": "SRTM 2000 / GMTED2010",
    },
    "worldcover": {
        "name": "ESA WorldCover 10 m v200",
        "url": "https://esa-worldcover.org (AWS Open Data: s3://esa-worldcover)",
        "resolution": "10 m map read at 1:64 overview (~640 m), aggregated to 0.25°", "period": "2021",
    },
    "naturalearth": {
        "name": "Natural Earth 1:10m cultural vectors (roads, populated places, US protected lands)",
        "url": "https://www.naturalearthdata.com/", "resolution": "1:10,000,000", "period": "v5.1",
    },
    "derived": {
        "name": "Derived in TerraNova from the layers above (see method)", "url": "",
        "resolution": "inherits coarsest input", "period": "",
    },
    "constant": {"name": "Physical constant / global value (no spatial variation on Earth)", "url": "",
                 "resolution": "n/a", "period": ""},
}


@dataclass
class Param:
    key: str
    label: str
    category: str               # temperature | solar | terrain | geology | atmosphere | water | logistics | nonrepro
    unit: str
    description: str
    method: str
    source: str
    quality: str                # measured | reanalysis | modelled | proxy | constant
    repro: str                  # direct | partial | laboratory | impossible
    kind: str                   # gaussian | log_gaussian | pair | daylight | slope_hist | pref | binary_ok
    tolerance: float            # default sigma (units of the parameter, or ln-units for log_gaussian)
    tolerance_label: str = ""
    layers: tuple = ()
    default_enabled: bool = True
    extra: dict = field(default_factory=dict)

    @property
    def q(self) -> float:
        return {"measured": 1.0, "reanalysis": 0.9, "modelled": 0.7, "proxy": 0.4, "constant": 1.0}[self.quality]


P: list[Param] = [
    # ------------------------------------------------------------------ temperature
    Param("temp_mean", "Average surface temperature", "temperature", "°C",
          "Annual mean land-surface (skin) temperature, the quantity planetary thermal radiometers measure.",
          "Gaussian similarity on NASA POWER TS (MERRA-2 earth skin temperature), annual climatology.",
          "power_merra2", "reanalysis", "partial", "gaussian", 15.0, "σ (°C)", ("TS",)),
    Param("temp_daily", "Daily temperature variation", "temperature", "°C",
          "Mean diurnal range of surface skin temperature. Lunar (~285 K) and Martian (~80 K) ranges exceed any natural Earth site.",
          "Gaussian similarity on POWER TS_RANGE (mean daily max−min skin temperature).",
          "power_merra2", "reanalysis", "partial", "gaussian", 30.0, "σ (°C)", ("TS_RANGE",)),
    Param("temp_seasonal", "Seasonal temperature variation", "temperature", "°C",
          "Difference between warmest and coldest monthly mean 2 m air temperature.",
          "max(month T2M) − min(month T2M) from POWER monthly climatology; Gaussian similarity.",
          "power_merra2", "reanalysis", "partial", "gaussian", 15.0, "σ (°C)", ("T2M_SEASONAL_RANGE",)),
    Param("temp_extremes", "Temperature extremes", "temperature", "°C",
          "Coldest and hottest surface temperature in the 2001–2020 climatology (both must match).",
          "Geometric mean of Gaussian similarities of TS_MIN and TS_MAX vs target min/max.",
          "power_merra2", "reanalysis", "partial", "pair", 30.0, "σ (°C)", ("TS_MIN", "TS_MAX")),
    # ------------------------------------------------------------------ solar
    Param("solar_irradiance", "Solar irradiation", "solar", "W/m²",
          "24-hour mean all-sky shortwave irradiance on a horizontal surface.",
          "Gaussian similarity on POWER ALLSKY_SFC_SW_DWN (CERES SYN1deg) annual climatology.",
          "power_ceres", "reanalysis", "partial", "gaussian", 60.0, "σ (W/m²)", ("ALLSKY_SFC_SW_DWN",)),
    Param("daylight", "Daylight duration", "solar", "fraction of day",
          "Illuminated fraction of the day–night cycle, shortest and longest month. Captures polar-day/polar-night regimes.",
          "POWER DAY_HOURS monthly → min/max fraction of 24 h; mean of Gaussian similarities for min and max.",
          "power_ceres", "reanalysis", "partial", "daylight", 0.12, "σ (fraction)", ("DAYLIGHT_FRAC_MIN", "DAYLIGHT_FRAC_MAX")),
    Param("solar_energy", "Solar energy availability", "solar", "clearness index",
          "Fraction of top-of-atmosphere sunlight reaching the ground (all-sky clearness index). Moon = 1, Mars ≈ 0.6–0.75.",
          "Gaussian similarity on POWER ALLSKY_KT annual climatology.",
          "power_ceres", "reanalysis", "partial", "gaussian", 0.12, "σ", ("ALLSKY_KT",)),
    # ------------------------------------------------------------------ terrain
    Param("elevation", "Terrain elevation (relief distribution)", "terrain", "m",
          "Standard deviation of elevation inside each 0.25° cell: the spread of the elevation distribution, not the mean altitude (planetary datums are not comparable to sea level).",
          "Log-Gaussian similarity of within-cell elevation std-dev (AWS Terrain Tiles, ~2.4 km pixels).",
          "dem", "measured", "direct", "log_gaussian", 0.8, "σ (ln units)", ("elev_std",)),
    Param("slope", "Terrain slope", "terrain", "°",
          "Full distribution of km-scale slopes inside the cell compared with the target slope distribution.",
          "Bhattacharyya coefficient between the 9-bin Earth slope histogram and a log-normal target distribution built from published median & 90th-percentile slopes. NOTE: slope depends on baseline (here ~2.4 km).",
          "dem", "measured", "direct", "slope_hist", 0.0, "", ("slope_p50", "slope_p90")),
    Param("roughness", "Terrain roughness", "terrain", "m",
          "Mean absolute deviation of each DEM pixel from its 3×3 neighbourhood mean (km-scale topographic roughness).",
          "Log-Gaussian similarity; target values are order-of-magnitude estimates from LOLA/MOLA roughness maps.",
          "dem", "measured", "direct", "log_gaussian", 0.8, "σ (ln units)", ("rough_m",)),
    # ------------------------------------------------------------------ geology
    Param("composition", "Surface geological composition", "geology", "fraction",
          "Fraction of the cell mapped as bare / sparsely vegetated mineral surface. Lithology (e.g. basalt vs. granite) is NOT globally available in this build.",
          "Gaussian similarity of ESA WorldCover 'bare/sparse vegetation' fraction to 1.0 (fully mineral surface).",
          "worldcover", "measured", "direct", "gaussian", 0.25, "σ", ("lc_bare",)),
    Param("rock", "Rock abundance", "geology", "index 0–1",
          "PROXY: bare-ground fraction × km-scale roughness (rough_m/30 m, capped at 1). No global measured rock-cover map for Earth exists in open data.",
          "Gaussian similarity of the proxy index to a target index derived from Diviner/THEMIS rock abundance classes.",
          "derived", "proxy", "direct", "gaussian", 0.25, "σ", ("ROCK_INDEX",)),
    Param("soil", "Soil characteristics", "geology", "index 0–1",
          "PROXY for dry, unconsolidated, regolith-like soil: bare fraction × (1 − aridity index/0.2). Grain size and chemistry (e.g. perchlorates) are NOT represented.",
          "Gaussian similarity of the proxy index to the target index. Use the live SoilGrids lookup in the detail view for texture.",
          "derived", "proxy", "partial", "gaussian", 0.25, "σ", ("SOIL_INDEX",)),
    Param("dust", "Dust characteristics", "geology", "AOD 550 nm",
          "Atmospheric aerosol optical depth – a measure of suspended dust load (Mars typical τ ≈ 0.5; Moon 0).",
          "Gaussian similarity on POWER AOD_55_ADJ (MERRA-2 aerosol optical depth) annual climatology.",
          "power_ceres", "reanalysis", "partial", "gaussian", 0.2, "σ", ("AOD_55_ADJ",)),
    # ------------------------------------------------------------------ atmosphere
    Param("wind", "Wind speed", "atmosphere", "m/s",
          "Annual mean 10 m wind speed.",
          "Gaussian similarity on POWER WS10M.", "power_merra2", "reanalysis", "partial", "gaussian", 3.0, "σ (m/s)", ("WS10M",)),
    Param("precipitation", "Precipitation", "water", "mm/day",
          "Annual mean bias-corrected precipitation. Target bodies have none.",
          "Gaussian similarity on POWER PRECTOTCORR.", "power_merra2", "reanalysis", "direct", "gaussian", 0.5, "σ (mm/day)", ("PRECTOTCORR",)),
    Param("humidity", "Humidity", "water", "g/kg",
          "Annual mean 2 m specific humidity (absolute water-vapour content, not relative humidity).",
          "Gaussian similarity on POWER QV2M.", "power_merra2", "reanalysis", "partial", "gaussian", 2.0, "σ (g/kg)", ("QV2M",)),
    Param("aridity", "Aridity", "water", "P/PET",
          "UNEP aridity index: annual precipitation / potential evapotranspiration. < 0.05 = hyper-arid.",
          "PET from Hargreaves–Samani (FAO-56 eq. 52) using POWER T2M, T2M max/min and TOA radiation; Gaussian similarity to 0.",
          "derived", "modelled", "direct", "gaussian", 0.1, "σ", ("ARIDITY_INDEX",)),
    Param("water", "Water availability", "water", "0–1",
          "Surface soil wetness (fraction of saturation, top 5 cm). Both target bodies have no liquid water at the surface.",
          "Gaussian similarity on POWER GWETTOP to the target (0).", "power_merra2", "reanalysis", "partial", "gaussian", 0.15, "σ", ("GWETTOP",)),
    Param("ice_proximity", "Water-ice proximity", "water", "km",
          "Distance to the nearest cell with ≥30% permanent snow/ice (ESA WorldCover), snow cover (MERRA-2 FRSNO) or a perennially frozen surface (annual max skin temperature < 0 °C). Analog for ISRU near polar / mid-latitude ice.",
          "Gaussian similarity of distance to the target distance (0 km where ice is known to exist). Not applicable to ice-free targets.",
          "derived", "modelled", "partial", "gaussian", 300.0, "σ (km)", ("dist_ice_km",), default_enabled=False),
    # ------------------------------------------------------------------ logistics
    Param("accessibility", "Accessibility and remoteness", "logistics", "km to road",
          "Distance to the nearest major road (Natural Earth). Accessible mode favours sites within the ideal distance; remote mode favours isolation.",
          "Preference function: 1 within the ideal distance, Gaussian decay outside (σ = tolerance).",
          "naturalearth", "measured", "direct", "pref", 150.0, "σ (km)", ("dist_road_km",),
          extra={"ideal_km": 50.0, "mode": "accessible"}),
    Param("protection", "Environmental protection restrictions", "logistics", "protected (0/1)",
          "Whether the cell lies in a protected area. Coverage: USA only (Natural Earth); elsewhere unknown → lowers confidence.",
          "Score 1 if not protected, 0 if protected.", "naturalearth", "measured", "direct", "binary_ok", 0.0, "",
          ("protected",), default_enabled=False),
    # ------------------------------------------------------------------ non-reproducible
    Param("pressure", "Atmospheric pressure / vacuum", "nonrepro", "hPa",
          "Mars ~6–9 hPa, Moon ~10⁻¹² hPa. Even the Everest summit (~330 hPa) is ~40× denser than Mars. Requires vacuum/thermal-vacuum chambers.",
          "Log-Gaussian similarity on POWER PS; scores are near 0 everywhere by construction.",
          "power_merra2", "reanalysis", "laboratory", "log_gaussian", 1.0, "σ (ln units)", ("PS",), default_enabled=False),
    Param("gravity", "Reduced gravity", "nonrepro", "m/s²",
          "Earth 9.81 m/s² everywhere. Partial reproduction only by parabolic flights, drop towers, offloading rigs or centrifuge-scaled tests.",
          "Constant – no terrestrial site differs meaningfully.", "constant", "constant", "impossible", "log_gaussian", 0.3,
          "σ (ln units)", ("GRAVITY",), default_enabled=False),
    Param("radiation", "Space radiation exposure", "nonrepro", "mSv/yr",
          "Galactic cosmic rays & solar particles. Earth surface background ≈ 2.4 mSv/yr (UNSCEAR 2008); Mars ≈ 245, Moon ≈ 500. Needs accelerator facilities (e.g. NASA Space Radiation Laboratory).",
          "Constant global mean – Earth's atmosphere and magnetosphere shield every site.", "constant", "constant",
          "laboratory", "log_gaussian", 1.0, "σ (ln units)", ("RADIATION",), default_enabled=False),
]

PARAMS: dict[str, Param] = {p.key: p for p in P}
CATEGORIES = {
    "temperature": "Temperature", "solar": "Solar", "terrain": "Terrain", "geology": "Geology & dust",
    "atmosphere": "Atmosphere", "water": "Water & aridity", "logistics": "Logistics", "nonrepro": "Non-reproducible",
}
REPRO_LABELS = {
    "direct": "Directly reproducible at field sites",
    "partial": "Partially reproducible outdoors",
    "laboratory": "Requires laboratory simulation",
    "impossible": "Cannot be realistically reproduced on Earth",
}


def add_derived_layers(layers: dict[str, np.ndarray]) -> None:
    """Proxy layers (clearly documented as proxies)."""
    bare = layers["lc_bare"]
    if "ROCK_INDEX" not in layers:
        layers["ROCK_INDEX"] = (bare * np.clip(layers["rough_m"] / 30.0, 0, 1)).astype(np.float32)
    if "SOIL_INDEX" not in layers:
        layers["SOIL_INDEX"] = (bare * (1 - np.clip(layers["ARIDITY_INDEX"] / 0.2, 0, 1))).astype(np.float32)
    ref = layers["TS"]
    if "GRAVITY" not in layers:
        g = np.full_like(ref, 9.81)
        g[~np.isfinite(ref)] = np.nan
        layers["GRAVITY"] = g
    if "RADIATION" not in layers:
        r = np.full_like(ref, 2.4)
        r[~np.isfinite(ref)] = np.nan
        layers["RADIATION"] = r


def earth_value(p: Param, layers: dict, idx) -> object:
    """Earth value(s) for display at flat index / indices."""
    vals = [layers[l].ravel()[idx] for l in p.layers]
    return vals[0] if len(vals) == 1 else vals


def similarity(p: Param, layers: dict, slope_hist_flat: np.ndarray | None, idx: np.ndarray,
               target: dict | None, tolerance: float | None, extra: dict | None = None) -> np.ndarray:
    """Similarity in [0,1] (NaN where Earth data are missing) for the cells ``idx``."""
    tol = tolerance if tolerance is not None else p.tolerance
    ex = {**p.extra, **(extra or {})}
    n = len(idx)
    if p.kind == "pref":
        x = layers[p.layers[0]].ravel()[idx]
        if ex.get("mode") == "remote":
            return sim.preference_beyond(x, float(ex.get("ideal_km", 50)), tol)
        return sim.preference_within(x, float(ex.get("ideal_km", 50)), tol)
    if p.kind == "binary_ok":
        x = layers[p.layers[0]].ravel()[idx]
        return 1.0 - x
    if target is None:
        return np.full(n, np.nan, np.float32)
    t = target["value"]
    if p.kind == "gaussian":
        return sim.gaussian(layers[p.layers[0]].ravel()[idx], float(t), tol)
    if p.kind == "log_gaussian":
        return sim.log_gaussian(layers[p.layers[0]].ravel()[idx], float(t), tol, floor=1e-14)
    if p.kind == "pair":
        a = layers[p.layers[0]].ravel()[idx]
        b = layers[p.layers[1]].ravel()[idx]
        return sim.pair_gaussian(a, b, float(t[0]), float(t[1]), tol)
    if p.kind == "daylight":
        a = layers[p.layers[0]].ravel()[idx]
        b = layers[p.layers[1]].ravel()[idx]
        return 0.5 * (sim.gaussian(a, float(t[0]), tol) + sim.gaussian(b, float(t[1]), tol))
    if p.kind == "slope_hist":
        from ..data.grid import SLOPE_BINS
        probs = sim.lognormal_bin_probs(t["median"], t["p90"], SLOPE_BINS)
        return sim.bhattacharyya(slope_hist_flat[:, idx], probs)
    raise ValueError(p.kind)


def param_catalog():
    return [
        {
            "key": p.key, "label": p.label, "category": p.category, "unit": p.unit,
            "description": p.description, "method": p.method, "source": SRC[p.source], "source_key": p.source,
            "quality": p.quality, "q": p.q, "repro": p.repro, "repro_label": REPRO_LABELS[p.repro],
            "kind": p.kind, "tolerance": p.tolerance, "tolerance_label": p.tolerance_label,
            "default_enabled": p.default_enabled, "extra": p.extra,
        }
        for p in P
    ]
