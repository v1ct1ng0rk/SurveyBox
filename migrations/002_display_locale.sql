ALTER TABLE surveys
    ADD COLUMN IF NOT EXISTS display_locale VARCHAR(8) NOT NULL DEFAULT 'zh';

ALTER TABLE surveys DROP CONSTRAINT IF EXISTS surveys_display_locale_check;
ALTER TABLE surveys
    ADD CONSTRAINT surveys_display_locale_check CHECK (display_locale IN ('zh', 'en'));
