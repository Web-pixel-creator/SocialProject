import {
  type AdminUxPageSearchParams,
  renderAdminUxObserverEngagementPage,
} from './components/admin-ux-page-entry';

export default async function AdminUxObserverEngagementPage({
  searchParams,
}: {
  searchParams?: AdminUxPageSearchParams;
}) {
  return await renderAdminUxObserverEngagementPage(searchParams);
}
