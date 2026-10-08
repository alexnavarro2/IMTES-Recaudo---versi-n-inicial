import { FOLDER_MIME, validId, type FolderType } from './drive-model';

export interface SharedFolder {
 type: FolderType;
 folderId: string;
 resourceKey: string | null;
}
export interface SharedFolderMetadata {
 id: string;
 name: string;
 mimeType: string;
 trashed?: boolean;
 capabilities?: { canAddChildren?: boolean };
}

// A saved choice wins. Only an unambiguous shared source can be selected automatically.
export function sharedFolderCandidates<T extends SharedFolder>(own:T[], peers:T[], types:readonly FolderType[]):T[]{
 return types.flatMap(type=>{
  const selected=own.find(folder=>folder.type===type);
  if(selected)return [selected];
  const candidates=peers.filter(folder=>folder.type===type);
  const ids=new Set(candidates.map(folder=>folder.folderId));
  return ids.size===1?[candidates[0]]:[];
 });
}

export async function accessibleSharedFolders<T extends SharedFolder>(authorized:boolean,candidates:T[],probe:(folder:T)=>Promise<SharedFolderMetadata>,save:(folder:T,metadata:SharedFolderMetadata)=>Promise<T>):Promise<T[]>{
 if(!authorized)return [];
 const results=await Promise.all(candidates.map(async folder=>{
  if(!validId(folder.folderId))return null;
  try{
   // Probe with the requesting user's Google credentials, never the donor's.
   const metadata=await probe(folder);
   if(metadata.id!==folder.folderId||metadata.mimeType!==FOLDER_MIME||metadata.trashed)return null;
   const saved=await save(folder,metadata);
   return saved.folderId===metadata.id?saved:null;
  }catch{return null;}
 }));
 return results.filter(folder=>folder!==null) as T[];
}

// A newer snapshot replaces an older one; matching accounts never add totals together.
export function latestSharedSnapshots<T extends {source:FolderType;folderId:string;importedAt:Date}>(folders:SharedFolder[],snapshots:T[]):T[]{
 return folders.flatMap(folder=>{
  const matches=snapshots.filter(snapshot=>snapshot.source===folder.type&&snapshot.folderId===folder.folderId);
  matches.sort((a,b)=>b.importedAt.getTime()-a.importedAt.getTime());
  return matches.length?[matches[0]]:[];
 });
}
