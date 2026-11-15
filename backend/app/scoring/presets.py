"""
Mission presets: starting points for weights (0-100) and hard constraints.
They encode engineering judgement about what matters for a test campaign, NOT claims that
a parameter has universal scientific importance. Every value is editable in the UI.
"""
from __future__ import annotations

from .parameters import PARAMS

BASE_OFF = {k: 0 for k in PARAMS}


def _w(**weights):
    w = dict(BASE_OFF)
    w.update(weights)
    return w


PRESETS = [
    {
        "id": "lunar_landing", "body": "moon", "region": "moon_mare", "name": "Lunar landing site simulation",
        "summary": "Plume–surface interaction, landing-leg and hazard-detection tests on smooth, rock-poor, unvegetated plains.",
        "weights": _w(slope=90, roughness=85, rock=70, composition=75, elevation=60, dust=40, soil=50,
                      precipitation=30, accessibility=50, wind=35),
        "constraints": {"max_slope_p90": 8, "max_relief_m": 800, "min_area_km2": 1500},
    },
    {
        "id": "lunar_polar_base", "body": "moon", "region": "moon_south_pole", "name": "Lunar polar base simulation",
        "summary": "Grazing-sun illumination cycles, cold-soak, polar-day/night power management and ice-prospecting logistics.",
        "weights": _w(daylight=90, solar_irradiance=60, temp_daily=80, temp_seasonal=80, temp_mean=70, temp_extremes=60,
                      slope=80, ice_proximity=85, elevation=50, accessibility=50, composition=40),
        "constraints": {"max_slope_p90": 15},
        # Lunar polar temperatures lie far outside Earth's range: widen tolerances so the
        # coldest, most seasonal terrestrial sites are still ranked (partially reproducible).
        "tolerances": {"temp_mean": 40, "temp_seasonal": 40, "temp_extremes": 60, "temp_daily": 30},
    },
    {
        "id": "lunar_rover", "body": "moon", "region": "moon_highlands", "name": "Lunar rover mobility testing",
        "summary": "Traverse planning and wheel–soil interaction on cratered, rough, dry, unvegetated terrain.",
        "weights": _w(slope=90, roughness=90, rock=75, soil=80, composition=80, elevation=60, aridity=40,
                      precipitation=30, accessibility=55),
        "constraints": {"min_area_km2": 1000},
    },
    {
        "id": "lunar_equipment", "body": "moon", "region": "moon_mare", "name": "Lunar surface equipment testing",
        "summary": "Thermal cycling, dust exposure and power systems: extreme temperatures, high irradiance, dry air.",
        "weights": _w(temp_daily=90, temp_extremes=85, temp_mean=50, solar_irradiance=80, solar_energy=80, humidity=60,
                      precipitation=50, dust=40, composition=50, accessibility=50),
        "constraints": {},
        "tolerances": {"temp_daily": 120, "temp_extremes": 90, "temp_mean": 40, "solar_irradiance": 150},
    },
    {
        "id": "mars_landing", "body": "mars", "region": "mars_elysium", "name": "Martian landing site simulation",
        "summary": "EDL hazard-avoidance, radar altimetry and landing-leg testing on flat, low-rock, dusty plains.",
        "weights": _w(slope=90, roughness=85, rock=70, elevation=70, composition=75, dust=55, wind=50, aridity=50,
                      accessibility=45),
        "constraints": {"max_slope_p90": 6, "min_area_km2": 2000},
    },
    {
        "id": "mars_habitat", "body": "mars", "region": "mars_utopia", "name": "Martian habitat simulation",
        "summary": "Long-duration analog missions: cold, large temperature swings, solar power, wind/dust loads, ice for ISRU.",
        "weights": _w(temp_daily=85, temp_seasonal=75, temp_mean=70, solar_energy=80, solar_irradiance=70,
                      slope=75, wind=75, dust=70, ice_proximity=70, water=60, aridity=60, accessibility=55),
        "constraints": {"max_slope_p90": 10},
        "tolerances": {"temp_mean": 30, "temp_daily": 45, "temp_seasonal": 25},
    },
    {
        "id": "mars_rover", "body": "mars", "region": "mars_gale", "name": "Martian rover testing",
        "summary": "Mobility, autonomy and sampling on rough, rock-strewn, sloping, dry sediments.",
        "weights": _w(roughness=90, slope=85, soil=85, rock=85, composition=80, dust=55, temp_mean=50, temp_daily=50,
                      aridity=60, accessibility=55),
        "constraints": {"min_area_km2": 1000},
    },
    {
        "id": "mars_dust", "body": "mars", "region": "mars_global", "name": "Martian dust and abrasion testing",
        "summary": "Aeolian abrasion, dust deposition on optics/solar panels: windy, dusty, hyper-arid bare ground.",
        "weights": _w(dust=95, wind=90, composition=80, aridity=80, soil=70, precipitation=60, humidity=50,
                      solar_energy=40, accessibility=45),
        "constraints": {},
    },
    {
        "id": "solar_energy", "body": "mars", "region": "mars_global", "name": "Solar energy system testing",
        "summary": "PV/thermal power under the target's irradiance level, atmospheric transmittance, daylight and temperature.",
        "weights": _w(solar_irradiance=90, solar_energy=90, daylight=70, dust=70, temp_mean=60, temp_daily=60,
                      precipitation=40, accessibility=50),
        "constraints": {},
    },
    {
        "id": "custom", "body": "mars", "region": "mars_global", "name": "Custom experiment",
        "summary": "All parameters at equal weight; adjust to your own experiment.",
        "weights": {k: (50 if PARAMS[k].default_enabled else 0) for k in PARAMS},
        "constraints": {},
    },
]


for _p in PRESETS:
    _p.setdefault("tolerances", {})


def preset_list():
    return PRESETS
