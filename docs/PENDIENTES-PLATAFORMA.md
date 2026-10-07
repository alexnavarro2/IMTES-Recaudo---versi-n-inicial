# Pendientes después de completar actualización y reportes

## Próxima prueba real

- El lunes: cargar una semana nueva con credencialización, OXXO, CAUS y validaciones, y verificar originales, CSV, indicadores y reportes en las carpetas reales. Pruebas actuales de escritura usan Drive simulado.
- Medir XLSX grandes con la carga fragmentada y procesamiento de hasta 300 segundos. El límite configurado es 50 MB por fuente; la prueba de integración usó un CSV de más de 3 MB. Falta verificar el extremo de 50 MB y la memoria/duración en el plan definitivo de Vercel. Un trabajo asíncrono sigue pendiente si esos tamaños lo requieren.
- Probar Guardar PPTX en la carpeta REPORTES real y repetir sin duplicarlo.

## Antes de publicar

- Configurar variables y callbacks para el dominio definitivo, desplegar en Vercel y comprobar ambas cuentas autorizadas.
- Verificar en navegador la vista previa dinámica del reporte seleccionado y la navegación de sus seis páginas. La implementación ya sustituye la referencia S40 y no requiere provisionar sus PNG privados.
- Seguir PUBLICACION-VERCEL.md y comprobar el despliegue real. La compilación final está pendiente de confirmación.

## Coherencia y administración

- Gobierno ya aparece en el dashboard sin meta asignada.
- Las metas ya se guardan por cuenta y se comparten entre dashboard y nuevos reportes. Los reportes anteriores conservan su versión. La persistencia, aislamiento entre usuarios y conflictos de edición pasaron las pruebas de integración.
- Flujo explícito para corregir y reemplazar una semana existente, con revisión y conciliación.
- Gestión de usuarios/carpetas, auditoría, retención de reportes y limpieza periódica de temporales sin depender de una nueva carga.
- Definir si ambas cuentas comparten un historial operativo único cuando usan las mismas carpetas. Actualmente históricos y reportes son por usuario.
- Reanudar una carga grande después de recargar la página.

Detalle de implementación y pruebas: VERIFICACION-ACTUALIZACION-COMPLETA.md.
