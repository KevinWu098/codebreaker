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

    const drawSword = (
      octx: CanvasRenderingContext2D,
      cx: number,
      cy: number,
      unit: number,
      angle: number
    ) => {
      // Sword is authored upright (pommel up, tip down) around the origin,
      // then translated/rotated into place. Scale numbers are tuned so that
      // when angle = 0 it reads as a heroic longsword.
      const total = unit * 2.55;
      const bladeW = unit * 0.075;
      const guardW = unit * 0.65;
      const guardH = unit * 0.07;
      const gripH = unit * 0.24;
      const pommelR = unit * 0.075;

      octx.save();
      octx.translate(cx, cy);
      octx.rotate(angle);

      const top = -total / 2;
      const bottom = total / 2;
      const sword = new Path2D();
      // Pommel.
      sword.arc(0, top + pommelR, pommelR, 0, Math.PI * 2);
      // Grip.
      sword.rect(-bladeW * 0.55, top + pommelR * 1.6, bladeW * 1.1, gripH);
      // Crossguard.
      const guardY = top + pommelR * 1.6 + gripH;
      sword.rect(-guardW / 2, guardY, guardW, guardH);
      // Blade — tapered hex.
      const bladeStartY = guardY + guardH;
      sword.moveTo(-bladeW / 2, bladeStartY);
      sword.lineTo(bladeW / 2, bladeStartY);
      sword.lineTo(bladeW / 2, bottom - bladeW * 1.4);
      sword.lineTo(0, bottom);
      sword.lineTo(-bladeW / 2, bottom - bladeW * 1.4);
      sword.closePath();
      octx.fill(sword);

      // Negative-space fuller down the blade for an extra dithered line.
      octx.fillStyle = "#000";
      octx.fillRect(
        -1,
        bladeStartY + 6,
        2,
        bottom - bladeStartY - bladeW * 1.6
      );
      octx.fillStyle = "#fff";

      octx.restore();
    };

    const drawShield = (
      octx: CanvasRenderingContext2D,
      cx: number,
      cy: number,
      unit: number
    ) => {
      const shieldW = unit * 1.18;
      const shieldH = unit * 1.4;
      const left = cx - shieldW / 2;
      const right = cx + shieldW / 2;
      const top = cy - shieldH * 0.46;
      const bottom = cy + shieldH * 0.54;
      const shoulderY = top + shieldH * 0.12;
      const waistY = top + shieldH * 0.55;

      // Outer body — heater shield silhouette.
      const shield = new Path2D();
      shield.moveTo(left + 22, top);
      shield.lineTo(right - 22, top);
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
      shield.quadraticCurveTo(left, top, left + 22, top);
      shield.closePath();
      octx.fill(shield);

      // Negative-space chevron (inverted V) sitting in the upper third.
      // Drawn in black so the dither lattice reads it as a hole.
      octx.fillStyle = "#000";
      const chev = new Path2D();
      const chevTop = top + shieldH * 0.18;
      const chevMid = top + shieldH * 0.34;
      const chevBot = top + shieldH * 0.4;
      const chevHalf = shieldW * 0.34;
      const chevThk = shieldH * 0.06;
      chev.moveTo(cx - chevHalf, chevBot);
      chev.lineTo(cx, chevTop);
      chev.lineTo(cx + chevHalf, chevBot);
      chev.lineTo(cx + chevHalf - chevThk * 0.6, chevBot);
      chev.lineTo(cx, chevMid);
      chev.lineTo(cx - chevHalf + chevThk * 0.6, chevBot);
      chev.closePath();
      octx.fill(chev);

      // Rivets along the inner border for a dithered halo of dots inside the
      // shield's body — they read as tiny holes in the lattice.
      const rivetR = unit * 0.018;
      const inset = unit * 0.085;
      const rivetPts = [
        [left + inset, shoulderY + shieldH * 0.04],
        [right - inset, shoulderY + shieldH * 0.04],
        [left + inset * 1.6, waistY + shieldH * 0.05],
        [right - inset * 1.6, waistY + shieldH * 0.05],
      ] as const;
      for (const [rx, ry] of rivetPts) {
        octx.beginPath();
        octx.arc(rx, ry, rivetR, 0, Math.PI * 2);
        octx.fill();
      }

      // Boss / sigil at the lower belly: a small filled diamond + dot mark.
      const bossY = top + shieldH * 0.58;
      const bossH = shieldH * 0.18;
      const bossW = shieldW * 0.16;
      const boss = new Path2D();
      boss.moveTo(cx, bossY);
      boss.lineTo(cx + bossW / 2, bossY + bossH / 2);
      boss.lineTo(cx, bossY + bossH);
      boss.lineTo(cx - bossW / 2, bossY + bossH / 2);
      boss.closePath();
      octx.fill(boss);

      octx.fillStyle = "#fff";
    };

    const buildSilhouette = (w: number, h: number): HTMLCanvasElement => {
      const off = document.createElement("canvas");
      off.width = w;
      off.height = h;
      const octx = off.getContext("2d");
      if (!octx) {
        return off;
      }

      const cx = w / 2;
      const cy = h / 2;
      const unit = Math.min(w, h) * 0.46;

      octx.fillStyle = "#fff";

      // Crossed longswords behind the shield, ±32° from vertical. They reach
      // past the shield in all four corners so the silhouette spreads instead
      // of collapsing into a single vertical strip.
      const crossAngle = (32 * Math.PI) / 180;
      drawSword(octx, cx, cy, unit, crossAngle);
      drawSword(octx, cx, cy, unit, -crossAngle);

      // Shield in front, slightly larger than the swords are wide so it
      // covers the crossing point cleanly.
      drawShield(octx, cx, cy, unit);

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
          className="select-none font-semibold text-white tracking-[-0.05em]"
          style={{
            fontSize: "clamp(3.5rem, 13vw, 12rem)",
            lineHeight: 1,
            textShadow:
              "0 2px 24px rgba(0, 0, 0, 0.85), 0 0 60px rgba(0, 0, 0, 0.65)",
          }}
        >
          codebreaker
        </h1>
      </div>
      <nav
        aria-label="Project pages"
        className="absolute right-0 bottom-0 left-0 flex flex-wrap items-center justify-center gap-2 px-6 pb-8 font-mono text-[12px] uppercase tracking-[0.14em]"
      >
        <a
          className="rounded-full px-4 py-2 font-semibold text-white shadow-[0_8px_24px_rgba(0,0,0,0.45)] transition-transform hover:-translate-y-0.5"
          href="/viz/benchmark"
          style={{ backgroundColor: "rgb(36, 92, 220)" }}
        >
          viz · benchmark
        </a>
        <a
          className="rounded-full px-4 py-2 font-semibold text-white shadow-[0_8px_24px_rgba(0,0,0,0.45)] transition-transform hover:-translate-y-0.5"
          href="/viz/harness"
          style={{ backgroundColor: "rgb(36, 92, 220)" }}
        >
          viz · harness
        </a>
        <a
          className="rounded-full px-4 py-2 font-semibold text-white shadow-[0_8px_24px_rgba(0,0,0,0.45)] transition-transform hover:-translate-y-0.5"
          href="/animations/benchmark"
          style={{ backgroundColor: "rgb(36, 92, 220)" }}
        >
          animations · benchmark
        </a>
      </nav>
    </div>
  );
}
