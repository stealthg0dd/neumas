ALTER TABLE shopping_lists
  ADD COLUMN IF NOT EXISTS status_reason text,
  ADD COLUMN IF NOT EXISTS last_transition_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_transition_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_prediction_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE shopping_list_items
  ADD COLUMN IF NOT EXISTS received_quantity numeric(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  ADD COLUMN IF NOT EXISTS received_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS receipt_idempotency_key text;

CREATE TABLE IF NOT EXISTS shopping_list_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shopping_list_id uuid NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  previous_state text NOT NULL,
  next_state text NOT NULL,
  reason text,
  note text,
  source_prediction_id uuid REFERENCES predictions(id) ON DELETE SET NULL,
  source_recommendation jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shopping_list_transitions_idempotency
  ON shopping_list_transitions(shopping_list_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_shopping_list_transitions_list
  ON shopping_list_transitions(shopping_list_id, created_at DESC);

ALTER TABLE predictions
  ADD COLUMN IF NOT EXISTS prediction_version text,
  ADD COLUMN IF NOT EXISTS generated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS source_data_window jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS algorithm_identifier text,
  ADD COLUMN IF NOT EXISTS predicted_depletion_date timestamptz,
  ADD COLUMN IF NOT EXISTS predicted_quantity_needed numeric(12,3),
  ADD COLUMN IF NOT EXISTS evaluated_at timestamptz,
  ADD COLUMN IF NOT EXISTS evaluation_status text NOT NULL DEFAULT 'pending';

CREATE TABLE IF NOT EXISTS prediction_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_id uuid NOT NULL REFERENCES predictions(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  item_id uuid REFERENCES inventory_items(id) ON DELETE SET NULL,
  evaluation_type text NOT NULL DEFAULT 'inventory_outcome',
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  actual_depletion_date timestamptz,
  actual_quantity numeric(12,3),
  quantity_error numeric(12,3),
  depletion_date_error_days integer,
  stockout_occurred boolean,
  recommendation_accepted boolean,
  operator_overridden boolean,
  reorder_completed boolean,
  confidence numeric(5,4),
  confidence_bucket text,
  calibration_error numeric(12,4),
  notes text,
  source_window_end timestamptz,
  idempotency_key text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_prediction_evaluations_idempotency
  ON prediction_evaluations(prediction_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_prediction_evaluations_property
  ON prediction_evaluations(property_id, evaluated_at DESC);

UPDATE predictions
SET prediction_version = COALESCE(prediction_version, model_version, 'legacy-v1'),
    generated_at = COALESCE(generated_at, created_at),
    algorithm_identifier = COALESCE(algorithm_identifier, model_version, 'legacy'),
    predicted_depletion_date = COALESCE(predicted_depletion_date, prediction_date),
    predicted_quantity_needed = COALESCE(predicted_quantity_needed, predicted_value),
    source_data_window = CASE
      WHEN source_data_window = '{}'::jsonb THEN jsonb_build_object('backfilled', true)
      ELSE source_data_window
    END
WHERE TRUE;
