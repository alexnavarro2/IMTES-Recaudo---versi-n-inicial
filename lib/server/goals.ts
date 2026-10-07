import 'server-only';
import {db} from './db';
import {defaultGoals} from '@/lib/config/defaults';
import {validateGoals,type GoalSettings} from '@/lib/config/goals';
export class GoalConflict extends Error{constructor(){super('Las metas cambiaron en otra pestaña. Recarga las metas guardadas antes de continuar.');}}
export async function getGoalSettings(userId:string):Promise<GoalSettings>{const saved=await db().userGoals.findUnique({where:{userId}});return saved?{goals:validateGoals(saved.goals),version:saved.version,updatedAt:saved.updatedAt.toISOString()}:{goals:{...defaultGoals},version:0,updatedAt:null};}
export async function saveGoalSettings(userId:string,input:unknown,version:number):Promise<GoalSettings>{const goals=validateGoals(input);if(!Number.isSafeInteger(version)||version<0)throw new Error('Versión de metas inválida.');return db().$transaction(async tx=>{await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`goals:${userId}`},0))::text AS lock`;const previous=await tx.userGoals.findUnique({where:{userId}});if((previous?.version||0)!==version)throw new GoalConflict();const saved=await tx.userGoals.upsert({where:{userId},create:{userId,goals,version:1},update:{goals,version:version+1}});return {goals:validateGoals(saved.goals),version:saved.version,updatedAt:saved.updatedAt.toISOString()};});}
