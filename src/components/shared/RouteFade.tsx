import React from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Remounts children per pathname so the .route-emerge animation replays —
 * the old page vanishes into the void backdrop and the new page lights up
 * out of the darkness (see index.css). Must render inside the Router.
 */
export const RouteFade: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  return (
    <div key={location.pathname} className="route-emerge">
      {children}
    </div>
  );
};
