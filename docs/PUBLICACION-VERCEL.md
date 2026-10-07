# Publicación en Vercel

## Preparación

La plataforma usa Next.js en Vercel y PostgreSQL en Supabase. Los archivos operativos permanecen en Google Drive. La vista previa muestra el PDF del reporte seleccionado; no requiere provisionar el ejemplo S40 privado.

1. Revisar y subir el código a GitHub. No incluir `.env.local`, `.private`, archivos operativos ni credenciales. Mantener el repositorio anterior como respaldo.
2. Importar el repositorio en Vercel con el preset Next.js y Node.js 24.x.
3. Usar `npm ci` para instalar y `npm run build -- --webpack` para compilar. El script de compilación copia los recursos de PDF.js a `public/pdf-assets`; no deben añadirse manualmente a Git.
4. Configurar las variables de servidor del proyecto antes de desplegar:

| Variable | Uso |
| --- | --- |
| `AUTH_URL` | URL HTTPS definitiva de la aplicación, sin rutas |
| `AUTH_SECRET` | Secreto de sesión persistente |
| `AUTH_GOOGLE_ID` | ID del cliente OAuth web existente |
| `AUTH_GOOGLE_SECRET` | Secreto del cliente OAuth |
| `DATABASE_URL` | Conexión PostgreSQL por Transaction pooler |
| `DIRECT_URL` | Conexión para migraciones por Session pooler o conexión directa compatible con la red |
| `TOKEN_ENCRYPTION_KEY` | La misma clave de cifrado usada para guardar los tokens; conservarla entre despliegues |
| `AUTH_ALLOWED_EMAILS` | Correos completos autorizados, separados por coma |

`STORAGE_BUCKET` está reservado; no es necesario para el flujo actual. `REPORT_EXAMPLE_DIR` solo corresponde al ejemplo privado anterior y no es necesario para la vista previa dinámica.

## Google y base de datos

En Google Auth Platform, agregar el origen HTTPS definitivo y el callback `https://TU-DOMINIO/api/auth/callback/google`. Conservar los callbacks locales para desarrollo. No autorizar dominios de vistas previas arbitrarias ni publicar credenciales en GitHub. Las cuentas de prueba deben estar autorizadas también en la aplicación y tener acceso a las carpetas operativas.

Ejecutar `npm run db:migrate` desde un entorno privado con las conexiones correctas antes de publicar una versión que añada tablas. No ejecutar migraciones automáticamente en cada compilación de una vista previa. Mantener las restricciones y RLS de las migraciones; las conexiones PostgreSQL usadas por el servidor tienen acceso privilegiado y no deben enviarse al navegador.

## Comprobaciones después del despliegue

- Sin sesión, las rutas y API privadas deben rechazar el acceso.
- Ambas cuentas autorizadas deben iniciar sesión, ver sus carpetas y sus datos correspondientes.
- Guardar metas, recargar y comprobar el dashboard. Los reportes anteriores deben conservar las metas originales.
- Generar un reporte, abrir sus seis páginas y descargar PDF y PPTX.
- Comprobar la carga fragmentada, procesamiento y copia del PPTX en Drive con archivos de prueba antes de la siguiente semana real.

## Límites que siguen pendientes de medir

El procesamiento está configurado con hasta 300 segundos. La carga fragmentada evita enviar el archivo completo en una sola solicitud; no elimina los límites de memoria y duración durante la conversión de XLSX. Falta probar archivos cercanos al límite de 50 MB por fuente en el plan elegido. Si no caben, habrá que mover ese procesamiento a un trabajo asíncrono.

Referencia oficial: [límites de funciones de Vercel](https://vercel.com/docs/functions/limitations) y [versiones de Node.js](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions). Confirmar estos límites al elegir el plan.

Este documento prepara la publicación; no confirma que se haya desplegado la plataforma.
