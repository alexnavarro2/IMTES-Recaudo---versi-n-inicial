# Fase 2 · implementación y verificación

Fecha: 6 de octubre de 2026. Rama: `codex-recaudo-360`. Código implementado; integración real pendiente de las credenciales de Google/Supabase. No se declara la Fase 2 validada de extremo a extremo.

## Implementación

- Acceso institucional `/acceso`, login Google con Auth.js 5.0.0-beta.32, logout y sesiones PostgreSQL persistentes de ocho horas.
- Login limitado a correos completos de `AUTH_ALLOWED_EMAILS` y a correo verificado por Google. La lista vacía bloquea el acceso. Cada acción Drive comprueba sesión y autorización.
- Conexión de Drive independiente, con la misma cuenta Google del login. Conserva `drive.readonly` + `drive.file` del desarrollo anterior.
- Prisma 7.10.0 con adaptador PostgreSQL. Migración inicial preparada, no aplicada a una base real.
- Tokens access/refresh/ID cifrados con AES-256-GCM en Account. Renovación server-side, sin tokens en la sesión o DTO del navegador. Logs Auth.js genéricos para evitar imprimir objetos con secretos.
- Desconexión: intenta revocar el token, retira la cuenta Drive local y conserva preferencias. Informa si Google no confirma revocación.
- Selector con Mi Drive, Compartido conmigo y unidades compartidas, navegación, breadcrumb, regreso, paginación y distinción archivo/carpeta. Modal con cierre Escape, foco inicial, restauración de foco y ciclo de Tab.
- Accesos directos a carpetas resueltos al guardar; conserva nombre visible, shortcutId, folderId real y resource key cuando corresponde.
- Cinco ubicaciones por usuario; carga de Configuración valida cada carpeta independientemente. Estados disponibles, acceso denegado, no encontrada/sin acceso, acceso directo modificado y errores de conexión.
- REPORTES verifica capacidad de agregar contenido de la cuenta, advierte falta de permiso y solo guarda la carpeta base.
- Actualizar semana lista metadatos compatibles desde las fuentes guardadas para el usuario; el cliente solo envía tipo y token de página, no un ID arbitrario. Máximo 50 elementos por página, con carga posterior manual. No descarga contenido.
- Interfaz aprobada conservada; header muestra usuario y Salir. Las cuatro rutas se agrupan bajo un layout privado dinámico para impedir que un build sin variables deje redirecciones estáticas cuando posteriormente se configuren las cuentas.

## Archivos principales

| Área | Archivos |
|---|---|
| Autenticación | `auth.ts`, `lib/auth/security.ts`, `lib/server/session.ts`, `lib/server/auth-actions.ts`, `types/next-auth.d.ts` |
| Rutas | `app/acceso/page.tsx`, `app/api/auth/[...nextauth]/route.ts`, `app/(platform)/layout.tsx`, páginas movidas a `(platform)` manteniendo sus URLs |
| Datos | `prisma/schema.prisma`, `prisma.config.ts`, `prisma/migrations/202610060001_phase2/migration.sql`, `lib/server/db.ts` |
| Drive | `lib/drive-model.ts`, `lib/drive-protocol.ts`, `lib/server/drive.ts`, `lib/server/drive-actions.ts` |
| Interfaz | `components/drive/drive-settings.tsx`, `components/drive/source-explorer.tsx`, header/shell, configuración y tarjetas de carga, `app/globals.css` |
| Verificación/configuración | `tests/security.test.ts`, `tests/drive.test.ts`, `.env.example`, `package.json`, `package-lock.json`, README, guía y este documento |

`app.js` e `index.html` originales no tienen cambios. `main` sigue en `3fea1e1da1466550386b3dee0035dbc3503f1ebc`. Sin commit, push ni despliegue en esta fase.

## Esquema preparado

| Tabla | Función |
|---|---|
| User | Identidad del usuario |
| Account | Cuentas Google/Google Drive y tokens cifrados |
| Session | Sesión persistente y vencimiento |
| VerificationToken | Compatibilidad con el adaptador Auth.js; sin proveedor email configurado |
| DriveConnection | Una conexión por usuario: correo, estado, creación, modificación y validación |
| DriveFolder | Una ubicación por usuario/tipo: ID destino, acceso directo, nombre, resource key, fecha de configuración, validación, estado y capacidad de escritura |

Enum FolderType: OXXO, CAUS, VALIDACIONES, CREDENCIALIZACION, REPORTES. Relaciones con borrado en cascada al eliminar un usuario. RLS sin políticas públicas en las seis tablas; la aplicación se conecta mediante un rol de servidor con acceso apropiado. La base todavía no contiene estas tablas hasta ejecutar `npm run db:migrate` con la conexión real.

## Resultados locales

| Comprobación | Resultado |
|---|---|
| `npm run build -- --webpack` | Correcto: rutas privadas y acceso dinámicos |
| `npm run typecheck` | Correcto |
| `npm run lint` | Correcto |
| `npm run test` | 10 pruebas, 10 correctas |
| `npx prisma validate` | Esquema válido |
| `npx prisma generate` | Cliente generado |
| Migración SQL | Generada desde esquema; pendiente de aplicar |
| Protección de rutas en navegador | `/dashboard`, `/actualizar`, `/reportes`, `/configuracion` redirigen a `/acceso` sin configuración |
| Acceso responsive | Inspección a 1440×1000 y 390×844; móvil clientWidth = scrollWidth = 390 |
| Secretos | `.env.local` ausente; ejemplo sin valores reales; sin cuentas reales conectadas |

Turbopack (`npm run build` sin flags) falló al intentar abrir un puerto en el proceso de compilación CSS por `Operation not permitted`, incluso al solicitar ejecución ampliada. La compilación equivalente de Next con Webpack terminó correctamente. No se cambió el bundler predeterminado del proyecto. El runner tsx CLI también encontró una restricción de socket local; `node --import tsx --test` evita ese socket y ejecuta las mismas pruebas correctamente.

Las pruebas automatizadas cubren allowlist, bloqueo por configuración ausente, cifrado con nonce aleatorio, rechazo de alteración/clave incorrecta, tipos de carpeta/acceso directo, extensiones, validación de IDs, resolución de target/resource key, archivo rechazado como carpeta, target sin acceso, paginación, parámetros compartidos y errores 401/403/404/429/500. Usan fixtures aislados, no credenciales reales ni login simulado en la plataforma.

Capturas: [escritorio](screenshots/fase2-acceso-desktop.png), [móvil](screenshots/fase2-acceso-mobile.png). La interfaz interna autenticada no se pudo verificar visualmente en esta fase sin una cuenta/base reales; no se agregó ningún acceso de prueba que eluda autenticación.

## Pendientes reales

Seguir [FASE2-CONFIGURACION-PREVIA.md](FASE2-CONFIGURACION-PREVIA.md): añadir el callback `/api/auth/callback/google-drive`, completar variables, aplicar la migración y reiniciar. Después realizar login/logout, persistencia tras reinicio, conexión/desconexión, navegación del picker, selección de las cinco fuentes, archivos paginados, shortcuts, carpeta compartida, carpeta eliminada y acceso retirado con cuentas reales. Las pruebas unitarias no sustituyen esta comprobación.

`npm audit` informó 9 avisos altos en cadenas de herramientas: ESLint (braces/micromatch/fast-glob) y CLI Prisma (deepmerge-ts/mysql2). `npm audit --omit=dev` muestra 4 de Prisma porque su CLI también es peer opcional de Prisma Client; `npm explain` confirma esas cadenas. No se utiliza MySQL en esta aplicación. La propuesta automática es degradar Prisma/Next lint a versiones mayores diferentes; no se aplicó `audit fix --force`. Revisar versiones compatibles corregidas antes de producción. Auth.js utilizado es beta: validar también contra el proveedor real antes de desplegar.

No se implementaron parsers, procesamiento de datos, cargas/modificaciones de archivos en Drive, PPTX ni PDF. Se detiene el desarrollo en Fase 2.

## Conexión real a Supabase · 6 de octubre

Con la configuración local completada por el usuario, se aplicó `202610060001_phase2` mediante `prisma migrate deploy`. Se comprobó además la conexión runtime mediante DATABASE_URL y se verificó RLS habilitado en las seis tablas. No se imprimieron secretos. Falta completar AUTH_ALLOWED_EMAILS para habilitar el acceso y probar Google/Drive; las verificaciones anteriores que describen una base sin configurar corresponden al estado inicial.

## Ajuste solicitado: autorización única

Se unificaron los permisos de identidad y Drive en el proveedor Google. El mismo callback `/api/auth/callback/google` autentica y conecta Drive. El evento de login actualiza los tokens cifrados y la conexión automáticamente. Se conservan las carpetas y las cuentas Drive del flujo anterior como compatibilidad; las conexiones nuevas usan Account.google. Desconectar limpia sus tokens, sin eliminar la identidad necesaria para volver a entrar. Renovar permite recuperar permisos vencidos, no es un segundo paso obligatorio del login. Las sesiones anteriores al cambio necesitan otorgar los nuevos permisos una vez. El consentimiento se deja a Google en los accesos normales; únicamente la renovación explícita fuerza consentimiento.

Se detectó en la cuenta real que Google devolvía Drive readonly sin refresh token al reutilizar permisos existentes. El login unificado ahora usa `prompt=consent` para solicitar consentimiento y token offline dentro del mismo flujo. Esto muestra consentimiento en cada login explícito, sin añadir una conexión posterior separada. Pendiente confirmar que Google entregue refresh token después del siguiente acceso.
