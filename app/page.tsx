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
   SPEED & FEEL CONTROLS — tweak these to taste
   ═══════════════════════════════════════════════════════════════ */

/** Main pill travel duration in ms — lower = faster  [300–900] */
const ANIM_DURATION = 720;

/** Duration when releasing from drag/longpress [300–700] */
const RELEASE_DURATION = 440;

/** Duration when cancelling (snap back) [250–500] */
const CANCEL_DURATION  = 360;

/** Peak vertical scale of pill during animation — 1.0 = no scale, 1.4 = 40% taller */
const PEAK_SY = 1.40;

/** Nav bar subtle zoom during animation — 1.0 = none, 1.03 = 3% zoom */
const NAV_PEAK_SCALE = 1.024;

/* ═══════════════════════════════════════════════════════════════
   SPRING PHYSICS CORE
   A damped spring solver — gives the authentic iOS "alive" feel.
   stiffness: how snappy  (higher = faster snap)  [100–600]
   damping:   how quickly oscillation dies         [10–40]
   ═══════════════════════════════════════════════════════════════ */
function springEase(t: number, stiffness = 280, damping = 28): number {
  // Analytical solution of under-damped spring: x(t) = 1 - e^(-ζωt)(cos(ωdt) + ζ/√(1-ζ²)·sin(ωdt))
  const omega  = Math.sqrt(stiffness);
  const zeta   = damping / (2 * omega);
  if (zeta >= 1) {
    // Over-damped — simple smooth exponential
    const r = omega * zeta;
    return 1 - Math.exp(-r * t) * (1 + r * t);
  }
  const omegaD = omega * Math.sqrt(1 - zeta * zeta);
  const decay  = Math.exp(-zeta * omega * t);
  return 1 - decay * (Math.cos(omegaD * t) + (zeta / Math.sqrt(1 - zeta * zeta)) * Math.sin(omegaD * t));
}

/** Lead edge uses a snappier spring — arrives fast, slight overshoot */
function leadSpring(t: number): number {
  // stiffness=320 damping=26 → quick but slightly springy
  const raw = springEase(t * 1.15, 320, 26);
  return Math.min(raw, 1);
}

/** Trail edge uses a lazier spring — stretches behind, catches up */
function trailSpring(t: number): number {
  // stiffness=160 damping=22 → slower, creates the elongation
  const raw = springEase(t * 1.15, 160, 22);
  return Math.min(raw, 1);
}

/** Pill vertical scale — quick inflate, smooth settle  */
function pillYCurveFresh(t: number): number {
  // Rise: spring up to PEAK quickly
  // Fall: smooth exponential decay back to 1
  if (t < 0.22) {
    const p = springEase(t / 0.22, 400, 24);
    return 1 + (PEAK_SY - 1) * p;
  }
  // Decay: from PEAK back to 1 using a smooth spring settle
  const p = springEase((t - 0.22) / 0.78, 120, 18);
  return PEAK_SY - (PEAK_SY - 1) * p;
}

/** Release curve: from current drag sy → 1, smooth, no blink */
function pillYCurveRelease(t: number, startSy: number): number {
  // Uses a fast spring to settle from startSy to 1
  const p = springEase(t, 200, 22);
  const clamped = Math.min(p, 1);
  return startSy + (1 - startSy) * clamped;
}

/** Nav bar zoom curve — subtle lift then settle */
function navScaleCurve(t: number): number {
  if (t < 0.20) {
    const p = springEase(t / 0.20, 350, 26);
    return 1 + (NAV_PEAK_SCALE - 1) * p;
  }
  const p = springEase((t - 0.20) / 0.80, 100, 16);
  return NAV_PEAK_SCALE - (NAV_PEAK_SCALE - 1) * p;
}

/* ── Helpers ── */
function overlapToScaleY(r: number): number {
  if (r <= 0) return 1;
  if (r < 0.4)  { const p = r / 0.4;           return 1 - 0.22 * p * p; }
  if (r < 0.72) { const p = (r - 0.4) / 0.32;  return 0.78 + 0.38 * (1 - Math.pow(1 - p, 1.8)); }
  const p = (r - 0.72) / 0.28; return 1.16 - 0.16 * (1 - Math.pow(1 - p, 2));
}
const scaleYtoX = (sy: number) => 1 + (1 - sy) * 0.18;

function overlapRatio(pL: number, pW: number, tL: number, tW: number): number {
  const inter = Math.max(0, Math.min(pL + pW, tL + tW) - Math.max(pL, tL));
  return Math.min(inter / tW, 1);
}

type IconTf = { sy: number; sx: number };
const DEFAULT_TF: IconTf = { sy: 1, sx: 1 };
interface PillState { left: number; width: number; sy: number; sx: number; shimmer: number; }
interface DragRef {
  startX: number; startCX: number; pointerId: number;
  tapped: TabId | null; mode: "pending" | "drag" | "longpress";
  nearest: TabId; done: boolean; timer: ReturnType<typeof setTimeout>;
}

export default function BottomNav() {
  const [active,   setActive]   = useState<TabId>("home");
  const [pill,     setPill]     = useState<PillState>({ left: 0, width: 0, sy: 1, sx: 1, shimmer: 0 });
  const [navScale, setNavScale] = useState(1);
  const [iconTf,   setIconTf]   = useState<Record<string, IconTf>>({
    home: DEFAULT_TF, dms: DEFAULT_TF, activity: DEFAULT_TF, more: DEFAULT_TF,
  });

  const tabRefs      = useRef<Record<string, HTMLButtonElement | null>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const animRaf      = useRef(0);
  const shimRaf      = useRef(0);
  const pillRef      = useRef<PillState>({ left: 0, width: 0, sy: 1, sx: 1, shimmer: 0 });
  const activeRef    = useRef<TabId>("home");
  const dragRef      = useRef<DragRef | null>(null);

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

  const setPillDirect = useCallback((p: Partial<PillState>) => {
    pillRef.current = { ...pillRef.current, ...p };
    setPill(prev => ({ ...prev, ...p }));
  }, []);

  /* Shimmer fade */
  const animShimmer = useCallback((from: number, to: number, dur: number) => {
    cancelAnimationFrame(shimRaf.current);
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / dur, 1);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      setPillDirect({ shimmer: from + (to - from) * e });
      if (p < 1) shimRaf.current = requestAnimationFrame(tick);
    };
    shimRaf.current = requestAnimationFrame(tick);
  }, [setPillDirect]);

  /* ── Core animation loop ──────────────────────────────────────
     dur:     total ms  ← controlled by ANIM_DURATION / RELEASE_DURATION
     startSy: pill's sy at animation start (to avoid snap-blink on release)
  ────────────────────────────────────────────────────────────── */
  const runAnim = useCallback((
    sL: number, sW: number,
    eL: number, eW: number,
    targetId: TabId,
    dur: number,           // ← SPEED CONTROLLER passed in from call-site
    startSy = 1,
    onDone?: () => void
  ) => {
    const rects    = allRects();
    const goRight  = eL >= sL;
    cancelAnimationFrame(animRaf.current);
    animShimmer(0, 1, 180);
    const t0 = performance.now();
    const isRelease = startSy > 1.05;
    let shimFaded = false;

    const tick = (now: number) => {
      /* ── t is normalised 0→1 over `dur` ms ── */
      const t = Math.min((now - t0) / dur, 1);

      /* ── Pill horizontal position — spring-based lead/trail ── */
      let l: number, w: number;
      if (goRight) {
        const rEdge = (sL + sW) + ((eL + eW) - (sL + sW)) * leadSpring(t);
        l = sL + (eL - sL) * trailSpring(t);
        w = rEdge - l;
      } else {
        l = sL + (eL - sL) * leadSpring(t);
        const rEdge = (sL + sW) + ((eL + eW) - (sL + sW)) * trailSpring(t);
        w = rEdge - l;
      }
      w = Math.max(w, Math.min(sW, eW) * 0.68);

      /* ── Pill vertical scale ── */
      const sy = isRelease ? pillYCurveRelease(t, startSy) : pillYCurveFresh(t);
      const sx = 1 + (sy - 1) * 0.28;
      setPillDirect({ left: l, width: w, sy, sx });

      /* ── Nav bar zoom ── */
      setNavScale(navScaleCurve(t));

      /* ── Icon squeeze ── */
      const newTf: Record<string, IconTf> = {};
      tabs.forEach(tb => {
        const r = rects[tb.id];
        if (!r) { newTf[tb.id] = DEFAULT_TF; return; }
        const ratio = overlapRatio(l, w, r.left, r.width);
        if (tb.id === targetId) {
          const s = overlapToScaleY(ratio); newTf[tb.id] = { sy: s, sx: scaleYtoX(s) };
        } else if (ratio > 0.02) {
          newTf[tb.id] = { sy: 1 - ratio * 0.09, sx: scaleYtoX(1 - ratio * 0.09) };
        } else {
          newTf[tb.id] = DEFAULT_TF;
        }
      });
      setIconTf({ ...newTf });

      /* Shimmer fade-out at 60% progress */
      if (!shimFaded && t >= 0.60) { shimFaded = true; animShimmer(1, 0, 280); }

      if (t < 1) {
        animRaf.current = requestAnimationFrame(tick);
      } else {
        /* Hard-land on exact tab position — pill never rests off-center */
        setPillDirect({ left: eL, width: eW, sy: 1, sx: 1, shimmer: 0 });
        setNavScale(1);
        const final: Record<string, IconTf> = {};
        tabs.forEach(tb => { final[tb.id] = DEFAULT_TF; });
        setIconTf(final);
        onDone?.();
      }
    };
    animRaf.current = requestAnimationFrame(tick);
  }, [allRects, animShimmer, setPillDirect]);

  /* Normal tap */
  const goToTab = useCallback((id: TabId) => {
    if (id === activeRef.current) return;
    const from = getRect(activeRef.current), to = getRect(id);
    if (!from || !to) return;
    activeRef.current = id;
    setActive(id);
    runAnim(from.left, from.width, to.left, to.width, id,
      ANIM_DURATION, // ← change ANIM_DURATION constant at top to adjust tap speed
      1
    );
  }, [getRect, runAnim]);

  /* Init */
  useEffect(() => {
    const r = getRect("home");
    if (r) setPillDirect({ left: r.left, width: r.width });
  }, [getRect, setPillDirect]);

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
      setPillDirect({ sy: PEAK_SY, sx: 1 + (PEAK_SY - 1) * 0.28 });
      setNavScale(NAV_PEAK_SCALE);
      try { containerRef.current?.setPointerCapture(d.pointerId); } catch (_) {}
    }, 200);

    dragRef.current = {
      startX: x, startCX: e.clientX, pointerId: e.pointerId,
      tapped, mode: "pending", nearest: tapped ?? activeRef.current,
      done: false, timer,
    };
    e.preventDefault();
  }, [getRect, setPillDirect]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.done) return;
    const nb = containerRef.current!.getBoundingClientRect();
    const x  = e.clientX - nb.left;
    const dx = x - d.startX;

    if (d.mode === "pending" && Math.abs(dx) > 6) {
      clearTimeout(d.timer);
      d.mode = "drag";
      setPillDirect({ sy: PEAK_SY, sx: 1 + (PEAK_SY - 1) * 0.28 });
      setNavScale(NAV_PEAK_SCALE);
      try { containerRef.current?.setPointerCapture(d.pointerId); } catch (_) {}
    }
    if (d.mode !== "drag" && d.mode !== "longpress") return;

    cancelAnimationFrame(animRaf.current);
    cancelAnimationFrame(shimRaf.current);

    let nearest: TabId = d.nearest, nearestDist = Infinity;
    tabs.forEach(({ id }) => {
      const r = getRect(id); if (!r) return;
      const dist = Math.abs(x - (r.left + r.width / 2));
      if (dist < nearestDist) { nearestDist = dist; nearest = id; }
    });
    d.nearest = nearest;

    const tr = getRect(nearest); if (!tr) return;
    const maxL = nb.width - 12 - tr.width;
    const newL = Math.max(0, Math.min(x - tr.width / 2, maxL));
    setPillDirect({ left: newL, width: tr.width, sy: PEAK_SY, sx: 1 + (PEAK_SY - 1) * 0.28, shimmer: 0.22 });
    setNavScale(NAV_PEAK_SCALE);

    const newTf: Record<string, IconTf> = {};
    tabs.forEach(({ id }) => { newTf[id] = DEFAULT_TF; });
    setIconTf(newTf);
    setActive(nearest);
  }, [getRect, setPillDirect]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    clearTimeout(d.timer);
    d.done = true;
    dragRef.current = null;
    const dx = e.clientX - d.startCX;

    if (d.mode === "drag" || d.mode === "longpress") {
      const { left: sL, width: sW, sy: curSy } = pillRef.current;
      const to = getRect(d.nearest);
      if (!to) { setPillDirect({ sy: 1, sx: 1 }); setNavScale(1); return; }
      activeRef.current = d.nearest;
      setActive(d.nearest);
      runAnim(sL, sW, to.left, to.width, d.nearest,
        RELEASE_DURATION, // ← change RELEASE_DURATION constant at top to adjust release speed
        curSy
      );
    } else if (Math.abs(dx) < 8 && d.tapped) {
      goToTab(d.tapped);
    } else {
      const to = getRect(activeRef.current);
      if (to) setPillDirect({ left: to.left, width: to.width, sy: 1, sx: 1 });
      setNavScale(1);
    }
  }, [getRect, setPillDirect, runAnim, goToTab]);

  const handlePointerCancel = useCallback(() => {
    const d = dragRef.current;
    if (!d) return;
    clearTimeout(d.timer);
    d.done = true;
    dragRef.current = null;
    const to = getRect(activeRef.current);
    const { left: sL, width: sW, sy: curSy } = pillRef.current;
    if (to) runAnim(sL, sW, to.left, to.width, activeRef.current,
      CANCEL_DURATION, // ← change CANCEL_DURATION constant at top to adjust cancel snap speed
      curSy
    );
    else { setPillDirect({ sy: 1, sx: 1 }); setNavScale(1); }
  }, [getRect, setPillDirect, runAnim]);

  useEffect(() => () => {
    cancelAnimationFrame(animRaf.current);
    cancelAnimationFrame(shimRaf.current);
  }, []);

  /* Pill render styles */
  const s = pill.shimmer;
  const pillBg = `rgba(255,255,255,${0.18 + s * 0.08})`;
  const pillShadow = [
    `inset 0 1px 0 rgba(255,255,255,${0.55 + s * 0.35})`,
    `inset 0 -1px 0 rgba(255,255,255,${0.08 + s * 0.10})`,
    `inset 1px 0 0 rgba(255,255,255,${0.12 + s * 0.15})`,
    `inset -1px 0 0 rgba(255,255,255,${0.10 + s * 0.10})`,
    `0 8px 32px rgba(0,0,0,${0.28 + s * 0.12})`,
    `0 2px 8px rgba(0,0,0,0.20)`,
  ].join(",");

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(145deg,#0d0d1a 0%,#0a1628 30%,#12082a 60%,#0d1520 100%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end",
      fontFamily: "'SF Pro Display',-apple-system,BlinkMacSystemFont,sans-serif",
      paddingBottom: 48, userSelect: "none", WebkitUserSelect: "none",
      position: "relative", overflow: "hidden",
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
            opacity: active === t.id ? 1 : 0,
            transform: active === t.id ? "translateY(0) scale(1)" : "translateY(16px) scale(0.95)",
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
            overflow:"visible",                     // pill can burst outside
            transform:`scale(${navScale})`,          // subtle whole-nav zoom
            transformOrigin:"center bottom",
            willChange:"transform",
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
          {/* ── Sliding pill ── */}
          <div style={{
            position:"absolute", top:5, bottom:5,
            left: pill.left, width: pill.width,
            borderRadius:100,
            background: pillBg,
            backdropFilter:"blur(20px) saturate(200%)",
            WebkitBackdropFilter:"blur(20px) saturate(200%)",
            boxShadow: pillShadow,
            border:`0.5px solid rgba(255,255,255,${0.20 + s * 0.15})`,
            transform:`scaleY(${pill.sy}) scaleX(${pill.sx})`,
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
            const isActive = active === tab.id;
            const tf = iconTf[tab.id] ?? DEFAULT_TF;
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