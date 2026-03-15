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
  { id: "home",     label: "Home",     Icon: HomeIcon },
  { id: "dms",      label: "DMs",      Icon: DMsIcon },
  { id: "activity", label: "Activity", Icon: ActivityIcon },
  { id: "more",     label: "More",     Icon: MoreIcon },
] as const;
type TabId = (typeof tabs)[number]["id"];

/* ── Easing ── */
function leadEase(t: number)  { return 1 - Math.pow(1 - t, 2.2); }
function trailEase(t: number) { return 1 - Math.pow(1 - t, 6.0); }

function overlapToScaleY(r: number): number {
  if (r <= 0) return 1;
  if (r < 0.4) {
    const p = r / 0.4;
    return 1 - 0.22 * (p * p);
  } else if (r < 0.72) {
    const p = (r - 0.4) / 0.32;
    return 0.78 + 0.38 * (1 - Math.pow(1 - p, 1.8));
  } else {
    const p = (r - 0.72) / 0.28;
    return 1.16 - 0.16 * (1 - Math.pow(1 - p, 2));
  }
}
function scaleYtoX(sy: number): number { return 1 + (1 - sy) * 0.18; }
function overlapRatio(pLeft: number, pWidth: number, tLeft: number, tWidth: number): number {
  const inter = Math.max(0, Math.min(pLeft + pWidth, tLeft + tWidth) - Math.max(pLeft, tLeft));
  return Math.min(inter / tWidth, 1);
}

type IconTransform = { sy: number; sx: number };
type AllTransforms = Record<string, IconTransform>;
const DEFAULT: IconTransform = { sy: 1, sx: 1 };

export default function BottomNav() {
  const [active, setActive]         = useState<TabId>("home");
  const [pill, setPill]             = useState({ left: 0, width: 0, opacity: 0 });
  const [shimmer, setShimmer]       = useState(0);
  const [transforms, setTransforms] = useState<AllTransforms>({
    home: DEFAULT, dms: DEFAULT, activity: DEFAULT, more: DEFAULT,
  });

  const tabRefs      = useRef<Record<string, HTMLButtonElement | null>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const pillRaf      = useRef<number>(0);
  const shimRaf      = useRef<number>(0);

  const getRect = useCallback((id: string) => {
    const el = tabRefs.current[id]; const cnt = containerRef.current;
    if (!el || !cnt) return null;
    const a = el.getBoundingClientRect(), b = cnt.getBoundingClientRect();
    return { left: a.left - b.left, width: a.width };
  }, []);

  useEffect(() => { const r = getRect("home"); if (r) setPill({ ...r, opacity: 1 }); }, [getRect]);

  const animShimmer = useCallback((from: number, to: number, dur: number) => {
    cancelAnimationFrame(shimRaf.current);
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min((now - t0) / dur, 1);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      setShimmer(from + (to - from) * e);
      if (p < 1) shimRaf.current = requestAnimationFrame(step);
    };
    shimRaf.current = requestAnimationFrame(step);
  }, []);

  const handleTabChange = useCallback((id: TabId) => {
    if (id === active) return;
    const fromRect = getRect(active); const toRect = getRect(id);
    if (!fromRect || !toRect) return;
    const allRects: Record<string, { left: number; width: number }> = {};
    tabs.forEach((t) => { const r = getRect(t.id); if (r) allRects[t.id] = r; });
    const goRight = toRect.left > fromRect.left;
    setActive(id); animShimmer(0, 1, 200);
    cancelAnimationFrame(pillRaf.current);
    const DURATION = 800;
    const t0 = performance.now();
    const sL = fromRect.left, sW = fromRect.width, eL = toRect.left, eW = toRect.width;
    let calledFade = false;
    const step = (now: number) => {
      const t = Math.min((now - t0) / DURATION, 1);
      let left: number, width: number;
      if (goRight) {
        const rEdge = (sL + sW) + ((eL + eW) - (sL + sW)) * leadEase(t);
        left = sL + (eL - sL) * trailEase(t); width = rEdge - left;
      } else {
        left = sL + (eL - sL) * leadEase(t);
        const rEdge = (sL + sW) + ((eL + eW) - (sL + sW)) * trailEase(t);
        width = rEdge - left;
      }
      width = Math.max(width, Math.min(sW, eW) * 0.72);
      setPill({ left, width, opacity: 1 });
      const newT: AllTransforms = {};
      tabs.forEach((tb) => {
        const r = allRects[tb.id]; if (!r) { newT[tb.id] = DEFAULT; return; }
        const ratio = overlapRatio(left, width, r.left, r.width);
        if (tb.id === id) { const sy = overlapToScaleY(ratio); newT[tb.id] = { sy, sx: scaleYtoX(sy) }; }
        else if (ratio > 0.02) { const sy = 1 - ratio * 0.10; newT[tb.id] = { sy, sx: scaleYtoX(sy) }; }
        else { newT[tb.id] = DEFAULT; }
      });
      setTransforms({ ...newT });
      if (!calledFade && t >= 0.62) { calledFade = true; animShimmer(1, 0, 300); }
      if (t < 1) { pillRaf.current = requestAnimationFrame(step); }
      else {
        setPill({ left: eL, width: eW, opacity: 1 }); setShimmer(0);
        const final: AllTransforms = {};
        tabs.forEach((tb) => { final[tb.id] = DEFAULT; }); setTransforms(final);
      }
    };
    pillRaf.current = requestAnimationFrame(step);
  }, [active, getRect, animShimmer]);

  useEffect(() => () => { cancelAnimationFrame(pillRaf.current); cancelAnimationFrame(shimRaf.current); }, []);

  // pill glass tint: slightly brighter during shimmer
  const pillBg = `rgba(255,255,255,${0.18 + shimmer * 0.08})`;
  const pillShadow = shimmer > 0.05
    ? [
        `inset 0 1px 0 rgba(255,255,255,${0.55 + shimmer * 0.35})`,
        `inset 0 -1px 0 rgba(255,255,255,${0.08 + shimmer * 0.10})`,
        `inset 1px 0 0 rgba(255,255,255,${0.12 + shimmer * 0.15})`,
        `inset -1px 0 0 rgba(255,255,255,${0.10 + shimmer * 0.10})`,
        `0 8px 32px rgba(0,0,0,${0.28 + shimmer * 0.12})`,
        `0 2px 8px rgba(0,0,0,0.20)`,
      ].join(",")
    : [
        `inset 0 1px 0 rgba(255,255,255,0.50)`,
        `inset 0 -1px 0 rgba(255,255,255,0.06)`,
        `inset 1px 0 0 rgba(255,255,255,0.10)`,
        `inset -1px 0 0 rgba(255,255,255,0.08)`,
        `0 8px 32px rgba(0,0,0,0.28)`,
        `0 2px 8px rgba(0,0,0,0.18)`,
      ].join(",");

  return (
    <div style={{
      minHeight: "100vh",
      // Rich iOS-like gradient background — dark, deep, colorful
      background: "linear-gradient(145deg, #0d0d1a 0%, #0a1628 30%, #12082a 60%, #0d1520 100%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end",
      fontFamily: "'SF Pro Display',-apple-system,BlinkMacSystemFont,sans-serif",
      paddingBottom: 48, userSelect: "none", WebkitUserSelect: "none",
      position: "relative", overflow: "hidden",
    }}>
      {/* Background bokeh blobs — iOS wallpaper feel */}
      <div style={{ position:"absolute", inset:0, pointerEvents:"none", zIndex:0 }}>
        <div style={{ position:"absolute", width:340, height:340, borderRadius:"50%", background:"radial-gradient(circle, rgba(88,86,214,0.35) 0%, transparent 70%)", top:-80, left:-60, filter:"blur(40px)" }} />
        <div style={{ position:"absolute", width:280, height:280, borderRadius:"50%", background:"radial-gradient(circle, rgba(52,199,89,0.18) 0%, transparent 70%)", top:40, right:-40, filter:"blur(50px)" }} />
        <div style={{ position:"absolute", width:400, height:400, borderRadius:"50%", background:"radial-gradient(circle, rgba(10,132,255,0.22) 0%, transparent 70%)", bottom:60, left:"20%", filter:"blur(60px)" }} />
        <div style={{ position:"absolute", width:220, height:220, borderRadius:"50%", background:"radial-gradient(circle, rgba(255,55,95,0.16) 0%, transparent 70%)", bottom:100, right:30, filter:"blur(45px)" }} />
        <div style={{ position:"absolute", width:180, height:180, borderRadius:"50%", background:"radial-gradient(circle, rgba(255,214,10,0.10) 0%, transparent 70%)", top:"35%", left:"40%", filter:"blur(35px)" }} />
      </div>

      {/* Page content */}
      <div style={{ flex:1, position:"relative", zIndex:1, width:"100%", display:"flex", alignItems:"center", justifyContent:"center" }}>
        {tabs.map((t) => (
          <div key={t.id} style={{
            position:"absolute", display:"flex", flexDirection:"column", alignItems:"center", gap:12,
            opacity: active === t.id ? 1 : 0,
            transform: active === t.id ? "translateY(0) scale(1)" : "translateY(16px) scale(0.95)",
            transition: "opacity 0.45s ease, transform 0.55s cubic-bezier(0.34,1.4,0.64,1)",
            pointerEvents:"none",
          }}>
            <div style={{ fontSize:62, lineHeight:1, filter:"drop-shadow(0 8px 30px rgba(100,100,255,0.4))" }}>
              {t.id==="home"&&"🏠"}{t.id==="dms"&&"💬"}{t.id==="activity"&&"🔔"}{t.id==="more"&&"⚙️"}
            </div>
            <p style={{ fontSize:28, fontWeight:600, color:"rgba(255,255,255,0.92)", margin:0, letterSpacing:"-0.5px", textShadow:"0 2px 12px rgba(0,0,0,0.4)" }}>
              {t.label}
            </p>
            <p style={{ fontSize:14, color:"rgba(255,255,255,0.45)", margin:0 }}>
              {t.id==="home"&&"Your workspace home"}{t.id==="dms"&&"Direct messages"}
              {t.id==="activity"&&"Notifications & mentions"}{t.id==="more"&&"Settings & more"}
            </p>
          </div>
        ))}
      </div>

      {/* Nav row */}
      <div style={{ position:"relative", zIndex:1, display:"flex", alignItems:"center", gap:10, padding:"0 6px" }}>

        {/* Glass nav bar */}
        <div ref={containerRef} style={{
          position:"relative", display:"flex", alignItems:"center",
          // iOS liquid glass: very dark tinted semi-transparent
          background: "rgba(255,255,255,0.10)",
          backdropFilter: "blur(40px) saturate(180%)",
          WebkitBackdropFilter: "blur(40px) saturate(180%)",
          borderRadius: 100,
          padding: "5px 6px",
          // Layered border: bright top specular + subtle sides
          boxShadow: [
            "inset 0 1px 0 rgba(255,255,255,0.30)",
            "inset 0 -1px 0 rgba(255,255,255,0.04)",
            "inset 1px 0 0 rgba(255,255,255,0.08)",
            "inset -1px 0 0 rgba(255,255,255,0.06)",
            "0 20px 60px rgba(0,0,0,0.45)",
            "0 4px 16px rgba(0,0,0,0.30)",
          ].join(","),
          border: "0.5px solid rgba(255,255,255,0.14)",
        }}>
          {/* ── Liquid glass sliding pill ── */}
          <div style={{
            position:"absolute", top:5, bottom:5,
            left: pill.left, width: pill.width, opacity: pill.opacity,
            borderRadius: 100,
            // Liquid glass pill: tinted white, very translucent
            background: pillBg,
            backdropFilter: "blur(20px) saturate(200%)",
            WebkitBackdropFilter: "blur(20px) saturate(200%)",
            boxShadow: pillShadow,
            // Subtle border
            border: `0.5px solid rgba(255,255,255,${0.20 + shimmer * 0.15})`,
            willChange:"left,width", overflow:"hidden", pointerEvents:"none",
          }}>
            {/* Top specular highlight — the key iOS glass line */}
            <div style={{
              position:"absolute", top:0, left:"8%", right:"8%",
              height: 1.5, borderRadius:10,
              background: `rgba(255,255,255,${0.60 + shimmer * 0.35})`,
              pointerEvents:"none",
            }} />
            {/* Soft inner fill glow — moves with shimmer */}
            <div style={{
              position:"absolute", inset:0,
              background: `radial-gradient(ellipse at 50% 0%, rgba(255,255,255,${0.12 + shimmer * 0.10}) 0%, transparent 70%)`,
              pointerEvents:"none",
            }} />
            {/* Bottom dim edge */}
            <div style={{
              position:"absolute", bottom:0, left:"15%", right:"15%",
              height:1, borderRadius:10,
              background:`rgba(0,0,0,${0.12 - shimmer * 0.08})`,
              pointerEvents:"none",
            }} />
          </div>

          {/* Tab buttons */}
          {tabs.map((tab) => {
            const isActive = active === tab.id;
            const tf = transforms[tab.id] ?? DEFAULT;
            return (
              <button key={tab.id}
                ref={(el) => { tabRefs.current[tab.id] = el; }}
                onClick={() => handleTabChange(tab.id)}
                style={{
                  position:"relative", zIndex:1,
                  display:"flex", flexDirection:"column", alignItems:"center", gap:3,
                  padding:"8px 14px", border:"none", background:"transparent",
                  cursor:"pointer", borderRadius:100, minWidth:68,
                  // White icons on dark glass — active brighter
                  color: isActive ? "rgba(255,255,255,0.96)" : "rgba(255,255,255,0.42)",
                  WebkitTapHighlightColor:"transparent", outline:"none",
                  transition:"color 0.35s ease",
                }}
              >
                <div style={{
                  transform:`scaleY(${tf.sy}) scaleX(${tf.sx})`,
                  transformOrigin:"center bottom",
                  willChange:"transform", lineHeight:1,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  // Active icon: soft white glow
                  filter: isActive ? "drop-shadow(0 0 8px rgba(255,255,255,0.5))" : "none",
                  transition:"filter 0.35s ease",
                }}>
                  <tab.Icon />
                </div>
                <span style={{
                  fontSize:11, fontWeight: isActive ? 600 : 400,
                  lineHeight:1, letterSpacing: isActive ? "-0.2px" : "0.1px",
                  transition:"font-weight 0.3s ease, letter-spacing 0.3s ease, color 0.35s ease",
                  display:"inline-block",
                  transform:`scaleX(${tf.sx})`, willChange:"transform",
                }}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Glass search button */}
        <button style={{
          width:52, height:52, borderRadius:"50%",
          background:"rgba(255,255,255,0.10)",
          backdropFilter:"blur(40px) saturate(180%)",
          WebkitBackdropFilter:"blur(40px) saturate(180%)",
          boxShadow:[
            "inset 0 1px 0 rgba(255,255,255,0.30)",
            "inset 0 -1px 0 rgba(255,255,255,0.04)",
            "0 20px 60px rgba(0,0,0,0.40)",
            "0 4px 16px rgba(0,0,0,0.28)",
          ].join(","),
          border:"0.5px solid rgba(255,255,255,0.14)",
          display:"flex", alignItems:"center", justifyContent:"center",
          cursor:"pointer", color:"rgba(255,255,255,0.55)",
          WebkitTapHighlightColor:"transparent", outline:"none",
          flexShrink:0, transition:"transform 0.2s ease",
        } as React.CSSProperties}
          onPointerDown={(e)=>{(e.currentTarget as HTMLElement).style.transform="scale(0.90)";}}
          onPointerUp={(e)=>{(e.currentTarget as HTMLElement).style.transform="scale(1)";}}
          onPointerLeave={(e)=>{(e.currentTarget as HTMLElement).style.transform="scale(1)";}}
        >
          <SearchIcon />
        </button>
      </div>
    </div>
  );
}