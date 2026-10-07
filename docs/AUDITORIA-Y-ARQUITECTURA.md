# IMTES Recaudo · auditoría y propuesta

## Alcance revisado
Repositorio local: dos archivos, index.html (401 líneas, CSS y logo PNG incrustados) y app.js (2,589 líneas). Sin package.json, README, pruebas, servidor, base de datos ni instrucciones AGENTS.md. Solo se implementa Fase 1. Los originales permanecen intactos y pueden abrirse por separado; no se publican bajo public/ porque contienen configuración histórica de Google.

## Arquitectura actual
SPA estática con DOM directo y STATE global en memoria. Librerías por CDN: SheetJS 0.18.5, Chart.js 4.5.0, FileSaver 2.0.5 y PptxGenJS 4.0.1. Excel histórico y sábanas de descuentos se normalizan y fusionan por año/semana/ruta, con prioridad para sábanas nuevas. Se agrupan líneas, campañas de cierre y resto del sistema; hay comparativos anuales, evolución semanal, ingreso OXXO/CAUS y CAUS por punto de venta. Incluye panel de calidad, excepciones de rutas, hallazgos narrativos, exportación Excel y PPTX con tablas editables y gráficos rasterizados desde canvas.

OXXO: CSV separado con coma en DAT, tarjeta truncada a 14 caracteres y prefijo 04, importe numérico y agregación semanal ISO. CAUS admite tabla con semana ISO o reporte con etiquetas y columnas detectadas por posición; suma ventas y recargas, pero también acepta ingreso directo en formato tabular. Sábanas: deduplicación por contenido de fila y tarifas fijas 5/9. No existe parser de credencialización ni base de primera validación por tarjeta.

Google: Google Identity Services con access token en memoria del navegador, Drive API y Picker; API key/client ID y cuatro carpetas incorporados, overrides y carpetas en localStorage. Listado paginado, descarga, exportación de Google Sheets y subida multipart de sábanas. Intenta autorización/sincronización silenciosa al iniciar. No hay sesión de aplicación, refresh persistente, control de acceso ni aislamiento por usuario.

## Qué conservar y qué reemplazar
| Elemento | Decisión |
|---|---|
| Identidad, logo, colores institucionales | Reutilizados en Fase 1 |
| Normalización de encabezados, importes, fechas y semanas ISO | Migrar a utilidades TypeScript, con pruebas de límites de año y fechas inválidas |
| Reglas DAT y dos formatos CAUS | Reutilizar lógica como referencia; validar con archivos reales antes de portar |
| Calidad de datos y narrativas | Reutilizar criterios, separarlos del DOM |
| Excel, análisis por línea, campañas, cierre/resto | Conservar en originales; migración separada, no sustituirlos silenciosamente |
| Tablas editables PptxGenJS | Reutilizar enfoque; crear gráficos nativos editables para nuevo reporte |
| STATE, DOM, CDN y procesamiento de todo el histórico | Reemplazar por componentes, dependencias fijadas y persistencia incremental |
| Configuración Drive hardcodeada y localStorage OAuth | Reemplazar por OAuth servidor y carpetas por usuario |

Riesgos encontrados: reimportar OXXO/CAUS agrega filas sin hash persistente y duplica ingresos; fechas aceptan normalización de días inválidos; CAUS por posición depende del formato; innerHTML requiere saneamiento de valores de archivos; tarjetas se deben conservar como texto con ceros iniciales. Las tarifas antiguas necesitan configuración y confirmación para su eventual migración. Las claves públicas de Google requieren restricciones de origen/API; no se ha encontrado client secret ni refresh token incorporado. No reutilizar configuración incrustada en el nuevo bundle.

## Arquitectura final propuesta
Next.js + TypeScript, App Router y TailwindCSS en Vercel. Componentes por dominio. Auth.js con Google; sesión segura y allowlist de usuarios autorizados. API/services exclusivamente servidor para Drive, base y exportaciones. PostgreSQL de Supabase con Prisma y pool compatible con serverless. Cola durable y worker para archivos grandes; Vercel sirve la interfaz, inicia trabajos y consulta progreso.

Flujo: selección de carpetas desde explorador propio → listado Drive paginado → registro metadata y SHA-256 → trabajo durable → parser en streaming → transacción de agregados → snapshot del reporte → exportación y guardado opcional en Drive. Un explorador server-side evita entregar tokens al navegador; Picker oficial exigiría un token temporal cliente, por lo que no será la opción predeterminada.

Tablas propuestas: users, drive_connections, drive_folders, source_files, processing_runs, oxxo_transactions_weekly, caus_weekly, cards_issued_weekly, cards_issued_profile, card_first_validation, cards_used_weekly, report_exports y app_settings. Toda tabla operativa usa organization_id; permisos por organización y usuario, sin mezclar históricos de distintas instituciones. source_files: fuente, nombre, tamaño, hash, Drive id/modifiedTime, estado y processed_at. Índice único organización/fuente/hash; reclamar trabajo atómicamente y confirmar archivo y agregados en una transacción para tolerar reintentos. Cambios de archivo generan revisión con reemplazo explícito de sus contribuciones.

Validaciones: staging por archivo con MIN(fecha_hora) por tarjeta; upsert con LEAST(primera_validacion, nueva_fecha). Actualizar solo buckets semanales afectados por altas o fechas anteriores y recalcular el acumulado desde la primera semana afectada. Registrar nuevos y actualizados por separado. Importación inicial requiere la base tarjeta/primera_validacion, no solo el total histórico. Separar acumulado histórico y cohortes por año; acordar comparación 2025/2026 y denominador emitido. Semanas ISO y zona America/Hermosillo explícitas; dinero DECIMAL/centavos. Acordar asignación de CAUS cuando Fecha Inicio/Fin abarca varias semanas.

Reportes: snapshot validado compartido entre narrativa, gráficos y exportaciones. PPTX de seis láminas con texto, formas y gráficos nativos editables. PDF desde el mismo modelo visual, mediante renderer determinista (p. ej. React PDF) o Chromium en worker. Guardar artefactos en storage y devolver URLs, opcionalmente crear Reportes/año/Semana XX en Drive. No generar datos faltantes como cero.

## Roadmap y criterios verificables
1. Base visual: Next, layout, navegación, dashboard vacío, selección local de metadata, reportes y configuración. Typecheck, lint, build y verificación de cuatro rutas. Sin conexión Google ni procesamiento.
2. Acceso y persistencia: Auth.js, allowlist, migraciones, OAuth cifrado, selector server-side de carpetas, permisos/revocación. Validar aislamiento y recuperación de sesión.
3. Ingesta: parsers OXXO/CAUS/credencialización, jobs y hashes. Contrastar contra Colab con fixtures reales; reimportación y reintentos no modifican totales.
4. Validaciones incrementales: importar base histórica y CSV nuevos, fechas anteriores y acumulados. Validar contra resultado de referencia y medir volumen real.
5. Dashboard: Recharts, filtros aplicados a consultas, perfiles/metas configurables y comparativos. Validar identidad ISO, cobertura, nulos y narrativas.
6. Reportes: referencia PPTX real, seis láminas, PPTX editable/PDF, almacenamiento Drive. Revisar visualmente ambos y abrir PPTX para comprobar edición.
7. Operación: auditoría, alertas, automatización, documentación, prueba con personal IMTES y medición de intervención humana menor a cinco minutos. No prometer duración de cálculo antes de medir archivos reales.

## Variables y credenciales futuras
Fase 1 no necesita secretos. .env.example enumera configuración futura: AUTH_SECRET, AUTH_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, DATABASE_URL (pool), DIRECT_URL (migración), TOKEN_ENCRYPTION_KEY, AUTH_ALLOWED_EMAILS, STORAGE_BUCKET y credenciales/endpoint del proveedor de jobs/storage elegido. Supabase service role únicamente si se usa su API de storage, siempre servidor. Crear proyecto Google Cloud, habilitar Drive API y consentimiento OAuth, registrar localhost y dominio estable Vercel con callback /api/auth/callback/google, solicitar acceso offline y manejar ausencia de refresh token. No usar NEXT_PUBLIC para secretos. No se necesitan IDs de carpetas por entorno: serán preferencias persistidas.

## Riesgos técnicos y decisiones
- OAuth: consentimiento, scopes sensibles/restringidos y posible verificación, expiración y revocación; limitar scopes y usuarios, cifrar tokens y refrescarlos en servidor. Revisar requisitos reales antes de publicar.
- Drive: drive.file no da acceso general a todas las carpetas preexistentes; selector propio y lectura de carpetas requieren evaluar drive.readonly y permisos de escritura. Shared Drives, paginación, cuotas, backoff y archivos modificados necesitan tratamiento explícito.
- Archivos grandes: no cargar históricos BEA completos ni atravesar API con archivos grandes. Vercel limita payload de función a 4.5 MB. Usar upload firmado o descargar Drive desde worker, streaming y lotes transaccionales; disco local no es persistencia.
- PPTX: las gráficas canvas actuales no son editables. Usar charts nativos y medir memoria; la plantilla Credencializacion_Semana40_2026.pptx no está en el repositorio y aún no se ha inspeccionado.
- PDF: Chromium pesa y depende de fuentes/runtime; preferir renderer compatible o worker dedicado. No asumir que instalar Playwright basta para producción Vercel. Limitar tamaño y entregar por storage.
- Privacidad: identificadores de tarjetas sensibles; mínimo acceso, retención y logs sin tarjetas/tokens. Acceso operativo debe ser restringido antes de importar datos reales.

Fuentes técnicas: https://nextjs.org/docs/app/getting-started/installation ; https://vercel.com/docs/functions/limitations ; https://developers.google.com/identity/protocols/oauth2/web-server ; https://developers.google.com/drive/api/guides/api-specific-auth .
