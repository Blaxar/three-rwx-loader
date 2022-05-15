/**
 * @author Julien 'Blaxar' Bardagi <blaxar.waldarax@gmail.com>
 */

import { LinearEncoding, sRGBEncoding } from 'three';
import RWXLoader, { RWXMaterial, RWXMaterialManager, LightSampling, GeometrySampling, TextureMode, MaterialMode } from './RWXLoader.js';
import JSZip from 'jszip';
import JSZipUtils from 'jszip-utils';
import {createServer} from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Mesh, Group, Box3 } from 'three';
import 'isomorphic-fetch';

const __filename = fileURLToPath( import.meta.url );
const __dirname = path.dirname( __filename );

const port = 8085;
const numDigits = 5;

const extensionMap = {

	'.bmp': 'image/bmp',
	'.jpg': 'image/jpeg',
	'.zip': 'application/zip'

};

const loadTestCube = ( flatten ) => {

	return new Promise( (resolve, error) => {

		const server = createServer( (req, res) => {

			const p = path.join(__dirname, '..', req.url);
			const ext = path.parse(req.url).ext;

			fs.readFile(p, (err, data) => {

				if (err) {
					res.writeHead(404);
					res.end(JSON.stringify(err));
					return;
				}

				res.setHeader( 'Content-type', extensionMap[ext] || 'text/plain' );
				res.writeHead(200);
				res.end(data);

			} );

		} );

		server.listen(port, () => {

			const loader = new RWXLoader();

			expect( loader.setPath( 'http://127.0.0.1:' + port + '/samples/rwx' )
							.setResourcePath( 'http://127.0.0.0:' + port + '/samples/textures' ).setEnableTextures( false )
							.setWaitFullLoad( true ).setFlatten( flatten ) ).toStrictEqual( loader );

			loader.load( 'cube.rwx', rwx => {

				server.close();
				resolve( rwx );

			}, null, e => {

				server.close();
				error( e );

			} );

		} );

	} );

};

const probeTestCube = ( node, groupCb, meshCb ) => {

	for ( const child of node.children ) {

		if ( child instanceof Group ) {

			groupCb( child );

			probeTestCube( child, groupCb, meshCb );

		}

		if ( child instanceof Mesh ) {

			meshCb( child );

		}

	}

};

test( 'setJSZip', () => {

	let loader = new RWXLoader();

	expect( loader.jsZip ).toBeNull();
	expect( loader.jsZipUtils ).toBeNull();
	expect( loader.setJSZip( JSZip, JSZipUtils ) ).toStrictEqual( loader );
	expect( loader.jsZip ).toStrictEqual( JSZip );
	expect( loader.jsZipUtils ).toStrictEqual( JSZipUtils );

} );

test( 'setTextureExtension', () => {

	let loader = new RWXLoader();

	expect( loader.textureExtension ).toBe( '.jpg' );
	expect( loader.setTextureExtension( '.png' ) ).toStrictEqual( loader );
	expect( loader.textureExtension ).toBe( '.png' );

} );

test( 'setMaskExtension', () => {

	let loader = new RWXLoader();

	expect( loader.maskExtension ).toBe( '.zip' );
	expect( loader.setMaskExtension( '.bmp' ) ).toStrictEqual( loader );
	expect( loader.maskExtension ).toBe( '.bmp' );

} );

test( 'setWaitFullLoad', () => {

	let loader = new RWXLoader();

	expect( loader.waitFullLoad ).toBe( false );
	expect( loader.setWaitFullLoad( true ) ).toStrictEqual( loader );
	expect( loader.waitFullLoad ).toBe( true );

} );

test( 'setFlatten', () => {

	let loader = new RWXLoader();

	expect( loader.flatten ).toBe( false );
	expect( loader.setFlatten( true ) ).toStrictEqual( loader );
	expect( loader.flatten ).toBe( true );

} );

test( 'setRWXMaterialManager', () => {

	let loader = new RWXLoader();
	let mgr = new RWXMaterialManager();

	expect( loader.rwxMaterialManager ).toBe( null );
	expect( loader.setRWXMaterialManager( mgr ) ).toStrictEqual( loader );
	expect( loader.rwxMaterialManager ).toStrictEqual( mgr );

} );

test( 'setUseBasicMaterial', () => {

	let loader = new RWXLoader();

	expect( loader.useBasicMaterial ).toBe( false );
	expect( loader.setUseBasicMaterial( true ) ).toStrictEqual( loader );
	expect( loader.useBasicMaterial ).toBe( true );

} );

test( 'setTextureEncoding', () => {

	let loader = new RWXLoader();

	expect( loader.textureEncoding ).toBe( sRGBEncoding );
	expect( loader.setTextureEncoding( LinearEncoding ) ).toStrictEqual( loader );
	expect( loader.textureEncoding ).toBe( LinearEncoding );

} );

test( 'setEnableTextures', () => {

	let loader = new RWXLoader();

	expect( loader.enableTextures ).toBe( true );
	expect( loader.setEnableTextures( false ) ).toStrictEqual( loader );
	expect( loader.enableTextures ).toBe( false );

} );

test( 'RWXMaterial', () => {

	let rwxMat = new RWXMaterial();

	expect( rwxMat.color ).toHaveLength( 3 );
	expect( rwxMat.color[ 0 ] ).toBe( 0.0 );
	expect( rwxMat.color[ 1 ] ).toBe( 0.0 );
	expect( rwxMat.color[ 2 ] ).toBe( 0.0 );
	expect( rwxMat.surface ).toHaveLength( 3 );
	expect( rwxMat.surface[ 0 ] ).toBe( 0.69 );
	expect( rwxMat.surface[ 1 ] ).toBe( 0.0 );
	expect( rwxMat.surface[ 2 ] ).toBe( 0.0 );
	expect( rwxMat.opacity ).toBe( 1.0 );
	expect( rwxMat.lightsampling ).toBe( LightSampling.FACET );
	expect( rwxMat.geometrysampling ).toBe( GeometrySampling.SOLID );
	expect( rwxMat.texturemodes ).toHaveLength( 1 );
	expect( rwxMat.texturemodes[ 0 ] ).toBe( TextureMode.LIT );
	expect( rwxMat.materialmode ).toBe( MaterialMode.NULL );
	expect( rwxMat.texture ).toBeNull();
	expect( rwxMat.mask ).toBeNull();
	expect( rwxMat.tag ).toBe( 0 );

	expect( rwxMat.getMatSignature() ).toBe( '0.0000.0000.000_0.6900.0000.000_1.000_1_3_1_1___true_0_1.00' );

	const clonedMat = rwxMat.clone();

	rwxMat.texture = 'wood1';
	rwxMat.mask = 'wood1m';
	rwxMat.tag = 100;
	rwxMat.ratio = 0.5;

	expect( rwxMat.getMatSignature() ).toBe( '0.0000.0000.000_0.6900.0000.000_1.000_1_3_1_1_wood1_wood1m_true_100_0.50' );

	rwxMat.color[ 0 ] = 1;
	rwxMat.color[ 1 ] = 2;
	rwxMat.color[ 2 ] = 3;
	rwxMat.surface[ 0 ] = 4;
	rwxMat.surface[ 1 ] = 5;
	rwxMat.surface[ 2 ] = 6;
	rwxMat.opacity = 0.5;
	rwxMat.lightsampling = LightSampling.VERTEX;
	rwxMat.geometrysampling = GeometrySampling.WIREFRAME;
	rwxMat.texturemodes.push( TextureMode.FILTER );
	rwxMat.materialmode = MaterialMode.NONE;
	rwxMat.texture = 'texture1';
	rwxMat.mask = 'texture1m';
	rwxMat.collision = false;

	// We ensure that everything was copied, down to the methods themselves
	expect( typeof clonedMat.constructor ).toBe( 'function' );
	expect( typeof clonedMat.clone ).toBe( 'function' );
	expect( typeof clonedMat.getColorHexValue ).toBe( 'function' );
	expect( typeof clonedMat.getMatSignature ).toBe( 'function' );

	expect( clonedMat.color ).toHaveLength( 3 );
	expect( clonedMat.color[ 0 ] ).toBe( 0.0 );
	expect( clonedMat.color[ 1 ] ).toBe( 0.0 );
	expect( clonedMat.color[ 2 ] ).toBe( 0.0 );
	expect( clonedMat.surface ).toHaveLength( 3 );
	expect( clonedMat.surface[ 0 ] ).toBe( 0.69 );
	expect( clonedMat.surface[ 1 ] ).toBe( 0.0 );
	expect( clonedMat.surface[ 2 ] ).toBe( 0.0 );
	expect( clonedMat.opacity ).toBe( 1.0 );
	expect( clonedMat.lightsampling ).toBe( LightSampling.FACET );
	expect( clonedMat.geometrysampling ).toBe( GeometrySampling.SOLID );
	expect( clonedMat.texturemodes ).toHaveLength( 1 );
	expect( clonedMat.texturemodes[ 0 ] ).toBe( TextureMode.LIT );
	expect( clonedMat.materialmode ).toBe( MaterialMode.NULL );
	expect( clonedMat.texture ).toBeNull();
	expect( clonedMat.mask ).toBeNull();
	expect( clonedMat.tag ).toBe( 0 );

} );

test( 'RWXMaterialManager', () => {

	const mgr = new RWXMaterialManager();

	expect( mgr.currentRWXMaterial.color ).toHaveLength( 3 );
	expect( mgr.currentRWXMaterial.color[ 0 ] ).toBe( 0.0 );
	expect( mgr.currentRWXMaterial.color[ 1 ] ).toBe( 0.0 );
	expect( mgr.currentRWXMaterial.color[ 2 ] ).toBe( 0.0 );
	expect( mgr.currentRWXMaterial.surface ).toHaveLength( 3 );
	expect( mgr.currentRWXMaterial.surface[ 0 ] ).toBe( 0.69 );
	expect( mgr.currentRWXMaterial.surface[ 1 ] ).toBe( 0.0 );
	expect( mgr.currentRWXMaterial.surface[ 2 ] ).toBe( 0.0 );
	expect( mgr.currentRWXMaterial.opacity ).toBe( 1.0 );
	expect( mgr.currentRWXMaterial.lightsampling ).toBe( LightSampling.FACET );
	expect( mgr.currentRWXMaterial.geometrysampling ).toBe( GeometrySampling.SOLID );
	expect( mgr.currentRWXMaterial.texturemodes ).toHaveLength( 1 );
	expect( mgr.currentRWXMaterial.texturemodes[ 0 ] ).toBe( TextureMode.LIT );
	expect( mgr.currentRWXMaterial.materialmode ).toBe( MaterialMode.NULL );
	expect( mgr.currentRWXMaterial.texture ).toBeNull();
	expect( mgr.currentRWXMaterial.mask ).toBeNull();
	expect( mgr.currentRWXMaterial.tag ).toBe( 0 );
	expect( mgr.currentMaterialList ).toHaveLength( 0 );
	expect( mgr.getCurrentMaterialID() ).toBe( 0 );
	expect( mgr.currentMaterialList ).toHaveLength( 1 );

	// Change the material
	mgr.currentRWXMaterial.color[ 0 ] = 0.5;
	expect( mgr.getCurrentMaterialID() ).toBe( 1 );
	expect( mgr.getCurrentMaterialList() ).toHaveLength( 2 );

	// Go back to the previous material
	mgr.currentRWXMaterial.color[ 0 ] = 0.0;
	expect( mgr.getCurrentMaterialID() ).toBe( 0 );
	expect( mgr.getCurrentMaterialList() ).toHaveLength( 2 );

	expect( mgr.getCommitedMaterialList() ).toHaveLength( 0 );
	mgr.commitMaterials();
	expect( mgr.getCommitedMaterialList() ).toHaveLength( 2 );

	mgr.resetCurrentMaterialList();
	expect( mgr.currentMaterialList ).toHaveLength( 0 );
	expect( mgr.getCommitedMaterialList() ).toHaveLength( 0 );

} );

test( 'Prop loading: single mesh', async () => {

	const rwx = await loadTestCube( true );

	expect( rwx ).toBeInstanceOf( Mesh );
	expect( rwx.material ).toHaveLength( 7 );
	expect( rwx.geometry.getAttribute( 'position' ).count ).toBe( 6 * 4 + 4 ); // 6 faces, 4 vertices each, plus 4 wasted polygon vertices
	expect( rwx.geometry.getAttribute( 'position' ).array ).toHaveLength( (6 * 4 + 4) * 3 ); // (X, Y, Z) for each vertex
	expect( rwx.geometry.getIndex().count ).toBe( 6 * 2 * 3 ); // 2 triangles per face, 3 vertex indices to make a triangle
	expect( rwx.geometry.getIndex().array ).toHaveLength( 6 * 2 * 3 ); // Same here
	expect( rwx.material[4].userData.rwx.material.tag ).toBe( 100 );

	const boundingBox = new Box3();
	boundingBox.setFromObject( rwx );

	expect( boundingBox.min.x ).toBeCloseTo( -1, numDigits );
	expect( boundingBox.min.y ).toBeCloseTo( -1, numDigits );
	expect( boundingBox.min.z ).toBeCloseTo( -1, numDigits );

	expect( boundingBox.max.x ).toBeCloseTo( 1, numDigits );
	expect( boundingBox.max.y ).toBeCloseTo( 1, numDigits );
	expect( boundingBox.max.z ).toBeCloseTo( 1, numDigits );

	// Check that vertices are overall placed in plausible spots (for a cube)
	let nb_x_negative = 0;
	let nb_x_positive = 0;
	let nb_y_negative = 0;
	let nb_y_positive = 0;
	let nb_z_negative = 0;
	let nb_z_positive = 0;

	for ( let i = 0, positions = rwx.geometry.getAttribute( 'position' ).array; i < positions.length ; i += 3 ) {

		const [ x, y, z ] = positions.slice( i, i + 3 );

		if ( x > -1.01 && x < -0.99 ) {

			nb_x_negative++;

		}

		if ( x > 0.99 && x < 1.01 ) {

			nb_x_positive++;

		}

		if ( y > -1.01 && y < -0.99 ) {

			nb_y_negative++;

		}

		if ( y > 0.99 && y < 1.01 ) {

			nb_y_positive++;

		}

		if ( z > -1.01 && z < -0.99 ) {

			nb_z_negative++;

		}

		if ( z > 0.99 && z < 1.01 ) {

			nb_z_positive++;

		}

	}

	expect( nb_x_negative ).toBe( 12 + 2 ); // /!\ 2 wasted polygon vertices
	expect( nb_x_positive ).toBe( 12 + 2 ); // /!\ 2 wasted polygon vertices
	expect( nb_y_negative ).toBe( 12 + 4 ); // /!\ 4 wasted polygon vertices
	expect( nb_y_positive ).toBe( 12 );
	expect( nb_z_negative ).toBe( 12 + 2 ); // /!\ 2 wasted polygon vertices
	expect( nb_z_positive ).toBe( 12 + 2 ); // /!\ 2 wasted polygon vertices

} );

test( 'Prop loading: clump group', async () => {

	const rwx = await loadTestCube( false );

	let nbGroups = 0;
	let nbMeshes = 0;
	let nbMaxChildrenInGroup = 0;
	let nbMaterials = 0;
	let nbVertexCoords = 0;
	let nbFaceIndices = 0;
	const foundClumpTags = [];
	const foundMaterialTags = [];

	expect( rwx ).toBeInstanceOf( Group );

	probeTestCube( rwx, ( g ) => {

		nbGroups++;

		if ( g.children.length > nbMaxChildrenInGroup ) {

			nbMaxChildrenInGroup = g.children.length;

		}

		if ( g.userData?.rwx?.tag ) {

			foundClumpTags.push( g.userData.rwx.tag );

		}

	}, ( m ) => {

		const positions = m.geometry.getAttribute( 'position' ).array;

		nbMeshes++;
		nbMaterials += m.material.length;
		nbVertexCoords += positions.length;
		nbFaceIndices += m.geometry.getIndex().array.length;

		for ( const material of m.material ) {

			if ( material.userData.rwx?.material?.tag ) {

				foundMaterialTags.push( material.userData.rwx.material.tag );

			}

		}

	} );

	expect( nbMeshes ).toBe( 6 );
	expect( nbGroups ).toBe( 10 ); // There are 6 declared clumps and 4 protoinstance statements
	expect( nbMaxChildrenInGroup ).toBe( 5 ); // 4 clumps and 1 protoinstance
	expect( nbMaterials ).toBe( 7 );
	expect( nbVertexCoords ).toBe( (6 * 4 + 4) * 3 ); // 6 faces, 4 vertices each (plus 4 wasted polygon vertices), 3 coordinates each
	expect( nbFaceIndices ).toBe( 6 * 2 * 3 ); // 2 triangles per face, 3 vertex indices to make a triangle
	expect( foundClumpTags ).toHaveLength( 1 );
	expect( foundClumpTags[0] ).toBe( 3 );
	expect( foundMaterialTags ).toHaveLength( 1 );
	expect( foundMaterialTags[0] ).toBe( 100 );

	const boundingBox = new Box3();
	boundingBox.setFromObject( rwx );

	expect( boundingBox.min.x ).toBeCloseTo( -1, numDigits );
	expect( boundingBox.min.y ).toBeCloseTo( -1, numDigits );
	expect( boundingBox.min.z ).toBeCloseTo( -1, numDigits );

	expect( boundingBox.max.x ).toBeCloseTo( 1, numDigits );
	expect( boundingBox.max.y ).toBeCloseTo( 1, numDigits );
	expect( boundingBox.max.z ).toBeCloseTo( 1, numDigits );

} );
