struct VSOut {
    @builtin(position) Position: vec4<f32>;
    @location(0) color: vec3<f32>;
};

@stage(vertex)
fn vert_stage(@location(0) inPos: vec3<f32>) -> VSOut {
    var vsOut: VSOut;
    vsOut.Position = vec4<f32>(inPos, 1.0);
    vsOut.color = inPos;
    return vsOut;
}

@stage(fragment)
fn frag_stage(@location(0) inColor: vec3<f32>) -> @location(0) vec4<f32> {
    return vec4<f32>(abs(inColor), 1.0);
}
