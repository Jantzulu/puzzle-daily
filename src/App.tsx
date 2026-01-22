import { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Game } from './components/game/Game';
import { MapEditor } from './components/editor/MapEditor';
import { AssetManager } from './components/editor/AssetManager';
import { Compendium } from './components/compendium/Compendium';
import { CloudSyncButton } from './components/editor/CloudSyncButton';
import { SoundSettings } from './components/shared/SoundSettings';
import { applyThemeAssets, subscribeToThemeAssets, loadThemeAssets, type ThemeAssets } from './utils/themeAssets';

// Animated Logo component that supports sprite sheets
function AnimatedLogo({ src, alt, frameCount, frameRate, className }: {
  src: string;
  alt: string;
  frameCount: number;
  frameRate: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';

    let animationFrameId: number | null = null;
    let frameIndex = 0;
    let lastFrameTime = Date.now();
    const frameDuration = 1000 / frameRate;

    img.onload = () => {
      // Calculate frame dimensions (horizontal sprite sheet)
      const frameWidth = img.width / frameCount;
      const frameHeight = img.height;

      // Set canvas size to single frame size
      canvas.width = frameWidth;
      canvas.height = frameHeight;
      setDimensions({ width: frameWidth, height: frameHeight });

      const animate = () => {
        const now = Date.now();

        // Update frame if enough time has passed
        if (now - lastFrameTime >= frameDuration) {
          frameIndex = (frameIndex + 1) % frameCount;
          lastFrameTime = now;
        }

        // Clear and draw current frame
        ctx.clearRect(0, 0, frameWidth, frameHeight);
        ctx.drawImage(
          img,
          frameIndex * frameWidth, 0, frameWidth, frameHeight,
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
      style={dimensions ? {
        width: 'auto',
        height: '100%',
        maxHeight: '48px',
        imageRendering: 'pixelated'
      } : undefined}
      aria-label={alt}
    />
  );
}

function Navigation() {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [themeAssets, setThemeAssets] = useState<ThemeAssets>({});

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

  return (
    <nav
      className="bg-stone-600 border-b-2 border-copper-700 px-4 md:px-6 py-3 shadow-dungeon"
      style={navbarStyle}
    >
      <div className="flex items-center gap-3 md:gap-4">
        {/* Logo/Title */}
        <div className="flex items-center gap-2 md:gap-3">
          {/* Custom logo or default torch icon */}
          {themeAssets.logo ? (
            // Check if this is an animated sprite sheet
            (themeAssets.logoFrameCount && themeAssets.logoFrameCount > 1) ? (
              <AnimatedLogo
                src={themeAssets.logo}
                alt={themeAssets.logoAlt || 'Logo'}
                frameCount={themeAssets.logoFrameCount}
                frameRate={themeAssets.logoFrameRate || 10}
                className="h-10 md:h-12 flex-shrink-0"
              />
            ) : (
              <img
                src={themeAssets.logo}
                alt={themeAssets.logoAlt || 'Logo'}
                className="h-10 md:h-12 w-auto object-contain flex-shrink-0"
              />
            )
          ) : (
            <span className="text-copper-400 text-2xl md:text-3xl animate-flicker flex-shrink-0">&#128293;</span>
          )}
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
        </div>

        {/* Desktop navigation - closer to title */}
        <div className="hidden md:flex items-center gap-2 ml-4">
          <Link to="/" className={linkClass('/')}>
            <span className="mr-1">{themeAssets.iconNavPlay || '\u2694'}</span> {themeAssets.navLabelPlay || 'Play'}
          </Link>
          <Link to="/compendium" className={linkClass('/compendium')}>
            <span className="mr-1">{themeAssets.iconNavCompendium || '\uD83D\uDCD6'}</span> {themeAssets.navLabelCompendium || 'Compendium'}
          </Link>
          <Link to="/editor" className={linkClass('/editor')}>
            <span className="mr-1">{themeAssets.iconNavEditor || '\uD83D\uDEE0'}</span> {themeAssets.navLabelEditor || 'Map Editor'}
          </Link>
          <Link to="/assets" className={linkClass('/assets')}>
            <span className="mr-1">{themeAssets.iconNavAssets || '\uD83D\uDCE6'}</span> {themeAssets.navLabelAssets || 'Assets'}
          </Link>
        </div>

        <div className="flex-1" />

        <div className="hidden md:flex items-center gap-2">
          <SoundSettings />
          <CloudSyncButton />
        </div>

        {/* Mobile hamburger button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
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
        <div className="md:hidden mt-3 pt-3 border-t-2 border-stone-700 space-y-2">
          <Link
            to="/"
            className={`block ${linkClass('/')}`}
            onClick={() => setMobileMenuOpen(false)}
          >
            <span className="mr-2">{themeAssets.iconNavPlay || '\u2694'}</span> {themeAssets.navLabelPlay || 'Play'}
          </Link>
          <Link
            to="/compendium"
            className={`block ${linkClass('/compendium')}`}
            onClick={() => setMobileMenuOpen(false)}
          >
            <span className="mr-2">{themeAssets.iconNavCompendium || '\uD83D\uDCD6'}</span> {themeAssets.navLabelCompendium || 'Compendium'}
          </Link>
          <Link
            to="/editor"
            className={`block ${linkClass('/editor')}`}
            onClick={() => setMobileMenuOpen(false)}
          >
            <span className="mr-2">{themeAssets.iconNavEditor || '\uD83D\uDEE0'}</span> {themeAssets.navLabelEditor || 'Map Editor'}
          </Link>
          <Link
            to="/assets"
            className={`block ${linkClass('/assets')}`}
            onClick={() => setMobileMenuOpen(false)}
          >
            <span className="mr-2">{themeAssets.iconNavAssets || '\uD83D\uDCE6'}</span> {themeAssets.navLabelAssets || 'Assets'}
          </Link>
          <div className="pt-3 mt-2 border-t border-stone-700 flex items-center gap-2">
            <SoundSettings isMobile />
            <CloudSyncButton />
          </div>
        </div>
      )}
    </nav>
  );
}

function App() {
  // Apply theme assets on mount and subscribe to changes
  useEffect(() => {
    applyThemeAssets();
    const unsubscribe = subscribeToThemeAssets(() => {
      applyThemeAssets();
    });
    return unsubscribe;
  }, []);

  return (
    <BrowserRouter>
      <div className="min-h-screen theme-root">
        <Navigation />
        <Routes>
          <Route path="/" element={<Game />} />
          <Route path="/compendium" element={<Compendium />} />
          <Route path="/editor" element={<MapEditor />} />
          <Route path="/assets" element={<AssetManager />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
