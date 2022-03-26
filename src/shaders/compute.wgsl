struct Grid {
    cells: array<u32>;
};

@binding(0) @group(0) var<uniform> gridWidth: i32;

// The previous and next cell generations
@binding(1) @group(0) var<storage, read> prev: Grid;
@binding(2) @group(0) var<storage, read_write> next: Grid;

fn get_cell(idx: vec2<i32>) -> u32 {
    if (idx.x >= 0 && idx.x < gridWidth && idx.y >= 0 && idx.y < gridWidth) {
        return prev.cells[idx.x + gridWidth * idx.y];
    }
    return 0u;
}

fn count_live_neighbors(idx: i32) -> u32 {
    var count = 0u;
    let c = vec2<i32>(idx % gridWidth, idx / gridWidth);
    count = count + get_cell(c + vec2<i32>(-1,  0));
    count = count + get_cell(c + vec2<i32>( 1,  0));
    count = count + get_cell(c + vec2<i32>(-1, -1));
    count = count + get_cell(c + vec2<i32>( 0, -1));
    count = count + get_cell(c + vec2<i32>( 1, -1));
    count = count + get_cell(c + vec2<i32>(-1,  1));
    count = count + get_cell(c + vec2<i32>( 0,  1));
    count = count + get_cell(c + vec2<i32>( 1,  1));
    return count;
}

@stage(compute) @workgroup_size(64)
fn main(@builtin(global_invocation_id) GlobalInvocationID : vec3<u32>) {
    let idx = i32(GlobalInvocationID.x);
    let live = count_live_neighbors(idx);
    let cell = prev.cells[idx];
    if (((cell == 1u) && (live == 2u || live == 3u)) || live == 3u) {
        next.cells[idx] = 1u;
    } else {
        next.cells[idx] = 0u;
    }
}
