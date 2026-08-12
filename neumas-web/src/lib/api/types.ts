/**
 * Neumas API — TypeScript interfaces
 * Mirrors FastAPI Pydantic schemas exactly.
 */
import { z } from "zod";

// ============================================================================
// Auth
// ============================================================================

export interface ProfileResponse {
  user_id: string;
  email: string;
  full_name: string | null;
  org_id: string;
  org_name: string;
  property_id: string;
  property_name: string;
  role: string;
  org_type?: string | null;
  workspace_experience?: WorkspaceExperience;
  is_invited_user?: boolean;
}

export type WorkspaceExperience =
  | "FNB"
  | "HOUSEHOLD"
  | "LEGACY_FNB"
  | "NEEDS_PERSONA"
  | "INVITED";

export type BusinessType =
  | "Restaurant"
  | "Cafe / Bakery"
  | "Cloud Kitchen"
  | "Catering"
  | "Hotel / Hospitality"
  | "Food Manufacture"
  | "Bar / Pub"
  | "Other";

export interface OnboardingOutletInput {
  onboarding_key?: string | null;
  name: string;
  property_type: string;
  address?: string | null;
  is_primary?: boolean;
}

export interface OnboardingOutletResponse {
  property_id: string;
  onboarding_key?: string | null;
  name: string;
  property_type?: string | null;
  address?: string | null;
  is_primary: boolean;
  onboarding_order?: number | null;
}

export interface ActivationMilestonesResponse {
  business_setup_completed: boolean;
  first_property_created: boolean;
  first_document_uploaded: boolean;
  first_document_approved: boolean;
  first_ledger_post: boolean;
  first_forecast_generated: boolean;
  first_reorder_reviewed: boolean;
}

export interface ActivationChecklistStep {
  id: string;
  label: string;
  description?: string;
  href?: string;
  completed: boolean;
}

export interface HouseholdOnboardingProfile {
  household_name?: string | null;
  household_size?: number | null;
  shopping_frequency?: string | null;
  favorite_stores: string[];
  waste_reduction_goal?: string | null;
  monthly_grocery_budget?: number | null;
  dietary_preferences: string[];
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string | null;
  profile: ProfileResponse;
}

/** POST /api/auth/signup */
export interface SignupRequest {
  email: string;
  password: string;
  org_name: string;
  property_name: string;
  org_type?: string | null;
  property_address?: string | null;
  role?: string;
}

export interface SignupResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string | null;
  profile: ProfileResponse;
}

export interface DigestPreferencesResponse {
  email_digest_enabled: boolean;
  timezone: string;
  property_timezone: string;
  safety_buffer_days: number;
  preferred_currency: string;
}

export interface DigestPreferencesUpdateRequest {
  email_digest_enabled?: boolean;
  timezone?: string;
  safety_buffer_days?: number;
  preferred_currency?: string;
}

export type OnboardingStatus = "NOT_STARTED" | "IN_PROGRESS" | "ACTIVATED" | "SKIPPED";

export interface OnboardingStateResponse {
  organization_id: string;
  property_id?: string | null;
  org_type?: string | null;
  business_type?: BusinessType | string | null;
  workspace_experience?: WorkspaceExperience;
  is_invited_user?: boolean;
  has_properties?: boolean;
  target_outlet_count?: number | null;
  household_profile?: HouseholdOnboardingProfile;
  outlets?: OnboardingOutletResponse[];
  activation_milestones?: ActivationMilestonesResponse;
  activation_checklist?: ActivationChecklistStep[];
  dashboard_unlocked?: boolean;
  property_type?: string | null;
  address?: string | null;
  onboarding_status: OnboardingStatus;
  onboarding_started_at?: string | null;
  onboarding_completed_at?: string | null;
  onboarding_version: number;
  onboarding_source?: string | null;
  country?: string | null;
  currency?: string | null;
  has_scans: boolean;
  has_inventory_activity: boolean;
  is_complete: boolean;
  requires_onboarding: boolean;
}

export interface OnboardingStateUpdateRequest {
  onboarding_status?: OnboardingStatus;
  onboarding_source?: string;
  org_type?: string | null;
  business_type?: BusinessType | string | null;
  org_name?: string | null;
  country?: string | null;
  currency?: string | null;
  outlet_count?: number | null;
  household_size?: number | null;
  shopping_frequency?: string | null;
  favorite_stores?: string[];
  waste_reduction_goal?: string | null;
  monthly_grocery_budget?: number | null;
  dietary_preferences?: string[];
  data_start_choice?: string | null;
  idempotency_key?: string | null;
  outlets?: OnboardingOutletInput[];
  property_name?: string | null;
  property_type?: string | null;
  address?: string | null;
}

export interface PropertyStockHealth {
  property_id: string;
  name: string;
  region: string | null;
  country: string | null;
  low_stock: number;
  out_of_stock: number;
  predicted_stockout: number;
  risk_score: number;
  status: "green" | "amber" | "red";
}

export interface OrgPropertyStockHealthResponse {
  organization_id: string;
  red_count: number;
  properties: PropertyStockHealth[];
}

// ============================================================================
// Inventory
// ============================================================================

export interface CategorySummary {
  id: string;
  name: string;
}

export interface InventoryItem {
  id: string;
  property_id: string;
  name: string;
  description: string | null;
  sku: string | null;
  barcode: string | null;
  unit: string;
  quantity: number;
  min_quantity: number;
  max_quantity: number | null;
  reorder_point: number | null;
  cost_per_unit: number | null;
  supplier_info: Record<string, unknown>;
  metadata: Record<string, unknown>;
  is_active: boolean;
  last_scanned_at: string | null;
  created_at: string;
  updated_at: string;
  category: CategorySummary | null;
  vendor_id?: string | null;
  average_daily_usage?: number | null;
  auto_reorder_enabled?: boolean;
  safety_buffer?: number;
  /** Computed: "normal" | "low_stock" | "out_of_stock" | "overstocked" */
  stock_status?: string;
  category_id?: string | null;
  /** Alias for min_quantity used for display */
  par_level?: number;
}

export interface InventoryItemCreate {
  property_id: string;
  name: string;
  description?: string;
  sku?: string;
  unit?: string;
  quantity?: number;
  min_quantity?: number;
  max_quantity?: number;
  reorder_point?: number;
  cost_per_unit?: number;
  category_id?: string;
}

export interface InventoryItemUpdate {
  name?: string;
  description?: string;
  sku?: string;
  unit?: string;
  min_quantity?: number;
  max_quantity?: number;
  reorder_point?: number;
  cost_per_unit?: number;
  is_active?: boolean;
  average_daily_usage?: number;
  auto_reorder_enabled?: boolean;
  safety_buffer?: number;
}

export interface InventoryListResponse {
  items: InventoryItem[];
  total: number;
  page: number;
  page_size: number;
  low_stock_count: number;
}

export interface InventoryTimelineEvent {
  event_type: string;
  title: string;
  detail: string;
  created_at: string;
  reference_id?: string | null;
  reference_type?: string | null;
}

export interface InventoryIntelligenceResponse {
  item: InventoryItem;
  last_observed_at?: string | null;
  last_purchased_at?: string | null;
  latest_price?: number | null;
  supplier_name?: string | null;
  recent_usage_rate?: number | null;
  predicted_depletion_at?: string | null;
  forecast_confidence?: number | null;
  low_stock_status?: string | null;
  expiry_status?: string | null;
  reorder_state?: string | null;
  learning_notes: string[];
  timeline: InventoryTimelineEvent[];
}

/** POST /api/inventory/update — upsert by name */
export interface InventoryUpdateRequest {
  property_id: string;
  item_name: string;
  new_qty: number;
  unit?: string;
  trigger_prediction?: boolean;
}

export interface InventoryUpdateResponse {
  item_id: string;
  item_name: string;
  previous_qty: number | null;
  new_qty: number;
  created?: boolean;
  prediction_task_id?: string | null;
}

export interface BurnRateRecomputeRequest {
  lookback_days?: number;
  auto_calculate_reorder_point?: boolean;
  safety_buffer?: number;
}

export interface BurnRateRecomputeResponse {
  items_updated: number;
  lookback_days: number;
  auto_calculate_reorder_point: boolean;
  safety_buffer: number;
}

export interface RestockPreviewItem {
  item_id: string;
  name: string;
  unit: string;
  current_quantity: number;
  average_daily_usage: number;
  runout_days: number;
  needed_quantity: number;
  unit_cost: number;
  estimated_cost: number;
  reorder_point: number;
  auto_reorder_enabled: boolean;
}

export interface RestockVendorContact {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  website: string | null;
}

export interface RestockVendorGroup {
  vendor: RestockVendorContact;
  items: RestockPreviewItem[];
  total_estimated_cost: number;
  item_count: number;
}

export interface RestockPreviewResponse {
  runout_threshold_days: number;
  vendors: RestockVendorGroup[];
  generated_at: string;
}

export interface VendorOrderExportResponse {
  vendor_id: string;
  vendor: RestockVendorContact | null;
  html: string;
  email_subject: string;
  email_body: string;
  total_estimated_cost: number | null;
  item_count: number | null;
  currency_code?: string | null;
  currency_symbol?: string | null;
}

// ============================================================================
// Scans
// ============================================================================

export type ScanStatus =
  | "pending"
  | "uploaded"
  | "queued"
  | "processing"
  | "needs_review"
  | "inventory_posted"
  | "completed"
  | "completed_with_partial_analysis"
  | "partial_failed"
  | "failed"
  | "failed_provider_unavailable"
  | "failed_invalid_file";
export type ScanType = "receipt" | "barcode" | "full";

export interface Scan {
  id: string;
  property_id: string;
  user_id: string;
  status: ScanStatus;
  scan_type: ScanType;
  image_urls: string[];
  items_detected: number;
  confidence_score: number | null;
  processing_time_ms: number | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  stage_details?: Record<string, unknown> | null;
  stage_errors?: Array<Record<string, unknown>>;
}

export interface ExecutiveBriefingResponse {
  period_days: number;
  generated_at: string;
  bullets: string[];
  log_count: number;
}

export interface DecisionActionCard {
  priority: "P0" | "P1" | "P2";
  action_type: string;
  title: string;
  detail: string;
  value: string | null;
  confidence: number | null;
  cta_label: string;
  cta_href: string;
}

export interface DecisionLatestActivity {
  title: string;
  detail: string;
  status: string;
  scan_id?: string | null;
  document_count?: number | null;
  items_updated?: number | null;
  supplier_name?: string | null;
  invoice_total?: number | null;
  canonicalization_status?: string | null;
  downstream_status?: string | null;
}

export interface DecisionAheadState {
  stock_risk_count: number;
  next_7_day_purchase_need?: number | null;
  waste_risk_count?: number | null;
  forecast_confidence?: number | null;
  learning_state?: string | null;
}

export interface DecisionImpactState {
  mode: "baseline" | "measured";
  headline: string;
  stockouts_avoided?: number | null;
  waste_avoided?: number | null;
  purchasing_variance?: number | null;
  decisions_automated?: number | null;
}

export interface DecisionNextBestAction {
  action_type: string;
  title: string;
  detail: string;
  cta_label: string;
  cta_href: string;
}

export interface DecisionCenterResponse {
  generated_at: string;
  workspace_experience: string;
  action_queue: DecisionActionCard[];
  latest_activity?: DecisionLatestActivity | null;
  ahead: DecisionAheadState;
  impact: DecisionImpactState;
  next_best_action: DecisionNextBestAction;
}

export interface ForecastEligibilityResponse {
  status: string;
  reason_code:
    | "ELIGIBLE"
    | "INSUFFICIENT_DOCUMENTS"
    | "INSUFFICIENT_TIME_SERIES"
    | "NO_LEDGER_MOVEMENTS"
    | "MISSING_CANONICAL_ITEMS"
    | "ALREADY_FRESH"
    | "FORECAST_RUNNING";
  evidence_cycles_available: number;
  evidence_cycles_required: number;
  last_forecast_at?: string | null;
  next_eligible_at?: string | null;
  detail?: string;
  forecast_running?: boolean;
  cadence_hours?: number | null;
}

export interface ScanRerunResponse {
  scan_id: string;
  status: string;
  hint: string;
}

export interface ScanQueuedResponse {
  scan_id: string;
  id?: string; // alias used by some backend versions
  status: string;
  message: string;
}

export interface ScanStatusResponse {
  scan_id: string;
  status: ScanStatus;
  processed: boolean;
  items_detected?: number;
  confidence_score?: number | null;
  error_message?: string | null;
  created_at: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  stage_details?: Record<string, unknown> | null;
  stage_errors?: Array<Record<string, unknown>>;
  /** Items extracted by AI when available */
  extracted_items?: Record<string, unknown>[];
  receipt_metadata?: Record<string, unknown> | null;
  /** True when queued/uploaded for >2 min without worker pickup */
  stalled?: boolean;
  worker_seen?: boolean;
}

// ============================================================================
// Predictions
// ============================================================================

export type UrgencyLevel = "critical" | "urgent" | "soon" | "later";

/** Optional fields returned on stockout predictions (see backend `features_used`). */
export interface PredictionFeaturesUsed {
  urgency_bucket?: string;
  days_remaining?: number;
  avg_daily_consumption?: number;
  current_quantity?: number;
  pattern_confidence?: number;
  inventory_recency_days?: number | null;
  sample_size?: number;
  reason?: string;
}

export interface PredictionOutcomeSummary {
  sample_size: number;
  insufficient_history: boolean;
  forecast_accuracy: number | null;
  mean_quantity_error?: number | null;
  mean_depletion_date_error_days?: number | null;
  stockout_precision?: number | null;
  confidence_calibration: number | null;
  acceptance_rate: number | null;
  override_rate: number | null;
  reorder_completion_rate: number | null;
  drift_score: number | null;
  recent_outcomes: Array<{
    prediction_id: string;
    item_id?: string | null;
    item_name?: string | null;
    evaluated_at: string;
    quantity_error?: number | null;
    depletion_date_error_days?: number | null;
    recommendation_accepted?: boolean | null;
    operator_overridden?: boolean | null;
    stockout_occurred?: boolean | null;
    confidence?: number | null;
  }>;
}

export interface Prediction {
  id: string;
  property_id: string;
  item_id: string | null;
  prediction_type: string;
  prediction_date: string;
  predicted_value: number;
  confidence_interval_low: number | null;
  confidence_interval_high: number | null;
  confidence: number;
  model_version: string | null;
  actual_value: number | null;
  created_at: string;
  /** stockout urgency bucket */
  stockout_risk_level: UrgencyLevel | null;
  /** Denormalized item info */
  inventory_item: { id: string; name: string } | null;
  /** Present on stockout predictions from API when serialized */
  features_used?: PredictionFeaturesUsed | Record<string, unknown> | null;
  item_name?: string | null;
  days_until_runout?: number | null;
  time_horizon_days?: number | null;
  recommended_action?: string | null;
  prediction_version?: string | null;
  generated_at?: string | null;
  algorithm_identifier?: string | null;
  predicted_depletion_date?: string | null;
  predicted_quantity_needed?: number | null;
  evaluation_status?: string | null;
}

export interface ForecastQueuedResponse {
  job_id: string;
  status: string;
  message: string;
}

// ============================================================================
// Shopping Lists
// ============================================================================

export type ShoppingListStatus =
  | "draft"
  | "recommended"
  | "awaiting_approval"
  | "approved"
  | "order_ready"
  | "order_placed_manually"
  | "modified"
  | "rejected"
  | "order_sent"
  | "partially_received"
  | "received"
  | "cancelled";
export type ItemPriority = "critical" | "high" | "normal" | "low";

export interface ShoppingListItem {
  id: string;
  /** Present on ShoppingListDetailResponse items (full schema) */
  shopping_list_id?: string;
  inventory_item_id: string | null;
  name: string;
  quantity: number;
  unit: string;
  priority: ItemPriority;
  reason: string | null;
  estimated_price: number | null;
  actual_price: number | null;
  /** Standard field name used by full schema */
  is_purchased: boolean;
  /** Alias sent by ActiveShoppingListResponse (simplified schema) */
  checked?: boolean;
  purchased_at: string | null;
  received_quantity?: number | null;
  received_at?: string | null;
  created_at?: string;
}

/**
 * Normalises an item from either backend schema variant so that
 * `is_purchased` is always a reliable boolean regardless of which
 * endpoint returned the data (ActiveShoppingListResponse uses `checked`,
 * ShoppingListDetailResponse uses `is_purchased`).
 */
export function normalizeShoppingItem(item: ShoppingListItem): ShoppingListItem {
  return {
    ...item,
    is_purchased: item.checked ?? item.is_purchased ?? false,
  };
}

export interface ShoppingList {
  id: string;
  property_id: string;
  created_by_id: string;
  name: string;
  notes: string | null;
  status: ShoppingListStatus;
  total_estimated_cost: number | null;
  total_actual_cost: number | null;
  budget_limit: number | null;
  approved_at: string | null;
  approved_by_id: string | null;
  status_reason?: string | null;
  last_transition_at?: string | null;
  last_transition_by_id?: string | null;
  created_at: string;
  updated_at: string;
  item_count?: number | null;
}

export interface ShoppingListDetail extends ShoppingList {
  items: ShoppingListItem[];
}

export interface GenerateListRequest {
  property_id?: string;
  preferred_store?: string;
  /** If true, only include items with critical/urgent stockout risk */
  include_critical_only?: boolean;
  /** Minimum days of stock remaining before item is included */
  min_days_threshold?: number;
  budget_limit?: number;
}

export interface GenerateListResponse {
  job_id: string;
  message: string;
  property_id: string;
  result_code:
    | "CREATED"
    | "UPDATED"
    | "NO_ELIGIBLE_ITEMS"
    | "INSUFFICIENT_DATA"
    | "PREDICTION_PENDING";
  shopping_list_id?: string | null;
  item_count: number;
  detail: string;
}

export interface ApproveListResponse {
  id: string;
  status: ShoppingListStatus;
  approved_at: string;
}

// ============================================================================
// Zod runtime validators (for critical response shapes)
// ============================================================================

export const LoginResponseSchema = z.object({
  access_token: z.string(),
  token_type:   z.string(),
  expires_in:   z.number(),
  refresh_token: z.string().nullable().optional(),
  profile: z.object({
    user_id:       z.string(),
    email:         z.string().email(),
    full_name:     z.string().nullable().optional(),
    org_id:        z.string(),
    org_name:      z.string(),
    property_id:   z.string(),
    property_name: z.string(),
    role:          z.string(),
  }),
});

export const SignupResponseSchema = LoginResponseSchema;

// ============================================================================
// Generic API error shape
// ============================================================================

export interface ApiError {
  detail: string | Array<{ msg: string; loc: string[] }>;
  status?: number;
}

// ============================================================================
// Analytics
// ============================================================================

export interface SpendHistoryPoint {
  date:       string;
  amount:     number;
  cumulative: number;
}

export interface ConfidenceHistoryPoint {
  date:           string;
  avg_confidence: number;
  count:          number;
}

export interface CategoryBreakdownPoint {
  name:  string;
  value: number;
}

export interface UrgencyBreakdown {
  critical: number;
  urgent:   number;
  soon:     number;
  later:    number;
}

export interface AnalyticsSummary {
  spend_total:        number;
  avg_confidence_pct: number;
  items_tracked:      number;
  predictions_count:  number;
  scans_total:        number;
  spend_history:      SpendHistoryPoint[];
  inventory_value_history?: Array<{ date: string; value: number }>;
  confidence_history: ConfidenceHistoryPoint[];
  category_breakdown: CategoryBreakdownPoint[];
  urgency_breakdown:  UrgencyBreakdown;
}
