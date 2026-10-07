import { DashboardView } from '@/components/dashboard/dashboard-view';
import { lastClosedWeek } from '@/lib/iso-week';
import { requireUser } from '@/lib/server/session';
import {getGoalSettings} from '@/lib/server/goals';
import { historyData } from '@/lib/server/history';
export const metadata = { title: 'Dashboard' };
export default async function DashboardPage() { const user=await requireUser();const [datasets,settings]=await Promise.all([historyData(user.id),getGoalSettings(user.id)]);return <DashboardView cutoff={lastClosedWeek()} datasets={datasets} goals={settings.goals}/>; }
