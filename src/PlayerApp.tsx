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
      const siteName = theme.playerBrowserTabTitle || DEFAULT_SITE_NAME;
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
  const linkClass = (path: string) =>
    `nav-link px-2.5 py-1.5 rounded transition-all text-sm font-semibold whitespace-nowrap ${
      isActive(path) ? 'nav-link-active text-copper-300 shadow-glow-copper' : 'text-stone-400 hover:text-parchment-200'
    }`;

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

  return (
    <nav
      ref={navRef}
      className={`w-full z-40 transition-shadow duration-300 md:sticky md:top-0 ${
        scrolledPast.current ? 'shadow-lg shadow-black/50' : ''
      }`}
      style={{ backgroundColor: themeAssets.navbarBg || '#1a1a1a' }}
    >
      <div className="max-w-7xl mx-auto px-3 py-1.5 flex items-center gap-2">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          {logoSrc ? (
            <img src={logoSrc} alt="Logo" className="h-8 w-auto" style={{ imageRendering: 'pixelated' }} />
          ) : (
            <span className="text-xl">⚔️</span>
          )}
          <div className="hidden sm:block leading-tight">
            <div className="font-medieval text-copper-400 text-sm font-bold">{themeAssets.siteTitle || DEFAULT_SITE_NAME}</div>
            {themeAssets.siteSubtitle && <div className="text-[10px] text-stone-500">{themeAssets.siteSubtitle}</div>}
          </div>
        </Link>

        <div className="hidden md:flex items-center gap-2 ml-4">
          <Link to="/" className={linkClass('/')}>
            <span className="mr-1">{themeAssets.iconNavPlay || '\u2694'}</span> {themeAssets.navLabelPlay || 'Play'}
          </Link>
          <Link to="/town-crier" className={linkClass('/town-crier')}>
            <span className="mr-1">📣</span> Town Crier
            {hasUnreadNews && <span className="ml-1 w-2 h-2 bg-red-500 rounded-full inline-block animate-pulse" />}
          </Link>
          <Link to="/compendium" className={linkClass('/compendium')}>
            <span className="mr-1">{themeAssets.iconNavCompendium || '📖'}</span> {themeAssets.navLabelCompendium || 'Compendium'}
          </Link>
          <Link to="/training" className={linkClass('/training')}>
            <span className="mr-1">🎯</span> Training
          </Link>
        </div>

        <div className="flex-1" />

        <div className="hidden md:flex items-center gap-2">
          <SoundSettings />
          <UserMenu />
        </div>

        <button
          onClick={() => mobileMenuOpen ? closeMobileMenu() : setMobileMenuOpen(true)}
          className="md:hidden text-parchment-200 p-1.5"
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
        <div className={`md:hidden px-3 pb-3 space-y-1 ${mobileMenuDismissing ? 'animate-menu-slide-up' : 'animate-menu-slide-down'}`}
          style={{ backgroundColor: themeAssets.navbarBg || '#1a1a1a' }}>
          <Link to="/" className={`block ${linkClass('/')}`} onClick={closeMobileMenu}>
            <span className="mr-2">{themeAssets.iconNavPlay || '\u2694'}</span> {themeAssets.navLabelPlay || 'Play'}
          </Link>
          <Link to="/town-crier" className={`block ${linkClass('/town-crier')}`} onClick={closeMobileMenu}>
            <span className="mr-2">📣</span> Town Crier
            {hasUnreadNews && <span className="ml-1 w-2 h-2 bg-red-500 rounded-full inline-block animate-pulse" />}
          </Link>
          <Link to="/compendium" className={`block ${linkClass('/compendium')}`} onClick={closeMobileMenu}>
            <span className="mr-2">{themeAssets.iconNavCompendium || '📖'}</span> {themeAssets.navLabelCompendium || 'Compendium'}
          </Link>
          <Link to="/training" className={`block ${linkClass('/training')}`} onClick={closeMobileMenu}>
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
