export const Colors = {
  primary: '#4f46e5',
  primaryLight: '#6366f1',
  primaryDark: '#3730a3',

  success: '#16a34a',
  warning: '#d97706',
  danger: '#dc2626',
  info: '#0284c7',

  background: '#f8fafc',
  surface: '#ffffff',
  surfaceElevated: '#f1f5f9',
  border: '#e2e8f0',
  borderStrong: '#cbd5e1',

  textPrimary: '#0f172a',
  textSecondary: '#64748b',
  textDisabled: '#94a3b8',
  textInverse: '#ffffff',

  tabBar: '#ffffff',
  tabBarActive: '#4f46e5',
  tabBarInactive: '#94a3b8',

  offline: '#f59e0b',
  offlineBg: '#fffbeb',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const FontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  xxxl: 30,
} as const;

export const Radius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const KPIBenchmarks = {
  foodCostPct: { green: [28, 35], yellow: [23, 40] },
  laborCostPct: { green: [25, 35], yellow: [20, 40] },
  primeCostPct: { green: [55, 65], yellow: [50, 70] },
  netProfitPct: { green: [3, 10], yellow: [0, 15] },
} as const;
