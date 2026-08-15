import { PrismaClient, Role, AppointmentStatus, AppointmentSource } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { addDays, addHours, setHours, setMinutes, startOfDay } from 'date-fns';

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.salon.findFirst();
  if (existing) {
    console.log('Seed already applied, skipping.');
    return;
  }

  const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'admin@masterofbeauty.ua').toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin123!';
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const workingHours = {
    mon: { open: '09:00', close: '20:00' },
    tue: { open: '09:00', close: '20:00' },
    wed: { open: '09:00', close: '20:00' },
    thu: { open: '09:00', close: '20:00' },
    fri: { open: '09:00', close: '21:00' },
    sat: { open: '10:00', close: '18:00' },
    sun: { open: null, close: null },
  };

  const salon = await prisma.salon.create({
    data: {
      name: 'Master of Beauty',
      address: 'м. Київ, вул. Хрещатик, 15',
      phone: '+380441234567',
      email: 'hello@masterofbeauty.ua',
      currency: 'UAH',
      timezone: 'Europe/Kyiv',
      workingHours,
      autoConfirmOnline: true,
      loyaltyEarnPercent: 5,
      slotStepMin: 15,
      smsProvider: 'MOCK',
      smsEnabled: true,
      liqpayEnabled: false,
      liqpaySandbox: true,
      publicBaseUrl: 'http://localhost',
    },
  });

  const branchMain = await prisma.branch.create({
    data: {
      salonId: salon.id,
      name: 'Master of Beauty — Хрещатик',
      slug: 'khreshchatyk',
      address: 'м. Київ, вул. Хрещатик, 15',
      phone: '+380441234567',
      isDefault: true,
      sortOrder: 0,
      workingHours,
    },
  });

  const branchPodil = await prisma.branch.create({
    data: {
      salonId: salon.id,
      name: 'Master of Beauty — Поділ',
      slug: 'podil',
      address: 'м. Київ, вул. Сагайдачного, 22',
      phone: '+380441234568',
      isDefault: false,
      sortOrder: 1,
      workingHours,
    },
  });

  await prisma.room.createMany({
    data: [
      {
        branchId: branchMain.id,
        name: 'Зал стрижок',
        capacity: 3,
        color: '#C4A484',
        sortOrder: 0,
      },
      {
        branchId: branchMain.id,
        name: 'Кабінет фарбування',
        capacity: 2,
        color: '#A78BFA',
        sortOrder: 1,
      },
      {
        branchId: branchMain.id,
        name: 'Нігтьовий кабінет',
        capacity: 2,
        color: '#F472B6',
        sortOrder: 2,
      },
      {
        branchId: branchMain.id,
        name: 'Масаж / косметологія',
        capacity: 1,
        color: '#34D399',
        sortOrder: 3,
      },
      {
        branchId: branchPodil.id,
        name: 'Поділ — зал 1',
        capacity: 2,
        color: '#60A5FA',
        sortOrder: 0,
      },
    ],
  });

  await prisma.user.create({
    data: {
      email: adminEmail,
      passwordHash,
      firstName: 'Олена',
      lastName: 'Адміністратор',
      phone: '+380501112233',
      role: Role.OWNER,
    },
  });

  const categories = await Promise.all(
    [
      { name: 'Перукарські послуги', slug: 'hair', icon: 'scissors', sortOrder: 1 },
      { name: 'Фарбування', slug: 'coloring', icon: 'palette', sortOrder: 2 },
      { name: 'Нігті', slug: 'nails', icon: 'hand', sortOrder: 3 },
      { name: 'Масаж', slug: 'massage', icon: 'spa', sortOrder: 4 },
      { name: 'Косметологія', slug: 'cosmo', icon: 'sparkles', sortOrder: 5 },
      { name: 'Брови та вії', slug: 'brows', icon: 'eye', sortOrder: 6 },
      { name: 'Макіяж', slug: 'makeup', icon: 'lipstick', sortOrder: 7 },
    ].map((c) => prisma.serviceCategory.create({ data: c })),
  );

  const cat = Object.fromEntries(categories.map((c) => [c.slug, c.id]));

  const serviceDefs = [
    { categoryId: cat.hair, name: 'Жіноча стрижка', durationMin: 60, price: 700 },
    { categoryId: cat.hair, name: 'Чоловіча стрижка', durationMin: 40, price: 450 },
    { categoryId: cat.hair, name: 'Дитяча стрижка', durationMin: 30, price: 350 },
    { categoryId: cat.hair, name: 'Укладка', durationMin: 45, price: 500 },
    { categoryId: cat.hair, name: 'Вечірня зачіска', durationMin: 90, price: 1200 },
    { categoryId: cat.hair, name: 'Кератинове випрямлення', durationMin: 150, price: 2800 },
    { categoryId: cat.coloring, name: 'Фарбування в один тон', durationMin: 120, price: 1800 },
    { categoryId: cat.coloring, name: 'Мелірування', durationMin: 150, price: 2200 },
    { categoryId: cat.coloring, name: 'Балаяж / Airtouch', durationMin: 180, price: 3500 },
    { categoryId: cat.coloring, name: 'Тонування', durationMin: 60, price: 900 },
    { categoryId: cat.coloring, name: 'Освітлення коренів', durationMin: 90, price: 1500 },
    { categoryId: cat.nails, name: 'Манікюр класичний', durationMin: 60, price: 450 },
    { categoryId: cat.nails, name: 'Манікюр з покриттям гель-лак', durationMin: 90, price: 650 },
    { categoryId: cat.nails, name: 'Нарощування нігтів', durationMin: 120, price: 1100 },
    { categoryId: cat.nails, name: 'Педикюр класичний', durationMin: 75, price: 700 },
    { categoryId: cat.nails, name: 'Педикюр з покриттям', durationMin: 90, price: 850 },
    { categoryId: cat.massage, name: 'Класичний масаж тіла (60 хв)', durationMin: 60, price: 900 },
    { categoryId: cat.massage, name: 'Антицелюлітний масаж', durationMin: 60, price: 1000 },
    { categoryId: cat.massage, name: 'Масаж обличчя', durationMin: 40, price: 700 },
    { categoryId: cat.massage, name: 'Релакс-масаж (90 хв)', durationMin: 90, price: 1300 },
    { categoryId: cat.cosmo, name: 'Чистка обличчя', durationMin: 75, price: 1100 },
    { categoryId: cat.cosmo, name: 'Пілінг', durationMin: 50, price: 950 },
    { categoryId: cat.cosmo, name: 'Доглядова процедура', durationMin: 60, price: 1200 },
    { categoryId: cat.brows, name: 'Корекція брів', durationMin: 30, price: 300 },
    { categoryId: cat.brows, name: 'Фарбування брів', durationMin: 30, price: 350 },
    { categoryId: cat.brows, name: 'Ламінування вій', durationMin: 60, price: 750 },
    { categoryId: cat.brows, name: 'Нарощування вій', durationMin: 120, price: 900 },
    { categoryId: cat.makeup, name: 'Денний макіяж', durationMin: 45, price: 800 },
    { categoryId: cat.makeup, name: 'Вечірній макіяж', durationMin: 60, price: 1200 },
    { categoryId: cat.makeup, name: 'Весільний макіяж', durationMin: 90, price: 2000 },
  ];

  const services = [];
  for (let i = 0; i < serviceDefs.length; i++) {
    const s = await prisma.service.create({
      data: { ...serviceDefs[i], sortOrder: i, bufferMin: 0 },
    });
    services.push(s);
  }

  const staffDefs = [
    {
      email: 'maria@masterofbeauty.ua',
      firstName: 'Марія',
      lastName: 'Коваленко',
      displayName: 'Марія К.',
      color: '#C4787A',
      specializations: ['Стрижки', 'Укладки'],
      serviceSlugs: ['hair'],
    },
    {
      email: 'iryna@masterofbeauty.ua',
      firstName: 'Ірина',
      lastName: 'Шевченко',
      displayName: 'Ірина Ш.',
      color: '#8B6F9E',
      specializations: ['Фарбування', 'Балаяж'],
      serviceSlugs: ['coloring', 'hair'],
    },
    {
      email: 'olga@masterofbeauty.ua',
      firstName: 'Ольга',
      lastName: 'Мельник',
      displayName: 'Ольга М.',
      color: '#E8A0BF',
      specializations: ['Манікюр', 'Педикюр'],
      serviceSlugs: ['nails'],
    },
    {
      email: 'andriy@masterofbeauty.ua',
      firstName: 'Андрій',
      lastName: 'Бондар',
      displayName: 'Андрій Б.',
      color: '#6B8E7F',
      specializations: ['Масаж'],
      serviceSlugs: ['massage'],
    },
    {
      email: 'sofia@masterofbeauty.ua',
      firstName: 'Софія',
      lastName: 'Лисенко',
      displayName: 'Софія Л.',
      color: '#D4A574',
      specializations: ['Косметологія', 'Брови'],
      serviceSlugs: ['cosmo', 'brows'],
    },
  ];

  const masterHash = await bcrypt.hash('Master123!', 10);
  const staffProfiles = [];

  for (let i = 0; i < staffDefs.length; i++) {
    const def = staffDefs[i];
    const catIds = def.serviceSlugs.map((s) => cat[s]);
    const serviceIds = services.filter((s) => catIds.includes(s.categoryId)).map((s) => s.id);

    const user = await prisma.user.create({
      data: {
        email: def.email,
        passwordHash: masterHash,
        firstName: def.firstName,
        lastName: def.lastName,
        role: Role.MASTER,
        staffProfile: {
          create: {
            branchId: i % 2 === 0 ? branchMain.id : branchPodil.id,
            displayName: def.displayName,
            color: def.color,
            specializations: def.specializations,
            commissionPct: 40,
            sortOrder: i,
            schedules: {
              create: [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
                dayOfWeek,
                startTime: dayOfWeek === 6 ? '10:00' : '09:00',
                endTime: dayOfWeek === 6 ? '18:00' : '19:00',
                breakStart: '13:00',
                breakEnd: '14:00',
              })),
            },
            services: {
              create: serviceIds.map((serviceId) => ({ serviceId })),
            },
          },
        },
      },
      include: { staffProfile: true },
    });
    staffProfiles.push(user.staffProfile!);
  }

  await prisma.user.create({
    data: {
      email: 'reception@masterofbeauty.ua',
      passwordHash: await bcrypt.hash('Reception123!', 10),
      firstName: 'Наталія',
      lastName: 'Рецепція',
      role: Role.RECEPTION,
    },
  });

  const clientNames = [
    ['Анна', 'Петренко', '+380671111001'],
    ['Оксана', 'Іваненко', '+380671111002'],
    ['Юлія', 'Ткаченко', '+380671111003'],
    ['Катерина', 'Бондаренко', '+380671111004'],
    ['Вікторія', 'Кравченко', '+380671111005'],
    ['Дмитро', 'Сидоренко', '+380671111006'],
    ['Назар', 'Гриценко', '+380671111007'],
    ['Марина', 'Романенко', '+380671111008'],
    ['Тетяна', 'Савченко', '+380671111009'],
    ['Олена', 'Данилюк', '+380671111010'],
  ];

  const clients = [];
  for (const [firstName, lastName, phone] of clientNames) {
    const c = await prisma.client.create({
      data: {
        firstName,
        lastName,
        phone,
        source: 'SEED',
        tags: ['постійний'],
        loyalty: { create: { pointsBalance: 150, tier: 'BRONZE' } },
      },
    });
    clients.push(c);
  }

  const productCat = await prisma.productCategory.create({
    data: { name: 'Професійна косметика', sortOrder: 1 },
  });
  await prisma.productCategory.create({ data: { name: 'Нігтьова продукція', sortOrder: 2 } });

  await prisma.product.createMany({
    data: [
      {
        categoryId: productCat.id,
        name: 'Фарба для волосся 6.0',
        brand: 'Loreal Pro',
        sku: 'COL-60',
        stockQty: 24,
        minStock: 5,
        costPrice: 280,
        salePrice: 450,
      },
      {
        categoryId: productCat.id,
        name: 'Оксид 6%',
        brand: 'Loreal Pro',
        sku: 'OX-6',
        stockQty: 18,
        minStock: 4,
        costPrice: 180,
        salePrice: 300,
      },
      {
        categoryId: productCat.id,
        name: 'Шампунь професійний 1л',
        brand: 'Kerastase',
        sku: 'SH-1L',
        stockQty: 8,
        minStock: 3,
        costPrice: 650,
        salePrice: 1100,
      },
      {
        name: 'Гель-лак Classic Nude',
        brand: 'Gelish',
        sku: 'GL-NUD',
        stockQty: 12,
        minStock: 4,
        costPrice: 220,
        salePrice: 380,
      },
      {
        name: 'Олія для кутикули',
        brand: 'OPI',
        sku: 'OIL-01',
        stockQty: 3,
        minStock: 5,
        costPrice: 90,
        salePrice: 180,
      },
      {
        name: 'Масажна олія 500мл',
        brand: 'Thalgo',
        sku: 'MS-500',
        stockQty: 6,
        minStock: 2,
        costPrice: 400,
        salePrice: 750,
      },
    ],
  });

  await prisma.servicePackageTemplate.create({
    data: {
      name: 'Абонемент масаж 5 сеансів',
      serviceId: services.find((s) => s.name.includes('Класичний масаж'))?.id,
      sessionsTotal: 5,
      price: 4000,
      validityDays: 90,
    },
  });

  // Appointments for current week
  const today = startOfDay(new Date());
  const samples = [
    { dayOffset: 0, hour: 10, staff: 0, client: 0, serviceIdx: 0 },
    { dayOffset: 0, hour: 12, staff: 2, client: 1, serviceIdx: 11 },
    { dayOffset: 0, hour: 15, staff: 1, client: 2, serviceIdx: 6 },
    { dayOffset: 1, hour: 11, staff: 3, client: 3, serviceIdx: 16 },
    { dayOffset: 1, hour: 14, staff: 4, client: 4, serviceIdx: 20 },
    { dayOffset: 2, hour: 10, staff: 0, client: 5, serviceIdx: 1 },
    { dayOffset: 2, hour: 16, staff: 2, client: 6, serviceIdx: 12 },
  ];

  for (const sample of samples) {
    const service = services[sample.serviceIdx];
    const startAt = setMinutes(setHours(addDays(today, sample.dayOffset), sample.hour), 0);
    const endAt = addHours(startAt, Math.ceil(service.durationMin / 60) || 1);
    await prisma.appointment.create({
      data: {
        clientId: clients[sample.client].id,
        staffId: staffProfiles[sample.staff].id,
        startAt,
        endAt: new Date(startAt.getTime() + service.durationMin * 60000),
        status: sample.dayOffset === 0 && sample.hour < new Date().getHours()
          ? AppointmentStatus.COMPLETED
          : AppointmentStatus.CONFIRMED,
        source: AppointmentSource.ADMIN,
        services: {
          create: {
            serviceId: service.id,
            nameSnapshot: service.name,
            priceSnapshot: service.price,
            durationSnapshot: service.durationMin,
          },
        },
      },
    });
  }

  console.log('✅ Seed complete');
  console.log(`   Salon: ${salon.name}`);
  console.log(`   Admin: ${adminEmail} / ${adminPassword}`);
  console.log('   Masters password: Master123!');
  console.log('   Reception: reception@masterofbeauty.ua / Reception123!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
