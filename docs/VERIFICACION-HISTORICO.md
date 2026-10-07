# Incorporación del histórico

Implementación verificada el 6 de octubre de 2026. Corte automático: última semana ISO cerrada según America/Hermosillo. Al pasar a la siguiente semana, el corte avanza sin modificar código.

## Fuentes y cobertura comprobada

- OXXO: Trabajos_Python/Recargas_Oxxo, consolidado CSV; cobertura de 2026 hasta S40 completa.
- CAUS: Trabajos_Python/Recargas_CAUS, reportes XLSX; cobertura de 2026 hasta S40 completa.
- Validaciones: CSV_VALIDACIONES_BEA_2026, consolidado acumulado CSV; cobertura de 2026 hasta S40 completa.
- Credencialización: Trabajos_Python/Tarjetas_BEA, hoja long_consolidado del XLSX consolidado, preferida sobre el CSV antiguo; último registro S11. Faltan S12–S40 en los archivos disponibles.

## Persistencia y cálculo

HistoricalDataset se almacena en Supabase por usuario y fuente. La lectura comprueba también la carpeta configurada. RLS habilitado sin políticas públicas; acceso mediante servidor autenticado. Tokens cifrados y contenidos originales no se incluyen en el repositorio. La importación reemplaza cada conjunto de forma atómica, conservando procedencia y hashes en servidor. No acumula nuevamente el mismo snapshot.

Montos calculados en centavos. CAUS suma ventas y recargas excluyendo Totales y rechaza periodos que cruzan semanas. Las tarjetas utilizadas son acumuladas: se toma el último punto, sin sumar acumulados semanales. Credenciales excluye filas de totales y detecta duplicados. Semanas sin datos no equivalen a cero. El porcentaje de uso queda pendiente de conciliar la base comparable.

## Validación y límites

Pruebas automatizadas para corte ISO, frontera de zona horaria, duplicados, montos, acumulados y reportes Excel; lint y build de producción con TypeScript correctos. Verificación del dashboard con datos reales.

Esta entrega incorpora histórico; no completa aún el procesamiento de nuevos DAT/CSV semanales, la subida manual a Drive ni PPTX/PDF. Los archivos descargados se limitan a 20 MB por archivo. Los datos son privados por usuario; otra cuenta autorizada debe configurar sus carpetas e importar su histórico.

## Conciliación con el PPT de S40

La revisión posterior corrigió dos errores del lector CAUS: los valores de celdas combinadas se repetían al enumerar columnas y la fecha final podía tomar la fecha inicial de la misma fila. Ahora se descombinan las celdas antes de detectar columnas y se busca la fecha a la derecha de cada etiqueta. Se añadió una prueba de regresión con cantidades y montos combinados.

La fuente actualizada de emisión es Trabajos_Python/Movimientos_Tarjetas_BEA/tarjetas_emitidas_long_consolidado.xlsx. La hoja contiene movimientos individuales; se agregan por semana, perfil y establecimiento en servidor sin conservar identificadores de tarjetas ni empleados en HistoricalDataset. La carpeta Tarjetas_BEA correspondía a un consolidado anterior. La cobertura actual de las cuatro fuentes llega a S40.

Las gráficas incorporan emisión histórica desde 2025, meta general, barras por perfil con metas, comparación semanal OXXO/CAUS y tarjetas únicas 2025/2026. La referencia de validaciones del año anterior se obtiene por nombre exacto en la carpeta padre de credencialización. El porcentaje compara tarjetas únicas con la emisión histórica. No se suma el acumulado de validaciones.

La comparación de ingreso total contra 2025 requiere todavía importar el anexo de recaudo 2025; no se inventa ese total. El PPT constituye una referencia de conciliación, no una fuente de cifras codificadas en la aplicación. El procesamiento y exportación semanal continúan pendientes.
