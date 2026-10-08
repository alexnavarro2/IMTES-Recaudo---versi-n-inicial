import 'server-only';
import type { DriveFolder } from '@prisma/client';
import { allowedEmail } from '@/lib/auth/security';
import { FOLDER_MIME, folderTypes, type DriveEntry, type FolderType } from '@/lib/drive-model';
import { accessibleSharedFolders, sharedFolderCandidates, type SharedFolderMetadata } from '@/lib/shared-history';
import { DriveError, requestDrive, resolveFolder } from '@/lib/drive-protocol';
import { db } from './db';
import { accessToken, safeDriveError } from './drive';

export function sharedUsersFilter(){
 const emails=(process.env.AUTH_ALLOWED_EMAILS||'').split(',').map(email=>email.trim().toLowerCase()).filter(Boolean);
 return {email:{in:emails,mode:'insensitive' as const}};
}

export async function sharedDriveFolders(userId:string,types:readonly FolderType[]=folderTypes):Promise<DriveFolder[]>{
 const user=await db().user.findUnique({where:{id:userId},select:{email:true}});
 if(!allowedEmail(user?.email))return [];
 const [own,peers]=await Promise.all([
  db().driveFolder.findMany({where:{userId,type:{in:[...types]}}}),
  db().driveFolder.findMany({where:{userId:{not:userId},type:{in:[...types]},user:sharedUsersFilter()}}),
 ]);
 const candidates=sharedFolderCandidates(own,peers,types);
 if(!candidates.length)return [];
 let token:string;
 try{token=await accessToken(userId);}catch{return [];}
 return accessibleSharedFolders(true,candidates,async folder=>{
  try{
   const load=(id:string,key?:string)=>requestDrive<DriveEntry & SharedFolderMetadata>(token,`files/${id}`,{fields:'id,name,mimeType,trashed,shortcutDetails,resourceKey,capabilities(canAddChildren)',supportsAllDrives:'true'},{id,key});
   const metadata=folder.userId===userId&&folder.shortcutId?(await resolveFolder(folder.shortcutId,undefined,load)).target:await load(folder.folderId,folder.resourceKey||undefined);
   if(metadata.id!==folder.folderId||metadata.mimeType!==FOLDER_MIME||(metadata as SharedFolderMetadata).trashed)throw new DriveError('changed');
   return metadata;
  }
  catch(error){
   const status=safeDriveError(error);
   if(folder.userId===userId)await db().driveFolder.updateMany({where:{id:folder.id,userId,folderId:folder.folderId},data:{status,canWrite:false,lastValidatedAt:new Date()}});
   if(status==='expired')await db().driveConnection.updateMany({where:{userId},data:{status}});
   throw error;
  }
 },async(folder,metadata)=>{
  const data={name:metadata.name,status:'available',canWrite:!!metadata.capabilities?.canAddChildren,lastValidatedAt:new Date()};
  if(folder.userId===userId){
   await db().driveFolder.updateMany({where:{id:folder.id,userId,folderId:folder.folderId},data});
   return {...folder,...data};
  }
  return db().driveFolder.upsert({where:{userId_type:{userId,type:folder.type}},create:{userId,type:folder.type,folderId:folder.folderId,resourceKey:folder.resourceKey,...data},update:{}});
 });
}

export async function sharedHistoryDataset(userId:string,source:FolderType,folderId:string){
 const folders=await sharedDriveFolders(userId,[source]);
 if(!folders.some(folder=>folder.type===source&&folder.folderId===folderId))throw new Error('No tienes acceso a la carpeta de esta fuente en Drive.');
 return db().historicalDataset.findFirst({where:{source,folderId,user:sharedUsersFilter()},orderBy:[{importedAt:'desc'},{id:'desc'}]});
}
