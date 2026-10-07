# Fase 1.1 · refinamiento visual

## Resultado por pantalla
- Dashboard: título y subtítulo institucionales, seis KPI vacíos (emitidas, utilizadas, uso, ingreso electrónico, OXXO y CAUS), filtros existentes y cuatro EmptyChart reutilizables. En 1440 px los KPI forman una fila; en tamaños menores se reorganizan. No se muestran números de producción.
- Actualizar semana: tres fuentes con estado Pendiente, formatos admitidos, zona de arrastre y selector accesible. La selección muestra nombre, tamaño, extensión y estado seleccionado/sin procesar. CAUS admite xlsx/csv y conserva xls; validaciones admite csv/xlsx. Procesar e importar desde Drive siguen deshabilitados.
- Reportes semanales: estructura conceptual de seis láminas conservada, generación/exportación deshabilitada y tabla con Semana, Fecha de corte, Estado, PPTX y PDF. ReportRow preparado para información futura, sin filas ficticias.
- Configuración: GENERAL con metas iniciales centralizadas, edición solo local; GOOGLE DRIVE con No conectado, botón sin OAuth y cinco carpetas pendientes. Cantidades iniciales formateadas con separador de miles.

## Componentes creados
- components/layout/AppHeader.tsx: header blanco de 90 px (82 en móvil), PNG completo, usuario explícitamente sin sesión, acceso a configuración y botón móvil.
- components/layout/AppSidebar.tsx: navegación con iconos Lucide, estado activo claro y guinda. En <=800 px se despliega/oculta desde el header; cierra al navegar o presionar Escape.
- components/dashboard/KpiCard.tsx: valor opcional para integración futura y estado vacío por defecto.
- components/dashboard/EmptyChart.tsx: panel de indicador vacío, descripción y acción opcional de actualización.
- components/upload/SourceUploadCard.tsx: selector por fuente, arrastre, metadata, estado y quitar archivos.
- components/reports/ReportRow.tsx: fila tipada para semana, corte, estado y futuros enlaces de descarga.
- components/ui/StatusBadge.tsx: estados neutro, pendiente y seleccionado.

## Archivos de Fase 1 ajustados
- app/globals.css: tokens institucionales reutilizables, tipografía, contraste, header/sidebar, paneles, estados focus y breakpoints. Se eliminó el banner promocional del dashboard en favor de KPI y paneles ejecutivos. Sin degradados fuertes.
- app/actualizar/page.tsx y app/reportes/page.tsx: títulos/subtítulos solicitados.
- components/layout/app-shell.tsx: composición de header/sidebar y estado de menú.
- components/dashboard/dashboard-view.tsx: seis KPI y EmptyChart, conservando filtros locales.
- components/upload/upload-workspace.tsx: composición de SourceUploadCard y formatos solicitados; sin leer/procesar/subir contenido.
- components/reports/report-workspace.tsx: columnas solicitadas y uso de ReportRow con lista vacía por defecto.
- components/ui/settings-workspace.tsx: secciones GENERAL/GOOGLE DRIVE y presentación de metas iniciales.
- README.md: descripción actualizada.
- public/branding/logo-imtes-2026.png: copia exacta del archivo adjunto, SHA-256 179470683e635b59d40f676224f4e28e1ea047a3eb712779b3336dd97442c404. No recortado, redibujado ni deformado.
- docs/VERIFICACION-FASE1.1.md y docs/screenshots/: documentación y evidencia visual.

## Validación
- npm run lint: correcto, sin errores ni warnings.
- npm run typecheck: correcto.
- npm run build: correcto; las cuatro rutas se generan como páginas estáticas.
- Aplicación comprobada en localhost:3000 desde la instancia de desarrollo existente. El intento adicional en 3001 informó que ya había un servidor y se descartó; no se sustituyó el proceso existente.
- Navegación y contenido de las cuatro rutas verificados en navegador. Se observaron capturas de escritorio/móvil y se midió scrollWidth frente a innerWidth en 1440, 1280, 1024, 768 y 390 px: ninguna ruta presenta overflow horizontal a nivel de documento.
- Logo cargado correctamente, 310 px en escritorio, 300 px a 768 y 220 px a 390. Proporción mediante dimensiones intrínsecas y height:auto, sin recorte.
- Menú móvil abierto con aria-expanded=true y cerrado automáticamente al navegar a Actualizar semana; enlaces tienen aria-current en ruta activa.
- Estado disabled confirmado en procesamiento, Drive y exportaciones. Inputs de archivos/metas tienen labels; foco visible, skip link y contraste en texto principal/secundario. No es una auditoría integral WCAG.
- Consola del dashboard: sin errores ni warnings capturados al final.
- Capturas: dashboard-1440.png, dashboard-mobile.png, actualizar-1440.png, reportes-1440.png, configuracion-1440.png.

## Rama y alcance
Rama actual verificada antes y después: codex-recaudo-360. La referencia main permanece en 3fea1e1da1466550386b3dee0035dbc3503f1ebc. No se cambió de rama, no se crearon commits ni se hizo push. Los archivos originales app.js e index.html siguen sin diferencias respecto a HEAD. Los archivos de la nueva aplicación ya estaban sin seguimiento al iniciar esta fase; se mantienen cambios locales para revisión.

No se implementaron OAuth, Drive API, Supabase, base de datos, parsers, procesamiento ni exportación PPTX/PDF. Las metas son configuración inicial, no resultados de producción. La alerta transitiva de desarrollo documentada en Fase 1 no cambió: no se instalaron dependencias en esta fase.

La siguiente fase queda detenida hasta aprobación visual del frontend por el usuario.
