# Actualización semanal

Implementación: `POST /api/semanas/procesar`, pantalla Actualizar semana y tablas WeeklyImport/ValidationCard con RLS, sin acceso anon/authenticated. Autenticación y lista exacta de cuentas en servidor. POST exige mismo origen y limita el cuerpo completo a 3 MB más overhead multipart.

## Operación

1. Seleccionar año y semana ISO cerrada. Seleccionar archivos por fuente.
2. Procesar semana. Cada fuente es independiente: si una falla, los resultados anteriores permanecen guardados y se muestran.
3. Revisar los registros, total y vínculos a originales y CSV en Drive. Dashboard se actualiza después de confirmar Drive y la transacción en Supabase.

OXXO acepta DAT con siete columnas del notebook, fechas YYYYMMDD y filtro tarjeta 04. Detecta operaciones duplicadas dentro del lote. CAUS acepta un XLSX o CSV semanal, sumando venta y recarga sin repetir Totales. Validaciones acepta XLSX/CSV con Tarjeta y Fecha/Hora; genera CSV de tarjeta/fecha y cuenta tarjetas únicas acumuladas, manteniendo en Supabase solo HMAC de identificadores y su primera fecha. El XLSX original queda en Drive. Los .xls deben guardarse como .xlsx.

Se conservan originales con nombre de fuente/periodo/huella y CSV optimizado/consolidado versionados. No se sobrescriben archivos del script anterior. La copia original conserva exactamente sus bytes. El CSV optimizado de validaciones contiene tarjeta y fecha de validación (día), y queda únicamente en Drive. La base original de primera validación se lee al iniciar; la base incremental de la plataforma se conserva en Supabase.

## Duplicados y consistencia

Una huella SHA256 identifica lote/fuente/carpeta/periodo independientemente del orden y nombre de archivos. Reintentar el mismo lote devuelve el resultado existente. Una carga distinta para una semana procesada o una semana ya incluida en el histórico se rechaza; no hay reemplazo automático. Cargar todos los DAT de una semana en un solo lote. No se admite añadir otro lote después para completar esa misma semana.

Un bloqueo de transacción PostgreSQL serializa fuente/carpeta incluso con pooler de transacciones. Las cargas Drive llevan appProperties para recuperar archivos ya confirmados después de un fallo; los artefactos completados no se duplican en el reintento. Drive y PostgreSQL no forman una única transacción: si una carga falla puede quedar un original/CSV en Drive, mientras el dashboard permanece intacto. Se reintenta con el mismo lote. No se eliminan originales automáticamente.

Validaciones necesita la semana anterior y, al iniciar con histórico importado, `primera_validacion_por_tarjeta_BEA_AÑO.csv` en la carpeta configurada. La base debe coincidir con cada conteo histórico del año. Si falta o difiere, se detiene antes de guardar. Nunca se suma el acumulado histórico a las tarjetas del archivo nuevo.

## Límites

Hasta ocho archivos y 3 MB por fuente, para operar dentro del límite de solicitudes de Vercel. Archivos mayores necesitan conversión/reducción previa; la carga directa resumible desde el navegador para archivos grandes queda pendiente. Semanas abiertas, periodos mixtos, datos inválidos y versiones conflictivas se rechazan. Las credenciales OAuth permanecen exclusivamente en servidor. Drive debe permitir escritura en la carpeta configurada con los permisos actuales de la aplicación; no se amplían scopes automáticamente.

La generación automática de PPTX/PDF permanece pendiente. El ejemplo S40 sigue disponible.

## Verificación

31 pruebas unitarias pasan, incluyendo ocho nuevas para corte ISO, filtros OXXO, centavos, operación repetida, XLSX/CSV, tarjetas únicas/base histórica y lotes inválidos. TypeScript sin errores. Prueba de integración en Supabase con usuario temporal eliminado al finalizar y Drive simulado: originales/CSV, idempotencia, conflicto de versiones, base histórica, fallo/reintento y RLS. No se cargaron archivos reales durante esa prueba.

Build de producción (webpack), ESLint y TypeScript pasan. En navegador autenticado: selección DAT habilita Procesar semana, carga S40 se rechaza como ya incluida en el histórico sin escritura; POST sin sesión devuelve 401. Servidor local reparado y operativo.
