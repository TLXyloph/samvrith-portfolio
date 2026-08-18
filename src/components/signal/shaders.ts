/**
 * All GLSL for the SignalField v2 "silicon cortex":
 * organic cortex points, silicon trace display + orientation-ID pass,
 * billboard sparks (spikes/packets/motes), fullscreen blit, and the
 * dual-resolution ASCII quantization pass.
 * Compiled by non-raw ShaderMaterial (three injects the standard prelude
 * and USE_INSTANCING blocks).
 */

/** Per-cluster activation is shared by points and traces (indices 0..8). */
const CLUSTER_ACT = /* glsl */ `
uniform float uClusterAct[9];
uniform float uSync;
uniform float uTime;
float clusterAct(float id){
  float act = uClusterAct[int(id + 0.5)];
  // contact synchrony: all clusters breathe in slow phase-locked unison
  float breathe = uSync * (0.55 + 0.45 * sin(uTime * 1.1));
  return max(act * (1.0 - uSync), breathe);
}
`;

export const POINT_VERT = /* glsl */ `
uniform float uPointPx;   // desired point size in RT0 physical px at z≈7
uniform float uPulse;
uniform vec3 uAccent;
uniform vec3 uColA;
uniform vec3 uColB;
attribute float aCluster;
attribute float aRand;
varying vec3 vColor;
${CLUSTER_ACT}
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float act = clusterAct(aCluster);
  float shimmer = 0.9 + 0.18 * sin(uTime * (0.7 + aRand * 1.6) + aRand * 31.0);
  vec3 base = mix(uColA, uColB, aRand);
  vec3 col = mix(base, uAccent, 0.45 * act); // hue pulled toward the accent
  float b = (0.16 + 0.34 * act) * shimmer * (1.0 + 0.22 * uPulse);
  vColor = col * b;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uPointPx * (7.0 / max(-mv.z, 0.5));
}
`;

export const POINT_FRAG = /* glsl */ `
varying vec3 vColor;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float m = smoothstep(0.5, 0.16, length(d));
  if (m <= 0.004) discard;
  gl_FragColor = vec4(vColor * m, 1.0);
}
`;

export const TRACE_VERT = /* glsl */ `
uniform vec3 uAccent;
uniform vec3 uTraceCol;
attribute float aOrient;
attribute float aBlock;
varying vec3 vColor;
${CLUSTER_ACT}
void main(){
  float act = clusterAct(aBlock);
  vec3 col = mix(uTraceCol, uAccent, 0.35 * act);
  float b = 0.34 + 0.55 * act;
  if (aOrient > 0.6) b *= 1.4; // junctions/vias pop slightly
  vColor = col * b;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const TRACE_FRAG = /* glsl */ `
varying vec3 vColor;
void main(){
  gl_FragColor = vec4(vColor, 1.0);
}
`;

/** ID pass: writes the trace orientation code into R (isolated target). */
export const TRACE_ID_VERT = /* glsl */ `
attribute float aOrient;
varying float vOrient;
void main(){
  vOrient = aOrient;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const TRACE_ID_FRAG = /* glsl */ `
varying float vOrient;
void main(){
  gl_FragColor = vec4(vOrient, 0.0, 0.0, 1.0);
}
`;

/** Instanced camera-facing quads: spikes, silicon packets, pointer motes. */
export const SPARK_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;
void main(){
  vUv = uv;
  #ifdef USE_INSTANCING_COLOR
    vColor = instanceColor;
  #else
    vColor = vec3(1.0);
  #endif
  #ifdef USE_INSTANCING
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float s = length(vec3(instanceMatrix[0]));
  #else
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float s = 1.0;
  #endif
  mv.xy += position.xy * s; // billboard toward camera
  gl_Position = projectionMatrix * mv;
}
`;

export const SPARK_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;
void main(){
  float d = length(vUv - 0.5);
  float a = smoothstep(0.5, 0.12, d);
  if (a <= 0.001) discard;
  gl_FragColor = vec4(vColor * a, 1.0);
}
`;

/** Fullscreen-triangle vertex shader (clip-space passthrough). */
export const FSQ_VERT = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** Pass A2 — small box-filtered blit RT0 -> RT1 (soft color underlayer). */
export const BLIT_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
varying vec2 vUv;
void main(){
  vec2 o = uTexel * 1.5;
  vec3 c = texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb
         + texture2D(tSrc, vUv + vec2( o.x, -o.y)).rgb
         + texture2D(tSrc, vUv + vec2(-o.x,  o.y)).rgb
         + texture2D(tSrc, vUv + vec2( o.x,  o.y)).rgb;
  gl_FragColor = vec4(c * 0.25, 1.0);
}
`;

/**
 * Pass B — dual-resolution ASCII quantization to screen.
 * Macro cells (uCellSize) quantize the organic scene by luminance.
 * Where the orientation-ID target marks silicon, micro cells (uCellSize/2)
 * pick glyphs by TRACE ORIENTATION: '-' horizontal, '|' vertical,
 * '+' junctions, 'o' vias (atlas cells 3, 11, 5, 12). Grids nest exactly.
 */
export const ASCII_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tUnder;
uniform sampler2D tGlyphs;
uniform sampler2D tID;
uniform float uHasID;
uniform vec2 uResolution;
uniform float uCellSize;   // physical px (cellPx CSS × dpr)
uniform float uExposure;
uniform float uContrast;
uniform float uUnderlayer;
uniform float uGlobalDim;
uniform vec3 uVoid;

vec3 aces(vec3 x){
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
vec3 toSrgb(vec3 c){
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
  return mix(hi, lo, step(c, vec3(0.0031308)));
}
vec3 cellColor(vec2 cellPx, vec2 centerPx){
  vec2 uv = centerPx / uResolution;
  vec2 o = (cellPx * 0.25) / uResolution; // 4-tap average — kills shimmer
  vec3 c = texture2D(tScene, uv + vec2(-o.x, -o.y)).rgb
         + texture2D(tScene, uv + vec2( o.x, -o.y)).rgb
         + texture2D(tScene, uv + vec2(-o.x,  o.y)).rgb
         + texture2D(tScene, uv + vec2( o.x,  o.y)).rgb;
  return aces(c * 0.25);
}

void main(){
  vec2 cellSize = vec2(uCellSize);
  vec3 under = aces(texture2D(tUnder, gl_FragCoord.xy / uResolution).rgb)
             * uUnderlayer * min(uExposure, 1.0);

  // silicon micro path (orientation-driven glyphs at half-size cells)
  if (uHasID > 0.5) {
    vec2 microSize = cellSize * 0.5;
    vec2 microCell = floor(gl_FragCoord.xy / microSize);
    vec2 microCenter = (microCell + 0.5) * microSize;
    float orient = texture2D(tID, microCenter / uResolution).r;
    if (orient > 0.12) {
      vec3 c = cellColor(microSize, microCenter);
      float lum = dot(c, vec3(0.2126, 0.7152, 0.0722)) * uExposure;
      lum = clamp(0.5 + (lum - 0.5) * uContrast, 0.0, 1.0);
      float cellIdx = orient < 0.375 ? 3.0   // '-'
                    : orient < 0.625 ? 11.0  // '|'
                    : orient < 0.875 ? 5.0   // '+'
                    : 12.0;                  // 'o'
      vec2 inCell = fract(gl_FragCoord.xy / microSize);
      float mask = texture2D(tGlyphs, vec2((cellIdx + inCell.x) / 16.0, inCell.y)).a;
      float maxc = max(c.r, max(c.g, c.b));
      vec3 chroma = c / max(maxc, 1e-4);
      vec3 col = uVoid + under;
      if (lum > 0.03) col += mask * chroma * (0.25 + 0.75 * lum);
      gl_FragColor = vec4(toSrgb(col * uGlobalDim), 1.0);
      return;
    }
  }

  // organic macro path (luminance-ramp glyphs)
  vec2 cell = floor(gl_FragCoord.xy / cellSize);
  vec2 centerPx = (cell + 0.5) * cellSize;
  vec3 c = cellColor(cellSize, centerPx);
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722)) * uExposure;
  lum = clamp(0.5 + (lum - 0.5) * uContrast, 0.0, 1.0);
  int index = int(clamp(floor(lum * 10.0), 0.0, 9.0));
  vec2 inCell = fract(gl_FragCoord.xy / cellSize);
  vec2 atlasUV = vec2((float(index) + inCell.x) / 16.0, inCell.y);
  float mask = texture2D(tGlyphs, atlasUV).a;
  float maxc = max(c.r, max(c.g, c.b));
  vec3 chroma = c / max(maxc, 1e-4); // preserve scene chroma
  vec3 glyphRGB = chroma * (0.35 + 0.65 * (float(index) / 9.0));
  vec3 col = uVoid + under;
  if (index > 0) col += mask * glyphRGB;
  col *= uGlobalDim;
  gl_FragColor = vec4(toSrgb(col), 1.0);
}
`;
