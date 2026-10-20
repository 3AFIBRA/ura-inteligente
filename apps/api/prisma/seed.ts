import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { env } from '../src/config/env.js';
import { DEFAULT_ISP_FLOW } from '@ura/shared';

const prisma = new PrismaClient();

async function main() {
  const email = env.superadminEmail;
  const password = env.superadminPassword;
  const hash = await bcrypt.hash(password, 10);

  const superadmin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: 'Superadmin', passwordHash: hash, role: 'superadmin' },
  });
  console.log('Superadmin:', superadmin.email);

  const demoTenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    update: {},
    create: { slug: 'demo', name: 'Provedor Demo', locale: 'pt-BR', timezone: 'America/Sao_Paulo' },
  });

  const flow = await prisma.ivrFlow.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      tenantId: demoTenant.id,
      name: 'URA Padrao',
      description: 'Segunda via, cadastro, financeiro e suporte',
      draft: DEFAULT_ISP_FLOW as any,
      published: DEFAULT_ISP_FLOW as any,
      publishedAt: new Date(),
    },
  });

  const exts: Record<string, string> = {};
  for (const [number, name, type] of [
    ['1001', 'Atendimento Geral', 'sip'],
    ['1002', 'Agente WebRTC', 'webrtc'],
    ['1003', 'Suporte WebRTC', 'webrtc'],
  ] as const) {
    const ext = await prisma.extension.upsert({
      where: { tenantId_number: { tenantId: demoTenant.id, number } },
      update: {},
      create: {
        tenantId: demoTenant.id,
        number,
        name,
        type,
        secret: await bcrypt.hash('Demo@123', 10),
      },
    });
    exts[number] = ext.id;
  }

  for (const qname of ['atendimento', 'financeiro', 'suporte']) {
    await prisma.queue.upsert({
      where: { tenantId_name: { tenantId: demoTenant.id, name: qname } },
      update: {},
      create: {
        tenantId: demoTenant.id,
        name: qname,
        strategy: 'rrmemory',
        members: {
          create: qname === 'atendimento'
            ? [{ extensionId: exts['1001'], penalty: 0 }]
            : qname === 'financeiro'
            ? [{ extensionId: exts['1002'], penalty: 0 }]
            : [{ extensionId: exts['1003'], penalty: 0 }],
        },
      },
    });
  }

  await prisma.inboundRoute.upsert({
    where: { id: '00000000-0000-0000-0000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      tenantId: demoTenant.id,
      name: 'Entrada padrao',
      did: '_X.',
      destinationType: 'ivr',
      flowId: flow.id,
    },
  });

  await prisma.speechConfig.upsert({
    where: { tenantId: demoTenant.id },
    update: {},
    create: {
      tenantId: demoTenant.id,
      asrProvider: 'openai',
      ttsProvider: 'openai',
      nluProvider: 'openai',
      ttsVoice: 'nova',
      language: 'pt-BR',
    },
  });

  for (const [email2, name, role, number] of [
    ['admin@demo.local', 'Admin Demo', 'tenant_admin', undefined],
    ['supervisor@demo.local', 'Supervisor Demo', 'supervisor', undefined],
    ['agente@demo.local', 'Agente Demo', 'agent', '1002'],
  ] as const) {
    await prisma.user.upsert({
      where: { email: email2 },
      update: {},
      create: {
        email: email2,
        name,
        passwordHash: await bcrypt.hash('Demo@123', 10),
        role,
        tenantId: demoTenant.id,
        extensionId: number ? exts[number] : undefined,
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
