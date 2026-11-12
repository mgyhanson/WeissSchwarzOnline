import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { loadUserImages } from './images/providers';
import './styles.css';

// Pictures the player put in card-assets/local.nosync (development server only).
void loadUserImages();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
