export const folderTypes = ['OXXO','CAUS','VALIDACIONES','CREDENCIALIZACION','REPORTES'] as const;
export type FolderType = typeof folderTypes[number];
export const FOLDER_MIME = 'application/vnd.google-apps.folder';
export const SHORTCUT_MIME = 'application/vnd.google-apps.shortcut';
export interface DriveEntry { id: string; name: string; mimeType: string; size?: string; modifiedTime?: string; resourceKey?: string; shortcutDetails?: { targetId: string; targetMimeType: string; targetResourceKey?: string }; capabilities?: { canAddChildren?: boolean } }
export interface FolderView { type: FolderType; name: string; folderId: string; shortcutId: string | null; status: string; canWrite: boolean; lastValidatedAt: string | null }
export interface DriveState { status: string; email: string | null; lastValidatedAt: string | null; folders: FolderView[] }
export type BrowseLocation = { mode: 'mine' | 'shared' | 'drives' } | { mode: 'folder'; id: string; resourceKey?: string } | { mode: 'drive'; id: string };
export function isFolder(entry: DriveEntry) { return entry.mimeType === FOLDER_MIME || (entry.mimeType === SHORTCUT_MIME && entry.shortcutDetails?.targetMimeType === FOLDER_MIME); }
export function compatibleFile(type: FolderType, name: string) { const extension = name.split('.').pop()?.toLowerCase(); return (type === 'OXXO' ? ['dat'] : type === 'CAUS' ? ['xlsx','xls','csv'] : ['csv','xlsx','xls']).includes(extension || ''); }
export function validId(id: unknown): id is string { return typeof id === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(id); }
export function driveStatus(code: number) { return code === 404 ? 'missing' : code === 403 ? 'forbidden' : code === 401 ? 'expired' : 'error'; }
