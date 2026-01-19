import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Game } from './components/game/Game';
import { MapEditor } from './components/editor/MapEditor';
import { AssetManager } from './components/editor/AssetManager';
import { Compendium } from './components/compendium/Compendium';
import { CloudSyncButton } from './components/editor/CloudSyncButton';
import { SoundSettings } from './components/shared/SoundSettings';
import { applyThemeAssets, subscribeToThemeAssets, loadThemeAssets, type ThemeAssets } from './utils/themeAssets';

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
        <div className="flex items-center gap-2 md:mr-4 flex-1 overflow-hidden">
          {/* Custom logo or default torch icon */}
          {themeAssets.logo ? (
            <img
              src={themeAssets.logo}
              alt={themeAssets.logoAlt || 'Logo'}
              className="h-8 md:h-10 w-auto object-contain flex-shrink-0"
            />
          ) : (
            <span className="text-copper-400 text-xl md:text-2xl animate-flicker flex-shrink-0">&#128293;</span>
          )}
          {/* Title and subtitle - always horizontal, wrap if needed */}
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0 md:gap-x-3">
            <h1 className="text-sm xs:text-base md:text-xl font-medieval font-bold text-copper-400 text-shadow-dungeon tracking-wide whitespace-nowrap leading-tight">
              {themeAssets.siteTitle || 'Puzzle Daily'}
            </h1>
            {themeAssets.siteSubtitle && (
              <span
                className="font-medieval text-shadow-dungeon leading-tight whitespace-nowrap"
                style={{
                  color: themeAssets.siteSubtitleColor || 'rgba(212, 165, 116, 0.8)',
                  fontSize: (() => {
                    const sizeMap: Record<string, string> = {
                      'x-small': 'clamp(0.5rem, 2.5vw, 0.75rem)',
                      'small': 'clamp(0.6rem, 3vw, 0.875rem)',
                      'medium': 'clamp(0.7rem, 3.5vw, 1rem)',
                      'large': 'clamp(0.75rem, 4vw, 1.125rem)',
                      'x-large': 'clamp(0.8rem, 4.5vw, 1.25rem)',
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

        {/* Desktop navigation */}
        <div className="hidden md:flex items-center gap-2">
          <Link to="/" className={linkClass('/')}>
            <span className="mr-1">&#9876;</span> {themeAssets.navLabelPlay || 'Play'}
          </Link>
          <Link to="/compendium" className={linkClass('/compendium')}>
            <span className="mr-1">&#128214;</span> {themeAssets.navLabelCompendium || 'Compendium'}
          </Link>
          <Link to="/editor" className={linkClass('/editor')}>
            <span className="mr-1">&#128736;</span> {themeAssets.navLabelEditor || 'Map Editor'}
          </Link>
          <Link to="/assets" className={linkClass('/assets')}>
            <span className="mr-1">&#128230;</span> {themeAssets.navLabelAssets || 'Assets'}
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
            <span className="mr-2">&#9876;</span> {themeAssets.navLabelPlay || 'Play'}
          </Link>
          <Link
            to="/compendium"
            className={`block ${linkClass('/compendium')}`}
            onClick={() => setMobileMenuOpen(false)}
          >
            <span className="mr-2">&#128214;</span> {themeAssets.navLabelCompendium || 'Compendium'}
          </Link>
          <Link
            to="/editor"
            className={`block ${linkClass('/editor')}`}
            onClick={() => setMobileMenuOpen(false)}
          >
            <span className="mr-2">&#128736;</span> {themeAssets.navLabelEditor || 'Map Editor'}
          </Link>
          <Link
            to="/assets"
            className={`block ${linkClass('/assets')}`}
            onClick={() => setMobileMenuOpen(false)}
          >
            <span className="mr-2">&#128230;</span> {themeAssets.navLabelAssets || 'Assets'}
          </Link>
          <div className="pt-3 mt-2 border-t border-stone-700 flex items-center gap-2">
            <SoundSettings />
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
