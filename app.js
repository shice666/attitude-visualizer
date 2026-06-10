// Attitude Resolution Visualizer - Core Logic
let scene, camera, renderer, controls;
let currentModelType = 'cube'; // 'cube' or 'drone'
let dragMode = 'rotate'; // 'rotate' (rotate object) or 'orbit' (orbit camera)
let cameraLock = false; // camera follows object rotation

// Attitude angles (in radians)
let yaw = 0;   // Y-axis (Yaw)
let pitch = 0; // X-axis (Pitch)
let roll = 0;  // Z-axis (Roll)
let selectedOrder = 'YXZ'; // Default order for Aerospace (Yaw -> Pitch -> Roll)

// Three.js groups and meshes
let gimbalGroup;
let ringX, ringY, ringZ;
let cubeModel, droneModel;
let activeModel;
let gridHelper, axesHelper;

// For tracking current attitude using Quaternions
const attitudeQuaternion = new THREE.Quaternion();

// Camera tracking offset for follow mode
let cameraRelativeOffset = new THREE.Vector3(0, 3, 6);

// Drag interaction state
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };

// Propellers of the drone for animation
let propellers = [];

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
    init3D();
    setupUI();
    updateAttitude();
    animate();
});

// Initialize Three.js scene
function init3D() {
    const container = document.getElementById('viewport-container');
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x040508);

    // Camera
    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 3, 7);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, canvas: document.getElementById('canvas3d') });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;

    // Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI; // Full rotation
    controls.minDistance = 2;
    controls.maxDistance = 20;
    
    // Disable left-click camera rotation by default (default mode is object rotate)
    controls.mouseButtons.LEFT = null;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(5, 10, 7);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x535bf2, 0.3);
    dirLight2.position.set(-5, -5, -5);
    scene.add(dirLight2);

    // Grid Helper (ground plane)
    gridHelper = new THREE.GridHelper(20, 20, 0x1f2937, 0x111827);
    gridHelper.position.y = -2.5;
    scene.add(gridHelper);

    // Axes Helper (centered at origin, thin lines)
    axesHelper = new THREE.AxesHelper(1.5);
    // Let's hide the default axes helper or customize it. Let's make customized glowing arrows for axes!
    createCustomAxes();

    // Create Gimbal Group
    gimbalGroup = new THREE.Group();
    scene.add(gimbalGroup);

    // Create Gimbal Rings (Roll = Z, Pitch = X, Yaw = Y)
    createGimbalRings();

    // Create Models
    createCubeModel();
    createDroneModel();

    // Rebuild parenting structure based on selectedOrder
    rebuildHierarchy();

    // Event Listeners for canvas resizing
    window.addEventListener('resize', onWindowResize);

    // Setup custom drag interactions on canvas
    setupCanvasInteractions(renderer.domElement);
}

// Create custom coordinate axes representing the Earth Frame (NED)
function createCustomAxes() {
    const axesGroup = new THREE.Group();
    axesGroup.position.set(-2.2, -2.2, -2.2); // Positioned in corner of scene
    
    const length = 1.0;
    const thickness = 0.03;
    
    // X_e axis (North / Forward - Red) -> points along Three.js -Z
    const xGeom = new THREE.CylinderGeometry(thickness, thickness, length, 8);
    xGeom.rotateX(Math.PI/2);
    xGeom.translate(0, 0, -length/2);
    const xMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
    const xAxis = new THREE.Mesh(xGeom, xMat);
    
    // Y_e axis (East / Right - Green) -> points along Three.js +X
    const yGeom = new THREE.CylinderGeometry(thickness, thickness, length, 8);
    yGeom.rotateZ(-Math.PI/2);
    yGeom.translate(length/2, 0, 0);
    const yMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
    const yAxis = new THREE.Mesh(yGeom, yMat);
    
    // Z_e axis (Down - Blue) -> points along Three.js -Y
    const zGeom = new THREE.CylinderGeometry(thickness, thickness, length, 8);
    zGeom.translate(0, -length/2, 0);
    const zMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6 });
    const zAxis = new THREE.Mesh(zGeom, zMat);
    
    axesGroup.add(xAxis, yAxis, zAxis);
    scene.add(axesGroup);
}

// Create the three nested rings of the Gimbal System
function createGimbalRings() {
    // Ring material factory
    const createRingMat = (color) => new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide
    });

    const tubeWidth = 0.02;
    const radialSegs = 8;
    const tubularSegs = 64;

    // Y Ring (Yaw - Blue) - Outer, rotates around Y (lies in XZ plane)
    const geomY = new THREE.TorusGeometry(2.2, tubeWidth, radialSegs, tubularSegs);
    geomY.rotateX(Math.PI / 2); // Make it lie in XZ plane
    ringY = new THREE.Mesh(geomY, createRingMat(0x3b82f6));

    // X Ring (Pitch - Green) - Middle, rotates around X (lies in YZ plane)
    const geomX = new THREE.TorusGeometry(1.9, tubeWidth, radialSegs, tubularSegs);
    geomX.rotateY(Math.PI / 2); // Make it lie in YZ plane
    ringX = new THREE.Mesh(geomX, createRingMat(0x00ff88));

    // Z Ring (Roll - Red) - Inner, rotates around Z (lies in XY plane)
    const geomZ = new THREE.TorusGeometry(1.6, tubeWidth, radialSegs, tubularSegs);
    // Default torus lies in XY plane, no rotation needed
    ringZ = new THREE.Mesh(geomZ, createRingMat(0xff3b30));
}

// Generate textures for the cube faces dynamically
function createFaceTexture(text, bgColor, textColor) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, 256, 256);

    // Glowing border
    ctx.strokeStyle = textColor;
    ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, 244, 244);
    
    // Tech-style corner crosshairs
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(30, 30); ctx.lineTo(50, 30);
    ctx.moveTo(30, 30); ctx.lineTo(30, 50);
    ctx.moveTo(226, 30); ctx.lineTo(206, 30);
    ctx.moveTo(226, 30); ctx.lineTo(226, 50);
    ctx.moveTo(30, 226); ctx.lineTo(50, 226);
    ctx.moveTo(30, 226); ctx.lineTo(30, 206);
    ctx.moveTo(226, 226); ctx.lineTo(206, 226);
    ctx.moveTo(226, 226); ctx.lineTo(226, 206);
    ctx.stroke();

    // Text Label
    ctx.fillStyle = textColor;
    ctx.font = 'bold 38px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 128);

    // Subtle orientation indicator dot at the top of face
    ctx.fillStyle = textColor;
    ctx.beginPath();
    ctx.arc(128, 35, 6, 0, Math.PI * 2);
    ctx.fill();

    return new THREE.CanvasTexture(canvas);
}

// Helper to add local body-frame axes to a model
function addLocalAxes(model) {
    const arrowLen = 1.4;
    const headLen = 0.22;
    const headWidth = 0.12;

    // X_b (Roll - Red) -> points along local Forward (+Z in Three.js)
    const dirX = new THREE.Vector3(0, 0, 1);
    const arrowX = new THREE.ArrowHelper(dirX, new THREE.Vector3(0,0,0), arrowLen, 0xff3b30, headLen, headWidth);
    
    // Y_b (Pitch - Green) -> points along local Right (+X in Three.js)
    const dirY = new THREE.Vector3(1, 0, 0);
    const arrowY = new THREE.ArrowHelper(dirY, new THREE.Vector3(0,0,0), arrowLen, 0x00ff88, headLen, headWidth);
    
    // Z_b (Yaw - Blue) -> points along local Down (-Y in Three.js)
    const dirZ = new THREE.Vector3(0, -1, 0);
    const arrowZ = new THREE.ArrowHelper(dirZ, new THREE.Vector3(0,0,0), arrowLen, 0x3b82f6, headLen, headWidth);

    model.add(arrowX, arrowY, arrowZ);
}

// Create the Cube Model
function createCubeModel() {
    const geometry = new THREE.BoxGeometry(1.2, 1.2, 1.2);
    
    // Colors: Y_b (Pitch - Green), Z_b (Yaw - Blue), X_b (Roll - Red)
    // +X (Right): Green, -X (Left): Green
    // +Y (Up): Blue, -Y (Down): Blue
    // +Z (Front): Red, -Z (Back): Red
    const materials = [
        new THREE.MeshStandardMaterial({ map: createFaceTexture('RIGHT (右)', '#0d1117', '#00ff88'), roughness: 0.2, metalness: 0.1 }), // +X
        new THREE.MeshStandardMaterial({ map: createFaceTexture('LEFT (左)', '#0d1117', '#00ff88'), roughness: 0.2, metalness: 0.1 }),  // -X
        new THREE.MeshStandardMaterial({ map: createFaceTexture('UP (上)', '#0d1117', '#3b82f6'), roughness: 0.2, metalness: 0.1 }),    // +Y
        new THREE.MeshStandardMaterial({ map: createFaceTexture('DOWN (下)', '#0d1117', '#3b82f6'), roughness: 0.2, metalness: 0.1 }),  // -Y
        new THREE.MeshStandardMaterial({ map: createFaceTexture('FRONT (前)', '#0d1117', '#ff3b30'), roughness: 0.2, metalness: 0.1 }), // +Z
        new THREE.MeshStandardMaterial({ map: createFaceTexture('BACK (后)', '#0d1117', '#ff3b30'), roughness: 0.2, metalness: 0.1 })   // -Z
    ];
    
    cubeModel = new THREE.Mesh(geometry, materials);
    cubeModel.castShadow = true;
    cubeModel.receiveShadow = true;
    
    // Add local axes helper
    addLocalAxes(cubeModel);
}

// Create a high-quality Drone Model procedurally
function createDroneModel() {
    droneModel = new THREE.Group();

    // Materials
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.8, roughness: 0.2 });
    const armMat = new THREE.MeshStandardMaterial({ color: 0x374151, metalness: 0.7, roughness: 0.3 });
    const propMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.7 }); // Blue blades
    const noseMat = new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0xff3b30, emissiveIntensity: 0.5 }); // Heading indicator LED (Red)

    // 1. Central Body
    const bodyGeom = new THREE.CylinderGeometry(0.4, 0.45, 0.15, 8);
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.rotation.y = Math.PI / 8; // align visually
    droneModel.add(body);

    // Heading indicator LED (Forward is +Z)
    const ledGeom = new THREE.SphereGeometry(0.08, 16, 16);
    const led = new THREE.Mesh(ledGeom, noseMat);
    led.position.set(0, 0, 0.45);
    droneModel.add(led);

    // 2. Arms (X-configuration)
    const armLen = 0.9;
    const armThick = 0.05;
    const angles = [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4];
    
    angles.forEach((angle, idx) => {
        const armGroup = new THREE.Group();
        armGroup.rotation.y = angle;
        
        // Arm rod
        const rodGeom = new THREE.BoxGeometry(armThick, armThick, armLen);
        const rod = new THREE.Mesh(rodGeom, armMat);
        rod.position.z = armLen / 2;
        armGroup.add(rod);

        // Motor housing
        const motorGeom = new THREE.CylinderGeometry(0.08, 0.08, 0.12, 16);
        const motor = new THREE.Mesh(motorGeom, bodyMat);
        motor.position.set(0, 0.06, armLen);
        armGroup.add(motor);

        // Propeller blades
        const propGroup = new THREE.Group();
        propGroup.position.set(0, 0.13, armLen);
        
        const bladeGeom = new THREE.BoxGeometry(0.7, 0.01, 0.04);
        const blade = new THREE.Mesh(bladeGeom, propMat);
        propGroup.add(blade);
        
        // Save propeller for spin animation
        propellers.push(propGroup);
        armGroup.add(propGroup);

        droneModel.add(armGroup);
    });

    // Scale drone to look proportionate
    droneModel.scale.set(1.2, 1.2, 1.2);
    
    // Add local axes helper
    addLocalAxes(droneModel);
}

// Rebuild the parent-child hierarchy of rings and the model based on the selected rotation order
function rebuildHierarchy() {
    // 1. Remove all rings and models from scene/gimbalGroup
    gimbalGroup.clear();
    ringX.clear();
    ringY.clear();
    ringZ.clear();
    
    // Determine active model mesh
    activeModel = (currentModelType === 'cube') ? cubeModel : droneModel;
    
    // 2. Build the nested tree based on the rotation order string
    // Standard aerospace is Yaw-Pitch-Roll (Y -> X -> Z in our coordinate mapping)
    // Order String, e.g. "YXZ": 
    // Outer = Y, Middle = X, Inner = Z
    const char1 = selectedOrder.charAt(0);
    const char2 = selectedOrder.charAt(1);
    const char3 = selectedOrder.charAt(2);
    
    const getRingByChar = (char) => {
        if (char === 'X') return ringX;
        if (char === 'Y') return ringY;
        if (char === 'Z') return ringZ;
    };
    
    const ring1 = getRingByChar(char1); // Outermost (parented to gimbalGroup)
    const ring2 = getRingByChar(char2); // Middle (parented to ring1)
    const ring3 = getRingByChar(char3); // Innermost (parented to ring2)
    
    gimbalGroup.add(ring1);
    ring1.add(ring2);
    ring2.add(ring3);
    
    // Parent the active model to the innermost ring
    ring3.add(activeModel);
    
    // Set visibility of rings based on user setting
    const showRings = document.getElementById('chk-show-gimbal').checked;
    ringX.visible = showRings;
    ringY.visible = showRings;
    ringZ.visible = showRings;

    // Reset local rotations of all rings
    ringX.rotation.set(0, 0, 0);
    ringY.rotation.set(0, 0, 0);
    ringZ.rotation.set(0, 0, 0);
    
    // Sync the 3D transforms with the current angles
    applyRotationsToRings();
}

// Set individual ring rotations based on Yaw, Pitch, Roll angles
function applyRotationsToRings() {
    // We map:
    // yaw -> Y rotation
    // pitch -> X rotation
    // roll -> Z rotation
    ringY.rotation.y = yaw;
    ringX.rotation.x = pitch;
    ringZ.rotation.z = roll;
}

// Setup Event Listeners and sync sliders
function setupUI() {
    // Sliders
    const sliderYaw = document.getElementById('slider-yaw');
    const sliderPitch = document.getElementById('slider-pitch');
    const sliderRoll = document.getElementById('slider-roll');

    // Values displays
    const valYaw = document.getElementById('val-yaw');
    const valPitch = document.getElementById('val-pitch');
    const valRoll = document.getElementById('val-roll');

    // Sliders change event
    const handleSliderInput = () => {
        yaw = THREE.MathUtils.degToRad(parseFloat(sliderYaw.value));
        pitch = THREE.MathUtils.degToRad(parseFloat(sliderPitch.value));
        roll = THREE.MathUtils.degToRad(parseFloat(sliderRoll.value));
        
        // Update model quaternion representation
        const euler = new THREE.Euler(pitch, yaw, roll, selectedOrder);
        attitudeQuaternion.setFromEuler(euler);
        
        updateAttitude(false); // Update numbers and 3D, don't update sliders (already matches)
    };

    sliderYaw.addEventListener('input', handleSliderInput);
    sliderPitch.addEventListener('input', handleSliderInput);
    sliderRoll.addEventListener('input', handleSliderInput);

    // Rotation Order
    const orderSelect = document.getElementById('order-select');
    orderSelect.addEventListener('change', (e) => {
        selectedOrder = e.target.value;
        
        // Decompose the current attitudeQuaternion into the new euler order!
        const euler = new THREE.Euler().setFromQuaternion(attitudeQuaternion, selectedOrder);
        pitch = euler.x;
        yaw = euler.y;
        roll = euler.z;
        
        rebuildHierarchy();
        updateAttitude(true); // Recalculate slider values
    });

    // Model Selector
    const modelOptions = document.querySelectorAll('[data-model]');
    modelOptions.forEach(opt => {
        opt.addEventListener('click', (e) => {
            modelOptions.forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            currentModelType = opt.dataset.model;
            rebuildHierarchy();
        });
    });

    // Drag Mode Selector (Rotate Object vs Orbit Camera)
    const dragOptions = document.querySelectorAll('[data-drag]');
    dragOptions.forEach(opt => {
        opt.addEventListener('click', (e) => {
            dragOptions.forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            dragMode = opt.dataset.drag;
            
            // Configure OrbitControls left-click behavior
            if (dragMode === 'orbit') {
                controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
            } else {
                controls.mouseButtons.LEFT = null; // Disable left-click orbit in object-rotate mode
            }
        });
    });

    // Show Gimbal Rings Checkbox
    const chkShowGimbal = document.getElementById('chk-show-gimbal');
    chkShowGimbal.addEventListener('change', (e) => {
        const checked = e.target.checked;
        ringX.visible = checked;
        ringY.visible = checked;
        ringZ.visible = checked;
    });

    // Camera Lock Checkbox
    const chkCameraLock = document.getElementById('chk-camera-lock');
    chkCameraLock.addEventListener('change', (e) => {
        cameraLock = e.target.checked;
        if (cameraLock) {
            // Save current relative offset
            const invertedQuat = attitudeQuaternion.clone().invert();
            cameraRelativeOffset.copy(camera.position).applyQuaternion(invertedQuat);
            controls.enablePan = false; // Disable panning in lock mode
        } else {
            controls.enablePan = true;
        }
    });

    // Reset Buttons
    document.getElementById('btn-reset-att').addEventListener('click', () => {
        yaw = 0;
        pitch = 0;
        roll = 0;
        attitudeQuaternion.set(0, 0, 0, 1);
        
        // Remove gimbal lock styling if active
        document.getElementById('btn-gimbal-lock').classList.remove('active');
        
        updateAttitude(true);
    });

    document.getElementById('btn-reset-cam').addEventListener('click', () => {
        camera.position.set(0, 3, 7);
        controls.target.set(0, 0, 0);
        cameraLock = false;
        document.getElementById('chk-camera-lock').checked = false;
        controls.enablePan = true;
    });

    // Gimbal Lock Demo
    const btnGimbalLock = document.getElementById('btn-gimbal-lock');
    btnGimbalLock.addEventListener('click', () => {
        // Force Pitch to 90 degrees (Math.PI / 2)
        yaw = THREE.MathUtils.degToRad(30); // small angle for clarity
        pitch = Math.PI / 2;                // Gimbal lock point
        roll = THREE.MathUtils.degToRad(40);
        
        const euler = new THREE.Euler(pitch, yaw, roll, selectedOrder);
        attitudeQuaternion.setFromEuler(euler);
        
        btnGimbalLock.classList.add('active');
        updateAttitude(true);
        
        // Visual alert or smooth view rotation to focus
        camera.position.set(6, 1, 0); // Side view highlights the gimbal overlap
        controls.target.set(0, 0, 0);
    });
}

// Drag interactions on canvas to rotate the object
function setupCanvasInteractions(domElement) {
    // Mouse Down - Capture phase to intercept before OrbitControls
    domElement.addEventListener('mousedown', (e) => {
        try {
            // Only trigger on left click
            if (e.button !== 0) return;
            
            // If mode is 'orbit', let OrbitControls handle it
            if (dragMode === 'orbit') return;
            
            isDragging = true;
            previousMousePosition = {
                x: e.clientX,
                y: e.clientY
            };
            
            // Stop event from propagating to OrbitControls
            e.stopImmediatePropagation();
        } catch (err) {
            showDebugError("MouseDown Error: " + err.message);
        }
    }, true);

    // Touch Start - Capture phase for mobile devices
    domElement.addEventListener('touchstart', (e) => {
        try {
            if (dragMode === 'orbit') return;
            if (e.touches.length !== 1) return; // Only track single-finger drags
            
            isDragging = true;
            previousMousePosition = {
                x: e.touches[0].clientX,
                y: e.touches[0].clientY
            };
            
            e.stopImmediatePropagation();
        } catch (err) {
            showDebugError("TouchStart Error: " + err.message);
        }
    }, { capture: true, passive: false });

    // Helper function to perform rotation update
    const performRotation = (deltaX, deltaY) => {
        try {
            const speed = 0.005;

            // Get camera basis in world space
            const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
            const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);

            // Quaternion representing rotation around camera axes
            const qX = new THREE.Quaternion().setFromAxisAngle(cameraRight, -deltaY * speed);
            const qY = new THREE.Quaternion().setFromAxisAngle(cameraUp, deltaX * speed);

            // Net change in rotation
            const deltaRotation = new THREE.Quaternion().multiplyQuaternions(qY, qX);
            
            // Apply rotation to the model's overall attitude quaternion
            attitudeQuaternion.premultiply(deltaRotation);
            attitudeQuaternion.normalize();

            // Decompose quaternion into Euler angles for selected order
            const euler = new THREE.Euler().setFromQuaternion(attitudeQuaternion, selectedOrder);
            pitch = euler.x;
            yaw = euler.y;
            roll = euler.z;

            // Keep angles normalized between [-PI, PI]
            const normalizeAngle = (ang) => {
                while (ang > Math.PI) ang -= 2 * Math.PI;
                while (ang < -Math.PI) ang += 2 * Math.PI;
                return ang;
            };
            pitch = normalizeAngle(pitch);
            yaw = normalizeAngle(yaw);
            roll = normalizeAngle(roll);

            // Check if we exited gimbal lock state
            if (Math.abs(Math.abs(pitch) - Math.PI/2) > 0.05) {
                document.getElementById('btn-gimbal-lock').classList.remove('active');
            }

            updateAttitude(true);
        } catch (err) {
            showDebugError("PerformRotation Error: " + err.message + "\n" + err.stack);
        }
    };

    // Mouse Move on window
    window.addEventListener('mousemove', (e) => {
        try {
            if (!isDragging) return;
            
            const deltaMove = {
                x: e.clientX - previousMousePosition.x,
                y: e.clientY - previousMousePosition.y
            };

            performRotation(deltaMove.x, deltaMove.y);

            previousMousePosition = {
                x: e.clientX,
                y: e.clientY
            };
        } catch (err) {
            showDebugError("MouseMove Error: " + err.message);
        }
    });

    // Touch Move on window
    window.addEventListener('touchmove', (e) => {
        try {
            if (!isDragging) return;
            if (e.touches.length !== 1) return;

            const deltaMove = {
                x: e.touches[0].clientX - previousMousePosition.x,
                y: e.touches[0].clientY - previousMousePosition.y
            };

            performRotation(deltaMove.x, deltaMove.y);

            previousMousePosition = {
                x: e.touches[0].clientX,
                y: e.touches[0].clientY
            };

            // Prevent standard page scrolling while dragging 3D object
            e.preventDefault();
        } catch (err) {
            showDebugError("TouchMove Error: " + err.message);
        }
    }, { passive: false });

    // Drag release
    const endDrag = () => {
        try {
            if (isDragging) {
                isDragging = false;
            }
        } catch (err) {
            showDebugError("EndDrag Error: " + err.message);
        }
    };

    window.addEventListener('mouseup', endDrag);
    window.addEventListener('touchend', endDrag);
}

// Update UI numerical readouts, sliders, and 3D rings
function updateAttitude(syncSliders = true) {
    // 1. Sync sliders if requested
    if (syncSliders) {
        document.getElementById('slider-yaw').value = THREE.MathUtils.radToDeg(yaw).toFixed(1);
        document.getElementById('slider-pitch').value = THREE.MathUtils.radToDeg(pitch).toFixed(1);
        document.getElementById('slider-roll').value = THREE.MathUtils.radToDeg(roll).toFixed(1);
        
        // Update slider track background fills (css visual polish)
        updateSliderFill(document.getElementById('slider-yaw'), '#3b82f6');
        updateSliderFill(document.getElementById('slider-pitch'), '#00ff88');
        updateSliderFill(document.getElementById('slider-roll'), '#ff3b30');
    }

    // 2. Sync text displays (Degrees and Radians)
    document.getElementById('val-yaw').innerText = `${THREE.MathUtils.radToDeg(yaw).toFixed(1)}° (${yaw.toFixed(3)} rad)`;
    document.getElementById('val-pitch').innerText = `${THREE.MathUtils.radToDeg(pitch).toFixed(1)}° (${pitch.toFixed(3)} rad)`;
    document.getElementById('val-roll').innerText = `${THREE.MathUtils.radToDeg(roll).toFixed(1)}° (${roll.toFixed(3)} rad)`;

    // 3. Sync Quaternion values
    document.getElementById('quat-w').innerText = attitudeQuaternion.w.toFixed(4);
    document.getElementById('quat-x').innerText = attitudeQuaternion.x.toFixed(4);
    document.getElementById('quat-y').innerText = attitudeQuaternion.y.toFixed(4);
    document.getElementById('quat-z').innerText = attitudeQuaternion.z.toFixed(4);

    // 4. Sync Rotation Matrix values
    const matrix = new THREE.Matrix4().makeRotationFromQuaternion(attitudeQuaternion);
    const m = matrix.elements;
    
    // elements is column-major:
    // m[0]  m[4]  m[8]  m[12] (tx)
    // m[1]  m[5]  m[9]  m[13] (ty)
    // m[2]  m[6]  m[10] m[14] (tz)
    // m[3]  m[7]  m[11] m[15]
    document.getElementById('m00').innerText = m[0].toFixed(4);
    document.getElementById('m01').innerText = m[4].toFixed(4);
    document.getElementById('m02').innerText = m[8].toFixed(4);
    
    document.getElementById('m10').innerText = m[1].toFixed(4);
    document.getElementById('m11').innerText = m[5].toFixed(4);
    document.getElementById('m12').innerText = m[9].toFixed(4);
    
    document.getElementById('m20').innerText = m[2].toFixed(4);
    document.getElementById('m21').innerText = m[6].toFixed(4);
    document.getElementById('m22').innerText = m[10].toFixed(4);

    // 5. Update 3D visual rotations of the gimbal rings
    applyRotationsToRings();
}

// Visual helper to color active portion of the slider range
function updateSliderFill(slider, color) {
    const min = parseFloat(slider.min);
    const max = parseFloat(slider.max);
    const val = parseFloat(slider.value);
    const percentage = ((val - min) / (max - min)) * 100;
    
    // Set gradient background
    slider.style.background = `linear-gradient(to right, ${color} 0%, ${color} ${percentage}%, rgba(255,255,255,0.1) ${percentage}%, rgba(255,255,255,0.1) 100%)`;
}

// Window resizing handler
function onWindowResize() {
    const container = document.getElementById('viewport-container');
    const width = container.clientWidth;
    const height = container.clientHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);

    // Rotate drone propellers if active
    if (currentModelType === 'drone' && propellers.length > 0) {
        propellers.forEach((prop, idx) => {
            // Alternate rotation directions
            const dir = (idx % 2 === 0) ? 1 : -1;
            prop.rotation.y += 0.25 * dir;
        });
    }

    // Camera follow behavior
    if (cameraLock) {
        // Calculate new camera target world position based on attitude
        const targetCamPos = cameraRelativeOffset.clone().applyQuaternion(attitudeQuaternion);
        camera.position.lerp(targetCamPos, 0.1); // smooth transition
        camera.lookAt(0, 0, 0);
        controls.target.set(0, 0, 0);
    } else {
        controls.update();
    }

    renderer.render(scene, camera);
}

// Global debug helper to display errors on the screen for easy troubleshooting
function showDebugError(msg) {
    let errDiv = document.getElementById('debug-error-log');
    if (!errDiv) {
        errDiv = document.createElement('div');
        errDiv.id = 'debug-error-log';
        errDiv.style.position = 'fixed';
        errDiv.style.bottom = '10px';
        errDiv.style.left = '10px';
        errDiv.style.backgroundColor = 'rgba(255, 0, 0, 0.9)';
        errDiv.style.color = 'white';
        errDiv.style.padding = '10px';
        errDiv.style.borderRadius = '5px';
        errDiv.style.zIndex = '9999';
        errDiv.style.fontFamily = 'monospace';
        errDiv.style.fontSize = '12px';
        errDiv.style.whiteSpace = 'pre-wrap';
        errDiv.style.maxWidth = '90%';
        document.body.appendChild(errDiv);
    }
    errDiv.innerText = msg;
}
