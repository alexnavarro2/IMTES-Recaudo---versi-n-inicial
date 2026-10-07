# IMTES Recaudo 360

Plataforma Next.js y TypeScript para credencialización y recaudo electrónico de Hermosillo. Google autentica las cuentas autorizadas y conecta Drive en una sola autorización. Supabase guarda sesiones, históricos y reportes privados.

## Desarrollo

Node.js 24. Configurar `.env.local` siguiendo `.env.example`, sin subir secretos a Git.

```sh
npm ci
npm run db:migrate
npm run dev
```

Abrir http://localhost:3000. Rutas: `/dashboard`, `/actualizar`, `/reportes` y `/configuracion`.

```sh
npm run lint
npm run typecheck
npm run test
npm run build -- --webpack
npm start
```

## Funciones

- Dashboard con filtros, indicadores y gráficas interactivas desde históricos privados de las carpetas configuradas. Corte por última semana ISO cerrada en America/Hermosillo.
- Actualización de credencialización, OXXO, CAUS y validaciones. Conserva originales y CSV en Drive; actualiza los datos de Supabase. Valida periodos y duplicados y no reemplaza automáticamente semanas existentes.
- Credencialización acepta reporte semanal Excel o consolidado long_consolidado XLSX/CSV del script. Un consolidado debe conservar las cifras históricas anteriores al nuevo corte.
- Carga de hasta 50 MB y ocho archivos por fuente, con fragmentos de 1 MB para lotes mayores de 3 MB. CAUS y credencialización admiten un archivo. Temporales privados, comprobación SHA-256 y limpieza tras finalizar o cancelar; caducidad de 24 horas.
- Reportes genera seis láminas PPTX con cuatro gráficas editables y libros Excel incrustados; descarga privada e historial por usuario. Una semana incompleta detiene la generación. Repetir sin cambios conserva el reporte.
- PDF de seis páginas con las mismas cifras y gráficas vectoriales, y copia del PPTX en la carpeta REPORTES sin duplicados al reintentar.
- Metas persistentes por cuenta, compartidas por el dashboard y los nuevos reportes; los reportes anteriores conservan sus metas originales. Protección ante cambios simultáneos.
- Vista previa dinámica del PDF del reporte seleccionado, con navegación de sus seis páginas, y GOBIERNO en el dashboard sin meta asignada.

## Verificación y pendientes

Ver [verificación previa a publicación](docs/VERIFICACION-PUBLICACION.md), [implementación y prueba del lunes](docs/VERIFICACION-ACTUALIZACION-COMPLETA.md), [reportes](docs/VERIFICACION-REPORTES.md) y [pendientes](docs/PENDIENTES-PLATAFORMA.md). Hay pruebas unitarias y de integración con Drive simulado; aún falta una carga real de una semana nueva y medir los XLSX más grandes en Vercel. El procesamiento final tiene hasta 300 segundos; no es un trabajo asíncrono.

## Google, Supabase y Vercel

La [guía de configuración](docs/FASE2-CONFIGURACION-PREVIA.md) describe Google Cloud y Supabase. Reutilizar el cliente OAuth: `/api/auth/callback/google` resuelve acceso y Drive juntos. Nunca usar variables NEXT_PUBLIC para secretos o tokens.

Para Vercel: framework Next.js, Node.js 24.x, raíz `.`, instalación `npm ci`, build `npm run build -- --webpack`, salida predeterminada. Seguir la [guía de publicación](docs/PUBLICACION-VERCEL.md) para variables del servidor, callbacks y comprobación del dominio definitivo.

La plantilla PPTX sanitizada y el logo PDF se incluyen en las funciones de generación. El visor PDF usa los recursos de la versión fijada de PDF.js, copiados durante instalación y compilación. La vista previa actual no depende del ejemplo S40 privado. El PDF conserva contenido y cifras; no convierte visualmente el PPTX de manera idéntica.

## Versión anterior

`app.js` e `index.html` originales permanecen intactos. Abrir `index.html` de forma independiente conserva la versión anterior; no se sirve dentro de Next.js. La auditoría y las verificaciones de fases anteriores permanecen en `docs/` como referencia.
