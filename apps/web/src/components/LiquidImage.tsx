import { useEffect, useRef } from "react";
import { Mesh, Program, Renderer, Texture, Triangle, Vec2 } from "ogl";
import { useReducedMotion } from "../hooks/useReducedMotion";

const vertex = /* glsl */ `
  attribute vec2 uv;
  attribute vec2 position;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const fragment = /* glsl */ `
  precision highp float;
  uniform sampler2D tMap;
  uniform vec2 uResolution;
  uniform vec2 uImageResolution;
  uniform vec2 uMouse;
  uniform float uStrength;
  uniform float uTime;
  varying vec2 vUv;

  void main() {
    vec2 ratio = vec2(
      min((uResolution.x / uResolution.y) / (uImageResolution.x / uImageResolution.y), 1.0),
      min((uResolution.y / uResolution.x) / (uImageResolution.y / uImageResolution.x), 1.0)
    );
    vec2 uv = vec2(vUv.x * ratio.x + (1.0 - ratio.x) * 0.5, vUv.y * ratio.y + (1.0 - ratio.y) * 0.5);
    float distanceToMouse = distance(vUv, uMouse);
    float ripple = sin(distanceToMouse * 30.0 - uTime * 2.2) * exp(-distanceToMouse * 7.0) * uStrength * 0.009;
    uv += normalize(vUv - uMouse + 0.0001) * ripple;
    gl_FragColor = texture2D(tMap, uv);
  }
`;

type LiquidImageProps = {
  src: string;
  alt: string;
  width: number;
  height: number;
};

export function LiquidImage({ src, alt, width, height }: LiquidImageProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas || reducedMotion || !window.matchMedia("(pointer: fine)").matches) return;

    let frame = 0;
    let disposed = false;
    let renderer: Renderer | undefined;
    let observer: ResizeObserver | undefined;
    let targetStrength = 0;
    let strength = 0;
    const mouse = new Vec2(0.5, 0.5);

    try {
      renderer = new Renderer({ canvas, alpha: true, dpr: Math.min(window.devicePixelRatio, 2) });
      const gl = renderer.gl;
      gl.clearColor(0, 0, 0, 0);
      const texture = new Texture(gl);
      const image = new Image();
      const program = new Program(gl, {
        vertex,
        fragment,
        uniforms: {
          tMap: { value: texture },
          uResolution: { value: new Vec2(width, height) },
          uImageResolution: { value: new Vec2(width, height) },
          uMouse: { value: mouse },
          uStrength: { value: 0 },
          uTime: { value: 0 },
        },
      });
      const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });
      const resize = () => {
        if (!renderer) return;
        const bounds = wrapper.getBoundingClientRect();
        renderer.setSize(Math.max(1, bounds.width), Math.max(1, bounds.height));
        program.uniforms.uResolution.value.set(bounds.width, bounds.height);
      };
      const render = (time: number) => {
        if (disposed || !renderer) return;
        strength += (targetStrength - strength) * 0.07;
        program.uniforms.uStrength.value = strength;
        program.uniforms.uTime.value = time * 0.001;
        renderer.render({ scene: mesh });
        frame = requestAnimationFrame(render);
      };
      const onPointerMove = (event: PointerEvent) => {
        const bounds = wrapper.getBoundingClientRect();
        mouse.set((event.clientX - bounds.left) / bounds.width, 1 - (event.clientY - bounds.top) / bounds.height);
        targetStrength = 1;
      };
      const onPointerLeave = () => { targetStrength = 0; };

      image.onload = () => {
        if (disposed) return;
        texture.image = image;
        resize();
        canvas.dataset.ready = "true";
        frame = requestAnimationFrame(render);
      };
      image.src = src;
      observer = new ResizeObserver(resize);
      observer.observe(wrapper);
      wrapper.addEventListener("pointermove", onPointerMove);
      wrapper.addEventListener("pointerleave", onPointerLeave);

      return () => {
        disposed = true;
        cancelAnimationFrame(frame);
        image.onload = null;
        observer?.disconnect();
        wrapper.removeEventListener("pointermove", onPointerMove);
        wrapper.removeEventListener("pointerleave", onPointerLeave);
      };
    } catch {
      canvas.dataset.ready = "false";
      return () => {
        disposed = true;
        cancelAnimationFrame(frame);
        observer?.disconnect();
      };
    }
  }, [src, width, height, reducedMotion]);

  return (
    <div className="liquid-image" ref={wrapperRef}>
      <img src={src} alt={alt} width={width} height={height} fetchPriority="high" decoding="async" />
      {!reducedMotion && <canvas ref={canvasRef} aria-hidden="true" />}
    </div>
  );
}
