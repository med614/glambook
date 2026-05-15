-- Migration : ajout prix prestations et snapshot CA
-- À exécuter dans Supabase SQL Editor

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS price numeric(10,2);

ALTER TABLE appointment_services
  ADD COLUMN IF NOT EXISTS price_at_booking numeric(10,2);

-- Backfill : remplir price_at_booking depuis le catalogue pour les lignes existantes
UPDATE appointment_services AS aps
SET price_at_booking = s.price
FROM services s
WHERE aps.service_id = s.id
  AND aps.price_at_booking IS NULL
  AND s.price IS NOT NULL;

-- WhatsApp : activer prestation sur WhatsApp
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS whatsapp_enabled boolean DEFAULT false;

-- Sessions conversation WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         text NOT NULL UNIQUE,
  org_id        uuid REFERENCES organizations(id) ON DELETE CASCADE,
  step          text NOT NULL DEFAULT 'welcome',
  service_id    uuid REFERENCES services(id) ON DELETE SET NULL,
  service_name  text,
  date          date,
  time          text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
