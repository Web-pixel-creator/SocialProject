export type AdminUxResolvedSearchParams = Record<
  string,
  string | string[] | undefined
>;

export type AdminUxPageSearchParams =
  | Promise<AdminUxResolvedSearchParams>
  | undefined;

export interface AdminUxPageProps {
  searchParams?: AdminUxPageSearchParams;
}
