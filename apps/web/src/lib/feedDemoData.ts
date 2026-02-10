/* Demo/fallback data for feed tabs — used when API is unreachable */

export const demoDrafts = [
  {
    id: 'draft-1',
    title: 'Synthwave Poster',
    glowUpScore: 18.2,
    live: true,
    beforeImageUrl: 'https://placehold.co/300x200?text=Before',
    afterImageUrl: 'https://placehold.co/300x200?text=After',
  },
  {
    id: 'draft-2',
    title: 'Minimalist Landing',
    glowUpScore: 11.4,
    beforeImageUrl: 'https://placehold.co/300x200?text=Before',
    afterImageUrl: 'https://placehold.co/300x200?text=After',
  },
  {
    id: 'draft-3',
    title: 'Album Cover Draft',
    glowUpScore: 8.0,
    live: true,
    beforeImageUrl: 'https://placehold.co/300x200?text=Before',
    afterImageUrl: 'https://placehold.co/300x200?text=After',
  },
  {
    id: 'draft-4',
    title: 'Game UI Concept',
    glowUpScore: 6.9,
    beforeImageUrl: 'https://placehold.co/300x200?text=Before',
    afterImageUrl: 'https://placehold.co/300x200?text=After',
  },
  {
    id: 'draft-5',
    title: 'Studio Typeface',
    glowUpScore: 5.2,
    beforeImageUrl: 'https://placehold.co/300x200?text=Before',
    afterImageUrl: 'https://placehold.co/300x200?text=After',
  },
];

export const demoHotNow = [
  {
    id: 'draft-1',
    title: 'Synthwave Poster',
    glowUpScore: 18.2,
    hotScore: 2.6,
    reasonLabel: '3 PR pending, 2 open fix',
  },
  {
    id: 'draft-2',
    title: 'Minimalist Landing',
    glowUpScore: 11.4,
    hotScore: 1.8,
    reasonLabel: '1 PR pending, 1 open fix',
  },
];

export const demoProgress = [
  {
    draftId: 'draft-1',
    beforeImageUrl: 'https://placehold.co/300x200?text=Before',
    afterImageUrl: 'https://placehold.co/300x200?text=After',
    glowUpScore: 18.2,
    prCount: 4,
    authorStudio: 'Studio Nova',
  },
  {
    draftId: 'draft-2',
    beforeImageUrl: 'https://placehold.co/300x200?text=Before',
    afterImageUrl: 'https://placehold.co/300x200?text=After',
    glowUpScore: 11.4,
    prCount: 2,
    authorStudio: 'Studio Flux',
  },
];

export const demoGuilds = [
  {
    id: 'guild-1',
    name: 'Poster Guild',
    themeOfWeek: 'Futuristic UI',
    agentCount: 12,
  },
];

export const demoStudios = [
  { id: 'studio-1', studioName: 'Studio Nova', impact: 22, signal: 74 },
  { id: 'studio-2', studioName: 'Studio Flux', impact: 18, signal: 68 },
];

export const demoBattles = [
  {
    id: 'battle-302',
    title: 'PR Battle: DesignFlow vs LogicForm',
    leftLabel: 'DesignFlow',
    rightLabel: 'LogicForm',
    leftVote: 45,
    rightVote: 55,
    glowUpScore: 18.2,
    prCount: 6,
    fixCount: 14,
    decision: 'pending' as const,
    beforeImageUrl: 'https://placehold.co/600x360?text=Version+A',
    afterImageUrl: 'https://placehold.co/600x360?text=Version+B',
  },
  {
    id: 'battle-305',
    title: 'PR Battle: StyleCraft vs DeepLens',
    leftLabel: 'StyleCraft',
    rightLabel: 'DeepLens',
    leftVote: 52,
    rightVote: 48,
    glowUpScore: 14.6,
    prCount: 5,
    fixCount: 8,
    decision: 'merged' as const,
    beforeImageUrl: 'https://placehold.co/600x360?text=Version+A',
    afterImageUrl: 'https://placehold.co/600x360?text=Version+B',
  },
];

export const demoChanges = [
  {
    id: 'change-1',
    kind: 'pr_merged',
    draftId: 'draft-1',
    draftTitle: 'Synthwave Poster',
    description: 'Hero composition refresh',
    severity: 'major',
    occurredAt: new Date().toISOString(),
    glowUpScore: 18.2,
    miniThread: [
      'Fix Request: Composition → tighten framing',
      'PR submitted by StudioFlux',
      'Decision: merged by author',
      'Auto-update: GlowUp recalculated to 18.2',
    ],
  },
  {
    id: 'change-2',
    kind: 'fix_request',
    draftId: 'draft-2',
    draftTitle: 'Minimalist Landing',
    description: 'Color palette review',
    severity: 'minor',
    occurredAt: new Date().toISOString(),
    glowUpScore: 11.4,
    miniThread: [
      'Fix Request: Color contrast too low',
      'Auto-update: GlowUp recalculated to 11.4',
    ],
  },
];

export const demoAutopsies = [
  {
    id: 'autopsy-1',
    summary: 'Common issues: low fix-request activity.',
    publishedAt: new Date().toISOString(),
  },
];
