/**
 * PlayerApp — Stripped-down app shell for the player-only build.
 * No editor, asset manager, settings, or admin routes/imports.
 * Built via `npm run build:player` using vite.config.player.ts.
 */
import { useState, useEffect, useLayoutEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Game } from './components/game/Game';
import { SoundSettings } from './components/shared/SoundSettings';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { applyThemeAssets, subscribeToThemeAssets, loadThemeAssets, fetchThemeAssetsFromCloud, type ThemeAssets } from './utils/themeAssets';
import { applyNavTorchLight } from './components/shared/navTorchLight';
import { GateBeamMesh } from './components/shared/GateMesh';
import { PortcullisMesh } from './components/game/PortcullisMesh';
import { getLatestPostTimestamp } from './services/newsService';
import { ToastContainer } from './components/shared/Toast';
import { LoginPage } from './components/auth/LoginPage';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { UserMenu } from './components/auth/UserMenu';
import { useAuth } from './contexts/AuthContext';

const Compendium = lazy(() => import('./components/compendium/Compendium').then(m => ({ default: m.Compendium })));
const TrainingGrounds = lazy(() => import('./components/training/TrainingGrounds').then(m => ({ default: m.TrainingGrounds })));
const TownCrierPage = lazy(() => import('./components/townCrier/TownCrierPage').then(m => ({ default: m.TownCrierPage })));
const ProfilePage = lazy(() => import('./components/player/ProfilePage').then(m => ({ default: m.ProfilePage })));

const PAGE_TITLES: Record<string, string> = {
  '/': 'Play',
  '/login': 'Sign In',
  '/compendium': 'Compendium',
  '/training': 'Training Sandbox',
  '/town-crier': 'Town Crier',
  '/profile': 'Profile',
};

const DEFAULT_SITE_NAME = 'Puzzle Daily';

function usePageTitle() {
  const location = useLocation();
  useEffect(() => {
    const updateTitle = () => {
      const theme = loadThemeAssets();
      const siteName = theme.playerBrowserTabTitle || theme.siteTitle || DEFAULT_SITE_NAME;
      const pageTitle = PAGE_TITLES[location.pathname];
      document.title = pageTitle ? `${pageTitle} | ${siteName}` : siteName;
    };
    updateTitle();
    return subscribeToThemeAssets(updateTitle);
  }, [location.pathname]);
}

// Random logo selection (same logic as App.tsx)
let cachedRandomLogo: { image: string; frameCount: number; frameRate: number } | null = null;

function getRandomLogo(themeAssets: ThemeAssets): { image: string; frameCount: number; frameRate: number } | null {
  if (!themeAssets.logoRandomize) return null;
  const allLogos: { image: string; frameCount: number; frameRate: number }[] = [];
  if (themeAssets.logo) {
    allLogos.push({ image: themeAssets.logo, frameCount: Number(themeAssets.logoFrameCount) || 1, frameRate: Number(themeAssets.logoFrameRate) || 10 });
  }
  if (themeAssets.logoVariants) {
    for (const v of themeAssets.logoVariants) {
      if (v.image) allLogos.push({ image: v.image, frameCount: v.frameCount || 1, frameRate: v.frameRate || 10 });
    }
  }
  if (allLogos.length === 0) return null;
  if (!cachedRandomLogo) cachedRandomLogo = allLogos[Math.floor(Math.random() * allLogos.length)];
  return cachedRandomLogo;
}

function AnimatedLogo({ src, alt, frameCount, frameRate, className }: {
  src: string;
  alt: string;
  frameCount: number;
  frameRate: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const frameIndexRef = useRef(0);
  // eslint-disable-next-line react-hooks/purity
  const lastFrameTimeRef = useRef(Date.now());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    imageRef.current = img;
    let animationFrameId: number | null = null;
    const frameDuration = 1000 / frameRate;

    img.onload = () => {
      const frameWidth = Math.floor(img.width / frameCount);
      const frameHeight = img.height;
      canvas.width = frameWidth;
      canvas.height = frameHeight;
      const displayHeight = 48;
      const displayWidth = frameWidth * (displayHeight / frameHeight);
      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;

      const animate = () => {
        const now = Date.now();
        if (now - lastFrameTimeRef.current >= frameDuration) {
          frameIndexRef.current = (frameIndexRef.current + 1) % frameCount;
          lastFrameTimeRef.current = now;
        }
        ctx.clearRect(0, 0, frameWidth, frameHeight);
        ctx.drawImage(img, frameIndexRef.current * frameWidth, 0, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight);
        applyNavTorchLight(ctx, frameWidth, frameHeight);
        animationFrameId = requestAnimationFrame(animate);
      };
      animate();
    };
    img.src = src;
    return () => { if (animationFrameId !== null) cancelAnimationFrame(animationFrameId); };
  }, [src, frameCount, frameRate]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ imageRendering: 'pixelated', display: 'block' }}
      aria-label={alt}
    />
  );
}

function PlayerNavigation() {
  const location = useLocation();
  const { user: _user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [themeAssets, setThemeAssets] = useState<ThemeAssets>({});
  const [hasUnreadNews, setHasUnreadNews] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  usePageTitle();

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const updateHeight = () => {
      document.documentElement.style.setProperty('--nav-height', `${nav.offsetHeight}px`);
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(nav);
    return () => observer.disconnect();
  }, []);

  // No dismissing state/timeout anymore: the menu is always mounted and
  // .menu-gate's CSS transition animates the close on class removal.
  // instant=true (link taps / route changes) skips the winch-up entirely
  // — the gate is just gone as the destination page appears; only the
  // hamburger X plays the animated close. The flag clears on next open.
  const [instantClose, setInstantClose] = useState(false);
  const closeMobileMenu = useCallback((instant = false) => {
    setInstantClose(instant);
    setMobileMenuOpen(false);
  }, []);

  useEffect(() => { closeMobileMenu(true); }, [location.pathname, closeMobileMenu]);

  // The gate's bottom: when the play page's control rail is mounted, the
  // menu docks with it — the rail rides the gate's leading edge (the
  // body class + --gate-drop below; CSS in index.css). When the rail is
  // absent (victory hides it, replay swaps it out, other pages never
  // have it) the utility row carries its own spiked rail instead.
  // Sniffed at open time: the navbar has no line to Game's state, and
  // the menu can't outlive an open (route changes close it).
  const menuInnerRef = useRef<HTMLDivElement>(null);
  const [dockRail, setDockRail] = useState(false);

  useLayoutEffect(() => {
    if (mobileMenuOpen) {
      setDockRail(location.pathname === '/' && !!document.querySelector('.control-rail-mesh'));
    }
  }, [mobileMenuOpen, location.pathname]);

  // Separate effect, AFTER dockRail settles: --gate-drop must measure the
  // menu at its docked padding (pb-3), not the pb-6 it renders while
  // undocked — a 12px docking error otherwise. Both layout effects flush
  // before paint, so the rail's ride and the gate's drop start together.
  useLayoutEffect(() => {
    const body = document.body;
    // Instant twin BEFORE dropping the ride class: both land in the same
    // style recalc, so the rail snaps home instead of winching up.
    body.classList.toggle('menu-gate-instant', !mobileMenuOpen && instantClose);
    if (mobileMenuOpen && dockRail && menuInnerRef.current) {
      body.style.setProperty('--gate-drop', `${menuInnerRef.current.offsetHeight}px`);
      body.classList.add('menu-gate-lowered');
    } else {
      body.classList.remove('menu-gate-lowered');
    }
    return () => {
      body.classList.remove('menu-gate-lowered');
      body.classList.remove('menu-gate-instant');
    };
  }, [mobileMenuOpen, dockRail, instantClose]);

  useEffect(() => {
    setThemeAssets(loadThemeAssets());
    return subscribeToThemeAssets(() => setThemeAssets(loadThemeAssets()));
  }, []);

  useEffect(() => {
    const lastVisit = localStorage.getItem('town_crier_last_visit');
    getLatestPostTimestamp().then(ts => {
      if (ts && (!lastVisit || new Date(ts) > new Date(lastVisit))) setHasUnreadNews(true);
      else setHasUnreadNews(false);
    });
  }, [location.pathname]);

  const isActive = (path: string) => location.pathname === path;
  // One list drives the gate menu at every width (desktop's separate
  // text-link row was retired — the portcullis IS the nav)
  const navItems: Array<{ to: string; label: string; unread?: boolean }> = [
    { to: '/', label: themeAssets.navLabelPlay || 'Play' },
    { to: '/town-crier', label: 'Town Crier', unread: hasUnreadNews },
    { to: '/compendium', label: themeAssets.navLabelCompendium || 'Compendium' },
    { to: '/training', label: 'Training' },
  ];

  const scrolledPast = useRef(false);
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const past = window.scrollY > 20;
      if (past !== scrolledPast.current) { scrolledPast.current = past; forceUpdate(n => n + 1); }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const randomLogo = getRandomLogo(themeAssets);
  const logoSrc = randomLogo?.image || themeAssets.logo;
  const logoFrameCount = randomLogo?.frameCount || Number(themeAssets.logoFrameCount) || 1;
  const logoFrameRate = randomLogo?.frameRate || Number(themeAssets.logoFrameRate) || 10;

  // Build navbar style (matching dev app logic)
  const navbarStyle: Record<string, string> = {};
  if (themeAssets.colorBgNavbar) {
    navbarStyle.backgroundColor = themeAssets.colorBgNavbar;
  }
  if (themeAssets.bgNavbar) {
    navbarStyle.backgroundImage = `url(${themeAssets.bgNavbar})`;
    navbarStyle.backgroundSize = 'cover';
    navbarStyle.backgroundPosition = 'center';
  }
  navbarStyle.borderColor = 'var(--theme-border-primary, #8c5c37)';

  return (
    <nav
      ref={navRef}
      className="relative md:sticky md:top-0 z-50"
    >
      {/* Top bar: the clean flat bar at every width (stone-wall meshes were
          retired) — no gold bottom border. The gate menu hangs below as
          a sibling so it can't stretch the bar. NOTE: the nav is `relative`
          at every width — z-50 needs a positioned element, and with
          md:sticky alone it was inert on mobile, letting the control
          rail's rising bars (z-40) paint over the navbar. */}
      <div
        className={`relative z-10 bg-stone-600 px-4 md:px-6 py-0.5 md:py-1.5 shadow-dungeon transition-shadow duration-300 ${
          // eslint-disable-next-line react-hooks/refs
          scrolledPast.current ? 'shadow-lg shadow-black/50' : ''
        }`}
        style={navbarStyle}
      >
      {/* One nav at every width (user's call: the portcullis menu is the
          identity, mobile-first game — desktop gets the same hamburger,
          not a separate link row). Marquee layout: logo/title dead-center;
          desktop puts the hamburger in flow right of the title with a
          ghost spacer (w-11 = the button's 44px) balancing the left so
          the title stays truly page-centered; mobile keeps the hamburger
          pinned at the right edge (absolute, doesn't skew centering). */}
      <div className="flex items-center justify-center gap-3 md:gap-4 relative z-10">
        <div className="hidden md:block w-11 shrink-0" aria-hidden="true" />
        <div className="flex items-center gap-2 md:gap-4">
        <Link to="/" className="flex items-center gap-2 md:gap-3 no-underline shrink-0">
          {logoSrc ? (
            logoFrameCount > 1 ? (
              <AnimatedLogo
                src={logoSrc}
                alt={themeAssets.logoAlt || 'Logo'}
                frameCount={logoFrameCount}
                frameRate={logoFrameRate}
                className="h-8 md:h-12 flex-shrink-0"
              />
            ) : (
              <span className="nav-sprite-torchlit">
              <img src={logoSrc} alt={themeAssets.logoAlt || 'Logo'} className="h-8 w-auto" style={{ imageRendering: 'pixelated' }} />
              <img src={logoSrc} alt="" aria-hidden="true" className="nav-sprite-torchlit-lit h-8 w-auto" style={{ imageRendering: 'pixelated' }} />
            </span>
            )
          ) : (
            <span className="text-xl">⚔️</span>
          )}
          <div className="flex flex-col leading-tight">
            <h1 className="text-base xs:text-lg md:text-xl font-medieval font-bold text-copper-400 text-shadow-dungeon nav-title-glimmer tracking-wide whitespace-nowrap">
              {themeAssets.siteTitle || DEFAULT_SITE_NAME}
            </h1>
            {themeAssets.siteSubtitle && (
              <span
                className="font-medieval text-shadow-dungeon"
                style={{
                  color: themeAssets.siteSubtitleColor || 'rgba(212, 165, 116, 0.8)',
                  fontSize: (() => {
                    const sizeMap: Record<string, string> = {
                      'x-small': '0.65rem',
                      'small': '0.75rem',
                      'medium': '0.85rem',
                      'large': '0.95rem',
                      'x-large': '1.05rem',
                    };
                    return sizeMap[themeAssets.siteSubtitleSize || 'small'] || sizeMap['small'];
                  })()
                }}
              >
                {themeAssets.siteSubtitle}
              </span>
            )}
          </div>
        </Link>

        </div>

        {/* Hamburger — the gate's winch: right edge on mobile, right of
            the centered title on desktop */}
        <button
          onClick={() => {
            if (mobileMenuOpen) {
              closeMobileMenu();
            } else {
              setInstantClose(false);
              setMobileMenuOpen(true);
            }
          }}
          className="p-2 text-stone-400 hover:text-copper-400 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center absolute right-3 md:static"
          aria-label="Menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {mobileMenuOpen
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
          </svg>
        </button>
      </div>

      </div>

      {/* The menu at every width — the portcullis lattice: one beam per
          item, gate bars running through the stack. Always mounted; the
          lattice translates -100%↔0 inside .menu-gate's clip box, OVER
          the page (absolute — the courtyard doesn't move; on the play
          page the control rail rides the drop as the gate's bottom). At
          md+ the gate is the board column's width, centered (see CSS). */}
      <div className={`menu-gate${mobileMenuOpen ? ' menu-gate-open' : ''}${instantClose ? ' menu-gate-instant' : ''}`}>
        <div>
          {/* pb: when docked with the control rail, pb-3 = 12px tunes the
              beam-to-rail gap (see Game.tsx); when the utility row IS the
              spiked bottom rail, pb-6 keeps its hanging spikes (37.5% of
              the row's height) inside .menu-gate's clip edge. */}
          <div ref={menuInnerRef} className={`pt-4 px-4 space-y-2 ${dockRail ? 'pb-3' : 'pb-6'}`}>
            {navItems.map((item, i) => (
              <Link
                key={item.to}
                to={item.to}
                // Scroll home along with the dismissal — without this, picking
                // Play while already on / left the page stranded mid-scroll
                // with the board out of view (routes don't reset scroll).
                // instant: a tapped link means GO — no winch-up over the
                // arriving page.
                onClick={() => { closeMobileMenu(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className={`nav-gate-item block px-8 py-2.5 text-center ${isActive(item.to) ? 'nav-gate-item-active' : ''}`}
              >
                <GateBeamMesh first={i === 0} />
                <span>
                  {item.label}
                  {item.unread && <span className="ml-1 w-2 h-2 bg-red-500 rounded-full inline-block animate-pulse" />}
                </span>
              </Link>
            ))}
            {/* Utility row: when the control rail is riding the gate below
                us it rides a plain beam (the rail is the gate's spiked
                bottom); otherwise it IS the bottom rail — the same
                PortcullisMesh the control panel wears, spikes and all. */}
            <div className="nav-gate-item px-8 py-2 flex items-center gap-2 justify-center">
              {dockRail ? <GateBeamMesh /> : <PortcullisMesh className="nav-gate-rail-mesh" />}
              <SoundSettings isMobile />
              <UserMenu />
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}

function NotFoundPage() {
  const themeAssets = loadThemeAssets();
  const iconSrc = themeAssets.notFoundIcon;
  const frameCount = Number(themeAssets.notFoundIconFrameCount) || 1;
  const frameRate = Number(themeAssets.notFoundIconFrameRate) || 10;

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <div className="mb-4">
        {iconSrc ? (
          frameCount > 1 ? (
            <AnimatedLogo
              src={iconSrc}
              alt="Page not found"
              frameCount={frameCount}
              frameRate={frameRate}
              className="h-24 md:h-32"
            />
          ) : (
            <img src={iconSrc} alt="Page not found" className="h-24 md:h-32 w-auto mx-auto" style={{ imageRendering: 'pixelated' }} />
          )
        ) : (
          <span className="text-6xl">🏚️</span>
        )}
      </div>
      <h1 className="text-3xl md:text-4xl font-medieval font-bold text-copper-400 text-shadow-dungeon mb-3">
        Page Not Found
      </h1>
      <p className="text-stone-400 text-lg mb-6 max-w-md">
        This dungeon corridor leads nowhere. The path you seek does not exist.
      </p>
      <Link
        to="/"
        className="nav-link-btn px-6 py-3 font-medieval font-semibold text-base"
      >
        Return to the Entrance
      </Link>
    </div>
  );
}

function PlayerApp() {
  const lastScrollY = useRef(0);

  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const root = document.getElementById('root');
        if (root) root.style.opacity = '1';
        // The pre-hydration splash (index.player.html) is done its job;
        // root's own fade-in covers the handoff.
        document.getElementById('splash')?.remove();
      });
    });
  }, []);

  useEffect(() => {
    applyThemeAssets();
    fetchThemeAssetsFromCloud();
    const unsubscribe = subscribeToThemeAssets(() => applyThemeAssets());
    return unsubscribe;
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const scrollPercent = maxScroll > 0 ? scrollY / maxScroll : 0;
      document.documentElement.style.setProperty('--scroll-percent', scrollPercent.toString());
      lastScrollY.current = scrollY;
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, []);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <div className="min-h-screen theme-root">
          <PlayerNavigation />
          <ErrorBoundary autoReloadOnChunkError>
            <Suspense fallback={
              <div className="flex items-center justify-center p-12">
                <div className="text-copper-400 font-medieval text-lg animate-pulse">Loading...</div>
              </div>
            }>
              <Routes>
                <Route path="/" element={<Game enableDailyLock={true} />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/compendium" element={<Compendium />} />
                <Route path="/training" element={<TrainingGrounds />} />
                <Route path="/town-crier" element={<TownCrierPage />} />
                <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
          <ToastContainer />
        </div>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default PlayerApp;
