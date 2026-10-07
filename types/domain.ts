export type Source = 'OXXO' | 'CAUS' | 'VALIDACIONES' | 'CREDENCIALIZACION';
export type CardProfile = 'PREPAGO' | 'ESTUDIANTE' | 'TERCERA EDAD' | 'DISCAPACIDAD';
export type Goals = Record<CardProfile, number> & { general: number };
