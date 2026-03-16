"use client";

import { useState, useRef, useEffect, useCallback } from "react";

/* ── Icons ── */
const HomeIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
    <path d="M9 21V12h6v9" />
    <circle cx="12" cy="8" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);
const DMsIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    <circle cx="9" cy="10" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="10" r="1" fill="currentColor" stroke="none" />
  </svg>
);
const ActivityIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 01-3.46 0" />
  </svg>
);
const MoreIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="5"  cy="12" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);
const SearchIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.35-4.35" />
  </svg>
);

const tabs = [
  { id: "home",     label: "Home",     Icon: HomeIcon,     emoji: "🏠", sub: "Your workspace home" },
  { id: "dms",      label: "DMs",      Icon: DMsIcon,      emoji: "💬", sub: "Direct messages" },
  { id: "activity", label: "Activity", Icon: ActivityIcon, emoji: "🔔", sub: "Notifications & mentions" },
  { id: "more",     label: "More",     Icon: MoreIcon,     emoji: "⚙️", sub: "Settings & more" },
] as const;
type TabId = (typeof tabs)[number]["id"];

/* ═══════════════════════════════════════════════════════════════
   SPEED & FEEL CONTROLS
   ═══════════════════════════════════════════════════════════════ */
const ANIM_DURATION    = 680;
const RELEASE_DURATION = 420;
const CANCEL_DURATION  = 340;
const PEAK_SY          = 1.38;
const NAV_PEAK_SCALE   = 1.022;

/* ═══════════════════════════════════════════════════════════════
   SPRING INTEGRATOR  (Runge-Kutta 4)
   Solves  x'' + 2ζω x' + ω² x = ω²  (target = 1)
   No clamping, no breakpoints — pure continuous physics.
   Returns value in [0 .. ~1.05] for under-damped cases.
   ═══════════════════════════════════════════════════════════════ */
interface SpringState { x: number; v: number; }

function integrateSpring(
  state: SpringState,
  dt: number,
  stiffness: number,
  damping: number
): SpringState {
  const omega = Math.sqrt(stiffness);
  const zeta  = damping / (2 * omega);
  const c     = 2 * zeta * omega;   // damping coefficient
  const k     = stiffness;          // spring coefficient (target=1 → force = k*(1-x))

  // RK4
  const deriv = (s: SpringState) => ({ dx: s.v, dv: k * (1 - s.x) - c * s.v });
  const d1 = deriv(state);
  const d2 = deriv({ x: state.x + d1.dx * dt/2, v: state.v + d1.dv * dt/2 });
  const d3 = deriv({ x: state.x + d2.dx * dt/2, v: state.v + d2.dv * dt/2 });
  const d4 = deriv({ x: state.x + d3.dx * dt,   v: state.v + d3.dv * dt   });
  return {
    x: state.x + (dt/6) * (d1.dx + 2*d2.dx + 2*d3.dx + d4.dx),
    v: state.v + (dt/6) * (d1.dv + 2*d2.dv + 2*d3.dv + d4.dv),
  };
}

/** Advance a spring from startX toward 1.0 for `elapsed` seconds, sub-stepping at 4ms */
function springAt(elapsed: number, stiffness: number, damping: number, startX = 0, startV = 0): number {
  const subStep = 0.004; // 4ms sub-steps for stability
  let s: SpringState = { x: startX, v: startV };
  let t = 0;
  while (t < elapsed) {
    const dt = Math.min(subStep, elapsed - t);
    s = integrateSpring(s, dt, stiffness, damping);
    t += dt;
  }
  return s.x;
}

/* ── Named spring presets ── */
// Lead edge: snappy, slight overshoot
const lead  = (t: number) => springAt(t * 1.10, 310, 25);
// Trail edge: lazy, stretches the pill
const trail = (t: number) => springAt(t * 1.10, 145, 20);
// Pill Y scale: rises fast then settles — fully continuous, no breakpoints
const pillY = (t: number, startSy = 1) => {
  // Rise spring: very stiff → reaches PEAK_SY quickly
  const rise  = springAt(t * 1.20, 480, 18, 0, 0);          // 0→1 progress toward peak
  // Settle spring: moderate → falls back to 1.0 smoothly
  const settle = springAt(t * 1.15, 130, 17, 0, 0);         // 0→1 progress back to rest
  // Blend: rise dominates early, settle takes over — no t breakpoint
  const blend = Math.min(rise, 1);
  const peak  = startSy + (PEAK_SY - startSy) * blend;       // startSy → PEAK_SY
  return peak - (peak - 1) * Math.min(settle * 1.18, 1);     // → 1.0
};
// Nav zoom: same shape as pillY, softer magnitude
const navScale = (t: number) => {
  const rise   = springAt(t * 1.20, 480, 18, 0, 0);
  const settle = springAt(t * 1.15, 130, 17, 0, 0);
  const blend  = Math.min(rise, 1);
  const peak   = 1 + (NAV_PEAK_SCALE - 1) * blend;
  return peak - (peak - 1) * Math.min(settle * 1.18, 1);
};
// Shimmer: smooth ease-in-out
const shimmerCurve = (t: number) => t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2,2)/2;

/* ── Helpers ── */
function overlapToScaleY(r: number): number {
  if (r <= 0)    return 1;
  if (r < 0.4)  { const p = r / 0.4;          return 1 - 0.22 * p * p; }
  if (r < 0.72) { const p = (r-0.4) / 0.32;   return 0.78 + 0.38*(1-Math.pow(1-p,1.8)); }
  const p = (r-0.72) / 0.28; return 1.16 - 0.16*(1-Math.pow(1-p,2));
}
const scaleYtoX = (sy: number) => 1 + (1 - sy) * 0.18;
function overlapRatio(pL: number, pW: number, tL: number, tW: number): number {
  const inter = Math.max(0, Math.min(pL+pW, tL+tW) - Math.max(pL, tL));
  return Math.min(inter / tW, 1);
}

type IconTf = { sy: number; sx: number };
const DEFAULT_TF: IconTf = { sy: 1, sx: 1 };

/* Single render-state object — one setState per frame, zero tearing */
interface FrameState {
  pillLeft:  number;
  pillWidth: number;
  pillSy:    number;
  pillSx:    number;
  shimmer:   number;
  navScale:  number;
  active:    TabId;
  iconTf:    Record<string, IconTf>;
}

interface DragRef {
  startX:    number;
  startCX:   number;
  pointerId: number;
  tapped:    TabId | null;
  mode:      "pending" | "drag" | "longpress";
  nearest:   TabId;
  done:      boolean;
  timer:     ReturnType<typeof setTimeout>;
}

export default function BottomNav() {
  const initState: FrameState = {
    pillLeft: 0, pillWidth: 0,
    pillSy: 1, pillSx: 1,
    shimmer: 0, navScale: 1,
    active: "home",
    iconTf: { home: DEFAULT_TF, dms: DEFAULT_TF, activity: DEFAULT_TF, more: DEFAULT_TF },
  };

  const [frame, setFrame] = useState<FrameState>(initState);

  const tabRefs      = useRef<Record<string, HTMLButtonElement | null>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const animRaf      = useRef(0);
  const frameRef     = useRef<FrameState>(initState);   // shadow for reads inside RAF
  const activeRef    = useRef<TabId>("home");
  const dragRef      = useRef<DragRef | null>(null);

  /** Single commit: write to both shadow-ref and React state */
  const commit = useCallback((patch: Partial<FrameState>) => {
    frameRef.current = { ...frameRef.current, ...patch };
    setFrame(prev => ({ ...prev, ...patch }));
  }, []);

  const getRect = useCallback((id: string) => {
    const el = tabRefs.current[id], cnt = containerRef.current;
    if (!el || !cnt) return null;
    const a = el.getBoundingClientRect(), b = cnt.getBoundingClientRect();
    return { left: a.left - b.left, width: a.width };
  }, []);

  const allRects = useCallback(() => {
    const r: Record<string, { left: number; width: number }> = {};
    tabs.forEach(t => { const x = getRect(t.id); if (x) r[t.id] = x; });
    return r;
  }, [getRect]);

  /* ─────────────────────────────────────────────────────────────
     Core animation loop
     Uses normalised time t ∈ [0,1] over `dur` ms.
     startSy: pill's actual sy when animation fires (for drag→release continuity).
  ───────────────────────────────────────────────────────────── */
  const runAnim = useCallback((
    sL: number, sW: number,
    eL: number, eW: number,
    targetId: TabId,
    dur: number,
    startSy = 1,
    onDone?: () => void
  ) => {
    cancelAnimationFrame(animRaf.current);
    const rects   = allRects();
    const goRight = eL >= sL;
    let t0 = -1;
    let shimFaded = false;

    const tick = (now: number) => {
      if (t0 < 0) t0 = now;
      const elapsed = now - t0;                         // ms
      const t       = Math.min(elapsed / dur, 1);       // 0→1
      const tSec    = elapsed / 1000;                   // seconds for spring integrator

      /* ── Pill horizontal ── */
      let l: number, w: number;
      if (goRight) {
        const rEdge = (sL+sW) + ((eL+eW)-(sL+sW)) * Math.min(lead(tSec),  1);
        l           =  sL     + (eL-sL)             * Math.min(trail(tSec), 1);
        w = rEdge - l;
      } else {
        l           =  sL     + (eL-sL)             * Math.min(lead(tSec),  1);
        const rEdge = (sL+sW) + ((eL+eW)-(sL+sW))  * Math.min(trail(tSec), 1);
        w = rEdge - l;
      }
      w = Math.max(w, Math.min(sW, eW) * 0.68);

      /* ── Pill vertical scale — continuous spring, no jump ── */
      const sy  = pillY(tSec, startSy);
      const sx  = 1 + (sy - 1) * 0.28;

      /* ── Nav zoom — mirrors pillY shape, smaller magnitude ── */
      const ns  = navScale(tSec);

      /* ── Shimmer ── */
      const shimIn  = shimmerCurve(Math.min(t / 0.18, 1));
      const shimOut = t >= 0.55 ? shimmerCurve(Math.min((t-0.55)/0.45, 1)) : 0;
      const shim    = shimIn * (1 - shimOut);

      /* ── Icon squeeze — batch with same setFrame ── */
      const iconTf: Record<string, IconTf> = {};
      tabs.forEach(tb => {
        const r = rects[tb.id];
        if (!r) { iconTf[tb.id] = DEFAULT_TF; return; }
        const ratio = overlapRatio(l, w, r.left, r.width);
        if (tb.id === targetId) {
          const s = overlapToScaleY(ratio); iconTf[tb.id] = { sy: s, sx: scaleYtoX(s) };
        } else if (ratio > 0.02) {
          iconTf[tb.id] = { sy: 1-ratio*0.09, sx: scaleYtoX(1-ratio*0.09) };
        } else {
          iconTf[tb.id] = DEFAULT_TF;
        }
      });

      /* ── Single commit per frame — no tearing ── */
      const patch: Partial<FrameState> = {
        pillLeft: l, pillWidth: w,
        pillSy: sy, pillSx: sx,
        shimmer: shim,
        navScale: ns,
        iconTf,
      };
      frameRef.current = { ...frameRef.current, ...patch };
      setFrame(prev => ({ ...prev, ...patch }));

      if (!shimFaded && t >= 0.55) shimFaded = true;

      if (t < 1) {
        animRaf.current = requestAnimationFrame(tick);
      } else {
        /* Hard-land: exact rest position, all scales = 1 */
        const final: Record<string, IconTf> = {};
        tabs.forEach(tb => { final[tb.id] = DEFAULT_TF; });
        const rest: Partial<FrameState> = {
          pillLeft: eL, pillWidth: eW,
          pillSy: 1, pillSx: 1,
          shimmer: 0, navScale: 1,
          iconTf: final,
        };
        frameRef.current = { ...frameRef.current, ...rest };
        setFrame(prev => ({ ...prev, ...rest }));
        onDone?.();
      }
    };
    animRaf.current = requestAnimationFrame(tick);
  }, [allRects]);

  /* Normal tap */
  const goToTab = useCallback((id: TabId) => {
    if (id === activeRef.current) return;
    const from = getRect(activeRef.current), to = getRect(id);
    if (!from || !to) return;
    activeRef.current = id;
    commit({ active: id });
    runAnim(from.left, from.width, to.left, to.width, id, ANIM_DURATION, 1);
  }, [getRect, commit, runAnim]);

  /* Init pill position */
  useEffect(() => {
    const r = getRect("home");
    if (r) commit({ pillLeft: r.left, pillWidth: r.width });
  }, [getRect, commit]);

  /* ── Pointer handlers ── */
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button > 0) return;
    const nb = containerRef.current!.getBoundingClientRect();
    const x  = e.clientX - nb.left;

    let tapped: TabId | null = null;
    tabs.forEach(({ id }) => {
      const r = getRect(id);
      if (r && x >= r.left - 4 && x <= r.left + r.width + 4) tapped = id;
    });

    const timer = setTimeout(() => {
      const d = dragRef.current;
      if (!d || d.done) return;
      d.mode = "longpress";
      commit({ pillSy: PEAK_SY, pillSx: 1+(PEAK_SY-1)*0.28, navScale: NAV_PEAK_SCALE });
      try { containerRef.current?.setPointerCapture(d.pointerId); } catch (_) {}
    }, 200);

    dragRef.current = {
      startX: x, startCX: e.clientX, pointerId: e.pointerId,
      tapped, mode: "pending", nearest: tapped ?? activeRef.current,
      done: false, timer,
    };
    e.preventDefault();
  }, [getRect, commit]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.done) return;
    const nb = containerRef.current!.getBoundingClientRect();
    const x  = e.clientX - nb.left;
    const dx = x - d.startX;

    if (d.mode === "pending" && Math.abs(dx) > 6) {
      clearTimeout(d.timer);
      d.mode = "drag";
      commit({ pillSy: PEAK_SY, pillSx: 1+(PEAK_SY-1)*0.28, navScale: NAV_PEAK_SCALE });
      try { containerRef.current?.setPointerCapture(d.pointerId); } catch (_) {}
    }
    if (d.mode !== "drag" && d.mode !== "longpress") return;

    cancelAnimationFrame(animRaf.current);

    let nearest: TabId = d.nearest, nearestDist = Infinity;
    tabs.forEach(({ id }) => {
      const r = getRect(id); if (!r) return;
      const dist = Math.abs(x - (r.left + r.width/2));
      if (dist < nearestDist) { nearestDist = dist; nearest = id; }
    });
    d.nearest = nearest;

    const tr = getRect(nearest); if (!tr) return;
    const maxL = nb.width - 12 - tr.width;
    const newL = Math.max(0, Math.min(x - tr.width/2, maxL));

    const iconTf: Record<string, IconTf> = {};
    tabs.forEach(({ id }) => { iconTf[id] = DEFAULT_TF; });

    commit({
      pillLeft: newL, pillWidth: tr.width,
      pillSy: PEAK_SY, pillSx: 1+(PEAK_SY-1)*0.28,
      shimmer: 0.22, navScale: NAV_PEAK_SCALE,
      active: nearest, iconTf,
    });
  }, [getRect, commit]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    clearTimeout(d.timer);
    d.done = true;
    dragRef.current = null;
    const dx = e.clientX - d.startCX;

    if (d.mode === "drag" || d.mode === "longpress") {
      const { pillLeft: sL, pillWidth: sW, pillSy: curSy } = frameRef.current;
      const to = getRect(d.nearest);
      if (!to) { commit({ pillSy: 1, pillSx: 1, navScale: 1 }); return; }
      activeRef.current = d.nearest;
      commit({ active: d.nearest });
      runAnim(sL, sW, to.left, to.width, d.nearest, RELEASE_DURATION, curSy);
    } else if (Math.abs(dx) < 8 && d.tapped) {
      goToTab(d.tapped);
    } else {
      const to = getRect(activeRef.current);
      if (to) commit({ pillLeft: to.left, pillWidth: to.width, pillSy: 1, pillSx: 1, navScale: 1 });
    }
  }, [getRect, commit, runAnim, goToTab]);

  const handlePointerCancel = useCallback(() => {
    const d = dragRef.current;
    if (!d) return;
    clearTimeout(d.timer);
    d.done = true;
    dragRef.current = null;
    const to = getRect(activeRef.current);
    const { pillLeft: sL, pillWidth: sW, pillSy: curSy } = frameRef.current;
    if (to) runAnim(sL, sW, to.left, to.width, activeRef.current, CANCEL_DURATION, curSy);
    else commit({ pillSy: 1, pillSx: 1, navScale: 1 });
  }, [getRect, commit, runAnim]);

  useEffect(() => () => { cancelAnimationFrame(animRaf.current); }, []);

  /* ── Pill render ── */
  const s = frame.shimmer;
  const pillBg     = `rgba(255,255,255,${0.18 + s*0.08})`;
  const pillShadow = [
    `inset 0 1px 0 rgba(255,255,255,${0.55+s*0.35})`,
    `inset 0 -1px 0 rgba(255,255,255,${0.08+s*0.10})`,
    `inset 1px 0 0 rgba(255,255,255,${0.12+s*0.15})`,
    `inset -1px 0 0 rgba(255,255,255,${0.10+s*0.10})`,
    `0 8px 32px rgba(0,0,0,${0.28+s*0.12})`,
    `0 2px 8px rgba(0,0,0,0.20)`,
  ].join(",");

  return (
    <div style={{
      minHeight:"100vh",
      background:"linear-gradient(145deg,#0d0d1a 0%,#0a1628 30%,#12082a 60%,#0d1520 100%)",
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"flex-end",
      fontFamily:"'SF Pro Display',-apple-system,BlinkMacSystemFont,sans-serif",
      paddingBottom:48, userSelect:"none", WebkitUserSelect:"none",
      position:"relative", overflow:"hidden",
    }}>
      {/* Bokeh */}
      <div style={{ position:"absolute",inset:0,pointerEvents:"none",zIndex:0 }}>
        <div style={{ position:"absolute",width:340,height:340,borderRadius:"50%",background:"radial-gradient(circle,rgba(88,86,214,.35) 0%,transparent 70%)",top:-80,left:-60,filter:"blur(40px)" }} />
        <div style={{ position:"absolute",width:280,height:280,borderRadius:"50%",background:"radial-gradient(circle,rgba(52,199,89,.18) 0%,transparent 70%)",top:40,right:-40,filter:"blur(50px)" }} />
        <div style={{ position:"absolute",width:400,height:400,borderRadius:"50%",background:"radial-gradient(circle,rgba(10,132,255,.22) 0%,transparent 70%)",bottom:60,left:"20%",filter:"blur(60px)" }} />
        <div style={{ position:"absolute",width:220,height:220,borderRadius:"50%",background:"radial-gradient(circle,rgba(255,55,95,.16) 0%,transparent 70%)",bottom:100,right:30,filter:"blur(45px)" }} />
        <div style={{ position:"absolute",width:180,height:180,borderRadius:"50%",background:"radial-gradient(circle,rgba(255,214,10,.10) 0%,transparent 70%)",top:"35%",left:"40%",filter:"blur(35px)" }} />
      </div>

      <p style={{ position:"absolute",bottom:130,left:0,right:0,textAlign:"center",fontSize:12,color:"rgba(255,255,255,.25)",letterSpacing:".3px",pointerEvents:"none",zIndex:1 }}>
        tap · drag · long-press &amp; drag
      </p>

      {/* Page content */}
      <div style={{ flex:1,position:"relative",zIndex:1,width:"100%",display:"flex",alignItems:"center",justifyContent:"center" }}>
        {tabs.map(t => (
          <div key={t.id} style={{
            position:"absolute",display:"flex",flexDirection:"column",alignItems:"center",gap:12,
            opacity: frame.active === t.id ? 1 : 0,
            transform: frame.active === t.id ? "translateY(0) scale(1)" : "translateY(16px) scale(0.95)",
            transition:"opacity 0.40s ease, transform 0.50s cubic-bezier(0.34,1.4,0.64,1)",
            pointerEvents:"none",
          }}>
            <div style={{ fontSize:62,lineHeight:1,filter:"drop-shadow(0 8px 30px rgba(100,100,255,0.4))" }}>{t.emoji}</div>
            <p style={{ fontSize:28,fontWeight:600,color:"rgba(255,255,255,.92)",margin:0,letterSpacing:"-.5px",textShadow:"0 2px 12px rgba(0,0,0,.4)" }}>{t.label}</p>
            <p style={{ fontSize:14,color:"rgba(255,255,255,.45)",margin:0 }}>{t.sub}</p>
          </div>
        ))}
      </div>

      {/* Nav row */}
      <div style={{ position:"relative",zIndex:1,display:"flex",alignItems:"center",gap:10,padding:"0 6px" }}>
        <div
          ref={containerRef}
          style={{
            position:"relative",display:"flex",alignItems:"center",
            background:"rgba(255,255,255,.10)",
            backdropFilter:"blur(40px) saturate(180%)",
            WebkitBackdropFilter:"blur(40px) saturate(180%)",
            borderRadius:100, padding:"5px 6px",
            boxShadow:[
              "inset 0 1px 0 rgba(255,255,255,.30)",
              "inset 0 -1px 0 rgba(255,255,255,.04)",
              "inset 1px 0 0 rgba(255,255,255,.08)",
              "inset -1px 0 0 rgba(255,255,255,.06)",
              "0 20px 60px rgba(0,0,0,.45)",
              "0 4px 16px rgba(0,0,0,.30)",
            ].join(","),
            border:".5px solid rgba(255,255,255,.14)",
            touchAction:"none", cursor:"pointer",
            overflow:"visible",
            transform:`scale(${frame.navScale})`,
            transformOrigin:"center bottom",
            willChange:"transform",
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
          {/* Sliding pill */}
          <div style={{
            position:"absolute", top:5, bottom:5,
            left: frame.pillLeft, width: frame.pillWidth,
            borderRadius:100,
            background: pillBg,
            backdropFilter:"blur(20px) saturate(200%)",
            WebkitBackdropFilter:"blur(20px) saturate(200%)",
            boxShadow: pillShadow,
            border:`0.5px solid rgba(255,255,255,${0.20+s*0.15})`,
            transform:`scaleY(${frame.pillSy}) scaleX(${frame.pillSx})`,
            transformOrigin:"center center",
            willChange:"left,width,transform",
            overflow:"hidden", pointerEvents:"none",
          }}>
            <div style={{ position:"absolute",top:0,left:"8%",right:"8%",height:1.5,borderRadius:10,background:`rgba(255,255,255,${0.60+s*0.35})` }} />
            <div style={{ position:"absolute",inset:0,background:`radial-gradient(ellipse at 50% 0%,rgba(255,255,255,${0.12+s*0.10}) 0%,transparent 70%)` }} />
            <div style={{ position:"absolute",bottom:0,left:"15%",right:"15%",height:1,borderRadius:10,background:`rgba(0,0,0,${0.12-s*0.08})` }} />
          </div>

          {/* Tab buttons */}
          {tabs.map(tab => {
            const isActive = frame.active === tab.id;
            const tf = frame.iconTf[tab.id] ?? DEFAULT_TF;
            return (
              <button key={tab.id} ref={el => { tabRefs.current[tab.id] = el; }} style={{
                position:"relative",zIndex:1,
                display:"flex",flexDirection:"column",alignItems:"center",gap:3,
                padding:"8px 14px",border:"none",background:"transparent",
                cursor:"pointer",borderRadius:100,minWidth:68,
                color: isActive ? "rgba(255,255,255,.96)" : "rgba(255,255,255,.42)",
                WebkitTapHighlightColor:"transparent",outline:"none",
                transition:"color .30s ease", pointerEvents:"none",
              }}>
                <div style={{
                  transform:`scaleY(${tf.sy}) scaleX(${tf.sx})`,
                  transformOrigin:"center bottom",
                  willChange:"transform", lineHeight:1,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  filter: isActive ? "drop-shadow(0 0 8px rgba(255,255,255,0.5))" : "none",
                  transition:"filter .30s ease",
                }}>
                  <tab.Icon />
                </div>
                <span style={{
                  fontSize:11, fontWeight: isActive ? 600 : 400, lineHeight:1,
                  letterSpacing: isActive ? "-.2px" : ".1px",
                  transition:"font-weight .25s, letter-spacing .25s, color .30s ease",
                  display:"inline-block", transform:`scaleX(${tf.sx})`, willChange:"transform",
                }}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search button */}
        <button style={{
          width:52,height:52,borderRadius:"50%",
          background:"rgba(255,255,255,.10)",
          backdropFilter:"blur(40px) saturate(180%)",
          WebkitBackdropFilter:"blur(40px) saturate(180%)",
          boxShadow:["inset 0 1px 0 rgba(255,255,255,.30)","inset 0 -1px 0 rgba(255,255,255,.04)","0 20px 60px rgba(0,0,0,.40)","0 4px 16px rgba(0,0,0,.28)"].join(","),
          border:".5px solid rgba(255,255,255,.14)",
          display:"flex",alignItems:"center",justifyContent:"center",
          cursor:"pointer",color:"rgba(255,255,255,.55)",
          WebkitTapHighlightColor:"transparent",outline:"none",
          flexShrink:0,transition:"transform .18s ease",
        } as React.CSSProperties}
          onPointerDown={e=>{(e.currentTarget as HTMLElement).style.transform="scale(0.90)";}}
          onPointerUp={e=>{(e.currentTarget as HTMLElement).style.transform="scale(1)";}}
          onPointerLeave={e=>{(e.currentTarget as HTMLElement).style.transform="scale(1)";}}
        >
          <SearchIcon />
        </button>
      </div>
    </div>
  );
}