import { useId, useMemo } from 'react';

type Star = { x: number; y: number; r: number; o: number; tw: boolean };

function buildStars(): Star[] {
  const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47];
  const out: Star[] = [];
  for (let i = 0; i < 56; i++) {
    const x = ((i * 37 + primes[i % 15] * 23) % 372) + 14;
    const y = ((i * 19 + primes[(i + 5) % 15] * 29) % 88) + 6;
    const r = 0.35 + (i % 6) * 0.22;
    const o = 0.28 + ((i * 11) % 55) / 100;
    out.push({ x, y, r, o, tw: i % 9 === 0 });
  }
  return out;
}

/**
 * Decorative stars for the home hero (not read by screen readers).
 */
export default function HeroStarfield() {
  const uid = `luna${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const fadeId = `${uid}-star-fade`;
  const maskId = `${uid}-star-mask`;
  const stars = useMemo(() => buildStars(), []);

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[1] h-full w-full"
      viewBox="0 0 400 160"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={fadeId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="1" />
          <stop offset="50%" stopColor="white" stopOpacity="0.95" />
          <stop offset="82%" stopColor="white" stopOpacity="0.35" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <mask id={maskId}>
          <rect width="400" height="160" fill={`url(#${fadeId})`} />
        </mask>
      </defs>
      <g mask={`url(#${maskId})`}>
        {stars.map((s, i) => (
          <circle
            key={i}
            cx={s.x}
            cy={s.y}
            r={s.r}
            fill="hsl(220 40% 98%)"
            className={s.tw ? 'luna-hero-star-twinkle' : undefined}
            opacity={s.tw ? undefined : s.o}
            style={s.tw ? { animationDelay: `${(i % 11) * 0.31}s` } : undefined}
          />
        ))}
      </g>
    </svg>
  );
}
