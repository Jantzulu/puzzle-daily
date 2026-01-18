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
    border-2 nav-link-btn
    ${isActive(path)
      ? 'bg-copper-700 text-parchment-100 border-copper-500 shadow-inner-dark'
      : 'bg-stone-700 text-parchment-300 border-stone-500 hover:bg-stone-600 hover:text-parchment-100 hover:border-copper-600'}
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
        <div className="flex items-center gap-2 md:mr-4">
          {/* Custom logo or default torch icon */}
          {themeAssets.logo ? (
            <img
              src={themeAssets.logo}
              alt={themeAssets.logoAlt || 'Logo'}
              className="h-8 md:h-10 w-auto object-contain"
            />
          ) : (
            <span className="text-copper-400 text-xl md:text-2xl animate-flicker">&#128293;</span>
          )}
          <h1 className="text-lg md:text-xl font-medieval font-bold text-copper-400 text-shadow-dungeon tracking-wide">
            {themeAssets.siteTitle || 'Puzzle Daily'}
          </h1>
        </div>

        {/* Desktop navigation */}
        <div className="hidden md:flex items-center gap-2">
          <Link to="/" className={linkClass('/')}>
            <span className="mr-1">&#9876;</span> Play
          </Link>
          <Link to="/compendium" className={linkClass('/compendium')}>
            <span className="mr-1">&#128214;</span> Compendium
          </Link>
          <Link to="/editor" className={linkClass('/editor')}>
            <span className="mr-1">&#128736;</span> Map Editor
          </Link>
          <Link to="/assets" className={linkClass('/assets')}>
            <span className="mr-1">&#128230;</span> Assets
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
            <span className="mr-2">&#9876;</span> Play
          </Link>
          <Link
            to="/compendium"
            className={`block ${linkClass('/compendium')}`}
            onClick={() => setMobileMenuOpen(false)}
          >
            <span className="mr-2">&#128214;</span> Compendium
          </Link>
          <Link
            to="/editor"
            className={`block ${linkClass('/editor')}`}
            onClick={() => setMobileMenuOpen(false)}
          >
            <span className="mr-2">&#128736;</span> Map Editor
          </Link>
          <Link
            to="/assets"
            className={`block ${linkClass('/assets')}`}
            onClick={() => setMobileMenuOpen(false)}
          >
            <span className="mr-2">&#128230;</span> Assets
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
