/**
 * @author Julien 'Blaxar' Bardagi <blaxar.waldarax@gmail.com>
 */

import {
	FileLoader,
	Loader,
	Mesh,
	Vector2,
	Vector3,
	Matrix4,
	Vector4,
	MathUtils,
	MeshPhongMaterial,
	MeshBasicMaterial,
	BufferGeometry,
	Quaternion,
	Plane,
	TextureLoader,
	NearestFilter,
	LinearMipmapNearestFilter,
	RepeatWrapping,
	ClampToEdgeWrapping,
	MirroredRepeatWrapping,
	LinearSRGBColorSpace,
	SRGBColorSpace,
	FrontSide,
	DoubleSide,
	Group,
	BufferAttribute,
	EdgesGeometry,
	LineSegments,
	LineBasicMaterial
} from 'three';

import { Earcut } from 'three/src/extras/Earcut.js';

import { SweepContext } from 'poly2tri';

const LightSampling = {
	FACET: 1,
	VERTEX: 2
};

const GeometrySampling = {
	POINTCLOUD: 1,
	WIREFRAME: 2,
	SOLID: 3
};

const TextureMode = {
	LIT: 1,
	FORESHORTEN: 2,
	FILTER: 3
};

const MaterialMode = {
	NONE: 0,
	NULL: 1,
	DOUBLE: 2
};

const TextureAddressMode = {
	WRAP: 0,
	MIRROR: 1,
	CLAMP: 2
};

const signTag = 100;
const pictureTag = 200;

const glossRatio = 0.1;
const defaultAlphaTest = 0.2;
const defaultSurface = [ 0.69, 0.0, 0.0 ]; // Ambience (recommended AW 2.2), Diffusion, Specularity

const extensionRegex = /^.*(\.[^\\]+)$/i;
const isAlphaExtensionRegex = /^\.(tiff|png|webp|gif)$/i;

// Perform polygon triangulation by projecting vertices on a 2D plane first
function triangulateFaces( vertices, uvs, loop, objectName, forceEarcut = false, verboseWarning = false ) {

	// Mostly crediting @neeh for their answer: https://stackoverflow.com/a/42402681
	const _ctr = new Vector3();

	let _basis = new Matrix4();
	const _plane = new Plane();
	const _q = new Quaternion();
	const _y = new Vector3();
	const _x = new Vector3();

	const X = new Vector3( 1.0, 0.0, 0.0 );
	const Z = new Vector3( 0.0, 0.0, 1.0 );

	let _tmp = new Vector3();

	const vertexIdMap = [];

	// Compute centroid
	_ctr.setScalar( 0.0 );

	let l = loop.length;
	for ( let i = 0; i < l; i ++ ) {

		_ctr.add( new Vector3( vertices[ loop[ i ] * 3 ], vertices[ loop[ i ] * 3 + 1 ], vertices[ loop[ i ] * 3 + 2 ] ) );
		vertexIdMap.push( loop[ i ] );

	}

	_ctr.multiplyScalar( 1.0 / l );

	let loopNormal = new Vector3( 0.0, 0.0, 0.0 );

	// Compute loop normal using Newell's Method
	for ( let i = 0; i < l; i ++ ) {

		const currentVertex = new Vector3( vertices[ loop[ i ] * 3 ], vertices[ loop[ i ] * 3 + 1 ], vertices[ loop[ i ] * 3 + 2 ] );

		let nextVertex = new Vector3(
			vertices[ loop[ ( ( i + 1 ) % l ) ] * 3 ],
			vertices[ loop[ ( ( i + 1 ) % l ) ] * 3 + 1 ],
			vertices[ loop[ ( ( i + 1 ) % l ) ] * 3 + 2 ]
		);

		loopNormal.x += ( currentVertex.y - nextVertex.y ) * ( currentVertex.z + nextVertex.z );
		loopNormal.y += ( currentVertex.z - nextVertex.z ) * ( currentVertex.x + nextVertex.x );
		loopNormal.z += ( currentVertex.x - nextVertex.x ) * ( currentVertex.y + nextVertex.y );

	}

	loopNormal.normalize();

	const coplanarVertex = new Vector3( vertices[ loop[ 0 ] * 3 ], vertices[ loop[ 0 ] * 3 + 1 ], vertices[ loop[ 0 ] * 3 + 2 ] );
	_plane.setFromNormalAndCoplanarPoint( loopNormal, coplanarVertex );
	let _z = _plane.normal;

	// Compute basis
	_q.setFromUnitVectors( Z, _z );
	_x.copy( X ).applyQuaternion( _q );
	_y.crossVectors( _x, _z );
	_y.normalize();
	_basis.makeBasis( _x, _y, _z );
	_basis.setPosition( _ctr );

	// Project the 3D vertices on the 2D plane
	let poly2triData = [];
	let earcutData = [];

	for ( let i = 0; i < l; i ++ ) {

		const currentVertex = new Vector3( vertices[ loop[ i ] * 3 ], vertices[ loop[ i ] * 3 + 1 ], vertices[ loop[ i ] * 3 + 2 ] );
		_tmp.subVectors( currentVertex, _ctr );

		if ( ! forceEarcut ) poly2triData.push( { x: _tmp.dot( _x ), y: _tmp.dot( _y ), id: vertexIdMap[ i ] } );

		earcutData.push( _tmp.dot( _x ), _tmp.dot( _y ) );

	}

	let faces = [];

	if ( ! forceEarcut ) {

		try {

			// By default: try to use poly2tri (Delaunay triangulation), as it lays better result than Earcut in our case when it succeeds
			const swctx = new SweepContext( poly2triData );
			swctx.triangulate();
			const triangles = swctx.getTriangles();

			for ( const tri of triangles ) {

				faces.push( tri.getPoint( 0 ).id, tri.getPoint( 1 ).id, tri.getPoint( 2 ).id );

			}

			return faces;

		} catch ( e ) {

			// Can't use poly2tri in this case... fallback to Earcut
			if ( verboseWarning ) console.warn( 'Could not use poly2tri here for ' + objectName + ' (falling back to Earcut): ' + e );

		}

	}

	// Return faces correctly mapping original vertex IDs
	faces = Earcut.triangulate( earcutData, null, 2 ).map( id => vertexIdMap[ id ] );

	return faces;

}

function makeMaskPromise( bmpURI, threeMat, loader, textureColorSpace = LinearSRGBColorSpace,
	textureWrapping = RepeatWrapping, textureFiltering = true ) {

	return new Promise( ( resolveMask ) => {

		loader.load( bmpURI, ( maskTexture ) => {

			// If the height is nicely divisible by the width: it's an animated mask
			if ( maskTexture.image.height !== maskTexture.image.width && maskTexture.image.height % maskTexture.image.width === 0 ) {

				threeMat.userData.rwx.maskAnimation = { yTiles: maskTexture.image.height / maskTexture.image.width,
					yHeight: maskTexture.image.width / maskTexture.image.height,
					step: 0 };
				maskTexture.offset.y = ( 1.0 - threeMat.userData.rwx.maskAnimation.yHeight );
				maskTexture.repeat.set( 1, threeMat.userData.rwx.maskAnimation.yHeight );

			}

			maskTexture.wrapS = textureWrapping;
			maskTexture.wrapT = textureWrapping;
			maskTexture.colorSpace = textureColorSpace;

			if ( ! textureFiltering ) {

				maskTexture.minFilter = LinearMipmapNearestFilter;
				maskTexture.magFilter = NearestFilter;

			}

			threeMat.alphaMap = maskTexture;
			threeMat.needsUpdate = true;

			resolveMask( maskTexture );

		} );

	} );

}

function applyTextureToMat( threeMat, folder, textureName, textureExtension = '.jpg', maskName = null,
	maskExtension = '.zip', fflate = null, loadingPromises = [], textureColorSpace = SRGBColorSpace,
	textureWrapping = RepeatWrapping, alphaTest = defaultAlphaTest, textureFiltering = true ) {

	let loader = new TextureLoader();
	let texturePath = null;

	const res = extensionRegex.exec( textureName );

	if ( res ) {

		// If texture.jpg is requested, make sure we don't load texture.jpg.jpg

		textureExtension = '';

		if ( isAlphaExtensionRegex.test( res[ 1 ] ) ) {

			threeMat.alphaTest = alphaTest;
			threeMat.transparent = true;

		}

	}

	loadingPromises.push( new Promise( ( resolveTex ) => {

		texturePath = folder + '/' + textureName + textureExtension;

		loader.load( texturePath, ( texture ) => {

			texture.wrapS = textureWrapping;
			texture.wrapT = textureWrapping;
			texture.colorSpace = textureColorSpace;
			threeMat.map = texture;
			threeMat.needsUpdate = true;

			if ( ! textureFiltering ) {

				texture.minFilter = LinearMipmapNearestFilter;
				texture.magFilter = NearestFilter;

			}

			// If the height is nicely divisible by the width: it's an animated texture
			if ( texture.image.height !== texture.image.width && texture.image.height % texture.image.width === 0 ) {

				threeMat.userData.rwx.animation = { yTiles: texture.image.height / texture.image.width,
					yHeight: texture.image.width / texture.image.height,
					step: 0 };
				texture.offset.y = ( 1.0 - threeMat.userData.rwx.animation.yHeight );
				texture.repeat.set( 1, threeMat.userData.rwx.animation.yHeight );

			}

			resolveTex( texture );

		} );

	} ) );

	if ( maskName != null ) {

		threeMat.alphaTest = alphaTest;
		threeMat.transparent = true;

		if ( maskExtension == '.zip' && fflate != null ) {

			// We try to extract the bmp mask from the archive
			const maskBaseName = maskName;
			const zipPath = folder + '/' + maskBaseName + maskExtension;

			loadingPromises.push( new Promise( ( resolve, reject ) => {

				const zipLoader = new FileLoader();
				zipLoader.setResponseType( 'arraybuffer' );

				// We load the mask asynchronously using fflate (if available)
				zipLoader.load( zipPath, ( data ) => {

		      const zipData = fflate.unzipSync( new Uint8Array( data ) );
					let filename = null;

					// Find the bmp file within the archive, we need to be case insensitive
				  for ( const key of Object.keys( zipData ) ) {

					  if ( key.toLowerCase() == ( maskBaseName.toLowerCase() + '.bmp' ) ) {

							// Found the file
						  filename = key;
							break;

					  }

				  }

					if ( ! filename ) {

						// No .bmp mask file found within the archive: can't proceed further
						reject( new Error( `No .bmp file candidate found within '${zipPath}'` ) );

					}

					const buffer = zipData[ filename ];

					// Load the bmp image into a data uri string
				  let bmpURI = 'data:image/bmp;base64,';
				  const chunkSize = 4056;
				  let dataStr = '';

				  // Chunking the buffer to maximize browser compatibility and avoid exceeding some size limit
				  // during string creation when using 'String.fromCharCode'
				  for ( let i = 0; i < buffer.length; i += chunkSize ) {

					  dataStr = dataStr.concat( String.fromCharCode.apply( null, new Uint16Array( buffer.slice( i, i + chunkSize ) ) ) );

				  }

					bmpURI = bmpURI.concat( btoa( dataStr ) );

					makeMaskPromise( bmpURI, threeMat, loader, LinearSRGBColorSpace, textureWrapping, textureFiltering ).then( ( mask ) => {

						resolve( mask );

					} );

				}, null, ( err ) => {

					reject( err );

				} );

			} ) );

		} else if ( maskExtension != '.zip' ) {

			const bmpPath = folder + '/' + maskName + maskExtension;
			loadingPromises.push( makeMaskPromise( bmpPath, threeMat, loader, LinearSRGBColorSpace, textureWrapping, textureFiltering ) );

		}

	}

}

function makeThreeMaterial( rwxMaterial, folder, textureExtension = '.jpg', maskExtension = '.zip',
	fflate = null, useBasicMaterial = false, textureColorSpace = SRGBColorSpace, alphaTest = defaultAlphaTest ) {

	let materialDict = { name: rwxMaterial.getMatSignature() };

	if ( rwxMaterial.materialmode == MaterialMode.NULL ) {

		materialDict[ 'side' ] = FrontSide;

	} else if ( rwxMaterial.materialmode == MaterialMode.DOUBLE ) {

		materialDict[ 'side' ] = DoubleSide;

	} else if ( rwxMaterial.materialmode == MaterialMode.NONE ) {

		materialDict[ 'visible' ] = false;

	}

	if ( rwxMaterial.opacity < 1.0 ) {

		materialDict[ 'transparent' ] = true;

	}

	if ( rwxMaterial.geometrysampling < GeometrySampling.SOLID ) {

		// For the time being: we treat 'wireframe' and 'pointcloud' the same, as 'pointcloud' is not yet trivially
		// supported
		materialDict[ 'wireframe' ] = true;

	} else {

		materialDict[ 'wireframe' ] = false;

	}

	const textureFiltering = rwxMaterial.texturemodes.includes( TextureMode.FILTER );

	let textureWrapping = ClampToEdgeWrapping;

	if ( rwxMaterial.textureaddressmode == TextureAddressMode.WRAP ) {

		textureWrapping = RepeatWrapping;

	} else if ( rwxMaterial.textureaddressmode == TextureAddressMode.MIRROR ) {

		textureWrapping = MirroredRepeatWrapping;

	}

	// Missing Lit mode means we should not take the surface values into account
	const surface = rwxMaterial.texturemodes.includes( TextureMode.LIT ) ? rwxMaterial.surface : defaultSurface;

	if ( ! useBasicMaterial ) {

		if ( rwxMaterial.lightsampling == LightSampling.FACET ) {

			materialDict[ 'flatShading' ] = true;

		} else if ( rwxMaterial.lightsampling == LightSampling.VERTEX ) {

			materialDict[ 'flatShading' ] = false;

		}

		// The specular value in a Phong material is expressed using an hexadecimal value
		// holding on 3 bytes, each representing a different color channel.
		// Without any prior knowledge: we safely assume a white light instead
		const whiteSpecular = Math.trunc( surface[ 2 ] * glossRatio * 255 );
		materialDict[ 'specular' ] = ( whiteSpecular << 16 ) + ( whiteSpecular << 8 ) + whiteSpecular;

		// Same thing for the emissive value
		const whiteEmissive = Math.trunc( surface[ 1 ] );
		materialDict[ 'emissive' ] = ( whiteEmissive << 16 ) + ( whiteEmissive << 8 ) + whiteEmissive;

		materialDict[ 'shininess' ] = 30; // '30' is the demo's default Phong material shininess value

	}

	materialDict[ 'opacity' ] = rwxMaterial.opacity;

	let threeMat = useBasicMaterial ? new MeshBasicMaterial( materialDict ) : new MeshPhongMaterial( materialDict );
	threeMat.userData.rwx = { material: rwxMaterial.clone() };
	let loadingPromises = [];

	threeMat.userData.collision = rwxMaterial.collision;
	threeMat.userData.ratio = rwxMaterial.ratio;

	const brightnessRatio = Math.max( ...surface );

	if ( rwxMaterial.texture == null ) {

		threeMat.color.set( rwxMaterial.getColorHexValue() );
		threeMat.color.multiplyScalar( brightnessRatio );

	} else {

		threeMat.color.set( 0xffffff );
		threeMat.color.multiplyScalar( brightnessRatio );

		applyTextureToMat( threeMat, folder, rwxMaterial.texture, textureExtension, rwxMaterial.mask,
			maskExtension, fflate, loadingPromises, textureColorSpace, textureWrapping, alphaTest, textureFiltering );

	}

	threeMat.needsUpdate = true;

	return {
		threeMat: threeMat,
		loadingPromises: loadingPromises,
	};

}

function clearGeometry( ctx ) {

	if ( ctx.currentBufferFaceCount > 0 ) {

		commitBufferGeometryGroup( ctx );

	}

	ctx.currentBufferGeometry = new BufferGeometry();
	ctx.currentBufferVertices = [];
	ctx.currentBufferUVs = [];
	ctx.currentBufferFaces = [];

	ctx.currentBufferFaceCount = 0;
	ctx.currentBufferGroupFirstFaceID = 0;

	ctx.previousMaterialID = null;

}

function makeMeshToCurrentGroup( ctx ) {

	if ( ctx.currentBufferFaceCount > 0 ) {

		commitBufferGeometryGroup( ctx );

	}

	if ( ctx.currentBufferFaces.length > 0 ) {

		ctx.currentBufferGeometry.setAttribute( 'position', new BufferAttribute( new Float32Array( ctx.currentBufferVertices ), 3 ) );
		ctx.currentBufferGeometry.setAttribute( 'uv', new BufferAttribute( new Float32Array( ctx.currentBufferUVs ), 2 ) );
		ctx.currentBufferGeometry.setIndex( ctx.currentBufferFaces );

		ctx.currentBufferGeometry.uvsNeedUpdate = true;
		ctx.currentBufferGeometry.computeVertexNormals();

		ctx.loadingPromises = ctx.loadingPromises.concat( ctx.materialTracker.getCommitedMaterialList().map( res => res.loadingPromises ) );

		const mesh = new Mesh( ctx.currentBufferGeometry, ctx.materialTracker.getCommitedMaterialList().map( res => res.threeMat ) );

		/* Keep track of tagged materials for this mesh */
		mesh.userData.taggedMaterials = ctx.taggedMaterials;
		ctx.currentGroup.add( mesh );

		clearMaterialTag( ctx );
		clearMaterialRatio( ctx );
		ctx.taggedMaterials = {};

	}

}

function commitBufferGeometryGroup( ctx ) {

	// Make new material group out of existing data
	if ( ctx.currentBufferFaceCount ) {

		ctx.currentBufferGeometry.addGroup( ctx.currentBufferGroupFirstFaceID, ctx.currentBufferFaceCount * 3, ctx.previousMaterialID );

	}

	ctx.materialTracker.commitMaterials();

	// Set everything ready for the next group to start
	ctx.previousMaterialID = ctx.materialTracker.getCurrentMaterialID();
	ctx.currentBufferGroupFirstFaceID = ctx.currentBufferGroupFirstFaceID + ctx.currentBufferFaceCount * 3;
	ctx.currentBufferFaceCount = 0;

}

function addTriangle( ctx, a, b, c ) {

	if ( ctx.materialTracker.getCurrentMaterialID() !== ctx.previousMaterialID ) {

		commitBufferGeometryGroup( ctx );

	}

	// Add new face
	ctx.currentBufferFaceCount ++;
	ctx.currentBufferFaces.push( a, b, c );

}

function addQuad( ctx, a, b, c, d ) {

	if ( ctx.materialTracker.getCurrentMaterialID() !== ctx.previousMaterialID ) {

		commitBufferGeometryGroup( ctx );

	}

	if ( true && ctx.materialTracker.currentRWXMaterial.geometrysampling == GeometrySampling.WIREFRAME ) {

		// We need to use a whole different geometry logic to handle wireframe quads the way the AW client does:
		// by only rendering the outter edges
		const tmpBufferGeometry = new BufferGeometry();

	  tmpBufferGeometry.setAttribute( 'position', new BufferAttribute( new Float32Array( [

			ctx.currentBufferVertices[ a * 3 ], ctx.currentBufferVertices[ a * 3 + 1 ], ctx.currentBufferVertices[ a * 3 + 2 ],
			ctx.currentBufferVertices[ b * 3 ], ctx.currentBufferVertices[ b * 3 + 1 ], ctx.currentBufferVertices[ b * 3 + 2 ],
			ctx.currentBufferVertices[ c * 3 ], ctx.currentBufferVertices[ c * 3 + 1 ], ctx.currentBufferVertices[ c * 3 + 2 ],
			ctx.currentBufferVertices[ a * 3 ], ctx.currentBufferVertices[ a * 3 + 1 ], ctx.currentBufferVertices[ a * 3 + 2 ],
			ctx.currentBufferVertices[ c * 3 ], ctx.currentBufferVertices[ c * 3 + 1 ], ctx.currentBufferVertices[ c * 3 + 2 ],
			ctx.currentBufferVertices[ d * 3 ], ctx.currentBufferVertices[ d * 3 + 1 ], ctx.currentBufferVertices[ d * 3 + 2 ]

		] ), 3 ) );

		tmpBufferGeometry.computeVertexNormals();

		const lines = new LineSegments( new EdgesGeometry( tmpBufferGeometry ),
			new LineBasicMaterial( { color: ctx.materialTracker.currentRWXMaterial.getColorHexValue() } ) );

		ctx.currentGroup.add( lines );

	} else {

		// Add two new faces
		ctx.currentBufferFaceCount += 2;
		ctx.currentBufferFaces.push( a, b, c );
		ctx.currentBufferFaces.push( a, c, d );

	}

}

function addPolygon( ctx, indices ) {

	// Apparently: polygons should always behave according to the facet light sampling mode (despite being told otherwise).
	const previousLightSampling = ctx.materialTracker.currentRWXMaterial.lightsampling;
	ctx.materialTracker.currentRWXMaterial.lightsampling = LightSampling.FACET;

	if ( ctx.materialTracker.getCurrentMaterialID() !== ctx.previousMaterialID ) {

		commitBufferGeometryGroup( ctx );

	}

	const newFaces =
		triangulateFaces( ctx.currentBufferVertices, ctx.currentBufferUVs, indices, ctx.objectName, ctx.forceEarcut, ctx.verboseWarning );

	for ( let lf = 0; lf < newFaces.length; lf += 3 ) {

		const a = newFaces[ lf ];
		const b = newFaces[ lf + 1 ];
		const c = newFaces[ lf + 2 ];

		// Add new face
		ctx.currentBufferFaceCount ++;
		ctx.currentBufferFaces.push( a, b, c );

	}

	ctx.materialTracker.currentRWXMaterial.lightsampling = previousLightSampling;

}

function makeVertexCircle( h, r, n, v = null ) {

	if ( n < 3 ) {

		throw new Error( 'Need at least 3 sides to make a vertex circle' );

	}

	let positions = [];
	let uvs = [];
	let vec = new Vector3();
	const deltaRad = Math.PI * 2 / n;
	const axis = new Vector3( 0, 1, 0 );

	vec.add( new Vector3( r, 0, 0 ) );

	for ( let i = 0; i < n; i ++ ) {

		positions.push( vec.x, vec.y + h, vec.z );
		vec.applyAxisAngle( axis, deltaRad );

		if ( v === null ) {

			// No reference V value provided for UVs: assuming a circular cutout in the texture
			uvs.push( ( Math.cos( deltaRad * i ) + 1 ) / 2, ( Math.sin( deltaRad * i ) + 1 ) / 2 );

		} else {

			// V value provided: picking UVs along U axis with fixed V
			uvs.push( 1 / n * i, v );

		}

	}

	return [ positions, uvs ];

}

function addBlock( ctx, w, h, d ) {

	let bufferGeometry = new BufferGeometry();
	let material = ctx.materialTracker.getCurrentMaterial().threeMat;

	if ( material.flatShading !== undefined && ! material.flatShading ) {

		material = material.clone();
		material.flatShading = true;

	}

	// 8 vertices to make a block
	const positions = [
		- w / 2, h / 2, - d / 2,
		w / 2, h / 2, - d / 2,
		w / 2, h / 2, d / 2,
		- w / 2, h / 2, d / 2,
		- w / 2, - h / 2, - d / 2,
		w / 2, - h / 2, - d / 2,
		w / 2, - h / 2, d / 2,
		- w / 2, - h / 2, d / 2
	];

	const uvs = [
		0.0, 0.0,
		1.0, 0.0,
		1.0, 1.0,
		0.0, 1.0,
		1.0, 1.0,
		0.0, 1.0,
		0.0, 0.0,
		1.0, 0.0
	];

	bufferGeometry.setAttribute( 'position', new BufferAttribute( new Float32Array( positions ), 3 ) );
	bufferGeometry.setAttribute( 'uv', new BufferAttribute( new Float32Array( uvs ), 2 ) );

	// 6 squared faces to make a block, each made of 2 triangles (so 12 in total)
	bufferGeometry.setIndex( [ 0, 3, 1, 1, 3, 2,
	                           0, 4, 3, 3, 4, 7,
	                           3, 6, 2, 3, 7, 6,
	                           6, 7, 5, 5, 7, 4,
	                           1, 5, 0, 0, 5, 4,
	                           2, 5, 1, 6, 5, 2 ] );

	// For the sake of having every mesh with the same internal structure,
	// we create a geometry group for the material
	bufferGeometry.addGroup( 0, 36, 0 );

	bufferGeometry.uvsNeedUpdate = true;
	bufferGeometry.computeVertexNormals();

	let mesh = new Mesh( bufferGeometry, [ material ] );
	mesh.userData.taggedMaterials = {};
	mesh.applyMatrix4( ctx.currentTransform );
	ctx.currentGroup.add( mesh );

}

function addCone( ctx, h, r, nbSides ) {

	if ( nbSides < 3 ) {

		// Silently skip if the cone doesn't have enough faces on its base
		return;

	}

	let bufferGeometry = new BufferGeometry();

	let [ positions, uvs ] = makeVertexCircle( 0, r, nbSides );

	// We add the pointy top of the cone
	positions.push( 0, h, 0 );
	uvs.push( 0.5, 0.5 );
	bufferGeometry.setAttribute( 'position', new BufferAttribute( new Float32Array( positions ), 3 ) );
	bufferGeometry.setAttribute( 'uv', new BufferAttribute( new Float32Array( uvs ), 2 ) );

	let index = [];

	// We weave faces across the circle (starting from the pointy top) to make a cone
	for ( let i = 0; i < nbSides; i ++ ) {

		index.push( nbSides, i, ( i + 1 ) % nbSides );

	}

	bufferGeometry.setIndex( index );

	// For the sake of having every mesh with the same internal structure,
	// we create a geometry group for the material
	bufferGeometry.addGroup( 0, nbSides * 3, 0 );

	bufferGeometry.uvsNeedUpdate = true;
	bufferGeometry.computeVertexNormals();

	let mesh = new Mesh( bufferGeometry, [ ctx.materialTracker.getCurrentMaterial().threeMat ] );
	mesh.userData.taggedMaterials = {};
	mesh.applyMatrix4( ctx.currentTransform );
	ctx.currentGroup.add( mesh );

}

function addCylinder( ctx, h, br, tr, nbSides ) {

	if ( nbSides < 3 ) {

		// Silently skip if the cylinder doesn't have enough faces on its base
		return;

	}

	// Bottom vertex circle
	let [ positions, uvs ] = makeVertexCircle( 0, br, nbSides, 1.0 );

	const topData = makeVertexCircle( h, tr, nbSides, 0.0 );

	// Top vertex circle
	positions.push( ...topData[ 0 ] );
	uvs.push( ...topData[ 1 ] );

	let bufferGeometry = new BufferGeometry();
	bufferGeometry.setAttribute( 'position', new BufferAttribute( new Float32Array( positions ), 3 ) );
	bufferGeometry.setAttribute( 'uv', new BufferAttribute( new Float32Array( uvs ), 2 ) );

	const firstTopID = nbSides;
	let index = [];

	// We weave faces across both circles (up and down) to make a cylinder
	for ( let i = 0; i < nbSides; i ++ ) {

		index.push( firstTopID + i, i, ( i + 1 ) % nbSides );
		index.push( firstTopID + i, ( i + 1 ) % nbSides, firstTopID + ( ( i + 1 ) % nbSides ) );

	}

	bufferGeometry.setIndex( index );

	// For the sake of having every mesh with the same internal structure,
	// we create a geometry group for the material
	bufferGeometry.addGroup( 0, nbSides * 6, 0 );

	bufferGeometry.uvsNeedUpdate = true;
	bufferGeometry.computeVertexNormals();

	let mesh = new Mesh( bufferGeometry, [ ctx.materialTracker.getCurrentMaterial().threeMat ] );
	mesh.userData.taggedMaterials = {};
	mesh.applyMatrix4( ctx.currentTransform );
	ctx.currentGroup.add( mesh );

}

function addDisc( ctx, h, r, nbSides ) {

	if ( nbSides < 3 ) {

		// Silently skip if the disc doesn't have enough faces on its base
		return;

	}

	let bufferGeometry = new BufferGeometry();

	let [ positions, uvs ] = makeVertexCircle( h, r, nbSides );
	bufferGeometry.setAttribute( 'position', new BufferAttribute( new Float32Array( positions ), 3 ) );
	bufferGeometry.setAttribute( 'uv', new BufferAttribute( new Float32Array( uvs ), 2 ) );

	let index = [];

	// We weave faces across all the circle (always using the first point) to make a disc
	for ( let i = 1; i < nbSides; i ++ ) {

		index.push( 0, i, ( i + 1 ) % nbSides );

	}

	bufferGeometry.setIndex( index );

	// For the sake of having every mesh with the same internal structure,
	// we create a geometry group for the material
	bufferGeometry.addGroup( 0, nbSides * 3, 0 );

	bufferGeometry.uvsNeedUpdate = true;
	bufferGeometry.computeVertexNormals();

	let mesh = new Mesh( bufferGeometry, [ ctx.materialTracker.getCurrentMaterial().threeMat ] );
	mesh.applyMatrix4( ctx.currentTransform );
	mesh.userData.taggedMaterials = {};
	ctx.currentGroup.add( mesh );

}

function addHemisphere( ctx, r, n ) {

	if ( n < 2 ) {

		// Silently skip if the hemisphere doesn't have enough density
		return;

	}

	const nbSides = n * 4;
	const nbSegments = n;
	const deltaRad = Math.PI / ( nbSegments * 2 );

	// Bottom vertex circle
	let [ positions, uvs ] = makeVertexCircle( 0, r, nbSides, 1.0 );

	let previousLevelID = 0;
	let currentLevelID = 0;

	let index = [];

	// Now that we have the base of the hemisphere: we build up from there to the top
	for ( let h = 1; h < nbSegments; h ++ ) {

		currentLevelID = previousLevelID + nbSides;
		const nH = Math.sin( deltaRad * h );
		const levelData = makeVertexCircle( nH * r, Math.cos( deltaRad * h ) * r, nbSides, nH );

		positions.push( ...levelData[ 0 ] );
		uvs.push( ...levelData[ 1 ] );

		// We weave faces across both circles (up and down) to make a cylinder
		for ( let i = 0; i < nbSides; i ++ ) {

			index.push( currentLevelID + i, previousLevelID + i, previousLevelID + ( ( i + 1 ) % nbSides ),
				currentLevelID + i, previousLevelID + ( ( i + 1 ) % nbSides ),
				currentLevelID + ( ( i + 1 ) % nbSides ) );

		}

		previousLevelID = currentLevelID;

	}

	// We add the pointy top of the hemisphere
	positions.push( 0, r, 0 );
	uvs.push( 0.5, 0.0 );

	const topID = positions.length / 3 - 1;

	// We weave faces across the circle (starting from the pointy top) to make a cone
	for ( let i = 0; i < nbSides; i ++ ) {

		index.push( topID, previousLevelID + i, previousLevelID + ( ( i + 1 ) % nbSides ) );

	}

	let bufferGeometry = new BufferGeometry();
	bufferGeometry.setAttribute( 'position', new BufferAttribute( new Float32Array( positions ), 3 ) );
	bufferGeometry.setAttribute( 'uv', new BufferAttribute( new Float32Array( uvs ), 2 ) );
	bufferGeometry.setIndex( index );

	// For the sake of having every mesh with the same internal structure,
	// we create a geometry group for the material
	bufferGeometry.addGroup( 0, bufferGeometry.getIndex().count, 0 );

	bufferGeometry.uvsNeedUpdate = true;
	bufferGeometry.computeVertexNormals();

	let mesh = new Mesh( bufferGeometry, [ ctx.materialTracker.getCurrentMaterial().threeMat ] );
	mesh.userData.taggedMaterials = {};
	mesh.applyMatrix4( ctx.currentTransform );
	ctx.currentGroup.add( mesh );

}

function addSphere( ctx, r, n ) {

	if ( n < 2 ) {

		// Silently skip if the sphere doesn't have enough density
		return;

	}

	const nbSides = n * 4;
	const nbSegments = n;
	const deltaRad = Math.PI / ( nbSegments * 2 );

	// We add the pointy bottom of the sphere
	const positions = [ 0, - r, 0 ];
	const uvs = [ 0.5, 0.0 ];

	// Bottom vertex circle (above pointy bottom)
	let h = - nbSegments + 1;
	const nH = Math.sin( deltaRad * h );
	let levelData = makeVertexCircle( nH * r, Math.cos( deltaRad * h ) * r, nbSides, nH );
	positions.push( ...levelData[ 0 ] );
	uvs.push( ...levelData[ 1 ] );

	let previousLevelID = 0;
	let currentLevelID = 1;

	const index = [];

	// We weave faces across the circle (starting from the pointy bottom) to make a cone
	for ( let i = 0; i < nbSides; i ++ ) {

		index.push( previousLevelID, currentLevelID + ( i + 1 ) % nbSides, currentLevelID + i );

	}

	previousLevelID = currentLevelID;

	// Now that we have the base of the sphere: we build up from there to the top
	for ( h ++; h < nbSegments; h ++ ) {

		currentLevelID = previousLevelID + nbSides;
		const nH = Math.sin( deltaRad * h );
		levelData = makeVertexCircle( nH * r, Math.cos( deltaRad * h ) * r, nbSides, nH );

		positions.push( ...levelData[ 0 ] );
		uvs.push( ...levelData[ 1 ] );

		// We weave faces across both circles (up and down) to make a cylinder
		for ( let i = 0; i < nbSides; i ++ ) {

			index.push( currentLevelID + i, previousLevelID + i, previousLevelID + ( ( i + 1 ) % nbSides ),
				currentLevelID + i, previousLevelID + ( ( i + 1 ) % nbSides ),
				currentLevelID + ( ( i + 1 ) % nbSides ) );

		}

		previousLevelID = currentLevelID;

	}

	// We add the pointy top of the sphere
	positions.push( 0, r, 0 );
	uvs.push( 0.5, 0.0 );

	currentLevelID += nbSides;

	// We weave faces across the circle (starting from the pointy top) to make a cone
	for ( let i = 0; i < nbSides; i ++ ) {

		index.push( currentLevelID, previousLevelID + i, previousLevelID + ( ( i + 1 ) % nbSides ) );

	}

	let bufferGeometry = new BufferGeometry();
	bufferGeometry.setAttribute( 'position', new BufferAttribute( new Float32Array( positions ), 3 ) );
	bufferGeometry.setAttribute( 'uv', new BufferAttribute( new Float32Array( uvs ), 2 ) );
	bufferGeometry.setIndex( index );

	// For the sake of having every mesh with the same internal structure,
	// we create a geometry group for the material
	bufferGeometry.addGroup( 0, bufferGeometry.getIndex().count, 0 );

	bufferGeometry.uvsNeedUpdate = true;
	bufferGeometry.computeVertexNormals();

	let mesh = new Mesh( bufferGeometry, [ ctx.materialTracker.getCurrentMaterial().threeMat ] );
	mesh.userData.taggedMaterials = {};
	mesh.applyMatrix4( ctx.currentTransform );
	ctx.currentGroup.add( mesh );

}

function pushCurrentGroup( ctx ) {

	let group = new Group();
	group.userData.rwx = {};

	group.applyMatrix4( ctx.currentTransform );
	ctx.currentGroup.add( group );
	ctx.currentGroup = group;
	ctx.currentTransform = new Matrix4();

}

function popCurrentGroup( ctx ) {

	ctx.currentTransform = ctx.currentGroup.matrix.clone();
	ctx.currentGroup = ctx.currentGroup.parent;

}

function pushCurrentMaterial( ctx ) {

	ctx.materialStack.push( ctx.materialTracker.currentRWXMaterial );
	ctx.materialTracker.currentRWXMaterial = ctx.materialTracker.currentRWXMaterial.clone();
	ctx.materialTracker.clearCurrentMaterialList( ctx.materialTracker.currentRWXMaterial );

}

function popCurrentMaterial( ctx ) {

	ctx.materialTracker.currentRWXMaterial = ctx.materialStack.pop();
	ctx.materialTracker.clearCurrentMaterialList( ctx.materialTracker.currentRWXMaterial );

}

function saveCurrentTransform( ctx ) {

	ctx.transformSaves.push( ctx.currentTransform.clone() );

}

function loadCurrentTransform( ctx ) {

	if ( ctx.transformSaves.length > 0 ) {

		ctx.currentTransform = ctx.transformSaves.pop();

	} else {

		ctx.currentTransform = new Matrix4();

	}

}

function commitMaterialTag( ctx, tag ) {

	ctx.materialTracker.currentRWXMaterial.tag = tag;

	if ( ctx.taggedMaterials[ tag.toString() ] === undefined ) {

		// If there is no material under that tag yet, we need to initiliaze the entry
		// with an empty array
		ctx.taggedMaterials[ tag.toString() ] = [];

	}

	// We need to keep track of the position of the tagged material within the material list
	// held by the mesh, we don't have said mesh yet but we already know the position from which
	// the material will be accessible, thanks to the material manager, see makeMeshToCurrentGroup(...)
	// to see how said mesh is finally defined
	if ( ! ctx.taggedMaterials[ tag.toString() ].includes( ctx.materialTracker.getCurrentMaterialID() ) ) {

		ctx.taggedMaterials[ tag.toString() ].push( ctx.materialTracker.getCurrentMaterialID() );

	}

}

function clearMaterialTag( ctx ) {

	ctx.materialTracker.currentRWXMaterial.tag = 0;

}

function setMaterialRatio( ctx, a, b, c, d = null ) {

	// The point here is to evaluate the aspect ratio of the surface to write a sign on,
	// we first need to list all the information we will need: vertex positions an UVs.
	const aPos = new Vector3( ctx.currentBufferVertices[ a * 3 ],
		ctx.currentBufferVertices[ a * 3 + 1 ],
		ctx.currentBufferVertices[ a * 3 + 2 ] );
	const bPos = new Vector3( ctx.currentBufferVertices[ b * 3 ],
		ctx.currentBufferVertices[ b * 3 + 1 ],
		ctx.currentBufferVertices[ b * 3 + 2 ] );
	const cPos = new Vector3( ctx.currentBufferVertices[ c * 3 ],
		ctx.currentBufferVertices[ c * 3 + 1 ],
		ctx.currentBufferVertices[ c * 3 + 2 ] );
	const aUV = new Vector2( ctx.currentBufferUVs[ a * 2 ],
		ctx.currentBufferUVs[ a * 2 + 1 ] );
	const bUV = new Vector2( ctx.currentBufferUVs[ b * 2 ],
		ctx.currentBufferUVs[ b * 2 + 1 ] );
	const cUV = new Vector2( ctx.currentBufferUVs[ c * 2 ],
		ctx.currentBufferUVs[ c * 2 + 1 ] );

	// From there: we compute useful UV boundaries to better evaluate the dimensions later.
	const maxU = Math.max( aUV.x, bUV.x, cUV.x );
	const maxV = Math.max( aUV.y, bUV.y, cUV.y );
	const minU = Math.min( aUV.x, bUV.x, cUV.x );
	const minV = Math.min( aUV.y, bUV.y, cUV.y );
	const midU = ( maxU + minU ) / 2;
	const scaleU = 1 / ( maxU - minU );
	const scaleV = 1 / ( maxV - minV );

	// We work under the assumption that the triangle we are dealing with has a straight angle,
	// but also that the UVs are reasonably aligned with it.
	// We first assume that the edge (a) <--> (b) is the hypotenuse and c is said straight angle.
	// By virtue of having a straight angle: the longest edge of the triangle cannot be anything
	// else than the hypotenuse, so we know how to correct ourselves if need be.
	let width = 1;
	let height = 1;
	let straightAngleVertex = cPos;
	let straightAngleUV = cUV;
	let hypEnds = [ aPos, bPos ];
	let hypEndUVs = [ aUV, bUV ];
	let sqrdHyp = aPos.distanceToSquared( bPos );
	const acSqrdHyp = aPos.distanceToSquared( cPos );
	const bcSqrdHyp = bPos.distanceToSquared( cPos );

	// If (a) <--> (c) is longer than (a) <--> (b): the latter is no longer our best guest,
	// for the hypotenuse, so (a) <--> (c) is now considered to be the hypotenuse and (b) is the
	// new straight angle.
	if ( acSqrdHyp > sqrdHyp ) {

		sqrdHyp = acSqrdHyp;
		straightAngleVertex = bPos;
		hypEnds = [ aPos, cPos ];
		straightAngleUV = bUV;
		hypEndUVs = [ aUV, cUV ];

	}

	// If (b) <--> (c) is longer than (a) <--> (c): the latter is no longer our best guest,
	// for the hypotenuse, so (b) <--> (c) is now considered to be the hypotenuse and (a) is the
	// new straight angle.
	if ( bcSqrdHyp > sqrdHyp ) {

		sqrdHyp = bcSqrdHyp;
		straightAngleVertex = aPos;
		hypEnds = [ bPos, cPos ];
		straightAngleUV = aUV;
		hypEndUVs = [ bUV, cUV ];

	}

	// At this stage: we have a better idea of what the triangle looks like, but we still
	// need to determine how flipped it is in regards to the UV canvas.
	// We can determine which other vertices to use respectively for width and height by peeking at
	// the UV coordinates of one of them, the trick is that a vertex here can only be the furthest
	// away on U (width) or the furthest away on V (height) but not both at the same time.
	if ( straightAngleUV.x < midU ) {

		// Straight angle is on the left side
		if ( hypEndUVs[ 0 ].x > midU ) {

			// First end of the hypotenuse gives the width as it holds the furthest U value,
			// the other end gives the height as it (by deduction) holds the furthest V value
			width = straightAngleVertex.distanceTo( hypEnds[ 0 ] );
			height = straightAngleVertex.distanceTo( hypEnds[ 1 ] );

		} else {

			// The other way around here
			width = straightAngleVertex.distanceTo( hypEnds[ 1 ] );
			height = straightAngleVertex.distanceTo( hypEnds[ 0 ] );

		}

	}

	if ( straightAngleUV.x > midU ) {

		// Straight angle is on the right side
		if ( hypEndUVs[ 0 ].x < midU ) {

			width = straightAngleVertex.distanceTo( hypEnds[ 0 ] );
			height = straightAngleVertex.distanceTo( hypEnds[ 1 ] );

		} else {

			width = straightAngleVertex.distanceTo( hypEnds[ 1 ] );
			height = straightAngleVertex.distanceTo( hypEnds[ 0 ] );

		}

	}

	// The width and height values still need to be scaled to match the full UV canvas size
	const ratio = ( width * scaleU ) / ( height * scaleV );
	ctx.materialTracker.currentRWXMaterial.ratio = ratio;

	// To avoid generating multiple (unmatching) materials in case the ratios we get accross
	// quads/triangles of a single surface were to differ: we check if a previous ratio was
	// hinted at us, if it falls relatively close to the newly computed ratio: we take the
	// hint instead.
	if ( d === null ) {

		if ( ctx.triangleRatioHint === null ) {

			ctx.triangleRatioHint = ratio;

		} else {

			ctx.materialTracker.currentRWXMaterial.ratio = ctx.triangleRatioHint;

		}

	} else {

		if ( ctx.quadRatioHint === null ) {

			ctx.quadRatioHint = ratio;

		} else {

			ctx.materialTracker.currentRWXMaterial.ratio = ctx.quadRatioHint;

		}

	}

}

function clearMaterialRatio( ctx ) {

	ctx.materialTracker.currentRWXMaterial.ratio = 1.0;

}

// Utility function to merge all group and subgroup geometries into on single buffer, all while taking materials into account
function mergeGeometryRecursive( group, ctx, transform = group.matrix ) {

	group.children.forEach( ( child ) => {

		let localTransform = new Matrix4();
		localTransform.copy( transform );
		localTransform.multiply( child.matrix );

		if ( child instanceof Mesh && ctx.meshFilter( child ) ) {

			// We first need to set up the new BufferGeometry groups
			let geometryGroups = [];
			const geometryIndices = child.geometry.getIndex().array;

			if ( typeof child.material[ Symbol.iterator ] === 'function' ) {

				// There's likely multiple materials to deal with, so we fetch the original geometry groups
				child.geometry.groups.forEach( ( g ) => {

					// Each group in the original geometry from the child needs to be exported,
					// we take into account the already-registered geometry and materials
					// from the context, so that we can compute offsets and match the
					// final layout of the mesh (and final material IDs as well)
					geometryGroups.push( {

						start: g.start + ctx.indices.length,
						count: g.count,
						materialIndex: g.materialIndex + ctx.materials.length

					} );

				} );

				// Adjust user data for tagged materials, all indices must also be offset
				const taggedMaterials = child.userData.taggedMaterials;

				if ( taggedMaterials !== undefined ) {

					for ( const [ tag, ids ] of Object.entries( taggedMaterials ) ) {

						if ( ctx.taggedMaterials[ tag ] === undefined ) {

							ctx.taggedMaterials[ tag ] = [];

						}

						ids.forEach( ( id ) => {

							ctx.taggedMaterials[ tag ].push( id + ctx.materials.length );

						} );

					}

				}

				// Add the materials from the child to the final material list
				ctx.materials.push( ...child.material );

			} else {

				// There's only one single material, but it will still need its own geometry group
				// in the final mesh
				geometryGroups.push( {

					start: ctx.indices.length,
					count: geometryIndices.length,
					materialIndex: ctx.materials.length

				} );

				ctx.materials.push( child.material );

			}

			const originalVertices = child.geometry.getAttribute( 'position' ).array;
			const vertexOffset = ctx.positions.length / 3;

			// Import the current geometry (vertices and faces) from the child into the final buffer,
			// apply local transformations if any
			let i = 0;
			for ( let l = originalVertices.length / 3; i < l; i ++ ) {

				let tmpVertex = new Vector4( originalVertices[ i * 3 ], originalVertices[ i * 3 + 1 ], originalVertices[ i * 3 + 2 ] );
				tmpVertex.applyMatrix4( localTransform );

				ctx.positions.push( tmpVertex.x );
				ctx.positions.push( tmpVertex.y );
				ctx.positions.push( tmpVertex.z );

			}

			// Do not forget the UVs either
			if ( child.geometry.getAttribute( 'uv' ) === undefined ) {

				const uvs = new Array( i * 2 ).fill( 0.0 );
				ctx.uvs.push( ...uvs );

			} else {

				ctx.uvs.push( ...child.geometry.getAttribute( 'uv' ).array );

			}

			ctx.indices.push( ...geometryIndices.map( ( value ) => {

				return value + vertexOffset;

			} ) );

			// Since the new BufferGeometry groups are all set, we can import them into the
			// final buffer geometry
			geometryGroups.forEach( ( g ) => {

				ctx.bufferGeometry.addGroup( g.start, g.count, g.materialIndex );

			} );

		} else if ( child instanceof Group ) {

			/* Recursive case */
			mergeGeometryRecursive( child, ctx, localTransform );

		}

	} );

}

function flattenGroup( group, filter = () => true ) {

	let ctx = {

		bufferGeometry: new BufferGeometry(),
		positions: [],
		uvs: [],
		indices: [],
		materials: [],
		taggedMaterials: {},
		meshFilter: filter

	};

	mergeGeometryRecursive( group, ctx );

	/* Ready data for final BufferGeometry */
	ctx.bufferGeometry.setAttribute( 'position', new BufferAttribute( new Float32Array( ctx.positions ), 3 ) );
	ctx.bufferGeometry.setAttribute( 'uv', new BufferAttribute( new Float32Array( ctx.uvs ), 2 ) );
	ctx.bufferGeometry.setIndex( ctx.indices );
	ctx.bufferGeometry.uvsNeedUpdate = true;
	ctx.bufferGeometry.computeVertexNormals();

	let finalMesh = new Mesh( ctx.bufferGeometry, ctx.materials );

	finalMesh.userData.rwx = group.userData.rwx;
	finalMesh.userData.taggedMaterials = ctx.taggedMaterials;

	return finalMesh;

}

class RWXMaterial {

	constructor() {

	  // Material related properties start here
		this.color = [ 0.0, 0.0, 0.0 ]; // Red, Green, Blue
		this.surface = defaultSurface.slice( 0, 3 );
		this.opacity = 1.0;
		this.lightsampling = LightSampling.FACET;
		this.geometrysampling = GeometrySampling.SOLID;
		this.texturemodes = [
			TextureMode.LIT,
			TextureMode.FORESHORTEN,
			TextureMode.FILTER,
		]; // There's possibly more than one mode enabled at a time (hence why we use an array)
		this.materialmode = MaterialMode.NULL; // Neither NONE nor DOUBLE: we only render one side of the polygon
		this.texture = null;
		this.mask = null;
		this.textureaddressmode = TextureAddressMode.WRAP;
		this.collision = true;
		// End of material related properties

		this.tag = 0;
		this.ratio = 1.0;

	}

	// Make a deep copy of the RWX material instance
	clone() {

		let cloned = Object.assign( Object.create( Object.getPrototypeOf( this ) ),
			this );

		cloned.color = [ ...this.color ];
		cloned.surface = [ ...this.surface ];
		cloned.texturemodes = [ ...this.texturemodes ];

		return cloned;

	}

	getColorHexValue() {

		return ( Math.trunc( this.color[ 0 ] * 255 ) << 16 ) + ( Math.trunc( this
			.color[ 1 ] * 255 ) << 8 ) + Math.trunc( this.color[ 2 ] * 255 );

	}

	getMatSignature() {

		const color = this.color[ 0 ].toFixed( 3 ) + this.color[ 1 ].toFixed( 3 ) + this.color[ 2 ].toFixed( 3 );
		const surface = this.surface[ 0 ].toFixed( 3 ) + this.surface[ 1 ].toFixed( 3 ) + this.surface[ 2 ].toFixed( 3 );
		const opacity = this.opacity.toFixed( 3 );
		const lightSampling = this.lightsampling.toString();
		const geometrySampling = this.geometrysampling.toString();
		let textureMode = '';

		this.texturemodes.forEach( ( tm ) => {

			textureMode += tm.toString();

		} );

		const materialMode = this.materialmode.toString();
		const texture = this.texture === null ? '' : this.texture;
		const mask = this.mask === null ? '' : this.mask;
		const textureAddressMode = this.textureaddressmode.toString();

		const collision = this.collision.toString();

		const tag = this.tag.toString();
		const ratio = this.ratio.toFixed( 2 );

		return `${color}_${surface}_${opacity}_${lightSampling}_${geometrySampling}_${textureMode}_${materialMode}` +
			`_${texture}_${mask}_${textureAddressMode}_${collision}_${tag}_${ratio}`;

	}

}

// Take RWXMaterials as input, convert them to three.js materials
class RWXMaterialManager {

	constructor( folder, textureExtension = '.jpg', maskExtension =
	'.zip', fflate = null, useBasicMaterial = false,
	textureColorSpace = SRGBColorSpace, alphaTest = defaultAlphaTest ) {

		this.threeMaterialMap = new Map();

		this.folder = folder;
		this.textureExtension = textureExtension;
		this.maskExtension = maskExtension;
		this.fflate = fflate;
		this.useBasicMaterial = useBasicMaterial;
		this.textureColorSpace = textureColorSpace;
		this.alphaTest = alphaTest;

	}

	addRWXMaterial( newRWXMaterial, signature = null ) {

		// If no custom signature is provided: we use the one from the material itself
		const finalSignature = signature || newRWXMaterial.getMatSignature();

		const threeMaterial = makeThreeMaterial( newRWXMaterial,
			this.folder, this.textureExtension, this.maskExtension, this.fflate,
			this.useBasicMaterial, this.textureColorSpace, this.alphaTest );
		threeMaterial.signature = finalSignature;

		this.threeMaterialMap.set( finalSignature, threeMaterial );

	}

	hasThreeMaterialPack( signature ) {

		return this.threeMaterialMap.has( signature );

	}

	getThreeMaterialPack( signature ) {

		return this.threeMaterialMap.get( signature );

	}

	removeThreeMaterialPack( signature ) {

		this.threeMaterialMap.delete( signature );

	}

	clear() {

		this.threeMaterialMap.clear();

	}

	texturesNextFrame() {

		for ( const entry of this.threeMaterialMap ) {

			const animation = entry[ 1 ].threeMat.userData.rwx.animation;
			const maskAnimation = entry[ 1 ].threeMat.userData.rwx.maskAnimation;

			if ( animation !== undefined ) {

				animation.step = ( animation.step + 1 ) % animation.yTiles;
				entry[ 1 ].threeMat.map.offset.y = ( 1.0 - animation.yHeight ) - animation.step * animation.yHeight;
				entry[ 1 ].threeMat.needsUpdate = true;

			}

			if ( maskAnimation !== undefined ) {

				maskAnimation.step = ( maskAnimation.step + 1 ) % maskAnimation.yTiles;
				entry[ 1 ].threeMat.alphaMap.offset.y = ( 1.0 - maskAnimation.yHeight ) - maskAnimation.step * maskAnimation.yHeight;
				entry[ 1 ].threeMat.needsUpdate = true;

			}

		}

	}

}

// Keep track of the materials used in a single object, take care of context changes from mesh to mesh
class RWXMaterialTracker {

	constructor( manager ) {

		this.manager = manager;

		this.currentRWXMaterial = new RWXMaterial();
		this.currentMaterialID = null;
		this.currentMaterialList = [];
		this.signatureMap = new Map();
		this.commitedMaterialsAmount = 0;
		this.currentMaterialSignature = '';

	}

	getCurrentMaterialID() {

		const materialSignature = this.currentRWXMaterial.getMatSignature();

		// Check if this material doesn't already sit in the current list, if it does: we just return its index
		if ( this.signatureMap.has( materialSignature ) ) {

			this.currentMaterialSignature = materialSignature;
			return this.signatureMap.get( materialSignature );

		}

		// This gets called when the material is actually required by (at least) one face,
		// meaning we need to save the material in the map if it's not already done
		if ( ! this.manager.hasThreeMaterialPack( materialSignature ) ) {

			this.manager.addRWXMaterial( this.currentRWXMaterial, materialSignature );

		}

		if ( this.currentMaterialSignature != materialSignature ) {

			this.currentMaterialSignature = materialSignature;

			// We're onto a new material given the current list, we need to add it to the list and increment the ID
			if ( this.currentMaterialID === null ) {

				this.currentMaterialID = 0;

			} else {

				this.currentMaterialID ++;

			}

			this.signatureMap.set( materialSignature, this.currentMaterialID );
			this.currentMaterialList.push( this.manager.getThreeMaterialPack( materialSignature ) );

		}

		return this.currentMaterialID;

	}

	getCurrentMaterial() {

		  return this.currentMaterialList[ this.getCurrentMaterialID() ];

	}

	getCurrentMaterialList() {

		return this.currentMaterialList;

	}

	clearCurrentMaterialList( currentMat = new RWXMaterial() ) {

		this.currentMaterialID = null;
		this.currentMaterialList = [];
		this.signatureMap.clear();
		this.currentMaterialSignature = '';
		this.currentRWXMaterial = currentMat;
		this.commitedMaterialsAmount = 0;

	}

	commitMaterials() {

		this.commitedMaterialsAmount = this.currentMaterialList.length;

	}

	getCommitedMaterialList() {

		return this.currentMaterialList.slice( 0, this.commitedMaterialsAmount );

	}

}

class RWXLoader extends Loader {

	constructor( manager ) {

		super( manager );

		this.integerRegex = /([-+]?[0-9]+)/g;
		this.floatRegex = /([+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][-+][0-9]+)?)/g;
		this.nonCommentRegex = /^(.*)#(?!\!)/g;
		this.clumpbeginRegex = /^ *(clumpbegin).*$/i;
		this.clumpendRegex = /^ *(clumpend).*$/i;
		this.transformbeginRegex = /^ *(transformbegin).*$/i;
		this.transformendRegex = /^ *(transformend).*$/i;
		this.protobeginRegex = /^ *(protobegin) +([A-Za-z0-9_\-\.]+).*$/i;
		this.protoinstanceRegex = /^ *(protoinstance) +([A-Za-z0-9_\-\.]+).*$/i;
		this.protoendRegex = /^ *(protoend).*$/i;
		this.vertexRegex = /^ *(vertex|vertexext)(( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)(e[-+][0-9]+)?){3}) *(uv(( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)(e[-+][0-9]+)?){2}))?.*$/i;
		this.polygonRegex = /^ *(polygon|polygonext)( +[0-9]+)(( +[0-9]+)+)( +tag +([0-9]+))?.*$/i;
		this.quadRegex = /^ *(quad|quadext)(( +([0-9]+)){4})( +tag +([0-9]+))?.*$/i;
		this.triangleRegex = /^ *(triangle|triangleext)(( +([0-9]+)){3})( +tag +([0-9]+))?.*$/i;
		this.textureRegex = /^ *(texture) +([A-Za-z0-9_\-]+)*(\.[A-Za-z]+)? *(mask *([A-Za-z0-9_\-]+))?.*$/i;
		this.colorRegex = /^ *(color)(( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)(e[-+][0-9]+)?){3}).*$/i;
		this.opacityRegex = /^ *(opacity)( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)(e[-+][0-9]+)?).*$/i;
		this.identityRegex = /^ *(identity) *$/i;
		this.transformRegex = /^ *(transform)(( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)(e[-+][0-9]+)?){16}).*$/i;
		this.translateRegex = /^ *(translate)(( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)(e[-+][0-9]+)?){3}).*$/i;
		this.scaleRegex = /^ *(scale)(( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)(e[-+][0-9]+)?){3}).*$/i;
		this.rotateRegex = /^ *(rotate)(( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)(e[-+][0-9]+)?){4})$/i;
		this.surfaceRegex = /^ *(surface)(( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)(e[-+][0-9]+)?){3}).*$/i;
		this.ambientRegex = /^ *(ambient)( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)(e[-+][0-9]+)?).*$/i;
		this.diffuseRegex = /^ *(diffuse)( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)(e[-+][0-9]+)?).*$/i;
		this.specularRegex = /^ *(specular)( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)(e[-+][0-9]+)?).*$/i;
		this.materialModeRegex = /^ *((add)?materialmode(s)?) +([A-Za-z0-9_\-]+).*$/i;
		this.collisionRegex = /^ *(collision) +(on|off).*$/i;
		this.lightsamplingRegex = /^ *(lightsampling) +(facet|vertex).*$/i;
		this.geometrysamplingRegex = /^ *(geometrysampling) +(pointcloud|wireframe|solid).*$/i;
		this.texturemodesRegex = /^ *(texturemode(s)?)(( +null)|( +lit| +foreshorten| +filter)+).*$/i;
		this.addtexturemodeRegex = /^ *(addtexturemode)( +lit| +foreshorten| +filter).*$/i;
		this.removetexturemodeRegex = /^ *(removetexturemode)( +lit| +foreshorten| +filter).*$/i;
		this.textureaddressmodeRegex = /^ *(#\!)? *(textureaddressmode) +(wrap|mirror|clamp).*$/i;
		this.axisalignmentRegex = /^ *(axisalignment) +(none|zorientx|zorienty|xyz).*$/i;
		this.blockRegex = /^ *(block)(( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)(e[-+][0-9]+)?){3}).*$/i;
		this.coneRegex = /^ *(cone)(( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)(e[-+][0-9]+)?){2}( +[-+]?[0-9]+)).*$/i;
		this.cylinderRegex = /^ *(cylinder)(( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)(e[-+][0-9]+)?){3}( +[-+]?[0-9]+)).*$/i;
		this.discRegex = /^ *(disc)(( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)(e[-+][0-9]+)?){2}( +[-+]?[0-9]+)).*$/i;
		this.hemisphereRegex = /^ *(hemisphere)(( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)(e[-+][0-9]+)?)( +[-+]?[0-9]+)).*$/i;
		this.sphereRegex = /^ *(sphere)(( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)(e[-+][0-9]+)?)( +[-+]?[0-9]+)).*$/i;
		this.tagRegex = /^ *(tag)( +[-+]?[0-9]+).*$/i;

		this.fflate = null;
		this.textureExtension = '.jpg';
		this.maskExtension = '.zip';

		this.waitFullLoad = false;
		this.flatten = false;
		this.useBasicMaterial = false;
		this.rwxMaterialManager = null;
		this.textureColorSpace = SRGBColorSpace;
		this.enableTextures = true;
		this.forceEarcut = false;
		this.verboseWarning = false;
		this.alphaTest = defaultAlphaTest;
		this.forceTextureFiltering = true;

	}

	// Provide fflate module to the loader, required for proper texture masks handling
	setFflate( fflate ) {

		this.fflate = fflate;

		return this;

	}

	// Set the expected texture files extension, '.jpg' by default
	setTextureExtension( textureExtension ) {

		this.textureExtension = textureExtension;

		return this;

	}

	// Set the expected texture mask files extension, '.zip' by default
	setMaskExtension( maskExtension ) {

		this.maskExtension = maskExtension;

		return this;

	}

	// Whether or not to wait for full loading before returning the objet, textures are loaded asynchronously by default,
	// set this to 'true' for the loader to only return the object once it's fully loaded
	setWaitFullLoad( waitFullLoad ) {

		this.waitFullLoad = waitFullLoad;

		return this;

	}

	// Whether or not to flatten the objet, the object will consist of nested groups by default,
	// set this to 'true' to get a single mesh holding everything
	setFlatten( flatten ) {

		this.flatten = flatten;

		return this;

	}

	// Whether or not to use MeshBasicMaterial instead of MeshPhongMaterial
	setUseBasicMaterial( useBasicMaterial ) {

		this.useBasicMaterial = useBasicMaterial;

		return this;

	}

	// Set a custom RWXMaterialManager to be used by the loader, one will be internally instanciated by default
	// if none is provided
	setRWXMaterialManager( rwxMgr ) {

		this.rwxMaterialManager = rwxMgr;

		return this;

	}

	// Set the texture color space used for textures loaded for materials (default is SRGBColorSpace)
	setTextureColorSpace( textureColorSpace ) {

		this.textureColorSpace = textureColorSpace;

		return this;

	}

	// Enable textures (and masks) to be loaded, 'true' by default
	setEnableTextures( enableTextures ) {

		this.enableTextures = enableTextures;

		return this;

	}

	// Always force Earcut to be used when doing polygon triangulation (instead of poly2tri/Delaunay) for faster (but uglier) results,
	// 'false' by default
	setForceEarcut( forceEarcut ) {

		this.forceEarcut = forceEarcut;

		return this;

	}

	// Enable verbose warning logs for various non-critical mishaps, 'false' by default
	setVerboseWarning( verboseWarning ) {

		this.verboseWarning = verboseWarning;

		return this;

	}

	// Set the threshold value to use for texture transparency testing (between 0 and 1), 0.2 by default
	setAlphaTest( alphaTest ) {

		this.alphaTest = alphaTest;

		return this;

	}

	// Whether or not to force texture filtering regardless of texture modes, 'true' by default, meaning: all materials
	// will display their textures in a "fancy" way
	setForceTextureFiltering( forceTextureFiltering ) {

		this.forceTextureFiltering = forceTextureFiltering;

		return this;

	}

	load( rwxFile, onLoad, onProgress, onError ) {

		let scope = this;
		let path = this.path;
		let resourcePath = this.resourcePath;

		let loader = new FileLoader( this.manager );
		loader.setRequestHeader( this.requestHeader );
		loader.setWithCredentials( this.withCredentials );
		loader.load( path + '/' + rwxFile, function ( text ) {

			try {

				scope.parse( rwxFile, text, resourcePath, function ( loadedObject ) {

					onLoad( loadedObject );

				} );

			} catch ( e ) {

				if ( onError ) {

					onError( e );

				} else {

					console.error( e );

				}

				scope.manager.itemError( rwxFile );

			}

		}, onProgress, onError );

	}

	parse( name, str, textureFolderPath, onParse ) {

		// Parsing RWX file content

		let ctx = {

			rootGroup: null,
			currentGroup: null,

			transformSaves: [],

			materialStack: [],

			currentTransform: new Matrix4(),
			currentBufferGeometry: null,
			currentBufferVertices: [],
			currentBufferUVs: [],
			currentBufferFaces: [],

			currentBufferFaceCount: 0,
			currentBufferGroupFirstFaceID: 0,

			previousMaterialID: null,

			rwxClumpStack: [],
			rwxPrototypes: new Map(),

			loadingPromises: [],

			materialTracker: this.rwxMaterialManager !== null ? new RWXMaterialTracker( this.rwxMaterialManager ) :
				new RWXMaterialTracker( new RWXMaterialManager( textureFolderPath, this.textureExtension, this.maskExtension, this.fflate, this.useBasicMaterial, this.textureColorSpace, this.alphaTest ) ),

			taggedMaterials: {},
			quadRatioHint: null,
			triangleRatioHint: null,

			forceEarcut: this.forceEarcut,
			verboseWarning: this.verboseWarning,
			objectName: this.path + '/' + name

		};

		let transformBeforeProto = null;
		let groupBeforeProto = null;

		const scale_ten = new Matrix4();
		scale_ten.makeScale( 10.0, 10.0, 10.0 );

		const lines = str.split( /[\n\r]+/g );

		// Ready root object group
		ctx.rootGroup = new Group();
		ctx.rootGroup.userData.rwx = { axisAlignment: 'none' };
		ctx.currentGroup = ctx.rootGroup;
		ctx.materialStack.push( ctx.materialTracker.currentMaterial );

		for ( let i = 0, l = lines.length; i < l; i ++ ) {

			let line = lines[ i ];

			// Strip comment away (if any)
			let res = this.nonCommentRegex.exec( line );
			if ( res != null ) {

				line = res[ 1 ];

			}

			// Replace tabs with spaces
			line = line.trim().replace( /\t/g, ' ' );

			res = this.clumpbeginRegex.exec( line );
			if ( res != null ) {

				makeMeshToCurrentGroup( ctx );
				clearGeometry( ctx );

				pushCurrentGroup( ctx );
				pushCurrentMaterial( ctx );

				continue;

			}

			res = this.clumpendRegex.exec( line );
			if ( res != null ) {

				makeMeshToCurrentGroup( ctx );

				popCurrentMaterial( ctx );
				popCurrentGroup( ctx );

				clearGeometry( ctx );

				continue;

			}

			res = this.transformbeginRegex.exec( line );
			if ( res != null ) {

				saveCurrentTransform( ctx );

				continue;

			}

			res = this.transformendRegex.exec( line );
			if ( res != null ) {

				loadCurrentTransform( ctx );

				continue;

			}

			res = this.protobeginRegex.exec( line );
			if ( res != null ) {

				let name = res[ 2 ];

				groupBeforeProto = ctx.currentGroup;
				transformBeforeProto = ctx.currentTransform;
				pushCurrentMaterial( ctx );

				const newGroup = new Group();
				newGroup.userData.rwx = {};
				ctx.rwxPrototypes.set( name, newGroup );
				ctx.currentTransform = new Matrix4();

				clearGeometry( ctx );

				ctx.currentGroup = newGroup;

				continue;

			}

			res = this.protoendRegex.exec( line );
			if ( res != null ) {

				makeMeshToCurrentGroup( ctx );

				ctx.currentGroup = groupBeforeProto;
				ctx.currentTransform = transformBeforeProto;
				popCurrentMaterial( ctx );

				clearGeometry( ctx );

				continue;

			}

			res = this.protoinstanceRegex.exec( line );
			if ( res != null ) {

				const name = res[ 2 ];
				const proto = ctx.rwxPrototypes.get( name ).clone();

				proto.applyMatrix4( ctx.currentTransform );
				ctx.currentGroup.add( proto );

				continue;

			}

			res = this.textureRegex.exec( line );
			if ( this.enableTextures && res != null ) {

				const textureExtension = res[ 3 ] != null ? res[ 3 ].toLowerCase() : '.jpg';

				const texture = res[ 2 ].toLowerCase();
				if ( texture == 'null' ) {

					ctx.materialTracker.currentRWXMaterial.texture = null;

				} else {

					if ( textureExtension !== '.jpg' ) {

						ctx.materialTracker.currentRWXMaterial.texture = texture + textureExtension;

					} else {

						ctx.materialTracker.currentRWXMaterial.texture = texture;

					}

				}

				if ( res[ 4 ] !== undefined ) {

					ctx.materialTracker.currentRWXMaterial.mask = res[ 5 ];

				} else {

					ctx.materialTracker.currentRWXMaterial.mask = null;

				}

				continue;

			}

			res = this.triangleRegex.exec( line );
			if ( res != null ) {

				let vId = [];
				res[ 2 ].match( this.integerRegex ).forEach( ( entry ) => {

					vId.push( parseInt( entry ) - 1 );

				} );

				const tag = res.slice( - 1 )[ 0 ];
				if ( tag !== undefined ) {

					if ( tag == signTag ) {

						setMaterialRatio( ctx, vId[ 0 ], vId[ 1 ], vId[ 2 ] );

					} else {

						// We are no longer on a triangle sign streak: we unset the ratio hint
						ctx.triangleRatioHint = null;

					}

					commitMaterialTag( ctx, parseInt( tag ) );

				} else {

					ctx.triangleRatioHint = null;

				}

				addTriangle( ctx, vId[ 0 ], vId[ 1 ], vId[ 2 ] );

				if ( tag !== undefined ) {

					clearMaterialTag( ctx );
					clearMaterialRatio( ctx );

				}

				continue;

			} else {

				ctx.triangleRatioHint = null;

			}

			res = this.quadRegex.exec( line );
			if ( res != null ) {

				let vId = [];
				res[ 2 ].match( this.integerRegex ).forEach( ( entry ) => {

					vId.push( parseInt( entry ) - 1 );

				} );

				const tag = res.slice( - 1 )[ 0 ];
				if ( tag !== undefined ) {

					if ( tag == signTag ) {

						setMaterialRatio( ctx, vId[ 0 ], vId[ 1 ], vId[ 2 ], vId[ 3 ] );

					} else {

						// We are no longer on a quad sign streak: we unset the ratio hint
						ctx.quadRatioHint = null;

					}

					commitMaterialTag( ctx, parseInt( tag ) );

				} else {

					ctx.quadRatioHint = null;

				}

				addQuad( ctx, vId[ 0 ], vId[ 1 ], vId[ 2 ], vId[ 3 ] );

				if ( tag !== undefined ) {

					clearMaterialTag( ctx );
					clearMaterialRatio( ctx );

				}

				continue;

			} else {

			  ctx.quadRatioHint = null;

			}

			res = this.polygonRegex.exec( line );
			if ( res != null ) {

				const polyLen = parseInt( res[ 2 ].match( this.integerRegex )[ 0 ] );
				let polyIDs = [];
				const polyStrIDs = res[ 3 ].match( this.integerRegex );

				for ( let polyI = 0; polyI < polyLen; polyI ++ ) {

					const id = polyStrIDs[ polyI ];
					polyIDs.unshift( parseInt( id ) - 1 );

				}

				const tag = res.slice( - 1 )[ 0 ];
				if ( tag !== undefined ) {

					commitMaterialTag( ctx, parseInt( tag ) );

				}

				addPolygon( ctx, polyIDs );

				if ( tag !== undefined ) {

					clearMaterialTag( ctx );

				}

				continue;

			}

			res = this.vertexRegex.exec( line );
			if ( res != null ) {

				let vprops = [];
				res[ 2 ].match( this.floatRegex ).forEach( ( x ) => {

					vprops.push( parseFloat( x ) );

				} );

				let tmpVertex = new Vector4( vprops[ 0 ], vprops[ 1 ], vprops[ 2 ] );
				tmpVertex.applyMatrix4( ctx.currentTransform );

				ctx.currentBufferVertices.push( tmpVertex.x, tmpVertex.y, tmpVertex.z );

				if ( res[ 7 ] !== undefined ) {

					let moreVprops = [];
					res[ 7 ].match( this.floatRegex ).forEach( ( x ) => {

						moreVprops.push( parseFloat( x ) );

					} );

					ctx.currentBufferUVs.push( moreVprops[ 0 ], 1 - moreVprops[ 1 ] );

				} else {

					ctx.currentBufferUVs.push( 0.0, 0.0 );

				}

				continue;

			}

			res = this.colorRegex.exec( line );
			if ( res != null ) {

				let cprops = [];
				res[ 2 ].match( this.floatRegex ).forEach( ( x ) => {

					cprops.push( parseFloat( x ) );

				} );

				if ( cprops.length == 3 ) {

					ctx.materialTracker.currentRWXMaterial.color = cprops;

				}

				continue;

			}

			res = this.opacityRegex.exec( line );
			if ( res != null ) {

				ctx.materialTracker.currentRWXMaterial.opacity = parseFloat( res[ 2 ] );
				continue;

			}

			res = this.identityRegex.exec( line );
			if ( res != null ) {

				ctx.currentTransform.identity();

			}

			res = this.transformRegex.exec( line );
			if ( res != null ) {

				let tprops = [];
				res[ 2 ].match( this.floatRegex ).forEach( ( x ) => {

					tprops.push( parseFloat( x ) );

				} );

				if ( tprops.length == 16 ) {

					// Important Note: it seems the AW client always acts as if this element (which is related to the projection plane)
					// was equal to 1 when it was set 0, hence why we always override this.
					if ( tprops[ 15 ] == 0.0 ) {

						tprops[ 15 ] = 1;

					}

					ctx.currentTransform.fromArray( tprops );

				}

				continue;

			}

			res = this.translateRegex.exec( line );
			if ( res != null ) {

				let tprops = [];
				res[ 2 ].match( this.floatRegex ).forEach( ( x ) => {

					tprops.push( parseFloat( x ) );

				} );

				let translateM = new Matrix4();

				if ( tprops.length == 3 ) {

					translateM.makeTranslation( tprops[ 0 ], tprops[ 1 ], tprops[ 2 ] );
					ctx.currentTransform.multiply( translateM );

				}

				continue;

			}

			res = this.rotateRegex.exec( line );
			if ( res != null ) {

				let rprops = [];
				res[ 2 ].match( this.floatRegex ).forEach( ( x ) => {

					rprops.push( parseFloat( x ) );

				} );

				if ( rprops.length == 4 ) {

					let rotateM = new Matrix4();

					if ( rprops[ 0 ] ) {

						rotateM.makeRotationX( MathUtils.degToRad( rprops[ 0 ] * rprops[ 3 ] ) );
						ctx.currentTransform.multiply( rotateM );

					}

					if ( rprops[ 1 ] ) {

						rotateM.makeRotationY( MathUtils.degToRad( rprops[ 1 ] * rprops[ 3 ] ) );
						ctx.currentTransform.multiply( rotateM );

					}

					if ( rprops[ 2 ] ) {

						rotateM.makeRotationZ( MathUtils.degToRad( rprops[ 2 ] * rprops[ 3 ] ) );
						ctx.currentTransform.multiply( rotateM );

					}

				}

				continue;

			}

			res = this.scaleRegex.exec( line );
			if ( res != null ) {

				let sprops = [];
				res[ 2 ].match( this.floatRegex ).forEach( ( x ) => {

					sprops.push( parseFloat( x ) );

				} );

				let scaleM = new Matrix4();

				if ( sprops.length == 3 ) {

					scaleM.makeScale( sprops[ 0 ], sprops[ 1 ], sprops[ 2 ] );
					ctx.currentTransform.multiply( scaleM );

				}

				continue;

			}

			res = this.surfaceRegex.exec( line );
			if ( res != null ) {

				let sprops = [];
				res[ 2 ].match( this.floatRegex ).forEach( ( x ) => {

					sprops.push( parseFloat( x ) );

				} );

				ctx.materialTracker.currentRWXMaterial.surface = sprops;
				continue;

			}

			res = this.ambientRegex.exec( line );
			if ( res != null ) {

				ctx.materialTracker.currentRWXMaterial.surface[ 0 ] = parseFloat( res[ 2 ] );
				continue;

			}

			res = this.diffuseRegex.exec( line );
			if ( res != null ) {

				ctx.materialTracker.currentRWXMaterial.surface[ 1 ] = parseFloat( res[ 2 ] );
				continue;

			}

			res = this.specularRegex.exec( line );
			if ( res != null ) {

				ctx.materialTracker.currentRWXMaterial.surface[ 2 ] = parseFloat( res[ 2 ] );
				continue;

			}

			res = this.materialModeRegex.exec( line );
			if ( res != null ) {

				const mm = res[ 4 ].toUpperCase();

				ctx.materialTracker.currentRWXMaterial.materialmode = MaterialMode[ mm ];

				continue;

			}

			res = this.collisionRegex.exec( line );
			if ( res != null ) {

				const collision = res[ 2 ].toLowerCase();

				if ( collision == 'on' ) {

					ctx.materialTracker.currentRWXMaterial.collision = true;

				} else if ( collision == 'off' ) {

					ctx.materialTracker.currentRWXMaterial.collision = false;

				}

				continue;

			}

			res = this.lightsamplingRegex.exec( line );
			if ( res != null ) {

				const ls = res[ 2 ].toUpperCase();

				ctx.materialTracker.currentRWXMaterial.lightsampling = LightSampling[ ls ];

				continue;

			}

			res = this.geometrysamplingRegex.exec( line );
			if ( res != null ) {

				const gs = res[ 2 ].toUpperCase();

				ctx.materialTracker.currentRWXMaterial.geometrysampling = GeometrySampling[ gs ];

				continue;

			}

			res = this.texturemodesRegex.exec( line );
			if ( res != null ) {

				ctx.materialTracker.currentRWXMaterial.texturemodes = [];
				if ( ! res[ 4 ] ) { // when NULL mode is specified: emptying the array was enough

					// Actual mode(s) specified: set the material with them
					const tms = res[ 3 ].split( ' ' ).filter( value => value !== '' ).map( value => value.toUpperCase() );
					for ( const tm of tms ) {

						// Do not push the same texture mode twice
						if ( ! ctx.materialTracker.currentRWXMaterial.texturemodes.includes( TextureMode[ tm ] ) ) {

						  ctx.materialTracker.currentRWXMaterial.texturemodes.push( TextureMode[ tm ] );

						}

					}

					// Filter mode must be there when forcing texture filtering
					if ( this.forceTextureFiltering && ! ctx.materialTracker.currentRWXMaterial.texturemodes.includes( TextureMode.FILTER ) ) {

						ctx.materialTracker.currentRWXMaterial.texturemodes.push( TextureMode.FILTER );

					}

					ctx.materialTracker.currentRWXMaterial.texturemodes.sort();

				}

				continue;

			}

			res = this.addtexturemodeRegex.exec( line );
			if ( res != null ) {

				const tm = res[ 2 ].trim().toUpperCase();

				// Do not push the same texture mode twice
				if ( ! ctx.materialTracker.currentRWXMaterial.texturemodes.includes( TextureMode[ tm ] ) ) {

					ctx.materialTracker.currentRWXMaterial.texturemodes.push( TextureMode[ tm ] );
					ctx.materialTracker.currentRWXMaterial.texturemodes.sort();

				}

				continue;

			}

			res = this.removetexturemodeRegex.exec( line );
			if ( res != null ) {

				const tm = res[ 2 ].trim().toUpperCase();

				// Cannot remove Filter mode when forcing texture filtering
				if ( this.forceTextureFiltering && TextureMode[ tm ] === TextureMode.FILTER ) continue;

			  const id = ctx.materialTracker.currentRWXMaterial.texturemodes.indexOf( TextureMode[ tm ] );

				if ( id >= 0 ) {

					ctx.materialTracker.currentRWXMaterial.texturemodes.splice( id, 1 );
					ctx.materialTracker.currentRWXMaterial.texturemodes.sort();

				}

				continue;

			}

			res = this.textureaddressmodeRegex.exec( line );
			if ( res != null ) {

				const tam = res[ 3 ].toUpperCase();

				ctx.materialTracker.currentRWXMaterial.textureaddressmode = TextureAddressMode[ tam ];

				continue;

			}

			res = this.axisalignmentRegex.exec( line );
			if ( res != null ) {

				ctx.rootGroup.userData.rwx.axisAlignment = res[ 2 ].toLowerCase();

				continue;

			}

			res = this.blockRegex.exec( line );
			if ( res != null ) {

				let bprops = [];
				res[ 2 ].match( this.floatRegex ).forEach( ( x ) => {

					bprops.push( parseFloat( x ) );

				} );

				addBlock( ctx, bprops[ 0 ], bprops[ 1 ], bprops[ 2 ] );

				continue;

			}

			res = this.coneRegex.exec( line );
			if ( res != null ) {

				let cprops = [];
				res[ 2 ].match( this.floatRegex ).forEach( ( x, i ) => {

					cprops.push( i == 2 ? parseInt( x ) : parseFloat( x ) );

				} );

				addCone( ctx, cprops[ 0 ], cprops[ 1 ], cprops[ 2 ] );

				continue;

			}

			res = this.cylinderRegex.exec( line );
			if ( res != null ) {

				let cprops = [];
				res[ 2 ].match( this.floatRegex ).forEach( ( x, i ) => {

					cprops.push( i == 3 ? parseInt( x ) : parseFloat( x ) );

				} );

				addCylinder( ctx, cprops[ 0 ], cprops[ 1 ], cprops[ 2 ], cprops[ 3 ] );

				continue;

			}

			res = this.discRegex.exec( line );
			if ( res != null ) {

				let dprops = [];
				res[ 2 ].match( this.floatRegex ).forEach( ( x, i ) => {

					dprops.push( i == 2 ? parseInt( x ) : parseFloat( x ) );

				} );

				addDisc( ctx, dprops[ 0 ], dprops[ 1 ], dprops[ 2 ] );

				continue;

			}

			res = this.hemisphereRegex.exec( line );
			if ( res != null ) {

				let hprops = [];
				res[ 2 ].match( this.floatRegex ).forEach( ( x, i ) => {

					hprops.push( i == 1 ? parseInt( x ) : parseFloat( x ) );

				} );

				addHemisphere( ctx, hprops[ 0 ], hprops[ 1 ] );

				continue;

			}

			res = this.sphereRegex.exec( line );
			if ( res != null ) {

				let sprops = [];
				res[ 2 ].match( this.floatRegex ).forEach( ( x, i ) => {

					sprops.push( i == 1 ? parseInt( x ) : parseFloat( x ) );

				} );

				addSphere( ctx, sprops[ 0 ], sprops[ 1 ] );

				continue;

			}

			res = this.tagRegex.exec( line );
			if ( res != null ) {

				/* Keep track of the clump tag */
				ctx.currentGroup.userData.rwx.tag = parseInt( res[ 2 ] );

				continue;

			}

		}

		ctx.materialTracker.clearCurrentMaterialList();

		// We're done, return the root group to get the whole object, we take the decameter unit into account
		ctx.rootGroup.applyMatrix4( scale_ten );

		if ( this.waitFullLoad ) {

			// Wait all mask futures before returning loaded object
			Promise.all( ctx.loadingPromises ).then( ( ) => {

				onParse( this.flatten ? flattenGroup( ctx.rootGroup ) : ctx.rootGroup );

			} );

		} else {

			// Return immediately
			onParse( this.flatten ? flattenGroup( ctx.rootGroup ) : ctx.rootGroup );

		}

	}

}

export default RWXLoader;
export { RWXMaterial, RWXMaterialManager, RWXMaterialTracker, makeThreeMaterial, makeMaskPromise, applyTextureToMat,
	LightSampling, GeometrySampling, TextureMode, MaterialMode, TextureAddressMode, signTag, pictureTag, flattenGroup };
