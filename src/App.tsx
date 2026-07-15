import { useState, useEffect, useLayoutEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { Game } from './components/game/Game';
import { CloudSyncButton } from './components/editor/CloudSyncButton';
import { SoundSettings } from './components/shared/SoundSettings';
import { NavCalendar } from './components/shared/NavCalendar';
import { ConsentBanner } from './components/shared/ConsentBanner';
import { RouteFade } from './components/shared/RouteFade';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { applyThemeAssets, subscribeToThemeAssets, loadThemeAssets, fetchThemeAssetsFromCloud, type ThemeAssets } from './utils/themeAssets';
import { applyNavTorchLight } from './components/shared/navTorchLight';
import { GateBeamMesh } from './components/shared/GateMesh';
import { PortcullisMesh } from './components/game/PortcullisMesh';
import { getLatestPostTimestamp } from './services/newsService';
import { ToastContainer } from './components/shared/Toast';
import { GlobalSearch } from './components/shared/GlobalSearch';
import { LoginPage } from './components/auth/LoginPage';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { UserMenu } from './components/auth/UserMenu';
import { useAuth } from './contexts/AuthContext';

// Lazy-loaded routes — only downloaded when navigated to
const AssetManager = lazy(() => import('./components/editor/AssetManager').then(m => ({ default: m.AssetManager })));
const Compendium = lazy(() => import('./components/compendium/Compendium').then(m => ({ default: m.Compendium })));
const SettingsPage = lazy(() => import('./components/editor/SettingsPage').then(m => ({ default: m.SettingsPage })));
const TrainingGrounds = lazy(() => import('./components/training/TrainingGrounds').then(m => ({ default: m.TrainingGrounds })));
const EditorsPage = lazy(() => import('./components/editor/EditorsPage').then(m => ({ default: m.EditorsPage })));
const PuzzleResourcesPage = lazy(() => import('./components/editor/PuzzleResourcesPage').then(m => ({ default: m.PuzzleResourcesPage })));
const TownCrierPage = lazy(() => import('./components/townCrier/TownCrierPage').then(m => ({ default: m.TownCrierPage })));
const ProfilePage = lazy(() => import('./components/player/ProfilePage').then(m => ({ default: m.ProfilePage })));
const PrivacyPolicy = lazy(() => import('./components/player/PrivacyPolicy').then(m => ({ default: m.PrivacyPolicy })));

// Page title mapping per route
const PAGE_TITLES: Record<string, string> = {
  '/': 'Play',
  '/login': 'Sign In',
  '/compendium': 'The Slab',
  '/training': 'Training Sandbox',
  '/editors': 'Editors',
  '/puzzle-resources': 'Admin Controls',
  '/town-crier': 'Town Crier',
  '/assets': 'Assets',
  '/settings': 'Settings',
};

const DEFAULT_SITE_NAME = 'Puzzle Daily';

function usePageTitle() {
  const location = useLocation();
  useEffect(() => {
    const updateTitle = () => {
      const theme = loadThemeAssets();
      const siteName = theme.browserTabTitle || theme.siteTitle || DEFAULT_SITE_NAME;
      const pageTitle = PAGE_TITLES[location.pathname];
      document.title = pageTitle ? `${pageTitle} | ${siteName}` : siteName;
    };
    updateTitle();
    return subscribeToThemeAssets(updateTitle);
  }, [location.pathname]);
}

// Get a random logo from variants (selected once per session)
let cachedRandomLogo: { image: string; frameCount: number; frameRate: number } | null = null;

function getRandomLogo(themeAssets: ThemeAssets): { image: string; frameCount: number; frameRate: number } | null {
  // If randomization is disabled or no variants, return null
  if (!themeAssets.logoRandomize) return null;

  // Build array of all available logos (main logo + variants)
  const allLogos: { image: string; frameCount: number; frameRate: number }[] = [];

  // Add main logo if it exists
  if (themeAssets.logo) {
    allLogos.push({
      image: themeAssets.logo,
      frameCount: Number(themeAssets.logoFrameCount) || 1,
      frameRate: Number(themeAssets.logoFrameRate) || 10,
    });
  }

  // Add variants
  if (themeAssets.logoVariants && themeAssets.logoVariants.length > 0) {
    for (const variant of themeAssets.logoVariants) {
      if (variant.image) {
        allLogos.push({
          image: variant.image,
          frameCount: variant.frameCount || 1,
          frameRate: variant.frameRate || 10,
        });
      }
    }
  }

  // Need at least 2 logos for randomization to make sense
  if (allLogos.length < 2) return null;

  // Use cached selection if available (persists for the session)
  if (cachedRandomLogo) {
    // Verify the cached logo is still in the list
    const stillExists = allLogos.some(l => l.image === cachedRandomLogo!.image);
    if (stillExists) return cachedRandomLogo;
  }

  // Select a random logo
  const randomIndex = Math.floor(Math.random() * allLogos.length);
  cachedRandomLogo = allLogos[randomIndex];
  return cachedRandomLogo;
}

// Animated Logo component that supports sprite sheets
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
      // Calculate frame dimensions (horizontal sprite sheet)
      const frameWidth = Math.floor(img.width / frameCount);
      const frameHeight = img.height;

      // Set canvas size to single frame size
      canvas.width = frameWidth;
      canvas.height = frameHeight;

      // Scale canvas display size to fit height while maintaining aspect ratio
      const displayHeight = 48;
      const displayWidth = frameWidth * (displayHeight / frameHeight);
      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;

      // Only touch the canvas when the frame index actually changes —
      // repainting an identical frame every rAF keeps this layer dirty at
      // 60Hz for the compositor (one of ~8 such loops that were dragging
      // mobile Safari below 60fps). The torch shading is a pure function of
      // the frame, so skipping identical repaints is pixel-identical.
      let lastDrawnFrame = -1;
      const animate = () => {
        const now = Date.now();

        // Update frame if enough time has passed
        if (now - lastFrameTimeRef.current >= frameDuration) {
          frameIndexRef.current = (frameIndexRef.current + 1) % frameCount;
          lastFrameTimeRef.current = now;
        }

        if (frameIndexRef.current !== lastDrawnFrame) {
          lastDrawnFrame = frameIndexRef.current;
          // Clear and draw current frame
          ctx.clearRect(0, 0, frameWidth, frameHeight);
          ctx.drawImage(
            img,
            frameIndexRef.current * frameWidth, 0, frameWidth, frameHeight,
            0, 0, frameWidth, frameHeight
          );
          applyNavTorchLight(ctx, frameWidth, frameHeight);
        }

        animationFrameId = requestAnimationFrame(animate);
      };

      animate();
    };

    img.src = src;

    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [src, frameCount, frameRate]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        imageRendering: 'pixelated',
        display: 'block'
      }}
      aria-label={alt}
    />
  );
}

function Navigation() {
  const location = useLocation();
  const { user, isCreator } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [themeAssets, setThemeAssets] = useState<ThemeAssets>({});
  const [searchOpen, setSearchOpen] = useState(false);
  const [hasUnreadNews, setHasUnreadNews] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  // Track navbar height as CSS variable for sticky quest panel positioning
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
  // instant=true (link taps) skips the winch-up entirely — the gate is
  // just gone as the destination page appears; only the hamburger X
  // plays the animated close. The flag clears on the next open.
  const [instantClose, setInstantClose] = useState(false);
  const closeMobileMenu = useCallback((instant = false) => {
    setInstantClose(instant);
    setMobileMenuOpen(false);
  }, []);

  // The gate's bottom: when the play page's control rail is mounted, the
  // menu docks with it — the rail rides the gate's leading edge (the
  // body class + --gate-drop below; CSS in index.css). When the rail is
  // absent (victory hides it, replay swaps it out, other pages never
  // have it) the utility row carries its own spiked rail instead.
  // Sniffed at open time: NavBar has no line to Game's state, and the
  // menu can't outlive an open (route changes close it).
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
      // A mid-flight gate-settle would override the ride transition
      // (animations beat transitions) and pin the rail while the gate
      // lowers alone. Jump it to its end state (home) so the ride
      // transitions from there as normal.
      document.querySelectorAll('.gate-settle').forEach(el => {
        el.getAnimations().forEach(a => { try { a.finish(); } catch { /* infinite anims can't finish */ } });
      });
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

  const toggleMobileMenu = useCallback(() => {
    if (mobileMenuOpen) {
      closeMobileMenu();
    } else {
      setInstantClose(false);
      setMobileMenuOpen(true);
    }
  }, [mobileMenuOpen, closeMobileMenu]);

  // Update page title on route change
  usePageTitle();

  // Track Town Crier badge — mark read on visit, check for new posts on nav
  useEffect(() => {
    if (location.pathname === '/town-crier') {
      localStorage.setItem('town_crier_last_visit', new Date().toISOString());
      setHasUnreadNews(false);
    }
  }, [location.pathname]);

  useEffect(() => {
    let cancelled = false;
    async function checkUnread() {
      const latest = await getLatestPostTimestamp();
      if (cancelled) return;
      if (!latest) { setHasUnreadNews(false); return; }
      const lastVisit = localStorage.getItem('town_crier_last_visit');
      setHasUnreadNews(!lastVisit || new Date(latest) > new Date(lastVisit));
    }
    checkUnread();
    return () => { cancelled = true; };
  }, [location.pathname]);

  // Ctrl+K / Cmd+K to open search (only for creators)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (isCreator) setSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isCreator is captured via closure; dep on user is intentional
  }, [user]);

  // Load theme assets and subscribe to changes
  useEffect(() => {
    setThemeAssets(loadThemeAssets());
    const unsubscribe = subscribeToThemeAssets((assets) => {
      setThemeAssets(assets);
    });
    return unsubscribe;
  }, []);

  const isActive = (path: string) => location.pathname === path;

  // One list drives both menus: desktop (wall-mounted planks) and mobile
  // (rope-strung planks). Dark carved text is readable on wood, which is
  // why every nav item sits on a plank rather than on the bare dark stones.
  const navItems: Array<{ to: string; label: string; unread?: boolean }> = [
    { to: '/', label: themeAssets.navLabelPlay || 'Play' },
    { to: '/town-crier', label: 'Town Crier', unread: hasUnreadNews },
    { to: '/compendium', label: themeAssets.navLabelCompendium || 'The Slab' },
    { to: '/training', label: 'Training' },
    ...(isCreator ? [
      { to: '/assets', label: themeAssets.navLabelAssets || 'Assets' },
      { to: '/editors', label: themeAssets.navLabelEditor || 'Editors' },
      { to: '/puzzle-resources', label: 'Admin Controls' },
      { to: '/settings', label: 'Settings' },
    ] : []),
  ];

  // Get navbar background style
  const navbarStyle: React.CSSProperties = {};
  if (themeAssets.colorBgNavbar) {
    navbarStyle.backgroundColor = themeAssets.colorBgNavbar;
  }
  if (themeAssets.bgNavbar) {
    navbarStyle.backgroundImage = `url(${themeAssets.bgNavbar})`;
    navbarStyle.backgroundSize = 'cover';
    navbarStyle.backgroundPosition = 'center';
  }
  // Use theme border color
  navbarStyle.borderColor = 'var(--theme-border-primary, #8c5c37)';

  return (
    <nav
      ref={navRef}
      className="relative md:sticky md:top-0 z-50"
    >
      {/* Top bar: the clean flat bar at every width (stone-wall meshes were
          retired — the tiled masonry and then the lintel both lost to the
          plain bar). navbarStyle lives here, not on the nav (there it
          tinted the open-menu area). NOTE: the nav is `relative` at every
          width — z-50 needs a positioned element, and with md:sticky alone
          it was inert on mobile, letting the control rail's rising bars
          (z-40) paint over the navbar. */}
      <div className="nav-topbar relative z-10 bg-stone-600 px-4 md:px-6 py-0.5 md:py-1.5 shadow-dungeon" style={navbarStyle}>
      {/* Marquee layout: logo/title dead-center at every width. Desktop
          puts the hamburger in flow right of the title, with a ghost
          spacer (w-11 = the button's 44px) on the left so the title stays
          truly page-centered; mobile keeps the hamburger pinned at the
          right edge (absolute, so it doesn't skew the centering). */}
      <div className="flex items-center justify-center gap-3 md:gap-4 relative z-10">
        {/* Calendar — the marquee's left counterweight: takes over the
            ghost spacer's 44px on desktop, pins to the left edge on
            mobile (mirroring the hamburger's right pin) */}
        <NavCalendar />
        {/* Logo/Title — pops off the wall */}
        <Link to="/" className="nav-pop flex items-center gap-2 md:gap-3 no-underline">
          {/* Custom logo or default torch icon */}
          {(() => {
            // Check for randomized logo first
            const randomLogo = getRandomLogo(themeAssets);
            const logoSrc = randomLogo?.image || themeAssets.logo;
            const logoFrameCount = randomLogo?.frameCount || Number(themeAssets.logoFrameCount) || 1;
            const logoFrameRate = randomLogo?.frameRate || Number(themeAssets.logoFrameRate) || 10;

            if (logoSrc) {
              // Check if this is an animated sprite sheet
              if (logoFrameCount > 1) {
                return (
                  <AnimatedLogo
                    src={logoSrc}
                    alt={themeAssets.logoAlt || 'Logo'}
                    frameCount={logoFrameCount}
                    frameRate={logoFrameRate}
                    className="h-8 md:h-12 flex-shrink-0"
                  />
                );
              } else {
                return (
                  <span className="nav-sprite-torchlit flex-shrink-0">
                    <img
                      src={logoSrc}
                      alt={themeAssets.logoAlt || 'Logo'}
                      className="h-8 md:h-12 w-auto object-contain"
                    />
                    <img
                      src={logoSrc}
                      alt=""
                      aria-hidden="true"
                      className="nav-sprite-torchlit-lit h-8 md:h-12 w-auto object-contain"
                    />
                  </span>
                );
              }
            } else {
              // No placeholder - show nothing while logo loads
              return null;
            }
          })()}
          {/* Title and subtitle - stacked vertically */}
          <div className="flex flex-col leading-tight">
            <h1 className="text-base xs:text-lg md:text-xl font-medieval font-bold text-copper-400 text-shadow-dungeon nav-title-glimmer tracking-wide whitespace-nowrap">
              {themeAssets.siteTitle || 'Puzzle Daily'}
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

        {/* Global search button (only for creators) — off the marquee:
            mobile keeps it just left of the pinned hamburger (right-12 =
            the button's 44px + 4px), desktop parks it at the far edge. */}
        {isCreator && (
          <button
            onClick={() => setSearchOpen(true)}
            className="absolute right-12 md:right-0 flex items-center gap-2 px-2.5 py-1.5 rounded bg-stone-700/60 hover:bg-stone-600/80 border border-stone-600 text-stone-400 hover:text-parchment-200 transition-colors text-sm"
            title="Search all assets (Ctrl+K)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="hidden lg:inline">Search...</span>
            <kbd className="hidden lg:inline text-xs text-stone-500 bg-stone-800 px-1 py-0.5 rounded border border-stone-700">Ctrl+K</kbd>
          </button>
        )}

        {/* Hamburger — the gate's winch: right edge on mobile, right of
            the centered title on desktop (sound/cloud/user controls live
            on the gate's utility rung) */}
        <button
          onClick={toggleMobileMenu}
          className="absolute right-0 md:static p-2 text-stone-400 hover:text-copper-400 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {mobileMenuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      </div>

      {/* The menu at every width — the portcullis lattice. Always
          mounted; the lattice translates -100%↔0 inside .menu-gate's
          clip box, OVER the page (absolute — the courtyard doesn't
          move; on the play page the control rail rides the drop as the
          gate's bottom). At md+ the gate is the board column's width,
          centered (see CSS). */}
      <div className={`menu-gate${mobileMenuOpen ? ' menu-gate-open' : ''}${instantClose ? ' menu-gate-instant' : ''}`}>
        <div>
          {/* pb: when docked with the control rail, pb-[17px] tunes the
              beam-to-rail gap (12px original + the 5px the rail's mt lost
              when the rung moved flush under the navbar — see Game.tsx);
              when the utility row IS the spiked bottom rail, pb-6 keeps
              its hanging spikes (37.5% of the row's height) inside
              .menu-gate's clip edge. */}
          <div ref={menuInnerRef} className={`pt-4 px-4 space-y-2 ${dockRail ? 'pb-[17px]' : 'pb-6'}`}>
            {/* One portcullis beam per nav item — opening the menu lowers
                the gate. The first beam's bars reach up behind the navbar
                (z-10). */}
            {navItems.map((item, i) => (
              <Link
                key={item.to}
                to={item.to}
                // Scroll home along with the dismissal — routes don't reset
                // scroll, so same-page picks left the target out of view.
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
              <SoundSettings />
              {isCreator && <CloudSyncButton />}
              <UserMenu />
            </div>
          </div>
        </div>
      </div>
      {isCreator && <GlobalSearch isOpen={searchOpen} onClose={() => setSearchOpen(false)} />}
    </nav>
  );
}

function App() {
  const lastScrollY = useRef(0);

  // Reveal the app after first paint (hides flash of unstyled content)
  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const root = document.getElementById('root');
        if (root) root.style.opacity = '1';
        // The pre-hydration splash (index.html) is done its job;
        // root's own fade-in covers the handoff.
        document.getElementById('splash')?.remove();
      });
    });
  }, []);

  // Apply theme assets on mount and subscribe to changes
  // If localStorage is empty (e.g. player build on different domain), fetch from cloud
  useEffect(() => {
    applyThemeAssets();
    fetchThemeAssetsFromCloud();
    const unsubscribe = subscribeToThemeAssets(() => {
      applyThemeAssets();
    });
    return unsubscribe;
  }, []);

  // Track scroll position for metallic border shine
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;

      // Metallic border shine effect
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const scrollPercent = maxScroll > 0 ? scrollY / maxScroll : 0;
      document.documentElement.style.setProperty('--scroll-percent', scrollPercent.toString());

      lastScrollY.current = scrollY;
    };

    // Initial update
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
          <Navigation />
          <ErrorBoundary>
            <RouteFade>
            <Suspense fallback={
              <div className="flex items-center justify-center p-12">
                <div className="text-copper-400 font-medieval text-lg animate-pulse">Loading...</div>
              </div>
            }>
              <Routes>
                <Route path="/" element={<Game />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/compendium" element={<Compendium />} />
                <Route path="/training" element={<TrainingGrounds />} />
                <Route path="/editors" element={<ProtectedRoute requiredRole="creator"><EditorsPage /></ProtectedRoute>} />
                <Route path="/town-crier" element={<TownCrierPage />} />
                <Route path="/puzzle-resources" element={<ProtectedRoute requiredRole="creator"><PuzzleResourcesPage /></ProtectedRoute>} />
                <Route path="/assets" element={<ProtectedRoute requiredRole="creator"><AssetManager /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute requiredRole="creator"><SettingsPage /></ProtectedRoute>} />
                <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
                <Route path="/privacy" element={<PrivacyPolicy />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
            </RouteFade>
          </ErrorBoundary>
          <ToastContainer />
          <ConsentBanner />
        </div>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
