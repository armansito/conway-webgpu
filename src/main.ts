import Renderer from './renderer';

const canvas = document.getElementById('gfx') as HTMLCanvasElement;
canvas.width = canvas.height = Math.min(window.innerWidth, window.innerHeight);
const renderer = new Renderer(canvas);
renderer.start();
