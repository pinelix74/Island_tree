// Create the scen
const scene = new THREE.Scene();
const touchArea = document.getElementById('canvasBack');
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 5, 3000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
const controls = new THREE.OrbitControls(camera, renderer.domElement);

// scene.fog = new THREE.Fog(0x87CEEB, 0.001, 800); // Set up fog
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('canvasBack').appendChild(renderer.domElement);
renderer.setClearColor(new THREE.Color(0x87CEEB));


// Add Orbit Control
controls.minPolarAngle = Math.PI / 6; // Limit from looking straight up
controls.maxPolarAngle = Math.PI / 2.2; // Limit to looking straight down

// grassTexture
const grassTexture = new THREE.TextureLoader().load('./assests/img/grass.png', (texture) => {
    texture.wrapS = THREE.RepeatWrapping; // Allows horizontal repeat
    texture.wrapT = THREE.RepeatWrapping; // Allows vertical repeat
    texture.repeat.set(40, 40); // Repeat the texture 4 times in X and Y directions
});

// grassMaterial
const grassMaterial = new THREE.MeshStandardMaterial
    ({
        map: grassTexture,
        side: THREE.DoubleSide,
        roughness: 1.0,  // Adjust for realism
        metalness: 1.0,
        displacementScale: 0.2,
        bumpScale: 0.1,
    });

// sandTexture
const islandSandTexture = new THREE.TextureLoader().load('./assests/img/islandSandTexture.png', (texture) => {
    texture.wrapS = THREE.RepeatWrapping; // Allows horizontal repeat
    texture.wrapT = THREE.RepeatWrapping; // Allows vertical repeat
    texture.repeat.set(40, 40); // Repeat the texture 4 times in X and Y directions
});

const islandSandMaterial = new THREE.MeshStandardMaterial({
    map: islandSandTexture,
    side: THREE.DoubleSide,
    roughness: 1.0,  // Adjust for realism
    metalness: 1.0,
    displacementScale: 0.2,
    bumpScale: 0.1,
    // blending: THREE.AdditiveBlending
});

// rockTexture
const rockTexture = new THREE.TextureLoader().load('./assests/img/stoneTexture.png', (texture) => {
    texture.wrapS = THREE.RepeatWrapping; // Allows horizontal repeat
    texture.wrapT = THREE.RepeatWrapping; // Allows vertical repeat
    texture.repeat.set(80, 80); // Repeat the texture 4 times in X and Y directions
});

const rockMaterial = new THREE.MeshStandardMaterial
    ({
        map: rockTexture,
        side: THREE.DoubleSide,
        roughness: 1.0,  // Adjust for realism
        metalness: 1.0,
        displacementScale: 0.2,
        bumpScale: 0.1,
    });

// lightBlur
const composer = new THREE.EffectComposer(renderer);
const renderPass = new THREE.RenderPass(scene, camera);
const hBlur = new THREE.ShaderPass(THREE.HorizontalBlurShader);

composer.addPass(renderPass);
hBlur.uniforms['h'].value = 1 / window.innerWidth; // set horizontal blur amount
//   composer.addPass(hBlur);

// Vertical Blur
const vBlur = new THREE.ShaderPass(THREE.VerticalBlurShader);

vBlur.uniforms['v'].value = 1 / window.innerHeight; // set vertical blur amount
//   composer.addPass(vBlur);

// Final render pass
const finalPass = new THREE.ShaderPass(THREE.CopyShader);
const loader = new THREE.GLTFLoader();
const modelUrl = './assests/models/island(wide).glb'; // Replace with your 3D model path

finalPass.renderToScreen = true;
//   composer.addPass(finalPass);

// islandLoader
loader.load(modelUrl, function (gltf) {
    let island = gltf.scene;
    scene.add(island);

    island.scale.set(500, 500, 500); // Scale the model if necessary
    island.position.set(0, -8.3, 0);

    island.traverse(function (child) {

        if (child.name === 'grass' && child.isMesh) {
            child.material = grassMaterial;
            child.castShadow = true; // Cast shadows
            child.receiveShadow = true; // Receive shadows
            child.material.transparent = true;
        }
        else if (child.name === 'sand' && child.isMesh) {
            child.material = islandSandMaterial;
            child.castShadow = true;
            child.receiveShadow = true;
        }
        else if (child.name === 'rock' && child.isMesh) {
            child.material = rockMaterial;
        }

    })

    const box = new THREE.Box3().setFromObject(island);
    const center = box.getCenter(new THREE.Vector3());

    controls.target.copy(center);
    controls.update(); // Important to call this after changing the target
},
    undefined, function (error) {
        console.error(error);
    });


camera.position.z = 60;


// Lighting
const ambientLight = new THREE.AmbientLight(0x0cf00c, 0.5);
const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);

scene.add(ambientLight);
sunLight.position.set(10, 10, 10).normalize(); // Position the light at (x, y, z)

sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 1024; // Default shadow map size
sunLight.shadow.mapSize.height = 1024; // Default shadow map size

sunLight.shadow.camera.near = 0.5;    // Default near clipping plane
sunLight.shadow.camera.far = 50;      // Default far clipping plane

sunLight.shadow.bias = -0.01;
sunLight.intensity = 3,
    scene.add(sunLight);

// Add a helper to visualize the directional light position and direction (optio
// Targeting the light to the target object
const sandPlane = new THREE.PlaneGeometry(5000, 5000);
const sandPlaneTextureLoader = new THREE.TextureLoader();

sandPlaneTextureLoader.load('./assests/img/sandTexture.png',(texture) => 
{
    texture.repeat.set(100,100)
    const planeMaterial = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    const sandPlaneMesh = new THREE.Mesh(sandPlane, planeMaterial);
    
    sandPlaneMesh.rotation.x = - Math.PI / 2; // Rotate the plane to be horizontal
    sandPlaneMesh.position.y += 6.5;
    scene.add(sandPlaneMesh);
});

// Water
const waterGeometry = new THREE.PlaneGeometry(10000, 10000);
let water = new THREE.Water(waterGeometry,
    {
        textureWidth: 600, // Texture resolution
        textureHeight: 600,

        waterNormals: new THREE.TextureLoader().load('./assests/img/waternormals.jpg', (texture) => {
            texture.wrapS = texture.wrapT = 6000;
        }), // Normal map for water

        sunDirection: new THREE.Vector3(0, 1, 0),
        flowDirection: new THREE.Vector2(1, 1),

        sunColor: 0x006400,
        waterColor: '#ffffff', // Deep water color

        // distortionScale: 1, // Wave distortion effect
        fog: true, // Enable fog if needed

        transparent: true,
        alpha: 1, // Control water opacity
        reflectivity: 2
    });

water.position.y = 6.55;
water.rotation.x = - Math.PI / 2; // Make it horizontal
scene.add(water);

// // skybox
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');

const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
gradient.addColorStop(0.4, '#0b78fb');  // Light Sky Blue
gradient.addColorStop(0.5, '#ffffff');  // Steel Blue
ctx.fillStyle = gradient;
ctx.fillRect(0, 0, canvas.width, canvas.height);

const cloudImage = new Image();
cloudImage.src = './assests/img/sky/cloud.png';

cloudImage.onload = () => {
    // Draw the cloud texture on top of the gradient
    ctx.globalAlpha = 0.5; // Adjust the opacity of the clouds
    ctx.drawImage(cloudImage, 0, 0, 500, canvas.height + 190);
    ctx.drawImage(cloudImage, -40, 0, 500, canvas.height + 190);
    ctx.drawImage(cloudImage, -80, 0, 500, canvas.height + 190);
    ctx.drawImage(cloudImage, -120, 0, 500, canvas.height + 190);
    ctx.drawImage(cloudImage, -160, 0, 500, canvas.height + 190);
    ctx.drawImage(cloudImage, -200, 0, 500, canvas.height + 190);
    // ctx.drawImage(cloudImage, -240, 0, 500, canvas.height + 180);

    const texture = new THREE.Texture(canvas);
    texture.needsUpdate = true;

    const sphereGeometry = new THREE.SphereGeometry(1000, 60, 40);
    const sphereMaterial = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.BackSide
    });
    const skySphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    scene.add(skySphere);
    
};
    // Create texture from canvas


// scene.background = envMap;
// scene.environment = envMap;


// treePlan
const treeLoader = new THREE.GLTFLoader();
let originalModel = null;

function onMouseClick(event) {
    const mouse = new THREE.Vector2
        (
            (event.clientX / window.innerWidth) * 2 - 1,
            -(event.clientY / window.innerHeight) * 2 + 1
        );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    // Check intersection with island
    const intersects = raycaster.intersectObjects(scene.children, true); // "true" for recursive check

    if (intersects.length > 0) {
        // Get the intersection point
        let intersectedObject = intersects[0].point;
        let objectName = intersects[0].object.name;
        intersectedObject.y += 0.5;

        if (objectName === 'grass' && treeUrl) {
            if (!originalModel) {
                treeLoader.load(treeUrl, function (gltf) {
                    originalModel = gltf.scene;
                    tree = originalModel;

                    tree.scale.set(0.05, 0.05, 0.05); // Adjust size as necessary
                    tree.position.copy(intersectedObject); // Place tree at the intersection poin
                    scene.add(tree);
                },
                    undefined, function (error) {
                        console.error('Error loading tree model:', error);
                    });
            }
            else {
                var tree = originalModel.clone();
                tree.scale.set(0.05, 0.05, 0.05); // Adjust size as necessary
                tree.position.copy(intersectedObject);
                scene.add(tree);
            }
        }
    }
}

let raycaster = new THREE.Raycaster();
let touch = new THREE.Vector2();

listItems.forEach(item => {
    item.addEventListener('touchend', () => {
        touchTree = `./assests/models/${item.id}`;
    });
});

// touchTree
const planTree = () => {
    let tree;
    const touchEvent = event.changedTouches[0]; // Use the first touch point
    touch.x = (touchEvent.clientX / window.innerWidth) * 2 - 1;

    touch.y = - (touchEvent.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(touch, camera);

    // Calculate objects intersecting the ray
    const intersects = raycaster.intersectObjects(scene.children, true);

    if (intersects.length > 0) {
        const intersectedObject = intersects[0].point;
        intersectedObject.y += 0.5
        let objectName = intersects[0].object.name;

        if (objectName === 'grass' && touchTree) {
            treeLoader.load(touchTree, function (gltf) {
                const originalModel = gltf.scene;
                const clonedModel = originalModel.clone();

                tree = clonedModel;

                if (touchTree != './assests/models/tree_3.glb') {
                    tree.scale.set(0.05, 0.05, 0.05);
                }
                else {
                    tree.scale.set(0.1, 0.1, 0.1);
                }

                tree.position.copy(intersectedObject); // Place tree at the intersection point
                scene.add(tree);

            },
                undefined, function (error) {
                    console.error('Error loading tree model:', error);
                });
        }
    }
}

window.addEventListener('click', onMouseClick, false);
touchArea.addEventListener('touchend', planTree, false);

// Render loop
function animate() {
    requestAnimationFrame(animate);
    controls.update(); // Required if controls.enableDamping = true, or if controls.autoRotate = true

    water.material.uniforms['time'].value += 0.009;
    water.material.uniforms['distortionScale'].value = 0.5 * Math.sin(Date.now() * 0.001); // Dynamic wave strength

    renderer.render(scene, camera);
    // const distance = camera.position.z;

    // scene.fog.density = THREE.MathUtils.lerp(0.0015, 0.005, distance / 400);
}

animate();

function setWaterOpacity(opacity) {
    water.material.uniforms['alpha'].value = opacity; // Adjust opacity value
}

// Example usage: Change opacity with some logic
setWaterOpacity(0.9);

// Handle resizing
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});