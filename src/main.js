import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import GUI from 'lil-gui';

// ----------------------------------------------------
// Basic Three Setup
// ----------------------------------------------------

const scene = new THREE.Scene();

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
camera.position.set(0, 0, 5);

const controls = new OrbitControls(camera, renderer.domElement);

// ----------------------------------------------------
// Parameters
// ----------------------------------------------------

const FilmType = {
    PLANE: "plane",
    CYLINDER: "cylinder"
};

const params = {
    filmType: FilmType.PLANE,

    // plane params
    filmWidth: 2,
    filmHeight: 1.5,
    filmDistance: 2,

    // cylinder params
    radius: 2,
    thetaStart: -Math.PI / 2,
    thetaLength: Math.PI,
    cylinderHeight: 1.5,

    // tilt
    rotX: 0,
    rotY: 0,
    rotZ: 0,

    // offset
    dx: 0,
    dy: 0,
    dz: 0,

    // view
    showRays: false,
    uprightFlatView: false
};

let filmMesh = null;

// ----------------------------------------------------
// Environment Texture
// ----------------------------------------------------

let envTex = null;

const textureLoader = new THREE.TextureLoader();

function loadPanorama(url, onLoaded) {
    textureLoader.load(url, tex => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.minFilter = THREE.LinearFilter;

        if (envTex) envTex.dispose();
        envTex = tex;
        uniforms.envTex.value = envTex;

        buildEnvironmentSphere(tex);
        rebuildFilm();   // build film (and flat view) only after texture ready
        if (onLoaded) onLoaded();
    });
}

loadPanorama("./equi.jpg");

document.getElementById('fileInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    loadPanorama(url, () => URL.revokeObjectURL(url));
});

// ----------------------------------------------------
// Shader
// ----------------------------------------------------

const vertexShader = `
varying vec3 vWorldPos;

void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const fragmentShader = `
uniform sampler2D envTex;
varying vec3 vWorldPos;

const float PI = 3.14159265359;

// Equirectangular UV of a world direction, matching the environment
// sphere's mapping (see buildEnvironmentSphere), so a direction samples
// the same texel the sphere shows there. u relies on RepeatWrapping.
vec2 dirToEquirectUV(vec3 d) {
    float lon = atan(d.x, d.z);
    float lat = asin(clamp(d.y, -1.0, 1.0));
    return vec2(-lon / (2.0 * PI), 0.5 + lat / PI);
}

void main() {

    // Light reaching a film point P passed through the pinhole (origin), so
    // it came from direction -P. This is what makes the image inverted.
    vec3 incoming = normalize(-vWorldPos);

    vec3 color = texture2D(envTex, dirToEquirectUV(incoming)).rgb;

    gl_FragColor = vec4(color, 1.0);

    // convert linear -> output color space, like the built-in materials do
    #include <colorspace_fragment>
}
`;

const uniforms = {
    envTex: { value: envTex }
};

// ----------------------------------------------------
// Film Builders
// ----------------------------------------------------

let envSphere = null;

function buildEnvironmentSphere(texture) {
    if (envSphere) {
        scene.remove(envSphere);
        envSphere.geometry.dispose();
        envSphere.material.dispose();
        envSphere = null;
    }

    const geometry = new THREE.SphereGeometry(100, 64, 64);
    geometry.scale(1, 1, -1);
    geometry.rotateY(Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.DoubleSide
    });
    envSphere = new THREE.Mesh(geometry, material);
    scene.add(envSphere);
}

function buildPlaneGeometry() {
    return new THREE.PlaneGeometry(
        params.filmWidth,
        params.filmHeight,
        128,
        128
    );
}

function buildCylinderGeometry() {
    const geometry = new THREE.CylinderGeometry(
        params.radius,
        params.radius,
        params.cylinderHeight,
        256,
        1,
        true,
        params.thetaStart,
        params.thetaLength
    );
    // start the tube at the pinhole instead of centring it there
    geometry.translate(0, params.cylinderHeight / 2, 0);
    return geometry;
}

// Rebuilds the film geometry. Only needed when the film type or its shape
// changes; tilt and offset go through updateFilmTransform().
function rebuildFilm() {
    if (filmMesh) {
        scene.remove(filmMesh);
        filmMesh.geometry.dispose();
        filmMesh.material.dispose();
        filmMesh = null;
    }

    const geometry = params.filmType === FilmType.PLANE
        ? buildPlaneGeometry()
        : buildCylinderGeometry();

    const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader,
        fragmentShader,
        side: THREE.DoubleSide
    });

    filmMesh = new THREE.Mesh(geometry, material);
    scene.add(filmMesh);

    updateFilmTransform();
    buildFlatView();
}

let rayLines = null;

const RAY_GRID = 8;        // rays on an 8x8 grid of the film's UV range
const RAY_LENGTH = 99;     // just inside the environment sphere (radius 100)

// Rays from sampled film points back through the pinhole out to the
// environment, i.e. the path the light took to reach the film.
function updateRays() {
    if (rayLines) {
        scene.remove(rayLines);
        rayLines.geometry.dispose();
        rayLines.material.dispose();
        rayLines = null;
    }

    if (!params.showRays || !filmMesh) return;

    filmMesh.updateMatrixWorld(true);

    const posAttr = filmMesh.geometry.attributes.position;
    const uvAttr = filmMesh.geometry.attributes.uv;
    const onGrid = x => Math.abs(x * RAY_GRID - Math.round(x * RAY_GRID)) < 1e-4;

    const positions = [];
    const p = new THREE.Vector3();
    const far = new THREE.Vector3();

    for (let i = 0; i < posAttr.count; i++) {
        if (!onGrid(uvAttr.getX(i)) || !onGrid(uvAttr.getY(i))) continue;

        p.fromBufferAttribute(posAttr, i);
        filmMesh.localToWorld(p);
        far.copy(p).normalize().multiplyScalar(-RAY_LENGTH);

        positions.push(p.x, p.y, p.z, far.x, far.y, far.z);
    }

    const rayGeometry = new THREE.BufferGeometry();
    rayGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3)
    );

    rayLines = new THREE.LineSegments(
        rayGeometry,
        new THREE.LineBasicMaterial({ color: 0xffaa00 })
    );
    scene.add(rayLines);
}


// Places the film from the tilt / offset params. Cheap: no geometry rebuild,
// and the flat view follows automatically (it reads filmMesh.matrixWorld).
function updateFilmTransform() {
    if (!filmMesh) return;

    if (params.filmType === FilmType.PLANE) {
        // tilts about its own centre, which sits filmDistance in front of
        // the pinhole (on the same +z side the cylinder extends to)
        filmMesh.rotation.set(params.rotX, params.rotY, params.rotZ);
        filmMesh.position.set(params.dx, params.dy, params.filmDistance + params.dz);
    } else {
        // base rotation lays the cylinder axis along +z; the tilt and the
        // offset are applied in that rotated frame, about the pinhole
        filmMesh.rotation.set(Math.PI / 2 + params.rotX, params.rotY, params.rotZ);
        filmMesh.position.set(params.dx, params.dy, params.dz).applyEuler(filmMesh.rotation);
    }

    filmMesh.updateMatrixWorld(true);
    updateRays();
}

// ----------------------------------------------------
// GUI
// ----------------------------------------------------

const gui = new GUI();

gui.add(params, "filmType", Object.values(FilmType))
    .onChange(() => {
        updateShapeFolders();
        rebuildFilm();
    });

const planeFolder = gui.addFolder("Plane");
planeFolder.add(params, "filmWidth", 0.1, 5).onChange(rebuildFilm);
planeFolder.add(params, "filmHeight", 0.1, 5).onChange(rebuildFilm);
planeFolder.add(params, "filmDistance", 0.1, 10).onChange(updateFilmTransform);

const cylinderFolder = gui.addFolder("Cylinder");
cylinderFolder.add(params, "radius", 0.5, 10).onChange(rebuildFilm);
cylinderFolder.add(params, "thetaStart", -Math.PI, Math.PI).onChange(rebuildFilm);
cylinderFolder.add(params, "thetaLength", 0.1, 2 * Math.PI).onChange(rebuildFilm);
cylinderFolder.add(params, "cylinderHeight", 0.1, 5).onChange(rebuildFilm);

const tiltFolder = gui.addFolder("Tilt");
tiltFolder.add(params, "rotX", -Math.PI, Math.PI).onChange(updateFilmTransform);
tiltFolder.add(params, "rotY", -Math.PI, Math.PI).onChange(updateFilmTransform);
tiltFolder.add(params, "rotZ", -Math.PI, Math.PI).onChange(updateFilmTransform);

const offsetFolder = gui.addFolder("Offset");
offsetFolder.add(params, "dx", -10, 10).onChange(updateFilmTransform);
offsetFolder.add(params, "dy", -10, 10).onChange(updateFilmTransform);
offsetFolder.add(params, "dz", -10, 10).onChange(updateFilmTransform);

const viewFolder = gui.addFolder("View");
viewFolder.add(params, "showRays").onChange(updateRays);
viewFolder.add(params, "uprightFlatView").onChange(updateFlatOrientation);
viewFolder.add({ exportPNG: exportFlatView }, "exportPNG");

// only show the shape controls for the current film type
function updateShapeFolders() {
    const isPlane = params.filmType === FilmType.PLANE;
    planeFolder.show(isPlane);
    cylinderFolder.show(!isPlane);
}
updateShapeFolders();

// ----------------------------------------------------
// Helpers
// ----------------------------------------------------

const axes = new THREE.AxesHelper(2);
scene.add(axes);

// ----------------------------------------------------
// Flat (unwrapped) view
// ----------------------------------------------------
//
// A separate overlay panel that shows the film "developed" flat: the
// curved/tilted film surface is laid out using its UV parameterisation,
// while each vertex still samples the environment along the ray from the
// pinhole (origin) to its real world-space position. So it's the same
// projection as the in-scene film, just flattened into a 2D image.

// Drawn by the main renderer into a scissored corner of the canvas (so the
// panorama texture lives in one WebGL context); this div is just its frame.
const flatFrame = document.createElement("div");
flatFrame.id = "flatViewFrame";
document.body.appendChild(flatFrame);

const FLAT_PANEL_MAX = 360;    // longest side of the panel, CSS px
const FLAT_PANEL_MARGIN = 10;
const flatPanel = { width: FLAT_PANEL_MAX, height: FLAT_PANEL_MAX };

const flatScene = new THREE.Scene();
flatScene.background = new THREE.Color(0x000000);
const flatCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
flatCamera.position.z = 1;

let flatMesh = null;
let flatAspect = 1;   // physical width / height of the unwrapped film

// Lays vertices out flat from UVs; keeps the real film point for sampling.
// aFilmPos is the film-local point; filmMatrix (the film's matrixWorld)
// places it, so tilting / moving the film needs no rebuild here.
const flatVertexShader = `
attribute vec3 aFilmPos;
uniform mat4 filmMatrix;
varying vec3 vWorldPos;

void main() {
    vWorldPos = (filmMatrix * vec4(aFilmPos, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

function buildFlatView() {
    if (!filmMesh || !envTex) return;

    if (flatMesh) {
        flatScene.remove(flatMesh);
        flatMesh.geometry.dispose();
        flatMesh.material.dispose();
        flatMesh = null;
    }

    const srcGeom = filmMesh.geometry;
    const posAttr = srcGeom.attributes.position;
    const uvAttr = srcGeom.attributes.uv;

    // physical extents of the unwrapped film (used for aspect / framing)
    let physW, physH;
    if (params.filmType === FilmType.PLANE) {
        physW = params.filmWidth;
        physH = params.filmHeight;
    } else {
        physW = params.radius * params.thetaLength; // arc length
        physH = params.cylinderHeight;
    }

    const flatPos = new Float32Array(posAttr.count * 3);

    for (let i = 0; i < posAttr.count; i++) {
        // flat layout straight from the surface UVs
        const u = uvAttr.getX(i);
        const w = uvAttr.getY(i);
        flatPos[i * 3] = (u - 0.5) * physW;
        flatPos[i * 3 + 1] = (w - 0.5) * physH;
        flatPos[i * 3 + 2] = 0;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(flatPos, 3));
    geom.setAttribute("aFilmPos", posAttr.clone());
    if (srcGeom.index) geom.setIndex(srcGeom.index.clone());

    const material = new THREE.ShaderMaterial({
        uniforms: {
            envTex: uniforms.envTex,
            // same Matrix4 object, so it tracks the film's transform
            filmMatrix: { value: filmMesh.matrixWorld }
        },
        vertexShader: flatVertexShader,
        fragmentShader, // same environment sampling as the in-scene film
        side: THREE.DoubleSide
    });

    flatMesh = new THREE.Mesh(geom, material);
    flatScene.add(flatMesh);
    flatFrame.style.display = "block";

    // frame the ortho camera to the unwrapped extents
    flatCamera.left = -physW / 2;
    flatCamera.right = physW / 2;
    flatCamera.top = physH / 2;
    flatCamera.bottom = -physH / 2;
    flatCamera.updateProjectionMatrix();

    // size the panel to the film aspect ratio, longest side FLAT_PANEL_MAX
    flatAspect = physW / physH;
    const [w, h] = fitLongSide(flatAspect, FLAT_PANEL_MAX);
    flatPanel.width = w;
    flatPanel.height = h;
    flatFrame.style.width = `${w}px`;
    flatFrame.style.height = `${h}px`;
}

// width / height in whole pixels for an aspect ratio, longest side = size
function fitLongSide(aspect, size) {
    return aspect >= 1
        ? [size, Math.max(1, Math.round(size / aspect))]
        : [Math.max(1, Math.round(size * aspect)), size];
}

// The film image is inverted (rotated 180 degrees) like a real negative.
// "Upright" rotates the flat view's camera to show it the right way up.
function updateFlatOrientation() {
    flatCamera.rotation.z = params.uprightFlatView ? Math.PI : 0;
}

// Saves the flat view at a higher resolution than the on-screen panel.
function exportFlatView() {
    if (!flatMesh) return;

    const [w, h] = fitLongSide(flatAspect, 2048);

    // temporarily resize the drawing buffer only (not the CSS size), render
    // just the flat view, and read back immediately: no
    // preserveDrawingBuffer needed. Then restore and redraw before the
    // browser shows the canvas, so nothing flickers.
    renderer.setSize(w, h, false);
    renderer.setScissorTest(false);
    renderer.render(flatScene, flatCamera);
    const dataURL = renderer.domElement.toDataURL("image/png");
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderFrame();

    const link = document.createElement("a");
    link.download = `pinhole_${params.filmType}.png`;
    link.href = dataURL;
    link.click();
}

// ----------------------------------------------------
// Init
// ----------------------------------------------------

rebuildFilm();
updateFlatOrientation();

window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ----------------------------------------------------
// Render Loop
// ----------------------------------------------------
function renderFrame() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, width, height);
    renderer.render(scene, camera);

    if (flatMesh) {
        // viewport / scissor origin is bottom-left; panel sits bottom-right
        const x = width - FLAT_PANEL_MARGIN - flatPanel.width;
        const y = FLAT_PANEL_MARGIN;
        renderer.setViewport(x, y, flatPanel.width, flatPanel.height);
        renderer.setScissor(x, y, flatPanel.width, flatPanel.height);
        renderer.setScissorTest(true);
        renderer.render(flatScene, flatCamera);
        renderer.setScissorTest(false);
    }
}

function animate() {
    renderFrame();
    requestAnimationFrame(animate);
}

animate();
