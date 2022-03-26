import computeShaderCode from './shaders/compute.wgsl';
import drawShaderCode from './shaders/draw.wgsl';

// Position Vertex Buffer Data
const positions = new Float32Array([
    1.0, -1.0, 0.0, -1.0, -1.0, 0.0, -1.0, 1.0, 0.0, 1.0, 1.0, 0.0
]);

// Index Buffer Data
const indices = new Uint16Array([0, 3, 1, 2]);
const gridWidth = 64;
const gridSize = gridWidth * gridWidth;

export default class Renderer {
    canvas: HTMLCanvasElement;

    // ⚙️ API Data Structures
    adapter: GPUAdapter;
    device: GPUDevice;

    // Frame Backings
    context: GPUCanvasContext;

    // Vertex data for a viewport-sized quad.
    positionBuffer: GPUBuffer;
    indexBuffer: GPUBuffer;
    uniformBuffer: GPUBuffer;

    // The cells of the simulation. The buffers represent the previous and current iterations,
    // respectively. The buffers are bound to the render and compute stages using two bind groups
    // to handle double buffering.
    cellBuffers: [GPUBuffer, GPUBuffer];
    computeBindGroups: [GPUBindGroup, GPUBindGroup];
    renderBindGroups: [GPUBindGroup, GPUBindGroup];

    // Shaders
    drawShader: GPUShaderModule;
    computeShader: GPUShaderModule;

    // Compute stage
    computePipeline: GPUComputePipeline;

    // Render stage
    renderPipeline: GPURenderPipeline;
    renderPassDescriptor: GPURenderPassDescriptor;

    // The current loop step
    step: number;
    last_frame_timestamp: number;

    constructor(canvas) {
        this.canvas = canvas;
        this.cellBuffers = [undefined, undefined];
        this.computeBindGroups = [undefined, undefined];
        this.renderBindGroups = [undefined, undefined];
        this.step = 0;
        this.last_frame_timestamp = 0;
    }

    // Start the rendering engine
    async start() {
        if (await this.initializeAPI()) {
            this.resizeBackings();
            await this.initializeResources();
            this.render(0);
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
        let cells = new Uint32Array(gridSize);

        // Gosper's Glider Gun see:
        //   * https://conwaylife.com/wiki/Gosper_glider_gun)
        //   * https://conwaylife.com/w/images/9/9f/Gosperglidergun.png
        cells[gridWidth * 5 + 1] = 1;
        cells[gridWidth * 5 + 2] = 1;
        cells[gridWidth * 6 + 1] = 1;
        cells[gridWidth * 6 + 2] = 1;

        cells[gridWidth * 3 + 13] = 1;
        cells[gridWidth * 3 + 14] = 1;
        cells[gridWidth * 4 + 12] = 1;
        cells[gridWidth * 5 + 11] = 1;
        cells[gridWidth * 6 + 11] = 1;
        cells[gridWidth * 7 + 11] = 1;
        cells[gridWidth * 8 + 12] = 1;
        cells[gridWidth * 9 + 13] = 1;
        cells[gridWidth * 9 + 14] = 1;

        cells[gridWidth * 6 + 15] = 1;
        cells[gridWidth * 4 + 16] = 1;
        cells[gridWidth * 8 + 16] = 1;
        cells[gridWidth * 5 + 17] = 1;
        cells[gridWidth * 6 + 17] = 1;
        cells[gridWidth * 7 + 17] = 1;
        cells[gridWidth * 6 + 18] = 1;

        cells[gridWidth * 3 + 21] = 1;
        cells[gridWidth * 4 + 21] = 1;
        cells[gridWidth * 5 + 21] = 1;
        cells[gridWidth * 3 + 22] = 1;
        cells[gridWidth * 4 + 22] = 1;
        cells[gridWidth * 5 + 22] = 1;
        cells[gridWidth * 2 + 23] = 1;
        cells[gridWidth * 6 + 23] = 1;

        cells[gridWidth * 1 + 25] = 1;
        cells[gridWidth * 2 + 25] = 1;
        cells[gridWidth * 6 + 25] = 1;
        cells[gridWidth * 7 + 25] = 1;

        cells[gridWidth * 3 + 35] = 1;
        cells[gridWidth * 4 + 35] = 1;
        cells[gridWidth * 3 + 36] = 1;
        cells[gridWidth * 4 + 36] = 1;

        for (var i = 0; i < 2; i++) {
            this.cellBuffers[i] = this.createBuffer(
                cells,
                GPUBufferUsage.STORAGE | GPUBufferUsage.FRAGMENT
            );
        }
    }

    private initializeComputePipeline() {
        const computeBindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'uniform' }
                },
                {
                    // source buffer for the current generation
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'read-only-storage' }
                },
                {
                    // destination buffer for the next generation
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'storage' }
                }
            ]
        });
        for (var i = 0; i < 2; i++) {
            this.computeBindGroups[i] = this.device.createBindGroup({
                layout: computeBindGroupLayout,
                entries: [
                    {
                        binding: 0,
                        resource: {
                            buffer: this.uniformBuffer,
                            size: 4 // sizeof(int32)
                        }
                    },
                    {
                        // source buffer for the current generation
                        binding: 1,
                        resource: {
                            buffer: this.cellBuffers[i],
                            size: 4 * gridSize
                        }
                    },
                    {
                        // destination buffer for the next generation
                        binding: 2,
                        resource: {
                            buffer: this.cellBuffers[(i + 1) % 2],
                            size: 4 * gridSize
                        }
                    }
                ]
            });
        }
        this.computePipeline = this.device.createComputePipeline({
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [computeBindGroupLayout]
            }),
            compute: {
                module: this.computeShader,
                entryPoint: 'main'
            }
        });
    }

    private initializeRenderPipeline() {
        // Render stages
        const vertex: GPUVertexState = {
            module: this.drawShader,
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
            module: this.drawShader,
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
        for (var i = 0; i < 2; i++) {
            this.renderBindGroups[i] = this.device.createBindGroup({
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
                            buffer: this.cellBuffers[i],
                            size: 4 * gridSize
                        }
                    }
                ]
            });
        }
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
        this.computeShader = this.device.createShaderModule({
            code: computeShaderCode
        });
        this.drawShader = this.device.createShaderModule({
            code: drawShaderCode
        });

        this.initializeComputePipeline();
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
        const commandEncoder = this.device.createCommandEncoder();

        // Encode compute commands
        {
            const passEncoder = commandEncoder.beginComputePass();
            passEncoder.setPipeline(this.computePipeline);
            passEncoder.setBindGroup(0, this.computeBindGroups[this.step % 2]);
            passEncoder.dispatch(gridSize);
            passEncoder.end();
        }

        // Encode drawing commands
        {
            const passEncoder = commandEncoder.beginRenderPass(
                this.renderPassDescriptor
            );
            passEncoder.setPipeline(this.renderPipeline);
            passEncoder.setBindGroup(0, this.renderBindGroups[this.step % 2]);
            passEncoder.setVertexBuffer(0, this.positionBuffer);
            passEncoder.setIndexBuffer(this.indexBuffer, 'uint16');
            passEncoder.drawIndexed(4);
            passEncoder.end();
        }

        this.device.queue.submit([commandEncoder.finish()]);
        ++this.step;
    }

    render = (now) => {
        const last = this.last_frame_timestamp;
        if (last == 0 || now - last >= 100) {
            this.last_frame_timestamp = now;

            // Acquire next image from context
            this.renderPassDescriptor.colorAttachments[0].view = this.context
                .getCurrentTexture()
                .createView();

            // Write and submit commands to queue
            this.encodeCommands();
        }
        requestAnimationFrame(this.render);
    };
}
