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
	Shape,
	ShapeBufferGeometry,
	TextureLoader,
	RepeatWrapping,
	LinearEncoding,
	FrontSide,
	DoubleSide,
	Group,
	BufferAttribute,
	EdgesGeometry,
	LineSegments,
	LineBasicMaterial,
	SphereGeometry
} from 'three';

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

function getFinalTransform( ctx ) {

	let transform = new Matrix4();

	ctx.transformStack.forEach( ( t ) => {

		transform.multiply( t );

	} );

	return transform.multiply( ctx.currentTransform );

}

function triangulateFacesWithShapes( vertices, uvs, loop ) {

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

	let newVertices = [];
	let newUvs = [];
	let faces = [];

	let offset = vertices.length / 3;
	let vertexMap = {};

	// Compute centroid
	_ctr.setScalar( 0.0 );

	let l = loop.length;
	for ( let i = 0; i < l; i ++ ) {

		_ctr.add( new Vector3( vertices[ loop[ i ] * 3 ], vertices[ loop[ i ] * 3 + 1 ], vertices[ loop[ i ] * 3 + 2 ] ) );
		vertexMap[ i ] = loop[ i ];

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
	let projVertices = [];
	for ( let i = 0; i < l; i ++ ) {

		const currentVertex = new Vector3( vertices[ loop[ i ] * 3 ], vertices[ loop[ i ] * 3 + 1 ], vertices[ loop[ i ] * 3 + 2 ] );
		_tmp.subVectors( currentVertex, _ctr );
		projVertices.push( new Vector2( _tmp.dot( _x ), _tmp.dot( _y ) ) );

	}

	// Create the geometry (Three.js triangulation with ShapeGeometry)
	let shape = new Shape( projVertices );
	let geometry = new ShapeBufferGeometry( shape );

	geometry.applyMatrix4( _basis );

	let bufferPosition = geometry.getAttribute( 'position' );
	const shapeIndices = geometry.getIndex().array;

	/*
	* Replace the positions for each vertex in the newly computed (flat and planar) polygon with the ones from the original
	* set of vertices it was fed with, thus "sealing" the geometry perfectly despite the vertices being duplicated.
	*/
	for ( let i = 0, lVertices = bufferPosition.count; i < lVertices; i ++ ) {

		bufferPosition.setXYZ(
			i,
			vertices[ vertexMap[ i ] * 3 ],
			vertices[ vertexMap[ i ] * 3 + 1 ],
			vertices[ vertexMap[ i ] * 3 + 2 ]
		);

		newUvs.push( uvs[ vertexMap[ i ] * 2 ], uvs[ vertexMap[ i ] * 2 + 1 ] );

	}

	// Use the vertex indices from each newly computed 2D face to extend our current set
	for ( let i = 0, lFaces = shapeIndices.length; i < lFaces; i ++ ) {

		faces.push( shapeIndices[ i ] + offset );

	}

	newVertices.push( ...bufferPosition.array );

	return [ newVertices, newUvs, faces ];

}

function makeMaskPromise( bmpURI, threeMat, loader, textureEncoding = LinearEncoding ) {

	return new Promise( ( resolveMask ) => {

		loader.load( bmpURI, ( maskTexture ) => {

			maskTexture.wrapS = RepeatWrapping;
			maskTexture.wrapT = RepeatWrapping;
			maskTexture.encoding = textureEncoding;
			threeMat.alphaMap = maskTexture;
			threeMat.needsUpdate = true;
			resolveMask( maskTexture );

		} );

	} );

}

function applyTextureToMat( threeMat, folder, textureName, textureExtension = "jpg", maskName = null,
	maskExtension = "zip", jsZip = null, jsZipUtils = null, loadingPromises = [], textureEncoding = LinearEncoding ) {

	let loader = new TextureLoader();

	loadingPromises.push( new Promise( ( resolveTex ) => {

		const texturePath = folder + '/' + textureName + '.' + textureExtension;
		loader.load( texturePath, ( texture ) => {

			texture.wrapS = RepeatWrapping;
			texture.wrapT = RepeatWrapping;
			texture.encoding = textureEncoding;
			threeMat.map = texture;
			threeMat.needsUpdate = true;

			// If the height is nicely divisible by the width: it's an animated texture
			if ( texture.image.height !== texture.image.width && texture.image.height % texture.image.width === 0 ) {

				threeMat.userData.rwx[ 'animation' ] = { yTiles: texture.image.height / texture.image.width, yHeight: texture.image.width / texture.image.height, step: 0 };
				texture.offset.y = ( 1.0 - threeMat.userData.rwx.animation.yHeight );
				texture.repeat.set( 1, threeMat.userData.rwx.animation.yHeight );

			}

			resolveTex( texture );

		} );

	} ) );

	if ( maskName != null ) {

		threeMat.alphaTest = 0.2;
		threeMat.transparent = true;

		if ( maskExtension == "zip" && jsZip != null && jsZipUtils != null ) {

			// We try to extract the bmp mask from the archive
			const maskBaseName = maskName;
			const zipPath = folder + '/' + maskBaseName + '.' + maskExtension;

			// We load the mask asynchronously using JSZip and JSZipUtils (if available)
			loadingPromises.push( new jsZip.external.Promise( function ( resolve, reject ) {

				jsZipUtils.getBinaryContent( zipPath, function ( err, data ) {

					if ( err ) {

						reject( err );

					} else {

						resolve( data );

					}

				} );

			} ).then( jsZip.loadAsync ).then( function ( zip ) {

				// Chain with the bmp content promise, we need to be case insensitive
				for ( const [ key ] of Object.entries( zip.files ) ) {

					if ( key.toLowerCase() == ( maskBaseName.toLowerCase() + '.bmp' ) ) {

						return zip.file( key ).async( "uint8array" );

					}

				}

			} ).then( function success( buffer ) {

				// Load the bmp image into a data uri string
				let bmpURI = "data:image/bmp;base64,";
				const chunkSize = 4056;
				let dataStr = "";

				// Chunking the buffer to maximize browser compatibility and avoid exceeding some size limit
				// during string creation when using 'String.fromCharCode'
				for ( let i = 0; i < buffer.length; i += chunkSize ) {

					dataStr = dataStr.concat( String.fromCharCode.apply( null, new Uint16Array( buffer.slice( i, i + chunkSize ) ) ) );

				}

				bmpURI = bmpURI.concat( btoa( dataStr ) );

				// Make a texture out of the bmp mask, apply it to the material
				return makeMaskPromise( bmpURI, threeMat, loader );

			}, function error( e ) {

				throw e;

			} ) );

		} else if ( maskExtension != 'zip' ) {

			const bmpPath = folder + '/' + maskName + '.' + maskExtension;
			loadingPromises.push( makeMaskPromise( bmpPath, threeMat, loader ) );

		}

	}

}

function makeThreeMaterial( rwxMaterial, folder, textureExtension = "jpg", maskExtension = "zip",
	jsZip = null, jsZipUtils = null, useBasicMaterial = false, textureEncoding = LinearEncoding ) {

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

	if ( ! useBasicMaterial ) {

		if ( rwxMaterial.lightsampling == LightSampling.FACET ) {

			materialDict[ 'flatShading' ] = true;

		} else if ( rwxMaterial.lightsampling == LightSampling.VERTEX ) {

			materialDict[ 'flatShading' ] = false;

		}

		// The specular value in a Phong material is expressed using an hexadecimal value
		// holding on 3 bytes, each representing a different color channel.
		// Without any prior knowledge: we safely assume a white light instead
		const whiteSpecular = Math.trunc( rwxMaterial.surface[ 2 ] * 255 );
		materialDict[ 'specular' ] = ( whiteSpecular << 16 ) + ( whiteSpecular << 8 ) + whiteSpecular;

		// Same thing for the emissive value
		const whiteEmissive = Math.trunc( rwxMaterial.surface[ 1 ] );
		materialDict[ 'emissive' ] = ( whiteEmissive << 16 ) + ( whiteEmissive << 8 ) + whiteEmissive;

		materialDict[ 'shininess' ] = 30; // '30' is the demo's default Phong material shininess value

	}

	materialDict[ 'opacity' ] = rwxMaterial.opacity;

	let threeMat = useBasicMaterial ? new MeshBasicMaterial( materialDict ) : new MeshPhongMaterial( materialDict );
	threeMat.userData.rwx = { material: rwxMaterial.clone() };
	let loadingPromises = [];

	threeMat.userData[ 'collision' ] = rwxMaterial.collision;
	threeMat.userData[ 'ratio' ] = rwxMaterial.ratio;

	if ( rwxMaterial.texture == null ) {

		// Assuming sRGB encoding for colors in RWX commands, so we need to convert back to linear
		threeMat.color.set( rwxMaterial.getColorHexValue() ).convertSRGBToLinear();

	} else {

		applyTextureToMat( threeMat, folder, rwxMaterial.texture, textureExtension, rwxMaterial.mask,
			maskExtension, jsZip, jsZipUtils, loadingPromises, textureEncoding );

	}

	return {
		threeMat: threeMat,
		loadingPromises: loadingPromises,
	};

}

function resetGeometry( ctx ) {

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

		ctx.loadingPromises = ctx.loadingPromises.concat( ctx.materialManager.getCurrentMaterialList().map( res => res.loadingPromises ) );

		const mesh = new Mesh( ctx.currentBufferGeometry, ctx.materialManager.getCurrentMaterialList().map( res => res.threeMat ) );

		/* Keep track of tagged materials for this mesh */
		mesh.userData[ 'taggedMaterials' ] = ctx.taggedMaterials;

		ctx.currentGroup.add( mesh );

		resetMaterialTag( ctx );
		resetMaterialRatio( ctx );
		ctx.taggedMaterials = {};

	}

}

function commitBufferGeometryGroup( ctx ) {

	// Make new material group out of existing data
	ctx.currentBufferGeometry.addGroup( ctx.currentBufferGroupFirstFaceID, ctx.currentBufferFaceCount * 3, ctx.previousMaterialID );

	// Set everything ready for the next group to start
	ctx.previousMaterialID = ctx.materialManager.getCurrentMaterialID();
	ctx.currentBufferGroupFirstFaceID = ctx.currentBufferGroupFirstFaceID + ctx.currentBufferFaceCount * 3;
	ctx.currentBufferFaceCount = 0;

}

function addTriangle( ctx, a, b, c ) {

	if ( ctx.materialManager.getCurrentMaterialID() !== ctx.previousMaterialID ) {

		commitBufferGeometryGroup( ctx );

	}

	// Add new face
	ctx.currentBufferFaceCount ++;
	ctx.currentBufferFaces.push( a, b, c );

}

function addQuad( ctx, a, b, c, d ) {

	if ( ctx.materialManager.getCurrentMaterialID() !== ctx.previousMaterialID ) {

		commitBufferGeometryGroup( ctx );

	}

	if ( true && ctx.materialManager.currentRWXMaterial.geometrysampling == GeometrySampling.WIREFRAME ) {

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
			new LineBasicMaterial( { color: ctx.materialManager.currentRWXMaterial.getColorHexValue() } ) );

		ctx.currentGroup.add( lines );

	} else {

		// Add two new faces
		ctx.currentBufferFaceCount += 2;
		ctx.currentBufferFaces.push( a, b, c );
		ctx.currentBufferFaces.push( a, c, d );

	}

}

function addPolygon( ctx, indices ) {

	if ( ctx.materialManager.getCurrentMaterialID() !== ctx.previousMaterialID ) {

		commitBufferGeometryGroup( ctx );

	}

	const [ newVertices, newUVs, newFaces ] =
		triangulateFacesWithShapes( ctx.currentBufferVertices, ctx.currentBufferUVs, indices );

	ctx.currentBufferVertices.push( ...newVertices );
	ctx.currentBufferUVs.push( ...newUVs );

	for ( let lf = 0; lf < newFaces.length; lf += 3 ) {

		const a = newFaces[ lf ];
		const b = newFaces[ lf + 1 ];
		const c = newFaces[ lf + 2 ];

		// Add new face
		ctx.currentBufferFaceCount ++;
		ctx.currentBufferFaces.push( a, b, c );

	}

}

function makeVertexCircle( h, r, n, v = null ) {

	if ( n < 3 ) {

		throw ( "Need at least 3 sides to make a vertex circle" );

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
	let material = ctx.materialManager.getCurrentMaterial().threeMat;

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
	mesh.userData[ 'taggedMaterials' ] = {};
	mesh.applyMatrix4( getFinalTransform( ctx ) );
	ctx.currentGroup.add( mesh );

}

function addCone( ctx, h, r, n ) {

	if ( n < 3 ) {

		// Silently skip if the cone doesn't have enough faces on its base
		return;

	}

	const nbSides = n;

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

	let mesh = new Mesh( bufferGeometry, [ ctx.materialManager.getCurrentMaterial().threeMat ] );
	mesh.userData[ 'taggedMaterials' ] = {};
	mesh.applyMatrix4( getFinalTransform( ctx ) );
	ctx.currentGroup.add( mesh );

}

function addCylinder( ctx, h, br, tr, n ) {

	if ( n < 3 ) {

		// Silently skip if the cylinder doesn't have enough faces on its base
		return;

	}

	const nbSides = n;

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

	let mesh = new Mesh( bufferGeometry, [ ctx.materialManager.getCurrentMaterial().threeMat ] );
	mesh.userData[ 'taggedMaterials' ] = {};
	mesh.applyMatrix4( getFinalTransform( ctx ) );
	ctx.currentGroup.add( mesh );

}

function addDisc( ctx, h, r, n ) {

	if ( n < 3 ) {

		// Silently skip if the disc doesn't have enough faces on its base
		return;

	}

	const nbSides = n;

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

	let mesh = new Mesh( bufferGeometry, [ ctx.materialManager.getCurrentMaterial().threeMat ] );
	mesh.applyMatrix4( getFinalTransform( ctx ) );
	mesh.userData[ 'taggedMaterials' ] = {};
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

	let levelData = null;
	let index = [];

	// Now that we have the base of the emisphere: we build up from there to the top
	for ( let h = 1; h < nbSegments; h ++ ) {

		currentLevelID = previousLevelID + nbSides;
		const nH = Math.sin( deltaRad * h );
		levelData = makeVertexCircle( nH * r, Math.cos( deltaRad * h ) * r, nbSides, nH );

		positions.push( ...levelData[ 0 ] );
		uvs.push( ...levelData[ 1 ] );

		// We weave faces across both circles (up and down) to make a cylinder
		for ( let i = 0; i < nbSides; i ++ ) {

			index.push( currentLevelID + i, previousLevelID + i, previousLevelID + ( ( i + 1 ) % nbSides ) );
			index.push( currentLevelID + i, previousLevelID + ( ( i + 1 ) % nbSides ), currentLevelID + ( ( i + 1 ) % nbSides ) );

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

	let mesh = new Mesh( bufferGeometry, [ ctx.materialManager.getCurrentMaterial().threeMat ] );
	mesh.userData[ 'taggedMaterials' ] = {};
	mesh.applyMatrix4( getFinalTransform( ctx ) );
	ctx.currentGroup.add( mesh );

}

function addSphere( ctx, r, n ) {

	if ( n < 2 ) {

		// Silently skip if the hemisphere doesn't have enough density
		return;

	}

	const nbSides = n * 4;
	const nbSegments = n * 2;

	let geometry = new SphereGeometry( r, nbSides, nbSegments );
	geometry.addGroup( 0, geometry.getIndex().count, 0 );

	let mesh = new Mesh( geometry, [ ctx.materialManager.getCurrentMaterial().threeMat ] );
	mesh.userData[ 'taggedMaterials' ] = {};
	mesh.applyMatrix4( getFinalTransform( ctx ) );
	ctx.currentGroup.add( mesh );

}

function pushCurrentGroup( ctx ) {

	let group = new Group();
	ctx.currentGroup.add( group );
	ctx.groupStack.push( ctx.currentGroup );
	ctx.currentGroup = group;

}

function popCurrentGroup( ctx ) {

	ctx.currentGroup = ctx.groupStack.pop();

}

function pushCurrentTransform( ctx ) {

	ctx.transformStack.push( ctx.currentTransform );
	ctx.currentTransform = new Matrix4();

}

function popCurrentTransform( ctx ) {

	ctx.currentTransform = ctx.transformStack.pop();

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

	ctx.materialManager.currentRWXMaterial.tag = tag;

	if ( ctx.taggedMaterials[ tag.toString() ] === undefined ) {

		// If there are no material under that tag yet, we need to initiliaze the entry
		// with an empty array
		ctx.taggedMaterials[ tag.toString() ] = [];

	}

	// We need to keep track of the position of the tagged material within the material list
	// of the mesh, we don't have the mesh yet but we already know which position from which
	// the material will be accessible, thanks to the material manager, see makeMeshToCurrentGroup(...)
	// to see how sed mesh is finally defined
	if ( ! ctx.taggedMaterials[ tag.toString() ].includes( ctx.materialManager.getCurrentMaterialID() ) ) {

		ctx.taggedMaterials[ tag.toString() ].push( ctx.materialManager.getCurrentMaterialID() );

	}

}

function resetMaterialTag( ctx ) {

	ctx.materialManager.currentRWXMaterial.tag = 0;

}

function setMaterialRatio( ctx, a, b, c ) {

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
	ctx.materialManager.currentRWXMaterial.ratio = ( width * scaleU ) / ( height * scaleV );

}

function resetMaterialRatio( ctx ) {

	ctx.materialManager.currentRWXMaterial.ratio = 1.0;

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
				const taggedMaterials = child.userData[ 'taggedMaterials' ];

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

	finalMesh.userData[ 'rwx' ] = group.userData[ 'rwx' ];
	finalMesh.userData[ 'taggedMaterials' ] = ctx.taggedMaterials;

	return finalMesh;

}

class RWXMaterial {

	constructor() {

	  // Material related properties start here
		this.color = [ 0.0, 0.0, 0.0 ]; // Red, Green, Blue
		this.surface = [ 0.0, 0.0, 0.0 ]; // Ambience, Diffusion, Specularity
		this.opacity = 1.0;
		this.lightsampling = LightSampling.FACET;
		this.geometrysampling = GeometrySampling.SOLID;
		this.texturemodes = [ TextureMode
			.LIT,
		]; // There's possibly more than one mode enabled at a time (hence why we use an array)
		this.materialmode = MaterialMode.NULL; // Neither NONE nor DOUBLE: we only render one side of the polygon
		this.texture = null;
		this.mask = null;
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
		let textureMode = "";

		this.texturemodes.forEach( ( tm ) => {

			textureMode += tm.toString();

		} );

		const materialMode = this.materialmode.toString();
		const texture = this.texture === null ? "" : this.texture;
		const mask = this.mask === null ? "" : this.mask;

		const collision = this.collision.toString();

		const tag = this.tag.toString();
		const ratio = this.ratio.toFixed( 2 );

		return `${color}_${surface}_${opacity}_${lightSampling}_${geometrySampling}_${textureMode}_${materialMode}` +
			`_${texture}_${mask}_${collision}_${tag}_${ratio}`;

	}

}

class RWXMaterialManager {

	constructor( folder, textureExtension = "jpg", maskExtension =
	"zip", jsZip = null, jsZipUtils = null, useBasicMaterial = false,
	textureEncoding = LinearEncoding ) {

		this.folder = folder;
		this.textureExtension = textureExtension;
		this.maskExtension = maskExtension;
		this.jsZip = jsZip;
		this.jsZipUtils = jsZipUtils;

		this.currentRWXMaterial = new RWXMaterial();
		this.threeMaterialMap = {};
		this.currentMaterialID = null;
		this.currentMaterialList = [];
		this.currentMaterialSignature = "";
		this.useBasicMaterial = useBasicMaterial;
		this.textureEncoding = textureEncoding;

	}

	getCurrentMaterialID() {

		const materialSignature = this.currentRWXMaterial.getMatSignature();

		// This gets called when the material is actually required by (at least) one face,
		// meaning we need to save the material in the map if it's not already done
		if ( this.threeMaterialMap[ materialSignature ] === undefined ) {

			this.threeMaterialMap[ materialSignature ] = makeThreeMaterial( this.currentRWXMaterial,
				this.folder, this.textureExtension, this.maskExtension, this.jsZip, this.jsZipUtils,
				this.useBasicMaterial, this.textureEncoding );
			this.threeMaterialMap[ materialSignature ].needsUpdate = true;

		}

		if ( this.currentMaterialSignature != materialSignature ) {

			this.currentMaterialSignature = materialSignature;

			// We're onto a new material given the current list, we need to add it to the list and increment the ID
			if ( this.currentMaterialID === null ) {

				this.currentMaterialID = 0;

			} else {

				this.currentMaterialID ++;

			}

			this.currentMaterialList.push( this.threeMaterialMap[ materialSignature ] );

		}

		return this.currentMaterialID;

	}

	getCurrentMaterial() {

		  return this.currentMaterialList[ this.getCurrentMaterialID() ];

	}

	getCurrentMaterialList() {

		return this.currentMaterialList;

	}

	resetCurrentMaterialList() {

		this.currentMaterialID = null;
		this.currentMaterialList = [];
		this.currentMaterialSignature = "";
		this.currentRWXMaterial = new RWXMaterial();

	}

	texturesNextFrame() {

		for ( const pair of Object.entries( this.threeMaterialMap ) ) {

			const animation = pair[ 1 ].threeMat.userData.rwx.animation;

			if ( animation !== undefined ) {

				animation.step = ( animation.step + 1 ) % animation.yTiles;
				pair[ 1 ].threeMat.map.offset.y = ( 1.0 - animation.yHeight ) - animation.step * animation.yHeight;
				pair[ 1 ].threeMat.needsUpdate = true;

			}

		}

	}

}

class RWXLoader extends Loader {

	constructor( manager ) {

		super( manager );

		this.integerRegex = /([-+]?[0-9]+)/g;
		this.floatRegex = /([+-]?([0-9]+([.][0-9]*)?|[.][0-9]+))/g;
		this.nonCommentRegex = /^(.*)#/g;
		this.clumpbeginRegex = /^ *(clumpbegin).*$/i;
		this.clumpendRegex = /^ *(clumpend).*$/i;
		this.transformbeginRegex = /^ *(transformbegin).*$/i;
		this.transformendRegex = /^ *(transformend).*$/i;
		this.protobeginRegex = /^ *(protobegin) +([A-Za-z0-9_\-\.]+).*$/i;
		this.protoinstanceRegex = /^ *(protoinstance) +([A-Za-z0-9_\-\.]+).*$/i;
		this.protoendRegex = /^ *(protoend).*$/i;
		this.vertexRegex = /^ *(vertex|vertexext)(( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)){3}) *(uv(( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)){2}))?.*$/i;
		this.polygonRegex = /^ *(polygon|polygonext)( +[0-9]+)(( +[0-9]+)+)( +tag +([0-9]+))?.*$/i;
		this.quadRegex = /^ *(quad|quadext)(( +([0-9]+)){4})( +tag +([0-9]+))?.*$/i;
		this.triangleRegex = /^ *(triangle|triangleext)(( +([0-9]+)){3})( +tag +([0-9]+))?.*$/i;
		this.textureRegex = /^ *(texture) +([A-Za-z0-9_\-]+) *(mask *([A-Za-z0-9_\-]+))?.*$/i;
		this.colorRegex = /^ *(color)(( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)){3}).*$/i;
		this.opacityRegex = /^ *(opacity)( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)).*$/i;
		this.identityRegex = /^ *(identity) *$/i;
		this.transformRegex = /^ *(transform)(( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)){16}).*$/i;
		this.translateRegex = /^ *(translate)(( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)){3}).*$/i;
		this.scaleRegex = /^ *(scale)(( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)){3}).*$/i;
		this.rotateRegex = /^ *(rotate)(( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)){4})$/i;
		this.surfaceRegex = /^ *(surface)(( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)){3}).*$/i;
		this.ambientRegex = /^ *(ambient)( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)).*$/i;
		this.diffuseRegex = /^ *(diffuse)( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)).*$/i;
		this.specularRegex = /^ *(specular)( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)).*$/i;
		this.materialModeRegex = /^ *((add)?materialmode(s)?) +([A-Za-z0-9_\-]+).*$/i;
		this.collisionRegex = /^ *(collision) +(on|off).*$/i;
		this.lightsamplingRegex = /^ *(lightsampling) +(facet|vertex).*$/i;
		this.geometrysamplingRegex = /^ *(geometrysampling) +(pointcloud|wireframe|solid).*$/i;
		this.axisalignmentRegex = /^ *(axisalignment) +(none|zorientx|zorienty|xyz).*$/i;
		this.blockRegex = /^ *(block)(( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)){3}).*$/i;
		this.coneRegex = /^ *(cone)(( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)){2}( +[-+]?[0-9]+)).*$/i;
		this.cylinderRegex = /^ *(cylinder)(( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)){3}( +[-+]?[0-9]+)).*$/i;
		this.discRegex = /^ *(disc)(( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)){2}( +[-+]?[0-9]+)).*$/i;
		this.hemisphereRegex = /^ *(hemisphere)(( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+))( +[-+]?[0-9]+)).*$/i;
		this.sphereRegex = /^ *(sphere)(( +[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+))( +[-+]?[0-9]+)).*$/i;

		this.jsZip = null;
		this.jsZipUtils = null;
		this.textureExtension = 'jpg';
		this.maskExtension = 'zip';

		this.waitFullLoad = false;
		this.flatten = false;
		this.useBasicMaterial = false;
		this.rwxMaterialManager = null;
		this.textureEncoding = LinearEncoding;

	}

	// Provide jsZip and jsZipUtils modules to the loader, required for proper texture masks handling
	setJSZip( jsZip, jsZipUtils ) {

		this.jsZip = jsZip;
		this.jsZipUtils = jsZipUtils;

		return this;

	}

	// Set the expected texture files extension, 'jpg' by default
	setTextureExtension( textureExtension ) {

		this.textureExtension = textureExtension;

		return this;

	}

	// Set the expected texture mask files extension, 'zip' by default
	setMaskExtension( maskExtension ) {

		this.maskExtension = maskExtension;

		return this;

	}

	// Wether or not to wait for full loading before returning the objet, textures are loaded asynchronously by default,
	// set this to 'true' for the loader to only return the object once it's fully loaded
	setWaitFullLoad( waitFullLoad ) {

		this.waitFullLoad = waitFullLoad;

		return this;

	}

	// Wether or not to flatten the objet, the object will consist of nested groups by default,
	// set this to 'true' to get a single mesh holding everything
	setFlatten( flatten ) {

		this.flatten = flatten;

		return this;

	}

	// Wether or not to use MeshBasicMaterial instead of MeshPhongMaterial
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

	// Set the texture encoding mode used for textures and masks loaded for materials (default is LinearEncoding)
	setTextureEncoding( textureEncoding ) {

		this.textureEncoding = textureEncoding;

		return this;

	}

	load( rwxFile, onLoad, onProgress, onError ) {

		let scope = this;
		let path = this.path;
		let resourcePath = this.resourcePath;

		let loader = new FileLoader( this.manager );
		loader.setRequestHeader( this.requestHeader );
		loader.setWithCredentials( this.withCredentials );
		loader.load( path + "/" + rwxFile, function ( text ) {

			try {

				scope.parse( text, resourcePath, function ( loadedObject ) {

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

	parse( str, textureFolderPath, onParse ) {

		// Parsing RWX file content

		let ctx = {

			groupStack: [],
			currentGroup: null,

			transformStack: [],
			transformSaves: [],

			currentTransform: new Matrix4(),
			currentBufferGeometry: null,
			currentBufferVertices: [],
			currentBufferUVs: [],
			currentBufferFaces: [],

			currentBufferFaceCount: 0,
			currentBufferGroupFirstFaceID: 0,

			previousMaterialID: null,

			rwxClumpStack: [],
			rwxProtoDict: {},

			loadingPromises: [],

			materialManager: this.rwxMaterialManager !== null ? this.rwxMaterialManager : new RWXMaterialManager( textureFolderPath, this.textureExtension, this.maskExtension, this.jsZip, this.jsZipUtils, this.useBasicMaterial, this.textureEncoding ),

			taggedMaterials: {}

		};

		let transformBeforeProto = null;
		let groupBeforeProto = null;

		const scale_ten = new Matrix4();
		scale_ten.makeScale( 10.0, 10.0, 10.0 );

		const lines = str.split( /[\n\r]+/g );

		// Ready root object group
		ctx.groupStack.push( new Group() );
		ctx.groupStack[ 0 ].userData[ 'rwx' ] = { axisAlignment: "none" };
		ctx.currentGroup = ctx.groupStack.slice( - 1 )[ 0 ];
		ctx.transformStack.push( ctx.currentTransform );

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
				resetGeometry( ctx );

				pushCurrentGroup( ctx );
				pushCurrentTransform( ctx );

				continue;

			}

			res = this.clumpendRegex.exec( line );
			if ( res != null ) {

				makeMeshToCurrentGroup( ctx );

				popCurrentTransform( ctx );
				popCurrentGroup( ctx );

				resetGeometry( ctx );

				ctx.materialManager.resetCurrentMaterialList();

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

				ctx.rwxProtoDict[ name ] = new Group();
				ctx.currentTransform = new Matrix4();

				resetGeometry( ctx );

				ctx.materialManager.currentRWXMaterial = new RWXMaterial();
				ctx.currentGroup = ctx.rwxProtoDict[ name ];

				continue;

			}

			res = this.protoendRegex.exec( line );
			if ( res != null ) {

				makeMeshToCurrentGroup( ctx );

				ctx.currentGroup = groupBeforeProto;
				ctx.currentTransform = transformBeforeProto;

				resetGeometry( ctx );

				ctx.materialManager.resetCurrentMaterialList();

				continue;

			}

			res = this.protoinstanceRegex.exec( line );
			if ( res != null ) {

				let name = res[ 2 ];
				let protoMesh = ctx.rwxProtoDict[ name ].clone();
				let tmpTransform = getFinalTransform( ctx );
				protoMesh.applyMatrix4( tmpTransform );
				ctx.currentGroup.add( protoMesh );

				continue;

			}

			res = this.textureRegex.exec( line );
			if ( res != null ) {

				const texture = res[ 2 ].toLowerCase();

				if ( texture == "null" ) {

					ctx.materialManager.currentRWXMaterial.texture = null;

				} else {

					ctx.materialManager.currentRWXMaterial.texture = texture;

				}

				if ( res[ 4 ] !== undefined ) {

					ctx.materialManager.currentRWXMaterial.mask = res[ 4 ];

				} else {

					ctx.materialManager.currentRWXMaterial.mask = null;

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

					if ( tag == 100 ) {

						setMaterialRatio( ctx, vId[ 0 ], vId[ 1 ], vId[ 2 ] );

					}

					commitMaterialTag( ctx, parseInt( tag ) );

				}

				addTriangle( ctx, vId[ 0 ], vId[ 1 ], vId[ 2 ] );

				if ( tag !== undefined ) {

					resetMaterialTag( ctx );
					resetMaterialRatio( ctx );

				}

				continue;

			}

			res = this.quadRegex.exec( line );
			if ( res != null ) {

				let vId = [];
				res[ 2 ].match( this.integerRegex ).forEach( ( entry ) => {

					vId.push( parseInt( entry ) - 1 );

				} );

				const tag = res.slice( - 1 )[ 0 ];
				if ( tag !== undefined ) {

					if ( tag == 100 ) {

						setMaterialRatio( ctx, vId[ 0 ], vId[ 1 ], vId[ 2 ] );

					}

					commitMaterialTag( ctx, parseInt( tag ) );

				}

				addQuad( ctx, vId[ 0 ], vId[ 1 ], vId[ 2 ], vId[ 3 ] );

				if ( tag !== undefined ) {

					resetMaterialTag( ctx );
					resetMaterialRatio( ctx );

				}

				continue;

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

					resetMaterialTag( ctx );

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
				tmpVertex.applyMatrix4( getFinalTransform( ctx ) );

				ctx.currentBufferVertices.push( tmpVertex.x, tmpVertex.y, tmpVertex.z );

				if ( typeof ( res[ 7 ] ) != "undefined" ) {

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

					ctx.materialManager.currentRWXMaterial.color = cprops;

				}

				continue;

			}

			res = this.opacityRegex.exec( line );
			if ( res != null ) {

				ctx.materialManager.currentRWXMaterial.opacity = parseFloat( res[ 2 ] );
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

				ctx.materialManager.currentRWXMaterial.surface = sprops;
				continue;

			}

			res = this.ambientRegex.exec( line );
			if ( res != null ) {

				ctx.materialManager.currentRWXMaterial.surface[ 0 ] = parseFloat( res[ 2 ] );
				continue;

			}

			res = this.diffuseRegex.exec( line );
			if ( res != null ) {

				ctx.materialManager.currentRWXMaterial.surface[ 1 ] = parseFloat( res[ 2 ] );
				continue;

			}

			res = this.specularRegex.exec( line );
			if ( res != null ) {

				ctx.materialManager.currentRWXMaterial.surface[ 2 ] = parseFloat( res[ 2 ] );
				continue;

			}

			res = this.materialModeRegex.exec( line );
			if ( res != null ) {

				const matMode = res[ 4 ].toLowerCase();

				if ( matMode == "none" ) {

					ctx.materialManager.currentRWXMaterial.materialmode = MaterialMode.NONE;

				} else if ( matMode == "null" ) {

					ctx.materialManager.currentRWXMaterial.materialmode = MaterialMode.NULL;

				} else if ( matMode == "double" ) {

					ctx.materialManager.currentRWXMaterial.materialmode = MaterialMode.DOUBLE;

				}

				continue;

			}

			res = this.collisionRegex.exec( line );
			if ( res != null ) {

				const collision = res[ 2 ].toLowerCase();

				if ( collision == "on" ) {

					ctx.materialManager.currentRWXMaterial.collision = true;

				} else if ( collision == "off" ) {

					ctx.materialManager.currentRWXMaterial.collision = false;

				}

				continue;

			}

			res = this.lightsamplingRegex.exec( line );
			if ( res != null ) {

				const ls = res[ 2 ].toLowerCase();

				if ( ls == "vertex" ) {

					ctx.materialManager.currentRWXMaterial.lightsampling = LightSampling.VERTEX;

				} else {

					ctx.materialManager.currentRWXMaterial.lightsampling = LightSampling.FACET;

				}

				continue;

			}

			res = this.geometrysamplingRegex.exec( line );
			if ( res != null ) {

				const gs = res[ 2 ].toLowerCase();

				if ( gs == "pointcloud" ) {

					ctx.materialManager.currentRWXMaterial.geometrysampling = GeometrySampling.POINTCLOUD;

				} else if ( gs == "wireframe" ) {

					ctx.materialManager.currentRWXMaterial.geometrysampling = GeometrySampling.WIREFRAME;

				} else {

					ctx.materialManager.currentRWXMaterial.geometrysampling = GeometrySampling.SOLID;

				}

				continue;

			}

			res = this.axisalignmentRegex.exec( line );
			if ( res != null ) {

				ctx.groupStack[ 0 ].userData.rwx.axisAlignment = res[ 2 ].toLowerCase();

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

		}

		// We're done, return the root group to get the whole object, we take the decameter unit into account
		ctx.groupStack[ 0 ].applyMatrix4( scale_ten );

		if ( this.waitFullLoad ) {

			// Wait all mask futures before returning loaded object
			Promise.all( ctx.loadingPromises ).then( ( ) => {

				onParse( this.flatten ? flattenGroup( ctx.groupStack[ 0 ] ) : ctx.groupStack[ 0 ] );

			} );

		} else {

			// Return immediately
			onParse( this.flatten ? flattenGroup( ctx.groupStack[ 0 ] ) : ctx.groupStack[ 0 ] );

		}

	}

}

export default RWXLoader;
export { RWXMaterial, RWXMaterialManager, makeThreeMaterial, makeMaskPromise, applyTextureToMat,
	LightSampling, GeometrySampling, TextureMode, MaterialMode, flattenGroup };
