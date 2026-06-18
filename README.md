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

## Controls

A GUI panel (top-right) lets you adjust:

- **filmType** — `plane` or `cylinder`
- **Plane**: `filmWidth`, `filmHeight`
- **Cylinder**: `radius`, `thetaStart`, `thetaLength`, `cylinderHeight`
- **Tilt**: `rotX`, `rotY`, `rotZ`
- **Offset**: `dx`, `dy`, `dz`

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
for the controls, both loaded from a CDN — no build step or install required.
