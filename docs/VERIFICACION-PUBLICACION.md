# Verificación previa a publicación — 6 de octubre de 2026

- ESLint: aprobado.
- Pruebas: 45 aprobadas, sin fallos.
- Compilación de producción: aprobada con Node.js 24 y webpack, incluyendo comprobación TypeScript y trazado de funciones.
- Logo PDF y plantilla PPTX: verificados en los manifiestos de archivos de sus funciones de generación.
- Supabase: seis migraciones aplicadas, sin migraciones pendientes.
- API de reportes: PDF/PPTX descargados con sesión; generación repetida idempotente; rechazos de origen ajeno, descarga anónima y acceso de otro usuario; página de historial renderizada.
- Archivos destinados a GitHub: 128 revisados contra los secretos reales de la configuración local, sin coincidencias. `.env.local`, `.private`, dependencias y recursos reconstruibles del visor permanecen excluidos.
- Código subido a `codex/recaudo-360-publicacion`, conservando `main` y los despliegues anteriores. La copia para publicación se preparó fuera de iCloud por archivos internos de Git marcados como dataless.

## Verificaciones que requieren continuar

La prueba visual del visor y el despliegue real todavía no están confirmados. La revisión automática del navegador bloqueó el inicio de sesión tras la advertencia de aplicación de Google no verificada, a la espera de autorización específica. También bloqueó preparar un proyecto vacío de Vercel; debe usarse la importación del repositorio y la rama nueva.

Antes de publicar deben configurarse las variables privadas del servidor y el callback del dominio definitivo. La autorización para transferir esas credenciales a Vercel se solicitó junto con la del inicio de sesión. No se han subido al repositorio.

La prueba de una semana nueva en Drive y de XLSX cercanos a 50 MB sigue pendiente para el lunes. Las comprobaciones actuales no prueban esos extremos en producción.
