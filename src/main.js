import * as THREE from 'https://esm.sh/three@0.160.0';
import { OrbitControls } from 'https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import GUI from 'https://esm.sh/lil-gui@0.19';

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setScissorTest(true);
document.body.appendChild(renderer.domElement);

// ==========================
// Scene 1 (3D Geometry View)
// ==========================

const sceneView = new THREE.Scene();
sceneView.background = new THREE.Color(0x111111);

const cameraView = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / (window.innerHeight * 0.6),
    0.01,
    1000
);

cameraView.position.set(0, 0, 0.001);

const controls = new OrbitControls(cameraView, renderer.domElement);
controls.enableZoom = false;
controls.enablePan = false;
controls.minDistance = 0.001;
controls.maxDistance = 0.001;

const sphereGeo = new THREE.SphereGeometry(20, 64, 64);
sphereGeo.scale(-1, 1, 1);
const sphereMat = new THREE.MeshBasicMaterial();
const sphere = new THREE.Mesh(sphereGeo, sphereMat);
sceneView.add(sphere);

// ==========================
// Scene 3 (Geometry / Free View)
// ==========================

const sceneGeometry = new THREE.Scene();
sceneGeometry.background = new THREE.Color(0x1a1a2e);

const cameraFree = new THREE.PerspectiveCamera(60, window.innerWidth / (window.innerHeight / 3), 0.01, 1000);
cameraFree.position.set(5, 3, 5);

const controlsFree = new OrbitControls(cameraFree, renderer.domElement);
controlsFree.target.set(0, 0, 1);
controlsFree.update();

// Small sphere to mark the pinhole origin
const originMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xff4444 })
);
sceneGeometry.add(originMarker);

// Cylinder visualization
let cylinderMesh;

function createCylinder(radius, length, offset) {
    if (cylinderMesh) sceneGeometry.remove(cylinderMesh);
    const geo = new THREE.CylinderGeometry(radius, radius, length, 64, 1, true);
    geo.translate(0, offset + length / 2, 0);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        wireframe: true,
        transparent: true,
        opacity: 0.4
    });
    cylinderMesh = new THREE.Mesh(geo, mat);
    sceneGeometry.add(cylinderMesh);
}

let rayGroup = new THREE.Group();
sceneGeometry.add(rayGroup);

function updateRays() {

    rayGroup.clear();

    if (!params.showRays) return;

    const samples = 16;

    for (let i = 0; i < samples; i++) {
        for (let j = 0; j < samples; j++) {

            const u = i / (samples - 1);
            const v = j / (samples - 1);

            const theta = u * 2 * Math.PI;
            const h = v * params.length;

            const P = new THREE.Vector3(
                params.radius * Math.cos(theta),
                params.radius * Math.sin(theta),
                params.offset + h
            );

            const dir = P.clone().normalize();

            const geometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                P
            ]);

            const line = new THREE.Line(
                geometry,
                new THREE.LineBasicMaterial({ color: 0xffff00 })
            );

            rayGroup.add(line);
        }
    }
}


// ==========================
// Scene 2 (Unwrapped)
// ==========================

const sceneCylinder = new THREE.Scene();
const cameraOrtho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const vertexShader = `
varying vec2 vUv;
void main(){
    vUv = uv;
    gl_Position = vec4(position.xy, 0., 1.);
}
`;

const fragmentShader = `
precision highp float;

uniform sampler2D envTex;
uniform mat3 cameraRotation;
uniform float radius;
uniform float length;
uniform float offset;
uniform float cutOffset;
uniform bool mirror;
uniform bool showGrid;

varying vec2 vUv;

const float PI = 3.14159265359;

void main() {

    float xCoord = mirror ? (1.0 - vUv.x) : vUv.x;
    float theta = fract(xCoord + cutOffset) * 2.0 * PI;
    float h = vUv.y * length;

    vec3 P = vec3(
        radius * cos(theta),
        radius * sin(theta),
        offset + h
    );

    vec3 dir = normalize(cameraRotation * P);

    float lon = atan(dir.z, dir.x);
    float lat = asin(dir.y);

    float u = lon / (2.0 * PI) + 0.5;
    float v = lat / PI + 0.5;

    vec3 color = texture2D(envTex, vec2(u, v)).rgb;

    if (showGrid) {
        float gridLon = abs(fract(lon / (PI / 12.0)) - 0.5);
        float gridLat = abs(fract(lat / (PI / 12.0)) - 0.5);
        float line = step(gridLon, 0.02) + step(gridLat, 0.02);
        color = mix(color, vec3(1.0, 0.0, 0.0), line);
    }

    gl_FragColor = vec4(color, 1.0);
}
`;

const quad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
        uniforms: {
            envTex: { value: null },
            cameraRotation: { value: new THREE.Matrix3() },
            radius: { value: 1 },
            length: { value: 2 },
            offset: { value: 0.5 },
            cutOffset: { value: 0 },
            mirror: { value: false },
            showGrid: { value: false }
        },
        vertexShader,
        fragmentShader
    })
);

sceneCylinder.add(quad);

// ==========================
// GUI
// ==========================

const params = {
    radius: 1,
    length: 2,
    offset: 0.5,
    cutOffset: 0,
    mirror: false,
    freeView: false,
    showGrid: false,
    showRays: false
};

const gui = new GUI();

gui.add(params, 'radius', 0.1, 5).onChange(updateAll);
gui.add(params, 'length', 0.1, 10).onChange(updateAll);
gui.add(params, 'offset', 0, 5).onChange(updateAll);
gui.add(params, 'cutOffset', 0, 1).onChange(v => quad.material.uniforms.cutOffset.value = v);
gui.add(params, 'mirror').onChange(v => quad.material.uniforms.mirror.value = v);
gui.add(params, 'freeView').onChange(toggleFreeView);
gui.add(params, 'showGrid').onChange(v => quad.material.uniforms.showGrid.value = v);
gui.add({ measure: computeAngularResolution }, 'measure');
gui.add({ exportPNG: exportImage }, 'exportPNG');
gui.add(params, 'showRays').onChange(updateRays);

function updateAll() {
    quad.material.uniforms.radius.value = params.radius;
    quad.material.uniforms.length.value = params.length;
    quad.material.uniforms.offset.value = params.offset;
    createCylinder(params.radius, params.length, params.offset);
    updateRays();
}
updateAll();

function toggleFreeView() {
    // Reset the free camera to a sensible position when enabling
    if (params.freeView) {
        cameraFree.position.set(5, 3, 5);
        controlsFree.target.set(0, 0, params.offset + params.length / 2);
        controlsFree.update();
    }
}

function exportImage() {

    const w = renderer.domElement.width;
    const h = renderer.domElement.height;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");

    // Crop just the bottom panel from the WebGL canvas.
    // Canvas Y=0 is top; the bottom panel sits at the top of the WebGL canvas
    // because Three.js renders it last into viewport y=0 (WebGL bottom = canvas top after flip).
    ctx.drawImage(
        renderer.domElement,
        0, 0,            // source x, y
        w, h, // source width, height
        0, 0,            // destination x, y
        w, h  // destination width, height
    );

    const link = document.createElement("a");
    link.download = "cylinder_projection.png";
    link.href = canvas.toDataURL();
    link.click();
}

function computeAngularResolution() {

    const r = params.radius;
    const d = params.offset;

    const anglePerCircumference = 360;
    const circumference = 2 * Math.PI * r;

    const degPerUnit = anglePerCircumference / circumference;

    const verticalAngle = Math.atan(params.length / d) * (180 / Math.PI);

    console.log("Horizontal deg per world unit:", degPerUnit.toFixed(3));
    console.log("Approx vertical FOV:", verticalAngle.toFixed(2), "deg");
}

// ==========================
// Texture Loading
// ==========================

const loader = new THREE.TextureLoader();

document.getElementById('fileInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    loader.load(url, tex => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        sphereMat.map = tex;
        sphereMat.needsUpdate = true;
        quad.material.uniforms.envTex.value = tex;
    });
});

// ==========================
// Resize
// ==========================

window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    // Aspect ratios are recalculated each frame in the render loop
});

// ==========================
// Render Loop
// ==========================

function render() {
    requestAnimationFrame(render);

    controls.update();
    controlsFree.update();

    cameraView.updateMatrixWorld();
    const rot = new THREE.Matrix3().setFromMatrix4(cameraView.matrixWorld);
    quad.material.uniforms.cameraRotation.value = rot;

    const w = window.innerWidth;
    const h = window.innerHeight;

    if (params.freeView) {
        // Top half split vertically: left = panorama, right = geometry
        const topH = Math.floor(h * 0.6);
        const bottomH = h - topH;
        const halfW = Math.floor(w / 2);

        // Top-left: panorama view
        renderer.setViewport(0, bottomH, halfW, topH);
        renderer.setScissor(0, bottomH, halfW, topH);
        cameraView.aspect = halfW / topH;
        cameraView.updateProjectionMatrix();
        renderer.render(sceneView, cameraView);

        // Top-right: geometry / free view
        renderer.setViewport(halfW, bottomH, halfW, topH);
        renderer.setScissor(halfW, bottomH, halfW, topH);
        cameraFree.aspect = halfW / topH;
        cameraFree.updateProjectionMatrix();
        renderer.render(sceneGeometry, cameraFree);

        // Bottom: unwrapped film (full width)
        renderer.setViewport(0, 0, w, bottomH);
        renderer.setScissor(0, 0, w, bottomH);
        renderer.render(sceneCylinder, cameraOrtho);

    } else {
        // Two panels: top 60% panorama, bottom 40% film
        const topH = Math.floor(h * 0.6);
        const bottomH = h - topH;

        cameraView.aspect = w / topH;
        cameraView.updateProjectionMatrix();

        renderer.setViewport(0, bottomH, w, topH);
        renderer.setScissor(0, bottomH, w, topH);
        renderer.render(sceneView, cameraView);

        renderer.setViewport(0, 0, w, bottomH);
        renderer.setScissor(0, 0, w, bottomH);
        renderer.render(sceneCylinder, cameraOrtho);
    }
}

render();