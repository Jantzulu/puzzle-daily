import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { Game } from './components/game/Game';
import { CloudSyncButton } from './components/editor/CloudSyncButton';
import { SoundSettings } from './components/shared/SoundSettings';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { applyThemeAssets, subscribeToThemeAssets, loadThemeAssets, fetchThemeAssetsFromCloud, type ThemeAssets, type LogoVariant } from './utils/themeAssets';
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

// Page title mapping per route
const PAGE_TITLES: Record<string, string> = {
  '/': 'Play',
  '/login': 'Sign In',
  '/compendium': 'Compendium',
  '/training': 'Training Sandbox',
  '/editors': 'Editors',
  '/puzzle-resources': 'Admin Controls',
  '/town-crier': 'Town Crier',
  '/assets': 'Assets',
  '/settings': 'Settings',
};

const SITE_NAME = 'Puzzle Daily';

function usePageTitle() {
  const location = useLocation();
  useEffect(() => {
    const pageTitle = PAGE_TITLES[location.pathname];
    document.title = pageTitle ? `${pageTitle} | ${SITE_NAME}` : SITE_NAME;
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

      const animate = () => {
        const now = Date.now();

        // Update frame if enough time has passed
        if (now - lastFrameTimeRef.current >= frameDuration) {
          frameIndexRef.current = (frameIndexRef.current + 1) % frameCount;
          lastFrameTimeRef.current = now;
        }

        // Clear and draw current frame
        ctx.clearRect(0, 0, frameWidth, frameHeight);
        ctx.drawImage(
          img,
          frameIndexRef.current * frameWidth, 0, frameWidth, frameHeight,
          0, 0, frameWidth, frameHeight
        );

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
  const [mobileMenuDismissing, setMobileMenuDismissing] = useState(false);
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

  const closeMobileMenu = useCallback(() => {
    setMobileMenuDismissing(true);
    setTimeout(() => {
      setMobileMenuOpen(false);
      setMobileMenuDismissing(false);
    }, 200);
  }, []);

  const toggleMobileMenu = useCallback(() => {
    if (mobileMenuOpen) {
      closeMobileMenu();
    } else {
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

  const linkClass = (path: string) => `
    px-3 md:px-4 py-2 transition-all duration-200 font-medium text-sm md:text-base
    nav-link-btn ${isActive(path) ? 'nav-link-active shadow-inner-dark' : ''}
  `;

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
      className="bg-stone-600 border-b-2 px-4 md:px-6 py-0.5 md:py-1.5 shadow-dungeon md:sticky md:top-0 z-50"
      style={navbarStyle}
    >
      <div className="flex items-center gap-3 md:gap-4">
        {/* Logo/Title */}
        <Link to="/" className="flex items-center gap-2 md:gap-3 no-underline">
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
                  <img
                    src={logoSrc}
                    alt={themeAssets.logoAlt || 'Logo'}
                    className="h-8 md:h-12 w-auto object-contain flex-shrink-0"
                  />
                );
              }
            } else {
              // No placeholder - show nothing while logo loads
              return null;
            }
          })()}
          {/* Title and subtitle - stacked vertically */}
          <div className="flex flex-col leading-tight">
            <h1 className="text-base xs:text-lg md:text-xl font-medieval font-bold text-copper-400 text-shadow-dungeon tracking-wide whitespace-nowrap">
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

        {/* Desktop navigation - closer to title */}
        <div className="hidden md:flex items-center gap-2 ml-4">
          <Link to="/" className={linkClass('/')}>
            <span className="mr-1">{themeAssets.iconNavPlay || '\u2694'}</span> {themeAssets.navLabelPlay || 'Play'}
          </Link>
          <Link to="/town-crier" className={linkClass('/town-crier')}>
            <span className="mr-1">{'\uD83D\uDCE3'}</span> Town Crier
            {hasUnreadNews && <span className="ml-1 w-2 h-2 bg-red-500 rounded-full inline-block animate-pulse" />}
          </Link>
          <Link to="/compendium" className={linkClass('/compendium')}>
            <span className="mr-1">{themeAssets.iconNavCompendium || '\uD83D\uDCD6'}</span> {themeAssets.navLabelCompendium || 'Compendium'}
          </Link>
          <Link to="/training" className={linkClass('/training')}>
            <span className="mr-1">{'\uD83C\uDFAF'}</span> Training
          </Link>
          {isCreator && <>
            <Link to="/assets" className={linkClass('/assets')}>
              <span className="mr-1">{themeAssets.iconNavAssets || '\uD83D\uDCE6'}</span> {themeAssets.navLabelAssets || 'Assets'}
            </Link>
            <Link to="/editors" className={linkClass('/editors')}>
              <span className="mr-1">{themeAssets.iconNavEditor || '\uD83D\uDEE0'}</span> {themeAssets.navLabelEditor || 'Editors'}
            </Link>
            <Link to="/puzzle-resources" className={linkClass('/puzzle-resources')}>
              <span className="mr-1">{'\uD83D\uDEE1\uFE0F'}</span> Admin Controls
            </Link>
            <Link to="/settings" className={linkClass('/settings')}>
              <span className="mr-1">⚙️</span> Settings
            </Link>
          </>}
        </div>

        <div className="flex-1" />

        {/* Global search button (only for creators) */}
        {isCreator && (
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-stone-700/60 hover:bg-stone-600/80 border border-stone-600 text-stone-400 hover:text-parchment-200 transition-colors text-sm"
            title="Search all assets (Ctrl+K)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="hidden lg:inline">Search...</span>
            <kbd className="hidden lg:inline text-xs text-stone-500 bg-stone-800 px-1 py-0.5 rounded border border-stone-700">Ctrl+K</kbd>
          </button>
        )}

        <div className="hidden md:flex items-center gap-2">
          <SoundSettings />
          {isCreator && <CloudSyncButton />}
          <UserMenu />
        </div>

        {/* Mobile hamburger button */}
        <button
          onClick={toggleMobileMenu}
          className="md:hidden p-2 text-stone-400 hover:text-copper-400 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
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

      {/* Mobile menu dropdown */}
      {mobileMenuOpen && (
        <div className={`md:hidden mt-3 pt-3 border-t-2 border-stone-700 space-y-2 overflow-hidden ${mobileMenuDismissing ? 'animate-menu-slide-up' : 'animate-menu-slide-down'}`}>
          <Link
            to="/"
            className={`block ${linkClass('/')}`}
            onClick={closeMobileMenu}
          >
            <span className="mr-2">{themeAssets.iconNavPlay || '\u2694'}</span> {themeAssets.navLabelPlay || 'Play'}
          </Link>
          <Link
            to="/town-crier"
            className={`block ${linkClass('/town-crier')}`}
            onClick={closeMobileMenu}
          >
            <span className="mr-2">{'\uD83D\uDCE3'}</span> Town Crier
            {hasUnreadNews && <span className="ml-1 w-2 h-2 bg-red-500 rounded-full inline-block animate-pulse" />}
          </Link>
          <Link
            to="/compendium"
            className={`block ${linkClass('/compendium')}`}
            onClick={closeMobileMenu}
          >
            <span className="mr-2">{themeAssets.iconNavCompendium || '\uD83D\uDCD6'}</span> {themeAssets.navLabelCompendium || 'Compendium'}
          </Link>
          <Link
            to="/training"
            className={`block ${linkClass('/training')}`}
            onClick={closeMobileMenu}
          >
            <span className="mr-2">{'\uD83C\uDFAF'}</span> Training
          </Link>
          {isCreator && <>
            <Link
              to="/assets"
              className={`block ${linkClass('/assets')}`}
              onClick={closeMobileMenu}
            >
              <span className="mr-2">{themeAssets.iconNavAssets || '\uD83D\uDCE6'}</span> {themeAssets.navLabelAssets || 'Assets'}
            </Link>
            <Link
              to="/editors"
              className={`block ${linkClass('/editors')}`}
              onClick={closeMobileMenu}
            >
              <span className="mr-2">{themeAssets.iconNavEditor || '\uD83D\uDEE0'}</span> {themeAssets.navLabelEditor || 'Editors'}
            </Link>
            <Link
              to="/puzzle-resources"
              className={`block ${linkClass('/puzzle-resources')}`}
              onClick={closeMobileMenu}
            >
              <span className="mr-2">{'\uD83D\uDEE1\uFE0F'}</span> Admin Controls
            </Link>
            <Link
              to="/settings"
              className={`block ${linkClass('/settings')}`}
              onClick={closeMobileMenu}
            >
              <span className="mr-2">⚙️</span> Settings
            </Link>
          </>}
          <div className="pt-3 mt-2 border-t border-stone-700 flex items-center gap-2">
            <SoundSettings isMobile />
            {isCreator && <CloudSyncButton />}
            <UserMenu />
          </div>
        </div>
      )}
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

export default App;
