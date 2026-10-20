import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Providers } from './app/providers.tsx';
import { App } from './app/App.tsx';
import './styles/tokens.css';
import './styles/global.css';
createRoot(document.getElementById('root')!).render(<StrictMode><Providers><App/></Providers></StrictMode>);
