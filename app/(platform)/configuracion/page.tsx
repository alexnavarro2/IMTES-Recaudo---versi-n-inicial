import { PageHeading } from '@/components/ui/page-heading';
import { SettingsWorkspace } from '@/components/ui/settings-workspace';
import { getDriveState } from '@/lib/server/drive-actions';
import {requireUser} from '@/lib/server/session';
import {getGoalSettings} from '@/lib/server/goals';
export const metadata = { title: 'Configuración' };
export default async function SettingsPage() { const user=await requireUser();const [drive,settings]=await Promise.all([getDriveState(),getGoalSettings(user.id)]); return <><PageHeading eyebrow="ADMINISTRACIÓN" title="Configuración" description="Configura tus fuentes de información y las metas de credencialización."/><SettingsWorkspace drive={drive} settings={settings}/></>; }
