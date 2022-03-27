# Conway's Game of Life - WebGPU

[![License][license-img]][license-url]

Conway's Game of Life as a WebGPU compute learning exercise. The simulation algorithm is implemented
using storage buffers and a simple compute pipeline and rendered in a single render pass.

I made use of Alain Galvan's [webgpu-seed](https://github.com/alaingalvan/webgpu-seed) for much of
the TypeScript/webpack/Node.js boilerplate and Austin Eng's
[webgpu-samples](https://austin-eng.com/webgpu-samples/) for setting up the compute pipeline.

---
Run `npm start` to host the demo at localhost:8080. Browser support for WebGPU isn't widely
available yet. I have only tested the demo on [Chrome Canary](https://www.google.com/chrome/canary/)
with the `#enable-unsafe-webgpu` and `#temporary-unexpire-flags-m101` (and `#enable-vulkan` on
Linux) flags enabled.

[license-img]: https://img.shields.io/:license-unlicense-blue.svg?style=flat-square
[license-url]: https://unlicense.org/
