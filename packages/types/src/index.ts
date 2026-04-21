// @kitchenledger/types
// Single source of truth for TypeScript types used by apps/web and apps/mobile.
// Types are derived from service DTOs — do not embed business logic here.

// ─── Common ───────────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: ApiError;
}

export interface PagedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    size: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiError {
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
}

/** Legacy discriminated-union shape kept for backwards compatibility. */
export type ApiResult<T> = { success: true; data: T } | { success: false; error: { code: string; message: string; fields?: Record<string, string> } };

/** RabbitMQ event envelope used for all async inter-service events. */
export interface EventEnvelope<T = unknown> {
  event_id: string;
  event_type: string;
  tenant_id: string;
  produced_by: string;
  produced_at: string; // ISO-8601
  version: string;
  payload: T;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export type UserRole = 'owner' | 'manager' | 'kitchen_staff' | 'server';
export type SubscriptionTier = 'starter' | 'growth' | 'professional' | 'enterprise';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled';

/** Subset of user identity forwarded by the Gateway in X-* headers. */
export interface UserContext {
  user_id: string;
  tenant_id: string;
  role: UserRole;
  email: string;
}

export interface User {
  id: string;
  tenantId: string;
  email: string;
  fullName: string;
  phone?: string;
  role: UserRole;
  active: boolean;
  verified: boolean;
  avatarUrl?: string;
  language: string;
  lastLoginAt?: string; // ISO-8601
  createdAt: string;
}

export interface TenantSettings {
  fiscalYearStart?: string;
  workingHours?: { open: string; close: string };
  cashVarianceThreshold?: number;
  defaultFoodCostTarget?: number;
  defaultLaborCostTarget?: number;
  primeCostTarget?: number;
  taxName?: string;
  defaultTaxRate?: number;
  enableUpi?: boolean;
  upiId?: string;
  lowStockAlertMethod?: string;
  expiryAlertDays?: number;
  priceChangeAlertThreshold?: number;
}

export interface Tenant {
  id: string;
  restaurantName: string;
  slug: string;
  email: string;
  phone?: string;
  timezone: string;
  currency: string;
  locale: string;
  subscriptionTier: SubscriptionTier;
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt?: string; // ISO-8601
  settings: TenantSettings;
  onboardingStep: number;
  onboardingDone: boolean;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
  user: User;
  tenant: Tenant;
}

// ─── Inventory ────────────────────────────────────────────────────────────────

export type AbcCategory = 'A' | 'B' | 'C';
export type PurchaseOrderStatus = 'draft' | 'sent' | 'partial' | 'received' | 'closed' | 'cancelled';
export type ThreeWayMatchStatus = 'pending' | 'matched' | 'discrepancy' | 'approved';
export type StockItemCondition = 'good' | 'damaged' | 'expired';
export type WasteReason = 'spoilage' | 'overproduction' | 'prep_waste' | 'spill' | 'theft' | 'other';
export type MenuMatrixCategory = 'star' | 'plowhorse' | 'puzzle' | 'dog';

export interface InventoryItem {
  id: string;
  tenantId: string;
  categoryId?: string;
  name: string;
  sku?: string;
  barcode?: string;
  description?: string;
  abcCategory?: AbcCategory;
  abcOverride: boolean;
  purchaseUnit: string;
  purchaseUnitQty: number;
  recipeUnit: string;
  countUnit: string;
  purchaseToRecipeFactor: number;
  recipeToCountFactor: number;
  currentStock: number;
  parLevel?: number;
  reorderQuantity?: number;
  safetyStock: number;
  avgCost?: number;
  lastPurchasePrice?: number;
  priceAlertThreshold: number;
  perishable: boolean;
  shelfLifeDays?: number;
  expiryAlertDays: number;
  storageLocation?: string;
  primarySupplierId?: string;
  active: boolean;
  belowPar: boolean;
  notes?: string;
  imageUrl?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface Supplier {
  id: string;
  tenantId: string;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  address?: string;
  paymentTermsDays: number;
  leadTimeDays: number;
  deliverySchedule?: string[];
  notes?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderLineItem {
  id: string;
  inventoryItemId: string;
  orderedQuantity: number;
  orderedUnit: string;
  unitPrice: number;
  lineTotal: number;
  receivedQuantity?: number;
  invoiceUnitPrice?: number;
  discrepancyNotes?: string;
}

export interface PurchaseOrder {
  id: string;
  tenantId: string;
  poNumber: string;
  supplierId: string;
  status: PurchaseOrderStatus;
  orderDate: string; // LocalDate serialized as ISO date string
  expectedDeliveryDate?: string;
  actualDeliveryDate?: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  notes?: string;
  sentVia?: string;
  sentAt?: string;
  createdBy: string;
  receivedBy?: string;
  items: PurchaseOrderLineItem[];
  createdAt: string;
  updatedAt: string;
}

export interface StockReceiptLineItem {
  id: string;
  inventoryItemId: string;
  expectedQuantity?: number;
  receivedQuantity: number;
  unit: string;
  unitCost: number;
  expiryDate?: string;
  batchNumber?: string;
  storageLocation?: string;
  condition?: StockItemCondition;
}

export interface StockReceipt {
  id: string;
  tenantId: string;
  purchaseOrderId?: string;
  supplierId: string;
  receiptDate: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  invoiceAmount?: number;
  invoiceImageUrl?: string;
  threeWayMatchStatus: ThreeWayMatchStatus;
  matchNotes?: string;
  receivedBy: string;
  confirmed: boolean;
  confirmedAt?: string;
  items: StockReceiptLineItem[];
  createdAt: string;
}

export interface WasteLog {
  id: string;
  tenantId: string;
  inventoryItemId: string;
  itemName?: string;
  loggedAt: string;
  quantity: number;
  unit: string;
  reason: WasteReason;
  station?: string;
  estimatedCost?: number;
  photoUrl?: string;
  notes?: string;
  loggedBy: string;
  movementId?: string;
  createdAt: string;
}

export interface RecipeIngredient {
  id: string;
  inventoryItemId?: string;
  subRecipeId?: string;
  quantity: number;
  unit: string;
  wastePercent?: number;
  unitCost?: number;
  lineCost?: number;
  sortOrder: number;
}

export interface Recipe {
  id: string;
  tenantId: string;
  name: string;
  category?: string;
  menuPrice: number;
  servingSize?: number;
  servingUnit?: string;
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  yieldPercent?: number;
  totalCost?: number;
  foodCostPercent?: number;
  menuMatrixCategory?: MenuMatrixCategory;
  active: boolean;
  notes?: string;
  imageUrl?: string;
  ingredients: RecipeIngredient[];
  createdAt: string;
  updatedAt: string;
}

export type InventoryCountType = 'full' | 'cycle';
export type InventoryCountStatus = 'in_progress' | 'completed' | 'verified';

export interface InventoryCount {
  id: string;
  tenantId: string;
  countType: InventoryCountType;
  status: InventoryCountStatus;
  countDate: string;
  totalVarianceCost?: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryAlerts {
  lowStock: InventoryItem[];
  expiring: InventoryItem[];
}

// ─── Finance ──────────────────────────────────────────────────────────────────

export type PaymentMethod = 'cash' | 'card' | 'upi' | 'bank_transfer' | 'cheque' | 'other';
export type AccountType = 'revenue' | 'cogs' | 'labor' | 'operating_expense' | 'asset' | 'liability';
export type BenchmarkStatus = 'good' | 'warning' | 'danger';

export interface DailySalesReport {
  id: string;
  tenantId: string;
  reportDate: string; // LocalDate as ISO date string
  coversCount: number;
  grossSales: number;
  discounts: number;
  netSales: number;
  cashSales: number;
  upiSales: number;
  cardSales: number;
  otherSales: number;
  vatCollected: number;
  serviceChargeCollected: number;
  costOfGoodsSold?: number;
  notes?: string;
  cashCountActual?: number;
  cashOverShort?: number;
  requiresInvestigation: boolean;
  finalized: boolean;
  createdBy: string;
  approvedBy?: string;
  finalizedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Expense {
  id: string;
  tenantId: string;
  expenseDate: string;
  category: string;
  description?: string;
  amount: number;
  vendorId?: string;
  paymentMethod: PaymentMethod;
  referenceNumber?: string;
  receiptUrl?: string;
  recurring: boolean;
  accountId?: string;
  createdBy: string;
  approvedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Vendor {
  id: string;
  tenantId: string;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  gstin?: string;
  paymentTermsDays: number;
  outstandingBalance: number;
  notes?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Account {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  accountType: AccountType;
  parentId?: string;
  isSystem: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PLSection {
  amount: number;
  percentOfSales: number;
  benchmarkStatus: BenchmarkStatus;
}

export interface PLReport {
  tenantId: string;
  periodStart: string;
  periodEnd: string;
  revenue: PLSection;
  cogs: PLSection;
  grossProfit: PLSection;
  labor: PLSection;
  primeCost: PLSection;
  operatingExpenses: PLSection;
  ebitda: PLSection;
  netProfit: PLSection;
  generatedAt: string;
}

export interface FinanceDashboard {
  netSalesYesterday: number;
  netSalesLastWeekSameDay: number;
  cashOverShort: number;
  foodCostPercent: number;
  laborCostPercent: number;
  splh: number; // sales per labor hour
  guestCount: number;
  avgCheckSize: number;
}

// ─── Staff ────────────────────────────────────────────────────────────────────

export type EmploymentType = 'full_time' | 'part_time' | 'contract';
export type ShiftStatus = 'scheduled' | 'clocked_in' | 'completed' | 'no_show' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';
export type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused';

export interface Employee {
  id: string;
  tenantId: string;
  userId?: string;
  firstName: string;
  lastName: string;
  fullName: string;
  role: string;
  employmentType: EmploymentType;
  hireDate: string;
  endDate?: string;
  hourlyRate?: number;
  monthlySalary?: number;
  phone?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  notes?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Shift {
  id: string;
  tenantId: string;
  employeeId: string;
  shiftDate: string;
  startTime: string; // LocalTime as HH:mm:ss
  endTime: string;
  roleLabel?: string;
  station?: string;
  status: ShiftStatus;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  tenantId: string;
  title: string;
  description?: string;
  assignedTo?: string;
  dueDate?: string;
  priority: TaskPriority;
  status: TaskStatus;
  recurring: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TipPoolPayout {
  id: string;
  employeeId: string;
  amount: number;
  basis?: string;
}

export interface TipPool {
  id: string;
  tenantId: string;
  poolDate: string;
  totalAmount: number;
  distributionMethod: string;
  distributed: boolean;
  distributedAt?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  payouts?: TipPoolPayout[];
}

export interface Attendance {
  id: string;
  tenantId: string;
  employeeId: string;
  shiftId?: string;
  clockInAt?: string;
  clockOutAt?: string;
  hoursWorked?: number;
  lateMinutes: number;
  notes?: string;
  recordedBy?: string;
  createdAt: string;
}

// ─── Notifications ────────────────────────────────────────────────────────────

export type NotificationPriority = 'critical' | 'important' | 'informational';

export interface Notification {
  id: string;
  tenantId: string;
  userId: string;
  type: string;
  priority: NotificationPriority;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  readAt?: string;
  createdAt: string;
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export type ReportJobStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type ReportType =
  | 'pl_summary'
  | 'pl_detail'
  | 'dsr_summary'
  | 'expense_summary'
  | 'vendor_ledger'
  | 'inventory_valuation'
  | 'inventory_movement'
  | 'waste_analysis'
  | 'recipe_costing'
  | 'staff_hours'
  | 'attendance_summary'
  | 'tip_pool_history';

export interface ReportJob {
  id: string;
  tenantId: string;
  reportType: ReportType;
  status: ReportJobStatus;
  outputUrl?: string;
  outputFormat: 'pdf' | 'csv' | 'json';
  parameters?: Record<string, unknown>;
  createdAt: string;
  completedAt?: string;
}

// ─── Files ────────────────────────────────────────────────────────────────────

export interface FileUpload {
  id: string;
  tenantId: string;
  url: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  context?: string;
  referenceId?: string;
  createdAt: string;
}

// ─── AI ───────────────────────────────────────────────────────────────────────

export type AIJobStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type AIJobType = 'ocr' | 'voice_parse' | 'nl_query' | 'forecast';

export interface AIJob {
  id: string;
  tenantId: string;
  jobType: AIJobType;
  status: AIJobStatus;
  result?: unknown;
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
}

export interface OCRMatchedItem {
  name: string;
  quantity: number;
  unit: string;
  matchedItemId: string;
  matchedName: string;
  matchConfidence: number;
}

export interface OCRUnmatchedItem {
  name: string;
  quantity?: number;
  unit?: string;
}

export interface OCRResult {
  matched: OCRMatchedItem[];
  unmatched: OCRUnmatchedItem[];
  confidence: number;
}

export interface VoiceParseResult {
  transcript: string;
  parsed: {
    item: string;
    quantity: number;
    unit: string;
    reason?: string;
    station?: string;
  };
  confidence: number;
}

export interface NLQueryResult {
  answer: string;
  data?: {
    type: 'line' | 'bar' | 'table';
    values: unknown[];
  };
}
