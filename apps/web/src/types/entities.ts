/**
 * Frontend entity interfaces derived from API response shapes.
 * These represent the data as received from NestJS API (BigInt serialized as string).
 */

// ─── Common ────────────────────────────────────────────────────────────────

export interface NamedEntity {
  id: string;
  name: string;
}

export interface LabelEntity {
  id: string;
  name: string;
  color: string;
}

export interface NestedLabel {
  label: LabelEntity;
}

// ─── User ──────────────────────────────────────────────────────────────────

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  address?: string | null;
  role: 'SUPER_ADMIN' | 'MANAGER' | 'USER';
  status: 'ACTIVE' | 'INACTIVE';
  departmentId: string | null;
  teamId: string | null;
  employeeLevelId?: string | null;
  department?: NamedEntity | null;
  employeeLevel?: NamedEntity | null;
}

// ─── Lead ──────────────────────────────────────────────────────────────────

export interface LeadRecord {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  status: string;
  companyName?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  zaloUrl?: string | null;
  linkedinUrl?: string | null;
  sourceId?: string | null;
  productId?: string | null;
  customerId?: string | null;
  source?: NamedEntity | null;
  product?: NamedEntity | null;
  assignedUser?: NamedEntity | null;
  department?: NamedEntity | null;
  customer?: { name: string; phone?: string | null } | null;
  labels?: NestedLabel[];
  orders?: OrderRecord[];
  activityCount?: number;
  lastInteractionAt?: string | null;
  metadata?: LeadMetadata | null;
  createdAt: string;
}

export interface LeadMetadata {
  aiLevel?: string;
  aiScore?: number;
  aiSummary?: string;
  aiScoreReason?: string;
  [key: string]: unknown;
}

// ─── Customer ──────────────────────────────────────────────────────────────

export interface CustomerRecord {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  status: string;
  shortDescription?: string | null;
  description?: string | null;
  companyName?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  zaloUrl?: string | null;
  linkedinUrl?: string | null;
  assignedUserId?: string | null;
  assignedDepartmentId?: string | null;
  department?: NamedEntity | null;
  employeeLevel?: NamedEntity | null;
  labels?: NestedLabel[];
  leads?: LeadRecord[];
  orders?: OrderRecord[];
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

// ─── Order ─────────────────────────────────────────────────────────────────

export interface OrderRecord {
  id: string;
  status: string;
  totalAmount: number;
  amount?: number;
  vatRate?: number;
  vatAmount?: number;
  notes?: string | null;
  customer?: { name: string; phone?: string | null };
  product?: NamedEntity | null;
  creator?: NamedEntity | null;
  payments?: PaymentRecord[];
  createdAt: string;
}

// ─── Payment ───────────────────────────────────────────────────────────────

export interface PaymentRecord {
  id: string;
  amount: number;
  status: string;
  orderId?: string;
  paymentType?: NamedEntity | null;
  transferContent?: string | null;
  verifiedSource?: string | null;
  verifier?: NamedEntity | null;
  verifiedAt?: string | null;
  matchedTransaction?: { amount: number; content: string } | null;
  createdAt: string;
}

// ─── BankTransaction ───────────────────────────────────────────────────────

export interface BankTransactionRecord {
  id: string;
  amount: number;
  status: string;
  transactionTime: string;
  content?: string | null;
  senderName?: string | null;
  matchStatus: string;
}

// ─── Product ───────────────────────────────────────────────────────────────

export interface ProductRecord {
  id: string;
  name: string;
  price?: number;
  description?: string | null;
  category?: NamedEntity | null;
  categoryId?: string | null;
  vatRate?: number;
  isActive: boolean;
}

// ─── CallLog ───────────────────────────────────────────────────────────────

export interface CallLogRecord {
  id: string;
  phoneNumber: string;
  callType: string;
  callTime: string;
  duration?: number;
  content?: string | null;
  analysis?: { tags?: string[]; detail?: string } | null;
  matchStatus: string;
  matchedEntityType?: string | null;
  matchedEntityId?: string | null;
}

// ─── Task ──────────────────────────────────────────────────────────────────

export interface TaskRecord {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  dueDate?: string | null;
  remindAt?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  assignedTo?: string | null;
  createdAt: string;
}

// ─── Activity ──────────────────────────────────────────────────────────────

export interface ActivityRecord {
  id: string;
  type: string;
  content?: string | null;
  createdAt: string;
  user?: NamedEntity | null;
  metadata?: { duration?: number; [key: string]: unknown } | null;
  _source?: string;
}

// ─── Settings ──────────────────────────────────────────────────────────────

export interface SettingsItem {
  id: string;
  name: string;
  [key: string]: unknown;
}

// ─── API Response ──────────────────────────────────────────────────────────

export interface ApiListResponse<T> {
  data: T[];
  meta?: { nextCursor?: string };
}

// ─── Dashboard ─────────────────────────────────────────────────────────────

export interface DashboardStats {
  totalLeads?: number;
  totalCustomers?: number;
  totalOrders?: number;
  totalRevenue?: number;
  [key: string]: unknown;
}
