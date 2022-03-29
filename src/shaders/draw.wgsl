struct Grid {
    cells: array<u32>;
};

struct Uniforms {
    gridWidth: u32;
    imageWidth: u32;
};

@binding(0) @group(0) var<uniform> uniforms: Uniforms;
@binding(1) @group(0) var<storage, read> grid: Grid;

@stage(vertex)
fn vert_stage(@location(0) inPos: vec3<f32>) -> @builtin(position) vec4<f32> {
    return vec4<f32>(inPos, 1.0);
}

@stage(fragment)
fn frag_stage(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    // Flip y, so that the top-left corner is the origin.
    let fragCoord = pos.xy / f32(uniforms.imageWidth);
    let gridWidth = uniforms.gridWidth;

    let coords = vec2<u32>(floor(abs(fragCoord) * (f32(gridWidth) - 0.001)));
    let idx = coords.y * gridWidth + coords.x;
    if (grid.cells[idx] == 0u) {
        return vec4<f32>(0.2, 0.2, 0.2, 1.0);
    }
    return vec4<f32>(1.0, 0.2, 0.0, 1.0);
}
