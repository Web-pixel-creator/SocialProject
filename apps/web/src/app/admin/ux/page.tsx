import type { AdminUxPageProps } from './components/admin-ux-page-contract';
import { renderAdminUxObserverEngagementPage } from './components/admin-ux-page-entry';

export default async function AdminUxObserverEngagementPage({
  searchParams,
}: AdminUxPageProps) {
  return await renderAdminUxObserverEngagementPage(searchParams);
}
