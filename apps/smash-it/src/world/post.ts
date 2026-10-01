/**
 * The finishing passes that make the scene look like a modern mobile game rather than raw WebGL:
 * ambient occlusion (soft contact darkening), a miniature "tilt-shift" blur that keeps the little world
 * sharp and softens the giant kitchen around it, a gentle glow on bright highlights, and a final grade
 * (warmth, contrast, vignette). On low quality only the grade runs, folded into a single pass.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/** Blurs along one axis, more the further a pixel is from the in-focus band. */
const tiltShift = (dir: [number, number]) => ({
  uniforms: {
    tDiffuse: { value: null },
    dir: { value: new THREE.Vector2(...dir) },
    texel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) },
    /** Screen heights (0 bottom … 1 top) of the sharp band. */
    focus: { value: new THREE.Vector2(0.18, 0.62) },
    amount: { value: 1 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `uniform sampler2D tDiffuse; uniform vec2 dir; uniform vec2 texel; uniform vec2 focus; uniform float amount;
    varying vec2 vUv;
    void main() {
      float out_ = max(focus.x - vUv.y, 0.0) * 0.6 + max(vUv.y - focus.y, 0.0);
      float r = clamp(out_ * 9.0, 0.0, 3.0) * amount;
      vec4 sum = vec4(0.0);
      float w = 0.0;
      for (int i = -4; i <= 4; i++) {
        float k = 1.0 - abs(float(i)) / 5.0;
        sum += texture2D(tDiffuse, vUv + dir * texel * float(i) * r) * k;
        w += k;
      }
      gl_FragColor = sum / w;
    }`,
});

/** Warmth, a little extra saturation and contrast, and a soft vignette. */
const grade = {
  uniforms: {
    tDiffuse: { value: null },
    vignette: { value: 0.32 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `uniform sampler2D tDiffuse; uniform float vignette; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, 1.06);
      c.rgb = (c.rgb - 0.45) * 1.1 + 0.45;
      c.rgb *= vec3(1.03, 1.0, 0.96);
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - vignette * smoothstep(0.35, 0.85, length(d * vec2(1.1, 1.0)));
      gl_FragColor = c;
    }`,
};

export class Post {
  private composer: EffectComposer;
  private ao: GTAOPass | null = null;
  private bloom: UnrealBloomPass | null = null;
  private blurs: ShaderPass[] = [];
  private high = true;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
  ) {
    this.composer = this.build(true);
  }

  private build(high: boolean): EffectComposer {
    this.high = high;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    // Multisampled, so edges stay smooth after leaving the default framebuffer.
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: high ? 4 : 0 });
    const c = new EffectComposer(this.renderer, target);
    c.addPass(new RenderPass(this.scene, this.camera));
    this.ao = null;
    this.bloom = null;
    this.blurs = [];
    if (high) {
      this.ao = new GTAOPass(this.scene, this.camera, size.x, size.y);
      this.ao.output = GTAOPass.OUTPUT.Default;
      this.ao.blendIntensity = 0.85;
      this.ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1, scale: 1.2 });
      c.addPass(this.ao);
      for (const dir of [[1, 0], [0, 1]] as [number, number][]) {
        const p = new ShaderPass(tiltShift(dir));
        this.blurs.push(p);
        c.addPass(p);
      }
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.22, 0.4, 2.2);
      c.addPass(this.bloom);
    }
    // Tone mapping and sRGB first, so the grade works on the colours as they will be seen.
    c.addPass(new OutputPass());
    c.addPass(new ShaderPass(grade));
    c.setPixelRatio(1);
    c.setSize(size.x, size.y);
    for (const p of this.blurs) (p.uniforms.texel.value as THREE.Vector2).set(1 / size.x, 1 / size.y);
    return c;
  }

  setQuality(high: boolean) {
    if (high === this.high) return;
    this.composer.dispose();
    this.composer = this.build(high);
  }

  /** How strongly the edges of the screen blur (0 off): stronger for close-ups, none for overviews. */
  setFocus(amount: number, band: [number, number] = [0.18, 0.62]) {
    for (const p of this.blurs) {
      p.uniforms.amount.value = amount;
      (p.uniforms.focus.value as THREE.Vector2).set(...band);
    }
  }

  resize() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.composer.setPixelRatio(1);
    this.composer.setSize(size.x, size.y);
    for (const p of this.blurs) (p.uniforms.texel.value as THREE.Vector2).set(1 / size.x, 1 / size.y);
  }

  render() {
    this.composer.render();
  }
}
