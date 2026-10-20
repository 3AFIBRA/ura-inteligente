-- Enable RLS em todas as tabelas com tenant_id
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
        'Tenant', 'User', 'RefreshToken', 'Trunk', 'Extension', 'InboundRoute',
        'OutboundRoute', 'Queue', 'QueueMember', 'IvrFlow', 'ErpConnection',
        'WhatsappConnection', 'SpeechConfig', 'Call', 'CallEvent', 'Recording',
        'QueueLog', 'AuditLog', 'WhatsappMessage'
      )
  LOOP
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (
        COALESCE(current_setting(''app.tenant_id'', true), '''') = ''''
        OR tenant_id::text = current_setting(''app.tenant_id'', true)
      );',
      t
    );
  END LOOP;
END $$;

-- Tenant isolada: superadmin pode ver tudo; tenant_admin/supervisor/agent veem apenas seu tenant
ALTER POLICY tenant_isolation ON "Tenant" USING (
  COALESCE(current_setting('app.tenant_id', true), '') = ''
  OR id::text = current_setting('app.tenant_id', true)
);

-- RefreshToken: o usuario so ve os proprios; nao precisa de tenant_id isolada
DROP POLICY IF EXISTS tenant_isolation ON "RefreshToken";
CREATE POLICY tenant_isolation_refresh ON "RefreshToken" USING (
  user_id::text = current_setting('app.current_user_id', true)
);

-- AuditLog: acessivel ao tenant; superadmin ve tudo (inclusive tenantId null)
DROP POLICY IF EXISTS tenant_isolation ON "AuditLog";
CREATE POLICY tenant_isolation_audit ON "AuditLog" USING (
  COALESCE(current_setting('app.tenant_id', true), '') = ''
  OR tenant_id::text = current_setting('app.tenant_id', true)
);

-- User: nao pode ver o proprio superadmin (tenantId null) a menos que seja superadmin
DROP POLICY IF EXISTS tenant_isolation ON "User";
CREATE POLICY tenant_isolation_user ON "User" USING (
  COALESCE(current_setting('app.tenant_id', true), '') = ''
  OR tenant_id::text = current_setting('app.tenant_id', true)
);

-- Indices para performance do RLS
CREATE INDEX IF NOT EXISTS "idx_call_tenant_startedAt" ON "Call"("tenantId", "startedAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_queueLog_tenant_created" ON "QueueLog"("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_recording_tenant_created" ON "Recording"("tenantId", "createdAt" DESC);
