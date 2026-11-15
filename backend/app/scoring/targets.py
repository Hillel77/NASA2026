"""
Lunar and Martian reference environments.

Every target value carries:
  * ``value``   – the reference value in the SAME units as the Earth layer it is compared with
  * ``quality`` – "measured"  : directly reported by an instrument/mission
                  "derived"   : computed from measured constants (e.g. solar constant / pi)
                  "estimated" : approximate value read from published maps/figures; treat as
                                order-of-magnitude, uncertainty noted in ``note``
  * ``source``  – instrument / reference

These are literature-derived reference values (Diviner, LOLA, MOLA, THEMIS, REMS, MEDA,
TWINS/InSight, Viking, RAD, Chang'e-4 LND). They are intentionally conservative summaries,
not new measurements. Tolerances (sigma) are set by the user / preset, not here.

Units used throughout:
  temperatures °C, irradiance W m-2 (24-h / diurnal-cycle mean on a horizontal surface),
  daylight as fraction of the diurnal cycle, relief/roughness m, slope °, AOD dimensionless,
  wind m s-1, precipitation mm/day, specific humidity g/kg, pressure hPa, gravity m s-2,
  radiation dose mSv/yr.
"""
from __future__ import annotations

SOLAR_CONSTANT_EARTH_MOON = 1361.0   # W m-2 (Kopp & Lean 2011)
SOLAR_MARS_MEAN = 586.2              # W m-2 at 1.524 AU (NASA Mars Fact Sheet)


def M(value, source, note="", quality="measured"):
    return {"value": value, "source": source, "quality": quality, "note": note}


def E(value, source, note=""):
    return M(value, source, note, "estimated")


def D(value, source, note=""):
    return M(value, source, note, "derived")


DIVINER = "LRO Diviner (Vasavada et al. 2012, JGR 117; Williams et al. 2017, Icarus 283)"
DIVINER_POLAR = "LRO Diviner polar data (Paige et al. 2010, Science 330; Williams et al. 2019, JGR 124)"
LOLA = "LRO LOLA topography/roughness (Rosenburg et al. 2011, JGR 116; Kreslavsky et al. 2013, Icarus 226)"
LOLA_ILLUM = "LOLA illumination modelling (Mazarico et al. 2011, Icarus 211)"
DIVINER_ROCK = "Diviner rock abundance (Bandfield et al. 2011, JGR 116)"
MOLA = "MGS MOLA topography (Smith et al. 2001, JGR 106; Kreslavsky & Head 2000, JGR 105)"
THEMIS_ROCK = "THEMIS/TES rock abundance (Nowicki & Christensen 2007, JGR 112)"
REMS = "MSL REMS (Gómez-Elvira et al. 2014; Martínez et al. 2017, Space Sci. Rev. 212)"
MEDA = "Mars 2020 MEDA (Rodriguez-Manfredi et al. 2023, Nat. Geosci. 16)"
TWINS = "InSight TWINS/PS (Banfield et al. 2020, Nat. Geosci. 13)"
VIKING = "Viking Lander 2 meteorology (Hess et al. 1977, JGR 82; Moore et al. 1987)"
TAU = "Mars dust optical depth climatology (Montabone et al. 2015, Icarus 251; Lemmon et al. 2015)"
RAD = "MSL RAD surface dose (Hassler et al. 2014, Science 343)"
LND = "Chang'e-4 LND surface dose (Zhang et al. 2020, Sci. Adv. 6)"
SHARAD = "MRO SHARAD subsurface ice, Utopia Planitia (Stuurman et al. 2016, GRL 43)"
LCROSS = "LCROSS / LRO polar volatiles (Colaprete et al. 2010, Science 330; Li et al. 2018, PNAS)"
FACT = "NASA planetary fact sheets"

# -------------------------------------------------------------------------------------------
# Values common to a body
# -------------------------------------------------------------------------------------------
MOON_COMMON = {
    "solar_energy": D(1.0, FACT, "No atmosphere: surface receives the full top-of-atmosphere flux (clearness index 1)."),
    "dust": M(0.0, FACT, "No atmosphere, no suspended dust optical depth (electrostatic levitation is negligible optically)."),
    "wind": M(0.0, FACT, "No atmosphere."),
    "precipitation": M(0.0, FACT),
    "humidity": M(0.0, FACT, "Exosphere only; no near-surface water vapour."),
    "aridity": M(0.0, FACT, "No precipitation: aridity index P/PET = 0."),
    "water": M(0.0, FACT, "No liquid water at the surface; soil wetness 0."),
    "composition": D(1.0, "Lunar regolith covers ~100% of the surface", "Fraction of bare mineral surface (no vegetation)."),
    "soil": D(1.0, "Apollo/Luna regolith samples", "Index 1 = continuous fine-grained unconsolidated regolith."),
    "pressure": M(3e-12, "Apollo LACE / LADEE (exosphere ~3e-15 bar)", "Hard vacuum: laboratory chamber required."),
    "gravity": M(1.62, FACT),
    "radiation": M(500.0, LND, "1369 µSv/day measured at the Chang'e-4 site (~500 mSv/yr)."),
}
MARS_COMMON = {
    "dust": M(0.5, TAU, "Typical non-dust-storm visible column optical depth 0.3-0.9; storms > 2."),
    "solar_energy": E(0.70, TAU, "Surface/TOA transmittance for tau ~0.5 (Beer-Lambert with forward scattering)."),
    "precipitation": M(0.0, FACT, "No rain; only CO2/H2O frost and snowfall from clouds at high latitudes."),
    "humidity": E(0.1, "Mars Express / REMS-H water vapour (~10 pr-µm column)", "Near-surface specific humidity of order 0.1 g/kg."),
    "aridity": M(0.0, FACT, "No precipitation: hyper-arid by definition."),
    "water": M(0.0, FACT, "No stable liquid water; soil wetness 0."),
    "composition": D(1.0, "Global basaltic regolith (Bandfield 2002; Ehlmann & Edwards 2014)", "No vegetation; 100% mineral surface."),
    "gravity": M(3.71, FACT),
    "radiation": M(245.0, RAD, "0.67 mSv/day at Gale crater (~245 mSv/yr)."),
}

# -------------------------------------------------------------------------------------------
# Reference regions
# -------------------------------------------------------------------------------------------
REGIONS: dict[str, dict] = {
    # ---------------------------------------------------------------- MOON
    "moon_mare": {
        "body": "moon", "name": "Equatorial mare (Apollo 11/12/15 type)",
        "lat": 0.7, "lon": 23.5,
        "description": "Low-latitude basaltic maria such as Mare Tranquillitatis: smooth plains, extreme day-night thermal cycle.",
        "values": {
            **MOON_COMMON,
            "temp_mean": E(-45.0, DIVINER, "Diurnal-mean surface temperature ~230 K at the equator."),
            "temp_daily": M(285.0, DIVINER, "Noon ~390 K, pre-dawn ~95-100 K."),
            "temp_seasonal": E(6.0, DIVINER, "Lunar obliquity is 1.54°, so seasonal change at the equator is a few K."),
            "temp_extremes": M([-178.0, 117.0], DIVINER, "Min / max surface temperature (°C)."),
            "solar_irradiance": D(433.0, "Solar constant 1361 W m-2 / pi", "Diurnal-mean flux on a horizontal surface at the equator."),
            "daylight": D([0.5, 0.5], "Lunar synodic period 29.53 d", "~354 h day / 354 h night; illuminated fraction 0.5 all year."),
            "elevation": E(150.0, LOLA, "Std-dev of elevation within ~25 km: maria are smooth (order 100 m)."),
            "slope": E({"median": 1.5, "p90": 5.0}, LOLA, "Km-baseline slopes; maria median ~1-2°."),
            "roughness": E(5.0, LOLA, "Km-scale topographic roughness, order of metres."),
            "rock": E(0.1, DIVINER_ROCK, "Rock abundance < 1% over most maria -> low rockiness index."),
            "ice_proximity": None,
        },
    },
    "moon_highlands": {
        "body": "moon", "name": "Equatorial highlands (Apollo 16 type)",
        "lat": -9.0, "lon": 15.5,
        "description": "Anorthositic, heavily cratered highlands: rougher terrain and steeper slopes than maria.",
        "values": {
            **MOON_COMMON,
            "temp_mean": E(-48.0, DIVINER),
            "temp_daily": M(280.0, DIVINER),
            "temp_seasonal": E(6.0, DIVINER),
            "temp_extremes": M([-178.0, 112.0], DIVINER),
            "solar_irradiance": D(427.0, "1361/pi x cos(9°)"),
            "daylight": D([0.5, 0.5], "Lunar synodic period"),
            "elevation": E(700.0, LOLA, "Cratered highlands: several hundred m relief within 25 km."),
            "slope": E({"median": 5.0, "p90": 15.0}, LOLA),
            "roughness": E(25.0, LOLA),
            "rock": E(0.2, DIVINER_ROCK),
            "ice_proximity": None,
        },
    },
    "moon_south_pole": {
        "body": "moon", "name": "South polar region (Artemis III candidate ridges, near Shackleton)",
        "lat": -89.5, "lon": 222.7,
        "description": "Sunlit crater rims next to permanently shadowed regions containing water ice. Sun always within ~1.5° of the horizon.",
        "values": {
            **MOON_COMMON,
            "temp_mean": E(-90.0, DIVINER_POLAR, "Illuminated ridges average roughly 180-200 K."),
            "temp_daily": E(40.0, DIVINER_POLAR, "Grazing sunlight: small diurnal swing compared with the equator."),
            "temp_seasonal": E(100.0, DIVINER_POLAR, "Strong seasonal contrast between polar summer and winter."),
            "temp_extremes": E([-200.0, -20.0], DIVINER_POLAR, "~70 K winter minimum, ~250 K summer maximum on lit ridges (PSRs reach 25-40 K)."),
            "solar_irradiance": D(30.0, "1361 W m-2 x sin(~1.5°) x ~0.8 illumination", "Horizontal surface; VERTICAL panels see ~1000 W m-2 when lit."),
            "daylight": E([0.6, 1.0], LOLA_ILLUM, "Best ridge points are lit 80-90% of the time; near-continuous light in local summer."),
            "elevation": E(1000.0, LOLA, "Rugged: Shackleton crater is ~4 km deep."),
            "slope": E({"median": 6.0, "p90": 18.0}, LOLA),
            "roughness": E(30.0, LOLA),
            "rock": E(0.15, DIVINER_ROCK),
            "ice_proximity": D(0.0, LCROSS, "Water ice confirmed in nearby permanently shadowed regions (distance ~0 km)."),
        },
    },
    # ---------------------------------------------------------------- MARS
    "mars_global": {
        "body": "mars", "name": "Mars global average",
        "lat": 0.0, "lon": 0.0,
        "description": "Planet-wide mean conditions; useful for generic equipment testing.",
        "values": {
            **MARS_COMMON,
            "temp_mean": M(-63.0, FACT, "Global mean surface temperature ~210 K."),
            "temp_daily": E(60.0, "Viking/MSL/InSight surface measurements"),
            "temp_seasonal": E(40.0, "Mars Climate Database (Forget et al. 1999)"),
            "temp_extremes": E([-125.0, 20.0], "TES/THEMIS, REMS", "CO2 frost point at the poles to equatorial noon ground temperature."),
            "solar_irradiance": D(100.0, "586 W m-2 / 4 (sphere mean) x ~0.7 transmittance"),
            "daylight": D([0.4, 0.6], "Mars obliquity 25.2°, sol 24.66 h"),
            "elevation": E(300.0, MOLA),
            "slope": E({"median": 1.5, "p90": 6.0}, MOLA),
            "roughness": E(10.0, MOLA),
            "rock": E(0.3, THEMIS_ROCK, "Global average rock abundance ~5-10%."),
            "soil": E(0.9, "MER/MSL soil observations", "Basaltic sand/dust regolith over most of the surface."),
            "wind": E(5.0, "Lander anemometry (Viking, REMS, TWINS)"),
            "pressure": M(6.1, FACT, "Mean surface pressure ~610 Pa."),
            "ice_proximity": None,
        },
    },
    "mars_gale": {
        "body": "mars", "name": "Gale crater (Curiosity)",
        "lat": -4.59, "lon": 137.44,
        "description": "154 km impact crater with the 5 km high Aeolis Mons: layered sediments, dunes, bedrock and steep slopes.",
        "values": {
            **MARS_COMMON,
            "temp_mean": E(-50.0, REMS, "Annual mean of REMS daily-mean ground temperature."),
            "temp_daily": M(85.0, REMS, "Ground temperature diurnal range 70-100 K."),
            "temp_seasonal": E(20.0, REMS),
            "temp_extremes": M([-100.0, 20.0], REMS, "Ground temperature min / max."),
            "solar_irradiance": D(120.0, "586/pi W m-2 x ~0.65 transmittance (tau~0.6)", "REMS UV & Mastcam tau records"),
            "daylight": D([0.48, 0.52], "Latitude 4.6°S, obliquity 25.2°"),
            "elevation": E(600.0, MOLA, "Crater floor + lower Aeolis Mons slopes."),
            "slope": E({"median": 4.0, "p90": 14.0}, MOLA),
            "roughness": E(20.0, MOLA),
            "rock": E(0.5, THEMIS_ROCK, "Exposed bedrock and rock-strewn plains along the traverse."),
            "soil": E(0.8, "MSL CheMin / Rocknest sand shadow (Blake et al. 2013)"),
            "dust": M(0.6, "MSL Mastcam tau (Smith et al. 2016)"),
            "wind": E(3.0, REMS),
            "pressure": M(8.5, REMS, "Seasonal range 7.3-9.3 hPa."),
            "ice_proximity": None,
        },
    },
    "mars_jezero": {
        "body": "mars", "name": "Jezero crater (Perseverance)",
        "lat": 18.44, "lon": 77.45,
        "description": "45 km crater with an ancient river delta; rocky, lightly cratered floor.",
        "values": {
            **MARS_COMMON,
            "temp_mean": E(-50.0, MEDA),
            "temp_daily": M(80.0, MEDA, "Ground temperature diurnal range."),
            "temp_seasonal": E(25.0, MEDA),
            "temp_extremes": E([-95.0, 5.0], MEDA),
            "solar_irradiance": D(125.0, "586/pi x cos(18°) x ~0.7"),
            "daylight": D([0.45, 0.55], "Latitude 18.4°N, obliquity 25.2°"),
            "elevation": E(200.0, MOLA),
            "slope": E({"median": 2.0, "p90": 8.0}, MOLA),
            "roughness": E(10.0, MOLA),
            "rock": E(0.4, THEMIS_ROCK),
            "soil": E(0.8, MEDA),
            "wind": E(4.0, MEDA),
            "pressure": M(6.9, MEDA, "Seasonal range ~6.2-7.6 hPa."),
            "ice_proximity": None,
        },
    },
    "mars_utopia": {
        "body": "mars", "name": "Utopia Planitia (Viking 2)",
        "lat": 47.64, "lon": 134.29,
        "description": "Smooth northern lowland plains, rock-strewn surface, winter frost and a large mid-latitude subsurface ice deposit.",
        "values": {
            **MARS_COMMON,
            "temp_mean": E(-65.0, VIKING),
            "temp_daily": E(50.0, VIKING),
            "temp_seasonal": E(60.0, VIKING),
            "temp_extremes": E([-120.0, -10.0], VIKING),
            "solar_irradiance": D(88.0, "586/pi x cos(48°) x ~0.7"),
            "daylight": D([0.37, 0.63], "Latitude 47.6°N, obliquity 25.2°"),
            "elevation": E(50.0, MOLA, "Northern plains are among the flattest surfaces in the Solar System."),
            "slope": E({"median": 0.5, "p90": 2.5}, MOLA),
            "roughness": E(4.0, MOLA),
            "rock": E(0.7, "Viking 2 lander images (~16% rock cover)"),
            "soil": E(0.8, VIKING),
            "wind": E(3.0, VIKING),
            "pressure": M(8.5, VIKING, "Seasonal range ~7.3-10.8 hPa."),
            "ice_proximity": D(0.0, SHARAD, "Excess subsurface water ice within metres of the surface."),
        },
    },
    "mars_meridiani": {
        "body": "mars", "name": "Meridiani Planum (Opportunity)",
        "lat": -1.95, "lon": 354.47,
        "description": "Very flat sulfate-rich plains with basaltic sand ripples and hematite spherules.",
        "values": {
            **MARS_COMMON,
            "temp_mean": E(-50.0, "MER Mini-TES ground temperatures (Smith et al. 2006)"),
            "temp_daily": E(85.0, "MER Mini-TES"),
            "temp_seasonal": E(15.0, "MER Mini-TES"),
            "temp_extremes": E([-100.0, 15.0], "MER Mini-TES"),
            "solar_irradiance": D(120.0, "586/pi x ~0.65"),
            "daylight": D([0.48, 0.52], "Latitude 1.9°S"),
            "elevation": E(30.0, MOLA),
            "slope": E({"median": 0.5, "p90": 2.0}, MOLA),
            "roughness": E(3.0, MOLA),
            "rock": E(0.1, THEMIS_ROCK, "Rock abundance only a few percent."),
            "soil": E(0.95, "MER Athena (Squyres et al. 2004)"),
            "wind": E(4.0, "Mars Climate Database"),
            "pressure": M(6.5, "MER / MCD"),
            "ice_proximity": None,
        },
    },
    "mars_elysium": {
        "body": "mars", "name": "Elysium Planitia (InSight)",
        "lat": 4.50, "lon": 135.62,
        "description": "Smooth, low-rock plains selected for lander safety; continuous wind and pressure records.",
        "values": {
            **MARS_COMMON,
            "temp_mean": E(-55.0, TWINS),
            "temp_daily": E(80.0, TWINS),
            "temp_seasonal": E(15.0, TWINS),
            "temp_extremes": E([-100.0, 5.0], TWINS),
            "solar_irradiance": D(120.0, "586/pi x ~0.65"),
            "daylight": D([0.48, 0.52], "Latitude 4.5°N"),
            "elevation": E(20.0, MOLA),
            "slope": E({"median": 0.3, "p90": 1.5}, MOLA, "Landing ellipse chosen for slopes < 15° at 1-m scale."),
            "roughness": E(2.0, MOLA),
            "rock": E(0.1, "InSight landing site rock abundance 1-3% (Golombek et al. 2017)"),
            "soil": E(0.95, "InSight HP3 / IDC (Golombek et al. 2020)"),
            "wind": M(5.0, TWINS, "Mean ~5 m/s, gusts > 20 m/s."),
            "pressure": M(7.0, TWINS),
            "ice_proximity": None,
        },
    },
}

DEFAULT_REGION = {"moon": "moon_mare", "mars": "mars_gale"}


def region_list():
    return [
        {"id": k, "body": v["body"], "name": v["name"], "lat": v["lat"], "lon": v["lon"],
         "description": v["description"]}
        for k, v in REGIONS.items()
    ]
