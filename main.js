import * as THREE from 'three';

// --- Scene Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202020);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 12);
camera.lookAt(0, 2, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(5, 10, 7.5);
scene.add(directionalLight);

// Floor
const floorGeometry = new THREE.PlaneGeometry(20, 20);
const floorMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x444444, 
    side: THREE.DoubleSide,
    roughness: 0.8 
});
const floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// Floor Plane for Physics (Matches visual floor)
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

// --- Box Setup ---
// Placeholder for the external 3D model.
// To load a custom model (e.g., box.glb), use GLTFLoader:
/*
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
const loader = new GLTFLoader();
loader.load('path/to/box.glb', (gltf) => {
    const boxModel = gltf.scene;
    boxModel.position.set(0, 8, 0);
    scene.add(boxModel);
    // Update physics/interaction logic to use boxModel instead of boxMesh
}, undefined, (error) => {
    console.error(error);
});
*/

// Using BoxGeometry as placeholder for loaded model
const boxGeometry = new THREE.BoxGeometry(2, 2, 2);
const boxMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x0077ff,
    roughness: 0.5,
    metalness: 0.1,
    flatShading: true // Makes rotation more visible
});
const boxMesh = new THREE.Mesh(boxGeometry, boxMaterial);

// Initial State
boxMesh.position.set(0, 8, 0); 
scene.add(boxMesh);

// Physics State
const gravity = new THREE.Vector3(0, -9.8, 0);
const velocity = new THREE.Vector3(0, 0, 0);
const angularVelocity = new THREE.Vector3(0, 0, 0);
const restitution = 0.6; // Bounciness
const friction = 0.98;   // Air resistance / floor friction proxy

// Interaction State
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let isRotating = false; // Left Click
let isMoving = false;   // Right Click
let previousMousePosition = { x: 0, y: 0 };
let lastDragTime = 0;

// Movement State
const dragPlane = new THREE.Plane();
const dragOffset = new THREE.Vector3();
const intersection = new THREE.Vector3();

// Boundaries
const BOUNDARY_X = 8;
const BOUNDARY_Z = 8;
const BOUNDARY_Y_MAX = 15;

// Helper to update mouse coordinates
function updateMouse(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

// --- Event Listeners ---
window.addEventListener('resize', onWindowResize, false);
window.addEventListener('pointermove', onPointerMove, false);
window.addEventListener('pointerdown', onPointerDown, false);
window.addEventListener('pointerup', onPointerUp, false);
window.addEventListener('contextmenu', (e) => e.preventDefault()); // Disable context menu

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onPointerDown(event) {
    updateMouse(event);
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects([boxMesh]);

    if (intersects.length > 0) {
        // Stop physics while interacting
        velocity.set(0, 0, 0);
        angularVelocity.set(0, 0, 0);
        
        lastDragTime = performance.now();
        previousMousePosition = { x: event.clientX, y: event.clientY };

        if (event.button === 0) { 
            // Left Click -> Rotate
            isRotating = true;
            boxMesh.material.emissive.setHex(0x222222);
        } else if (event.button === 2) {
            // Right Click -> Move
            isMoving = true;
            boxMesh.material.emissive.setHex(0x555555); // Brighter highlight for grab

            // Create a drag plane facing the camera at the object's position
            const normal = new THREE.Vector3();
            camera.getWorldDirection(normal);
            dragPlane.setFromNormalAndCoplanarPoint(normal, boxMesh.position);

            if (raycaster.ray.intersectPlane(dragPlane, intersection)) {
                dragOffset.copy(intersection).sub(boxMesh.position);
            }
        }
    }
}

function onPointerMove(event) {
    updateMouse(event);
    const currentTime = performance.now();
    const deltaTime = (currentTime - lastDragTime) / 1000;

    if (isRotating) {
        const deltaX = event.clientX - previousMousePosition.x;
        const deltaY = event.clientY - previousMousePosition.y;

        const sensitivity = 0.005;

        // Rotate object directly to follow mouse
        boxMesh.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), deltaX * sensitivity);
        boxMesh.rotateOnAxis(new THREE.Vector3(1, 0, 0), deltaY * sensitivity);

        // Calculate angular velocity for release
        if (deltaTime > 0.001) {
             const instantAngVelX = (deltaY * sensitivity) / deltaTime;
             const instantAngVelY = (deltaX * sensitivity) / deltaTime;
             
             angularVelocity.x = THREE.MathUtils.lerp(angularVelocity.x, instantAngVelX, 0.5);
             angularVelocity.y = THREE.MathUtils.lerp(angularVelocity.y, instantAngVelY, 0.5);
        }

        previousMousePosition = { x: event.clientX, y: event.clientY };
        lastDragTime = currentTime;

    } else if (isMoving) {
        raycaster.setFromCamera(mouse, camera);
        if (raycaster.ray.intersectPlane(dragPlane, intersection)) {
            // Calculate new position
            const newPosition = intersection.sub(dragOffset);
            
            // Clamp position within boundaries during drag
            newPosition.x = THREE.MathUtils.clamp(newPosition.x, -BOUNDARY_X, BOUNDARY_X);
            newPosition.z = THREE.MathUtils.clamp(newPosition.z, -BOUNDARY_Z, BOUNDARY_Z);
            newPosition.y = Math.min(newPosition.y, BOUNDARY_Y_MAX);

            // Calculate velocity based on movement (for toss)
            // v = dx / dt
            if (deltaTime > 0.001) {
                // We use a temporary vector to compute velocity
                const displacement = new THREE.Vector3().copy(newPosition).sub(boxMesh.position);
                const instantVelocity = displacement.divideScalar(deltaTime);
                
                // Smooth velocity for toss
                velocity.lerp(instantVelocity, 0.3);
            }
            
            boxMesh.position.copy(newPosition);
            
            lastDragTime = currentTime;
        }
    }
}

function onPointerUp(event) {
    if (isMoving) {
        // If we haven't moved for > 50ms, assume the user stopped to place the object
        if (performance.now() - lastDragTime > 50) {
            velocity.set(0, 0, 0);
        }
    }

    isRotating = false;
    isMoving = false;
    boxMesh.material.emissive.setHex(0x000000);
}

// --- Animation Loop ---
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    const dt = Math.min(clock.getDelta(), 0.1); 

    if (!isRotating && !isMoving) {
        // 1. Apply Gravity to Velocity
        // v = v + g * dt
        velocity.addScaledVector(gravity, dt);

        // 2. Apply Velocity to Position
        // p = p + v * dt
        boxMesh.position.addScaledVector(velocity, dt);

        // 3. Apply Angular Velocity (Inertia)
        boxMesh.rotation.x += angularVelocity.x * dt;
        boxMesh.rotation.y += angularVelocity.y * dt;
        
        // Decay Angular Velocity
        angularVelocity.multiplyScalar(0.95); 

        // 4. Collision & Boundary Detection
        // Update AABB
        const boxAABB = new THREE.Box3().setFromObject(boxMesh);

        // Floor Collision
        if (boxAABB.intersectsPlane(floorPlane)) {
            if (velocity.y < 0) {
                 velocity.y = -velocity.y * restitution;
                 velocity.x *= friction;
                 velocity.z *= friction;
                 angularVelocity.multiplyScalar(0.8);
            }
            if (boxAABB.min.y < 0) {
                const penetration = -boxAABB.min.y;
                boxMesh.position.y += penetration;
            }
        }

        // Wall Boundaries (X and Z)
        // Check center position against boundaries (simplified)
        // Or check AABB if we want strict wall collisions. Center is smoother for "invisible walls".
        
        // X Boundary
        if (boxMesh.position.x > BOUNDARY_X) {
            boxMesh.position.x = BOUNDARY_X;
            velocity.x = -velocity.x * restitution; // Bounce off wall
        } else if (boxMesh.position.x < -BOUNDARY_X) {
            boxMesh.position.x = -BOUNDARY_X;
            velocity.x = -velocity.x * restitution;
        }

        // Z Boundary
        if (boxMesh.position.z > BOUNDARY_Z) {
            boxMesh.position.z = BOUNDARY_Z;
            velocity.z = -velocity.z * restitution;
        } else if (boxMesh.position.z < -BOUNDARY_Z) {
            boxMesh.position.z = -BOUNDARY_Z;
            velocity.z = -velocity.z * restitution;
        }

        // Y Boundary (Ceiling)
        if (boxMesh.position.y > BOUNDARY_Y_MAX) {
            boxMesh.position.y = BOUNDARY_Y_MAX;
            if (velocity.y > 0) {
                velocity.y = -velocity.y * restitution;
            }
        }
    }

    renderer.render(scene, camera);
}

animate();
