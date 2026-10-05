-- Menu X-Ray analyses: stores the full structured result of a menu analysis
-- Linked to scans (which holds the uploaded file + raw OCR).

CREATE TABLE IF NOT EXISTS menu_xray_analyses (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id         uuid        REFERENCES scans(id) ON DELETE CASCADE,
    organization_id uuid        REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         uuid,
    menu_name       text        NOT NULL DEFAULT 'Uploaded Menu',
    currency        text        NOT NULL DEFAULT 'SGD',
    dishes_detected integer     NOT NULL DEFAULT 0,
    analysis_confidence numeric(4,3) NOT NULL DEFAULT 0,
    analysis_result jsonb       NOT NULL DEFAULT '{}'::jsonb,
    is_sample       boolean     NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_menu_xray_analyses_scan_id
    ON menu_xray_analyses (scan_id);

CREATE INDEX IF NOT EXISTS idx_menu_xray_analyses_org_id
    ON menu_xray_analyses (organization_id);
