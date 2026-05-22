


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."current_org_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT NULLIF((auth.jwt() -> 'user_metadata' ->> 'org_id'), '')::uuid
$$;


ALTER FUNCTION "public"."current_org_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_super_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT COALESCE((auth.jwt() -> 'user_metadata' ->> 'role') = 'superadmin', false)
$$;


ALTER FUNCTION "public"."is_super_admin"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."appointment_services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "appointment_id" "uuid",
    "service_id" "uuid",
    "staff_id" "uuid",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "price_at_booking" numeric(10,2),
    "start_time" timestamp with time zone,
    "is_parallel" boolean DEFAULT false NOT NULL,
    CONSTRAINT "appointment_services_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."appointment_services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."appointments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "client_id" "uuid",
    "staff_id" "uuid",
    "type" "text" DEFAULT 'appointment'::"text",
    "status" "text" DEFAULT 'scheduled'::"text",
    "start_time" timestamp with time zone,
    "end_time" timestamp with time zone,
    "source" "text",
    "is_external" boolean DEFAULT false,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "external_period" "text",
    "walkin_name" "text",
    "reminder_sent" boolean DEFAULT false,
    "payment_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "payment_method" "text",
    CONSTRAINT "appointments_external_period_check" CHECK (("external_period" = ANY (ARRAY['morning'::"text", 'afternoon'::"text", 'evening'::"text", 'allday'::"text"]))),
    CONSTRAINT "chk_payment_method" CHECK (("payment_method" = ANY (ARRAY['cash'::"text", 'card'::"text", 'transfer'::"text"]))),
    CONSTRAINT "chk_payment_status" CHECK (("payment_status" = ANY (ARRAY['pending'::"text", 'paid'::"text"])))
);


ALTER TABLE "public"."appointments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "name" "text" NOT NULL,
    "last_name" "text",
    "phone" "text",
    "whatsapp_language" "text" DEFAULT 'fr'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "flag_dismissed" boolean DEFAULT false,
    "flag_dismissed_count" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."clients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_settings" (
    "org_id" "uuid" NOT NULL,
    "opening_hours" "jsonb" DEFAULT '{"fri": {"open": "09:00", "close": "18:00", "active": true}, "mon": {"open": "09:00", "close": "18:00", "active": true}, "sat": {"open": "09:00", "close": "18:00", "active": true}, "sun": {"open": "09:00", "close": "18:00", "active": false}, "thu": {"open": "09:00", "close": "18:00", "active": true}, "tue": {"open": "09:00", "close": "18:00", "active": true}, "wed": {"open": "09:00", "close": "18:00", "active": true}}'::"jsonb",
    "noshow_threshold" integer DEFAULT 3,
    "cancel_threshold" integer DEFAULT 5,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "whatsapp_enabled" boolean DEFAULT true,
    "whatsapp_show_prices" boolean DEFAULT true,
    "online_enabled" boolean DEFAULT true,
    "online_show_prices" boolean DEFAULT true
);


ALTER TABLE "public"."organization_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'trial'::"text" NOT NULL,
    "paid_until" "date",
    "monthly_price" numeric(10,2),
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "organization_subscriptions_status_check" CHECK (("status" = ANY (ARRAY['trial'::"text", 'active'::"text", 'suspended'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."organization_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "type" "text",
    "phone" "text",
    "whatsapp_automation_number" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "email" "text",
    "admin_name" "text",
    "supabase_user_id" "uuid",
    "logo_url" "text"
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."queue" AS
 SELECT "id",
    "organization_id",
    "client_id",
    "staff_id",
    "type",
    "status",
    "start_time",
    "end_time",
    "source",
    "is_external",
    "note",
    "created_at"
   FROM "public"."appointments"
  WHERE ("status" = 'waiting'::"text")
  ORDER BY "created_at";


ALTER VIEW "public"."queue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."salon_closures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid",
    "date" "date" NOT NULL,
    "label" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "end_date" "date"
);


ALTER TABLE "public"."salon_closures" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "color" "text" DEFAULT '#6366f1'::"text",
    "organization_id" "uuid"
);


ALTER TABLE "public"."service_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "name" "text" NOT NULL,
    "duration_minutes" integer,
    "is_heavy" boolean DEFAULT false,
    "is_active" boolean DEFAULT true,
    "category_id" "uuid",
    "price" numeric(10,2),
    "whatsapp_enabled" boolean DEFAULT false,
    "name_ar" "text"
);


ALTER TABLE "public"."services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "avatar_url" "text",
    "join_date" "date",
    "organization_id" "uuid"
);


ALTER TABLE "public"."staff" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff_absences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "staff_id" "uuid",
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL
);


ALTER TABLE "public"."staff_absences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff_categories" (
    "staff_id" "uuid" NOT NULL,
    "category_id" "uuid" NOT NULL
);


ALTER TABLE "public"."staff_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscription_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "paid_at" "date" DEFAULT CURRENT_DATE NOT NULL,
    "amount" numeric(10,2),
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."subscription_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."walkin_daily_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "date" "date" NOT NULL,
    "unserved_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid"
);


ALTER TABLE "public"."walkin_daily_log" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."walkins" AS
 SELECT "id",
    "organization_id",
    "client_id",
    "staff_id",
    "type",
    "status",
    "start_time",
    "end_time",
    "source",
    "is_external",
    "note",
    "created_at"
   FROM "public"."appointments"
  WHERE ("type" = 'walkin'::"text");


ALTER VIEW "public"."walkins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "phone" "text" NOT NULL,
    "org_id" "uuid",
    "step" "text" DEFAULT 'welcome'::"text" NOT NULL,
    "service_id" "uuid",
    "service_name" "text",
    "date" "date",
    "time" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "lang" "text" DEFAULT 'fr'::"text"
);


ALTER TABLE "public"."whatsapp_sessions" OWNER TO "postgres";


ALTER TABLE ONLY "public"."appointment_services"
    ADD CONSTRAINT "appointment_services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_settings"
    ADD CONSTRAINT "organization_settings_pkey" PRIMARY KEY ("org_id");



ALTER TABLE ONLY "public"."organization_subscriptions"
    ADD CONSTRAINT "organization_subscriptions_organization_id_key" UNIQUE ("organization_id");



ALTER TABLE ONLY "public"."organization_subscriptions"
    ADD CONSTRAINT "organization_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."salon_closures"
    ADD CONSTRAINT "salon_closures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_categories"
    ADD CONSTRAINT "service_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_absences"
    ADD CONSTRAINT "staff_absences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_categories"
    ADD CONSTRAINT "staff_categories_pkey" PRIMARY KEY ("staff_id", "category_id");



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_payments"
    ADD CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."walkin_daily_log"
    ADD CONSTRAINT "walkin_daily_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_sessions"
    ADD CONSTRAINT "whatsapp_sessions_phone_key" UNIQUE ("phone");



ALTER TABLE ONLY "public"."whatsapp_sessions"
    ADD CONSTRAINT "whatsapp_sessions_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_salon_closures_org_date" ON "public"."salon_closures" USING "btree" ("org_id", "date");



ALTER TABLE ONLY "public"."appointment_services"
    ADD CONSTRAINT "appointment_services_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appointment_services"
    ADD CONSTRAINT "appointment_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id");



ALTER TABLE ONLY "public"."appointment_services"
    ADD CONSTRAINT "appointment_services_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_settings"
    ADD CONSTRAINT "organization_settings_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_subscriptions"
    ADD CONSTRAINT "organization_subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."salon_closures"
    ADD CONSTRAINT "salon_closures_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_categories"
    ADD CONSTRAINT "service_categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_absences"
    ADD CONSTRAINT "staff_absences_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_categories"
    ADD CONSTRAINT "staff_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_categories"
    ADD CONSTRAINT "staff_categories_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."subscription_payments"
    ADD CONSTRAINT "subscription_payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."walkin_daily_log"
    ADD CONSTRAINT "walkin_daily_log_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



CREATE POLICY "Allow all for authenticated" ON "public"."walkin_daily_log" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."appointment_services" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."appointments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "org_delete" ON "public"."organizations" FOR DELETE USING ("public"."is_super_admin"());



CREATE POLICY "org_insert" ON "public"."organizations" FOR INSERT WITH CHECK ("public"."is_super_admin"());



CREATE POLICY "org_select" ON "public"."organizations" FOR SELECT USING (("public"."is_super_admin"() OR ("supabase_user_id" = "auth"."uid"())));



CREATE POLICY "org_settings_access" ON "public"."organization_settings" USING (("org_id" = ((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'org_id'::"text"))::"uuid"));



CREATE POLICY "org_update" ON "public"."organizations" FOR UPDATE USING (("public"."is_super_admin"() OR ("supabase_user_id" = "auth"."uid"())));



ALTER TABLE "public"."organization_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rls_appointment_services" ON "public"."appointment_services" USING (("public"."is_super_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."appointments" "a"
  WHERE (("a"."id" = "appointment_services"."appointment_id") AND ("a"."organization_id" = "public"."current_org_id"())))))) WITH CHECK (("public"."is_super_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."appointments" "a"
  WHERE (("a"."id" = "appointment_services"."appointment_id") AND ("a"."organization_id" = "public"."current_org_id"()))))));



CREATE POLICY "rls_appointments" ON "public"."appointments" USING (("public"."is_super_admin"() OR ("organization_id" = "public"."current_org_id"()))) WITH CHECK (("public"."is_super_admin"() OR ("organization_id" = "public"."current_org_id"())));



CREATE POLICY "rls_clients" ON "public"."clients" USING (("public"."is_super_admin"() OR ("organization_id" = "public"."current_org_id"()))) WITH CHECK (("public"."is_super_admin"() OR ("organization_id" = "public"."current_org_id"())));



CREATE POLICY "rls_service_categories" ON "public"."service_categories" USING (("public"."is_super_admin"() OR ("organization_id" = "public"."current_org_id"()))) WITH CHECK (("public"."is_super_admin"() OR ("organization_id" = "public"."current_org_id"())));



CREATE POLICY "rls_services" ON "public"."services" USING (("public"."is_super_admin"() OR ("organization_id" = "public"."current_org_id"()))) WITH CHECK (("public"."is_super_admin"() OR ("organization_id" = "public"."current_org_id"())));



CREATE POLICY "rls_staff" ON "public"."staff" USING (("public"."is_super_admin"() OR ("organization_id" = "public"."current_org_id"()))) WITH CHECK (("public"."is_super_admin"() OR ("organization_id" = "public"."current_org_id"())));



CREATE POLICY "rls_staff_absences" ON "public"."staff_absences" USING (("public"."is_super_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."staff" "s"
  WHERE (("s"."id" = "staff_absences"."staff_id") AND ("s"."organization_id" = "public"."current_org_id"())))))) WITH CHECK (("public"."is_super_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."staff" "s"
  WHERE (("s"."id" = "staff_absences"."staff_id") AND ("s"."organization_id" = "public"."current_org_id"()))))));



CREATE POLICY "rls_staff_categories" ON "public"."staff_categories" USING (("public"."is_super_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."staff" "s"
  WHERE (("s"."id" = "staff_categories"."staff_id") AND ("s"."organization_id" = "public"."current_org_id"())))))) WITH CHECK (("public"."is_super_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."staff" "s"
  WHERE (("s"."id" = "staff_categories"."staff_id") AND ("s"."organization_id" = "public"."current_org_id"()))))));



CREATE POLICY "rls_walkin_daily_log" ON "public"."walkin_daily_log" USING (("public"."is_super_admin"() OR ("organization_id" = "public"."current_org_id"()))) WITH CHECK (("public"."is_super_admin"() OR ("organization_id" = "public"."current_org_id"())));



ALTER TABLE "public"."salon_closures" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "salon_closures_access" ON "public"."salon_closures" USING (("org_id" = ((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'org_id'::"text"))::"uuid"));



CREATE POLICY "service role full access payments" ON "public"."subscription_payments" USING (true) WITH CHECK (true);



CREATE POLICY "service role full access subscriptions" ON "public"."organization_subscriptions" USING (true) WITH CHECK (true);



ALTER TABLE "public"."service_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."services" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."staff" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."staff_absences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."staff_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscription_payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."walkin_daily_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_sessions" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."current_org_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_org_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_org_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "service_role";


















GRANT ALL ON TABLE "public"."appointment_services" TO "anon";
GRANT ALL ON TABLE "public"."appointment_services" TO "authenticated";
GRANT ALL ON TABLE "public"."appointment_services" TO "service_role";



GRANT ALL ON TABLE "public"."appointments" TO "anon";
GRANT ALL ON TABLE "public"."appointments" TO "authenticated";
GRANT ALL ON TABLE "public"."appointments" TO "service_role";



GRANT ALL ON TABLE "public"."clients" TO "anon";
GRANT ALL ON TABLE "public"."clients" TO "authenticated";
GRANT ALL ON TABLE "public"."clients" TO "service_role";



GRANT ALL ON TABLE "public"."organization_settings" TO "anon";
GRANT ALL ON TABLE "public"."organization_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_settings" TO "service_role";



GRANT ALL ON TABLE "public"."organization_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."organization_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."queue" TO "anon";
GRANT ALL ON TABLE "public"."queue" TO "authenticated";
GRANT ALL ON TABLE "public"."queue" TO "service_role";



GRANT ALL ON TABLE "public"."salon_closures" TO "anon";
GRANT ALL ON TABLE "public"."salon_closures" TO "authenticated";
GRANT ALL ON TABLE "public"."salon_closures" TO "service_role";



GRANT ALL ON TABLE "public"."service_categories" TO "anon";
GRANT ALL ON TABLE "public"."service_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."service_categories" TO "service_role";



GRANT ALL ON TABLE "public"."services" TO "anon";
GRANT ALL ON TABLE "public"."services" TO "authenticated";
GRANT ALL ON TABLE "public"."services" TO "service_role";



GRANT ALL ON TABLE "public"."staff" TO "anon";
GRANT ALL ON TABLE "public"."staff" TO "authenticated";
GRANT ALL ON TABLE "public"."staff" TO "service_role";



GRANT ALL ON TABLE "public"."staff_absences" TO "anon";
GRANT ALL ON TABLE "public"."staff_absences" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_absences" TO "service_role";



GRANT ALL ON TABLE "public"."staff_categories" TO "anon";
GRANT ALL ON TABLE "public"."staff_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_categories" TO "service_role";



GRANT ALL ON TABLE "public"."subscription_payments" TO "anon";
GRANT ALL ON TABLE "public"."subscription_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_payments" TO "service_role";



GRANT ALL ON TABLE "public"."walkin_daily_log" TO "anon";
GRANT ALL ON TABLE "public"."walkin_daily_log" TO "authenticated";
GRANT ALL ON TABLE "public"."walkin_daily_log" TO "service_role";



GRANT ALL ON TABLE "public"."walkins" TO "anon";
GRANT ALL ON TABLE "public"."walkins" TO "authenticated";
GRANT ALL ON TABLE "public"."walkins" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_sessions" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_sessions" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































