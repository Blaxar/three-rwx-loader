/**
 * @author Julien 'Blaxar' Bardagi <blaxar.waldarax@gmail.com>
 */

import { Matrix4 } from 'three';
import RWXLoader, { RWXMaterial, LightSampling, GeometrySampling, TextureMode, MaterialMode } from './RWXLoader.js';

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
    expect(rwxMat.transform.equals(new Matrix4)).toBe(true);

    expect(rwxMat.getMatSignature()).toBe("0.0000.0000.0000.0000.0000.0001.0001311true");

    rwxMat.texture = "wood1";
    rwxMat.mask = "wood1m";

    expect(rwxMat.getMatSignature()).toBe("0.0000.0000.0000.0000.0000.0001.0001311wood1wood1mtrue");
});
