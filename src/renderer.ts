import drawShaderCode from './shaders/draw.wgsl';

// Position Vertex Buffer Data
const positions = new Float32Array([
    1.0, -1.0, 0.0, -1.0, -1.0, 0.0, -1.0, 1.0, 0.0, 1.0, 1.0, 0.0
]);

// Index Buffer Data
const indices = new Uint16Array([0, 3, 1, 2]);
const gridWidth = 32;

export default class Renderer {
    canvas: HTMLCanvasElement;

    // ⚙️ API Data Structures
    adapter: GPUAdapter;
    device: GPUDevice;
    queue: GPUQueue;

    // Frame Backings
    context: GPUCanvasContext;

    // Vertex data for a viewport-sized quad.
    positionBuffer: GPUBuffer;
    indexBuffer: GPUBuffer;
    uniformBuffer: GPUBuffer;

    // The cells of the simulation. The buffers represent the previous and current iterations,
    // respectively.
    cellBuffers: [GPUBuffer, GPUBuffer];

    // Pipeline description
    shaderModule: GPUShaderModule;

    // Render stage
    renderPipeline: GPURenderPipeline;
    renderPassDescriptor: GPURenderPassDescriptor;
    renderBindGroup: GPUBindGroup;

    commandEncoder: GPUCommandEncoder;
    passEncoder: GPURenderPassEncoder;

    constructor(canvas) {
        this.canvas = canvas;
        this.cellBuffers = [undefined, undefined];
    }

    // Start the rendering engine
    async start() {
        if (await this.initializeAPI()) {
            this.resizeBackings();
            await this.initializeResources();
            this.render();
        }
    }

    onResize() {
        this.resizeBackings();
    }

    // Initialize WebGPU
    async initializeAPI(): Promise<boolean> {
        try {
            // Entry to WebGPU
            const entry: GPU = navigator.gpu;
            if (!entry) {
                return false;
            }

            // Physical Device Adapter
            this.adapter = await entry.requestAdapter();

            // Logical Device
            this.device = await this.adapter.requestDevice();

            // Queue
            this.queue = this.device.queue;
        } catch (e) {
            console.error(e);
            return false;
        }

        return true;
    }

    private createBuffer(
        arr: Float32Array | Uint32Array | Uint16Array,
        usage: number
    ) {
        // Align to 4 bytes (thanks @chrimsonite)
        let desc = {
            size: (arr.byteLength + 3) & ~3,
            usage,
            mappedAtCreation: true
        };
        let buffer = this.device.createBuffer(desc);
        const writeArray =
            arr instanceof Uint16Array
                ? new Uint16Array(buffer.getMappedRange())
                : arr instanceof Uint32Array
                ? new Uint32Array(buffer.getMappedRange())
                : new Float32Array(buffer.getMappedRange());
        writeArray.set(arr);
        buffer.unmap();
        return buffer;
    }

    private initializeCellBuffers() {
        let cells = new Uint32Array(gridWidth * gridWidth);
        for (var i = 0; i < cells.length; i++) {
            cells[i] = i % 2;
        }

        for (var i = 0; i < 2; i++) {
            this.cellBuffers[i] = this.createBuffer(
                cells,
                GPUBufferUsage.STORAGE | GPUBufferUsage.FRAGMENT
            );
        }
    }

    private initializeRenderPipeline() {
        // Render stages
        const vertex: GPUVertexState = {
            module: this.shaderModule,
            entryPoint: 'vert_stage',
            buffers: [
                // GPUVertexBufferLayout
                {
                    attributes: [
                        // GPUVertexAttribute
                        {
                            shaderLocation: 0,
                            offset: 0,
                            format: 'float32x3'
                        }
                    ],
                    arrayStride: 4 * 3, // sizeof(float) * 3
                    stepMode: 'vertex'
                }
            ]
        };
        const fragment: GPUFragmentState = {
            module: this.shaderModule,
            entryPoint: 'frag_stage',
            targets: [{ format: 'bgra8unorm' }]
        };
        const renderBindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: 'uniform' }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: 'read-only-storage' }
                }
            ]
        });
        this.renderBindGroup = this.device.createBindGroup({
            layout: renderBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.uniformBuffer,
                        size: 4 // sizeof(uint32)
                    }
                },
                {
                    binding: 1,
                    resource: {
                        // TODO: need to swap buffers every frame
                        buffer: this.cellBuffers[0],
                        size: 4 * gridWidth * gridWidth
                    }
                }
            ]
        });
        this.renderPipeline = this.device.createRenderPipeline({
            // GPURenderPipelineDescriptor
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [renderBindGroupLayout]
            }),
            vertex,
            fragment,
            primitive: /* GPUPrimitiveState */ {
                frontFace: 'cw',
                cullMode: 'none',
                topology: 'triangle-strip',
                stripIndexFormat: 'uint16'
            }
        });

        // Define and store the render pass descriptor here to reuse it in the draw loop below.
        // The `view` property gets reassigned every frame to the current render target in the
        // swapchain.
        this.renderPassDescriptor = {
            colorAttachments: [
                {
                    view: undefined,
                    clearValue: { r: 0.2, g: 0.2, b: 0.2, a: 1 },
                    loadOp: 'clear',
                    storeOp: 'store'
                }
            ]
        };
    }

    // Initialize buffers, shaders, pipeline
    async initializeResources() {
        this.initializeCellBuffers();
        this.uniformBuffer = this.createBuffer(
            new Uint32Array([gridWidth]),
            GPUBufferUsage.UNIFORM
        );
        this.positionBuffer = this.createBuffer(
            positions,
            GPUBufferUsage.VERTEX
        );
        this.indexBuffer = this.createBuffer(indices, GPUBufferUsage.INDEX);

        // Shaders
        this.shaderModule = this.device.createShaderModule({
            code: drawShaderCode
        });

        this.initializeRenderPipeline();
    }

    // Resize swapchain, frame buffer attachments
    resizeBackings() {
        // Swapchain
        if (!this.context) {
            this.context = this.canvas.getContext('webgpu');
        }

        var presentationSize = [this.canvas.width, this.canvas.height];
        const canvasConfig: GPUCanvasConfiguration = {
            device: this.device,
            format: 'bgra8unorm',
            size: presentationSize
        };
        this.context.configure(canvasConfig);
    }

    // Write commands to send to the GPU
    encodeCommands() {
        this.commandEncoder = this.device.createCommandEncoder();

        // Encode drawing commands
        this.passEncoder = this.commandEncoder.beginRenderPass(
            this.renderPassDescriptor
        );
        this.passEncoder.setPipeline(this.renderPipeline);
        this.passEncoder.setBindGroup(0, this.renderBindGroup);
        this.passEncoder.setVertexBuffer(0, this.positionBuffer);
        this.passEncoder.setIndexBuffer(this.indexBuffer, 'uint16');
        this.passEncoder.drawIndexed(4);
        this.passEncoder.end();

        this.queue.submit([this.commandEncoder.finish()]);
    }

    render = () => {
        // Acquire next image from context
        this.renderPassDescriptor.colorAttachments[0].view = this.context
            .getCurrentTexture()
            .createView();

        // Write and submit commands to queue
        this.encodeCommands();

        // Refresh canvas
        requestAnimationFrame(this.render);
    };
}
