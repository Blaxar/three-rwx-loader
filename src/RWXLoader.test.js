/**
 * @author Julien 'Blaxar' Bardagi <blaxar.waldarax@gmail.com>
 */

import { LinearSRGBColorSpace, SRGBColorSpace, TextureLoader, Mesh, Group, Box3, Raycaster, Vector3, MeshPhongMaterial } from 'three';
import RWXLoader, { RWXMaterial, RWXMaterialManager, RWXMaterialTracker, LightSampling, GeometrySampling,
	TextureMode, MaterialMode, TextureAddressMode } from './RWXLoader.js';
import * as fflate from 'fflate';
import { createServer } from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as assert from 'assert';

const port = 8085;
const epsilon = 0.00001;

const isCloseTo = ( val, ref, eps ) => {

	return val < ref + eps && val > ref - eps ;

};

const loadTestCube = ( flatten ) => {

	return new Promise( ( resolve, error ) => {

		const loader = new RWXLoader();

		assert.strictEqual( loader.setPath( 'http://127.0.0.1:' + port + '/samples/rwx' )
			.setResourcePath( 'http://127.0.0.1:' + port + '/samples/textures' ).setEnableTextures( false )
			.setWaitFullLoad( true ).setFlatten( flatten ), loader );

		loader.load( 'cube.rwx', rwx => {

			resolve( rwx );

		}, null, e => {

			error( e );

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

describe( 'RWXLoader', () => {

	it( 'setFflate', () => {

		let loader = new RWXLoader();

		assert.equal( loader.fflate, null );
		assert.strictEqual( loader.setFflate( fflate ), loader );
		assert.strictEqual( loader.fflate, fflate );

	} );

	it( 'setTextureExtension', () => {

		let loader = new RWXLoader();

		assert.equal( loader.textureExtension, '.jpg' );
		assert.strictEqual( loader.setTextureExtension( '.png' ), loader );
		assert.equal( loader.textureExtension, '.png' );

	} );

	it( 'setMaskExtension', () => {

		let loader = new RWXLoader();

		assert.equal( loader.maskExtension, '.zip' );
		assert.strictEqual( loader.setMaskExtension( '.bmp' ), loader );
		assert.equal( loader.maskExtension, '.bmp' );

	} );

	it( 'setWaitFullLoad', () => {

		let loader = new RWXLoader();

		assert.equal( loader.waitFullLoad, false );
		assert.strictEqual( loader.setWaitFullLoad( true ), loader );
		assert.equal( loader.waitFullLoad, true );

	} );

	it( 'setFlatten', () => {

		let loader = new RWXLoader();

		assert.equal( loader.flatten, false );
		assert.strictEqual( loader.setFlatten( true ), loader );
		assert.equal( loader.flatten, true );

	} );

	it( 'setRWXMaterialManager', () => {

		let loader = new RWXLoader();
		let mgr = new RWXMaterialManager();

		assert.equal( loader.rwxMaterialManager, null );
		assert.strictEqual( loader.setRWXMaterialManager( mgr ), loader );
		assert.strictEqual( loader.rwxMaterialManager, mgr );

	} );

	it( 'setUseBasicMaterial', () => {

		let loader = new RWXLoader();

		assert.equal( loader.useBasicMaterial, false );
		assert.strictEqual( loader.setUseBasicMaterial( true ), loader );
		assert.equal( loader.useBasicMaterial, true );

	} );

	it( 'setTextureColorSpace', () => {

		let loader = new RWXLoader();

		assert.equal( loader.textureColorSpace, SRGBColorSpace );
		assert.strictEqual( loader.setTextureColorSpace( LinearSRGBColorSpace ), loader );
		assert.equal( loader.textureColorSpace, LinearSRGBColorSpace );

	} );

	it( 'setEnableTextures', () => {

		let loader = new RWXLoader();

		assert.equal( loader.enableTextures, true );
		assert.strictEqual( loader.setEnableTextures( false ), loader );
		assert.equal( loader.enableTextures, false );

	} );

	it( 'setForceEarcut', () => {

		let loader = new RWXLoader();

		assert.equal( loader.forceEarcut, false );
		assert.strictEqual( loader.setForceEarcut( true ), loader );
		assert.equal( loader.forceEarcut, true );

	} );

	it( 'setVerboseWarning', () => {

		let loader = new RWXLoader();

		assert.equal( loader.verboseWarning, false );
		assert.strictEqual( loader.setVerboseWarning( true ), loader );
		assert.equal( loader.verboseWarning, true );

	} );

	it( 'setAlphaTest', () => {

		let loader = new RWXLoader();

		assert.equal( loader.alphaTest, 0.2 );
		assert.strictEqual( loader.setAlphaTest( 0.6 ), loader );
		assert.equal( loader.alphaTest, 0.6 );

	} );

	it( 'setForceTextureFiltering', () => {

		let loader = new RWXLoader();

		assert.equal( loader.forceTextureFiltering, true );
		assert.strictEqual( loader.setForceTextureFiltering( false ), loader );
		assert.equal( loader.forceTextureFiltering, false );

	} );

	it( 'RWXMaterial', () => {

		let rwxMat = new RWXMaterial();

		assert.equal( rwxMat.color.length, 3 );
		assert.equal( rwxMat.color[ 0 ], 0.0 );
		assert.equal( rwxMat.color[ 1 ], 0.0 );
		assert.equal( rwxMat.color[ 2 ], 0.0 );
		assert.equal( rwxMat.surface.length, 3 );
		assert.equal( rwxMat.surface[ 0 ], 0.69 );
		assert.equal( rwxMat.surface[ 1 ], 0.0 );
		assert.equal( rwxMat.surface[ 2 ], 0.0 );
		assert.equal( rwxMat.opacity, 1.0 );
		assert.equal( rwxMat.lightsampling, LightSampling.FACET );
		assert.equal( rwxMat.geometrysampling, GeometrySampling.SOLID );
		assert.equal( rwxMat.texturemodes.length, 3 );
		assert.equal( rwxMat.texturemodes[ 0 ], TextureMode.LIT );
		assert.equal( rwxMat.texturemodes[ 1 ], TextureMode.FORESHORTEN );
		assert.equal( rwxMat.texturemodes[ 2 ], TextureMode.FILTER );
		assert.equal( rwxMat.materialmode, MaterialMode.NULL );
		assert.equal( rwxMat.texture, null );
		assert.equal( rwxMat.mask, null );
		assert.equal( rwxMat.textureaddressmode, TextureAddressMode.WRAP );
		assert.equal( rwxMat.tag, 0 );

		assert.equal( rwxMat.getMatSignature(), '0.0000.0000.000_0.6900.0000.000_1.000_1_3_123_1___0_true_0_1.00' );

		const clonedMat = rwxMat.clone();

		rwxMat.texture = 'wood1';
		rwxMat.mask = 'wood1m';
		rwxMat.tag = 100;
		rwxMat.ratio = 0.5;

		assert.equal( rwxMat.getMatSignature(), '0.0000.0000.000_0.6900.0000.000_1.000_1_3_123_1_wood1_wood1m_0_true_100_0.50' );

		rwxMat.color[ 0 ] = 1;
		rwxMat.color[ 1 ] = 2;
		rwxMat.color[ 2 ] = 3;
		rwxMat.surface[ 0 ] = 4;
		rwxMat.surface[ 1 ] = 5;
		rwxMat.surface[ 2 ] = 6;
		rwxMat.opacity = 0.5;
		rwxMat.lightsampling = LightSampling.VERTEX;
		rwxMat.geometrysampling = GeometrySampling.WIREFRAME;
		rwxMat.texturemodes.pop();
		rwxMat.materialmode = MaterialMode.NONE;
		rwxMat.texture = 'texture1';
		rwxMat.mask = 'texture1m';
		rwxMat.textureaddressmode = TextureAddressMode.CLAMP;
		rwxMat.collision = false;

		// We ensure that everything was copied, down to the methods themselves
		assert.equal( typeof clonedMat.constructor, 'function' );
		assert.equal( typeof clonedMat.clone, 'function' );
		assert.equal( typeof clonedMat.getColorHexValue, 'function' );
		assert.equal( typeof clonedMat.getMatSignature, 'function' );

		assert.equal( clonedMat.color.length, 3 );
		assert.equal( clonedMat.color[ 0 ], 0.0 );
		assert.equal( clonedMat.color[ 1 ], 0.0 );
		assert.equal( clonedMat.color[ 2 ], 0.0 );
		assert.equal( clonedMat.surface.length, 3 );
		assert.equal( clonedMat.surface[ 0 ], 0.69 );
		assert.equal( clonedMat.surface[ 1 ], 0.0 );
		assert.equal( clonedMat.surface[ 2 ], 0.0 );
		assert.equal( clonedMat.opacity, 1.0 );
		assert.equal( clonedMat.lightsampling, LightSampling.FACET );
		assert.equal( clonedMat.geometrysampling, GeometrySampling.SOLID );
		assert.equal( clonedMat.texturemodes.length, 3 );
		assert.equal( clonedMat.texturemodes[ 0 ], TextureMode.LIT );
		assert.equal( clonedMat.texturemodes[ 1 ], TextureMode.FORESHORTEN );
		assert.equal( clonedMat.texturemodes[ 2 ], TextureMode.FILTER );
		assert.equal( clonedMat.materialmode, MaterialMode.NULL );
		assert.equal( clonedMat.texture, null);
		assert.equal( clonedMat.mask, null);
		assert.equal( clonedMat.textureaddressmode, TextureAddressMode.WRAP );
		assert.equal( clonedMat.tag, 0 );

	} );

	it( 'RWXMaterialTracker', () => {

		const mgr = new RWXMaterialTracker( new RWXMaterialManager() );

		assert.equal( mgr.currentRWXMaterial.color.length, 3 );
		assert.equal( mgr.currentRWXMaterial.color[ 0 ], 0.0 );
		assert.equal( mgr.currentRWXMaterial.color[ 1 ], 0.0 );
		assert.equal( mgr.currentRWXMaterial.color[ 2 ], 0.0 );
		assert.equal( mgr.currentRWXMaterial.surface.length, 3 );
		assert.equal( mgr.currentRWXMaterial.surface[ 0 ], 0.69 );
		assert.equal( mgr.currentRWXMaterial.surface[ 1 ], 0.0 );
		assert.equal( mgr.currentRWXMaterial.surface[ 2 ], 0.0 );
		assert.equal( mgr.currentRWXMaterial.opacity, 1.0 );
		assert.equal( mgr.currentRWXMaterial.lightsampling, LightSampling.FACET );
		assert.equal( mgr.currentRWXMaterial.geometrysampling, GeometrySampling.SOLID );
		assert.equal( mgr.currentRWXMaterial.texturemodes.length, 3 );
		assert.equal( mgr.currentRWXMaterial.texturemodes[ 0 ], TextureMode.LIT );
		assert.equal( mgr.currentRWXMaterial.texturemodes[ 1 ], TextureMode.FORESHORTEN );
		assert.equal( mgr.currentRWXMaterial.texturemodes[ 2 ], TextureMode.FILTER );
		assert.equal( mgr.currentRWXMaterial.materialmode, MaterialMode.NULL );
		assert.equal( mgr.currentRWXMaterial.texture, null);
		assert.equal( mgr.currentRWXMaterial.mask, null);
		assert.equal( mgr.currentRWXMaterial.tag, 0 );
		assert.equal( mgr.currentMaterialList.length, 0 );
		assert.equal( mgr.getCurrentMaterialID(), 0 );
		assert.equal( mgr.currentMaterialList.length, 1 );

		// Change the material
		mgr.currentRWXMaterial.color[ 0 ] = 0.5;
		assert.equal( mgr.getCurrentMaterialID(), 1 );
		assert.equal( mgr.getCurrentMaterialList().length, 2 );

		// Go back to the previous material
		mgr.currentRWXMaterial.color[ 0 ] = 0.0;
		assert.equal( mgr.getCurrentMaterialID(), 0 );
		assert.equal( mgr.getCurrentMaterialList().length, 2 );

		assert.equal( mgr.getCommitedMaterialList().length, 0 );
		mgr.commitMaterials();
		assert.equal( mgr.getCommitedMaterialList().length, 2 );

		mgr.clearCurrentMaterialList();
		assert.equal( mgr.currentMaterialList.length, 0 );
		assert.equal( mgr.getCommitedMaterialList().length, 0 );

	} );

	it( 'RWXMaterialManager', () => {

		const mgr = new RWXMaterialManager();
		const material = new RWXMaterial();

		const signature = material.getMatSignature();

		assert.equal( mgr.threeMaterialMap.size, 0 );

		mgr.addRWXMaterial( material );
		assert.ok( mgr.hasThreeMaterialPack( signature ) );
		assert.equal( mgr.threeMaterialMap.size, 1 );
		assert.equal( mgr.getThreeMaterialPack( signature ).signature, signature );

		// Change the material
		material.color[ 0 ] = 0.5;
		mgr.addRWXMaterial( material );
		assert.ok( mgr.hasThreeMaterialPack( material.getMatSignature() ) );
		assert.equal( mgr.threeMaterialMap.size, 2 );
		assert.equal( mgr.getThreeMaterialPack( material.getMatSignature() ).signature, material.getMatSignature() );

		mgr.removeThreeMaterialPack( signature );
		assert.ok( ! mgr.hasThreeMaterialPack( signature ) );
		assert.equal( mgr.threeMaterialMap.size, 1 );
		assert.equal( typeof mgr.getThreeMaterialPack( signature ), 'undefined' );
		assert.equal( mgr.getThreeMaterialPack( material.getMatSignature() ).signature, material.getMatSignature() );

		mgr.clear();
		assert.equal( mgr.threeMaterialMap.size, 0 );
		assert.equal( typeof mgr.getThreeMaterialPack( material.getMatSignature() ), 'undefined' );

	} );

	it( 'Prop loading: single mesh', async () => {

		const rwx = await loadTestCube( true );

		assert.ok( rwx instanceof Mesh );
		assert.equal( rwx.material.length, 7 );
		assert.equal( rwx.geometry.getAttribute( 'position' ).count, 6 * 4 ); // 6 faces, 4 vertices each, plus 4 wasted polygon vertices
		assert.equal( rwx.geometry.getAttribute( 'position' ).array.length, 6 * 4 * 3 ); // (X, Y, Z) for each vertex
		assert.equal( rwx.geometry.getIndex().count, 6 * 2 * 3 ); // 2 triangles per face, 3 vertex indices to make a triangle
		assert.equal( rwx.geometry.getIndex().array.length, 6 * 2 * 3 ); // Same here
		assert.equal( rwx.material[4].userData.rwx.material.tag, 100 );

		const boundingBox = new Box3();
		boundingBox.setFromObject( rwx );

		assert.ok( isCloseTo( boundingBox.min.x, -1, epsilon ) );
		assert.ok( isCloseTo( boundingBox.min.y, -1, epsilon ) );
		assert.ok( isCloseTo( boundingBox.min.z, -1, epsilon ) );

		assert.ok( isCloseTo( boundingBox.max.x, 1, epsilon ) );
		assert.ok( isCloseTo( boundingBox.max.y, 1, epsilon ) );
		assert.ok( isCloseTo( boundingBox.max.z, 1, epsilon ) );

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

		assert.equal( nb_x_negative, 12 );
		assert.equal( nb_x_positive, 12 );
		assert.equal( nb_y_negative, 12 );
		assert.equal( nb_y_positive, 12 );
		assert.equal( nb_z_negative, 12 );
		assert.equal( nb_z_positive, 12 );

	} );

	it( 'Prop loading: clump group', async () => {

		const rwx = await loadTestCube( false );

		let nbGroups = 0;
		let nbMeshes = 0;
		let nbMaxChildrenInGroup = 0;
		let nbMaterials = 0;
		let nbVertexCoords = 0;
		let nbFaceIndices = 0;
		const foundClumpTags = [];
		const foundMaterialTags = [];

    // Ready all the casters
		const xCasterLeftFront = new Raycaster( new Vector3( -5, 0, -0.5 ), new Vector3( 1, 0, 0 ), 0, 5 );
		const xCasterLeftBack = new Raycaster( new Vector3( 5, 0, -0.5 ), new Vector3( -1, 0, 0 ), 0, 5 );
		const xCasterRightFront = new Raycaster( new Vector3( -5, 0, 0.5 ), new Vector3( 1, 0, 0 ), 0, 5 );
		const xCasterRightBack = new Raycaster( new Vector3( 5, 0, 0.5 ), new Vector3( -1, 0, 0 ), 0, 5 );
		const yCasterLeftFront = new Raycaster( new Vector3( 0, -5, -0.5 ), new Vector3( 0, 1, 0 ), 0, 5 );
		const yCasterLeftBack = new Raycaster( new Vector3( 0, 5, -0.5 ), new Vector3( 0, -1, 0 ), 0, 5 );
		const yCasterRightFront = new Raycaster( new Vector3( 0, -5, 0.5 ), new Vector3( 0, 1, 0 ), 0, 5 );
		const yCasterRightBack = new Raycaster( new Vector3( 0, 5, 0.5 ), new Vector3( 0, -1, 0 ), 0, 5 );
		const zCasterLeftFront = new Raycaster( new Vector3( -0.5, 0, -5 ), new Vector3( 0, 0, 1 ), 0, 5 );
		const zCasterLeftBack = new Raycaster( new Vector3( -0.5, 0, 5 ), new Vector3( 0, 0, -1 ), 0, 5 );
		const zCasterRightFront = new Raycaster( new Vector3( 0.5, 0, -5 ), new Vector3( 0, 0, 1 ), 0, 5 );
		const zCasterRightBack = new Raycaster( new Vector3( 0.5, 0, 5 ), new Vector3( 0, 0, -1 ), 0, 5 );

    let xCasterLeftCount = 0;
		let xCasterRightCount = 0;
		let yCasterLeftCount = 0;
		let yCasterRightCount = 0;
		let zCasterLeftCount = 0;
		let zCasterRightCount = 0;

		assert.ok( rwx instanceof Group );

		const boundingBox = new Box3();
		boundingBox.setFromObject( rwx );

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

			xCasterLeftCount += xCasterLeftFront.intersectObjects( [ m ], false ).length + xCasterLeftBack.intersectObjects( [ m ], false ).length;
			xCasterRightCount += xCasterRightFront.intersectObjects( [ m ], false ).length + xCasterRightBack.intersectObjects( [ m ], false ).length;
			yCasterLeftCount += yCasterLeftFront.intersectObjects( [ m ], false ).length + yCasterLeftBack.intersectObjects( [ m ], false ).length;
			yCasterRightCount += yCasterRightFront.intersectObjects( [ m ], false ).length + yCasterRightBack.intersectObjects( [ m ], false ).length;
			zCasterLeftCount += zCasterLeftFront.intersectObjects( [ m ], false ).length + zCasterLeftBack.intersectObjects( [ m ], false ).length;
			zCasterRightCount += zCasterRightFront.intersectObjects( [ m ], false ).length + zCasterRightBack.intersectObjects( [ m ], false ).length;

			for ( const material of m.material ) {

				if ( material.userData.rwx?.material?.tag ) {

					foundMaterialTags.push( material.userData.rwx.material.tag );

				}

			}

		} );

		assert.equal( nbMeshes, 6 );
		assert.equal( nbGroups, 10 ); // There are 6 declared clumps and 4 protoinstance statements
		assert.equal( nbMaxChildrenInGroup, 5 ); // 4 clumps and 1 protoinstance
		assert.equal( nbMaterials, 7 );
		assert.equal( nbVertexCoords, 6 * 4 * 3 ); // 6 faces, 4 vertices each, 3 coordinates each
		assert.equal( nbFaceIndices, 6 * 2 * 3 ); // 2 triangles per face, 3 vertex indices to make a triangle
		assert.equal( foundClumpTags.length, 1 );
		assert.equal( foundClumpTags[0], 3 );
		assert.equal( foundMaterialTags.length, 1 );
		assert.equal( foundMaterialTags[0], 100 );

		assert.ok( isCloseTo( boundingBox.min.x, -1, epsilon ) );
		assert.ok( isCloseTo( boundingBox.min.y, -1, epsilon ) );
		assert.ok( isCloseTo( boundingBox.min.z, -1, epsilon ) );

		assert.ok( isCloseTo( boundingBox.max.x, 1, epsilon ) );
		assert.ok( isCloseTo( boundingBox.max.y, 1, epsilon ) );
		assert.ok( isCloseTo( boundingBox.max.z, 1, epsilon ) );

		assert.equal( xCasterLeftCount, 2 );
		assert.equal( xCasterRightCount, 2 );
		assert.equal( yCasterLeftCount, 2 );
		assert.equal( yCasterRightCount, 2 );
		assert.equal( zCasterLeftCount, 2 );
		assert.equal( zCasterRightCount, 2 );

	} );

} );
