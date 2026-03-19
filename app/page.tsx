"use client";
import { useState, useRef, useEffect, useCallback } from "react";

const HomeIcon = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" /><path d="M9 21V12h6v9" /><circle cx="12" cy="8" r="1.2" fill="currentColor" stroke="none" /></svg>);
const DMsIcon = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /><circle cx="9" cy="10" r="1" fill="currentColor" stroke="none" /><circle cx="15" cy="10" r="1" fill="currentColor" stroke="none" /></svg>);
const ActivityIcon = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></svg>);
const MoreIcon = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" /></svg>);
const SearchIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" /></svg>);

const tabs = [
  { id: "home", label: "Home", Icon: HomeIcon, emoji: "🏠", sub: "Your workspace home" },
  { id: "dms", label: "DMs", Icon: DMsIcon, emoji: "💬", sub: "Direct messages" },
  { id: "activity", label: "Activity", Icon: ActivityIcon, emoji: "🔔", sub: "Notifications & mentions" },
  { id: "more", label: "More", Icon: MoreIcon, emoji: "⚙️", sub: "Settings & more" },
] as const;

type TabId = (typeof tabs)[number]["id"];

const ANIM_DURATION = 820, RELEASE_DURATION = 440, CANCEL_DURATION = 360, PEAK_SY = 1.4, NAV_PEAK_SCALE = 1.024, SEARCH_PEAK_SCALE = 1.1;

function springEase(t: number, stiffness = 280, damping = 28): number {
  const omega = Math.sqrt(stiffness), zeta = damping / (2 * omega);
  if (zeta >= 1) { const r = omega * zeta; return 1 - Math.exp(-r * t) * (1 + r * t); }
  const omegaD = omega * Math.sqrt(1 - zeta * zeta), decay = Math.exp(-zeta * omega * t);
  return 1 - decay * (Math.cos(omegaD * t) + (zeta / Math.sqrt(1 - zeta * zeta)) * Math.sin(omegaD * t));
}

const leadSpring = (t: number) => Math.min(springEase(t * 1.15, 320, 26), 1);
const trailSpring = (t: number) => Math.min(springEase(t * 1.15, 160, 22), 1);
const pillYCurveFresh = (t: number) => t < 0.22 ? 1 + (PEAK_SY - 1) * springEase(t / 0.22, 400, 24) : PEAK_SY - (PEAK_SY - 1) * springEase((t - 0.22) / 0.78, 120, 18);
const pillYCurveRelease = (t: number, startSy: number) => startSy + (1 - startSy) * Math.min(springEase(t, 200, 22), 1);
const navScaleCurve = (t: number) => t < 0.2 ? 1 + (NAV_PEAK_SCALE - 1) * springEase(t / 0.2, 350, 26) : NAV_PEAK_SCALE - (NAV_PEAK_SCALE - 1) * springEase((t - 0.2) / 0.8, 100, 16);
const overlapToScaleY = (r: number) => r <= 0 ? 1 : r < 0.4 ? 1 - 0.22 * (r / 0.4) ** 2 : r < 0.72 ? 0.78 + 0.38 * (1 - Math.pow(1 - (r - 0.4) / 0.32, 1.8)) : 1.16 - 0.16 * (1 - Math.pow(1 - (r - 0.72) / 0.28, 2));
const scaleYtoX = (sy: number) => 1 + (sy - 1) * 0.18;
const overlapRatio = (pL: number, pW: number, tL: number, tW: number) => Math.min(Math.max(0, Math.min(pL + pW, tL + tW) - Math.max(pL, tL)) / tW, 1);

type IconTf = { sy: number; sx: number };
const DEFAULT_TF: IconTf = { sy: 1, sx: 1 };
interface PillState { left: number; width: number; sy: number; sx: number; shimmer: number; }
interface SearchButtonState { scaleX: number; scaleY: number; translateX: number; translateY: number; }
interface DragRef { startX: number; startY: number; startCX: number; startCY: number; pointerId: number; tapped: TabId | null; mode: "pending" | "drag" | "longpress"; nearest: TabId; done: boolean; timer: ReturnType<typeof setTimeout>; isSearchDrag?: boolean; }

export default function BottomNav() {
  const [active, setActive] = useState<TabId>("home");
  const [pill, setPill] = useState<PillState>({ left: 0, width: 0, sy: 1, sx: 1, shimmer: 0 });
  const [navScale, setNavScale] = useState(1);
  const [iconTf, setIconTf] = useState<Record<string, IconTf>>({ home: DEFAULT_TF, dms: DEFAULT_TF, activity: DEFAULT_TF, more: DEFAULT_TF });
  const [searchBtn, setSearchBtn] = useState<SearchButtonState>({ scaleX: 1, scaleY: 1, translateX: 0, translateY: 0 });

  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const searchBtnRef = useRef<HTMLButtonElement>(null);
  const animRaf = useRef(0), shimRaf = useRef(0), searchAnimRaf = useRef(0);
  const pillRef = useRef<PillState>({ left: 0, width: 0, sy: 1, sx: 1, shimmer: 0 });
  const activeRef = useRef<TabId>("home");
  const dragRef = useRef<DragRef | null>(null);
  const searchBtnRef2 = useRef<SearchButtonState>({ scaleX: 1, scaleY: 1, translateX: 0, translateY: 0 });

  const getRect = useCallback((id: string) => {
    const el = tabRefs.current[id], cnt = containerRef.current;
    if (!el || !cnt) return null;
    const a = el.getBoundingClientRect(), b = cnt.getBoundingClientRect();
    return { left: a.left - b.left, width: a.width };
  }, []);

  const allRects = useCallback(() => {
    const r: Record<string, { left: number; width: number }> = {};
    tabs.forEach((t) => { const x = getRect(t.id); if (x) r[t.id] = x; });
    return r;
  }, [getRect]);

  const setPillDirect = useCallback((p: Partial<PillState>) => {
    pillRef.current = { ...pillRef.current, ...p };
    setPill((prev) => ({ ...prev, ...p }));
  }, []);

  const setSearchBtnDirect = useCallback((s: Partial<SearchButtonState>) => {
    searchBtnRef2.current = { ...searchBtnRef2.current, ...s };
    setSearchBtn((prev) => ({ ...prev, ...s }));
  }, []);

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

  const animSearchReturn = useCallback((fromState: SearchButtonState, dur: number) => {
    cancelAnimationFrame(searchAnimRaf.current);
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - t0) / dur, 1);
      const p = Math.min(springEase(t, 240, 24), 1);
      const next: SearchButtonState = {
        scaleX: fromState.scaleX + (1 - fromState.scaleX) * p,
        scaleY: fromState.scaleY + (1 - fromState.scaleY) * p,
        translateX: fromState.translateX + (0 - fromState.translateX) * p,
        translateY: fromState.translateY + (0 - fromState.translateY) * p,
      };
      setSearchBtnDirect(next);
      if (p < 1) searchAnimRaf.current = requestAnimationFrame(tick);
    };
    searchAnimRaf.current = requestAnimationFrame(tick);
  }, [setSearchBtnDirect]);

  const runAnim = useCallback((sL: number, sW: number, eL: number, eW: number, targetId: TabId, dur: number, startSy = 1, onDone?: () => void) => {
    const rects = allRects();
    const goRight = eL >= sL;
    cancelAnimationFrame(animRaf.current);
    animShimmer(0, 1, 180);
    const t0 = performance.now();
    const isRelease = startSy > 1.05;
    let shimFaded = false;
    const tick = (now: number) => {
      const t = Math.min((now - t0) / dur, 1);
      let l: number, w: number;
      if (goRight) {
        const rEdge = sL + sW + (eL + eW - (sL + sW)) * leadSpring(t);
        l = sL + (eL - sL) * trailSpring(t);
        w = rEdge - l;
      } else {
        l = sL + (eL - sL) * leadSpring(t);
        const rEdge = sL + sW + (eL + eW - (sL + sW)) * trailSpring(t);
        w = rEdge - l;
      }
      w = Math.max(w, Math.min(sW, eW) * 0.68);
      const sy = isRelease ? pillYCurveRelease(t, startSy) : pillYCurveFresh(t);
      const sx = 1 + (sy - 1) * 0.28;
      setPillDirect({ left: l, width: w, sy, sx });
      setNavScale(navScaleCurve(t));
      const newTf: Record<string, IconTf> = {};
      tabs.forEach((tb) => {
        const r = rects[tb.id];
        if (!r) { newTf[tb.id] = DEFAULT_TF; return; }
        const ratio = overlapRatio(l, w, r.left, r.width);
        if (tb.id === targetId) {
          const s = overlapToScaleY(ratio);
          newTf[tb.id] = { sy: s, sx: scaleYtoX(s) };
        } else if (ratio > 0.02) {
          newTf[tb.id] = { sy: 1 - ratio * 0.09, sx: scaleYtoX(1 - ratio * 0.09) };
        } else {
          newTf[tb.id] = DEFAULT_TF;
        }
      });
      setIconTf({ ...newTf });
      if (!shimFaded && t >= 0.6) { shimFaded = true; animShimmer(1, 0, 280); }
      if (t < 1) {
        animRaf.current = requestAnimationFrame(tick);
      } else {
        setPillDirect({ left: eL, width: eW, sy: 1, sx: 1, shimmer: 0 });
        setNavScale(1);
        const final: Record<string, IconTf> = {};
        tabs.forEach((tb) => { final[tb.id] = DEFAULT_TF; });
        setIconTf(final);
        onDone?.();
      }
    };
    animRaf.current = requestAnimationFrame(tick);
  }, [allRects, animShimmer, setPillDirect]);

  const goToTab = useCallback((id: TabId) => {
    if (id === activeRef.current) return;
    const from = getRect(activeRef.current), to = getRect(id);
    if (!from || !to) return;
    activeRef.current = id;
    setActive(id);
    runAnim(from.left, from.width, to.left, to.width, id, ANIM_DURATION, 1);
  }, [getRect, runAnim]);

  useEffect(() => {
    const r = getRect("home");
    if (r) setPillDirect({ left: r.left, width: r.width });
  }, [getRect, setPillDirect]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button > 0) return;
    if (dragRef.current?.isSearchDrag) return;
    const nb = containerRef.current!.getBoundingClientRect();
    const x = e.clientX - nb.left;
    let tapped: TabId | null = null;
    tabs.forEach(({ id }) => { const r = getRect(id); if (r && x >= r.left - 4 && x <= r.left + r.width + 4) tapped = id; });
    const timer = setTimeout(() => {
      const d = dragRef.current;
      if (!d || d.done) return;
      d.mode = "longpress";
      setPillDirect({ sy: PEAK_SY, sx: 1 + (PEAK_SY - 1) * 0.28 });
      setNavScale(NAV_PEAK_SCALE);
      try { containerRef.current?.setPointerCapture(d.pointerId); } catch (_) {}
    }, 200);
    dragRef.current = { startX: x, startY: e.clientY, startCX: e.clientX, startCY: e.clientY, pointerId: e.pointerId, tapped, mode: "pending", nearest: tapped ?? activeRef.current, done: false, timer, isSearchDrag: false };
    e.preventDefault();
  }, [getRect, setPillDirect]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.done) return;
    const nb = containerRef.current!.getBoundingClientRect();
    const x = e.clientX - nb.left;
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
      const r = getRect(id);
      if (!r) return;
      const dist = Math.abs(x - (r.left + r.width / 2));
      if (dist < nearestDist) { nearestDist = dist; nearest = id; }
    });
    d.nearest = nearest;
    const tr = getRect(nearest);
    if (!tr) return;
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
      runAnim(sL, sW, to.left, to.width, d.nearest, RELEASE_DURATION, curSy);
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
    if (to) runAnim(sL, sW, to.left, to.width, activeRef.current, CANCEL_DURATION, curSy);
    else { setPillDirect({ sy: 1, sx: 1 }); setNavScale(1); }
  }, [getRect, setPillDirect, runAnim]);

  // ─── Search button handlers ───

  const handleSearchPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button > 0) return;
    cancelAnimationFrame(searchAnimRaf.current);
    const timer = setTimeout(() => {
      const d = dragRef.current;
      if (!d || d.done) return;
      d.mode = "longpress";
      d.isSearchDrag = true;
      // Long press: uniform scale up (restored from original)
      setSearchBtnDirect({ scaleX: SEARCH_PEAK_SCALE, scaleY: SEARCH_PEAK_SCALE, translateX: 0, translateY: 0 });
      try { searchBtnRef.current?.setPointerCapture(e.pointerId); } catch (_) {}
    }, 200);
    dragRef.current = {
      startX: e.clientX, startY: e.clientY,
      startCX: e.clientX, startCY: e.clientY,
      pointerId: e.pointerId, tapped: null,
      mode: "pending", nearest: "home",
      done: false, timer, isSearchDrag: false,
    };
    e.preventDefault();
  }, [setSearchBtnDirect]);

const handleSearchPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
  const d = dragRef.current;
  if (!d || d.done) return;
  const dx = e.clientX - d.startCX;
  const dy = e.clientY - d.startCY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (d.mode === "pending" && dist > 6) {
    clearTimeout(d.timer);
    d.mode = "drag";
    d.isSearchDrag = true;
    try { searchBtnRef.current?.setPointerCapture(d.pointerId); } catch (_) {}
  }
  if (d.mode !== "drag" && d.mode !== "longpress") return;

  const tx = dx * 0.04;
  const ty = dy * 0.04;

  const stretchFactor = Math.min(dist / 120, 1);
  const longAxis = SEARCH_PEAK_SCALE + 0.28 * stretchFactor;  // peak scale + stretch
  const shortAxis = SEARCH_PEAK_SCALE - 0.10 * stretchFactor; // peak scale - compress

  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  const scaleX = absDx >= absDy ? longAxis : shortAxis;
  const scaleY = absDy > absDx ? longAxis : shortAxis;

  setSearchBtnDirect({ scaleX, scaleY, translateX: tx, translateY: ty });
}, [setSearchBtnDirect]);

  const handleSearchPointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d) return;
    clearTimeout(d.timer);
    const dx = e.clientX - d.startCX;
    const dy = e.clientY - d.startCY;
    const isClick = Math.sqrt(dx * dx + dy * dy) < 8 && d.mode === "pending";
    d.done = true;
    dragRef.current = null;

    if (isClick) {
      // Tap: quick uniform bounce then spring back (restored from original)
      setSearchBtnDirect({ scaleX: SEARCH_PEAK_SCALE, scaleY: SEARCH_PEAK_SCALE, translateX: 0, translateY: 0 });
      setTimeout(() => {
        animSearchReturn({ scaleX: SEARCH_PEAK_SCALE, scaleY: SEARCH_PEAK_SCALE, translateX: 0, translateY: 0 }, 220);
      }, 220);
    } else if (d.mode === "drag" || d.mode === "longpress") {
      animSearchReturn({ ...searchBtnRef2.current }, RELEASE_DURATION);
    } else {
      setSearchBtnDirect({ scaleX: 1, scaleY: 1, translateX: 0, translateY: 0 });
    }
  }, [animSearchReturn, setSearchBtnDirect]);

  const handleSearchPointerCancel = useCallback(() => {
    const d = dragRef.current;
    if (!d) return;
    clearTimeout(d.timer);
    d.done = true;
    dragRef.current = null;
    animSearchReturn({ ...searchBtnRef2.current }, CANCEL_DURATION);
  }, [animSearchReturn]);

  useEffect(() => () => {
    cancelAnimationFrame(animRaf.current);
    cancelAnimationFrame(shimRaf.current);
    cancelAnimationFrame(searchAnimRaf.current);
  }, []);

  const s = pill.shimmer;
  const pillBg = `rgba(255,255,255,${0.07 + s * 0.04})`;
  const pillShadow = [
    `inset 0 1px 0 rgba(255,255,255,${0.22 + s * 0.18})`,
    `inset 0 -1px 0 rgba(255,255,255,${0.04 + s * 0.05})`,
    `inset 1px 0 0 rgba(255,255,255,${0.06 + s * 0.07})`,
    `inset -1px 0 0 rgba(255,255,255,${0.05 + s * 0.06})`,
    `0 8px 32px rgba(0,0,0,${0.4 + s * 0.15})`,
    `0 2px 8px rgba(0,0,0,0.28)`,
  ].join(",");

  const searchTransform = `translate(${searchBtn.translateX}px, ${searchBtn.translateY}px) scaleX(${searchBtn.scaleX}) scaleY(${searchBtn.scaleY})`;

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(145deg,#0d0d1a 0%,#0a1628 30%,#12082a 60%,#0d1520 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", fontFamily: "'SF Pro Display',-apple-system,BlinkMacSystemFont,sans-serif", paddingBottom: 48, userSelect: "none", WebkitUserSelect: "none", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div style={{ position: "absolute", width: 340, height: 340, borderRadius: "50%", background: "radial-gradient(circle,rgba(88,86,214,.35) 0%,transparent 70%)", top: -80, left: -60, filter: "blur(40px)" }} />
        <div style={{ position: "absolute", width: 280, height: 280, borderRadius: "50%", background: "radial-gradient(circle,rgba(52,199,89,.18) 0%,transparent 70%)", top: 40, right: -40, filter: "blur(50px)" }} />
        <div style={{ position: "absolute", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle,rgba(10,132,255,.22) 0%,transparent 70%)", bottom: 60, left: "20%", filter: "blur(60px)" }} />
        <div style={{ position: "absolute", width: 220, height: 220, borderRadius: "50%", background: "radial-gradient(circle,rgba(255,55,95,.16) 0%,transparent 70%)", bottom: 100, right: 30, filter: "blur(45px)" }} />
        <div style={{ position: "absolute", width: 180, height: 180, borderRadius: "50%", background: "radial-gradient(circle,rgba(255,214,10,.10) 0%,transparent 70%)", top: "35%", left: "40%", filter: "blur(35px)" }} />
      </div>

      <p style={{ position: "absolute", bottom: 130, left: 0, right: 0, textAlign: "center", fontSize: 12, color: "rgba(255,255,255,.25)", letterSpacing: ".3px", pointerEvents: "none", zIndex: 1 }}>tap · drag · long-press &amp; drag</p>

      <div style={{ flex: 1, position: "relative", zIndex: 1, width: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {tabs.map((t) => (
          <div key={t.id} style={{ position: "absolute", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, opacity: active === t.id ? 1 : 0, transform: active === t.id ? "translateY(0) scale(1)" : "translateY(16px) scale(0.95)", transition: "opacity 0.40s ease, transform 0.50s cubic-bezier(0.34,1.4,0.64,1)", pointerEvents: "none" }}>
            <div style={{ fontSize: 62, lineHeight: 1, filter: "drop-shadow(0 8px 30px rgba(100,100,255,0.4))" }}>{t.emoji}</div>
            <p style={{ fontSize: 28, fontWeight: 600, color: "rgba(255,255,255,.92)", margin: 0, letterSpacing: "-.5px", textShadow: "0 2px 12px rgba(0,0,0,.4)" }}>{t.label}</p>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,.45)", margin: 0 }}>{t.sub}</p>
          </div>
        ))}
      </div>

      <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 10, padding: "0 6px" }}>
        <div
          ref={containerRef}
          style={{ position: "relative", display: "flex", alignItems: "center", background: "rgba(255,255,255,.10)", backdropFilter: "blur(40px) saturate(180%)", WebkitBackdropFilter: "blur(40px) saturate(180%)", borderRadius: 100, padding: "5px 6px", boxShadow: ["inset 0 1px 0 rgba(255,255,255,.30)", "inset 0 -1px 0 rgba(255,255,255,.04)", "inset 1px 0 0 rgba(255,255,255,.08)", "inset -1px 0 0 rgba(255,255,255,.06)", "0 20px 60px rgba(0,0,0,.45)", "0 4px 16px rgba(0,0,0,.30)"].join(","), border: ".5px solid rgba(255,255,255,.14)", touchAction: "none", cursor: "pointer", overflow: "visible", WebkitTapHighlightColor: "transparent", outline: "none", transform: `scale(${navScale})`, transformOrigin: "center bottom", willChange: "transform" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
          <div style={{ position: "absolute", top: 5, bottom: 5, left: pill.left, width: pill.width, borderRadius: 100, background: pillBg, backdropFilter: "blur(20px) saturate(200%)", WebkitBackdropFilter: "blur(20px) saturate(200%)", boxShadow: pillShadow, border: `0.5px solid rgba(255,255,255,${0.2 + s * 0.15})`, transform: `scaleY(${pill.sy}) scaleX(${pill.sx})`, transformOrigin: "center center", willChange: "left,width,transform", overflow: "hidden", pointerEvents: "none" }}>
            <div style={{ position: "absolute", top: 0, left: "8%", right: "8%", height: 1.5, borderRadius: 10, background: `rgba(255,255,255,${0.28 + s * 0.18})` }} />
            <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 0%,rgba(255,255,255,${0.05 + s * 0.05}) 0%,transparent 70%)` }} />
            <div style={{ position: "absolute", bottom: 0, left: "15%", right: "15%", height: 1, borderRadius: 10, background: `rgba(0,0,0,${0.18 - s * 0.06})` }} />
          </div>
          {tabs.map((tab) => {
            const isActive = active === tab.id;
            const tf = iconTf[tab.id] ?? DEFAULT_TF;
            return (
              <button
                key={tab.id}
                ref={(el) => { tabRefs.current[tab.id] = el; }}
                style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "8px 14px", border: "none", background: "transparent", cursor: "pointer", borderRadius: 100, minWidth: 68, color: isActive ? "rgba(255,255,255,.96)" : "rgba(255,255,255,.42)", WebkitTapHighlightColor: "transparent", outline: "none", transition: "color .30s ease", pointerEvents: "none" }}
              >
                <div style={{ transform: `scaleY(${tf.sy}) scaleX(${tf.sx})`, transformOrigin: "center bottom", willChange: "transform", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", filter: isActive ? "drop-shadow(0 0 8px rgba(255,255,255,0.5))" : "none", transition: "filter .30s ease" }}>
                  <tab.Icon />
                </div>
                <span style={{ fontSize: 11, fontWeight: isActive ? 600 : 400, lineHeight: 1, letterSpacing: isActive ? "-.2px" : ".1px", transition: "font-weight .25s, letter-spacing .25s, color .30s ease", display: "inline-block", transform: `scaleX(${tf.sx})`, willChange: "transform" }}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>

        <button
          ref={searchBtnRef}
          style={{
            width: 52, height: 52, borderRadius: "50%",
            background: "rgba(255,255,255,.10)",
            backdropFilter: "blur(40px) saturate(180%)",
            WebkitBackdropFilter: "blur(40px) saturate(180%)",
            boxShadow: ["inset 0 1px 0 rgba(255,255,255,.30)", "inset 0 -1px 0 rgba(255,255,255,.04)", "0 20px 60px rgba(0,0,0,.40)", "0 4px 16px rgba(0,0,0,.28)"].join(","),
            border: ".5px solid rgba(255,255,255,.14)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: "rgba(255,255,255,.55)",
            WebkitTapHighlightColor: "transparent", outline: "none",
            flexShrink: 0,
            transform: searchTransform,
            transformOrigin: "center center",
            willChange: "transform",
            touchAction: "none",
          }}
          onPointerDown={handleSearchPointerDown}
          onPointerMove={handleSearchPointerMove}
          onPointerUp={handleSearchPointerUp}
          onPointerCancel={handleSearchPointerCancel}
        >
          <SearchIcon />
        </button>
      </div>
    </div>
  );
}