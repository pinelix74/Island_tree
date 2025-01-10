 // Create the scen
 const touchArea = document.getElementById('canvasBack');
 const scene = new THREE.Scene();

 scene.fog = new THREE.Fog(0x87CEEB, 0.001,800); // Set up fog
 const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 5, 1000);
 const renderer = new THREE.WebGLRenderer({ antialias: true });
 renderer.setSize(window.innerWidth, window.innerHeight);
 document.getElementById('canvasBack').appendChild(renderer.domElement);
 renderer.setClearColor(new THREE.Color(0x87CEEB)); 
 var light_source = new THREE.Vector3(707.07, 707.07, 700);
 // Add Orbit Control
 const controls = new THREE.OrbitControls(camera, renderer.domElement);
 controls.minPolarAngle = Math.PI / 6; // Limit from looking straight up
 controls.maxPolarAngle = Math.PI / 2.2; // Limit to looking straight down
 const grassTexture = new THREE.TextureLoader().load('./assests/img/grass.png',(texture) => {
     texture.wrapS = THREE.RepeatWrapping; // Allows horizontal repeat
     texture.wrapT = THREE.RepeatWrapping; // Allows vertical repeat
     texture.repeat.set(40, 40); // Repeat the texture 4 times in X and Y directions
 });
 const grassMaterial = new THREE.MeshStandardMaterial({
     map: grassTexture,
     side : THREE.DoubleSide,
     roughness: 1.0,  // Adjust for realism
     metalness: 1.0,
     displacementScale: 0.2,
     bumpScale: 0.1,
     // blending: THREE.AdditiveBlending
 });


 const islandSandTexture = new THREE.TextureLoader().load('./assests/img/islandSandTexture.png',(texture) => {
     texture.wrapS = THREE.RepeatWrapping; // Allows horizontal repeat
     texture.wrapT = THREE.RepeatWrapping; // Allows vertical repeat
     texture.repeat.set(40, 40); // Repeat the texture 4 times in X and Y directions
 });
 const islandSandMaterial = new THREE.MeshStandardMaterial({
     map: islandSandTexture,
     side : THREE.DoubleSide,
     roughness: 1.0,  // Adjust for realism
     metalness: 1.0,
     displacementScale: 0.2,
     bumpScale: 0.1,
     // blending: THREE.AdditiveBlending
 });

 const rockTexture = new THREE.TextureLoader().load('./assests/img/stoneTexture.png',(texture) => {
    texture.wrapS = THREE.RepeatWrapping; // Allows horizontal repeat
    texture.wrapT = THREE.RepeatWrapping; // Allows vertical repeat
    texture.repeat.set(80, 80); // Repeat the texture 4 times in X and Y directions
});
const rockMaterial = new THREE.MeshStandardMaterial({
    map: rockTexture,
    side : THREE.DoubleSide,
    roughness: 1.0,  // Adjust for realism
    metalness: 1.0,
    displacementScale: 0.2,
    bumpScale: 0.1,
    // blending: THREE.AdditiveBlending
});

const outlineTexture = new THREE.TextureLoader().load('./assests/img/outline.png',(texture) => {
    texture.wrapS = THREE.RepeatWrapping; // Allows horizontal repeat
    texture.wrapT = THREE.RepeatWrapping; // Allows vertical repeat
    texture.repeat.set(80, 80); // Repeat the texture 4 times in X and Y directions
});
const outlineMaterial = new THREE.MeshStandardMaterial({
    map: outlineTexture,
    side : THREE.DoubleSide,
    roughness: 1.0,  // Adjust for realism
    metalness: 1.0,
    displacementScale: 0.2,
    bumpScale: 0.1,
    // blending: THREE.AdditiveBlending
});


 const composer = new THREE.EffectComposer(renderer);
 const renderPass = new THREE.RenderPass(scene, camera);
 composer.addPass(renderPass);

 // Horizontal Blur
 const hBlur = new THREE.ShaderPass(THREE.HorizontalBlurShader);
 hBlur.uniforms['h'].value = 1 / window.innerWidth; // set horizontal blur amount
 composer.addPass(hBlur);

 // Vertical Blur
 const vBlur = new THREE.ShaderPass(THREE.VerticalBlurShader);
 vBlur.uniforms['v'].value = 1 / window.innerHeight; // set vertical blur amount
 composer.addPass(vBlur);

 // Final render pass
 const finalPass = new THREE.ShaderPass(THREE.CopyShader);
 finalPass.renderToScreen = true;
 composer.addPass(finalPass);
 console.log(THREE.REVISION)
 const loader = new THREE.GLTFLoader();
 const modelUrl = './assests/models/island(wide).glb'; // Replace with your 3D model path
 loader.load(modelUrl, function (gltf) {
     let island = gltf.scene;
     scene.add(island);
     island.scale.set(500, 500, 500); // Scale the model if necessary
     island.position.set(0, -8.3, 0);
     island.traverse(function (child) {
        console.log(child.name)
     if(child.name === 'grass' && child.isMesh ) {
             child.material = grassMaterial;
             child.castShadow = true; // Cast shadows
             child.receiveShadow = true; // Receive shadows
             child.material.transparent = true;
         }
     else if(child.name === 'sand' && child.isMesh){
         child.material = islandSandMaterial;
         // child.material.transparent = true;
         child.castShadow = true;
         child.receiveShadow = true;
     }
     else if(child.name === 'rock' && child.isMesh){
        child.material = rockMaterial;
     }
     else if(child.name === 'outline_grass' && child.isMesh){
        child.material = outlineMaterial
     }
     })
     const box = new THREE.Box3().setFromObject(island);
     const center = box.getCenter(new THREE.Vector3());

     // Set the controls target to the center of the model
     controls.target.copy(center);
     controls.update(); // Important to call this after changing the target

 }, undefined, function (error) {
     console.error(error);
 });
 camera.position.z =200;
 // camera.position.x = -10;
 // Lighting
 const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
 scene.add(ambientLight);
 const sunLight = new THREE.DirectionalLight(0xffffff, 1); // White color and intensity of 1
     sunLight.position.set(30, 10, 10).normalize();; // Position the light at (x, y, z)
     // Optional: Add shadow properties
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
     const sandPlane = new THREE.PlaneGeometry(5000,5000);
     const sandPlaneTextureLoader = new THREE.TextureLoader();
     const sandTexture = sandPlaneTextureLoader.load('./assests/img/sandTexture.png');
     const planeMaterial = new THREE.MeshBasicMaterial({ map: sandTexture, side: THREE.DoubleSide });
     const sandPlaneMesh = new THREE.Mesh(sandPlane, planeMaterial);
     sandPlaneMesh.rotation.x = - Math.PI / 2; // Rotate the plane to be horizontal
     sandPlaneMesh.position.y +=3;
     scene.add(sandPlaneMesh);
 const waterGeometry = new THREE.PlaneGeometry(10000, 10000);
 let water = new THREE.Water(waterGeometry, {
             textureWidth: 600, // Texture resolution
             textureHeight: 600,
             waterNormals: new THREE.TextureLoader().load('./assests/img/waternormals.jpg',(texture)=>{
                 texture.wrapS = texture.wrapT = 6000 ;
             }), // Normal map for water
             sunDirection: new THREE.Vector3(0, 1, 0),
             flowDirection: new THREE.Vector2(1, 1),
             sunColor: 0xffffff,
             waterColor: '#2a90db', // Deep water color
             distortionScale: 1, // Wave distortion effect
             fog: true, // Enable fog if needed
             transparent : true,
             alpha: 0.8, // Control water opacity
             color: '#2a90db',
             // specular: 0x000000,
             reflectivity : 0.1
             });
             water.position.y = 6.55;
             water.rotation.x = - Math.PI / 2; // Make it horizontal
             scene.add(water);
 

             const cubeTextureLoader = new THREE.CubeTextureLoader();
             const envMap = cubeTextureLoader.load([
             './assests/img/sky/left.png',
             './assests/img/sky/right.png',
             './assests/img/sky/up.png',
             './assests/img/sky/down.png',
             './assests/img/sky/front.png',
             './assests/img/sky/back.png',
             ]);
             scene.background = envMap;
             scene.environment = envMap;

             const treeLoader = new THREE.GLTFLoader();
             // treeUrl = './tree_2.glb';
             
             console.log(scene.environment)
             function onMouseClick(event) {
                let tree;
                 const mouse = new THREE.Vector2(
                     (event.clientX / window.innerWidth) * 2 - 1,
                     -(event.clientY / window.innerHeight) * 2 + 1
                 );
                 const raycaster = new THREE.Raycaster();
                 raycaster.setFromCamera(mouse, camera);

                 // Check intersection with island
                 const intersects = raycaster.intersectObjects(scene.children, true); // "true" for recursive check

                 if (intersects.length > 0) {
                     // Get the intersection point
                     const intersectedObject = intersects[0].point;
                     console.log(intersectedObject.y)
                     intersectedObject.y +=0.5
                     let objectName = intersects[0].object.name
                     if(objectName === 'grass' && treeUrl){
                        
                        console.log(tree)
                         treeLoader.load(treeUrl, function (gltf) {
                            const originalModel = gltf.scene;
                            const clonedModel = originalModel.clone()
                            tree = clonedModel;
                         if(treeUrl != './assests/models/tree_3.glb'){
                             tree.scale.set(0.05, 0.05, 0.05); // Adjust size as necessary
                         }
                         else{
                             tree.scale.set(0.19,0.19,0.19)
                         }
                         tree.position.copy(intersectedObject); // Place tree at the intersection point
                         scene.add(tree);
                         }, undefined, function (error) {
                             console.error('Error loading tree model:', error);
                         });   
                     }
                 }
             }
 let raycaster = new THREE.Raycaster();
 let touch = new THREE.Vector2();
 listItems.forEach(item => {
         // item.addEventListener('touchstart', handleTouchEvent);
         item.addEventListener('touchend', () => {
             touchTree = `./assests/models/${item.id}`;
             console.log(touchTree)
         });
         // item.addEventListener('touchmove', handleTouchEvent);
 });
 const planTree = () => {
    let tree ;
     // event.preventDefault();
     const touchEvent = event.changedTouches[0]; // Use the first touch point
     touch.x = (touchEvent.clientX / window.innerWidth) * 2 - 1;
     touch.y = - (touchEvent.clientY / window.innerHeight) * 2 + 1;
     raycaster.setFromCamera(touch, camera);

     // Calculate objects intersecting the ray
     const intersects = raycaster.intersectObjects(scene.children, true);
     if (intersects.length > 0) {
                     // Get the intersection point
                     const intersectedObject = intersects[0].point;
                     intersectedObject.y +=0.5
                     let objectName = intersects[0].object.name;
                     console.log(objectName)
                     if(objectName === 'grass' && touchTree){
                         console.log(touchTree)
                         treeLoader.load(touchTree, function (gltf) {
                            const originalModel = gltf.scene;
                            const clonedModel = originalModel.clone()
                            tree = clonedModel;
                         if(touchTree != './assests/models/tree_3.glb'){
                             tree.scale.set(0.05, 0.05, 0.05); // Adjust size as necessary
                         }
                         else{
                             tree.scale.set(0.1,0.1,0.1)
                         }
                         tree.position.copy(intersectedObject); // Place tree at the intersection point
                         // tree.position.y += 1; // Raise it slightly above the ground if needed
                         scene.add(tree);

                         }, undefined, function (error) {
                             console.error('Error loading tree model:', error);
                         });   
                     }
     }
 }
 window.addEventListener('click',onMouseClick, false)
 touchArea.addEventListener('touchend',planTree , false)
 // Render loop
 function animate() {
     requestAnimationFrame(animate);
     controls.update(); // Required if controls.enableDamping = true, or if controls.autoRotate = true
     water.material.uniforms['time'].value += 0.009;
     water.material.uniforms['distortionScale'].value = 0.5 * Math.sin(Date.now() * 0.001); // Dynamic wave strength
     renderer.render(scene, camera);
     const distance = camera.position.z;
     scene.fog.density = THREE.MathUtils.lerp(0.0015, 0.005, distance / 400);
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