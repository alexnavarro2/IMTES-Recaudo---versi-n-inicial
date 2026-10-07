# Referencia del histórico de Colab

Notebook revisado: `/Users/AlexNavarro/Downloads/IMTES_Credencializacion_Recargas_TODOS_PRODUCTOS_CSV.ipynb` (29 celdas). Se inspeccionó el código, sin ejecutarlo ni modificar archivos en Drive. No se copian salidas del notebook al repositorio.

## Ubicaciones relativas a Mi unidad

| Fuente | Entrada | Resultado existente |
|---|---|---|
| OXXO | Trabajos_Python/Recargas_Oxxo | Salidas_Colab/Credencializacion_Recargas/OXXO/indicadores_semanales_iso_tarjeta04.csv |
| CAUS | Trabajos_Python/Recargas_CAUS | Salidas_Colab/Credencializacion_Recargas/CAUS/ingreso_caus_por_semana.csv |
| Credencialización | Trabajos_Python/Tarjetas_BEA | Salidas_Colab/Credencializacion_Recargas/BEA/credenciales_emitidas_long_consolidado.xlsx (hoja long_consolidado) |
| Validaciones | CSV_VALIDACIONES_BEA_2026 | tarjetas_acumuladas_por_semana_BEA.csv y .xlsx, en la misma carpeta |

Validaciones además mantiene `primera_validacion_por_tarjeta_BEA_2026.csv` y `archivos_procesados_validaciones.csv`. Comparativos 2025: `Trabajos_Python/recaudoElect_semana_2025.xlsx` y `Trabajos_Python/tarjetas_acumuladas_por_semana_2025.xlsx`. Gráficas: `Salidas_Colab/Indicadores_Hermosillo/Semana {semana} {anio}`.

Las rutas montadas `/content/gdrive/MyDrive/` son propias de Colab: en la web se deben resolver a IDs de Drive con la cuenta autorizada. Los nombres por sí solos no prueban que sean las mismas carpetas del app.js antiguo ni resuelven ambigüedades/accesos directos. No sustituir una selección del usuario sin validar la ubicación.

## Reglas reutilizables

OXXO (celda 8): DAT separado por comas, siete columnas; fecha YYYYMMDD; tarjeta como texto, primeros 14 caracteres y prefijo 04; operaciones cuentan folios no nulos y monto suma importe; agrupación diaria y por año/semana ISO. Actualmente lee todos los DAT, sin manifiesto incremental.

CAUS (celda 9): Excel activo, fechas después de etiquetas Fecha Inicio/Fin; detectar Punto de Venta y cuatro columnas numéricas; detenerse antes de Totales; ingreso = venta de tarjetas monto + recargas monto; semana ISO de fecha inicial. Actualmente lee todos los xlsx y no deduplica archivos.

Credencialización (celdas 12–14): periodo Del/Al; establecimientos desde fila 7/columna F; perfiles en columna A; excluir TOTAL GENERAL/GRAND TOTAL; normalizar por perfil/establecimiento y semana ISO de fecha inicial. La búsqueda incluye xls, pero openpyxl no es lector de xls binario: adaptar soporte en la web sin trasladar ese fallo.

Validaciones (celdas 16–20): columnas tarjeta/fecha detectadas por nombres normalizados; UTF-8 BOM con fallback latin-1; tarjeta textual; fecha dayfirst; primera fecha mínima por tarjeta. Base maestra + manifiesto para actualizar sin releer todos los registros históricos; excluye derivados como base, manifiesto y acumulados. Hash SHA-256; el notebook omite por hash O por nombre, por lo que un archivo corregido con el mismo nombre se ignoraría. La nueva importación debe detectar revisiones sin duplicar contribuciones. El acumulado corresponde a tarjetas únicas utilizadas alguna vez, no a operaciones ni al total de tarjetas activas en cada semana.

## Corte e importación inicial

El comparativo de tarjetas (celda 23) establece semanas 1–40 de 2026. Sin embargo, los productos OXXO/CAUS y tarjetas emitidas tienen SEMANA_FIN=9 en sus parámetros. OXXO/CAUS exportan el agregado completo antes del filtro gráfico; el consolidado emitido también requiere inspeccionar cobertura. La presencia de un corte 40 en una gráfica no prueba que todos los archivos fuente/resultados cubran ese corte.

Antes de mostrar valores en la nueva plataforma: localizar y validar resultados existentes, comprobar cobertura por fuente hasta 2026-S40, conciliar contra Colab y registrar procedencia. Importar acumulados como snapshots; no sumar acumulados semanales entre sí. Para actualizaciones de validaciones, migrar la base maestra y el manifiesto cuando estén disponibles, no solamente la tabla semanal. La auditoría del notebook no ejecuta parsers ni constituye carga del histórico en el dashboard.
