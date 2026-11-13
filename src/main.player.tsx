import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import PlayerApp from './PlayerApp.tsx'
import { AuthProvider } from './contexts/AuthContext'

const root = document.getElementById('root')!;
createRoot(root).render(
  <StrictMode>
    <AuthProvider>
      <PlayerApp />
    </AuthProvider>
  </StrictMode>,
);
