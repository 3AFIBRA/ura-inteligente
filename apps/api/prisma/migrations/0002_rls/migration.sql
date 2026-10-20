-- Enable RLS em todas as tabelas do tenant
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN (
        'Tenant', 'User', 'RefreshToken', 'Trunk', 'Extension', 'InboundRoute',
        'OutboundRoute', 'Queue', 'QueueMember', 'IvrFlow', 'ErpConnection',
        'WhatsappConnection', 'SpeechConfig', 'Call', 'CallEvent', 'Recording',
        'QueueLog', 'AuditLog', 'WhatsappMessage'
      )
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
  END LOOP;
END $$;

-- Drop existing policies (idempotente)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- Politica padrao: mostra apenas linhas do tenant atual, ou tudo se app.tenant_id nao estiver definida (superadmin)
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN (
        'User', 'Trunk', 'Extension', 'InboundRoute', 'OutboundRoute', 'Queue',
        'IvrFlow', 'ErpConnection', 'WhatsappConnection', 'WhatsappMessage',
        'SpeechConfig', 'Call', 'Recording', 'QueueLog', 'AuditLog'
      )
  LOOP
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (
        COALESCE(current_setting(''app.tenant_id'', true), '''') = ''''
        OR "tenantId"::text = current_setting(''app.tenant_id'', true)
      );',
      t
    );
  END LOOP;
END $$;

-- Tenant: superadmin (sem app.tenant_id) ve tudo; outros veem apenas o proprio tenant
CREATE POLICY tenant_isolation ON "Tenant" USING (
  COALESCE(current_setting('app.tenant_id', true), '') = ''
  OR id::text = current_setting('app.tenant_id', true)
);

-- RefreshToken: o usuario so ve os proprios tokens (sem tenantId)
CREATE POLICY tenant_isolation_refresh ON "RefreshToken" USING (
  "userId"::text = current_setting('app.current_user_id', true)
);

-- Indices para performance do RLS
CREATE INDEX IF NOT EXISTS "idx_call_tenant_startedAt" ON "Call"("tenantId", "startedAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_queueLog_tenant_created" ON "QueueLog"("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_recording_tenant_created" ON "Recording"("tenantId", "createdAt" DESC);
