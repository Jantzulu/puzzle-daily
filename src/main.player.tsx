import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import PlayerApp from './PlayerApp.tsx'
import { AuthProvider } from './contexts/AuthContext'
import { hydrateBigStore } from './utils/bigStore'
import { showBootError } from './bootError'

// The asset library lives in IndexedDB behind a synchronous in-memory copy
// (utils/bigStore). Nothing may read it before that copy is filled, so the
// first render waits for hydration. (Module evaluation doesn't wait, and
// must not read the library: bigStore throws in dev if anything does.)
// The player's library is a re-fetchable cache: old copies are dropped.
const root = document.getElementById('root')!;
hydrateBigStore({ keepLegacyCopy: false })
  .then(() => {
    createRoot(root).render(
      <StrictMode>
        <AuthProvider>
          <PlayerApp />
        </AuthProvider>
      </StrictMode>,
    );
  })
  .catch(showBootError);
