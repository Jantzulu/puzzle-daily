/**
 * PlayerApp — Stripped-down app shell for the player-only build.
 * No editor, asset manager, settings, or admin routes/imports.
 * Built via `npm run build:player` using vite.config.player.ts.
 */
import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { Game } from './components/game/Game';
import { SoundSettings } from './components/shared/SoundSettings';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { applyThemeAssets, subscribeToThemeAssets, loadThemeAssets, fetchThemeAssetsFromCloud, type ThemeAssets, type LogoVariant } from './utils/themeAssets';
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
  const { user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileMenuDismissing, setMobileMenuDismissing] = useState(false);
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

  const closeMobileMenu = useCallback(() => {
    setMobileMenuDismissing(true);
    setTimeout(() => {
      setMobileMenuOpen(false);
      setMobileMenuDismissing(false);
    }, 200);
  }, []);

  useEffect(() => { closeMobileMenu(); }, [location.pathname, closeMobileMenu]);

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
  // Desktop: buttonless plain text links
  const desktopLinkClass = (path: string) =>
    `nav-link px-2.5 py-1.5 rounded transition-all text-sm font-semibold whitespace-nowrap ${
      isActive(path) ? 'nav-link-active text-copper-300 shadow-glow-copper' : 'text-stone-400 hover:text-parchment-200'
    }`;
  // Mobile: button-styled links matching dev app
  const mobileLinkClass = (path: string) => `
    px-3 py-2 transition-all duration-200 font-medium text-sm
    nav-link-btn ${isActive(path) ? 'nav-link-active shadow-inner-dark' : ''}
  `;

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
      className={`bg-stone-600 border-b-2 px-4 md:px-6 py-0.5 md:py-1.5 shadow-dungeon md:sticky md:top-0 z-50 transition-shadow duration-300 ${
        scrolledPast.current ? 'shadow-lg shadow-black/50' : ''
      }`}
      style={navbarStyle}
    >
      <div className="flex items-center gap-3 md:gap-4 md:justify-center relative">
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
              <img src={logoSrc} alt={themeAssets.logoAlt || 'Logo'} className="h-8 w-auto" style={{ imageRendering: 'pixelated' }} />
            )
          ) : (
            <span className="text-xl">⚔️</span>
          )}
          <div className="flex flex-col leading-tight">
            <h1 className="text-base xs:text-lg md:text-xl font-medieval font-bold text-copper-400 text-shadow-dungeon tracking-wide whitespace-nowrap">
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

        <div className="hidden md:flex items-center gap-2 ml-4">
          <Link to="/" className={desktopLinkClass('/')}>
            <span className="mr-1">{themeAssets.iconNavPlay || '\u2694'}</span> {themeAssets.navLabelPlay || 'Play'}
          </Link>
          <Link to="/town-crier" className={desktopLinkClass('/town-crier')}>
            <span className="mr-1">📣</span> Town Crier
            {hasUnreadNews && <span className="ml-1 w-2 h-2 bg-red-500 rounded-full inline-block animate-pulse" />}
          </Link>
          <Link to="/compendium" className={desktopLinkClass('/compendium')}>
            <span className="mr-1">{themeAssets.iconNavCompendium || '📖'}</span> {themeAssets.navLabelCompendium || 'Compendium'}
          </Link>
          <Link to="/training" className={desktopLinkClass('/training')}>
            <span className="mr-1">🎯</span> Training
          </Link>
        </div>
        </div>

        {/* Right-side controls - absolutely positioned on desktop to keep center group truly centered */}
        <div className="hidden md:flex items-center gap-2 absolute right-3">
          <SoundSettings />
          <UserMenu />
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => mobileMenuOpen ? closeMobileMenu() : setMobileMenuOpen(true)}
          className="md:hidden p-2 text-stone-400 hover:text-copper-400 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center absolute right-3"
          aria-label="Menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {mobileMenuOpen
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
          </svg>
        </button>
      </div>

      {mobileMenuOpen && (
        <div className={`md:hidden mt-3 pt-3 border-t-2 border-stone-700 space-y-2 overflow-hidden ${mobileMenuDismissing ? 'animate-menu-slide-up' : 'animate-menu-slide-down'}`}>
          <Link to="/" className={`block ${mobileLinkClass('/')}`} onClick={closeMobileMenu}>
            <span className="mr-2">{themeAssets.iconNavPlay || '\u2694'}</span> {themeAssets.navLabelPlay || 'Play'}
          </Link>
          <Link to="/town-crier" className={`block ${mobileLinkClass('/town-crier')}`} onClick={closeMobileMenu}>
            <span className="mr-2">📣</span> Town Crier
            {hasUnreadNews && <span className="ml-1 w-2 h-2 bg-red-500 rounded-full inline-block animate-pulse" />}
          </Link>
          <Link to="/compendium" className={`block ${mobileLinkClass('/compendium')}`} onClick={closeMobileMenu}>
            <span className="mr-2">{themeAssets.iconNavCompendium || '📖'}</span> {themeAssets.navLabelCompendium || 'Compendium'}
          </Link>
          <Link to="/training" className={`block ${mobileLinkClass('/training')}`} onClick={closeMobileMenu}>
            <span className="mr-2">🎯</span> Training
          </Link>
          <div className="pt-3 mt-2 border-t border-stone-700 flex items-center gap-2">
            <SoundSettings isMobile />
            <UserMenu />
          </div>
        </div>
      )}
    </nav>
  );
}

function PlayerApp() {
  const lastScrollY = useRef(0);

  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const root = document.getElementById('root');
        if (root) root.style.opacity = '1';
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
                <Route path="/" element={<Game />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/compendium" element={<Compendium />} />
                <Route path="/training" element={<TrainingGrounds />} />
                <Route path="/town-crier" element={<TownCrierPage />} />
                <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
                <Route path="*" element={<Navigate to="/" replace />} />
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
