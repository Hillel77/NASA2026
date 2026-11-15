"""
Catalogue of established terrestrial planetary analog sites (coordinates approximate, ±0.1°).
Used ONLY for validation: we check whether the scoring engine ranks sites that space agencies
actually use near the top for the corresponding mission type. They do not influence scores.
"""
ANALOG_SITES = [
    {"name": "Atacama Desert (Yungay)", "country": "Chile", "lat": -24.08, "lon": -69.93, "body": "mars",
     "use": "Mars life-detection & rover tests (NASA ARADS, ESA)", "ref": "Navarro-González et al. 2003, Science 302"},
    {"name": "Haughton Crater, Devon Island", "country": "Canada", "lat": 75.38, "lon": -89.68, "body": "mars",
     "use": "Haughton-Mars Project: EVA, rover and habitat operations", "ref": "Lee & Osinski 2005"},
    {"name": "Mars Desert Research Station", "country": "USA", "lat": 38.41, "lon": -110.79, "body": "mars",
     "use": "Mars Society habitat simulations", "ref": "Mars Society MDRS"},
    {"name": "HI-SEAS (Mauna Loa)", "country": "USA", "lat": 19.60, "lon": -155.51, "body": "mars",
     "use": "Long-duration Mars/Moon habitat isolation studies", "ref": "HI-SEAS / NASA HRP"},
    {"name": "McMurdo Dry Valleys", "country": "Antarctica", "lat": -77.50, "lon": 162.00, "body": "mars",
     "use": "Cold hyper-arid Mars analog; permafrost & ice", "ref": "Doran et al. 2010"},
    {"name": "Rio Tinto", "country": "Spain", "lat": 37.70, "lon": -6.60, "body": "mars",
     "use": "Acidic, iron-rich Mars mineralogy analog (MARTE drilling)", "ref": "Stoker et al. 2008"},
    {"name": "Svalbard (AMASE, Bockfjorden)", "country": "Norway", "lat": 79.40, "lon": 13.30, "body": "mars",
     "use": "ESA/NASA Arctic Mars Analog Svalbard Expeditions", "ref": "Steele et al. 2010"},
    {"name": "Death Valley", "country": "USA", "lat": 36.50, "lon": -117.10, "body": "mars",
     "use": "Rover field tests, aeolian processes", "ref": "JPL field tests"},
    {"name": "Teide National Park, Tenerife", "country": "Spain", "lat": 28.27, "lon": -16.64, "body": "mars",
     "use": "ExoMars rover field trials", "ref": "ESA ExoMars"},
    {"name": "Ladakh (Tso Kar)", "country": "India", "lat": 33.30, "lon": 78.00, "body": "mars",
     "use": "High-altitude cold-desert Mars analog", "ref": "Pandey et al. 2020"},
    {"name": "Meteor Crater, Arizona", "country": "USA", "lat": 35.03, "lon": -111.02, "body": "moon",
     "use": "Apollo astronaut geology training", "ref": "Schaber 2005, USGS"},
    {"name": "Black Point Lava Flow (Desert RATS)", "country": "USA", "lat": 35.68, "lon": -111.48, "body": "moon",
     "use": "NASA Desert RATS lunar rover / EVA tests", "ref": "Ross et al. 2013"},
    {"name": "Lanzarote (PANGAEA)", "country": "Spain", "lat": 29.00, "lon": -13.70, "body": "moon",
     "use": "ESA PANGAEA lunar/Mars geology training", "ref": "Sauro et al. 2020"},
    {"name": "Iceland highlands (Askja)", "country": "Iceland", "lat": 65.05, "lon": -16.75, "body": "moon",
     "use": "Apollo training 1965-67; lunar rover tests", "ref": "NASA Apollo training"},
    {"name": "Ries Crater", "country": "Germany", "lat": 48.88, "lon": 10.56, "body": "moon",
     "use": "Apollo 14 crew impact-geology training", "ref": "Pösges & Schieber 1997"},
    {"name": "Concordia Station (Dome C)", "country": "Antarctica", "lat": -75.10, "lon": 123.33, "body": "moon",
     "use": "ESA long-duration isolation analog; extreme cold", "ref": "ESA Concordia"},
]
