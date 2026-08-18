/**
 * All GLSL for the SignalField: petal material, pointer glyph particles,
 * fullscreen blit, and the ASCII quantization pass.
 * Shaders are compiled by non-raw ShaderMaterial (three injects the
 * standard attribute/uniform prelude and USE_INSTANCING blocks).
 */

/** Compact GLSL simplex noise (Ashima Arts / Stefan Gustavson, MIT). */
const SIMPLEX_3D = /* glsl */ `
vec3 sf_mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 sf_mod289(vec4 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 sf_permute(vec4 x){ return sf_mod289(((x*34.0)+1.0)*x); }
vec4 sf_taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = sf_mod289(i);
  vec4 p = sf_permute(sf_permute(sf_permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = sf_taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
`;

export const PETAL_VERT = /* glsl */ `
uniform float uTime;
uniform float uPulse;
uniform float uDisperse;
uniform float uSeed;
attribute vec3 aDir; // per-face pseudo-random shard direction
attribute vec3 aCtr; // per-face centroid
varying vec2 vUv;
varying vec3 vN;
varying vec3 vViewPos;
${SIMPLEX_3D}
void main(){
  vUv = uv;
  float t = uv.y; // 0 at petal base, 1 at tip
  // low-amplitude simplex ripple, stronger toward the tip
  float ripple = snoise(position * 2.2 + vec3(uSeed * 13.1, uTime * 0.55, uTime * 0.35))
               * 0.035 * (0.35 + 0.65 * t);
  // traveling pulse burst, gated by the envelope
  float burst = uPulse * (0.05 + 0.13 * sin(t * 9.0 - uTime * 7.0)) * (0.3 + 0.7 * t);
  vec3 displaced = position + normal * (ripple + burst);
  // dissolve: each face flies out as a small coherent shard along its
  // pseudo-random direction, shrinking toward its centroid — at 1.0 the
  // bloom is a cloud of glyph-sized flecks
  vec3 scattered = aCtr + aDir * 3.5
                 + (position - aCtr) * mix(1.0, 0.28, uDisperse)
                 + normal * ripple * 2.5
                 + aDir.yzx * (0.22 * uDisperse * sin(uTime * 0.7 + aCtr.y * 9.0 + uSeed));
  vec3 p = mix(displaced, scattered, uDisperse);
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vViewPos = mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

export const PETAL_FRAG = /* glsl */ `
uniform float uPulse;
uniform vec3 uColBase;
uniform vec3 uColMid;
uniform vec3 uColTip;
uniform vec3 uColRim;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vViewPos;
void main(){
  float t = vUv.y;
  vec3 ramp = mix(uColBase, uColMid, smoothstep(0.0, 0.55, t));
  ramp = mix(ramp, uColTip, smoothstep(0.5, 1.0, t));
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  // fixed camera-space light, upper-left, lambert wrap 0.5
  vec3 L = normalize(vec3(-0.55, 0.65, 0.52));
  float ndl = clamp((dot(N, L) + 0.5) / 1.5, 0.0, 1.0);
  vec3 col = ramp * (0.30 + 0.85 * ndl);
  if (!gl_FrontFacing) col *= 0.4; // fake translucency
  // fresnel rim as emissive — this draws the ASCII silhouette
  vec3 V = normalize(-vViewPos);
  float fres = pow(1.0 - abs(dot(N, V)), 2.2) * 1.5;
  col += uColRim * fres;
  col *= 1.0 + 0.30 * uPulse * (0.3 + 0.7 * t);
  gl_FragColor = vec4(col, 1.0);
}
`;

export const PARTICLE_VERT = /* glsl */ `
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

export const PARTICLE_FRAG = /* glsl */ `
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

/** Pass B — ASCII quantization to screen. */
export const ASCII_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tUnder;
uniform sampler2D tGlyphs;
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

void main(){
  vec2 cellSize = vec2(uCellSize);
  vec2 cell = floor(gl_FragCoord.xy / cellSize);
  vec2 centerPx = (cell + 0.5) * cellSize;
  vec2 uv = centerPx / uResolution;
  // 4-tap average around the cell center (±0.25 cell) — kills motion shimmer
  vec2 o = (cellSize * 0.25) / uResolution;
  vec3 c = texture2D(tScene, uv + vec2(-o.x, -o.y)).rgb
         + texture2D(tScene, uv + vec2( o.x, -o.y)).rgb
         + texture2D(tScene, uv + vec2(-o.x,  o.y)).rgb
         + texture2D(tScene, uv + vec2( o.x,  o.y)).rgb;
  c = aces(c * 0.25);
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722)) * uExposure;
  lum = clamp(0.5 + (lum - 0.5) * uContrast, 0.0, 1.0);
  int index = int(clamp(floor(lum * 10.0), 0.0, 9.0));
  vec2 inCell = fract(gl_FragCoord.xy / cellSize);
  vec2 atlasUV = vec2((float(index) + inCell.x) / 16.0, inCell.y);
  float mask = texture2D(tGlyphs, atlasUV).a;
  float maxc = max(c.r, max(c.g, c.b));
  vec3 chroma = c / max(maxc, 1e-4); // preserve scene chroma
  vec3 glyphRGB = chroma * (0.35 + 0.65 * (float(index) / 9.0));
  vec3 under = aces(texture2D(tUnder, gl_FragCoord.xy / uResolution).rgb)
             * uUnderlayer * min(uExposure, 1.0);
  vec3 col = uVoid + under;
  if (index > 0) col += mask * glyphRGB;
  col *= uGlobalDim;
  gl_FragColor = vec4(toSrgb(col), 1.0);
}
`;
