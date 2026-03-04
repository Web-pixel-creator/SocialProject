import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  createAdminUxPageContext,
  renderAdminUxObserverEngagementPage,
} from './admin-ux-page-entry';
import {
  loadAdminUxPageData,
  resolveAdminUxPageQueryState,
} from './admin-ux-page-orchestration';

jest.mock('./admin-ux-page-orchestration', () => ({
  loadAdminUxPageData: jest.fn(),
  resolveAdminUxPageQueryState: jest.fn(),
}));

const mockResolveAdminUxPageQueryState =
  resolveAdminUxPageQueryState as jest.MockedFunction<
    typeof resolveAdminUxPageQueryState
  >;
const mockLoadAdminUxPageData = loadAdminUxPageData as jest.MockedFunction<
  typeof loadAdminUxPageData
>;

describe('admin ux page entry', () => {
  beforeEach(() => {
    mockResolveAdminUxPageQueryState.mockReset();
    mockLoadAdminUxPageData.mockReset();
  });

  it('creates page context from resolved search params', async () => {
    const queryState = {
      activePanel: 'runtime',
      hours: 48,
    } as ReturnType<typeof resolveAdminUxPageQueryState>;
    const dataLoadResult = {
      error: null,
      kpis: {},
      mainPanelsProps: { gatewaySectionBodyProps: {} } as never,
      observerData: null,
    } as Awaited<ReturnType<typeof loadAdminUxPageData>>;

    mockResolveAdminUxPageQueryState.mockReturnValue(queryState);
    mockLoadAdminUxPageData.mockResolvedValue(dataLoadResult);

    const context = await createAdminUxPageContext(
      Promise.resolve({
        hours: '48',
        panel: 'runtime',
      }),
    );

    expect(mockResolveAdminUxPageQueryState).toHaveBeenCalledWith({
      hours: '48',
      panel: 'runtime',
    });
    expect(mockLoadAdminUxPageData).toHaveBeenCalledWith(queryState);
    expect(context).toEqual({
      activePanel: 'runtime',
      dataLoadResult,
      hours: 48,
    });
  });

  it('passes undefined search params to query-state resolver', async () => {
    const queryState = {
      activePanel: 'all',
      hours: 24,
    } as ReturnType<typeof resolveAdminUxPageQueryState>;
    const dataLoadResult = {
      error: 'load failed',
      kpis: null,
      mainPanelsProps: null,
      observerData: null,
    } as Awaited<ReturnType<typeof loadAdminUxPageData>>;

    mockResolveAdminUxPageQueryState.mockReturnValue(queryState);
    mockLoadAdminUxPageData.mockResolvedValue(dataLoadResult);

    await createAdminUxPageContext(undefined);

    expect(mockResolveAdminUxPageQueryState).toHaveBeenCalledWith(undefined);
  });

  it('returns load-state element with context-derived props', async () => {
    const queryState = {
      activePanel: 'gateway',
      hours: 12,
    } as ReturnType<typeof resolveAdminUxPageQueryState>;
    const dataLoadResult = {
      error: null,
      kpis: {},
      mainPanelsProps: { gatewaySectionBodyProps: {} } as never,
      observerData: null,
    } as Awaited<ReturnType<typeof loadAdminUxPageData>>;

    mockResolveAdminUxPageQueryState.mockReturnValue(queryState);
    mockLoadAdminUxPageData.mockResolvedValue(dataLoadResult);

    const element = await renderAdminUxObserverEngagementPage(undefined);

    expect((element as { props: unknown }).props).toEqual({
      activePanel: 'gateway',
      dataLoadResult,
      hours: 12,
    });
  });
});
