/**
 * @author Julien 'Blaxar' Bardagi <blaxar.waldarax@gmail.com>
 */

import RWXLoader from './RWXLoader.js';

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

test('setTexExtension', () => {
    let loader = new RWXLoader();

    expect(loader.texExtension).toBe("jpg");
    expect(loader.setTexExtension("png")).toStrictEqual(loader);
    expect(loader.texExtension).toBe("png");
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
