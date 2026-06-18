import * as THREE from 'https://esm.sh/three@0.160.0';
import { OrbitControls } from 'https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import GUI from 'https://esm.sh/lil-gui@0.19';

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
    dz: 0
};

let filmMesh = null;

// ----------------------------------------------------
// Environment Texture
// ----------------------------------------------------

let envTex = null;

console.log("huhu")
const textureLoader = new THREE.TextureLoader();
textureLoader.load("./equi.jpg", (tex) => {
    console.log("haha")
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearFilter;

    envTex = tex;
    uniforms.envTex.value = envTex;

    buildEnvironmentSphere(tex);
    rebuildFilm();   // build film (and flat view) only after texture ready
});

document.getElementById('fileInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    textureLoader.load(url, tex => {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.minFilter = THREE.LinearFilter;

        envTex = tex;
        uniforms.envTex.value = envTex;

        buildEnvironmentSphere(tex);
        rebuildFilm();   // build film (and flat view) only after texture ready
    });
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

void main() {

    // ray from pinhole (origin) to film surface
    vec3 dir = normalize(vWorldPos);

    float lon = atan(dir.x, dir.z);
    float lat = asin(dir.y);

    float u = 1.0 - (lon / (2.0 * PI) + 0.5);
    float v = 1.0 - (lat / PI + 0.5);

    vec3 color = texture2D(envTex, vec2(u, v)).rgb;

    gl_FragColor = vec4(color, 1.0);
}
`;

const uniforms = {
    envTex: { value: envTex }
};

// ----------------------------------------------------
// Film Builders
// ----------------------------------------------------

function buildEnvironmentSphere(texture) {
    const geometry = new THREE.SphereGeometry(100, 64, 64);
    geometry.scale(1, 1, -1);
    geometry.rotateY(Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.DoubleSide
    });
    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);
}

function buildPlaneFilm() {
    const geometry = new THREE.PlaneGeometry(
        params.filmWidth,
        params.filmHeight,
        128,
        128
    );

    const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader,
        fragmentShader,
        side: THREE.DoubleSide
    });

    filmMesh = new THREE.Mesh(geometry, material);
    filmMesh.position.set(params.dx, params.dy, params.dz);

    scene.add(filmMesh);
}

function buildCylinderFilm() {

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
    geometry.translate(params.dx, params.dy + params.cylinderHeight / 2, params.dz);

    const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader,
        fragmentShader,
        side: THREE.DoubleSide
    });

    filmMesh = new THREE.Mesh(geometry, material);

    // Rotate so cylinder wraps around Z axis
    filmMesh.rotation.x = Math.PI / 2;

    scene.add(filmMesh);
}

function rebuildFilm() {
    if (filmMesh) {
        scene.remove(filmMesh);
        filmMesh.geometry.dispose();
        filmMesh.material.dispose();
        filmMesh = null;
    }

    if (params.filmType === FilmType.PLANE) {
        buildPlaneFilm();
    } else {
        buildCylinderFilm();
    }

    updateFilmTransform();
    buildFlatView();
    // buildRays(100); // lower number = more rays
}


let rayLines = null;

function buildRays(sampleStep = 10) {

    if (!filmMesh) return;

    if (rayLines) {
        scene.remove(rayLines);
        rayLines.geometry.dispose();
    }

    const positions = [];

    const geom = filmMesh.geometry;
    const posAttr = geom.attributes.position;

    const tempVec = new THREE.Vector3();

    for (let i = 0; i < posAttr.count; i += sampleStep) {

        tempVec.fromBufferAttribute(posAttr, i);

        // convert to world space
        filmMesh.localToWorld(tempVec);

        // origin
        positions.push(0, 0, 0);

        // film point
        positions.push(tempVec.x, tempVec.y, tempVec.z);
    }

    const rayGeometry = new THREE.BufferGeometry();
    rayGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3)
    );

    const rayMaterial = new THREE.LineBasicMaterial({
        color: 0xffaa00
    });

    rayLines = new THREE.LineSegments(rayGeometry, rayMaterial);
    scene.add(rayLines);
}


function updateFilmTransform() {
    if (!filmMesh) return;

    filmMesh.rotation.x += params.rotX;
    filmMesh.rotation.y += params.rotY;
    filmMesh.rotation.z += params.rotZ;
}

// ----------------------------------------------------
// GUI
// ----------------------------------------------------

const gui = new GUI();

gui.add(params, "filmType", Object.values(FilmType))
    .onChange(rebuildFilm);

gui.add(params, "filmWidth", 0.1, 5).onChange(rebuildFilm);
gui.add(params, "filmHeight", 0.1, 5).onChange(rebuildFilm);
gui.add(params, "filmDistance", 0.1, 10).onChange(rebuildFilm);

gui.add(params, "radius", 0.5, 10).onChange(rebuildFilm);
gui.add(params, "thetaStart", -Math.PI, Math.PI).onChange(rebuildFilm);
gui.add(params, "thetaLength", 0.1, 2 * Math.PI).onChange(rebuildFilm);
gui.add(params, "cylinderHeight", 0.1, 5).onChange(rebuildFilm);

gui.add(params, "rotX", -Math.PI, Math.PI).onChange(rebuildFilm);
gui.add(params, "rotY", -Math.PI, Math.PI).onChange(rebuildFilm);
gui.add(params, "rotZ", -Math.PI, Math.PI).onChange(rebuildFilm);

gui.add(params, "dx", -10, 10).onChange(rebuildFilm);
gui.add(params, "dy", -10, 10).onChange(rebuildFilm);
gui.add(params, "dz", -10, 10).onChange(rebuildFilm);

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

const flatRenderer = new THREE.WebGLRenderer({ antialias: true });
flatRenderer.domElement.id = "flatView";
document.body.appendChild(flatRenderer.domElement);

const flatScene = new THREE.Scene();
const flatCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
flatCamera.position.z = 1;

let flatMesh = null;

// Lays vertices out flat from UVs; keeps the real film point for sampling.
const flatVertexShader = `
attribute vec3 aFilmPos;
varying vec3 vWorldPos;

void main() {
    vWorldPos = aFilmPos;
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

    filmMesh.updateMatrixWorld(true);

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
    const filmPos = new Float32Array(posAttr.count * 3);
    const v = new THREE.Vector3();

    for (let i = 0; i < posAttr.count; i++) {
        // real world-space film point -> ray direction for env sampling
        v.fromBufferAttribute(posAttr, i);
        filmMesh.localToWorld(v);
        filmPos[i * 3] = v.x;
        filmPos[i * 3 + 1] = v.y;
        filmPos[i * 3 + 2] = v.z;

        // flat layout straight from the surface UVs
        const u = uvAttr.getX(i);
        const w = uvAttr.getY(i);
        flatPos[i * 3] = (u - 0.5) * physW;
        flatPos[i * 3 + 1] = (w - 0.5) * physH;
        flatPos[i * 3 + 2] = 0;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(flatPos, 3));
    geom.setAttribute("aFilmPos", new THREE.BufferAttribute(filmPos, 3));
    if (srcGeom.index) geom.setIndex(srcGeom.index.clone());

    const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: flatVertexShader,
        fragmentShader, // same environment sampling as the in-scene film
        side: THREE.DoubleSide
    });

    flatMesh = new THREE.Mesh(geom, material);
    flatScene.add(flatMesh);

    // frame the ortho camera to the unwrapped extents
    flatCamera.left = -physW / 2;
    flatCamera.right = physW / 2;
    flatCamera.top = physH / 2;
    flatCamera.bottom = -physH / 2;
    flatCamera.updateProjectionMatrix();

    // size the panel to the film aspect ratio
    const panelW = 360;
    const panelH = Math.max(1, Math.round((panelW * physH) / physW));
    flatRenderer.setSize(panelW, panelH);
}

// ----------------------------------------------------
// Init
// ----------------------------------------------------

rebuildFilm();

window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ----------------------------------------------------
// Render Loop
// ----------------------------------------------------
let animation;
function animate() {

    renderer.render(scene, camera);
    if (flatMesh) flatRenderer.render(flatScene, flatCamera);
    animation = requestAnimationFrame(animate);
}

animate();
