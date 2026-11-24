# pinhole-simulator

An interactive simulator for pinhole cameras with non-planar film surfaces.

It maps an equirectangular panorama onto a large environment sphere and places a
"film" surface near the pinhole (the origin). A shader on the film samples the
environment along the ray from the pinhole to each point on the film, so you can
see exactly what the camera projects onto the film — for flat **or** curved film.

## Views

- **In-scene film** — the film surface (plane or cylinder) rendered in 3D inside
  the environment, so you can see its shape, tilt, and placement relative to the
  pinhole. Orbit with the mouse.
- **Unwrapped flat view** — a panel in the bottom-right that shows the film
  "developed" flat: the curved/tilted surface is laid out using its UV
  parameterisation (a cylinder's angular sweep unwraps to horizontal, its height
  to vertical) while each point still samples the environment along its true ray.
  It is the same projection as the in-scene film, just flattened, and is sized to
  the film's real aspect ratio.

The film samples the environment along the *incoming* light direction: light
reaching film point P passed through the pinhole at the origin, so it came from
direction −P. That is why the image on the film is inverted.

## Controls

A GUI panel (top-right) lets you adjust:

- **filmType** — `plane` or `cylinder`
- **Plane**: `filmWidth`, `filmHeight`
- **Cylinder**: `radius`, `thetaStart`, `thetaLength`, `cylinderHeight`
- **Tilt**: `rotX`, `rotY`, `rotZ`
- **Offset**: `dx`, `dy`, `dz`
- **showRays** — draw rays from points on the film back through the pinhole
  into the scene
- **uprightFlatView** — the film image is inverted (rotated 180°), as on a real
  negative; this shows the flat view the right way up
- **exportPNG** — save the flat view as a PNG (2048 px on the long side)
- **Settings**: `download JSON` saves the current settings to a file,
  `upload JSON` loads them back, `reset` restores the defaults

Settings are saved automatically in the browser (`localStorage`) after every
change and restored when the page is reloaded.

### Presets

The **Presets** folder loads ready-made settings for the omniscope cameras
([omniscope-pinhole](https://github.com/fnordjes/omniscope-pinhole)). They are
plain settings files in `src/presets/`, so `upload JSON` takes them too, and a
new preset is a JSON file plus one line in `PRESETS` in `main.js`. One unit is 10 mm. The camera axis is vertical with the pinhole on
top, so the film band sits below the pinhole and images the surroundings above
the horizon.

| File | Camera | Film radius | Image band | Pinhole to band | Film arc |
|---|---|---|---|---|---|
| `omniscope-120.json` | 120 cartridge rig | 28 mm | 57.5 mm (61 mm film minus the ring edges) | 9.5 mm | 310° |
| `omniscope-35mm.json` | 35 mm rig | 20 mm | 35 mm (full width, perforations included) | 8.25 mm | 295° |

Use the file picker (top-left) to load your own equirectangular (2:1) panorama;
otherwise the bundled `equi.jpg` is used.

## Running

The app is a static site that uses ES modules, so it needs to be served over HTTP
(opening `index.html` directly won't work). From the repo root:

```sh
python -m http.server 8777 --directory src
```

Then open <http://localhost:8777>.

## Tech

[three.js](https://threejs.org/) for rendering and [lil-gui](https://lil-gui.georgealways.com/)
for the controls, both loaded from jsDelivr through the import map in
`index.html` (pinned versions) — no build step or install required.
