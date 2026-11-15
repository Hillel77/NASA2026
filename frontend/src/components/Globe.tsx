import { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import type { AnalogSite, TopLocation } from '../lib/api';
import { fmtLat, fmtLon } from '../lib/format';

declare const CESIUM_BASE_URL: string;
(window as any).CESIUM_BASE_URL = CESIUM_BASE_URL;
Cesium.Ion.defaultAccessToken = (import.meta as any).env?.VITE_CESIUM_ION_TOKEN || '';

export type Basemap = 'satellite' | 'natural';

interface Props {
  heatmapUrl: string | null;
  overlayAlpha: number;
  markers: TopLocation[];
  sites: AnalogSite[];
  showSites: boolean;
  showMarkers: boolean;
  showGrid: boolean;
  showLabels: boolean;
  basemap: Basemap;
  selected: { lat: number; lon: number; bounds?: number[] } | null;
  flyTo: { lat: number; lon: number; height?: number; n: number } | null;
  resetNonce: number;
  onPick: (lat: number, lon: number) => void;
  onBasemapFallback: () => void;
  onLoading: (b: boolean) => void;
}

const HOME = { lon: 10, lat: 15, height: 2.2e7 };
const ESRI_IMG = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ESRI_LABELS = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';

export default function Globe(p: Props) {
  const el = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const baseRef = useRef<Cesium.ImageryLayer | null>(null);
  const labelsRef = useRef<Cesium.ImageryLayer | null>(null);
  const heatRef = useRef<{ entity: Cesium.Entity; setFade: (f: number) => void } | null>(null);
  const gridRef = useRef<Cesium.CustomDataSource | null>(null);
  const markRef = useRef<Cesium.CustomDataSource | null>(null);
  const siteRef = useRef<Cesium.CustomDataSource | null>(null);
  const selRef = useRef<Cesium.Entity | null>(null);
  const pickRef = useRef(p.onPick);
  pickRef.current = p.onPick;
  const [hover, setHover] = useState<{ lat: number; lon: number } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  // ---------------------------------------------------------------- init
  useEffect(() => {
    if (!el.current) return;
    let viewer: Cesium.Viewer;
    try {
      viewer = new Cesium.Viewer(el.current, {
        baseLayer: false, baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false,
        navigationHelpButton: false, animation: false, timeline: false, fullscreenButton: false, infoBox: false,
        selectionIndicator: false, requestRenderMode: false,
      });
    } catch (e: any) {
      setFailed(String(e?.message ?? e));
      return;
    }
    viewerRef.current = viewer;
    const scene = viewer.scene;
    scene.globe.baseColor = Cesium.Color.fromCssColorString('#0b1220');
    scene.backgroundColor = Cesium.Color.fromCssColorString('#05070b');
    scene.globe.enableLighting = false;
    scene.globe.showGroundAtmosphere = true;
    if (scene.skyAtmosphere) scene.skyAtmosphere.show = true;
    scene.fog.enabled = false;
    (viewer.cesiumWidget.creditContainer as HTMLElement).style.display = 'none';
    scene.screenSpaceCameraController.minimumZoomDistance = 5e4;
    viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(HOME.lon, HOME.lat, HOME.height) });

    gridRef.current = new Cesium.CustomDataSource('grid');
    markRef.current = new Cesium.CustomDataSource('markers');
    siteRef.current = new Cesium.CustomDataSource('sites');
    viewer.dataSources.add(gridRef.current);
    viewer.dataSources.add(siteRef.current);
    viewer.dataSources.add(markRef.current);
    buildGrid(gridRef.current);

    const h = new Cesium.ScreenSpaceEventHandler(scene.canvas);
    h.setInputAction((ev: any) => {
      const picked = scene.pick(ev.position);
      if (picked && picked.id && picked.id.properties?.lat) {
        const e = picked.id as Cesium.Entity;
        const t = Cesium.JulianDate.now();
        pickRef.current(e.properties!.lat.getValue(t), e.properties!.lon.getValue(t));
        return;
      }
      const c = viewer.camera.pickEllipsoid(ev.position, scene.globe.ellipsoid);
      if (!c) return;
      const carto = Cesium.Cartographic.fromCartesian(c);
      pickRef.current(Cesium.Math.toDegrees(carto.latitude), Cesium.Math.toDegrees(carto.longitude));
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    let last = 0;
    h.setInputAction((ev: any) => {
      const now = performance.now();
      if (now - last < 50) return;
      last = now;
      const c = viewer.camera.pickEllipsoid(ev.endPosition, scene.globe.ellipsoid);
      if (!c) { setHover(null); return; }
      const carto = Cesium.Cartographic.fromCartesian(c);
      setHover({ lat: Cesium.Math.toDegrees(carto.latitude), lon: Cesium.Math.toDegrees(carto.longitude) });
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    return () => { h.destroy(); viewer.destroy(); viewerRef.current = null; };
  }, []);

  // ---------------------------------------------------------------- basemap
  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    let cancelled = false;
    (async () => {
      let provider: Cesium.ImageryProvider;
      if (p.basemap === 'satellite') {
        const up = new Cesium.UrlTemplateImageryProvider({ url: ESRI_IMG, maximumLevel: 17, credit: 'Esri, Maxar, Earthstar Geographics' });
        let errors = 0;
        up.errorEvent.addEventListener(() => {
          errors += 1;
          if (errors === 6) p.onBasemapFallback();
        });
        provider = up;
      } else {
        provider = await Cesium.TileMapServiceImageryProvider.fromUrl(Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII'));
      }
      if (cancelled) return;
      const layer = new Cesium.ImageryLayer(provider, {});
      if (baseRef.current) v.imageryLayers.remove(baseRef.current, true);
      v.imageryLayers.add(layer, 0);
      baseRef.current = layer;
      // Cesium can keep a stale draw order after inserting below existing layers:
      // explicitly push the base down and the analysis overlay / labels up.
      v.imageryLayers.lowerToBottom(layer);
      if (labelsRef.current) v.imageryLayers.raiseToTop(labelsRef.current);
    })();
    return () => { cancelled = true; };
  }, [p.basemap]);

  // ---------------------------------------------------------------- reference labels
  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    if (p.showLabels && !labelsRef.current) {
      const lp = new Cesium.UrlTemplateImageryProvider({ url: ESRI_LABELS, maximumLevel: 13, credit: 'Esri' });
      labelsRef.current = v.imageryLayers.addImageryProvider(lp);
    } else if (!p.showLabels && labelsRef.current) {
      v.imageryLayers.remove(labelsRef.current, true);
      labelsRef.current = null;
    }
    if (labelsRef.current) v.imageryLayers.raiseToTop(labelsRef.current);
  }, [p.showLabels]);

  // ---------------------------------------------------------------- heatmap with cross-fade
  // The overlay is drawn as a textured rectangle primitive (not an imagery layer): this
  // composites reliably above any basemap on every WebGL implementation we tested.
  const alphaRef = useRef(p.overlayAlpha);
  alphaRef.current = p.overlayAlpha;
  useEffect(() => {
    const v = viewerRef.current;
    if (!v || !p.heatmapUrl) return;
    let cancelled = false;
    p.onLoading(true);
    const img = new Image();
    img.onload = () => {
      if (cancelled || v.isDestroyed()) return;
      let fade = 0;
      const entity = v.entities.add({
        rectangle: {
          coordinates: Cesium.Rectangle.fromDegrees(-180, -90, 180, 90),
          material: new Cesium.ImageMaterialProperty({
            image: img, transparent: true,
            color: new Cesium.CallbackProperty(() => Cesium.Color.WHITE.withAlpha(alphaRef.current * fade), false) as any,
          }),
        },
      });
      const old = heatRef.current;
      heatRef.current = { entity, setFade: (f: number) => { fade = f; } };
      const t0 = performance.now();
      const step = () => {
        if (v.isDestroyed()) return;
        const t = Math.min(1, (performance.now() - t0) / 450);
        fade = t;
        old?.setFade(1 - t);
        if (t < 1) requestAnimationFrame(step);
        else if (old) v.entities.remove(old.entity);
      };
      requestAnimationFrame(step);
      p.onLoading(false);
    };
    img.onerror = () => { if (!cancelled) { console.error('heatmap load failed'); p.onLoading(false); } };
    img.src = p.heatmapUrl;
    return () => { cancelled = true; };
  }, [p.heatmapUrl]);

  // ---------------------------------------------------------------- grid
  useEffect(() => { if (gridRef.current) gridRef.current.show = p.showGrid; }, [p.showGrid]);

  // ---------------------------------------------------------------- ranked markers
  useEffect(() => {
    const ds = markRef.current;
    if (!ds) return;
    ds.entities.removeAll();
    ds.show = p.showMarkers;
    for (const m of p.markers) {
      ds.entities.add({
        position: Cesium.Cartesian3.fromDegrees(m.lon, m.lat),
        properties: { lat: m.lat, lon: m.lon },
        point: {
          pixelSize: 22, color: Cesium.Color.fromCssColorString(m.flagged ? '#8a8f99' : '#0b0f16').withAlpha(0.92),
          outlineColor: Cesium.Color.fromCssColorString(m.flagged ? '#c9ccd2' : '#4fa3ff'), outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: String(m.rank), font: '600 12px Inter, sans-serif', fillColor: Cesium.Color.WHITE,
          verticalOrigin: Cesium.VerticalOrigin.CENTER, horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    }
  }, [p.markers, p.showMarkers]);

  // ---------------------------------------------------------------- analog sites
  useEffect(() => {
    const ds = siteRef.current;
    if (!ds) return;
    ds.entities.removeAll();
    ds.show = p.showSites;
    for (const s of p.sites) {
      ds.entities.add({
        position: Cesium.Cartesian3.fromDegrees(s.lon, s.lat),
        properties: { lat: s.lat, lon: s.lon },
        point: {
          pixelSize: 9, color: Cesium.Color.fromCssColorString(s.body === 'mars' ? '#e0773b' : '#d9dee7'),
          outlineColor: Cesium.Color.BLACK, outlineWidth: 1.5, disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: s.name, font: '500 11px Inter, sans-serif', fillColor: Cesium.Color.fromCssColorString('#e6ebf2'),
          showBackground: true, backgroundColor: Cesium.Color.fromCssColorString('#0b0f16').withAlpha(0.75),
          pixelOffset: new Cesium.Cartesian2(10, 0), horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 9e6),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    }
  }, [p.sites, p.showSites]);

  // ---------------------------------------------------------------- selection highlight
  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    if (selRef.current) { v.entities.remove(selRef.current); selRef.current = null; }
    if (!p.selected) return;
    const b = p.selected.bounds ?? [p.selected.lon - 0.125, p.selected.lat - 0.125, p.selected.lon + 0.125, p.selected.lat + 0.125];
    const pad = 0.5;
    selRef.current = v.entities.add({
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray([b[0] - pad, b[1] - pad, b[2] + pad, b[1] - pad, b[2] + pad, b[3] + pad, b[0] - pad, b[3] + pad, b[0] - pad, b[1] - pad]),
        width: 2, material: Cesium.Color.fromCssColorString('#4fa3ff'), clampToGround: false,
      },
      rectangle: {
        coordinates: Cesium.Rectangle.fromDegrees(b[0], b[1], b[2], b[3]),
        material: Cesium.Color.fromCssColorString('#4fa3ff').withAlpha(0.18),
        outline: false,
      },
    });
  }, [p.selected]);

  // ---------------------------------------------------------------- camera
  useEffect(() => {
    const v = viewerRef.current;
    if (!v || !p.flyTo) return;
    v.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(p.flyTo.lon, p.flyTo.lat, p.flyTo.height ?? 1.6e6), duration: 1.6 });
  }, [p.flyTo]);
  useEffect(() => {
    const v = viewerRef.current;
    if (!v || p.resetNonce === 0) return;
    v.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(HOME.lon, HOME.lat, HOME.height), duration: 1.4 });
  }, [p.resetNonce]);

  const zoom = (f: number) => {
    const v = viewerRef.current;
    if (!v) return;
    const h = v.camera.positionCartographic.height;
    if (f > 1) v.camera.zoomOut(h * (f - 1));
    else v.camera.zoomIn(h * (1 - f));
  };

  return (
    <div className="relative w-full h-full">
      <div ref={el} className="absolute inset-0" />
      {failed && (
        <div className="absolute inset-0 grid place-items-center text-sm text-red-300 p-8 text-center">
          3D globe could not start (WebGL unavailable?): {failed}
        </div>
      )}
      <div className="absolute bottom-24 right-3 z-10 flex flex-col overflow-hidden rounded-xl border border-ink-600 bg-ink-900/90 shadow-float backdrop-blur">
        {[['+', () => zoom(0.6)], ['−', () => zoom(1.7)]].map(([t, f], i) => (
          <button key={t as string} onClick={f as () => void} className={`grid h-9 w-9 place-items-center text-lg leading-none text-mute-200 transition-colors hover:bg-ink-750 hover:text-white ${i ? 'border-t border-ink-700' : ''}`} aria-label={t === '+' ? 'Zoom in' : 'Zoom out'}>{t as string}</button>
        ))}
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 hidden rounded-lg border border-ink-700 bg-ink-900/85 px-2.5 py-1 font-mono text-2xs text-mute-300 backdrop-blur sm:block">
        {hover ? `${fmtLat(hover.lat)}  ${fmtLon(hover.lon)}` : 'Move cursor over globe'}
      </div>
    </div>
  );
}

function buildGrid(ds: Cesium.CustomDataSource) {
  const col = Cesium.Color.fromCssColorString('#9fb3c8').withAlpha(0.28);
  for (let lat = -75; lat <= 75; lat += 15) {
    const pts: number[] = [];
    for (let lon = -180; lon <= 180; lon += 5) pts.push(lon, lat);
    ds.entities.add({ polyline: { positions: Cesium.Cartesian3.fromDegreesArray(pts), width: lat === 0 ? 1.5 : 1, material: col, arcType: Cesium.ArcType.RHUMB } });
    ds.entities.add({
      position: Cesium.Cartesian3.fromDegrees(0, lat),
      label: { text: `${Math.abs(lat)}°${lat > 0 ? 'N' : lat < 0 ? 'S' : ''}`, font: '10px JetBrains Mono, monospace', fillColor: Cesium.Color.fromCssColorString('#c7d2de'), pixelOffset: new Cesium.Cartesian2(4, -6), horizontalOrigin: Cesium.HorizontalOrigin.LEFT },
    });
  }
  for (let lon = -180; lon < 180; lon += 15) {
    const pts: number[] = [];
    for (let lat = -88; lat <= 88; lat += 4) pts.push(lon, lat);
    ds.entities.add({ polyline: { positions: Cesium.Cartesian3.fromDegreesArray(pts), width: 1, material: col } });
    ds.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lon, 0),
      label: { text: `${Math.abs(lon)}°${lon > 0 ? 'E' : lon < 0 ? 'W' : ''}`, font: '10px JetBrains Mono, monospace', fillColor: Cesium.Color.fromCssColorString('#c7d2de'), pixelOffset: new Cesium.Cartesian2(4, 10), horizontalOrigin: Cesium.HorizontalOrigin.LEFT },
    });
  }
}
