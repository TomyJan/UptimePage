import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
export default defineConfig({plugins:[react(),tailwind()],build:{sourcemap:false},server:{host:'127.0.0.1',port:5173,strictPort:true}});
