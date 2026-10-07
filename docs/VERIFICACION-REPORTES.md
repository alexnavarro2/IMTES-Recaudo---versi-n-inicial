# Reporte PPTX semanal

Reportes permite elegir año/semana ISO cerrada, generar y descargar un PPTX de seis láminas con cuatro gráficas nativas editables y hojas Excel incrustadas. La plantilla conserva la estructura, branding y portada del PPTX de referencia S40; las gráficas se reconstruyeron como objetos editables. Los perfiles comparan emisión con metas mediante barras. El perfil GOBIERNO se incluye sin inventar una meta. Se conservan los colores guinda/naranja.

## Datos y controles

Supabase aporta las cuatro fuentes del usuario y de sus carpetas vigentes. Se requiere cada semana del año hasta el corte elegido, sin advertencias, duplicados, conteos negativos o perfiles incongruentes. La emisión acumula también la base anterior al año seleccionado. Las tarjetas utilizadas toman el último conteo acumulado único. OXXO/CAUS se suman en centavos, y el ingreso semanal no se confunde con el acumulado. Las referencias del año anterior ausentes son huecos en la gráfica, nunca ceros inventados.

Las gráficas, textos y libros incrustados usan un único modelo de datos. Las metas son las iniciales definidas en defaultGoals, con copia en el registro del reporte. Los cambios temporales de Configuración todavía no constituyen metas persistentes.

La huella incluye periodo, cifras, series, metas, plantilla y versión del generador. Repetir sin cambios conserva el reporte. Cambios producen otra versión, con fecha/hora de generación visible en historial. WeeklyReport guarda bytes y resumen de forma privada en Supabase, con RLS y sin permisos para anon/authenticated. Solo el backend autenticado puede acceder; descargar un ID ajeno devuelve 404. Los reportes no se guardan en public, Git ni el disco efímero de Vercel.

La plantilla reusable versionada contiene campos vacíos y datos de muestra cero, sin históricos privados. next.config.ts incluye explícitamente esa plantilla en la función de generación de Vercel. Generación no necesita Python, herramientas de oficina o un servidor institucional.

## Pruebas

Se validan sumas, base de emisión anterior, última tarjeta acumulada, semanas abiertas, cobertura incompleta, referencias ausentes y Gobierno sin meta. El test PPTX comprueba seis láminas, cuatro gráficas y correspondencia de los valores incrustados en Excel. La generación S40 con datos reales y repetición se verifican contra Supabase. Se renderizan y revisan las seis láminas, y el finalizador comprueba estructura y libros de gráficas. La revisión visual no constituye una prueba en PowerPoint nativo. Pasaron 42 tests, TypeScript, lint y la compilación de producción. Se verificaron las rutas HTTP: generación repetida, descarga idéntica al archivo almacenado, 401 sin sesión, 403 con origen ajeno y renderizado del historial. Se confirmó que la plantilla entra en el paquete de la función de Vercel. La sesión de navegador expiró antes de completar una prueba final por clic; estas comprobaciones de rutas usaron una sesión temporal eliminada al finalizar.

## Alcance restante

El botón Descargar PPTX opera sobre reportes generados. PDF y Guardar en Google Drive están habilitados después de generar un reporte. La copia en Drive usa la carpeta REPORTES y evita duplicados; PDF usa el modelo congelado de ese reporte. La vista central sigue identificada como diseño de referencia S40, no como preview dinámico del último reporte. Sus PNG privados deben provisionarse aparte al desplegar, o reemplazarse por una vista dinámica.
