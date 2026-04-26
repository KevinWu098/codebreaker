import { useEffect, useRef } from "react";

// Cell size of the dither lattice in CSS pixels. Smaller = more dots, more
// CPU. 5–7 reads as classic 1-bit dither at 4K-ish viewports.
const CELL = 6;

// Bayer 4x4 ordered-dither matrix, normalised to [0, 1).
const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((row) => row.map((v) => v / 16));

// Soft-edge band, in CSS pixels, where ordered dithering kicks in instead of
// hard fill. Tuned so the silhouette feels stippled, not stamped.
const DITHER_BAND_PX = 18;

const REPULSION_RADIUS = 130;
const REPULSION_STRENGTH = 1400;
const SPRING_K = 0.045;
const DAMPING = 0.86;
const SWIRL_STRENGTH = 0.18;
const POINTER_SMOOTH = 0.18;

interface Particle {
  r: number;
  rx: number;
  ry: number;
  vx: number;
  vy: number;
  x: number;
  y: number;
}

export function SplashPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    document.body.dataset.page = "splash";
    return () => {
      document.body.removeAttribute("data-page");
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let particles: Particle[] = [];
    let width = 0;
    let height = 0;
    let raf = 0;

    const pointer = {
      active: false,
      x: -10_000,
      y: -10_000,
      tx: -10_000,
      ty: -10_000,
    };

    const buildSilhouette = (w: number, h: number): HTMLCanvasElement => {
      const off = document.createElement("canvas");
      off.width = w;
      off.height = h;
      const octx = off.getContext("2d");
      if (!octx) {
        return off;
      }

      // Layout: shield centred, sword in front, point-down. Reference unit is
      // the smaller viewport dimension so the icon scales gracefully on
      // landscape and portrait.
      const cx = w / 2;
      const cy = h / 2;
      const unit = Math.min(w, h) * 0.42;
      const shieldW = unit * 1.02;
      const shieldH = unit * 1.22;

      octx.fillStyle = "#fff";

      // Heater shield. Top is straight with rounded shoulders; bottom curves
      // to a point.
      const shield = new Path2D();
      const left = cx - shieldW / 2;
      const right = cx + shieldW / 2;
      const top = cy - shieldH * 0.46;
      const bottom = cy + shieldH * 0.54;
      const shoulderY = top + shieldH * 0.12;
      const waistY = top + shieldH * 0.55;
      shield.moveTo(left + 18, top);
      shield.lineTo(right - 18, top);
      shield.quadraticCurveTo(right, top, right, shoulderY);
      shield.bezierCurveTo(
        right,
        waistY,
        right - shieldW * 0.05,
        bottom - shieldH * 0.18,
        cx,
        bottom
      );
      shield.bezierCurveTo(
        left + shieldW * 0.05,
        bottom - shieldH * 0.18,
        left,
        waistY,
        left,
        shoulderY
      );
      shield.quadraticCurveTo(left, top, left + 18, top);
      shield.closePath();
      octx.fill(shield);

      // Cross detail on the shield (negative space, drawn in black so the
      // dither field shows it as a hole). A vertical bar + horizontal arm
      // forms the "breaker" mark.
      octx.fillStyle = "#000";
      const barW = unit * 0.07;
      const armY = cy - shieldH * 0.06;
      const armW = shieldW * 0.46;
      octx.fillRect(cx - barW / 2, top + shieldH * 0.12, barW, shieldH * 0.62);
      octx.fillRect(cx - armW / 2, armY - barW / 2, armW, barW);
      octx.fillStyle = "#fff";

      // Sword in front. Pommel + grip + crossguard up top, blade descending
      // through and past the shield's lower point.
      const swordTop = cy - shieldH * 0.78;
      const swordTip = cy + shieldH * 0.78;
      const bladeW = unit * 0.085;
      const guardW = shieldW * 0.62;
      const guardH = unit * 0.075;
      const gripH = unit * 0.22;
      const pommelR = unit * 0.075;

      const sword = new Path2D();
      // Pommel circle.
      sword.moveTo(cx + pommelR, swordTop + pommelR);
      sword.arc(cx, swordTop + pommelR, pommelR, 0, Math.PI * 2);
      // Grip rectangle, slightly inset.
      sword.rect(
        cx - bladeW * 0.55,
        swordTop + pommelR * 1.6,
        bladeW * 1.1,
        gripH
      );
      // Crossguard.
      const guardY = swordTop + pommelR * 1.6 + gripH;
      sword.rect(cx - guardW / 2, guardY, guardW, guardH);
      // Blade — diamond cross-section read as a tapered hex.
      const bladeStartY = guardY + guardH;
      sword.moveTo(cx - bladeW / 2, bladeStartY);
      sword.lineTo(cx + bladeW / 2, bladeStartY);
      sword.lineTo(cx + bladeW / 2, swordTip - bladeW * 1.4);
      sword.lineTo(cx, swordTip);
      sword.lineTo(cx - bladeW / 2, swordTip - bladeW * 1.4);
      sword.closePath();
      octx.fill(sword);

      // Highlight stripe down the blade (small inset of black) for an extra
      // dither line — purely cosmetic, picked up by the ordered dither.
      octx.fillStyle = "#000";
      octx.fillRect(
        cx - 1,
        bladeStartY + 6,
        2,
        swordTip - bladeStartY - bladeW * 1.6
      );

      return off;
    };

    const buildBlurredSilhouette = (
      source: HTMLCanvasElement,
      w: number,
      h: number
    ): Uint8ClampedArray | null => {
      const blur = document.createElement("canvas");
      blur.width = w;
      blur.height = h;
      const bctx = blur.getContext("2d");
      if (!bctx) {
        return null;
      }
      bctx.filter = `blur(${DITHER_BAND_PX / 2}px)`;
      bctx.drawImage(source, 0, 0);
      bctx.filter = "none";
      return bctx.getImageData(0, 0, w, h).data;
    };

    const pickRadius = (sharpFill: number): number => {
      if (sharpFill > 0.92) {
        return 1.65;
      }
      if (sharpFill > 0.45) {
        return 1.35;
      }
      return 1.05;
    };

    const makeParticle = (
      sharpFill: number,
      softFill: number,
      row: number,
      col: number,
      px: number,
      py: number
    ): Particle | null => {
      const fill = Math.max(sharpFill, softFill * 0.95);
      if (fill < 0.04) {
        return null;
      }
      const threshold = BAYER_4X4[row % 4]?.[col % 4] ?? 0.5;
      if (fill <= threshold) {
        return null;
      }
      return {
        x: px,
        y: py,
        vx: 0,
        vy: 0,
        rx: px,
        ry: py,
        r: pickRadius(sharpFill),
      };
    };

    const samplePass = (
      sharp: Uint8ClampedArray,
      soft: Uint8ClampedArray,
      w: number,
      h: number
    ): Particle[] => {
      const next: Particle[] = [];
      const cols = Math.floor(w / CELL);
      const rows = Math.floor(h / CELL);
      const startX = (w - cols * CELL) / 2;
      const startY = (h - rows * CELL) / 2;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const px = Math.floor(startX + col * CELL + CELL / 2);
          const py = Math.floor(startY + row * CELL + CELL / 2);
          const idx = (py * w + px) * 4;
          const sharpFill = (sharp[idx] ?? 0) / 255;
          const softFill = (soft[idx] ?? 0) / 255;
          const particle = makeParticle(sharpFill, softFill, row, col, px, py);
          if (particle) {
            next.push(particle);
          }
        }
      }
      return next;
    };

    const sampleParticles = () => {
      const w = width;
      const h = height;
      if (w === 0 || h === 0) {
        particles = [];
        return;
      }
      const silhouette = buildSilhouette(w, h);
      const ctxS = silhouette.getContext("2d");
      const soft = buildBlurredSilhouette(silhouette, w, h);
      if (!(ctxS && soft)) {
        particles = [];
        return;
      }
      const sharp = ctxS.getImageData(0, 0, w, h).data;
      particles = samplePass(sharp, soft, w, h);
    };

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      width = w;
      height = h;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sampleParticles();
    };

    const onPointerMove = (event: PointerEvent) => {
      pointer.active = true;
      pointer.tx = event.clientX;
      pointer.ty = event.clientY;
    };
    const onPointerLeave = () => {
      pointer.active = false;
      pointer.tx = -10_000;
      pointer.ty = -10_000;
    };

    const tick = () => {
      // Smooth pointer so abrupt jumps don't snap the field.
      pointer.x += (pointer.tx - pointer.x) * POINTER_SMOOTH;
      pointer.y += (pointer.ty - pointer.y) * POINTER_SMOOTH;

      ctx.fillStyle = "rgb(0, 0, 0)";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "rgb(244, 248, 255)";

      const repulseSqr = REPULSION_RADIUS * REPULSION_RADIUS;
      for (const p of particles) {
        // Spring back toward rest position.
        const dxRest = p.rx - p.x;
        const dyRest = p.ry - p.y;
        let ax = dxRest * SPRING_K;
        let ay = dyRest * SPRING_K;

        // Swirl: tangential component scaled by current displacement so the
        // dot doesn't twirl forever once it's home.
        const displacement = Math.hypot(dxRest, dyRest);
        if (displacement > 0.4) {
          const swirl = SWIRL_STRENGTH * Math.min(1, displacement / 60);
          ax += -dyRest * swirl * 0.04;
          ay += dxRest * swirl * 0.04;
        }

        // Cursor repulsion.
        if (pointer.active) {
          const dxP = p.x - pointer.x;
          const dyP = p.y - pointer.y;
          const distSqr = dxP * dxP + dyP * dyP;
          if (distSqr < repulseSqr && distSqr > 0.0001) {
            const dist = Math.sqrt(distSqr);
            const falloff = 1 - dist / REPULSION_RADIUS;
            const force = (REPULSION_STRENGTH * falloff * falloff) / dist;
            ax += dxP * force * 0.0009;
            ay += dyP * force * 0.0009;
          }
        }

        p.vx = (p.vx + ax) * DAMPING;
        p.vy = (p.vy + ay) * DAMPING;
        p.x += p.vx;
        p.y += p.vy;

        // Cheap squares — dither aesthetic, not anti-aliased dots.
        const half = p.r;
        ctx.fillRect(p.x - half, p.y - half, half * 2, half * 2);
      }

      raf = requestAnimationFrame(tick);
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerleave", onPointerLeave);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
    };
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      <canvas className="block h-full w-full" ref={canvasRef} />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <h1
          className="select-none font-semibold text-white tracking-[-0.04em] mix-blend-difference"
          style={{
            fontSize: "clamp(3.5rem, 12vw, 11rem)",
            lineHeight: 1,
            textShadow: "0 0 40px rgba(0,0,0,0.45)",
          }}
        >
          codebreaker
        </h1>
      </div>
    </div>
  );
}
