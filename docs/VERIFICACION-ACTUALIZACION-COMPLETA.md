# Actualización semanal y reportes

## Incorporado

- Cuatro fuentes en Actualizar semana: credencialización, OXXO, CAUS y validaciones.
- Credencialización admite el reporte semanal Excel o long_consolidado del script, en XLSX/CSV. Extrae la semana elegida y normaliza perfiles; Gobierno se incluye. Si trae histórico, debe conservar los totales y perfiles de las semanas ya guardadas. Rechaza semanas futuras, duplicados y diferencias anteriores. La carga es incremental; no reemplaza automáticamente una semana existente.
- Archivos de hasta 50 MB por fuente y ocho archivos; CAUS y credencialización aceptan uno. Lotes mayores de 3 MB se envían en fragmentos de 1 MB con hasta tres intentos por fragmento. SHA-256 verifica el archivo completo. El backend recibe los fragmentos en tablas privadas con RLS, verifica dueño, fuente, periodo y carpeta, y solo después procesa y conserva originales/CSV en Drive. El navegador no recibe credenciales OAuth.
- Cada cuenta puede reservar hasta 50 MB de cargas temporales. Finalización/cancelación elimina los temporales; caducan tras 24 horas y se limpian al iniciar otra carga. Las cargas interrumpidas que no pueden cancelarse ocupan cuota hasta caducar. Una reanudación después de recargar la página aún no está implementada.
- El procesamiento final continúa dentro de una función de hasta 300 segundos. La carga fragmentada evita el límite de cuerpo HTTP de Vercel, pero todavía falta medir memoria y duración con los XLSX reales más grandes y el plan elegido. Se rechazan XLSX de más de 256 MB descomprimidos o más de 10 mil componentes. Validaciones Excel admite hasta 250 mil filas.
- Reportes permite guardar el PPTX generado en la carpeta REPORTES. Comprueba permiso de editor y drive.file; serializa la copia y usa huella para evitar duplicados al reintentar. No cambia permisos ni publica el archivo.
- PDF de seis páginas generado en Node desde el mismo modelo congelado del PPTX, con logo 2026 y cuatro gráficas vectoriales. Es una versión para lectura de las mismas cifras, no una conversión visual idéntica de PowerPoint. Descarga privada por usuario. Para reportes antiguos sin modelo congelado, generar nuevamente habilita PDF.

## Verificado

- Pruebas de credencialización: alias, Gobierno, totales, conservación del histórico, periodos, duplicados y CSV generado.
- Prueba de integración con usuario temporal en Supabase y Drive simulado: cuatro fuentes, CSV de más de 3 MB en fragmentos, fragmentos incompletos, repetición idéntica, conflicto de contenido, aislamiento de propietario, cancelación y eliminación de temporales. Copia del PPTX repetida conserva el mismo archivo de Drive simulado.
- RLS en WeeklyUpload y WeeklyUploadChunk, sin permisos para anon/authenticated. El usuario de prueba y sus datos se eliminan al finalizar.
- PDF S40 generado y sus seis páginas renderizadas y revisadas; sumas y corte coinciden con el modelo del PPTX.
- Pasaron 42 tests, TypeScript, lint y compilación de producción. Se verificaron descargas HTTP privadas de PPTX/PDF, generación repetida, origen ajeno rechazado y rechazo de carga/copia Drive sin sesión. Las sesiones temporales de prueba se eliminaron al terminar. La plantilla y el logo PDF están incluidos en sus funciones de Vercel.

## Prueba pendiente para el lunes

1. Seleccionar la nueva semana cerrada (41) y los archivos de las cuatro fuentes.
2. Procesar y revisar originales, CSV y resultados en las carpetas compartidas reales. El histórico anterior se conserva.
3. Generar PPTX/PDF con las cuatro fuentes al mismo corte; guardar el PPTX en REPORTES y repetir para comprobar que no se duplica.
4. Medir el XLSX de validaciones más grande. Si excede duración/memoria, mover el procesamiento a un trabajo asíncrono antes de publicar ese flujo en Vercel.

No se han subido archivos de prueba a Drive real ni se ha desplegado en Vercel.
