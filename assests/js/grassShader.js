let simpleNoise = `
		float N (vec2 st) { // https://thebookofshaders.com/10/
				return fract( sin( dot( st.xy, vec2(12.9898,78.233 ) ) ) *  43758.5453123);
		}

		float smoothNoise( vec2 ip ){ // https://www.youtube.com/watch?v=zXsWftRdsvU
			vec2 lv = fract( ip );
			vec2 id = floor( ip );

			lv = lv * lv * ( 3. - 2. * lv );

			float bl = N( id );
			float br = N( id + vec2( 1, 0 ));
			float b = mix( bl, br, lv.x );

			float tl = N( id + vec2( 0, 1 ));
			float tr = N( id + vec2( 1, 1 ));
			float t = mix( tl, tr, lv.x );

			return mix( b, t, lv.y );
		}

	 float rand(vec2 n) { 
			return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
		}
		
		float noise2f(vec2 p){
			vec2 ip = floor(p);
			vec2 u = fract(p);
			u = u*u*(3.0-2.0*u);
			
			float res = mix(
				mix(rand(ip),rand(ip+vec2(1.0,0.0)),u.x),
				mix(rand(ip+vec2(0.0,1.0)),rand(ip+vec2(1.0,1.0)),u.x),u.y);
			return res*res;
		}
	
	`;

const vertexShader = `
	varying vec2 vUv;
 	varying float swayIntensity;

	uniform float time;
 	uniform float LOD;

	${simpleNoise}

	void main() {

		vUv = uv;
		float t = time * 1.5;

		// VERTEX POSITION

		vec4 mvPosition = vec4( position, 1.0 );
		#ifdef USE_INSTANCING
			mvPosition = instanceMatrix * mvPosition;
		#endif

		// DISPLACEMENT

		swayIntensity = 0.0;

 		if (LOD == 0.0) {

			//float noise = smoothNoise(mvPosition.xz * 1.5 + vec2(0., t));
			//noise = pow(noise * 0.5 + 0.5, 2.0) * 2.0;
	
	 		float noise = noise2f(mvPosition.xz) * 2.0;
	
			// here the displacement is made stronger on the blades tips.
			float dispPower = 1. - cos( uv.y * 3.1416 * 0.5 );
	
			float displacement = noise * ( 2.0 * dispPower );
	
			//vec4 offset = projectionMatrix * modelViewMatrix * mvPosition * 0.2;
			vec4 offset = mvPosition * 0.2;
		
			mvPosition.x -= ( sin(t + offset.x + (uv.y * 2.0)) + 1.0 ) * displacement * 0.3;
			mvPosition.x -= displacement * 0.5;
	
			mvPosition.y -= ( sin(t + offset.x + (uv.y * 2.0)) + 1.0 ) * displacement * 0.2;
	 		mvPosition.y -= displacement * 0.1;
	
			swayIntensity = ( sin(t + offset.x + (uv.y * 2.0)) + 1.0 ) * displacement * 0.3;
			swayIntensity -= displacement * 0.5;

 		}

		//

		vec4 modelViewPosition = modelViewMatrix * mvPosition;
		gl_Position = projectionMatrix * modelViewPosition;

	}
`;

const fragmentShader = `
	varying vec2 vUv;
 	varying float swayIntensity;

	uniform sampler2D map;
	uniform sampler2D alphaMap;
	uniform float lightIntensity;
 	uniform vec3 sunColour;

	float easeInSine(float x) {
		return 1.0 - cos((x * 3.14159265) / 2.0);
	}

	void main() {
 
		//gl_FragColor = texture2D( map, vUv);
		//vec4 tex2 = texture2D( alphaMap, vUv );
	
		//if(tex2.r - 1.0 < 0.0) {
				//gl_FragColor.a = 0.0;
				//or without transparent = true use
				//discard; 
		//}

 		vec3 baseColour = vec3(0.05, 0.2, 0.01);
	 	vec3 tipColour = vec3(0.5, 0.5, 0.1);

		gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);

		vec3 diffuseColour = mix(baseColour, tipColour, easeInSine(vUv.y));

		float ambience = min(1.0, easeInSine(vUv.y) + 0.6) * 2.0;
		ambience *= 0.8;

 		float specular = 1.0 + max( 0.0, swayIntensity * vUv.y * 1.5 );
 
		diffuseColour *= ambience * lightIntensity * sunColour * specular;

 		gl_FragColor.rgb = diffuseColour.rgb;
	
	}
`;

export { vertexShader, fragmentShader }