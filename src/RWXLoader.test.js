/**
 * @author Julien 'Blaxar' Bardagi <blaxar.waldarax@gmail.com>
 */

import { Matrix4, LinearEncoding, sRGBEncoding } from 'three';
import RWXLoader, { RWXMaterial, RWXMaterialManager, LightSampling, GeometrySampling, TextureMode, MaterialMode } from './RWXLoader.js';

test('setJSZip', () => {
    let loader = new RWXLoader();

    expect(loader.jsZip).toBeNull();
    expect(loader.jsZipUtils).toBeNull();
    // Note: in a real-life scenario, we would expect valid JSZip and JSZipUtils instances
    // to be provided there.
    expect(loader.setJSZip("some data", "some other data")).toStrictEqual(loader);
    expect(loader.jsZip).toBe("some data");
    expect(loader.jsZipUtils).toBe("some other data");
});

test('setTextureExtension', () => {
    let loader = new RWXLoader();

    expect(loader.textureExtension).toBe("jpg");
    expect(loader.setTextureExtension("png")).toStrictEqual(loader);
    expect(loader.textureExtension).toBe("png");
});

test('setMaskExtension', () => {
    let loader = new RWXLoader();

    expect(loader.maskExtension).toBe("zip");
    expect(loader.setMaskExtension("bmp")).toStrictEqual(loader);
    expect(loader.maskExtension).toBe("bmp");
});

test('setWaitFullLoad', () => {
    let loader = new RWXLoader();

    expect(loader.waitFullLoad).toBe(false);
    expect(loader.setWaitFullLoad(true)).toStrictEqual(loader);
    expect(loader.waitFullLoad).toBe(true);
});

test('setFlatten', () => {
    let loader = new RWXLoader();

    expect(loader.flatten).toBe(false);
    expect(loader.setFlatten(true)).toStrictEqual(loader);
    expect(loader.flatten).toBe(true);
});

test('setRWXMaterialManager', () => {
    let loader = new RWXLoader();
    let mgr = new RWXMaterialManager();

    expect(loader.rwxMaterialManager).toBe(null);
    expect(loader.setRWXMaterialManager(mgr)).toStrictEqual(loader);
    expect(loader.rwxMaterialManager).toStrictEqual(mgr);
});

test('setUseBasicMaterial', () => {
    let loader = new RWXLoader();

    expect(loader.useBasicMaterial).toBe(false);
    expect(loader.setUseBasicMaterial(true)).toStrictEqual(loader);
    expect(loader.useBasicMaterial).toBe(true);
});

test('setTextureEncoding', () => {
    let loader = new RWXLoader();

    expect(loader.textureEncoding).toBe(LinearEncoding);
    expect(loader.setTextureEncoding(sRGBEncoding)).toStrictEqual(loader);
    expect(loader.textureEncoding).toBe(sRGBEncoding);
});

test('RWXMaterial', () => {
    let rwxMat = new RWXMaterial();

    expect(rwxMat.color).toHaveLength(3);
    expect(rwxMat.color[0]).toBe(0.0);
    expect(rwxMat.color[1]).toBe(0.0);
    expect(rwxMat.color[2]).toBe(0.0);
    expect(rwxMat.surface).toHaveLength(3);
    expect(rwxMat.surface[0]).toBe(0.0);
    expect(rwxMat.surface[1]).toBe(0.0);
    expect(rwxMat.surface[2]).toBe(0.0);
    expect(rwxMat.opacity).toBe(1.0);
    expect(rwxMat.lightsampling).toBe(LightSampling.FACET);
    expect(rwxMat.geometrysampling).toBe(GeometrySampling.SOLID);
    expect(rwxMat.texturemodes).toHaveLength(1);
    expect(rwxMat.texturemodes[0]).toBe(TextureMode.LIT);
    expect(rwxMat.materialmode).toBe(MaterialMode.NULL);
    expect(rwxMat.texture).toBeNull();
    expect(rwxMat.mask).toBeNull();
    expect(rwxMat.tag).toBe(0);

    expect(rwxMat.getMatSignature()).toBe("0.0000.0000.0000.0000.0000.0001.0001311true0");

    const clonedMat = rwxMat.clone();

    rwxMat.texture = "wood1";
    rwxMat.mask = "wood1m";
    rwxMat.tag = 100;

    expect(rwxMat.getMatSignature()).toBe("0.0000.0000.0000.0000.0000.0001.0001311wood1wood1mtrue100");

    rwxMat.color[0] = 1;
    rwxMat.color[1] = 2;
    rwxMat.color[2] = 3;
    rwxMat.surface[0] = 4;
    rwxMat.surface[1] = 5;
    rwxMat.surface[2] = 6;
    rwxMat.opacity = 0.5;
    rwxMat.lightsampling = LightSampling.VERTEX;
    rwxMat.geometrysampling = GeometrySampling.WIREFRAME;
    rwxMat.texturemodes.push(TextureMode.FILTER);
    rwxMat.materialmode = MaterialMode.NONE;
    rwxMat.texture = "texture1";
    rwxMat.mask = "texture1m";
    rwxMat.collision = false;

    // We ensure that everything was copied, down to the methods themselves
    expect(typeof clonedMat.constructor).toBe('function');
    expect(typeof clonedMat.clone).toBe('function');
    expect(typeof clonedMat.getColorHexValue).toBe('function');
    expect(typeof clonedMat.getMatSignature).toBe('function');

    expect(clonedMat.color).toHaveLength(3);
    expect(clonedMat.color[0]).toBe(0.0);
    expect(clonedMat.color[1]).toBe(0.0);
    expect(clonedMat.color[2]).toBe(0.0);
    expect(clonedMat.surface).toHaveLength(3);
    expect(clonedMat.surface[0]).toBe(0.0);
    expect(clonedMat.surface[1]).toBe(0.0);
    expect(clonedMat.surface[2]).toBe(0.0);
    expect(clonedMat.opacity).toBe(1.0);
    expect(clonedMat.lightsampling).toBe(LightSampling.FACET);
    expect(clonedMat.geometrysampling).toBe(GeometrySampling.SOLID);
    expect(clonedMat.texturemodes).toHaveLength(1);
    expect(clonedMat.texturemodes[0]).toBe(TextureMode.LIT);
    expect(clonedMat.materialmode).toBe(MaterialMode.NULL);
    expect(clonedMat.texture).toBeNull();
    expect(clonedMat.mask).toBeNull();
    expect(clonedMat.tag).toBe(0);
});
