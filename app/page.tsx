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

/* ── Easing ── */
const leadE  = (t: number) => 1 - Math.pow(1 - t, 2.2);
const trailE = (t: number) => 1 - Math.pow(1 - t, 6.0);

function pillYCurve(t: number): number {
  if (t < 0.18) return 1 + 0.38 * (t / 0.18);
  if (t < 0.55) return 1.38 - 0.20 * ((t - 0.18) / 0.37);
  if (t < 0.82) return 1.20 - 0.14 * ((t - 0.55) / 0.27);
  return 1.06 - 0.06 * ((t - 0.82) / 0.18);
}

function overlapToScaleY(r: number): number {
  if (r <= 0) return 1;
  if (r < 0.4)  { const p = r / 0.4;        return 1 - 0.22 * p * p; }
  if (r < 0.72) { const p = (r - 0.4) / 0.32;  return 0.78 + 0.38 * (1 - Math.pow(1 - p, 1.8)); }
  const p = (r - 0.72) / 0.28; return 1.16 - 0.16 * (1 - Math.pow(1 - p, 2));
}
const scaleYtoX = (sy: number) => 1 + (1 - sy) * 0.18;

function overlapRatio(pLeft: number, pWidth: number, tLeft: number, tWidth: number): number {
  const inter = Math.max(0, Math.min(pLeft + pWidth, tLeft + tWidth) - Math.max(pLeft, tLeft));
  return Math.min(inter / tWidth, 1);
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
  const [active, setActive]         = useState<TabId>("home");
  const [pill, setPill]             = useState<PillState>({ left: 0, width: 0, sy: 1, sx: 1, shimmer: 0 });
  const [iconTf, setIconTf]         = useState<Record<string, IconTf>>({
    home: DEFAULT_TF, dms: DEFAULT_TF, activity: DEFAULT_TF, more: DEFAULT_TF,
  });

  const tabRefs      = useRef<Record<string, HTMLButtonElement | null>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const animRaf      = useRef(0);
  const shimRaf      = useRef(0);
  const dragRef      = useRef<DragRef | null>(null);
  const pillRef      = useRef<PillState>({ left: 0, width: 0, sy: 1, sx: 1, shimmer: 0 });
  const activeRef    = useRef<TabId>("home");

  const getRect = useCallback((id: string) => {
    const el  = tabRefs.current[id];
    const cnt = containerRef.current;
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

  /* ── Shimmer animation ── */
  const animShimmer = useCallback((from: number, to: number, dur: number) => {
    cancelAnimationFrame(shimRaf.current);
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min((now - t0) / dur, 1);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      setPillDirect({ shimmer: from + (to - from) * e });
      if (p < 1) shimRaf.current = requestAnimationFrame(step);
    };
    shimRaf.current = requestAnimationFrame(step);
  }, [setPillDirect]);

  /* ── Core pill animation ── */
  const runAnim = useCallback((
    sL: number, sW: number, eL: number, eW: number,
    targetId: TabId, dur: number, onDone?: () => void
  ) => {
    const rects = allRects();
    const goRight = eL >= sL;
    cancelAnimationFrame(animRaf.current);
    animShimmer(0, 1, 200);
    const t0 = performance.now();
    let fadeDone = false;

    const step = (now: number) => {
      const t = Math.min((now - t0) / dur, 1);
      let l: number, w: number;
      if (goRight) {
        const rEdge = (sL + sW) + ((eL + eW) - (sL + sW)) * leadE(t);
        l = sL + (eL - sL) * trailE(t); w = rEdge - l;
      } else {
        l = sL + (eL - sL) * leadE(t);
        const rEdge = (sL + sW) + ((eL + eW) - (sL + sW)) * trailE(t);
        w = rEdge - l;
      }
      w = Math.max(w, Math.min(sW, eW) * 0.72);

      const sy = pillYCurve(t);
      const sx = 1 + (sy - 1) * 0.30;
      setPillDirect({ left: l, width: w, sy, sx });

      const newTf: Record<string, IconTf> = {};
      tabs.forEach(tb => {
        const r = rects[tb.id];
        if (!r) { newTf[tb.id] = DEFAULT_TF; return; }
        const ratio = overlapRatio(l, w, r.left, r.width);
        if (tb.id === targetId) {
          const s = overlapToScaleY(ratio); newTf[tb.id] = { sy: s, sx: scaleYtoX(s) };
        } else if (ratio > 0.02) {
          const s = 1 - ratio * 0.10; newTf[tb.id] = { sy: s, sx: scaleYtoX(s) };
        } else {
          newTf[tb.id] = DEFAULT_TF;
        }
      });
      setIconTf({ ...newTf });

      if (!fadeDone && t >= 0.62) { fadeDone = true; animShimmer(1, 0, 300); }
      if (t < 1) {
        animRaf.current = requestAnimationFrame(step);
      } else {
        setPillDirect({ left: eL, width: eW, sy: 1, sx: 1, shimmer: 0 });
        const final: Record<string, IconTf> = {};
        tabs.forEach(tb => { final[tb.id] = DEFAULT_TF; });
        setIconTf(final);
        onDone?.();
      }
    };
    animRaf.current = requestAnimationFrame(step);
  }, [allRects, animShimmer, setPillDirect]);

  /* ── Go to tab ── */
  const goToTab = useCallback((id: TabId) => {
    if (id === activeRef.current) return;
    const from = getRect(activeRef.current), to = getRect(id);
    if (!from || !to) return;
    activeRef.current = id;
    setActive(id);
    runAnim(from.left, from.width, to.left, to.width, id, 750);
  }, [getRect, runAnim]);

  /* ── Init pill position ── */
  useEffect(() => {
    const r = getRect("home");
    if (r) setPillDirect({ left: r.left, width: r.width });
  }, [getRect, setPillDirect]);

  /* ── Pointer / drag handling ── */
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
      setPillDirect({ sy: 1.28, sx: 1.09 });
      try { containerRef.current?.setPointerCapture(d.pointerId); } catch (_) {}
    }, 200);

    dragRef.current = {
      startX: x, startCX: e.clientX,
      pointerId: e.pointerId,
      tapped,
      mode: "pending",
      nearest: tapped ?? activeRef.current,
      done: false,
      timer,
    };
    e.preventDefault();
  }, [getRect, setPillDirect]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.done) return;
    const nb = containerRef.current!.getBoundingClientRect();
    const x  = e.clientX - nb.left;
    const dx = x - d.startX;

    if (d.mode === "pending" && Math.abs(dx) > 7) {
      clearTimeout(d.timer);
      d.mode = "drag";
      setPillDirect({ sy: 1.20, sx: 1.06 });
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
    const pw  = tr.width;
    const maxL = nb.width - 12 - pw;
    const newL = Math.max(0, Math.min(x - pw / 2, maxL));
    setPillDirect({ left: newL, width: pw, sy: 1.20, sx: 1.07, shimmer: 0.25 });

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
      const targetId = d.nearest;
      const { left: sL, width: sW } = pillRef.current;
      const to = getRect(targetId);
      if (!to) { setPillDirect({ sy: 1, sx: 1 }); return; }
      activeRef.current = targetId;
      setActive(targetId);
      runAnim(sL, sW, to.left, to.width, targetId, 520);
    } else if (Math.abs(dx) < 8 && d.tapped) {
      goToTab(d.tapped);
    } else {
      setPillDirect({ sy: 1, sx: 1 });
    }
  }, [getRect, setPillDirect, runAnim, goToTab]);

  const handlePointerCancel = useCallback(() => {
    const d = dragRef.current;
    if (!d) return;
    clearTimeout(d.timer);
    d.done = true;
    dragRef.current = null;
    const to = getRect(activeRef.current);
    const { left: sL, width: sW } = pillRef.current;
    if (to) runAnim(sL, sW, to.left, to.width, activeRef.current, 400);
    else setPillDirect({ sy: 1, sx: 1 });
  }, [getRect, setPillDirect, runAnim]);

  useEffect(() => () => {
    cancelAnimationFrame(animRaf.current);
    cancelAnimationFrame(shimRaf.current);
  }, []);

  /* ── Pill styles ── */
  const s = pill.shimmer;
  const pillBg = `rgba(255,255,255,${0.18 + s * 0.08})`;
  const pillBoxShadow = [
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

      {/* Bokeh blobs */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div style={{ position:"absolute",width:340,height:340,borderRadius:"50%",background:"radial-gradient(circle,rgba(88,86,214,.35) 0%,transparent 70%)",top:-80,left:-60,filter:"blur(40px)" }} />
        <div style={{ position:"absolute",width:280,height:280,borderRadius:"50%",background:"radial-gradient(circle,rgba(52,199,89,.18) 0%,transparent 70%)",top:40,right:-40,filter:"blur(50px)" }} />
        <div style={{ position:"absolute",width:400,height:400,borderRadius:"50%",background:"radial-gradient(circle,rgba(10,132,255,.22) 0%,transparent 70%)",bottom:60,left:"20%",filter:"blur(60px)" }} />
        <div style={{ position:"absolute",width:220,height:220,borderRadius:"50%",background:"radial-gradient(circle,rgba(255,55,95,.16) 0%,transparent 70%)",bottom:100,right:30,filter:"blur(45px)" }} />
        <div style={{ position:"absolute",width:180,height:180,borderRadius:"50%",background:"radial-gradient(circle,rgba(255,214,10,.10) 0%,transparent 70%)",top:"35%",left:"40%",filter:"blur(35px)" }} />
      </div>

      {/* Hint */}
      <p style={{ position:"absolute",bottom:130,left:0,right:0,textAlign:"center",fontSize:12,color:"rgba(255,255,255,.25)",letterSpacing:".3px",pointerEvents:"none",zIndex:1 }}>
        tap to switch · drag to slide · long-press &amp; drag
      </p>

      {/* Page content */}
      <div style={{ flex:1,position:"relative",zIndex:1,width:"100%",display:"flex",alignItems:"center",justifyContent:"center" }}>
        {tabs.map(t => (
          <div key={t.id} style={{
            position:"absolute",display:"flex",flexDirection:"column",alignItems:"center",gap:12,
            opacity: active === t.id ? 1 : 0,
            transform: active === t.id ? "translateY(0) scale(1)" : "translateY(16px) scale(0.95)",
            transition: "opacity 0.45s ease, transform 0.55s cubic-bezier(0.34,1.4,0.64,1)",
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

        {/* Glass nav bar */}
        <div
          ref={containerRef}
          style={{
            position:"relative",display:"flex",alignItems:"center",
            background:"rgba(255,255,255,.10)",
            backdropFilter:"blur(40px) saturate(180%)",
            WebkitBackdropFilter:"blur(40px) saturate(180%)",
            borderRadius:100,padding:"5px 6px",
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
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
          {/* Sliding pill */}
          <div style={{
            position:"absolute",top:5,bottom:5,
            left: pill.left, width: pill.width,
            borderRadius:100,
            background: pillBg,
            backdropFilter:"blur(20px) saturate(200%)",
            WebkitBackdropFilter:"blur(20px) saturate(200%)",
            boxShadow: pillBoxShadow,
            border:`0.5px solid rgba(255,255,255,${0.20 + s * 0.15})`,
            transform:`scaleY(${pill.sy}) scaleX(${pill.sx})`,
            transformOrigin:"center center",
            willChange:"left,width,transform",
            overflow:"hidden",pointerEvents:"none",
          }}>
            {/* Top specular */}
            <div style={{ position:"absolute",top:0,left:"8%",right:"8%",height:1.5,borderRadius:10,background:`rgba(255,255,255,${0.60+s*0.35})` }} />
            {/* Inner glow */}
            <div style={{ position:"absolute",inset:0,background:`radial-gradient(ellipse at 50% 0%,rgba(255,255,255,${0.12+s*0.10}) 0%,transparent 70%)` }} />
            {/* Bottom dim */}
            <div style={{ position:"absolute",bottom:0,left:"15%",right:"15%",height:1,borderRadius:10,background:`rgba(0,0,0,${0.12-s*0.08})` }} />
          </div>

          {/* Tab buttons */}
          {tabs.map(tab => {
            const isActive = active === tab.id;
            const tf = iconTf[tab.id] ?? DEFAULT_TF;
            return (
              <button
                key={tab.id}
                ref={el => { tabRefs.current[tab.id] = el; }}
                style={{
                  position:"relative",zIndex:1,
                  display:"flex",flexDirection:"column",alignItems:"center",gap:3,
                  padding:"8px 14px",border:"none",background:"transparent",
                  cursor:"pointer",borderRadius:100,minWidth:68,
                  color: isActive ? "rgba(255,255,255,.96)" : "rgba(255,255,255,.42)",
                  WebkitTapHighlightColor:"transparent",outline:"none",
                  transition:"color .35s ease",pointerEvents:"none",
                }}
              >
                <div style={{
                  transform:`scaleY(${tf.sy}) scaleX(${tf.sx})`,
                  transformOrigin:"center bottom",
                  willChange:"transform",lineHeight:1,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  filter: isActive ? "drop-shadow(0 0 8px rgba(255,255,255,0.5))" : "none",
                  transition:"filter .35s ease",
                }}>
                  <tab.Icon />
                </div>
                <span style={{
                  fontSize:11,
                  fontWeight: isActive ? 600 : 400,
                  lineHeight:1,
                  letterSpacing: isActive ? "-.2px" : ".1px",
                  transition:"font-weight .3s, letter-spacing .3s, color .35s ease",
                  display:"inline-block",
                  transform:`scaleX(${tf.sx})`,
                  willChange:"transform",
                }}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search button */}
        <button
          style={{
            width:52,height:52,borderRadius:"50%",
            background:"rgba(255,255,255,.10)",
            backdropFilter:"blur(40px) saturate(180%)",
            WebkitBackdropFilter:"blur(40px) saturate(180%)",
            boxShadow:[
              "inset 0 1px 0 rgba(255,255,255,.30)",
              "inset 0 -1px 0 rgba(255,255,255,.04)",
              "0 20px 60px rgba(0,0,0,.40)",
              "0 4px 16px rgba(0,0,0,.28)",
            ].join(","),
            border:".5px solid rgba(255,255,255,.14)",
            display:"flex",alignItems:"center",justifyContent:"center",
            cursor:"pointer",color:"rgba(255,255,255,.55)",
            WebkitTapHighlightColor:"transparent",outline:"none",
            flexShrink:0,transition:"transform .2s ease",
          } as React.CSSProperties}
          onPointerDown={e => { (e.currentTarget as HTMLElement).style.transform = "scale(0.90)"; }}
          onPointerUp={e   => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
          onPointerLeave={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
        >
          <SearchIcon />
        </button>
      </div>
    </div>
  );
}