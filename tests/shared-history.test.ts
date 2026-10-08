import test from 'node:test';
import assert from 'node:assert/strict';
import { FOLDER_MIME } from '../lib/drive-model';
import { accessibleSharedFolders, latestSharedSnapshots, sharedFolderCandidates, type SharedFolder } from '../lib/shared-history';
const folder:SharedFolder={type:'OXXO',folderId:'shared-oxxo',resourceKey:null};
const metadata={id:folder.folderId,name:'OXXO',mimeType:FOLDER_MIME,capabilities:{canAddChildren:false}};

test('new accounts reuse one shared folder, preserving an existing selection and refusing ambiguity',()=>{
 assert.deepEqual(sharedFolderCandidates([], [folder,folder], ['OXXO']),[folder]);
 const other={...folder,folderId:'another-oxxo'};
 assert.deepEqual(sharedFolderCandidates([], [folder,other], ['OXXO']),[]);
 assert.deepEqual(sharedFolderCandidates([other], [folder], ['OXXO']),[other]);
 assert.deepEqual(sharedFolderCandidates([], [folder], ['CAUS']),[]);
});
test('authorized readers can reuse shared history without needing editor permission',async()=>{
 let probes=0,saves=0;
 const result=await accessibleSharedFolders(true,[folder],async selected=>{probes++;assert.equal(selected.folderId,folder.folderId);return metadata;},async selected=>{saves++;return selected;});
 assert.deepEqual(result,[folder]);assert.equal(probes,1);assert.equal(saves,1);
});
test('unapproved accounts never probe or save folders',async()=>{
 const unexpected=async()=>{throw new Error('Must not run');};
 assert.deepEqual(await accessibleSharedFolders(false,[folder],unexpected,unexpected),[]);
});
test('revoked Drive access hides shared history and never saves the folder',async()=>{
 let saves=0;
 assert.deepEqual(await accessibleSharedFolders(true,[folder],async()=>{throw new Error('403');},async selected=>{saves++;return selected;}),[]);
 assert.equal(saves,0);
});
test('trashed folders, files and changed IDs cannot authorize snapshots',async()=>{
 for(const invalid of [{...metadata,trashed:true},{...metadata,mimeType:'text/csv'},{...metadata,id:'different-folder'}]){
  assert.deepEqual(await accessibleSharedFolders(true,[folder],async()=>invalid,async()=>{throw new Error('Must not save');}),[]);
 }
 assert.deepEqual(await accessibleSharedFolders(true,[folder],async()=>metadata,async()=>({...folder,folderId:'changed-concurrently'})),[]);
});
test('the latest matching snapshot is used once, with other folders and sources excluded',()=>{
 const old={source:'OXXO' as const,folderId:folder.folderId,importedAt:new Date('2026-10-01'),rows:[40]};
 const latest={...old,importedAt:new Date('2026-10-08'),rows:[41]};
 const unrelated={...latest,folderId:'unshared-folder',rows:[999]};
 assert.deepEqual(latestSharedSnapshots([folder],[old,latest,unrelated,{...latest,source:'CAUS'}]),[latest]);
 assert.deepEqual(latestSharedSnapshots([], [latest]),[]);
});
