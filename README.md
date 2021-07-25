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

// For optional (but strongly advised) JSZip usage
import * as JSZip from 'jszip'
import JSZipUtils from 'jszip-utils'

let rwxLoader = new RWXLoader();

// Like other three.js loaders: this one supports chained commands
rwxLoader.setPath('some/path/rwx').setResourcePath('some/path/textures').setJSZip(JSZip, JSZipUtils).setWaitFullLoad(true).setFlatten(true);

rwxLoader.load('object.rwx', (rwx) => {
      // Do something with 'rwx' there, it is guaranteed to be an Object3D from three.js
    });
```

## Testing

```bash
$ npm test
```

### References:

- http://www.tnlc.com/rw/rwx.html
- http://wiki.activeworlds.com/index.php?title=Renderware