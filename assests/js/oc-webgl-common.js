(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
	typeof define === 'function' && define.amd ? define(['exports'], factory) :
	(factory((global.OCWEBGL = global.OCWEBGL || {})));
}(this, (function (exports) { 'use strict';

THREE.Object3D.prototype.getObjectByUserDataProperty = function(name, value) {
	
	if (this.userData[name] === value ) {
		return this;
	}

	for (var i = 0, l = this.children.length; i < l; i++) {

		var child = this.children[i];
		var object = child.getObjectByUserDataProperty(name, value);

		if (object !== undefined) {
			return object;
		}
	}

	return undefined;
};

THREE.Object3D.prototype.getObjectByEntityId = function(entityId) {
	return this.getObjectByUserDataProperty('entityId', entityId);
};

function PiecewiseLinearCurve3(points) {
	
	THREE.Curve.call(this);
	
	this.points = (points == undefined) ? [] : points;
}

PiecewiseLinearCurve3.prototype.constructor = PiecewiseLinearCurve3;
PiecewiseLinearCurve3.prototype = Object.create(THREE.Curve.prototype);

Object.assign(PiecewiseLinearCurve3.prototype, THREE.Curve.prototype, {
	
	getPointAt : function(t, optionalTarget) {
		
        var points = this.points;

        var d = (points.length - 1) * t;

        var index1 = Math.floor(d);
        var index2 = (index1 < points.length - 1) ? index1 + 1 : index1;

        var pt1 = points[index1];
        var pt2 = points[index2];

        var weight = d - index1;
        var result = new THREE.Vector3().copy(pt1).lerp(pt2, weight);

        if (optionalTarget) {
        	optionalTarget.copy(result);
        }
        
        return result;
	},
	
	getPoint : function(t, optionalTarget) {
       return this.getPointAt(t, optionalTarget);
	}
});

THREE.ShaderLib['gradient-sky'] = {
		
	uniforms: {
		
		topColor : { value: new THREE.Color(0x0077ff) },
		bottomColor : { value: new THREE.Color(0xeeeeee) },
		offset : { value: 33.0 },
		exponent : { value: 0.6 }
	},

	vertexShader: [
	    
	    "varying vec3 vWorldPosition;",
	    
	    "void main() {",
	    	
	    	"vec4 worldPosition = modelMatrix * vec4(position, 1.0);",
	    	"vWorldPosition = worldPosition.xyz;",
	    	"gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
	    "}",
	    
	].join("\n"), 

	fragmentShader: [

		"uniform vec3 topColor;",
		"uniform vec3 bottomColor;",
		"uniform float offset;",
		"uniform float exponent;",
		
		"varying vec3 vWorldPosition;",

		"void main() {",

			"float h = normalize(vWorldPosition + offset).y;",
			"gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);",
		"}",

	].join("\n")

};

function Skydome(topColor, bottomColor, radius) {
	
	var skyShader = THREE.ShaderLib["gradient-sky"];
	
	var uniforms = {
		
		topColor :    { value : topColor },
		bottomColor : { value : bottomColor },
		offset :      { value : 33 },
		exponent :    { value : 0.6 }
	};

	var material = new THREE.ShaderMaterial( {
		fragmentShader : skyShader.fragmentShader,
		vertexShader : skyShader.vertexShader,
		uniforms : uniforms,
		side : THREE.BackSide
	});
	
	THREE.Mesh.apply(this, [new THREE.SphereGeometry(radius, 32, 15), material]);
	this.name = "skydome";
}

Skydome.prototype = Object.create(THREE.Mesh.prototype);
Skydome.prototype.constructor = Skydome;

function Water(geometry, options) {

	THREE.Mesh.call(this, geometry);

	var scope = this;

	options = options || {};

	var textureWidth = options.textureWidth !== undefined ? options.textureWidth : 512;
	var textureHeight = options.textureHeight !== undefined ? options.textureHeight : 512;

	var clipBias = options.clipBias !== undefined ? options.clipBias : 0.0;
	var alpha = options.alpha !== undefined ? options.alpha : 1.0;
	var time = options.time !== undefined ? options.time : 0.0;
	var normalSampler = options.waterNormals !== undefined ? options.waterNormals : null;
	var sunDirection = options.sunDirection !== undefined ? options.sunDirection : new THREE.Vector3(0.70707, 0.70707, 0.0);
	var sunColor = new THREE.Color(options.sunColor !== undefined ? options.sunColor : 0xffffff);
	var waterColor = new THREE.Color(options.waterColor !== undefined ? options.waterColor : 0x7F7F7F);
	var eye = options.eye !== undefined ? options.eye : new THREE.Vector3(0, 0, 0);
	var distortionScale = options.distortionScale !== undefined ? options.distortionScale : 20.0;
	var side = options.side !== undefined ? options.side : THREE.DoubleSide;
	var fog = options.fog !== undefined ? options.fog : false;

	//

	var mirrorPlane = new THREE.Plane();
	var normal = new THREE.Vector3();
	var mirrorWorldPosition = new THREE.Vector3();
	var cameraWorldPosition = new THREE.Vector3();
	var rotationMatrix = new THREE.Matrix4();
	var lookAtPosition = new THREE.Vector3(0, 0, - 1);
	var clipPlane = new THREE.Vector4();

	var view = new THREE.Vector3();
	var target = new THREE.Vector3();
	var q = new THREE.Vector4();

	var textureMatrix = new THREE.Matrix4();

	var mirrorCamera = new THREE.PerspectiveCamera();

	var parameters = {
		minFilter: THREE.LinearFilter,
		magFilter: THREE.LinearFilter,
		format: THREE.RGBFormat,
		stencilBuffer: false
	};

	var renderTarget = new THREE.WebGLRenderTarget(textureWidth, textureHeight, parameters);

	if (! THREE.MathUtils.isPowerOfTwo(textureWidth) || ! THREE.MathUtils.isPowerOfTwo(textureHeight)) {

		renderTarget.texture.generateMipmaps = false;

	}

	var mirrorShader = {

		uniforms: THREE.UniformsUtils.merge([
			THREE.UniformsLib[ 'fog' ],
			THREE.UniformsLib[ 'lights' ],
			{
				"normalSampler": { value: null },
				"mirrorSampler": { value: null },
				"alpha": { value: 1.0 },
				"time": { value: 0.0 },
				"size": { value: 1.0 },
				"distortionScale": { value: 20.0 },
				"textureMatrix": { value: new THREE.Matrix4() },
				"sunColor": { value: new THREE.Color(0x7F7F7F) },
				"sunDirection": { value: new THREE.Vector3(0.70707, 0.70707, 0) },
				"eye": { value: new THREE.Vector3() },
				"surfaceColor": { value: new THREE.Color(0xeff7ff) },
				"waterColor": { value: new THREE.Color(0x555555) }
			}
		]),

		vertexShader: [
			'uniform mat4 textureMatrix;',
			'uniform float time;',

			'varying vec4 mirrorCoord;',
			'varying vec4 worldPosition;',

		 	'#include <common>',
		 	'#include <fog_pars_vertex>',
			'#include <shadowmap_pars_vertex>',
			'#include <logdepthbuf_pars_vertex>',

			'void main() {',
			'	mirrorCoord = modelMatrix * vec4(position, 1.0);',
			'	worldPosition = mirrorCoord.xyzw;',
			'	mirrorCoord = textureMatrix * mirrorCoord;',
			'	vec4 mvPosition =  modelViewMatrix * vec4(position, 1.0);',
			'	gl_Position = projectionMatrix * mvPosition;',

			'#include <logdepthbuf_vertex>',
			'#include <fog_vertex>',
			'#include <shadowmap_vertex>',
			'}'
		].join('\n'),

		fragmentShader: [
			'uniform sampler2D mirrorSampler;',
			'uniform float alpha;',
			'uniform float time;',
			'uniform float size;',
			'uniform float distortionScale;',
			'uniform sampler2D normalSampler;',
			'uniform vec3 sunColor;',
			'uniform vec3 sunDirection;',
			'uniform vec3 eye;',
			'uniform vec3 waterColor;',
			'uniform vec3 surfaceColor;',

			'varying vec4 mirrorCoord;',
			'varying vec4 worldPosition;',

			'vec4 getNoise(vec2 uv) {',
			'	vec2 uv0 = (uv / 103.0) + vec2(time / 17.0, time / 29.0);',
			'	vec2 uv1 = uv / 107.0-vec2(time / -19.0, time / 31.0);',
			'	vec2 uv2 = uv / vec2(8907.0, 9803.0) + vec2(time / 101.0, time / 97.0);',
			'	vec2 uv3 = uv / vec2(1091.0, 1027.0) - vec2(time / 109.0, time / -113.0);',
			'	vec4 noise = texture2D(normalSampler, uv0) +',
			'		texture2D(normalSampler, uv1) +',
			'		texture2D(normalSampler, uv2) +',
			'		texture2D(normalSampler, uv3);',
			'	return noise * 0.5 - 1.0;',
			'}',

			'void sunLight(const vec3 surfaceNormal, const vec3 eyeDirection, float shiny, float spec, float diffuse, inout vec3 diffuseColor, inout vec3 specularColor) {',
			'	vec3 reflection = normalize(reflect(-sunDirection, surfaceNormal));',
			'	float direction = max(0.0, dot(eyeDirection, reflection));',
			'	specularColor += pow(direction, shiny) * sunColor * spec;',
			'	diffuseColor += max(dot(sunDirection, surfaceNormal), 0.0) * sunColor * diffuse;',
			'}',

			'#include <common>',
			'#include <packing>',
			'#include <bsdfs>',
			'#include <fog_pars_fragment>',
			'#include <logdepthbuf_pars_fragment>',
			'#include <lights_pars_begin>',
			'#include <shadowmap_pars_fragment>',
			'#include <shadowmask_pars_fragment>',

			'void main() {',

			'#include <logdepthbuf_fragment>',
			'	vec4 noise = getNoise(worldPosition.xz * size);',
			'	vec3 outgoingLight = vec3(1.0);',
			
			'	if (eye.y > 0.0) {',
			
			'		vec3 surfaceNormal = normalize(noise.xzy * vec3(1.5, 1.2, 1.5));',

			'		vec3 diffuseLight = vec3(0.0);',
			'		vec3 specularLight = vec3(0.0);',

			'		vec3 worldToEye = eye-worldPosition.xyz;',
			'		vec3 eyeDirection = normalize(worldToEye);',
			'		sunLight(surfaceNormal, eyeDirection, 100.0, 2.0, 0.5, diffuseLight, specularLight);',

			'		float distance = length(worldToEye);',
			'		vec2 distortion = surfaceNormal.xz * (0.001 + 1.0 / distance) * distortionScale;',
			
			'		float theta = max(dot(eyeDirection, surfaceNormal), 0.0);',
			'		vec3 scatter = max(0.0, dot(surfaceNormal, eyeDirection)) * waterColor;',
			'		vec3 reflectionSample = vec3(texture2D(mirrorSampler, mirrorCoord.xy / mirrorCoord.w + distortion));',

			'		float rf0 = 0.3;',
			'		float reflectance = rf0 + (1.0 - rf0) * pow((1.0 - theta), 5.0);',
			'		vec3 albedo = mix((sunColor * diffuseLight * 0.3 + scatter) * getShadowMask(), (vec3(0.1) + reflectionSample * 0.9 + reflectionSample * specularLight), reflectance);',
			'		outgoingLight = albedo;',
			
			'	} else {',
			
			'		vec3 surfaceNormal = normalize(noise.xzy * vec3(1.5, 1.0, 1.5));',
			
			'		vec3 diffuseLight = vec3(0.0);',
			'		vec3 specularLight = vec3(0.0);',


			'		vec3 eyeTransformed = vec3(eye.x, -eye.y, eye.z);',
			'		vec3 worldToEye = eyeTransformed-worldPosition.xyz;',
			'		vec3 eyeDirection = normalize(worldToEye);',
			'		sunLight(surfaceNormal, eyeDirection, 100.0, 2.0, 0.5, diffuseLight, specularLight);',

			'		float distance = length(worldToEye);',
			'		vec2 distortion = surfaceNormal.xz * (0.001 + 1.0 / distance) * distortionScale;',
			
			'		float theta = max(dot(eyeDirection, surfaceNormal), 0.0);',
			'		vec3 scatter = max(0.0, dot(surfaceNormal, eyeDirection)) * waterColor;',
			'		vec3 reflectionSample = vec3(distortion, 0.05);',

			'		float rf0 = 0.3;',
			'		float reflectance = rf0 + (1.0 - rf0) * pow((1.0 - theta), 5.0);',
			'		// vec3 albedo = mix(sunColor * diffuseLight * 0.3 + scatter, vec3(0.1), reflectance);',
			'		vec3 albedo = mix(sunColor * diffuseLight * 0.3 + scatter, (vec3(0.2) * waterColor + surfaceColor * 0.9), reflectance);',
			'		outgoingLight = albedo;',
			'	}',
			'	gl_FragColor = vec4(outgoingLight, alpha);',

			'#include <tonemapping_fragment>',
			'#include <fog_fragment>',
			'}'
		].join('\n')

	};

	var material = new THREE.ShaderMaterial({
		fragmentShader: mirrorShader.fragmentShader,
		vertexShader: mirrorShader.vertexShader,
		uniforms: THREE.UniformsUtils.clone(mirrorShader.uniforms),
		transparent: true,
		lights: true,
		side: side,
		fog: fog
	});

	material.uniforms[ "mirrorSampler" ].value = renderTarget.texture;
	material.uniforms[ "textureMatrix" ].value = textureMatrix;
	material.uniforms[ "alpha" ].value = alpha;
	material.uniforms[ "time" ].value = time;
	material.uniforms[ "normalSampler" ].value = normalSampler;
	material.uniforms[ "sunColor" ].value = sunColor;
	material.uniforms[ "waterColor" ].value = waterColor;
	material.uniforms[ "sunDirection" ].value = sunDirection;
	material.uniforms[ "distortionScale" ].value = distortionScale;

	material.uniforms[ "eye" ].value = eye;

	scope.material = material;

	scope.onBeforeRender = function (renderer, scene, camera) {

		mirrorWorldPosition.setFromMatrixPosition(scope.matrixWorld);
		cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld);

		rotationMatrix.extractRotation(scope.matrixWorld);

		normal.set(0, 0, 1);
		normal.applyMatrix4(rotationMatrix);

		view.subVectors(mirrorWorldPosition, cameraWorldPosition);

		// Avoid rendering when mirror is facing away

//		if (view.dot(normal) > 0) return;

		view.reflect(normal).negate();
		view.add(mirrorWorldPosition);

		rotationMatrix.extractRotation(camera.matrixWorld);

		lookAtPosition.set(0, 0, - 1);
		lookAtPosition.applyMatrix4(rotationMatrix);
		lookAtPosition.add(cameraWorldPosition);

		target.subVectors(mirrorWorldPosition, lookAtPosition);
		target.reflect(normal).negate();
		target.add(mirrorWorldPosition);

		mirrorCamera.position.copy(view);
		mirrorCamera.up.set(0, 1, 0);
		mirrorCamera.up.applyMatrix4(rotationMatrix);
		mirrorCamera.up.reflect(normal);
		mirrorCamera.lookAt(target);

		mirrorCamera.far = camera.far; // Used in WebGLBackground

		mirrorCamera.updateMatrixWorld();
		mirrorCamera.projectionMatrix.copy(camera.projectionMatrix);

		// Update the texture matrix
		textureMatrix.set(
			0.5, 0.0, 0.0, 0.5,
			0.0, 0.5, 0.0, 0.5,
			0.0, 0.0, 0.5, 0.5,
			0.0, 0.0, 0.0, 1.0
		);
		textureMatrix.multiply(mirrorCamera.projectionMatrix);
		textureMatrix.multiply(mirrorCamera.matrixWorldInverse);

		// Now update projection matrix with new clip plane, implementing code from: http://www.terathon.com/code/oblique.html
		// Paper explaining this technique: http://www.terathon.com/lengyel/Lengyel-Oblique.pdf
		mirrorPlane.setFromNormalAndCoplanarPoint(normal, mirrorWorldPosition);
		mirrorPlane.applyMatrix4(mirrorCamera.matrixWorldInverse);

		clipPlane.set(mirrorPlane.normal.x, mirrorPlane.normal.y, mirrorPlane.normal.z, mirrorPlane.constant);

		var projectionMatrix = mirrorCamera.projectionMatrix;

		q.x = (Math.sign(clipPlane.x) + projectionMatrix.elements[ 8 ]) / projectionMatrix.elements[ 0 ];
		q.y = (Math.sign(clipPlane.y) + projectionMatrix.elements[ 9 ]) / projectionMatrix.elements[ 5 ];
		q.z = - 1.0;
		q.w = (1.0 + projectionMatrix.elements[ 10 ]) / projectionMatrix.elements[ 14 ];

		// Calculate the scaled plane vector
		clipPlane.multiplyScalar(2.0 / clipPlane.dot(q));

		// Replacing the third row of the projection matrix
		projectionMatrix.elements[ 2 ] = clipPlane.x;
		projectionMatrix.elements[ 6 ] = clipPlane.y;
		projectionMatrix.elements[ 10 ] = clipPlane.z + 1.0 - clipBias;
		projectionMatrix.elements[ 14 ] = clipPlane.w;

		eye.setFromMatrixPosition(camera.matrixWorld);

		//

		var currentRenderTarget = renderer.getRenderTarget();

		var currentXrEnabled = renderer.xr.enabled;
		var currentShadowAutoUpdate = renderer.shadowMap.autoUpdate;

		scope.visible = false;

		renderer.xr.enabled = false; // Avoid camera modification and recursion
		renderer.shadowMap.autoUpdate = false; // Avoid re-computing shadows

		renderer.setRenderTarget(renderTarget);
		if (renderer.autoClear === false) renderer.clear();
		renderer.render(scene, mirrorCamera);

		scope.visible = true;

		renderer.xr.enabled = currentXrEnabled;
		renderer.shadowMap.autoUpdate = currentShadowAutoUpdate;

		renderer.setRenderTarget(currentRenderTarget);

		// Restore viewport

		var viewport = camera.viewport;

		if (viewport !== undefined) {
			renderer.state.viewport(viewport);
		}
	};

}

Water.prototype = Object.create(THREE.Mesh.prototype);
Water.prototype.constructor = Water;

var ObjectHelper = {
		
	getObjectGeometry : function(object) {
		
		var geometry = new THREE.Geometry();
		
		if (object.geometry !== undefined) {
			
			if (object.userData.type === 'Line') {
				
				object.geometry.vertices.forEach(function(vertex) { geometry.vertices.push(new THREE.Vector3(vertex.x , vertex.y, vertex.z)); });
				
			} else if (object.userData.type === 'Jumper') {
				
				object.controlPoints.forEach(function(vertex) { geometry.vertices.push(new THREE.Vector3(vertex.x , vertex.y, vertex.z)); });
				
			} else {
				
				object.updateMatrix();
				object.geometry.computeBoundingSphere();
				
				var secondPoint = new THREE.Vector3(1, 1, 1);
				secondPoint.normalize();
				secondPoint.multiplyScalar(object.geometry.boundingSphere.radius);
				
				geometry.vertices.push(object.position);
				geometry.vertices.push(object.position.clone().add(secondPoint));
				geometry.vertices.push(object.position.clone().sub(secondPoint));
			}
			
		} else {
			
			object.children.forEach(function(child) {
				
				child.updateMatrix();
				
				if (child.geometry !== undefined && child.visible) {
					
					if (child.geometry.boundingSphere) {
						
						var secondPoint = new THREE.Vector3(1, 1, 1);
						secondPoint.normalize();
						secondPoint.multiplyScalar(child.geometry.boundingSphere.radius);
						
						geometry.vertices.push(object.position);
						geometry.vertices.push(object.position.clone().add(secondPoint));
						geometry.vertices.push(object.position.clone().sub(secondPoint));
						
					} else {
						
						var childGeometry = new THREE.Geometry().fromBufferGeometry(child.geometry);
						
						for (var i = 0; i < childGeometry.vertices.length; i++) {
							
							var vertex = childGeometry.vertices[i].clone();
							
							if (child.matrix !== undefined) {
								vertex.applyMatrix4(child.matrix);
							}
							
							geometry.vertices.push(vertex);
						}
					}
				}
			});
		}
		
		return geometry;
	},
	
	getMaterials : function(object) {
		
		var result = [];
		
		if (object.material) {
			result = Array.isArray(object.material) ? object.material : [object.material];
		}
		
		return result;
	},
	
	getParent : function(object) {
		
		var current = object;
		
		while (current.parent !== null && current.parent.type !== 'Scene') {
			current = current.parent;
		}
		
		return current;
	},
	
	getBoundingSphere : function(object) {
		
		var object3d = ObjectHelper.getParent(object);
		
		var helper = new THREE.BoxHelper(object3d);
	    helper.update();
	    helper.geometry.computeBoundingSphere();
	    
	    return helper.geometry.boundingSphere;
	},
	
	getBoundingBox : function(object) {
		
		var object3d = ObjectHelper.getParent(object);
		
		var helper = new THREE.BoxHelper(object3d);
	    helper.update();
	    helper.geometry.computeBoundingBox();
	    
	    return helper.geometry.boundingBox;
	}
};

function SelectionSphere(object, camera) {
	
	var boundingSphere = ObjectHelper.getBoundingSphere(object);
	
	var material = new THREE.ShaderMaterial({
	    uniforms: { 
			"c":   { type: "f", value: 1.0 },
			"p":   { type: "f", value: 1.4 },
			glowColor: { type: "c", value: this.color },
			viewVector: { type: "v3", value: camera.position }
		},
		vertexShader: this.vertexShader,
		fragmentShader: this.fragmentShader,
		side: THREE.FrontSide,
		blending: THREE.AdditiveBlending,
		transparent: true
	});
	
	THREE.Mesh.apply(this, [new THREE.SphereGeometry(boundingSphere.radius * 0.9, 20, 20), material]);
	this.position.copy(boundingSphere.center);
}

SelectionSphere.prototype.constructor = SelectionSphere;

Object.assign(SelectionSphere.prototype, THREE.Mesh.prototype, THREE.Object3D.prototype, THREE.EventDispatcher.prototype, {

	color : new THREE.Color(0x00b3ff),
	
	vertexShader : [
		'uniform vec3 viewVector;',
		'uniform float c;',
		'uniform float p;',
		'varying float intensity;',
		
		'void main() {',
		'    vec3 vNormal = normalize(normalMatrix * normal);',
		'    vec3 vNormel = normalize(normalMatrix * viewVector);',
		'    intensity = pow(c - dot(vNormal, vNormel), p);',
		'    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
		'}',
	].join('\n'),
	
	fragmentShader : [
		'uniform vec3 glowColor;',
		'varying float intensity;',
		
		'void main() {',
		'    vec3 glow = glowColor * intensity;',
		'    gl_FragColor = vec4(glow, 1.0);',
		'}',
	].join('\n'),
	
	update : function(camera) {
		
		this.material.uniforms.viewVector.value = new THREE.Vector3().subVectors(camera.position, this.position);
	}
});

var Axis = {
	X : 'x',
	Y : 'y',
	Z : 'z'
};

var RotationHelper = {
		
	axisToOrder : { x : 'zyx', y : 'zxy', z : 'xyz'},
		
	calculateForAxis : function(roll, pitch, yaw, axis) {
		
		var order = RotationHelper.axisToOrder[axis];
		return RotationHelper.calculateForOrder(roll, pitch, yaw, order);
	},
	
	calculateForOrder : function(roll, pitch, yaw, order) {
		
		var rotationFunction = order && RotationHelper[order] ? RotationHelper[order] : RotationHelper.xyz;
		return rotationFunction.call(null, roll, pitch, yaw);
	},
	
	xyz : function(roll, pitch, yaw) {
		return RotationHelper.roll(roll).multiply(RotationHelper.pitch(pitch)).multiply(RotationHelper.yaw(yaw));
	},
	
	zxy : function(roll, pitch, yaw) {
		return RotationHelper.yaw(yaw).multiply(RotationHelper.roll(roll)).multiply(RotationHelper.pitch(pitch));
	},
	
	zyx : function(roll, pitch, yaw) {
		return RotationHelper.yaw(yaw).multiply(RotationHelper.pitch(pitch)).multiply(RotationHelper.roll(roll));
	},
	
	roll : function(angle) {
		return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), THREE.Math.degToRad(-angle))
	},
	
	pitch : function(angle) {
		return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.Math.degToRad(-angle));
	},
	
	yaw : function(angle) {
		return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.Math.degToRad(angle));
	}
};

function VectorDiffResult(left, right) {
	
	this.left = left;
	this.right = right;
	this.components = [];
	
	this.compare();
}

VectorDiffResult.prototype.constructor = VectorDiffResult;

Object.assign(VectorDiffResult.prototype, {
	
	compare : function() {
		
		for (var component in Axis) {
			
			if (this.left[Axis[component]] != this.right[Axis[component]]) {
				this.components.push(Axis[component]);
			}
		}
		
		return this;
	}
});

var CoordsHelper = {
		
	transformCoord_World_Screen : function(coord) {
		// OC to threeJs
		return new THREE.Vector3(coord.x, coord.z, -coord.y);
	},
	transformCoord_Local_Screen : function(coord) {
		return new THREE.Vector3(-coord.y, coord.z, -coord.x);
	},
	transformCoord_Local_World : function(coord) {
		return new THREE.Vector3(-coord.y, coord.x, coord.z);
	},

	transformCoords_World_Screen : function(coords)  {
		// oc to 3js list of points
		var result = [];
		coords.forEach(function(coord) { result.push(CoordsHelper.transformCoord_World_Screen(coord)); });

		return result;
	},

	transformCoord_Screen_World : function(coord) {
		// from theeJs to OC
		return new THREE.Vector3(coord.x, -coord.z, coord.y);
	},
	
	fromScreenToWorldForAll : function(coords) {
		
		var result = [];
		coords.forEach(function(coord) { result.push(CoordsHelper.transformCoord_Screen_World(coord)); });

		return result;
	},
	
	transformRotation : function(rotation, angle) {
		// ovo ne znam sto bi trebalo biti. Rotacije mislim da ovo ne mogu raditi. 
		return new THREE.Vector3(-rotation.z, -rotation.x, angle);
	},
	
	calculateRotation : function(roll, pitch, yaw) {
		// u javi je ova funkcije drukcija i opet ovdje kao i javi ne mogu se lokane rotacije primjeniti na globalne osi, trebaju prvo lokano pa onda prebaciti u globalno
		// isto redoljed rotacija treba biti yaw, pitch pa onda roll da se azimuth uvijek postuje
		
//		 var quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.Math.degToRad(yaw));
		var quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), THREE.Math.degToRad(-roll));
        quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.Math.degToRad(-pitch)));
        quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.Math.degToRad(yaw)));
        
        return quaternion;
	},
	
	getMouseCoords : function(event, domElement) {
		
		var offset = function(domElement) {
			return { left : domElement.getBoundingClientRect().left, top : domElement.getBoundingClientRect().top };
		};
		
		var offset = offset(domElement);
		var mouse = new THREE.Vector2();
		mouse.x = ((event.clientX - offset.left) / domElement.clientWidth) * 2 - 1;
		mouse.y = -((event.clientY - offset.top) / domElement.clientHeight) * 2 + 1;
		
		return mouse;
	}
};

var LineHelper = {
		
	info : function(data) {
		
		var result = {
				
				length : 0,
				max : { x : 0, y : 0, z : 0 },
				min : { x : 0, y : 0, z : 0 },
				first : { x : data[0].x, y : data[0].y, z : data[0].z },
				last : { x : data[data.length - 1].x, y : data[data.length - 1].y, z : data[data.length - 1].z },
				numberOfSegments : data.length - 1,
				points : [],
				segments : []
		};
		
		data.forEach(function(vertex) { result.points.push(new THREE.Vector3(vertex.x, vertex.y, vertex.z)); });
		
		for (var index = 0; index < result.points.length; index++) {
			
			var currentPoint = result.points[index];
			var previousPoint = index === 0 ? currentPoint.clone() : result.points[index - 1];
			
			if (index > 0) {
				result.segments.push([previousPoint, currentPoint]);
			}
			
			result.length += previousPoint.distanceTo(currentPoint);
			currentPoint.lineLength = result.length;
			
			result.max.x = result.max.x < currentPoint.x ? currentPoint.x : result.max.x;
			result.min.x = result.min.x > currentPoint.x ? currentPoint.x : result.min.x;
			
			result.max.y = result.max.y < currentPoint.y ? currentPoint.y : result.max.y;
			result.min.y = result.min.y > currentPoint.y ? currentPoint.y : result.min.y;
			
			result.max.z = result.max.z < currentPoint.z ? currentPoint.z : result.max.z;
			result.min.z = result.min.z > currentPoint.z ? currentPoint.z : result.min.z;
		}
		
		return result;
	},

	addPointAtDistance : function(line, index, distance) {
		
		var points = line.geometry.vertices.slice();
		
		if (index > 0) {
			points.reverse();
		}
		
		var length = LineHelper.info(points).length;
		
		if (length < distance) {
			throw { name : "Distance is greater than line length", message : "Distance is greater than line length" };
		}
		
		var currentLength = 0;
		var segmentStartLength = 0;
		var currentPoint, previousPoint, insertionIndex;
		
		for (var i = 0; i < points.length; i++) {
			
			currentPoint = points[i];
			previousPoint = i === 0 ? currentPoint.clone() : points[i - 1];
			
			currentLength += previousPoint.distanceTo(currentPoint);
			
			if (currentLength >= distance) {
				
				insertionIndex = index == 0 ? i : points.length - i;
				break;
			}
			
			segmentStartLength += previousPoint.distanceTo(currentPoint);
		}
		
		var deltaLength = distance - segmentStartLength;
		var segmentLength = previousPoint.distanceTo(currentPoint);
		var segmentRatio = deltaLength / segmentLength;
		
		var calculatedPoint = new THREE.Vector3();
		calculatedPoint.lerpVectors(previousPoint, currentPoint, segmentRatio);
		
		var geometry = new THREE.Geometry();
		geometry.dynamic = true;
		
		for (i = 0; i < line.geometry.vertices.length; i++) {
			
			if (i === insertionIndex) {
				geometry.vertices.push(calculatedPoint);
			}
			
			geometry.vertices.push(line.geometry.vertices[i]);
		}
		
		line.geometry.dispose();
		line.geometry = geometry;
		line.geometry.verticesNeedUpdate = true;
	},
	
	adjust : function(data, mesh, segmentLength, tolerance, upAxis, od) {
		
		var up = new THREE.Vector3(), offset = od === undefined ? 0 : od / 2;
		up[upAxis] = 1;
		
		var rayCaster = new THREE.Raycaster(), direction = up.clone(), origin = new THREE.Vector3();
		var info = LineHelper.info(data), result = [];
		
		direction.negate();
		origin[upAxis] = info.max[upAxis] + 500;
		
		for (var segmentIndex = 0; segmentIndex < info.segments.length; segmentIndex++) {
			
			var segment = info.segments[segmentIndex].slice(), points = [segment[0]], first = new THREE.Vector3().copy(segment[0]), current = new THREE.Vector3().copy(segment[0]);
			
			while (current.distanceTo(segment[1]) > segmentLength) {
				
				var step = segmentLength / first.distanceTo(segment[1]);
				var curve = new PiecewiseLinearCurve3([first, segment[1]]);
				
				for (var currentStep = 0; currentStep < 1; currentStep += step) {
					
					var point = curve.getPointAt(currentStep);
					current.copy(point);
					
					origin.x = point.x;
					origin.z = point.z;
					
					rayCaster.set(origin, direction);
					var intersections = rayCaster.intersectObject(mesh);
					
					if (intersections.length > 0) {
						
						var distanceToIntersection = point.distanceTo(intersections[0].point);
						
						if (point[upAxis] < intersections[0].point[upAxis] || (distanceToIntersection > tolerance && point[upAxis] > intersections[0].point[upAxis])) {
							
							point[upAxis] = intersections[0].point[upAxis] + offset;
							
							first.copy(point);
							points.push(point);
							
							break;
						}
					}
				}
			}
			
			if (segmentIndex === info.segments.length - 1) {
				points.push(segment[1]);
			}
			
			result = result.concat(points);
		}
		
		return result;
	},
	
	createGeometry : function(data, type, seabed) {
		
		var points = data;
		var geometry = new THREE.Geometry();
		geometry.dynamic = true;
		
		points.forEach(function(point) {
	    	geometry.vertices.push(point);
		});
		
		return geometry;
	},
	
	createPipeGeometry : function(points, radius) {
		
		var geometry = new THREE.TubeGeometry(new PiecewiseLinearCurve3(points), 100, radius, 20);
		geometry.dynamic = true;
		
		return geometry;
	}
};

var IntersectionHelper = {
	
	findIntersection : function(event, domElement, camera, intersectables, linePrecison) {
		
		var mouse = CoordsHelper.getMouseCoords(event, domElement);
		var raycaster = new THREE.Raycaster();
		raycaster.setFromCamera(mouse, camera);
		raycaster.threshold = linePrecison === undefined ? 1 : linePrecison;
		
		var intersects = raycaster.intersectObjects(intersectables, true);
		
		return intersects.length > 0 ? intersects[0] : null;
	},
	
	filterIntersectables : function(scene, exclusion) {
		
		var result = [];
		var names = exclusion == undefined ? [] : exclusion;
		
		for (var index = 0; index < scene.children.length; index++) {
			
			var child = scene.children[index];
			
			if (names.indexOf(child.name) === -1 && child.type.indexOf('Sprite') === -1 && child.type.indexOf('Light') === -1 && child.visible) {
				result.push(child);
			}
		}
		
		return result;
	},
	
	getIntersectionData : function(intersection) {
		
		var surfaceNormal = intersection.face.normal.clone();
		surfaceNormal.applyEuler(intersection.object.rotation);
		
		var quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), surfaceNormal);
		var euler = new THREE.Euler().setFromQuaternion(quaternion);
		
		return { position : intersection.point.clone(), rotation : { x: THREE.Math.radToDeg(euler.x), y : THREE.Math.radToDeg(euler.y), z : THREE.Math.radToDeg(euler.z) } };
	}
};

var PropertyModifier = {
		
	scaleFactors : {},
	originalSize : {},
	rotationProperties : ['azimuth', 'position', 'orientation', 'size', 'scale', 'name'],
	
	position : function(node, value) {
		node.position.copy(CoordsHelper.transformCoord_World_Screen(value));
	},
	
	orientation : function(node, value) {
		
		node.setRotationFromQuaternion(RotationHelper.calculateForOrder(value.x, value.y, value.z, 'xyz'));
		node.userData.orientation = { x : value.x, y : value.y, z : value.z };
	},
	
	size : function(node, value) {
		
		var scaleFactor = PropertyModifier.getScaleFactor(node.userData.assetType, value);
		node.scale.copy(new THREE.Vector3(scaleFactor, scaleFactor, scaleFactor));
	},
	
	color : function(node, value) {
		
		if (node.material) {
			
			var rgba = OC.ColorHelper.longToRGBA(parseInt(value));
			node.material.color = new THREE.Color(rgba[0], rgba[1], rgba[2]);
		}
	},
	
	points : function(node, value, seabed) {
		
		var geometry = new THREE.Geometry();
		geometry.dynamic = true;
		node.geometry.dispose();
		
		var points = CoordsHelper.transformCoords_World_Screen(value), od = node.userData.od;
		node.geometry = LineHelper.createPipeGeometry(points, od * 0.5);
		node.geometry.verticesNeedUpdate = true;
	},
	
	modify : function(node, property, value, seabed) {
		
		if (PropertyModifier[property] !== undefined ) {
			PropertyModifier[property].apply(null, [node, value, seabed]);
		}
	},
	
	getScaleFactor : function(assetType, size) {
		
		var originalSize = PropertyModifier.originalSize[assetType] ? PropertyModifier.originalSize[assetType] : size.x;
		return size.x / originalSize;
	}
};

var ElementHelper = {
	
	propertyExtractors : {
		
		Line : function(element) {
			
			var result = { points : [], od: element.userData.od.value };
			
			element.geometry.vertices.forEach(function(vertex) {
				result.points.push({ x: vertex.x, y : vertex.y, z : vertex.z });
			});
			
			return result;
		},
		
		Jumper : function(element) {
			
			var result = { points : [], od: element.userData.od.value };
			
			element.controlPoints.forEach(function(vertex) {
				result.points.push({ x: vertex.x, y : vertex.y, z : vertex.z });
			});
			
			return result;
		},
		
		Structure : function(element) {
			return { position : { x : element.position.x, y : element.position.y, z : element.position.z }, rotation : { x : element.rotation.x, y : element.rotation.y, z : element.rotation.z }};
		}
	},
	
	getProperties : function(element) {
		
		var properties = ElementHelper.propertyExtractors[element.objectType] === undefined ? {} :  ElementHelper.propertyExtractors[element.objectType].call(null, element);
		var connectionPoints = {};
		
		element.children.forEach(function(child) {
			
			if (child.userData.type == 'connection-point') {
				connectionPoints[child.userData.connectionPointId] = { x : child.position.x, y : child.position.y, z : child.position.z };
			}
		});
		
		return { id : element.entityId, name : element.name, type : element.objectType, adjustable : element.userData.adjustable, properties : properties, connections : element.userData.connections, connectionPoints : connectionPoints, rule : element.userData.rule };
	},
	
	updateConnectionPoints : function(element, connectionPoints, scaleFactor, showLocalAxes) {
		
		var removeList = [];
		
		element.children.forEach(function(child) {
			
			if (child.userData.type === 'connection-point') {
				removeList.push(child);
			}
		});
		
		for (var index = 0; index < removeList.length; index++) {
			
			var connectionPointNode = removeList[index];
			element.remove(connectionPointNode);
			
			if (connectionPointNode.geometry !== undefined) {
				connectionPointNode.geometry.dispose();
			}
		}
		
		removeList = [];
		
		connectionPoints.forEach(function(connectionPoint) {
			
			var geometry = new THREE.SphereGeometry(0.1), material = new THREE.MeshBasicMaterial( {color: 0x8B0000} );
			// cp je u lokalnom coord. gdje
			// loc.x = OC.y = -3js.z
			// loc.y = -OC.x = -3js.x
			// loc.z = OC.z = 3js.y
			// var position = new THREE.Vector3(-connectionPoint.position.y, connectionPoint.position.x, connectionPoint.position.z);
			var position = CoordsHelper.transformCoord_Local_World(connectionPoint.position);
			var transformedPosition = CoordsHelper.transformCoord_World_Screen(position).multiplyScalar(1 / scaleFactor);
			
			var sphere = new THREE.Mesh(geometry, material);
			sphere.position.set(transformedPosition.x, transformedPosition.y, transformedPosition.z);
			sphere.userData.connectionPointId = connectionPoint.id;
			sphere.userData.type = 'connection-point';
			sphere.visible = showLocalAxes;

			element.add(sphere);
		});
	}
};

var CameraHelper = {
	
	calculatePositionFromBoundingBox : function(box, center, fov, distanceRatio, min, max) {
		
		var ratio = distanceRatio === undefined ? 1 : distanceRatio;
		var height = box.max.z - box.min.z;
		var width = box.max.x - box.min.x;
		var distance = Math.abs(Math.max(width, height) / Math.sin((fov * (Math.PI / 180)) / 2));
		
		if (undefined !== min && distance < min) {
			distance = min;
		} else if (undefined !== max && distance > max) {
			distance = max;
		}
		
		return center.clone().add(new THREE.Vector3(0, distance / ratio, 0));
	}
};

var SceneHelper = {
	
	showSelection : function(scene, camera, selectedObjects) {
		
		var selectionHelper = scene.getObjectByName('selection-helper');
		
		if (selectionHelper !== undefined) {
			scene.remove(selectionHelper);
			selectionHelper.geometry.dispose();
		}
		
		if (selectedObjects.length > 0) {
			
			if (!["Line", "Jumper"].includes(selectedObjects[0].userData.type)) {
				
				selectionHelper = new SelectionSphere(selectedObjects[0], camera);
				selectionHelper.name = 'selection-helper';
				scene.add(selectionHelper);
			}
		}
	},
	
	updateSelection : function(scene, camera) {
		
		var selectionHelper = scene.getObjectByName('selection-helper');
		
		if (selectionHelper !== undefined) {
			selectionHelper.update(camera);
		}
	}
};

function Axes(renderer, orthoScene, orthoCamera, directionalLight, ambientLight) {

	this.scene = new THREE.Scene();
	this.hudCamera = new THREE.PerspectiveCamera(55.0, 1024 / 1024, 1, 2000);
	
	this.texture = new THREE.WebGLRenderTarget(1024, 1024, { format: THREE.RGBAFormat } );
	this.sprite = new THREE.Sprite(new THREE.SpriteMaterial( { map : this.texture.texture, transparent : true } ));
	this.sprite.scale.set(120, 120, 120);
	this.sprite.position.set(orthoCamera.right - 76, orthoCamera.top - 76, 0);
	
	orthoScene.add(this.sprite);
	
	var light = new THREE.DirectionalLight(0xffffbb, 1);
	light.position.set(0, 100, 0);
	this.scene.add(light);
	
	light = light.clone();
	light.position.set(100, 0, 0);
	this.scene.add(light);
	
	light = light.clone();
	light.position.set(0, 0, -100);
	this.scene.add(light);
	
	light = light.clone();
	light.position.set(0, 0, 100);
	this.scene.add(light);
	
	this.scene.add(ambientLight);
	this.scene.add(this.createAxes(100));
}

Axes.prototype.constructor = Axes;

Object.assign(Axes.prototype,  {

	update : function(camera, controls) {
		
		this.hudCamera.position.copy(camera.position);
		this.hudCamera.position.sub(controls.target);
		this.hudCamera.position.setLength(225);
		this.hudCamera.lookAt(this.scene.position);
	},
	
	render : function(renderer) {
		
		
		renderer.setRenderTarget(this.texture);
		renderer.clear(true);
		renderer.render(this.scene, this.hudCamera);
		renderer.setRenderTarget(null);
	},
	
	createAxes : function(size) {
		
		var axes = new THREE.Object3D();
		var coneGeometry = new THREE.CylinderBufferGeometry(0, 5, 10, 10, 1);
		
		var xAxisLineGeometry = new THREE.TubeGeometry(new PiecewiseLinearCurve3([new THREE.Vector3(), new THREE.Vector3(size, 0, 0)], 50, 2, 4));
		var xAxisConeGeometry = coneGeometry.clone();
		xAxisConeGeometry.rotateZ(-Math.PI / 2);
		xAxisConeGeometry.translate(size, 0, 0);
		
		var xAxis = new THREE.Mesh(xAxisLineGeometry, new THREE.MeshLambertMaterial({ 
	        color: 0xff0000, 
	        wireframe: false,
	        side : THREE.DoubleSide
	    }));
		
		var cone = new THREE.Mesh(xAxisConeGeometry, new THREE.MeshLambertMaterial({ 
	        color: 0xff0000, 
	        wireframe: false,
	        side : THREE.DoubleSide
	    }));
		
		axes.add(xAxis);
		axes.add(cone);
		
		var labelSprite = this.createTextSprite("X", "20", "rgba(255,0,0,1)");
		axes.add(labelSprite);
		labelSprite.position.set(size - 20, -2.5, 20);
		labelSprite.scale.set(20, 20, 20);
		
		var yAxisLineGeometry = new THREE.TubeGeometry(new PiecewiseLinearCurve3([new THREE.Vector3(), new THREE.Vector3(0, 0, -size)], 50, 2, 4));
		var yAxisConeGeometry = coneGeometry.clone();
		yAxisConeGeometry.rotateX(-Math.PI / 2);
		yAxisConeGeometry.translate(0, 0, -size);
		
		var yAxis = new THREE.Mesh(yAxisLineGeometry, new THREE.MeshLambertMaterial({ 
	        color: 0x0000cc, 
	        wireframe: false,
	        side : THREE.DoubleSide
	    }));
		
		cone = new THREE.Mesh(yAxisConeGeometry, new THREE.MeshLambertMaterial({ 
	        color: 0x0000cc, 
	        wireframe: false,
	        side : THREE.DoubleSide
	    }));
		
		axes.add(yAxis);
		axes.add(cone);
		
		labelSprite = this.createTextSprite("Y", "20", "rgba(0, 0, 255, 1)");
		axes.add(labelSprite);
		labelSprite.position.set(-20, -2.5, -size + 20);
		labelSprite.scale.set(20, 20, 20);
		
		var zAxisLineGeometry = new THREE.TubeGeometry(new PiecewiseLinearCurve3([new THREE.Vector3(), new THREE.Vector3(0, size, 0)], 50, 2, 4));
		var zAxisConeGeometry = coneGeometry.clone();
		zAxisConeGeometry.translate(0, size, 0);
		
		var zAxis = new THREE.Mesh(zAxisLineGeometry, new THREE.MeshLambertMaterial({ 
	        color: 0x009900, 
	        wireframe: false,
	        side : THREE.DoubleSide
	    }));
		
		cone = new THREE.Mesh(zAxisConeGeometry, new THREE.MeshLambertMaterial({ 
	        color: 0x009900, 
	        wireframe: false,
	        side : THREE.DoubleSide
	    }));
		
		axes.add(zAxis);
		axes.add(cone);
		
		labelSprite = this.createTextSprite("Z", "20", "rgba(0, 255, 0, 1)");
		axes.add(labelSprite);
		labelSprite.position.set(20, size - 20, 20);
		labelSprite.scale.set(20, 20, 20);
		
		return axes;
	},
	
	createTextSprite : function(message, fontsize, color) {
	    
		var canvas = document.createElement('canvas');
		var context = canvas.getContext('2d');
		context.font = fontsize + "px Arial";
		canvas.width = context.measureText(message).width;
	    canvas.height = fontsize * 2;
	    context.font = fontsize + "px Arial";        
	    context.fillStyle = "rgba(255,0,0,1)";
	    context.fillStyle = color;
	    context.fillText(message, 0, fontsize);
	    
	    var texture = new THREE.Texture(canvas);
	    texture.minFilter = THREE.LinearFilter;
	    texture.needsUpdate = true;

	    return new THREE.Sprite(new THREE.SpriteMaterial({ map : texture, transparent : true }));   
	}
});

/**
 * Loads a Wavefront .mtl file specifying materials
 *
 * @author angelxuanchang
 */

function MTLLoader( manager ) {

	THREE.Loader.call( this, manager );

}

MTLLoader.prototype = Object.assign( Object.create( THREE.Loader.prototype ), {

	constructor: MTLLoader,

	/**
	 * Loads and parses a MTL asset from a URL.
	 *
	 * @param {String} url - URL to the MTL file.
	 * @param {Function} [onLoad] - Callback invoked with the loaded object.
	 * @param {Function} [onProgress] - Callback for download progress.
	 * @param {Function} [onError] - Callback for download errors.
	 *
	 * @see setPath setResourcePath
	 *
	 * @note In order for relative texture references to resolve correctly
	 * you must call setResourcePath() explicitly prior to load.
	 */
	load: function ( url, onLoad, onProgress, onError ) {

		var scope = this;

		var path = ( this.path === '' ) ? THREE.LoaderUtils.extractUrlBase( url ) : this.path;

		var loader = new THREE.FileLoader( this.manager );
		loader.setPath( this.path );
		loader.load( url, function ( text ) {

			onLoad( scope.parse( text, path ) );

		}, onProgress, onError );

	},

	setMaterialOptions: function ( value ) {

		this.materialOptions = value;
		return this;

	},

	/**
	 * Parses a MTL file.
	 *
	 * @param {String} text - Content of MTL file
	 * @return {MTLLoader.MaterialCreator}
	 *
	 * @see setPath setResourcePath
	 *
	 * @note In order for relative texture references to resolve correctly
	 * you must call setResourcePath() explicitly prior to parse.
	 */
	parse: function ( text, path ) {

		var lines = text.split( '\n' );
		var info = {};
		var delimiter_pattern = /\s+/;
		var materialsInfo = {};

		for ( var i = 0; i < lines.length; i ++ ) {

			var line = lines[ i ];
			line = line.trim();

			if ( line.length === 0 || line.charAt( 0 ) === '#' ) {

				// Blank line or comment ignore
				continue;

			}

			var pos = line.indexOf( ' ' );

			var key = ( pos >= 0 ) ? line.substring( 0, pos ) : line;
			key = key.toLowerCase();

			var value = ( pos >= 0 ) ? line.substring( pos + 1 ) : '';
			value = value.trim();

			if ( key === 'newmtl' ) {

				// New material

				info = { name: value };
				materialsInfo[ value ] = info;

			} else {

				if ( key === 'ka' || key === 'kd' || key === 'ks' || key === 'ke' ) {

					var ss = value.split( delimiter_pattern, 3 );
					info[ key ] = [ parseFloat( ss[ 0 ] ), parseFloat( ss[ 1 ] ), parseFloat( ss[ 2 ] ) ];

				} else {

					info[ key ] = value;

				}

			}

		}

		var materialCreator = new MTLLoader.MaterialCreator( this.resourcePath || path, this.materialOptions );
		materialCreator.setCrossOrigin( this.crossOrigin );
		materialCreator.setManager( this.manager );
		materialCreator.setMaterials( materialsInfo );
		return materialCreator;

	}

} );

/**
 * Create a new MTLLoader.MaterialCreator
 * @param baseUrl - Url relative to which textures are loaded
 * @param options - Set of options on how to construct the materials
 *                  side: Which side to apply the material
 *                        THREE.FrontSide (default), THREE.BackSide, THREE.DoubleSide
 *                  wrap: What type of wrapping to apply for textures
 *                        THREE.RepeatWrapping (default), THREE.ClampToEdgeWrapping, THREE.MirroredRepeatWrapping
 *                  normalizeRGB: RGBs need to be normalized to 0-1 from 0-255
 *                                Default: false, assumed to be already normalized
 *                  ignoreZeroRGBs: Ignore values of RGBs (Ka,Kd,Ks) that are all 0's
 *                                  Default: false
 * @constructor
 */

MTLLoader.MaterialCreator = function ( baseUrl, options ) {

	this.baseUrl = baseUrl || '';
	this.options = options;
	this.materialsInfo = {};
	this.materials = {};
	this.materialsArray = [];
	this.nameLookup = {};

	this.side = ( this.options && this.options.side ) ? this.options.side : THREE.FrontSide;
	this.wrap = ( this.options && this.options.wrap ) ? this.options.wrap : THREE.RepeatWrapping;

};

MTLLoader.MaterialCreator.prototype = {

	constructor: MTLLoader.MaterialCreator,

	crossOrigin: 'anonymous',

	setCrossOrigin: function ( value ) {

		this.crossOrigin = value;
		return this;

	},

	setManager: function ( value ) {

		this.manager = value;

	},

	setMaterials: function ( materialsInfo ) {

		this.materialsInfo = this.convert( materialsInfo );
		this.materials = {};
		this.materialsArray = [];
		this.nameLookup = {};

	},

	convert: function ( materialsInfo ) {

		if ( ! this.options ) return materialsInfo;

		var converted = {};

		for ( var mn in materialsInfo ) {

			// Convert materials info into normalized form based on options

			var mat = materialsInfo[ mn ];

			var covmat = {};

			converted[ mn ] = covmat;

			for ( var prop in mat ) {

				var save = true;
				var value = mat[ prop ];
				var lprop = prop.toLowerCase();

				switch ( lprop ) {

					case 'kd':
					case 'ka':
					case 'ks':

						// Diffuse color (color under white light) using RGB values

						if ( this.options && this.options.normalizeRGB ) {

							value = [ value[ 0 ] / 255, value[ 1 ] / 255, value[ 2 ] / 255 ];

						}

						if ( this.options && this.options.ignoreZeroRGBs ) {

							if ( value[ 0 ] === 0 && value[ 1 ] === 0 && value[ 2 ] === 0 ) {

								// ignore

								save = false;

							}

						}

						break;

					default:

						break;

				}

				if ( save ) {

					covmat[ lprop ] = value;

				}

			}

		}

		return converted;

	},

	preload: function () {

		for ( var mn in this.materialsInfo ) {

			this.create( mn );

		}

	},

	getIndex: function ( materialName ) {

		return this.nameLookup[ materialName ];

	},

	getAsArray: function () {

		var index = 0;

		for ( var mn in this.materialsInfo ) {

			this.materialsArray[ index ] = this.create( mn );
			this.nameLookup[ mn ] = index;
			index ++;

		}

		return this.materialsArray;

	},

	create: function ( materialName ) {

		if ( this.materials[ materialName ] === undefined ) {

			this.createMaterial_( materialName );

		}

		return this.materials[ materialName ];

	},

	createMaterial_: function ( materialName ) {

		// Create material

		var scope = this;
		var mat = this.materialsInfo[ materialName ];
		var params = {

			name: materialName,
			side: this.side

		};

		function resolveURL( baseUrl, url ) {

			if ( typeof url !== 'string' || url === '' )
				return '';

			// Absolute URL
			if ( /^(blob:)?https?:\/\//i.test( url ) ) return url;

			return baseUrl + url;

		}

		function setMapForType( mapType, value ) {

			if ( params[ mapType ] ) return; // Keep the first encountered texture

			var texParams = scope.getTextureParams( value, params );
			var map = scope.loadTexture( resolveURL( scope.baseUrl, texParams.url ) );

			map.repeat.copy( texParams.scale );
			map.offset.copy( texParams.offset );

			map.wrapS = scope.wrap;
			map.wrapT = scope.wrap;

			params[ mapType ] = map;

		}

		for ( var prop in mat ) {

			var value = mat[ prop ];
			var n;

			if ( value === '' ) continue;

			switch ( prop.toLowerCase() ) {

				// Ns is material specular exponent

				case 'kd':

					// Diffuse color (color under white light) using RGB values

					params.color = new THREE.Color().fromArray( value );

					break;

				case 'ks':

					// Specular color (color when light is reflected from shiny surface) using RGB values
					params.specular = new THREE.Color().fromArray( value );

					break;

				case 'ke':

					// Emissive using RGB values
					params.emissive = new THREE.Color().fromArray( value );

					break;

				case 'map_kd':

					// Diffuse texture map

					setMapForType( "map", value );

					break;

				case 'map_ks':

					// Specular map

					setMapForType( "specularMap", value );

					break;

				case 'map_ke':

					// Emissive map

					setMapForType( "emissiveMap", value );

					break;

				case 'norm':

					setMapForType( "normalMap", value );

					break;

				case 'map_bump':
				case 'bump':

					// Bump texture map

					setMapForType( "bumpMap", value );

					break;

				case 'map_d':

					// Alpha map

					setMapForType( "alphaMap", value );
					params.transparent = true;

					break;

				case 'ns':

					// The specular exponent (defines the focus of the specular highlight)
					// A high exponent results in a tight, concentrated highlight. Ns values normally range from 0 to 1000.

					params.shininess = parseFloat( value );

					break;

				case 'd':
					n = parseFloat( value );

					if ( n < 1 ) {

						params.opacity = n;
						params.transparent = true;

					}

					break;

				case 'tr':
					n = parseFloat( value );

					if ( this.options && this.options.invertTrProperty ) n = 1 - n;

					if ( n > 0 ) {

						params.opacity = 1 - n;
						params.transparent = true;

					}

					break;

				default:
					break;

			}

		}

		this.materials[ materialName ] = new THREE.MeshPhongMaterial( params );
		return this.materials[ materialName ];

	},

	getTextureParams: function ( value, matParams ) {

		var texParams = {

			scale: new THREE.Vector2( 1, 1 ),
			offset: new THREE.Vector2( 0, 0 )

		 };

		var items = value.split( /\s+/ );
		var pos;

		pos = items.indexOf( '-bm' );

		if ( pos >= 0 ) {

			matParams.bumpScale = parseFloat( items[ pos + 1 ] );
			items.splice( pos, 2 );

		}

		pos = items.indexOf( '-s' );

		if ( pos >= 0 ) {

			texParams.scale.set( parseFloat( items[ pos + 1 ] ), parseFloat( items[ pos + 2 ] ) );
			items.splice( pos, 4 ); // we expect 3 parameters here!

		}

		pos = items.indexOf( '-o' );

		if ( pos >= 0 ) {

			texParams.offset.set( parseFloat( items[ pos + 1 ] ), parseFloat( items[ pos + 2 ] ) );
			items.splice( pos, 4 ); // we expect 3 parameters here!

		}

		texParams.url = items.join( ' ' ).trim();
		return texParams;

	},

	loadTexture: function ( url, mapping, onLoad, onProgress, onError ) {

		var texture;
		var manager = ( this.manager !== undefined ) ? this.manager : THREE.DefaultLoadingManager;
		var loader = manager.getHandler( url );

		if ( loader === null ) {

			loader = new THREE.TextureLoader( manager );

		}

		if ( loader.setCrossOrigin ) loader.setCrossOrigin( this.crossOrigin );
		texture = loader.load( url, onLoad, onProgress, onError );

		if ( mapping !== undefined ) texture.mapping = mapping;

		return texture;

	}

};

/**
 * @author mrdoob / http://mrdoob.com/
 */


function ParserState() {

	var state = {
		objects: [],
		object: {},

		vertices: [],
		normals: [],
		colors: [],
		uvs: [],

		materials: {},
		materialLibraries: [],

		startObject: function ( name, fromDeclaration ) {

			// If the current object (initial from reset) is not from a g/o declaration in the parsed
			// file. We need to use it for the first parsed g/o to keep things in sync.
			if ( this.object && this.object.fromDeclaration === false ) {

				this.object.name = name;
				this.object.fromDeclaration = ( fromDeclaration !== false );
				return;

			}

			var previousMaterial = ( this.object && typeof this.object.currentMaterial === 'function' ? this.object.currentMaterial() : undefined );

			if ( this.object && typeof this.object._finalize === 'function' ) {

				this.object._finalize( true );

			}

			this.object = {
				name: name || '',
				fromDeclaration: ( fromDeclaration !== false ),

				geometry: {
					vertices: [],
					normals: [],
					colors: [],
					uvs: []
				},
				materials: [],
				smooth: true,

				startMaterial: function ( name, libraries ) {

					var previous = this._finalize( false );

					// New usemtl declaration overwrites an inherited material, except if faces were declared
					// after the material, then it must be preserved for proper MultiMaterial continuation.
					if ( previous && ( previous.inherited || previous.groupCount <= 0 ) ) {

						this.materials.splice( previous.index, 1 );

					}

					var material = {
						index: this.materials.length,
						name: name || '',
						mtllib: ( Array.isArray( libraries ) && libraries.length > 0 ? libraries[ libraries.length - 1 ] : '' ),
						smooth: ( previous !== undefined ? previous.smooth : this.smooth ),
						groupStart: ( previous !== undefined ? previous.groupEnd : 0 ),
						groupEnd: - 1,
						groupCount: - 1,
						inherited: false,

						clone: function ( index ) {

							var cloned = {
								index: ( typeof index === 'number' ? index : this.index ),
								name: this.name,
								mtllib: this.mtllib,
								smooth: this.smooth,
								groupStart: 0,
								groupEnd: - 1,
								groupCount: - 1,
								inherited: false
							};
							cloned.clone = this.clone.bind( cloned );
							return cloned;

						}
					};

					this.materials.push( material );

					return material;

				},

				currentMaterial: function () {

					if ( this.materials.length > 0 ) {

						return this.materials[ this.materials.length - 1 ];

					}

					return undefined;

				},

				_finalize: function ( end ) {

					var lastMultiMaterial = this.currentMaterial();
					if ( lastMultiMaterial && lastMultiMaterial.groupEnd === - 1 ) {

						lastMultiMaterial.groupEnd = this.geometry.vertices.length / 3;
						lastMultiMaterial.groupCount = lastMultiMaterial.groupEnd - lastMultiMaterial.groupStart;
						lastMultiMaterial.inherited = false;

					}

					// Ignore objects tail materials if no face declarations followed them before a new o/g started.
					if ( end && this.materials.length > 1 ) {

						for ( var mi = this.materials.length - 1; mi >= 0; mi -- ) {

							if ( this.materials[ mi ].groupCount <= 0 ) {

								this.materials.splice( mi, 1 );

							}

						}

					}

					// Guarantee at least one empty material, this makes the creation later more straight forward.
					if ( end && this.materials.length === 0 ) {

						this.materials.push( {
							name: '',
							smooth: this.smooth
						} );

					}

					return lastMultiMaterial;

				}
			};

			// Inherit previous objects material.
			// Spec tells us that a declared material must be set to all objects until a new material is declared.
			// If a usemtl declaration is encountered while this new object is being parsed, it will
			// overwrite the inherited material. Exception being that there was already face declarations
			// to the inherited material, then it will be preserved for proper MultiMaterial continuation.

			if ( previousMaterial && previousMaterial.name && typeof previousMaterial.clone === 'function' ) {

				var declared = previousMaterial.clone( 0 );
				declared.inherited = true;
				this.object.materials.push( declared );

			}

			this.objects.push( this.object );

		},

		finalize: function () {

			if ( this.object && typeof this.object._finalize === 'function' ) {

				this.object._finalize( true );

			}

		},

		parseVertexIndex: function ( value, len ) {

			var index = parseInt( value, 10 );
			return ( index >= 0 ? index - 1 : index + len / 3 ) * 3;

		},

		parseNormalIndex: function ( value, len ) {

			var index = parseInt( value, 10 );
			return ( index >= 0 ? index - 1 : index + len / 3 ) * 3;

		},

		parseUVIndex: function ( value, len ) {

			var index = parseInt( value, 10 );
			return ( index >= 0 ? index - 1 : index + len / 2 ) * 2;

		},

		addVertex: function ( a, b, c ) {

			var src = this.vertices;
			var dst = this.object.geometry.vertices;

			dst.push( src[ a + 0 ], src[ a + 1 ], src[ a + 2 ] );
			dst.push( src[ b + 0 ], src[ b + 1 ], src[ b + 2 ] );
			dst.push( src[ c + 0 ], src[ c + 1 ], src[ c + 2 ] );

		},

		addVertexPoint: function ( a ) {

			var src = this.vertices;
			var dst = this.object.geometry.vertices;

			dst.push( src[ a + 0 ], src[ a + 1 ], src[ a + 2 ] );

		},

		addVertexLine: function ( a ) {

			var src = this.vertices;
			var dst = this.object.geometry.vertices;

			dst.push( src[ a + 0 ], src[ a + 1 ], src[ a + 2 ] );

		},

		addNormal: function ( a, b, c ) {

			var src = this.normals;
			var dst = this.object.geometry.normals;

			dst.push( src[ a + 0 ], src[ a + 1 ], src[ a + 2 ] );
			dst.push( src[ b + 0 ], src[ b + 1 ], src[ b + 2 ] );
			dst.push( src[ c + 0 ], src[ c + 1 ], src[ c + 2 ] );

		},

		addColor: function ( a, b, c ) {

			var src = this.colors;
			var dst = this.object.geometry.colors;

			dst.push( src[ a + 0 ], src[ a + 1 ], src[ a + 2 ] );
			dst.push( src[ b + 0 ], src[ b + 1 ], src[ b + 2 ] );
			dst.push( src[ c + 0 ], src[ c + 1 ], src[ c + 2 ] );

		},

		addUV: function ( a, b, c ) {

			var src = this.uvs;
			var dst = this.object.geometry.uvs;

			dst.push( src[ a + 0 ], src[ a + 1 ] );
			dst.push( src[ b + 0 ], src[ b + 1 ] );
			dst.push( src[ c + 0 ], src[ c + 1 ] );

		},

		addUVLine: function ( a ) {

			var src = this.uvs;
			var dst = this.object.geometry.uvs;

			dst.push( src[ a + 0 ], src[ a + 1 ] );

		},

		addFace: function ( a, b, c, ua, ub, uc, na, nb, nc ) {

			var vLen = this.vertices.length;

			var ia = this.parseVertexIndex( a, vLen );
			var ib = this.parseVertexIndex( b, vLen );
			var ic = this.parseVertexIndex( c, vLen );

			this.addVertex( ia, ib, ic );

			if ( this.colors.length > 0 ) {

				this.addColor( ia, ib, ic );

			}

			if ( ua !== undefined && ua !== '' ) {

				var uvLen = this.uvs.length;
				ia = this.parseUVIndex( ua, uvLen );
				ib = this.parseUVIndex( ub, uvLen );
				ic = this.parseUVIndex( uc, uvLen );
				this.addUV( ia, ib, ic );

			}

			if ( na !== undefined && na !== '' ) {

				// Normals are many times the same. If so, skip function call and parseInt.
				var nLen = this.normals.length;
				ia = this.parseNormalIndex( na, nLen );

				ib = na === nb ? ia : this.parseNormalIndex( nb, nLen );
				ic = na === nc ? ia : this.parseNormalIndex( nc, nLen );

				this.addNormal( ia, ib, ic );

			}

		},

		addPointGeometry: function ( vertices ) {

			this.object.geometry.type = 'Points';

			var vLen = this.vertices.length;

			for ( var vi = 0, l = vertices.length; vi < l; vi ++ ) {

				this.addVertexPoint( this.parseVertexIndex( vertices[ vi ], vLen ) );

			}

		},

		addLineGeometry: function ( vertices, uvs ) {

			this.object.geometry.type = 'Line';

			var vLen = this.vertices.length;
			var uvLen = this.uvs.length;

			for ( var vi = 0, l = vertices.length; vi < l; vi ++ ) {

				this.addVertexLine( this.parseVertexIndex( vertices[ vi ], vLen ) );

			}

			for ( var uvi = 0, l = uvs.length; uvi < l; uvi ++ ) {

				this.addUVLine( this.parseUVIndex( uvs[ uvi ], uvLen ) );

			}

		}

	};

	state.startObject( '', false );

	return state;

}

//

function OBJLoader( manager ) {

	THREE.Loader.call( this, manager );

	this.materials = null;
	
	// o object_name | g group_name
	this.object_pattern = /^[og]\s*(.+)?/;
	// mtllib file_reference
	this.material_library_pattern = /^mtllib /;
	// usemtl material_name
	this.material_use_pattern = /^usemtl /;
	// usemap map_name
	this.map_use_pattern = /^usemap /;

}

OBJLoader.prototype = Object.assign( Object.create( THREE.Loader.prototype ), {

	constructor: OBJLoader,

	load: function ( url, onLoad, onProgress, onError ) {

		var scope = this;

		var loader = new THREE.FileLoader( scope.manager );
		loader.setPath( this.path );
		loader.load( url, function ( text ) {

			onLoad( scope.parse( text ) );

		}, onProgress, onError );

	},

	setMaterials: function ( materials ) {

		this.materials = materials;

		return this;

	},

	parse: function ( text ) {

		var state = new ParserState();

		if ( text.indexOf( '\r\n' ) !== - 1 ) {

			// This is faster than String.split with regex that splits on both
			text = text.replace( /\r\n/g, '\n' );

		}

		if ( text.indexOf( '\\\n' ) !== - 1 ) {

			// join lines separated by a line continuation character (\)
			text = text.replace( /\\\n/g, '' );

		}

		var lines = text.split( '\n' );
		var line = '', lineFirstChar = '';
		var lineLength = 0;
		var result = [];

		// Faster to just trim left side of the line. Use if available.
		var trimLeft = ( typeof ''.trimLeft === 'function' );

		for ( var i = 0, l = lines.length; i < l; i ++ ) {

			line = lines[ i ];

			line = trimLeft ? line.trimLeft() : line.trim();

			lineLength = line.length;

			if ( lineLength === 0 ) continue;

			lineFirstChar = line.charAt( 0 );

			// @todo invoke passed in handler if any
			if ( lineFirstChar === '#' ) continue;

			if ( lineFirstChar === 'v' ) {

				var data = line.split( /\s+/ );

				switch ( data[ 0 ] ) {

					case 'v':
						state.vertices.push(
							parseFloat( data[ 1 ] ),
							parseFloat( data[ 2 ] ),
							parseFloat( data[ 3 ] )
						);
						if ( data.length >= 7 ) {

							state.colors.push(
								parseFloat( data[ 4 ] ),
								parseFloat( data[ 5 ] ),
								parseFloat( data[ 6 ] )

							);

						}
						break;
					case 'vn':
						state.normals.push(
							parseFloat( data[ 1 ] ),
							parseFloat( data[ 2 ] ),
							parseFloat( data[ 3 ] )
						);
						break;
					case 'vt':
						state.uvs.push(
							parseFloat( data[ 1 ] ),
							parseFloat( data[ 2 ] )
						);
						break;

				}

			} else if ( lineFirstChar === 'f' ) {

				var lineData = line.substr( 1 ).trim();
				var vertexData = lineData.split( /\s+/ );
				var faceVertices = [];

				// Parse the face vertex data into an easy to work with format

				for ( var j = 0, jl = vertexData.length; j < jl; j ++ ) {

					var vertex = vertexData[ j ];

					if ( vertex.length > 0 ) {

						var vertexParts = vertex.split( '/' );
						faceVertices.push( vertexParts );

					}

				}

				// Draw an edge between the first vertex and all subsequent vertices to form an n-gon

				var v1 = faceVertices[ 0 ];

				for ( var j = 1, jl = faceVertices.length - 1; j < jl; j ++ ) {

					var v2 = faceVertices[ j ];
					var v3 = faceVertices[ j + 1 ];

					state.addFace(
						v1[ 0 ], v2[ 0 ], v3[ 0 ],
						v1[ 1 ], v2[ 1 ], v3[ 1 ],
						v1[ 2 ], v2[ 2 ], v3[ 2 ]
					);

				}

			} else if ( lineFirstChar === 'l' ) {

				var lineParts = line.substring( 1 ).trim().split( " " );
				var lineVertices = [], lineUVs = [];

				if ( line.indexOf( "/" ) === - 1 ) {

					lineVertices = lineParts;

				} else {

					for ( var li = 0, llen = lineParts.length; li < llen; li ++ ) {

						var parts = lineParts[ li ].split( "/" );

						if ( parts[ 0 ] !== "" ) lineVertices.push( parts[ 0 ] );
						if ( parts[ 1 ] !== "" ) lineUVs.push( parts[ 1 ] );

					}

				}
				state.addLineGeometry( lineVertices, lineUVs );

			} else if ( lineFirstChar === 'p' ) {

				var lineData = line.substr( 1 ).trim();
				var pointData = lineData.split( " " );

				state.addPointGeometry( pointData );

			} else if ( ( result = this.object_pattern.exec( line ) ) !== null ) {

				// o object_name
				// or
				// g group_name

				// WORKAROUND: https://bugs.chromium.org/p/v8/issues/detail?id=2869
				// var name = result[ 0 ].substr( 1 ).trim();
				var name = ( " " + result[ 0 ].substr( 1 ).trim() ).substr( 1 );

				state.startObject( name );

			} else if ( this.material_use_pattern.test( line ) ) {

				// material

				state.object.startMaterial( line.substring( 7 ).trim(), state.materialLibraries );

			} else if ( this.material_library_pattern.test( line ) ) {

				// mtl file

				state.materialLibraries.push( line.substring( 7 ).trim() );

			} else if ( this.map_use_pattern.test( line ) ) {

				// the line is parsed but ignored since the loader assumes textures are defined MTL files
				// (according to https://www.okino.com/conv/imp_wave.htm, 'usemap' is the old-style Wavefront texture reference method)

				console.warn( 'OBJLoader: Rendering identifier "usemap" not supported. Textures must be defined in MTL files.' );

			} else if ( lineFirstChar === 's' ) {

				result = line.split( ' ' );

				// smooth shading

				// @todo Handle files that have varying smooth values for a set of faces inside one geometry,
				// but does not define a usemtl for each face set.
				// This should be detected and a dummy material created (later MultiMaterial and geometry groups).
				// This requires some care to not create extra material on each smooth value for "normal" obj files.
				// where explicit usemtl defines geometry groups.
				// Example asset: examples/models/obj/cerberus/Cerberus.obj

				/*
				 * http://paulbourke.net/dataformats/obj/
				 * or
				 * http://www.cs.utah.edu/~boulos/cs3505/obj_spec.pdf
				 *
				 * From chapter "Grouping" Syntax explanation "s group_number":
				 * "group_number is the smoothing group number. To turn off smoothing groups, use a value of 0 or off.
				 * Polygonal elements use group numbers to put elements in different smoothing groups. For free-form
				 * surfaces, smoothing groups are either turned on or off; there is no difference between values greater
				 * than 0."
				 */
				if ( result.length > 1 ) {

					var value = result[ 1 ].trim().toLowerCase();
					state.object.smooth = ( value !== '0' && value !== 'off' );

				} else {

					// ZBrush can produce "s" lines #11707
					state.object.smooth = true;

				}
				var material = state.object.currentMaterial();
				if ( material ) material.smooth = state.object.smooth;

			} else {

				// Handle null terminated files without exception
				if ( line === '\0' ) continue;

				console.warn( 'OBJLoader: Unexpected line: "' + line + '"' );

			}

		}

		state.finalize();

		var container = new THREE.Group();
		container.materialLibraries = [].concat( state.materialLibraries );

		for ( var i = 0, l = state.objects.length; i < l; i ++ ) {

			var object = state.objects[ i ];
			var geometry = object.geometry;
			var materials = object.materials;
			var isLine = ( geometry.type === 'Line' );
			var isPoints = ( geometry.type === 'Points' );
			var hasVertexColors = false;

			// Skip o/g line declarations that did not follow with any faces
			if ( geometry.vertices.length === 0 ) continue;

			var buffergeometry = new THREE.BufferGeometry();

			buffergeometry.setAttribute( 'position', new THREE.Float32BufferAttribute( geometry.vertices, 3 ) );

			if ( geometry.normals.length > 0 ) {

				buffergeometry.setAttribute( 'normal', new THREE.Float32BufferAttribute( geometry.normals, 3 ) );

			} else {

				buffergeometry.computeVertexNormals();

			}

			if ( geometry.colors.length > 0 ) {

				hasVertexColors = true;
				buffergeometry.setAttribute( 'color', new THREE.Float32BufferAttribute( geometry.colors, 3 ) );

			}

			if ( geometry.uvs.length > 0 ) {

				buffergeometry.setAttribute( 'uv', new THREE.Float32BufferAttribute( geometry.uvs, 2 ) );

			}

			// Create materials

			var createdMaterials = [];

			for ( var mi = 0, miLen = materials.length; mi < miLen; mi ++ ) {

				var sourceMaterial = materials[ mi ];
				var materialHash = sourceMaterial.name + '_' + sourceMaterial.smooth + '_' + hasVertexColors;
				var material = state.materials[ materialHash ];

				if ( this.materials !== null ) {

					material = this.materials.create( sourceMaterial.name );

					// mtl etc. loaders probably can't create line materials correctly, copy properties to a line material.
					if ( isLine && material && ! ( material instanceof THREE.LineBasicMaterial ) ) {

						var materialLine = new THREE.LineBasicMaterial();
						THREE.Material.prototype.copy.call( materialLine, material );
						materialLine.color.copy( material.color );
						material = materialLine;

					} else if ( isPoints && material && ! ( material instanceof THREE.PointsMaterial ) ) {

						var materialPoints = new THREE.PointsMaterial( { size: 10, sizeAttenuation: false } );
						THREE.Material.prototype.copy.call( materialPoints, material );
						materialPoints.color.copy( material.color );
						materialPoints.map = material.map;
						material = materialPoints;

					}

				}

				if ( material === undefined ) {

					if ( isLine ) {

						material = new THREE.LineBasicMaterial();

					} else if ( isPoints ) {

						material = new THREE.PointsMaterial( { size: 1, sizeAttenuation: false } );

					} else {

						material = new THREE.MeshPhongMaterial();

					}

					material.name = sourceMaterial.name;
					material.flatShading = sourceMaterial.smooth ? false : true;
					material.vertexColors = hasVertexColors;

					state.materials[ materialHash ] = material;

				}

				createdMaterials.push( material );

			}

			// Create mesh

			var mesh;

			if ( createdMaterials.length > 1 ) {

				for ( var mi = 0, miLen = materials.length; mi < miLen; mi ++ ) {

					var sourceMaterial = materials[ mi ];
					buffergeometry.addGroup( sourceMaterial.groupStart, sourceMaterial.groupCount, mi );

				}

				if ( isLine ) {

					mesh = new THREE.LineSegments( buffergeometry, createdMaterials );

				} else if ( isPoints ) {

					mesh = new THREE.Points( buffergeometry, createdMaterials );

				} else {

					mesh = new THREE.Mesh( buffergeometry, createdMaterials );

				}

			} else {

				if ( isLine ) {

					mesh = new THREE.LineSegments( buffergeometry, createdMaterials[ 0 ] );

				} else if ( isPoints ) {

					mesh = new THREE.Points( buffergeometry, createdMaterials[ 0 ] );

				} else {

					mesh = new THREE.Mesh( buffergeometry, createdMaterials[ 0 ] );

				}

			}

			mesh.name = object.name;

			container.add( mesh );

		}

		return container;

	}

} );

function AssetLoader() {
}

Object.assign(AssetLoader.prototype, {
	
	load : function(data, window, callback, scope) {
		
		this.dispose(window);
		this.data = data;
		
		this.models = {
			'box' : new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ 
				        color: 16711680, 
				        wireframe: false 
		    		}))
		};
		
		var validAssets = [];
		
		for (var assetName in data) {
			
			if (data[assetName]['modelUrl'] !== undefined) {
				validAssets.push(assetName);
			}
		}
		
		var maxNumOfAsset = Object.keys(this.models).length + validAssets.length, this_ = this;
		
		validAssets.forEach(function(assetName) {
			this.loadModel(assetName, data, maxNumOfAsset, callback, scope);
		}, this);
	},
	
	loadModel : function(assetName, data, maxNumOfAsset, callback, scope) {
		
		var mtlLoader = new MTLLoader(), this_ = this;
		
		mtlLoader.load(data[assetName]['materialUrl'], function(materials) {

			materials.preload();

			var objLoader = new OBJLoader();
			objLoader.setMaterials(materials);

			objLoader.load(data[assetName]['modelUrl'], function (obj) {
				
				this_.models[assetName] = obj;
				
				if (Object.keys(this_.models).length === maxNumOfAsset && callback !== null && callback !== undefined) {
					callback.call(scope);
				}
			});
		});
	},
	getObject3D : function(name, scale) {
		// Check if the model for the given name exists before trying to clone it
		if (!this.models[name]) {
			console.error('Model not found:', name);
			// Handle the missing model case as appropriate, possibly returning `null` or a placeholder object
			return null;
		}

		try {
			// Proceed with cloning and scaling the model since it exists
			var model = this.models[name].clone();
			if (scale) { // Ensure scale is provided to avoid potential errors
				model.scale.copy(scale);
			} else {
				console.warn('Scale is undefined for model:', name);
				// Apply a default scale if necessary
				model.scale.set(1, 1, 1); // Example default scale, adjust as needed
			}
			return model;
		} catch (error) {
			console.error('Error cloning or scaling model:', name, error);
			// Handle the cloning or scaling error as appropriate
			return null;
		}
	},

	// getObject3D : function(name, scale) {
	//
	// 	var model = this.models[name].clone();
	// 	model.scale.copy(scale);
	//
	// 	return model;
	// },
	
	getScale : function(properties, size, object3d, autoScale) {
		
		var scale = properties.scale === undefined || properties.scale === null ? new THREE.Vector3(1, 1, 1) : new THREE.Vector3(properties.scale.x, properties.scale.z, properties.scale.y);
	
		if (autoScale && properties.assetType !== 'box') {
			
			var boundingBox = new THREE.Box3();
			boundingBox.setFromObject(object3d);
			
			var sizeX = boundingBox.max.z - boundingBox.min.z;
			var factor = properties.size.x / sizeX;
			
			PropertyModifier.originalSize[properties.assetType] = sizeX;
			
			scale.set(factor, factor, factor);
		}
		
		PropertyModifier.scaleFactors[properties.assetType] = PropertyModifier.scaleFactors[properties.assetType] === undefined ? factor : PropertyModifier.scaleFactors[properties.assetType];
		
		return new THREE.Vector3(scale.x, scale.z, scale.y);
	},
	
	dispose : function(window) {
		
		for (var assetName in this.data) {
			
			var model = this.models[assetName];
			
			if (model !== undefined && model.geometry !== undefined) {
				model.geometry.dispose();
			}
			
			delete this.models[assetName];
			
			if (this.data !== undefined) {
				
				window.URL.revokeObjectURL(this.data[assetName]['modelUrl']);
				window.URL.revokeObjectURL(this.data[assetName]['materialUrl']);
				if(this.data[assetName]['textureUrls'] && Array.isArray(this.data[assetName]['textureUrls'])){
					for (var i = 0; i < this.data[assetName]['textureUrls'].length; i++) {
						window.URL.revokeObjectURL(this.data[assetName]['textureUrls'][i]);
					}
				}
			}
		}
	}
});

function OrbitControls(object, domElement) {

	if ( domElement === undefined ) console.warn( 'THREE.OrbitControls: The second parameter "domElement" is now mandatory.' );
	if ( domElement === document ) console.error( 'THREE.OrbitControls: "document" should not be used as the target "domElement". Please use "renderer.domElement" instead.' );

	this.object = object;
	this.domElement = domElement;

	// Set to false to disable this control
	this.enabled = true;

	// "target" sets the location of focus, where the object orbits around
	this.target = new THREE.Vector3();

	// How far you can dolly in and out ( PerspectiveCamera only )
	this.minDistance = 0;
	this.maxDistance = Infinity;

	// How far you can zoom in and out ( OrthographicCamera only )
	this.minZoom = 0;
	this.maxZoom = Infinity;

	// How far you can orbit vertically, upper and lower limits.
	// Range is 0 to Math.PI radians.
	this.minPolarAngle = 0; // radians
	this.maxPolarAngle = Math.PI; // radians

	// How far you can orbit horizontally, upper and lower limits.
	// If set, must be a sub-interval of the interval [ - Math.PI, Math.PI ].
	this.minAzimuthAngle = - Infinity; // radians
	this.maxAzimuthAngle = Infinity; // radians

	// Set to true to enable damping (inertia)
	// If damping is enabled, you must call controls.update() in your animation loop
	this.enableDamping = false;
	this.dampingFactor = 0.05;

	// This option actually enables dollying in and out; left as "zoom" for backwards compatibility.
	// Set to false to disable zooming
	this.enableZoom = true;
	this.zoomSpeed = 1.0;

	// Set to false to disable rotating
	this.enableRotate = true;
	this.rotateSpeed = 1.0;

	// Set to false to disable panning
	this.enablePan = true;
	this.panSpeed = 1.0;
	this.screenSpacePanning = false; // if true, pan in screen-space
	this.keyPanSpeed = 7.0;	// pixels moved per arrow key push

	// Set to true to automatically rotate around the target
	// If auto-rotate is enabled, you must call controls.update() in your animation loop
	this.autoRotate = false;
	this.autoRotateSpeed = 2.0; // 30 seconds per round when fps is 60

	// Set to false to disable use of the keys
	this.enableKeys = true;

	// The four arrow keys
	this.keys = { LEFT: 37, UP: 38, RIGHT: 39, BOTTOM: 40 };

	// Mouse buttons
	this.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };

	// Touch fingers
	this.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

	// for reset
	this.target0 = this.target.clone();
	this.position0 = this.object.position.clone();
	this.zoom0 = this.object.zoom;

	//
	// public methods
	//

	this.getPolarAngle = function () {

		return spherical.phi;

	};

	this.getAzimuthalAngle = function () {

		return spherical.theta;

	};

	this.saveState = function () {

		scope.target0.copy( scope.target );
		scope.position0.copy( scope.object.position );
		scope.zoom0 = scope.object.zoom;

	};

	this.reset = function () {

		scope.target.copy( scope.target0 );
		scope.object.position.copy( scope.position0 );
		scope.object.zoom = scope.zoom0;

		scope.object.updateProjectionMatrix();
		scope.dispatchEvent( changeEvent );

		scope.update();

		state = STATE.NONE;

	};

	// this method is exposed, but perhaps it would be better if we can make it private...
	this.update = function () {

		var offset = new THREE.Vector3();

		// so camera.up is the orbit axis
		var quat = new THREE.Quaternion().setFromUnitVectors( object.up, new THREE.Vector3( 0, 1, 0 ) );
		var quatInverse = quat.clone().inverse();

		var lastPosition = new THREE.Vector3();
		var lastQuaternion = new THREE.Quaternion();

		return function update() {

			var position = scope.object.position;

			offset.copy( position ).sub( scope.target );

			// rotate offset to "y-axis-is-up" space
			offset.applyQuaternion( quat );

			// angle from z-axis around y-axis
			spherical.setFromVector3( offset );

			if ( scope.autoRotate && state === STATE.NONE ) {

				rotateLeft( getAutoRotationAngle() );

			}

			if ( scope.enableDamping ) {

				spherical.theta += sphericalDelta.theta * scope.dampingFactor;
				spherical.phi += sphericalDelta.phi * scope.dampingFactor;

			} else {

				spherical.theta += sphericalDelta.theta;
				spherical.phi += sphericalDelta.phi;

			}

			// restrict theta to be between desired limits
			spherical.theta = Math.max( scope.minAzimuthAngle, Math.min( scope.maxAzimuthAngle, spherical.theta ) );

			// restrict phi to be between desired limits
			spherical.phi = Math.max( scope.minPolarAngle, Math.min( scope.maxPolarAngle, spherical.phi ) );

			spherical.makeSafe();


			spherical.radius *= scale;

			// restrict radius to be between desired limits
			spherical.radius = Math.max( scope.minDistance, Math.min( scope.maxDistance, spherical.radius ) );

			// move target to panned location

			if ( scope.enableDamping === true ) {

				scope.target.addScaledVector( panOffset, scope.dampingFactor );

			} else {

				scope.target.add( panOffset );

			}

			offset.setFromSpherical( spherical );

			// rotate offset back to "camera-up-vector-is-up" space
			offset.applyQuaternion( quatInverse );

			position.copy( scope.target ).add( offset );

			scope.object.lookAt( scope.target );

			if ( scope.enableDamping === true ) {

				sphericalDelta.theta *= ( 1 - scope.dampingFactor );
				sphericalDelta.phi *= ( 1 - scope.dampingFactor );

				panOffset.multiplyScalar( 1 - scope.dampingFactor );

			} else {

				sphericalDelta.set( 0, 0, 0 );

				panOffset.set( 0, 0, 0 );

			}

			scale = 1;

			// update condition is:
			// min(camera displacement, camera rotation in radians)^2 > EPS
			// using small-angle approximation cos(x/2) = 1 - x^2 / 8

			if ( zoomChanged ||
				lastPosition.distanceToSquared( scope.object.position ) > EPS ||
				8 * ( 1 - lastQuaternion.dot( scope.object.quaternion ) ) > EPS ) {

				scope.dispatchEvent( changeEvent );

				lastPosition.copy( scope.object.position );
				lastQuaternion.copy( scope.object.quaternion );
				zoomChanged = false;

				return true;

			}

			return false;

		};

	}();

	this.dispose = function () {

		scope.domElement.removeEventListener( 'contextmenu', onContextMenu, false );
		scope.domElement.removeEventListener( 'mousedown', onMouseDown, false );
		scope.domElement.removeEventListener( 'wheel', onMouseWheel, false );

		scope.domElement.removeEventListener( 'touchstart', onTouchStart, false );
		scope.domElement.removeEventListener( 'touchend', onTouchEnd, false );
		scope.domElement.removeEventListener( 'touchmove', onTouchMove, false );

		document.removeEventListener( 'mousemove', onMouseMove, false );
		document.removeEventListener( 'mouseup', onMouseUp, false );

		scope.domElement.removeEventListener( 'keydown', onKeyDown, false );

		//scope.dispatchEvent( { type: 'dispose' } ); // should this be added here?

	};

	//
	// internals
	//

	var scope = this;

	var changeEvent = { type: 'change' };
	var startEvent = { type: 'start' };
	var endEvent = { type: 'end' };

	var STATE = {
		NONE: - 1,
		ROTATE: 0,
		DOLLY: 1,
		PAN: 2,
		TOUCH_ROTATE: 3,
		TOUCH_PAN: 4,
		TOUCH_DOLLY_PAN: 5,
		TOUCH_DOLLY_ROTATE: 6
	};

	var state = STATE.NONE;

	var EPS = 0.000001;

	// current position in spherical coordinates
	var spherical = new THREE.Spherical();
	var sphericalDelta = new THREE.Spherical();

	var scale = 1;
	var panOffset = new THREE.Vector3();
	var zoomChanged = false;

	var rotateStart = new THREE.Vector2();
	var rotateEnd = new THREE.Vector2();
	var rotateDelta = new THREE.Vector2();

	var panStart = new THREE.Vector2();
	var panEnd = new THREE.Vector2();
	var panDelta = new THREE.Vector2();

	var dollyStart = new THREE.Vector2();
	var dollyEnd = new THREE.Vector2();
	var dollyDelta = new THREE.Vector2();

	function getAutoRotationAngle() {

		return 2 * Math.PI / 60 / 60 * scope.autoRotateSpeed;

	}

	function getZoomScale() {

		return Math.pow( 0.95, scope.zoomSpeed );

	}

	function rotateLeft( angle ) {

		sphericalDelta.theta -= angle;

	}

	function rotateUp( angle ) {

		sphericalDelta.phi -= angle;

	}

	var panLeft = function () {

		var v = new THREE.Vector3();

		return function panLeft( distance, objectMatrix ) {

			v.setFromMatrixColumn( objectMatrix, 0 ); // get X column of objectMatrix
			v.multiplyScalar( - distance );

			panOffset.add( v );

		};

	}();

	var panUp = function () {

		var v = new THREE.Vector3();

		return function panUp( distance, objectMatrix ) {

			if ( scope.screenSpacePanning === true ) {

				v.setFromMatrixColumn( objectMatrix, 1 );

			} else {

				v.setFromMatrixColumn( objectMatrix, 0 );
				v.crossVectors( scope.object.up, v );

			}

			v.multiplyScalar( distance );

			panOffset.add( v );

		};

	}();

	// deltaX and deltaY are in pixels; right and down are positive
	var pan = function () {

		var offset = new THREE.Vector3();

		return function pan( deltaX, deltaY ) {

			var element = scope.domElement;

			if ( scope.object.isPerspectiveCamera ) {

				// perspective
				var position = scope.object.position;
				offset.copy( position ).sub( scope.target );
				var targetDistance = offset.length();

				// half of the fov is center to top of screen
				targetDistance *= Math.tan( ( scope.object.fov / 2 ) * Math.PI / 180.0 );

				// we use only clientHeight here so aspect ratio does not distort speed
				panLeft( 2 * deltaX * targetDistance / element.clientHeight, scope.object.matrix );
				panUp( 2 * deltaY * targetDistance / element.clientHeight, scope.object.matrix );

			} else if ( scope.object.isOrthographicCamera ) {

				// orthographic
				panLeft( deltaX * ( scope.object.right - scope.object.left ) / scope.object.zoom / element.clientWidth, scope.object.matrix );
				panUp( deltaY * ( scope.object.top - scope.object.bottom ) / scope.object.zoom / element.clientHeight, scope.object.matrix );

			} else {

				// camera neither orthographic nor perspective
				console.warn( 'WARNING: OrbitControls.js encountered an unknown camera type - pan disabled.' );
				scope.enablePan = false;

			}

		};

	}();

	function dollyOut( dollyScale ) {

		if ( scope.object.isPerspectiveCamera ) {

			scale /= dollyScale;

		} else if ( scope.object.isOrthographicCamera ) {

			scope.object.zoom = Math.max( scope.minZoom, Math.min( scope.maxZoom, scope.object.zoom * dollyScale ) );
			scope.object.updateProjectionMatrix();
			zoomChanged = true;

		} else {

			console.warn( 'WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.' );
			scope.enableZoom = false;

		}

	}

	function dollyIn( dollyScale ) {

		if ( scope.object.isPerspectiveCamera ) {

			scale *= dollyScale;

		} else if ( scope.object.isOrthographicCamera ) {

			scope.object.zoom = Math.max( scope.minZoom, Math.min( scope.maxZoom, scope.object.zoom / dollyScale ) );
			scope.object.updateProjectionMatrix();
			zoomChanged = true;

		} else {

			console.warn( 'WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.' );
			scope.enableZoom = false;

		}

	}

	//
	// event callbacks - update the object state
	//

	function handleMouseDownRotate( event ) {

		rotateStart.set( event.clientX, event.clientY );

	}

	function handleMouseDownDolly( event ) {

		dollyStart.set( event.clientX, event.clientY );

	}

	function handleMouseDownPan( event ) {

		panStart.set( event.clientX, event.clientY );

	}

	function handleMouseMoveRotate( event ) {

		rotateEnd.set( event.clientX, event.clientY );

		rotateDelta.subVectors( rotateEnd, rotateStart ).multiplyScalar( scope.rotateSpeed );

		var element = scope.domElement;

		rotateLeft( 2 * Math.PI * rotateDelta.x / element.clientHeight ); // yes, height

		rotateUp( 2 * Math.PI * rotateDelta.y / element.clientHeight );

		rotateStart.copy( rotateEnd );

		scope.update();

	}

	function handleMouseMoveDolly( event ) {

		dollyEnd.set( event.clientX, event.clientY );

		dollyDelta.subVectors( dollyEnd, dollyStart );

		if ( dollyDelta.y > 0 ) {

			dollyOut( getZoomScale() );

		} else if ( dollyDelta.y < 0 ) {

			dollyIn( getZoomScale() );

		}

		dollyStart.copy( dollyEnd );

		scope.update();

	}

	function handleMouseMovePan( event ) {

		panEnd.set( event.clientX, event.clientY );

		panDelta.subVectors( panEnd, panStart ).multiplyScalar( scope.panSpeed );

		pan( panDelta.x, panDelta.y );

		panStart.copy( panEnd );

		scope.update();

	}

	function handleMouseUp( /*event*/ ) {

		// no-op

	}

	function handleMouseWheel( event ) {

		if ( event.deltaY < 0 ) {

			dollyIn( getZoomScale() );

		} else if ( event.deltaY > 0 ) {

			dollyOut( getZoomScale() );

		}

		scope.update();

	}

	function handleKeyDown( event ) {

		var needsUpdate = false;

		switch ( event.keyCode ) {

			case scope.keys.UP:
				pan( 0, scope.keyPanSpeed );
				needsUpdate = true;
				break;

			case scope.keys.BOTTOM:
				pan( 0, - scope.keyPanSpeed );
				needsUpdate = true;
				break;

			case scope.keys.LEFT:
				pan( scope.keyPanSpeed, 0 );
				needsUpdate = true;
				break;

			case scope.keys.RIGHT:
				pan( - scope.keyPanSpeed, 0 );
				needsUpdate = true;
				break;

		}

		if ( needsUpdate ) {

			// prevent the browser from scrolling on cursor keys
			event.preventDefault();

			scope.update();

		}


	}

	function handleTouchStartRotate( event ) {

		if ( event.touches.length == 1 ) {

			rotateStart.set( event.touches[ 0 ].pageX, event.touches[ 0 ].pageY );

		} else {

			var x = 0.5 * ( event.touches[ 0 ].pageX + event.touches[ 1 ].pageX );
			var y = 0.5 * ( event.touches[ 0 ].pageY + event.touches[ 1 ].pageY );

			rotateStart.set( x, y );

		}

	}

	function handleTouchStartPan( event ) {

		if ( event.touches.length == 1 ) {

			panStart.set( event.touches[ 0 ].pageX, event.touches[ 0 ].pageY );

		} else {

			var x = 0.5 * ( event.touches[ 0 ].pageX + event.touches[ 1 ].pageX );
			var y = 0.5 * ( event.touches[ 0 ].pageY + event.touches[ 1 ].pageY );

			panStart.set( x, y );

		}

	}

	function handleTouchStartDolly( event ) {

		var dx = event.touches[ 0 ].pageX - event.touches[ 1 ].pageX;
		var dy = event.touches[ 0 ].pageY - event.touches[ 1 ].pageY;

		var distance = Math.sqrt( dx * dx + dy * dy );

		dollyStart.set( 0, distance );

	}

	function handleTouchStartDollyPan( event ) {

		if ( scope.enableZoom ) handleTouchStartDolly( event );

		if ( scope.enablePan ) handleTouchStartPan( event );

	}

	function handleTouchStartDollyRotate( event ) {

		if ( scope.enableZoom ) handleTouchStartDolly( event );

		if ( scope.enableRotate ) handleTouchStartRotate( event );

	}

	function handleTouchMoveRotate( event ) {

		if ( event.touches.length == 1 ) {

			rotateEnd.set( event.touches[ 0 ].pageX, event.touches[ 0 ].pageY );

		} else {

			var x = 0.5 * ( event.touches[ 0 ].pageX + event.touches[ 1 ].pageX );
			var y = 0.5 * ( event.touches[ 0 ].pageY + event.touches[ 1 ].pageY );

			rotateEnd.set( x, y );

		}

		rotateDelta.subVectors( rotateEnd, rotateStart ).multiplyScalar( scope.rotateSpeed );

		var element = scope.domElement;

		rotateLeft( 2 * Math.PI * rotateDelta.x / element.clientHeight ); // yes, height

		rotateUp( 2 * Math.PI * rotateDelta.y / element.clientHeight );

		rotateStart.copy( rotateEnd );

	}

	function handleTouchMovePan( event ) {

		if ( event.touches.length == 1 ) {

			panEnd.set( event.touches[ 0 ].pageX, event.touches[ 0 ].pageY );

		} else {

			var x = 0.5 * ( event.touches[ 0 ].pageX + event.touches[ 1 ].pageX );
			var y = 0.5 * ( event.touches[ 0 ].pageY + event.touches[ 1 ].pageY );

			panEnd.set( x, y );

		}

		panDelta.subVectors( panEnd, panStart ).multiplyScalar( scope.panSpeed );

		pan( panDelta.x, panDelta.y );

		panStart.copy( panEnd );

	}

	function handleTouchMoveDolly( event ) {

		var dx = event.touches[ 0 ].pageX - event.touches[ 1 ].pageX;
		var dy = event.touches[ 0 ].pageY - event.touches[ 1 ].pageY;

		var distance = Math.sqrt( dx * dx + dy * dy );

		dollyEnd.set( 0, distance );

		dollyDelta.set( 0, Math.pow( dollyEnd.y / dollyStart.y, scope.zoomSpeed ) );

		dollyOut( dollyDelta.y );

		dollyStart.copy( dollyEnd );

	}

	function handleTouchMoveDollyPan( event ) {

		if ( scope.enableZoom ) handleTouchMoveDolly( event );

		if ( scope.enablePan ) handleTouchMovePan( event );

	}

	function handleTouchMoveDollyRotate( event ) {

		if ( scope.enableZoom ) handleTouchMoveDolly( event );

		if ( scope.enableRotate ) handleTouchMoveRotate( event );

	}

	function handleTouchEnd( /*event*/ ) {

		// no-op

	}

	//
	// event handlers - FSM: listen for events and reset state
	//

	function onMouseDown( event ) {

		if ( scope.enabled === false ) return;

		// Prevent the browser from scrolling.
		event.preventDefault();

		// Manually set the focus since calling preventDefault above
		// prevents the browser from setting it automatically.

		scope.domElement.focus ? scope.domElement.focus() : window.focus();

		var mouseAction;

		switch ( event.button ) {

			case 0:

				mouseAction = scope.mouseButtons.LEFT;
				break;

			case 1:

				mouseAction = scope.mouseButtons.MIDDLE;
				break;

			case 2:

				mouseAction = scope.mouseButtons.RIGHT;
				break;

			default:

				mouseAction = - 1;

		}

		switch ( mouseAction ) {

			case THREE.MOUSE.DOLLY:

				if ( scope.enableZoom === false ) return;

				handleMouseDownDolly( event );

				state = STATE.DOLLY;

				break;

			case THREE.MOUSE.ROTATE:

				if ( event.ctrlKey || event.metaKey || event.shiftKey ) {

					if ( scope.enablePan === false ) return;

					handleMouseDownPan( event );

					state = STATE.PAN;

				} else {

					if ( scope.enableRotate === false ) return;

					handleMouseDownRotate( event );

					state = STATE.ROTATE;

				}

				break;

			case THREE.MOUSE.PAN:

				if ( event.ctrlKey || event.metaKey || event.shiftKey ) {

					if ( scope.enableRotate === false ) return;

					handleMouseDownRotate( event );

					state = STATE.ROTATE;

				} else {

					if ( scope.enablePan === false ) return;

					handleMouseDownPan( event );

					state = STATE.PAN;

				}

				break;

			default:

				state = STATE.NONE;

		}

		if ( state !== STATE.NONE ) {

			document.addEventListener( 'mousemove', onMouseMove, false );
			document.addEventListener( 'mouseup', onMouseUp, false );

			scope.dispatchEvent( startEvent );

		}

	}

	function onMouseMove( event ) {

		if ( scope.enabled === false ) return;

		event.preventDefault();

		switch ( state ) {

			case STATE.ROTATE:

				if ( scope.enableRotate === false ) return;

				handleMouseMoveRotate( event );

				break;

			case STATE.DOLLY:

				if ( scope.enableZoom === false ) return;

				handleMouseMoveDolly( event );

				break;

			case STATE.PAN:

				if ( scope.enablePan === false ) return;

				handleMouseMovePan( event );

				break;

		}

	}

	function onMouseUp( event ) {

		if ( scope.enabled === false ) return;

		handleMouseUp( event );

		document.removeEventListener( 'mousemove', onMouseMove, false );
		document.removeEventListener( 'mouseup', onMouseUp, false );

		scope.dispatchEvent( endEvent );

		state = STATE.NONE;

	}

	function onMouseWheel( event ) {

		if ( scope.enabled === false || scope.enableZoom === false || ( state !== STATE.NONE && state !== STATE.ROTATE ) ) return;

		event.preventDefault();
		event.stopPropagation();

		scope.dispatchEvent( startEvent );

		handleMouseWheel( event );

		scope.dispatchEvent( endEvent );

	}

	function onKeyDown( event ) {

		if ( scope.enabled === false || scope.enableKeys === false || scope.enablePan === false ) return;

		handleKeyDown( event );

	}

	function onTouchStart( event ) {

		if ( scope.enabled === false ) return;

		event.preventDefault(); // prevent scrolling

		switch ( event.touches.length ) {

			case 1:

				switch ( scope.touches.ONE ) {

					case THREE.TOUCH.ROTATE:

						if ( scope.enableRotate === false ) return;

						handleTouchStartRotate( event );

						state = STATE.TOUCH_ROTATE;

						break;

					case THREE.TOUCH.PAN:

						if ( scope.enablePan === false ) return;

						handleTouchStartPan( event );

						state = STATE.TOUCH_PAN;

						break;

					default:

						state = STATE.NONE;

				}

				break;

			case 2:

				switch ( scope.touches.TWO ) {

					case THREE.TOUCH.DOLLY_PAN:

						if ( scope.enableZoom === false && scope.enablePan === false ) return;

						handleTouchStartDollyPan( event );

						state = STATE.TOUCH_DOLLY_PAN;

						break;

					case THREE.TOUCH.DOLLY_ROTATE:

						if ( scope.enableZoom === false && scope.enableRotate === false ) return;

						handleTouchStartDollyRotate( event );

						state = STATE.TOUCH_DOLLY_ROTATE;

						break;

					default:

						state = STATE.NONE;

				}

				break;

			default:

				state = STATE.NONE;

		}

		if ( state !== STATE.NONE ) {

			scope.dispatchEvent( startEvent );

		}

	}

	function onTouchMove( event ) {

		if ( scope.enabled === false ) return;

		event.preventDefault(); // prevent scrolling
		event.stopPropagation();

		switch ( state ) {

			case STATE.TOUCH_ROTATE:

				if ( scope.enableRotate === false ) return;

				handleTouchMoveRotate( event );

				scope.update();

				break;

			case STATE.TOUCH_PAN:

				if ( scope.enablePan === false ) return;

				handleTouchMovePan( event );

				scope.update();

				break;

			case STATE.TOUCH_DOLLY_PAN:

				if ( scope.enableZoom === false && scope.enablePan === false ) return;

				handleTouchMoveDollyPan( event );

				scope.update();

				break;

			case STATE.TOUCH_DOLLY_ROTATE:

				if ( scope.enableZoom === false && scope.enableRotate === false ) return;

				handleTouchMoveDollyRotate( event );

				scope.update();

				break;

			default:

				state = STATE.NONE;

		}

	}

	function onTouchEnd( event ) {

		if ( scope.enabled === false ) return;

		handleTouchEnd( event );

		scope.dispatchEvent( endEvent );

		state = STATE.NONE;

	}

	function onContextMenu( event ) {

		if ( scope.enabled === false ) return;

		event.preventDefault();

	}

	//

	scope.domElement.addEventListener( 'contextmenu', onContextMenu, false );

	scope.domElement.addEventListener( 'mousedown', onMouseDown, false );
	scope.domElement.addEventListener( 'wheel', onMouseWheel, false );

	scope.domElement.addEventListener( 'touchstart', onTouchStart, false );
	scope.domElement.addEventListener( 'touchend', onTouchEnd, false );
	scope.domElement.addEventListener( 'touchmove', onTouchMove, false );

	scope.domElement.addEventListener( 'keydown', onKeyDown, false );

	// make sure element can receive keys.

	if ( scope.domElement.tabIndex === - 1 ) {

		scope.domElement.tabIndex = 0;

	}

	// force an update at start

	this.update();

}

OrbitControls.prototype = Object.create(THREE.EventDispatcher.prototype);
OrbitControls.prototype.constructor = OrbitControls;

function CameraControls(object, domElement, intersectables, renderer, scene, selectionDomElement) {
	
	OrbitControls.call(this, object, domElement);
	this.renderer = renderer;
	this.planes = intersectables;
	this.domElement = domElement;
	this.scene = scene;
	this.selectionDomElement = selectionDomElement;
	
	var this_ = this;
	
	this.domElement.addEventListener('dblclick', function(event) { this_.onDoubleClick.apply(this_, [event]); }, false);
	radio('zoomToMouse').subscribe([this.zoomToMouse, this]);
	radio('zoomToPoint').subscribe([this.zoomToPoint, this]);
}

CameraControls.prototype = Object.create(OrbitControls.prototype);
CameraControls.prototype.constructor = CameraControls;

Object.assign(CameraControls.prototype, THREE.EventDispatcher.prototype, {
	
	doubleClickEnabled : true,
	zoomToCenter : true,
	lockZoom : false,
	selectionEnabled : false,
	selecting : false,
	
	zoomToPoint : function(point, distance) {
		
		var fov = this.object.fov * Math.PI / 180 / 2;
		var cot = Math.cos(fov) / Math.sin(fov);
		var offset = distance === undefined ? 50 * Math.sqrt(1 + Math.pow(cot, 2)) : distance * Math.sqrt(1 + Math.pow(cot, 2));
		var position = point.clone().sub(new THREE.Vector3(-offset, -offset, -offset));
		var this_ = this;
		
		TweenLite.to(this.object.position, 0.5, { x : position.x, y : position.y, z : position.z, onUpdate : function() {
			
			this_.object.lookAt(point);
			
		}, onComplete: function() {
			
			this_.target.copy(point);
			this_.update();
		}});
	},
	
	zoomToMouse : function(event) {
		
		if (this.lockZoom) {
			return;
		}
		
		var mouseCoords = CoordsHelper.getMouseCoords(event, this.domElement), intersectables = IntersectionHelper.filterIntersectables(this.scene, ['water', 'skydome']);
		var intersection = IntersectionHelper.findIntersection(event, this.domElement, this.object, intersectables);
		var factor = this.zoomSpeed * 100;
		
		if (intersection !== null) {
			
			factor = intersection.distance > 5 ? this.zoomSpeed * Math.min(intersection.distance / 20, 100) : 0.2;
			factor = intersection.object.name === 'seabed' && intersection.distance < 2 ? 0 : factor;
			
		}
		
		var zoomVector = new THREE.Vector3(mouseCoords.x, mouseCoords.y, 1);
		zoomVector.unproject(this.object);
		zoomVector.sub(this.object.position);
		zoomVector.setLength(factor);
		
		if (event.deltaY > 0) {
			zoomVector.negate();
		}
		
		this.object.position.add(zoomVector);
		this.target.add(zoomVector);
		this.update();
	},
	
	zoomToCenter : function(value) {
		
		this.zoomToCenter = value;
		this.enableZoom = value;
		
		if (this.zoomToCenter) {
			this.domElement.removeEventListener('wheel', this.onMouseWheel, false);
		} else {
			this.domElement.addEventListener('wheel', this.onMouseWheel, false);
		}
	},
	
	dispose : function() {

		OrbitControls.prototype.dispose.call(this);
		this.domElement.removeEventListener('dblclick', this.onDoubleClick, false);
	},
	
	onDoubleClick : function(event) {
		
		var intersection = IntersectionHelper.findIntersection(event, this.domElement, this.object, this.planes.filter(function(object) {
			return object && object.visible;
		}));
		
		if (intersection !== null && this.doubleClickEnabled) {
			this.zoomToPoint(intersection.point);
		}
	},
	
	onMouseWheel : function(event) {
		radio('zoomToMouse').broadcast(event);
	},
	
	// please document things like distanceRatio (or give them a better name) so we don't waste time guessing and searching the rest of the codebase. Denis, 28.8.2019.
	setFromBoundingBox : function(box, center, distanceRatio, min, max) {
		
		var target = center.clone();
		var position = CameraHelper.calculatePositionFromBoundingBox(box, center, this.object.fov, distanceRatio, min, max);
		this.object.position.copy(position);
		this.target.copy(target);
		this.update();
		
		this.object.lookAt(target);
	}
});

var AxesFactory = {
		
	create : function(size) {
		
		var axes = new THREE.Object3D();
		var coneGeometry = new THREE.CylinderBufferGeometry(0, 5, 10, 10, 1);
		
		var xAxisLineGeometry = new THREE.TubeGeometry(new PiecewiseLinearCurve3([new THREE.Vector3(), new THREE.Vector3(size, 0, 0)], 50, 2, 4));
		var xAxisConeGeometry = coneGeometry.clone();
		xAxisConeGeometry.rotateZ(-Math.PI / 2);
		xAxisConeGeometry.translate(size, 0, 0);
		
		var xAxis = new THREE.Mesh(xAxisLineGeometry, new THREE.MeshLambertMaterial({ 
	        color: 0xff0000, 
	        wireframe: false,
	        side : THREE.DoubleSide
	    }));
		
		var cone = new THREE.Mesh(xAxisConeGeometry, new THREE.MeshLambertMaterial({ 
	        color: 0xff0000, 
	        wireframe: false,
	        side : THREE.DoubleSide
	    }));
		
		axes.add(xAxis);
		axes.add(cone);
		
		var labelSprite = this.createTextSprite("X", "20", "rgba(255,0,0,1)");
		axes.add(labelSprite);
		labelSprite.position.set(size - 20, -2.5, 20);
		labelSprite.scale.set(20, 20, 20);
		
		var yAxisLineGeometry = new THREE.TubeGeometry(new PiecewiseLinearCurve3([new THREE.Vector3(), new THREE.Vector3(0, 0, -size)], 50, 2, 4));
		var yAxisConeGeometry = coneGeometry.clone();
		yAxisConeGeometry.rotateX(-Math.PI / 2);
		yAxisConeGeometry.translate(0, 0, -size);
		
		var yAxis = new THREE.Mesh(yAxisLineGeometry, new THREE.MeshLambertMaterial({ 
	        color: 0x0000cc, 
	        wireframe: false,
	        side : THREE.DoubleSide
	    }));
		
		cone = new THREE.Mesh(yAxisConeGeometry, new THREE.MeshLambertMaterial({ 
	        color: 0x0000cc, 
	        wireframe: false,
	        side : THREE.DoubleSide
	    }));
		
		axes.add(yAxis);
		axes.add(cone);
		
		labelSprite = this.createTextSprite("Y", "20", "rgba(0, 0, 255, 1)");
		axes.add(labelSprite);
		labelSprite.position.set(-20, -2.5, -size + 20);
		labelSprite.scale.set(20, 20, 20);
		
		var zAxisLineGeometry = new THREE.TubeGeometry(new PiecewiseLinearCurve3([new THREE.Vector3(), new THREE.Vector3(0, size, 0)], 50, 2, 4));
		var zAxisConeGeometry = coneGeometry.clone();
		zAxisConeGeometry.translate(0, size, 0);
		
		var zAxis = new THREE.Mesh(zAxisLineGeometry, new THREE.MeshLambertMaterial({ 
	        color: 0x009900, 
	        wireframe: false,
	        side : THREE.DoubleSide
	    }));
		
		cone = new THREE.Mesh(zAxisConeGeometry, new THREE.MeshLambertMaterial({ 
	        color: 0x009900, 
	        wireframe: false,
	        side : THREE.DoubleSide
	    }));
		
		axes.add(zAxis);
		axes.add(cone);
		
		labelSprite = this.createTextSprite("Z", "20", "rgba(0, 255, 0, 1)");
		axes.add(labelSprite);
		labelSprite.position.set(20, size - 20, 20);
		labelSprite.scale.set(20, 20, 20);
		
		//axes.rotation.y -= Math.PI / 2;
		
		return axes;
	},
	
	createTextSprite : function(message, fontsize, color) {
	    
		var canvas = document.createElement('canvas');
		var context = canvas.getContext('2d');
		context.font = fontsize + "px Arial";
		canvas.width = context.measureText(message).width;
	    canvas.height = fontsize * 2; // fontsize * 1.5
	    context.font = fontsize + "px Arial";        
	    context.fillStyle = "rgba(255,0,0,1)";
	    context.fillStyle = color;
	    context.fillText(message, 0, fontsize);
	    
	    var texture = new THREE.Texture(canvas);
	    texture.minFilter = THREE.LinearFilter;
	    texture.needsUpdate = true;

	    return new THREE.Sprite(new THREE.SpriteMaterial({ map : texture, transparent : true }));   
	}
};

function ObjectFactory() { }

ObjectFactory.prototype.constructor = ObjectFactory;

Object.assign(ObjectFactory.prototype, {
	
	showLocalAxes : false,
	usePipeGeometry: false,
	
	createPipe : function(properties) {
		
		if (properties.points !== undefined) {
			
			var points = CoordsHelper.transformCoords_World_Screen(properties.points), factor = 0.5;
			var mesh = new THREE.Mesh(LineHelper.createPipeGeometry(points, properties.od.value * factor), new THREE.MeshLambertMaterial({ color: properties.color, side : THREE.DoubleSide }));
			mesh.userData.controlPoints = points;
			
			return mesh;
			
		} else {
			
			console.error("Missing attribute 'points' in entry " + properties.name);
			throw { name : "Missing attribute", message : "Points is required property" };
		}
	
	},

	createLine : function(properties) {
		
		if (properties.points !== undefined) {
				
			var points = CoordsHelper.transformCoords_World_Screen(properties.points);
			
			var geometry = new THREE.Geometry();
			geometry.dynamic = true;
			
			points.forEach(function(point) {
				
				geometry.colors.push(new THREE.Color(properties.color));
				geometry.vertices.push(point);
			});
			
			return new THREE.Line(geometry, new THREE.LineBasicMaterial({
				color : properties.color,
				linewidth : properties.od.value === undefined ? 5 : properties.od.value,
			}));
			
		} else {
			
			console.error("Missing attribute 'points' in entry " + properties.name);
			throw { name : "Missing attribute", message : "Points is required property" };
		}
	},
	
	createStructure : function(properties, assetLoader) {
		
		if (properties.position === undefined) {
			
			console.error("Missing attribute 'position' in entry " + properties.name);
			throw { name : "Missing attribute", message : "Position is required property" };
		}
		
		var position = CoordsHelper.transformCoord_World_Screen(properties.position);
		var orientation = properties.orientation === undefined ? new THREE.Vector3(0, 0, 0) : properties.orientation;
		// orientation.z = properties.azimuth;

		var size = new THREE.Vector3(1, 1, 1);
		
		if (properties.size !== undefined) {
			size = new THREE.Vector3(properties.size.x, properties.size.y, properties.size.z);
		}
		
		var object3d = assetLoader.getObject3D(properties.assetType, new THREE.Vector3(1, 1, 1));
		object3d.scale.copy(assetLoader.getScale(properties, size, object3d, true));
		
		object3d.position.set(position.x, position.y, position.z);
		//TODO: below should be ZYX but then local rotations of the structure is needed. For now the property.orientation is
		//		global rotation around World XYZ. So theejs will rotate structure in XY and then changing azimuth or yaw just rotates the structure with
		//		given global roll and pitch. Otherwise roll and pith of the structure needs to change for every change of azimuth if ZYX is used.
		//ovako radi na standalone ali ne znam zasto
		object3d.setRotationFromQuaternion(RotationHelper.calculateForOrder(orientation.y, -orientation.x, orientation.z, 'xyz'));
		object3d.userData.adjustable = properties.adjustable;
		object3d.userData.orientation = { x : orientation.x, y : orientation.y, z : orientation.z };
		
		var axes = AxesFactory.create(100);
		// lokal-axis je rotiran oko threejs za (-90,90,0) XYZ
		axes.rotation.y = THREE.Math.degToRad(90);
		axes.scale.set(0.05, 0.05, 0.05);
		axes.name = 'local-axes';
		axes.visible = this.showLocalAxes;
		object3d.add(axes);
		
		object3d.getConnectionPointWorldPositions = function() {
			
			var worldPositions = {};
			
			this.updateMatrixWorld(true);
			this.updateMatrix(true);
			
			this.children.forEach(function(child) {
				
				if (child.userData.type === 'connection-point') {
					worldPositions[child.userData.connectionPointId] = CoordsHelper.transformCoord_Screen_World(child.getWorldPosition(new THREE.Vector3()));
				}
			});
			
			return worldPositions;
		};

		ElementHelper.updateConnectionPoints(object3d, properties.connectionPoints, PropertyModifier.getScaleFactor(properties.assetType, properties.size), this.showLocalAxes);
		
		return object3d;
	},

	factories : {
			
		Line : function(properties, assetLoader, seabed) {
			
			console.log('Creating pipe ' + properties.name);
			return this.usePipeGeometry ? this.createPipe(properties) : this.createLine(properties); 
		},

		LineComponent : function(properties) {

			console.log('Creating pipe component' + properties.name);
			return this.usePipeGeometry ? this.createPipe(properties) : this.createLine(properties);
		},
		
		Jumper : function(properties) {
			
			console.log('Creating jumper ' + properties.name);
			return this.createPipe(properties);
		},
		
		Vessel : function(properties, assetLoader) {
			
			properties.position = properties.position === undefined ? new THREE.Vector3(0, 0, 0) : properties.position;
			return ObjectFactory.prototype.factories.Default(properties, assetLoader);
		},
		
		Default : function(properties, assetLoader) {
			return this.createStructure(properties, assetLoader);
		}
	},
	
	create : function(entry, assetLoader, seabed, tagsVisible) {
		
		if (!entry.assetType) {
			return;
		}
		
		var factory = this.factories[entry.type.name] === undefined ? this.factories.Default : this.factories[entry.type.name];
		
		var node = factory.call(this, entry, assetLoader, seabed);
		node.userData.entityId = entry.id;
		node.name = entry.name;
		node.userData.type = entry.type.name;
		node.userData.assetType = entry.asset.name;
		node.update = function() {};
		
		if (entry.od) {
			node.userData.od = entry.od.value;
		}
		
		if (entry.creationInfo && entry.creationInfo.rule) {
			node.userData.rule = entry.creationInfo.rule;
		}
		
		return node;
	}
});

var WaterSurfaceFactory = {
	
	create : function (light, pathPrefix) {
			
		var waterGeometry = new THREE.PlaneBufferGeometry(100000, 100000);

		var water = new Water(waterGeometry, { textureWidth: 512, textureHeight: 512,
				waterNormals: new THREE.TextureLoader().load(pathPrefix + 'asset/texture/waternormals.jpg', function (texture) {
					texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
				}),
				sunDirection: light.position.clone().normalize(),
				sunColor: 0xffffff,
				waterColor: 0x001e0f,
				distortionScale: 3.5
			}
		);

		water.name = 'water';
		water.rotation.x = - Math.PI / 2;
		
		return water;
	}
};

// function TerrainManager() {
	
// 	this.texture = new THREE.TextureLoader().load('asset/texture/blue_sand.jpg');
// 	this.texture.wrapS = this.texture.wrapT = THREE.RepeatWrapping;
// }

// TerrainManager.prototype.constructor = TerrainManager;

// Object.assign(TerrainManager.prototype, {
	
// 	generate : function(data) {
		
// 		var geometry = new THREE.BufferGeometry().setFromPoints(data), meshIndex = [], min = { x : 0, z : 0}, max = { x: 0, z : 0}, xValues = [], zValues = [];
		
// 		var indexDelaunay = Delaunator.from(data.map(function(vertex) { 
			
// 			if (xValues.indexOf(vertex.x) === -1) {
// 				xValues.push(vertex.x);
// 			}
			
// 			if (zValues.indexOf(vertex.z) === -1) {
// 				zValues.push(vertex.z);
// 			}
			
// 			min.x = Math.min(min.x, vertex.x);
// 			min.z = Math.min(min.z, vertex.z);
// 			max.x = Math.max(max.x, vertex.x);
// 			max.z = Math.max(max.z, vertex.z);
			
// 			return [vertex.x, vertex.z]; 
// 		}));
		
// 		var width = Math.sqrt(Math.pow(min.x - max.x, 2)), height = Math.sqrt(Math.pow(min.z - max.z, 2));
// 		var widthSegments = xValues.length -1, heightSegments = zValues.length - 1;
		
// 		for (var i = 0; i < indexDelaunay.triangles.length; i++) {
// 			meshIndex.push(indexDelaunay.triangles[i]);
// 		}

// 		var uvs = this.computeUVs(width, height, widthSegments, widthSegments, heightSegments);
		
// 		geometry.setIndex(meshIndex);
// 		geometry.computeFaceNormals();
// 		geometry.computeVertexNormals();
// 		geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
		
// 		this.texture.maxFilter = THREE.NearestFilter;
// 		this.texture.repeat.set(3200, 3200);
// 		this.texture.needsUpdate = true;

// 		return new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ map : this.texture }));
// 	},
	
// 	computeUVs : function(width, height, widthSegments, heightSegments) {
		
// 		var result = [], columns = widthSegments + 1, rows = heightSegments + 1;

// 		for (var rowIdx = 0; rowIdx < rows; rowIdx++) {
				
// 			for (var columnIdx = 0; columnIdx < columns; columnIdx++) {
				
// 				result.push(columnIdx / widthSegments);
// 				result.push(1 - (rowIdx / heightSegments));
// 			}
// 		}
		
// 		return result;
// 	},
	
// 	generateTexture : function( data, width, height ) {
		
// 		var canvas, canvasScaled, context, image, imageData, vector3, sun, shade;
		
// 		vector3 = new THREE.Vector3( 0, 0, 0 );

// 		sun = new THREE.Vector3( 1, 1, 1 );
// 		sun.normalize();

// 		canvas = document.createElement( 'canvas' );
// 		canvas.width = width;
// 		canvas.height = height;

// 		context = canvas.getContext( '2d' );
// 		context.fillStyle = '#000';
// 		context.fillRect( 0, 0, width, height );

// 		image = context.getImageData( 0, 0, canvas.width, canvas.height );
// 		imageData = image.data;

// 		for ( var i = 0, j = 0, l = imageData.length; i < l; i += 4, j ++ ) {

// 			vector3.x = data[ j - 2 ] - data[ j + 2 ];
// 			vector3.y = 2;
// 			vector3.z = data[ j - width * 2 ] - data[ j + width * 2 ];
// 			vector3.normalize();

// 			shade = vector3.dot( sun );

// 			imageData[ i ] = ( 96 + shade * 128 ) * ( 0.5 + data[ j ] * 0.007 );
// 			imageData[ i + 1 ] = ( 32 + shade * 96 ) * ( 0.5 + data[ j ] * 0.007 );
// 			imageData[ i + 2 ] = ( shade * 96 ) * ( 0.5 + data[ j ] * 0.007 );

// 		}

// 		context.putImageData( image, 0, 0 );

// 		// Scaled 4x

// 		canvasScaled = document.createElement( 'canvas' );
// 		canvasScaled.width = width * 4;
// 		canvasScaled.height = height * 4;

// 		context = canvasScaled.getContext( '2d' );
// 		context.scale( 4, 4 );
// 		context.drawImage( canvas, 0, 0 );

// 		image = context.getImageData( 0, 0, canvasScaled.width, canvasScaled.height );
// 		imageData = image.data;

// 		for ( var i = 0, l = imageData.length; i < l; i += 4 ) {

// 			var v = ~ ~ ( Math.random() * 5 );

// 			imageData[ i ] += v;
// 			imageData[ i + 1 ] += v;
// 			imageData[ i + 2 ] += v;

// 		}

// 		context.putImageData( image, 0, 0 );

// 		return canvasScaled;
// 	}
// });

// function TerrainManager() {
//     // Load the texture for the terrain
//     this.texture = new THREE.TextureLoader().load('asset/texture/blue_sand.jpg');
//     this.texture.wrapS = this.texture.wrapT = THREE.RepeatWrapping;
// }

// TerrainManager.prototype.constructor = TerrainManager;

// Object.assign(TerrainManager.prototype, {
//     generate: async function(tiffUrl) {
//         const rawTiff = await GeoTIFF.fromUrl(tiffUrl);
//         const tifImage = await rawTiff.getImage();
//         const heightData = await tifImage.readRasters({ interleave: true });

//         const width = tifImage.getWidth();
//         const height = tifImage.getHeight();
        
//         const data = [];
//         for (let z = 0; z < height; z++) {
//             for (let x = 0; x < width; x++) {
//                 const elevation = heightData[z * width + x]; // Adjust based on the raster format
//                 data.push(new THREE.Vector3(x, elevation, z));
//             }
//         }

//         // Create LOD Object
//         const lod = new THREE.LOD();

//         // Level of Detail settings
//         const levelsOfDetail = [0.5, 1, 2]; // Simpler meshes for different LOD
//         const distances = [50, 150, 300]; // Distances for switching LODs

//         levelsOfDetail.forEach((detailFactor, index) => {
//             const geometry = this.createGeometry(data, detailFactor);
//             const material = new THREE.MeshLambertMaterial({ map: this.texture });
//             const mesh = new THREE.Mesh(geometry, material);

// 			console.log(mesh);

//             // Ensure the created mesh is indeed an instance of THREE.Mesh
//             if (!(mesh instanceof THREE.Mesh)) {
//                 console.error("The created object is not a valid Mesh:", mesh);
//                 return; // Skip adding this mesh if it's invalid
//             }
            
//             lod.addLevel(mesh, distances[index]); // Add LOD with associated distance
//         });

//         return lod; // Ensure this returns the LOD object
//     },

//     createGeometry: function(data, detailFactor) {
//         // Create geometry with reduced detail based on detailFactor
//         const geometry = new THREE.BufferGeometry().setFromPoints(data);
        
//         // IMPORTANT: Implement detail reduction logic here based on detailFactor.
//         geometry.computeFaceNormals();
//         geometry.computeVertexNormals();

//         // Set UVs 
//         const uvs = this.computeUVs(data.length / detailFactor, data.length / detailFactor, data.length / detailFactor - 1, data.length / detailFactor - 1);
//         geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

//         return geometry; // Ensure a proper BufferGeometry is returned
//     },

//     computeUVs: function(width, height, widthSegments, heightSegments) {
//         const result = [];
//         const columns = widthSegments + 1;
//         const rows = heightSegments + 1;

//         for (let rowIdx = 0; rowIdx < rows; rowIdx++) {
//             for (let columnIdx = 0; columnIdx < columns; columnIdx++) {
//                 result.push(columnIdx / widthSegments);
//                 result.push(1 - (rowIdx / heightSegments)); // Invert Y-axis for UVs
//             }
//         }

//         return result;
//     }
// });

function TerrainManager() {
    // Load a texture for the terrain
    this.texture = new THREE.TextureLoader().load('asset/texture/blue_sand.jpg');
    this.texture.wrapS = this.texture.wrapT = THREE.RepeatWrapping;
}

TerrainManager.prototype.constructor = TerrainManager;

Object.assign(TerrainManager.prototype, {
    generate: async function(tiffUrl, widthSegments, heightSegments) {
        // Read elevation data from the TIFF
        const rawTiff = await GeoTIFF.fromUrl(tiffUrl);
        const image = await rawTiff.getImage();
        const data = await image.readRasters();
        
        // Create a buffer geometry
        const geometry = new THREE.BufferGeometry();

        // Create vertices based on the TIFF data
        const vertices = [];
        const width = image.getWidth();
        const height = image.getHeight();

        for (let z = 0; z < height; z++) {
            for (let x = 0; x < width; x++) {
                const heightValue = data[z * width + x]; // Assuming single-channel height data
                vertices.push(x, heightValue * 0.1, z); // Scale heightValue if needed
            }
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

        // Compute face normals
        geometry.computeFaceNormals();
        geometry.computeVertexNormals();
        
        // Generate UVs
        const uvs = this.computeUVs(width, height, widthSegments, heightSegments);
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        
        // Create the mesh
        const material = new THREE.MeshLambertMaterial({ map: this.texture });
        return new THREE.Mesh(geometry, material);
    },
    
    computeUVs: function(width, height, widthSegments, heightSegments) {
        const result = [];
        const columns = widthSegments + 1;
        const rows = heightSegments + 1;

        for (let rowIdx = 0; rowIdx < rows; rowIdx++) {
            for (let columnIdx = 0; columnIdx < columns; columnIdx++) {
                result.push(columnIdx / widthSegments);
                result.push(1 - (rowIdx / heightSegments));
            }
        }
        
        return result;
    }
});


function SceneManager(domElement, prefixPath, settings) {
	
	this.container = domElement;
	this.prefixPath = prefixPath;
	this.settings = settings;
}

SceneManager.prototype.constructor = SceneManager;

Object.assign(SceneManager.prototype, OC.EventDispatcher.prototype, {
	
	initialize : function(window) {
		
		var this_ = this;
		
		this.assetLoader = new AssetLoader();
		this.objectFactory = new ObjectFactory();
		
		this.renderer = this.rendererFactory.call(this);
		this.renderer.setPixelRatio(window.devicePixelRatio);
		this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
		this.renderer.setClearColor(this.underwaterColor);
		this.renderer.autoClear = false;
		
		this.seabed = null;
		
		this.scene = new THREE.Scene();
		this.orthoScene = new THREE.Scene();
		
		this.container.appendChild(this.renderer.domElement);
		
		this.camera = new THREE.PerspectiveCamera(50, this.renderer.domElement.clientWidth / this.renderer.domElement.clientHeight, 0.5, 10000000);
		this.camera.position.set(5000, 1000, 4000);
		
		this.ambientLight = new THREE.AmbientLight(0x444444);
		this.scene.add(this.ambientLight);
		
		this.hemisphereLight = new THREE.HemisphereLight(0xffffff, 0xabe0e6, 0.5);
		this.hemisphereLight.position.set(0, 50, 0);
		this.scene.add(this.hemisphereLight);
		
		this.light = new THREE.DirectionalLight(0xffffbb, 1);
		this.light.position.set(5, 5, 5);
		this.scene.add(this.light);
		this.terrainManager = new TerrainManager(this.prefixPath);

		this.initializeEnvironment();
		this.initializeControls();
		
		if (this.renderer.domElement.clientWidth > 0) {
			this.initializeHud();
		}
		
		this.onPostInit();
		
		return this;
	},
	
	rendererFactory : function(canvas) {
		throw 'This needs to be implemented by a subclasses';
	},
	
	setSettings : function(settings) {
		var entries = Object.entries(settings), _this = this;
		entries = entries.filter(function (setting) {
			return _this.settings[setting[0]] !== undefined;
		});
		entries.forEach(function (setting) {
			_this.settings[setting[0]] = setting[1];
		});
		return this;
	},
	
	initializeEnvironment : function() {
		
		if (this.settings.water) {
			
			this.water = WaterSurfaceFactory.create(this.light, this.prefixPath);
			this.scene.add(this.water);
		}
		
		if (this.settings.sky) {
			
			this.sky = new Skydome(new THREE.Color(0x0077ff), new THREE.Color(0xc7c8cc), 1000000);
			this.scene.add(this.sky);
		}
	},
	
	initializeControls : function() {
		
		var this_ = this;
		
		this.controls = new CameraControls(this.camera, this.renderer.domElement, [this.seabed, this.water], this.renderer, this.scene);
		this.controls.zoomSpeed = 3.0;
		this.controls.damping = 0.2;
		this.controls.maxDistance = 300 * 1000;
		this.controls.minDistance = 20;
		this.controls.enablePan = false;
		this.controls.mouseButtons = { RIGHT : THREE.MOUSE.ROTATE, MIDDLE : THREE.MOUSE.DOLLY };
		this.controls.zoomToCenter(false);
		this.controls.addEventListener('change', function(event) {
			
			this_.dispatchEvent({type : 'camera-controls-change', data : { position : this_.controls.object.position, target : this_.controls.target }});
		});
	},
	
	initializeHud : function() {
		
		this.orthoCamera = new THREE.OrthographicCamera(-this.renderer.domElement.clientWidth / 2, this.renderer.domElement.clientWidth / 2, this.renderer.domElement.clientHeight / 2, -this.renderer.domElement.clientHeight / 2, 1, 10);
		this.orthoCamera.position.z = 5;
		this.axes = new Axes(this.renderer, this.orthoScene, this.orthoCamera, this.light, this.ambientLight);
	},
	
	onPostInit : function() {
		throw 'This needs to be implemented by a subclasses';
	},
	
	updateSeabed : function(data) {
		
		this.generateSeabed(data);
		this.controls.planes = [this.seabed, this.water];
	},
	
	updateData : function(data) {
		
		console.log("Updating data...");
		this.dispose();
		
		if (data.seabedData !== undefined) {
			this.updateSeabed(data.seabedData);
		}
		
		this.processData(data);
		this.controls.updateIntersectables(this.scene);
	},
	
	processData : function(data) {
		throw 'This should be implemented by a subclasses';
	},
	
	update : function() {
		
		if (this.settings.water) {
			
			this.water.visible = this.settings.water.visible;
			
			if (this.water.visible) {
				
				this.water.onBeforeRender(this.renderer, this.scene, this.camera);
				this.water.material.uniforms['time'].value += 1.0 / 60.0;
				this.water.material.uniforms.alpha.value = this.settings.water.opacity;
			}
		}

		// if (this.seabed !== null) {
			
		// 	this.seabed.visible = this.settings.seabed.visible;
		// 	this.seabed.position.y = this.settings.seabed.level;
		// 	this.seabed.rotation.set(0, THREE.Math.degToRad(this.settings.seabed.rotation), 0);
		// }
		
		if (this.axes !== undefined) {
			this.axes.update(this.camera, this.controls);
		}
		
		this.onPostUpdate();
	},
	
	onPostUpdate : function() {
		throw 'This should be implemented by a subclasses';
	},
	
	render : function() {
		
		this.renderer.clear();
		
		if (this.axes !== undefined) {

			this.renderer.setClearColor(0x000000, 0);
			this.axes.render(this.renderer);
		}
		
		this.renderer.render(this.scene, this.camera);
		
		if (this.orthoCamera !== undefined) {
			
			this.renderer.clearDepth();
			this.renderer.render(this.orthoScene, this.orthoCamera);
		}
	},
	
	disposeNode : function(node) {
		
		this.scene.remove(node);
		
		node.children.forEach(function(child) {
			this.disposeNode(child);
		}, this);
		
		if (node.geometry) {
			node.geometry.dispose();
		}
		
		ObjectHelper.getMaterials(node).forEach(function(material) {
			material.dispose();
		});
	},
	
	disposeById : function(id) {
		
		var node = this.scene.getObjectByEntityId(id);
		
		if (node !== undefined) {
			this.disposeNode(node);
		}
	},
	
	disposeAll : function(ids) {
		
		ids.forEach(function(id) {
			this.disposeById(id);
		}, this);
	},
	
	markDisposables : function() {
		
		var disposables = [];
		
		this.scene.children.forEach(function(node) {
			
			if (node.userData && node.userData.entityId) {
				disposables.push(node.userData.entityId);
			}
			
		}, this);
		
		return disposables;
	},
	
	onPostDispose : function() {
		throw 'This should be implemented by a subclasses';
	},
	
	onResize : function() {

		var width = this.container.clientWidth;
		var height = this.container.clientHeight;

		this.camera.aspect = width / height;
		this.camera.updateProjectionMatrix();

		if (this.orthoCamera === undefined) {
			this.initializeHud();
		}
		
		this.orthoCamera.left = -width / 2;
		this.orthoCamera.right = width / 2;
		this.orthoCamera.top = height / 2;
		this.orthoCamera.bottom = -height / 2;
		this.orthoCamera.updateProjectionMatrix();
		
		if (this.axes !== undefined) {
			this.axes.sprite.position.set(this.orthoCamera.right - 76, this.orthoCamera.top - 76, 0);
		}
		
		this.renderer.setSize(width, height);
	},
	
	onAssetLoaderComplete : function() {
		this.dispatchEvent({type : 'assets-loaded'});
	},
	
	generateSeabed : function(seabedData) {
		
		if (seabedData.vertices !== undefined && seabedData.vertices.length > 0) {
			
			if (this.seabed !== null) {
				this.disposeNode(this.seabed);
			}
			
			// this.seabed = this.terrainManager.generate(CoordsHelper.transformCoords_World_Screen(seabedData.vertices));
			// this.seabed.name = 'seabed';
			// this.scene.add(this.seabed);
			
			this.seabed = this.terrainManager.generate('asset/tiff/1.tif');
			this.seabed.name = 'seabed';
			if(this.seabed instanceof THREE.Object3D){
				this.scene.add(this.seabed);
			}
			else {
				console.log("Generated object is not a valid THREE.Object3D");
			}

			// this.seabed.position.y = this.settings.seabed.level;
			// this.seabed.rotation.y = THREE.Math.degToRad(this.settings.seabed.rotation);
			// this.seabed.updateMatrix();
			// this.seabed.updateMatrixWorld(true);
		}
	},
	
	updateAssets : function(data, window) {
		this.assetLoader.load(data, window, this.onAssetLoaderComplete, this);
	},
	
	setCameraControlsMode : function(options) {
		this.controls.lockZoom = !options.enableZoom;
		this.controls.doubleClickEnabled = options.doubleClickEnabled;
	}
});

exports.Skydome = Skydome;
exports.Water = Water;
exports.SelectionSphere = SelectionSphere;
exports.Axis = Axis;
exports.RotationHelper = RotationHelper;
exports.VectorDiffResult = VectorDiffResult;
exports.CoordsHelper = CoordsHelper;
exports.LineHelper = LineHelper;
exports.IntersectionHelper = IntersectionHelper;
exports.ObjectHelper = ObjectHelper;
exports.PropertyModifier = PropertyModifier;
exports.ElementHelper = ElementHelper;
exports.CameraHelper = CameraHelper;
exports.SceneHelper = SceneHelper;
exports.Axes = Axes;
exports.AssetLoader = AssetLoader;
exports.OrbitControls = OrbitControls;
exports.CameraControls = CameraControls;
exports.AxesFactory = AxesFactory;
exports.ObjectFactory = ObjectFactory;
exports.WaterSurfaceFactory = WaterSurfaceFactory;
exports.TerrainManager = TerrainManager;
exports.SceneManager = SceneManager;

Object.defineProperty(exports, '__esModule', { value: true });

})));
