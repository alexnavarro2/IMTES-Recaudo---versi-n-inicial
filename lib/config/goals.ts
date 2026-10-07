import type {Goals} from '@/types/domain';
export type GoalSettings={goals:Goals;version:number;updatedAt:string|null};
export const goalKeys=['PREPAGO','ESTUDIANTE','TERCERA EDAD','DISCAPACIDAD','general'] as const;
export function validateGoals(input:unknown):Goals{if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==goalKeys.length)throw new Error('Incluye únicamente las cinco metas de credencialización.');const record=input as Record<string,unknown>;const goals={} as Goals;for(const key of goalKeys){const value=record[key];if(typeof value!=='number'||!Number.isSafeInteger(value)||value<1||value>1000000000)throw new Error('Cada meta debe ser un entero entre 1 y 1,000,000,000.');goals[key]=value;}return goals;}
