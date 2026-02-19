import * as THREE from 'https://esm.sh/three@0.160.0';
import { OrbitControls } from 'https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import GUI from 'https://esm.sh/lil-gui@0.19';

const renderer = new THREE.WebGLRenderer({ antialias: true });
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

// Cylinder visualization
let cylinderMesh;

function createCylinder(radius, length, offset) {
    if (cylinderMesh) sceneView.remove(cylinderMesh);
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
    sceneView.add(cylinderMesh);
}

let rayGroup = new THREE.Group();
sceneView.add(rayGroup);

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
    //createCylinder(params.radius, params.length, params.offset);
    updateRays();
}
updateAll();

function toggleFreeView() {
    if (params.freeView) {
        controls.enableZoom = true;
        controls.enablePan = true;
        controls.minDistance = 0.1;
        controls.maxDistance = 50;
        controls.target.set(0, params.offset + params.length / 2, 0);
        cameraView.position.set(5, 5, 5);
    } else {
        controls.enableZoom = false;
        controls.enablePan = false;
        controls.minDistance = 0.001;
        controls.maxDistance = 0.001;
        cameraView.position.set(0, 0, 0.001);
        controls.target.set(0, 0, 0);
    }
    controls.update();
}

function exportImage() {

    const w = renderer.domElement.width;
    const h = renderer.domElement.height;

    const bottomHeight = h * 0.4;

    const pixels = new Uint8Array(w * bottomHeight * 4);

    renderer.readRenderTargetPixels(
        null,
        0,
        0,
        w,
        bottomHeight,
        pixels
    );

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = bottomHeight;
    const ctx = canvas.getContext("2d");
    const imgData = ctx.createImageData(w, bottomHeight);
    imgData.data.set(pixels);
    ctx.putImageData(imgData, 0, 0);

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
    cameraView.aspect = window.innerWidth / (window.innerHeight * 0.6);
    cameraView.updateProjectionMatrix();
});

// ==========================
// Render Loop
// ==========================

function render() {
    requestAnimationFrame(render);

    controls.update();

    cameraView.updateMatrixWorld();
    const rot = new THREE.Matrix3().setFromMatrix4(cameraView.matrixWorld);
    quad.material.uniforms.cameraRotation.value = rot;

    const w = window.innerWidth;
    const h = window.innerHeight;

    const topH = h * 0.6;
    const bottomH = h * 0.4;

    renderer.setViewport(0, bottomH, w, topH);
    renderer.setScissor(0, bottomH, w, topH);
    renderer.render(sceneView, cameraView);

    renderer.setViewport(0, 0, w, bottomH);
    renderer.setScissor(0, 0, w, bottomH);
    renderer.render(sceneCylinder, cameraOrtho);
}

render();