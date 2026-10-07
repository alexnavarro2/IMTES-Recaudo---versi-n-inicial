import type { Goals } from '@/types/domain';
// Valores iniciales cuando la cuenta todavía no ha guardado sus metas.
export const defaultGoals: Goals = { PREPAGO: 46400, ESTUDIANTE: 44800, 'TERCERA EDAD': 7000, DISCAPACIDAD: 1800, general: 100000 };
export const driveSources = ['OXXO', 'CAUS', 'Validaciones BEA', 'Credencialización', 'Reportes'] as const;
