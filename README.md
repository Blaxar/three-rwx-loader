# RWXLoader

three.js loader to import Active Worlds RenderWare scripts (.rwx)

## What's RenderWare?

RenderWare (RW), developed by Criterion Software Limited, is the name of the 3D API graphics rendering engine used in the on-line, 3D, virtual reality and interactive environment Active Worlds (AW)

## What's a RenderWare script?

A RenderWare script (RWX) file is an ASCII text file of an object/model's geometry.
This geometry consists of vertices, polygons, and material information.

## What's three.js?

It aims to be an easy to use, lightweight, cross-browser, general purpose 3D library.
It's also a dependency of this package.

## Installation

```bash
$ npm install three-rwx-loader
```

## Usage

```javascript
import RWXLoader from 'RWXLoader';

// For optional (but strongly advised) fflate usage
import * as fflate from 'fflate';

let rwxLoader = new RWXLoader();

// Like other three.js loaders: this one supports chained commands
rwxLoader.setPath('some/path/rwx').setResourcePath('some/path/textures').setFflate(fflate).setWaitFullLoad(true).setFlatten(true);

rwxLoader.load('object.rwx', (rwx) => {
      // Do something with 'rwx' there, it is guaranteed to be an Object3D from three.js
    });
```

## API documentation

By virtue of inheriting from the *three.js* `Loader` class: this loader comes with a set of expected setters such as `setPath` and `setResourcePath`.

However, it also brings its specific set of methods as described below:

- `setFflate( fflate: fflate ): this`

  - Provide fflate module to the loader, required for proper texture masks handling.

- `setTextureExtension( textureExtension: string ): this`

  - Set the expected texture files extension, '.jpg' by default.

- `setMaskExtension( maskExtension: string ): this`

  - Set the expected texture mask files extension, '.zip' by default.

- `setWaitFullLoad( waitFullLoad: boolean ): this`

  - Whether or not to wait for full loading completion before returning the objet, `false` by default (meaning textures are loaded asynchronously).

  - Set this to `true` for the loader to only return the object once it's fully loaded.

- `setFlatten( flatten: boolean ): this`

  - Whether or not to flatten the objet, `false` by default (the object will consist of nested `Group`s).
Set this to `true` to get a single `Mesh` holding everything.

  - In both cases: the object will inherit from `Object3D` (which is a common parent of both `Mesh` and `Group`).

- `setUseBasicMaterial( useBasicMaterial: boolean ): this`

  - Whether or not to use `MeshBasicMaterial` instead of `MeshPhongMaterial`, `false` by default.

- `setRWXMaterialManager( rwxMgr: RWXMaterialManager ): this`

  - Set a custom `RWXMaterialManager` to be used by the loader, one will be internally instanciated by default if none is provided.

- `setTextureColorSpace( textureColorSpace: constant ): this`

  - Set the *three.js* texture color space used for textures loaded for materials (default is `SRGBColorSpace`).

- `setEnableTextures( enableTextures: boolean ): this`

  - Enable textures (and masks) to be loaded, `true` by default.

- `setForceEarcut( forceEarcut: boolean ): this`

  - Always force Earcut to be used when doing polygon triangulation (instead of poly2tri/Delaunay) for faster (but uglier) results, `false` by default.

- `setVerboseWarning( verboseWarning: boolean ): this`

  - Enable verbose warning logs for various non-critical mishaps, 'false' by default.

- `setAlphaTest( AlphaTest: float ): this`

  - Set the threshold value to use for texture transparency testing (between 0 and 1), 0.2 by default

- `setForceTextureFiltering( forceTextureFiltering: boolean ): this`

  - Whether or not to force texture filtering regardless of texture modes

  - `true` by default, meaning: all materials will display their textures in a "fancy" way

- `setCorrectInvalidNormals( correctInvalidNormals: boolean ) : this`

  - Whether or not to correct invalid normals (quads only), this is expensive and seldom required as it mostly happens on ill-formed objects.

  - `false` by default, meaning it's disabled.

## Testing

```bash
$ npm test
```

## Linting

```bash
$ npm run lint
```

### References:

- http://www.tnlc.com/rw/rwx.html
- http://wiki.activeworlds.com/index.php?title=Renderware
- http://www.aw-europe.com/help/