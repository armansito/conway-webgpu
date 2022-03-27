struct Grid {
    cells: array<u32>;
};

@binding(0) @group(0) var<uniform> gridWidth: u32;
@binding(1) @group(0) var<storage, read> grid: Grid;

// Vertex stage output
struct VSOut {
    @builtin(position) pos: vec4<f32>;
    @location(0) fragCoord: vec2<f32>;
};

@stage(vertex)
fn vert_stage(@location(0) inPos: vec3<f32>) -> VSOut {
    var vsOut: VSOut;
    vsOut.pos = vec4<f32>(inPos, 1.0);
    vsOut.fragCoord = (inPos.xy + 1.) * .5;
    return vsOut;
}

@stage(fragment)
fn frag_stage(@location(0) fc: vec2<f32>) -> @location(0) vec4<f32> {
    // Flip y, so that the top-left corner is the origin.
    let fragCoord = vec2<f32>(0.0, 1.0) - fc;
    let coords = vec2<u32>(floor(abs(fragCoord) * (f32(gridWidth) - 0.001)));
    let idx = coords.y * gridWidth + coords.x;
    if (grid.cells[idx] == 0u) {
        return vec4<f32>(0.2, 0.2, 0.2, 1.0);
    }
    return vec4<f32>(1.0, 0.2, 0.0, 1.0);
}
