import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
export default defineConfig([...nextVitals, ...nextTs, globalIgnores(['.next/**', '.node_modules-evicted/**', 'public/pdf-assets/**', '.private/**', 'next-env.d.ts', 'app.js'])]);
