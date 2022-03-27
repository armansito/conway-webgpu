import Renderer from './renderer';

function setCanvasSize(canvas) {
    canvas.width = canvas.height = Math.min(
        window.innerWidth,
        window.innerHeight
    );
}

const canvas = document.getElementById('gfx') as HTMLCanvasElement;
setCanvasSize(canvas);

if (!navigator.gpu) {
    document.getElementById('error').style.display = 'block';
    canvas.style.display = 'none';
} else {
    const renderer = new Renderer(canvas);

    window.onresize = function () {
        setCanvasSize(canvas);
        renderer.onResize();
    };

    renderer.start();
}
