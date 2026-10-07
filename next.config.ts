import type {NextConfig} from 'next';
const config:NextConfig={outputFileTracingIncludes:{'/api/reportes/*/pdf':['./public/branding/logo-imtes-2026.png'],
    '/api/reportes/generar':['./lib/reports/template.pptx']}};
export default config;
