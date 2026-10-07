'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from './session';
import { db } from './db';
import { accessToken, driveRequest, safeDriveError, DriveError } from './drive';
import { resolveFolder } from '@/lib/drive-protocol';
import { FOLDER_MIME, SHORTCUT_MIME, folderTypes, validId, compatibleFile, type DriveEntry, type DriveState, type BrowseLocation, type FolderType } from '@/lib/drive-model';
const fields = 'id,name,mimeType,size,modifiedTime,resourceKey,shortcutDetails,capabilities(canAddChildren)';
function pageToken(value?: string): Record<string,string> { if (value && value.length > 3000) throw new DriveError('error'); return value ? { pageToken: value } : {}; }
function resourceKey(value?: string) { if (value && !validId(value)) throw new DriveError('error'); return value; }
async function getFolder(userId: string, id: string, key?: string) {
  return resolveFolder(id, key, (folderId, folderKey) => driveRequest<DriveEntry>(userId, `files/${folderId}`, { fields, supportsAllDrives: 'true' }, { id: folderId, key: resourceKey(folderKey) }));
}
export async function getDriveState(): Promise<DriveState> {
  const user = await requireUser(); let connection = await db().driveConnection.findUnique({ where: { userId: user.id } });
  if (connection && connection.status !== 'disconnected') {
    try {
      await driveRequest(user.id, 'about', { fields: 'user(emailAddress)' });
      await db().driveConnection.update({ where: { userId: user.id }, data: { status: 'connected', lastValidatedAt: new Date() } });
      const folders = await db().driveFolder.findMany({ where: { userId: user.id } });
      await Promise.all(folders.map(async folder => {
        try { const { target } = await getFolder(user.id, folder.shortcutId || folder.folderId, folder.shortcutId ? undefined : folder.resourceKey || undefined); await db().driveFolder.update({ where: { id: folder.id }, data: { status: target.id === folder.folderId ? 'available' : 'changed', canWrite: !!target.capabilities?.canAddChildren, lastValidatedAt: new Date() } }); }
        catch (error) { await db().driveFolder.update({ where: { id: folder.id }, data: { status: safeDriveError(error), canWrite: false, lastValidatedAt: new Date() } }); }
      }));
    } catch (error) { await db().driveConnection.updateMany({ where: { userId: user.id }, data: { status: safeDriveError(error) } }); }
    connection = await db().driveConnection.findUnique({ where: { userId: user.id } });
  }
  const folders = await db().driveFolder.findMany({ where: { userId: user.id }, orderBy: { type: 'asc' } });
  return { status: connection?.status || 'disconnected', email: connection?.email || null, lastValidatedAt: connection?.lastValidatedAt?.toISOString() || null,
    folders: folders.map(folder => ({ type: folder.type, name: folder.name, folderId: folder.folderId, shortcutId: folder.shortcutId, status: folder.status, canWrite: folder.canWrite, lastValidatedAt: folder.lastValidatedAt?.toISOString() || null })) };
}
export async function browseDrive(location: BrowseLocation, nextPage?: string): Promise<{ entries: DriveEntry[]; nextPage?: string; error?: string }> {
  const user = await requireUser();
  try {
    if (location.mode === 'drives') { const result = await driveRequest<{ drives: { id: string; name: string }[]; nextPageToken?: string }>(user.id, 'drives', { pageSize: '50', fields: 'drives(id,name),nextPageToken', ...pageToken(nextPage) }); return { entries: (result.drives || []).map(drive => ({ ...drive, mimeType: 'shared-drive' })), nextPage: result.nextPageToken }; }
    let q = 'trashed = false'; const params: Record<string,string> = { pageSize: '50', fields: `files(${fields}),nextPageToken`, supportsAllDrives: 'true', includeItemsFromAllDrives: 'true', orderBy: 'folder,name', ...pageToken(nextPage) };
    let resource: { id: string; key?: string } | undefined;
    if (location.mode === 'mine') q += " and 'root' in parents";
    else if (location.mode === 'shared') q += ' and sharedWithMe = true';
    else if (location.mode === 'folder' || location.mode === 'drive') {
      if (!validId(location.id)) throw new DriveError('error');
      q += ` and '${location.id}' in parents`;
      if (location.mode === 'drive') { params.corpora = 'drive'; params.driveId = location.id; }
      else resource = { id: location.id, key: resourceKey(location.resourceKey) };
    } else throw new DriveError('error');
    const result = await driveRequest<{ files: DriveEntry[]; nextPageToken?: string }>(user.id, 'files', { ...params, q }, resource);
    return { entries: result.files || [], nextPage: result.nextPageToken };
  } catch (error) { return { entries: [], error: safeDriveError(error) }; }
}
export async function selectFolder(type: FolderType, id: string, key?: string): Promise<{ error?: string }> {
  const user = await requireUser();
  try {
    if (!folderTypes.includes(type)) throw new DriveError('error');
    const { original, target, key: targetKey } = await getFolder(user.id, id, key);
    const data = { folderId: target.id, shortcutId: original.id === target.id ? null : original.id, resourceKey: targetKey || null, name: original.name, configuredAt: new Date(), status: 'available', canWrite: !!target.capabilities?.canAddChildren, lastValidatedAt: new Date() };
    await db().driveFolder.upsert({ where: { userId_type: { userId: user.id, type } }, create: { userId: user.id, type, ...data }, update: data });
    revalidatePath('/configuracion'); revalidatePath('/actualizar'); return {};
  } catch (error) { return { error: safeDriveError(error) }; }
}
export async function disconnectDrive(): Promise<{ warning?: string }> {
  const user = await requireUser(); let warning: string | undefined;
  try { const token = await accessToken(user.id); const response = await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }), signal: AbortSignal.timeout(15_000) }); if (!response.ok) warning = 'Conexión retirada de la plataforma. No se pudo confirmar la revocación en Google; revisa las conexiones de tu cuenta.'; } catch { warning = 'Conexión retirada de la plataforma. No se pudo confirmar la revocación en Google; revisa las conexiones de tu cuenta.'; }
  await db().$transaction([db().account.deleteMany({ where: { userId: user.id, provider: 'google-drive' } }), db().account.updateMany({ where: { userId: user.id, provider: 'google' }, data: { access_token: null, refresh_token: null, id_token: null, scope: null, expires_at: null } }), db().driveConnection.updateMany({ where: { userId: user.id }, data: { status: 'disconnected' } })]);
  revalidatePath('/configuracion'); return { warning };
}
export async function listSourceFiles(type: FolderType, nextPage?: string): Promise<{ entries: DriveEntry[]; nextPage?: string; error?: string }> {
  const user = await requireUser();
  try {
    if (!folderTypes.includes(type) || type === 'REPORTES') throw new DriveError('error');
    const folder = await db().driveFolder.findUnique({ where: { userId_type: { userId: user.id, type } } });
    if (!folder) throw new DriveError('unconfigured');
    const { target } = await getFolder(user.id, folder.folderId, folder.resourceKey || undefined);
    if (target.id !== folder.folderId) throw new DriveError('changed');
    const result = await driveRequest<{ files: DriveEntry[]; nextPageToken?: string }>(user.id, 'files', { q: `trashed = false and '${folder.folderId}' in parents and mimeType != '${FOLDER_MIME}'`, fields: 'files(id,name,mimeType,size,modifiedTime),nextPageToken', pageSize: '50', orderBy: 'modifiedTime desc', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true', ...pageToken(nextPage) }, { id: folder.folderId, key: folder.resourceKey || undefined });
    return { entries: (result.files || []).filter(file => file.mimeType !== SHORTCUT_MIME && compatibleFile(type,file.name)), nextPage: result.nextPageToken };
  } catch (error) { return { entries: [], error: safeDriveError(error) }; }
}
