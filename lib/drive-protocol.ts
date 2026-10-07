import { FOLDER_MIME, SHORTCUT_MIME, validId, driveStatus, type DriveEntry } from './drive-model';
export class DriveError extends Error { constructor(public status: string) { super(status); } }
export async function requestDrive<T>(token: string, path: string, parameters: Record<string,string>, resource?: { id: string; key?: string }, fetcher: typeof fetch = fetch): Promise<T> {
  const headers: Record<string,string> = { Authorization: `Bearer ${token}` };
  if (resource?.key) headers['X-Goog-Drive-Resource-Keys'] = `${resource.id}/${resource.key}`;
  const response = await fetcher(`https://www.googleapis.com/drive/v3/${path}?${new URLSearchParams(parameters)}`, { headers, cache: 'no-store', signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new DriveError(driveStatus(response.status));
  return response.json();
}
export async function resolveFolder(id: string, key: string | undefined, load: (id: string, key?: string) => Promise<DriveEntry>) {
  if (!validId(id) || (key && !validId(key))) throw new DriveError('error');
  const original = await load(id,key); let target = original;
  if (original.mimeType === SHORTCUT_MIME && original.shortcutDetails?.targetMimeType === FOLDER_MIME) {
    const details = original.shortcutDetails;
    if (!validId(details.targetId)) throw new DriveError('error');
    target = await load(details.targetId,details.targetResourceKey);
  }
  if (target.mimeType !== FOLDER_MIME) throw new DriveError('error');
  return { original, target, key: target.resourceKey || original.shortcutDetails?.targetResourceKey || key };
}
