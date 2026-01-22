import { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Game } from './components/game/Game';
import { MapEditor } from './components/editor/MapEditor';
import { AssetManager } from './components/editor/AssetManager';
import { Compendium } from './components/compendium/Compendium';
import { CloudSyncButton } from './components/editor/CloudSyncButton';
import { SoundSettings } from './components/shared/SoundSettings';
import { applyThemeAssets, subscribeToThemeAssets, loadThemeAssets, type ThemeAssets, type LogoVariant } from './utils/themeAssets';

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
                    className="h-10 md:h-12 flex-shrink-0"
                  />
                );
              } else {
                return (
                  <img
                    src={logoSrc}
                    alt={themeAssets.logoAlt || 'Logo'}
                    className="h-10 md:h-12 w-auto object-contain flex-shrink-0"
                  />
                );
              }
            } else {
              return (
                <span className="text-copper-400 text-2xl md:text-3xl animate-flicker flex-shrink-0">&#128293;</span>
              );
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
