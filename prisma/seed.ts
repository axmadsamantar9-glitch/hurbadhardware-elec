/**
 * Database seed (U2).
 *
 * Run with `npm run db:seed` (wired to `tsx prisma/seed.ts` via the `prisma`
 * key in package.json). Requires DATABASE_URL to point at a live database.
 *
 * The seed is idempotent: every write is an `upsert` keyed on a natural key
 * (category/product slug, user email, coupon code, image position), so running
 * it repeatedly converges on the same rows instead of duplicating them.
 *
 * Prices are written as strings, never JS numbers, so no value ever passes
 * through a float on its way into a Decimal column.
 */

import { PrismaClient, CouponType, Locale, Role } from '@prisma/client'
import { hashSync } from 'bcryptjs'

const prisma = new PrismaClient()

const ADMIN_EMAIL = 'admin@hurbad.com'
/** Development-only default. Rotate immediately in any real environment. */
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!'

type SeedProduct = {
  nameEn: string
  nameSo: string
  brand: string
  priceUsd: string
  stock: number
  descriptionEn: string
  descriptionSo: string
}

type SeedCategory = {
  nameEn: string
  nameSo: string
  slug: string
  skuPrefix: string
  products: SeedProduct[]
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const CATEGORIES: SeedCategory[] = [
  {
    nameEn: 'Smartphones',
    nameSo: 'Taleefannada Casriga ah',
    slug: 'smartphones',
    skuPrefix: 'SMP',
    products: [
      {
        nameEn: 'Samsung Galaxy A55 5G 128GB',
        nameSo: 'Samsung Galaxy A55 5G 128GB',
        brand: 'Samsung',
        priceUsd: '349.00',
        stock: 24,
        descriptionEn:
          '6.6-inch Super AMOLED display, 50MP main camera and a 5000mAh battery that lasts a full working day.',
        descriptionSo:
          'Shaashad Super AMOLED ah oo 6.6 inji ah, kaamiro 50MP ah iyo baytari 5000mAh oo maalin shaqo oo dhan kaa dhaafaya.',
      },
      {
        nameEn: 'Apple iPhone 15 128GB',
        nameSo: 'Apple iPhone 15 128GB',
        brand: 'Apple',
        priceUsd: '799.00',
        stock: 12,
        descriptionEn:
          'A16 Bionic chip, 48MP main camera and USB-C charging in a durable aluminium frame.',
        descriptionSo:
          'Chip A16 Bionic ah, kaamiro weyn oo 48MP ah iyo dallac USB-C ah oo ku dhex jira jir aluminium adag.',
      },
      {
        nameEn: 'Xiaomi Redmi Note 13 256GB',
        nameSo: 'Xiaomi Redmi Note 13 256GB',
        brand: 'Xiaomi',
        priceUsd: '229.00',
        stock: 40,
        descriptionEn:
          'Large 120Hz AMOLED screen and 33W fast charging at an entry-level price.',
        descriptionSo:
          'Shaashad AMOLED weyn oo 120Hz ah iyo dallac degdeg ah oo 33W ah qiimo jaban.',
      },
      {
        nameEn: 'Tecno Camon 30 256GB',
        nameSo: 'Tecno Camon 30 256GB',
        brand: 'Tecno',
        priceUsd: '199.00',
        stock: 35,
        descriptionEn:
          'Dual-SIM handset tuned for African networks, with a 50MP selfie camera.',
        descriptionSo:
          'Taleefan laba SIM ah oo loo habeeyay shabakadaha Afrika, leh kaamiro selfie 50MP ah.',
      },
      {
        nameEn: 'Infinix Note 40 Pro 256GB',
        nameSo: 'Infinix Note 40 Pro 256GB',
        brand: 'Infinix',
        priceUsd: '249.00',
        stock: 28,
        descriptionEn:
          '45W wired and 20W wireless charging with a 108MP stabilised camera.',
        descriptionSo:
          'Dallac 45W fiilo ah iyo 20W fiilo la’aan ah, leh kaamiro 108MP ah oo deggan.',
      },
    ],
  },
  {
    nameEn: 'Laptops',
    nameSo: 'Kombiyuutarrada Laptop-ka',
    slug: 'laptops',
    skuPrefix: 'LAP',
    products: [
      {
        nameEn: 'HP ProBook 450 G10 Core i5 16GB',
        nameSo: 'HP ProBook 450 G10 Core i5 16GB',
        brand: 'HP',
        priceUsd: '899.00',
        stock: 15,
        descriptionEn:
          '15.6-inch business laptop with 13th-gen Core i5, 16GB RAM and a 512GB NVMe SSD.',
        descriptionSo:
          'Laptop ganacsi oo 15.6 inji ah, leh Core i5 jiil 13-aad, 16GB RAM iyo 512GB NVMe SSD.',
      },
      {
        nameEn: 'Dell Latitude 5440 Core i7 16GB',
        nameSo: 'Dell Latitude 5440 Core i7 16GB',
        brand: 'Dell',
        priceUsd: '1149.00',
        stock: 9,
        descriptionEn:
          'Durable magnesium chassis, spill-resistant keyboard and full-day battery life.',
        descriptionSo:
          'Jir magnesium adag, kiiboodh biyo iska celiya iyo baytari maalin dhan socda.',
      },
      {
        nameEn: 'Lenovo ThinkPad E14 Gen 5 Ryzen 5',
        nameSo: 'Lenovo ThinkPad E14 Gen 5 Ryzen 5',
        brand: 'Lenovo',
        priceUsd: '799.00',
        stock: 18,
        descriptionEn:
          'Ryzen 5 performance, legendary ThinkPad keyboard and a fingerprint reader.',
        descriptionSo:
          'Awood Ryzen 5, kiiboodhka caanka ah ee ThinkPad iyo akhriste farageliska.',
      },
      {
        nameEn: 'Apple MacBook Air 13 M3 8GB 256GB',
        nameSo: 'Apple MacBook Air 13 M3 8GB 256GB',
        brand: 'Apple',
        priceUsd: '1099.00',
        stock: 7,
        descriptionEn:
          'Fanless M3 chip, 18-hour battery and a 13.6-inch Liquid Retina display.',
        descriptionSo:
          'Chip M3 oo marawaxadla’aan ah, baytari 18 saacadood iyo shaashad Liquid Retina 13.6 inji ah.',
      },
      {
        nameEn: 'Asus VivoBook 15 Core i3 8GB',
        nameSo: 'Asus VivoBook 15 Core i3 8GB',
        brand: 'Asus',
        priceUsd: '499.00',
        stock: 22,
        descriptionEn:
          'Affordable everyday laptop for study and office work, with a 512GB SSD.',
        descriptionSo:
          'Laptop qiimo jaban oo waxbarasho iyo shaqo xafiis ku habboon, leh 512GB SSD.',
      },
    ],
  },
  {
    nameEn: 'Tablets',
    nameSo: 'Tabletyada',
    slug: 'tablets',
    skuPrefix: 'TAB',
    products: [
      {
        nameEn: 'Apple iPad 10th Gen 64GB Wi-Fi',
        nameSo: 'Apple iPad Jiilka 10-aad 64GB Wi-Fi',
        brand: 'Apple',
        priceUsd: '399.00',
        stock: 14,
        descriptionEn:
          '10.9-inch Liquid Retina display with the A14 Bionic chip and USB-C.',
        descriptionSo:
          'Shaashad Liquid Retina 10.9 inji ah, chip A14 Bionic ah iyo USB-C.',
      },
      {
        nameEn: 'Samsung Galaxy Tab S9 FE 128GB',
        nameSo: 'Samsung Galaxy Tab S9 FE 128GB',
        brand: 'Samsung',
        priceUsd: '449.00',
        stock: 11,
        descriptionEn:
          'Water-resistant tablet that ships with the S Pen included.',
        descriptionSo:
          'Tablet biyo iska celiya oo la yimaada qalinka S Pen.',
      },
      {
        nameEn: 'Lenovo Tab M11 128GB',
        nameSo: 'Lenovo Tab M11 128GB',
        brand: 'Lenovo',
        priceUsd: '229.00',
        stock: 26,
        descriptionEn:
          '11-inch 90Hz screen with quad speakers, built for family media use.',
        descriptionSo:
          'Shaashad 11 inji ah oo 90Hz ah, afar sameecadood, oo qoyska ku habboon.',
      },
      {
        nameEn: 'Xiaomi Pad 6 256GB',
        nameSo: 'Xiaomi Pad 6 256GB',
        brand: 'Xiaomi',
        priceUsd: '349.00',
        stock: 16,
        descriptionEn:
          'Snapdragon 870 with a 144Hz display for gaming and video.',
        descriptionSo:
          'Snapdragon 870 leh shaashad 144Hz ah oo ciyaaraha iyo muuqaalka ku fiican.',
      },
      {
        nameEn: 'Amazon Fire HD 10 64GB',
        nameSo: 'Amazon Fire HD 10 64GB',
        brand: 'Amazon',
        priceUsd: '149.00',
        stock: 30,
        descriptionEn:
          'Budget 10-inch tablet for reading, streaming and light browsing.',
        descriptionSo:
          'Tablet 10 inji ah oo qiimo jaban, akhris, daawasho iyo raadin fudud.',
      },
    ],
  },
  {
    nameEn: 'Accessories',
    nameSo: 'Qalabka Dheeraadka ah',
    slug: 'accessories',
    skuPrefix: 'ACC',
    products: [
      {
        nameEn: 'Anker PowerCore 20000mAh Power Bank',
        nameSo: 'Anker PowerCore 20000mAh Baytari Gurguurad ah',
        brand: 'Anker',
        priceUsd: '59.00',
        stock: 60,
        descriptionEn:
          'Charges a phone four times over, with 20W USB-C power delivery.',
        descriptionSo:
          'Afar jeer ayuu taleefan dallici karaa, leh 20W USB-C.',
      },
      {
        nameEn: 'Logitech MX Master 3S Wireless Mouse',
        nameSo: 'Logitech MX Master 3S Mouse Fiilo La’aan ah',
        brand: 'Logitech',
        priceUsd: '99.00',
        stock: 32,
        descriptionEn:
          'Near-silent clicks, 8K DPI tracking and multi-device switching.',
        descriptionSo:
          'Riix aad u aamusan, tracking 8K DPI ah iyo u beddelasho qalab badan.',
      },
      {
        nameEn: 'JBL Tune 770NC Wireless Headphones',
        nameSo: 'JBL Tune 770NC Dhegaha Fiilo La’aan ah',
        brand: 'JBL',
        priceUsd: '129.00',
        stock: 25,
        descriptionEn:
          'Adaptive noise cancelling with up to 70 hours of playback.',
        descriptionSo:
          'Buuq joojin isbeddelaysa iyo ilaa 70 saacadood oo dhageysi ah.',
      },
      {
        nameEn: 'UGREEN 100W USB-C GaN Charger',
        nameSo: 'UGREEN 100W USB-C GaN Dallaciye',
        brand: 'UGREEN',
        priceUsd: '49.00',
        stock: 45,
        descriptionEn:
          'Four ports and enough power to charge a laptop and two phones at once.',
        descriptionSo:
          'Afar afaaf iyo awood ku filan in laptop iyo laba taleefan hal mar la dallaco.',
      },
      {
        nameEn: 'SanDisk Ultra 128GB microSD Card',
        nameSo: 'SanDisk Ultra 128GB Kaarka microSD',
        brand: 'SanDisk',
        priceUsd: '19.00',
        stock: 80,
        descriptionEn:
          'A1-rated card with 140MB/s reads for phones, cameras and dash cams.',
        descriptionSo:
          'Kaar A1 ah oo 140MB/s akhrinaya, taleefanno, kaamirooyin iyo dash cam.',
      },
    ],
  },
  {
    nameEn: 'Networking Equipment',
    nameSo: 'Qalabka Shabakadda',
    slug: 'networking-equipment',
    skuPrefix: 'NET',
    products: [
      {
        nameEn: 'TP-Link Archer AX55 Wi-Fi 6 Router',
        nameSo: 'TP-Link Archer AX55 Router Wi-Fi 6 ah',
        brand: 'TP-Link',
        priceUsd: '99.00',
        stock: 30,
        descriptionEn:
          'AX3000 dual-band router covering a medium home or small office.',
        descriptionSo:
          'Router AX3000 laba-band ah oo daboolaya guri dhexdhexaad ah ama xafiis yar.',
      },
      {
        nameEn: 'Ubiquiti UniFi U6 Lite Access Point',
        nameSo: 'Ubiquiti UniFi U6 Lite Barta Gelitaanka',
        brand: 'Ubiquiti',
        priceUsd: '109.00',
        stock: 20,
        descriptionEn:
          'Ceiling-mounted Wi-Fi 6 access point with PoE and central management.',
        descriptionSo:
          'Barta gelitaanka Wi-Fi 6 saqafka lagu dhejiyo, leh PoE iyo maamul dhexe.',
      },
      {
        nameEn: 'Mikrotik hEX RB750Gr3 Router',
        nameSo: 'Mikrotik hEX RB750Gr3 Router',
        brand: 'Mikrotik',
        priceUsd: '69.00',
        stock: 24,
        descriptionEn:
          'Five-port gigabit router running RouterOS, popular with local ISPs.',
        descriptionSo:
          'Router shan afaaf gigabit ah oo RouterOS ku shaqeeya, ISP-yada maxalliga ah caan ku ah.',
      },
      {
        nameEn: 'TP-Link 8-Port Gigabit Switch',
        nameSo: 'TP-Link Switch 8-Afaaf Gigabit ah',
        brand: 'TP-Link',
        priceUsd: '29.00',
        stock: 50,
        descriptionEn:
          'Unmanaged metal-cased switch for expanding a wired office network.',
        descriptionSo:
          'Switch bir ah oo aan maamul u baahnayn, shabakad xafiis fiilo ah lagu ballaadhiyo.',
      },
      {
        nameEn: 'Cat6 Outdoor Ethernet Cable 305m Box',
        nameSo: 'Fiilada Ethernet Cat6 Banaanka 305m Sanduuq',
        brand: 'Generic',
        priceUsd: '139.00',
        stock: 18,
        descriptionEn:
          'UV-resistant solid copper cable for outdoor runs between buildings.',
        descriptionSo:
          'Fiilo naxaas adag oo qorraxda iska celisa, dhismayaasha dhexdooda banaanka loo mariyo.',
      },
    ],
  },
  {
    nameEn: 'CCTV Systems',
    nameSo: 'Nidaamyada Kaamirada Ammaanka',
    slug: 'cctv-systems',
    skuPrefix: 'CCT',
    products: [
      {
        nameEn: 'Hikvision 4MP ColorVu Dome Camera',
        nameSo: 'Hikvision 4MP ColorVu Kaamirad Dome ah',
        brand: 'Hikvision',
        priceUsd: '89.00',
        stock: 40,
        descriptionEn:
          'Full-colour night imaging with a built-in microphone and IP67 rating.',
        descriptionSo:
          'Sawir habeen oo midab buuxa leh, maykarafoon ku dhex jira iyo heer IP67.',
      },
      {
        nameEn: 'Dahua 8-Channel 4K NVR 2TB',
        nameSo: 'Dahua NVR 8-Kanaal 4K ah 2TB',
        brand: 'Dahua',
        priceUsd: '279.00',
        stock: 12,
        descriptionEn:
          'Eight PoE ports, 4K recording and a pre-installed 2TB surveillance drive.',
        descriptionSo:
          'Siddeed afaaf PoE ah, duubis 4K ah iyo diskka 2TB ee ilaalada oo horay loo rakibay.',
      },
      {
        nameEn: 'Hikvision 4-Camera PoE Kit',
        nameSo: 'Hikvision Xirmo 4-Kaamirad PoE ah',
        brand: 'Hikvision',
        priceUsd: '499.00',
        stock: 10,
        descriptionEn:
          'Complete shop kit: four 4MP cameras, NVR, cabling and connectors.',
        descriptionSo:
          'Xirmo dukaan oo dhamaystiran: afar kaamirad 4MP ah, NVR, fiilooyin iyo isku xirayaal.',
      },
      {
        nameEn: 'Ezviz C6N Indoor Pan/Tilt Camera',
        nameSo: 'Ezviz C6N Kaamirad Gudaha Wareegta',
        brand: 'Ezviz',
        priceUsd: '39.00',
        stock: 55,
        descriptionEn:
          '360-degree Wi-Fi camera with motion tracking and two-way audio.',
        descriptionSo:
          'Kaamirad Wi-Fi ah oo 360 darajo wareegta, raadraaca dhaqdhaqaaqa iyo hadal laba dhinac ah.',
      },
      {
        nameEn: 'Seagate SkyHawk 4TB Surveillance HDD',
        nameSo: 'Seagate SkyHawk 4TB Diskka Ilaalada',
        brand: 'Seagate',
        priceUsd: '119.00',
        stock: 20,
        descriptionEn:
          'Drive rated for 24/7 video writing, tuned for multi-camera NVRs.',
        descriptionSo:
          'Disk loogu talagalay duubis 24/7 ah, oo NVR kaamiro badan leh ku habboon.',
      },
    ],
  },
  {
    nameEn: 'Printers',
    nameSo: 'Daabacayaasha',
    slug: 'printers',
    skuPrefix: 'PRN',
    products: [
      {
        nameEn: 'HP LaserJet Pro M404dn Printer',
        nameSo: 'HP LaserJet Pro M404dn Daabace',
        brand: 'HP',
        priceUsd: '319.00',
        stock: 14,
        descriptionEn:
          'Mono laser printer, 38 pages per minute with automatic duplexing.',
        descriptionSo:
          'Daabace laser madow, 38 bog daqiiqadii, leh daabacaad labada dhinac oo tooska ah.',
      },
      {
        nameEn: 'Epson EcoTank L3250 All-in-One',
        nameSo: 'Epson EcoTank L3250 Isku-dhan',
        brand: 'Epson',
        priceUsd: '229.00',
        stock: 21,
        descriptionEn:
          'Refillable ink tanks cut running costs; prints, scans and copies over Wi-Fi.',
        descriptionSo:
          'Haamaha khadka dib loo buuxin karo oo kharashka dhimaya; daabacaad, iskaan iyo koobiyayn Wi-Fi.',
      },
      {
        nameEn: 'Canon imageCLASS MF445dw',
        nameSo: 'Canon imageCLASS MF445dw',
        brand: 'Canon',
        priceUsd: '429.00',
        stock: 8,
        descriptionEn:
          'Office multifunction laser with a 50-sheet document feeder and fax.',
        descriptionSo:
          'Laser xafiis oo shaqooyin badan leh, quusiye 50 warqadood iyo faakis.',
      },
      {
        nameEn: 'Brother DCP-T720DW Ink Tank',
        nameSo: 'Brother DCP-T720DW Haanta Khadka',
        brand: 'Brother',
        priceUsd: '259.00',
        stock: 16,
        descriptionEn:
          'High-yield colour ink tank printer with duplex printing and Wi-Fi.',
        descriptionSo:
          'Daabace haan khad midab ah oo wax badan daabaca, leh daabacaad labada dhinac iyo Wi-Fi.',
      },
      {
        nameEn: 'Xprinter XP-58IIH Thermal Receipt Printer',
        nameSo: 'Xprinter XP-58IIH Daabacaha Rasiidhka Kulaylka',
        brand: 'Xprinter',
        priceUsd: '49.00',
        stock: 42,
        descriptionEn:
          '58mm USB thermal printer for shop receipts; no ink cartridges needed.',
        descriptionSo:
          'Daabace kulayl 58mm USB ah oo rasiidh dukaan loogu talagalay; khad looma baahna.',
      },
    ],
  },
  {
    nameEn: 'Computer Components',
    nameSo: 'Qaybaha Kombiyuutarka',
    slug: 'computer-components',
    skuPrefix: 'CMP',
    products: [
      {
        nameEn: 'Kingston FURY 16GB DDR4 3200MHz',
        nameSo: 'Kingston FURY 16GB DDR4 3200MHz',
        brand: 'Kingston',
        priceUsd: '59.00',
        stock: 48,
        descriptionEn:
          'Desktop memory module with an aluminium heat spreader and XMP profiles.',
        descriptionSo:
          'Xusuusta desktop leh faafiye kulayl aluminium ah iyo astaamo XMP.',
      },
      {
        nameEn: 'Samsung 980 NVMe SSD 1TB',
        nameSo: 'Samsung 980 NVMe SSD 1TB',
        brand: 'Samsung',
        priceUsd: '89.00',
        stock: 38,
        descriptionEn:
          'PCIe 3.0 drive reaching 3500MB/s reads — the fastest single upgrade for an old PC.',
        descriptionSo:
          'Disk PCIe 3.0 ah oo gaadhaya 3500MB/s akhris — cusboonaysiinta ugu dheereysa PC duugoobay.',
      },
      {
        nameEn: 'AMD Ryzen 5 5600 Processor',
        nameSo: 'AMD Ryzen 5 5600 Barnaamij-socodsiiye',
        brand: 'AMD',
        priceUsd: '139.00',
        stock: 19,
        descriptionEn:
          'Six cores and twelve threads on socket AM4, cooler included.',
        descriptionSo:
          'Lix xudun iyo laba iyo toban dun oo socket AM4 ah, qaboojiye la socda.',
      },
      {
        nameEn: 'Gigabyte B550M DS3H Motherboard',
        nameSo: 'Gigabyte B550M DS3H Looxa Hooyada',
        brand: 'Gigabyte',
        priceUsd: '109.00',
        stock: 17,
        descriptionEn:
          'Micro-ATX AM4 board with PCIe 4.0, dual M.2 slots and USB 3.2.',
        descriptionSo:
          'Loox Micro-ATX AM4 ah oo leh PCIe 4.0, laba god M.2 iyo USB 3.2.',
      },
      {
        nameEn: 'Corsair CV650 650W 80+ Bronze PSU',
        nameSo: 'Corsair CV650 650W 80+ Bronze Korontada',
        brand: 'Corsair',
        priceUsd: '69.00',
        stock: 23,
        descriptionEn:
          'Quiet 650W power supply with 80 PLUS Bronze efficiency and a 3-year warranty.',
        descriptionSo:
          'Sahayda koronto 650W ah oo aamusan, waxtar 80 PLUS Bronze ah iyo damaanad 3 sano ah.',
      },
    ],
  },
]

async function seedCategoriesAndProducts(): Promise<void> {
  for (const [categoryIndex, category] of CATEGORIES.entries()) {
    const categoryRow = await prisma.category.upsert({
      where: { slug: category.slug },
      update: {
        nameEn: category.nameEn,
        nameSo: category.nameSo,
        sortOrder: categoryIndex,
        isActive: true,
      },
      create: {
        nameEn: category.nameEn,
        nameSo: category.nameSo,
        slug: category.slug,
        sortOrder: categoryIndex,
        imageUrl: `/images/categories/${category.slug}.jpg`,
      },
    })

    for (const [productIndex, product] of category.products.entries()) {
      const slug = slugify(product.nameEn)
      const sku = `${category.skuPrefix}-${String(productIndex + 1).padStart(3, '0')}`

      const productRow = await prisma.product.upsert({
        where: { slug },
        update: {
          nameEn: product.nameEn,
          nameSo: product.nameSo,
          descriptionEn: product.descriptionEn,
          descriptionSo: product.descriptionSo,
          brand: product.brand,
          sku,
          basePriceUsd: product.priceUsd,
          stockQuantity: product.stock,
          categoryId: categoryRow.id,
          isActive: true,
          // Feature the first product of each category on the home page.
          isFeatured: productIndex === 0,
        },
        create: {
          nameEn: product.nameEn,
          nameSo: product.nameSo,
          slug,
          descriptionEn: product.descriptionEn,
          descriptionSo: product.descriptionSo,
          brand: product.brand,
          sku,
          basePriceUsd: product.priceUsd,
          stockQuantity: product.stock,
          categoryId: categoryRow.id,
          isFeatured: productIndex === 0,
        },
      })

      for (let position = 0; position < 2; position++) {
        await prisma.productImage.upsert({
          where: {
            productId_position: { productId: productRow.id, position },
          },
          update: {
            url: `/images/products/${slug}-${position + 1}.jpg`,
            altEn: `${product.nameEn} — view ${position + 1}`,
            altSo: `${product.nameSo} — muuqaal ${position + 1}`,
            isPrimary: position === 0,
          },
          create: {
            productId: productRow.id,
            url: `/images/products/${slug}-${position + 1}.jpg`,
            altEn: `${product.nameEn} — view ${position + 1}`,
            altSo: `${product.nameSo} — muuqaal ${position + 1}`,
            position,
            isPrimary: position === 0,
          },
        })
      }
    }
  }
}

async function seedAdminUser(): Promise<void> {
  const passwordHash = hashSync(ADMIN_PASSWORD, 12)

  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    // Do not overwrite an existing hash: re-running the seed in a shared
    // environment must not reset a password an admin has already changed.
    update: { role: Role.ADMIN, name: 'Hurbad Admin' },
    create: {
      email: ADMIN_EMAIL,
      name: 'Hurbad Admin',
      passwordHash,
      role: Role.ADMIN,
      country: 'SO',
      locale: Locale.en,
      emailVerified: new Date(),
    },
  })
}

async function seedTestUsers(): Promise<void> {
  // Test customer user (email: test@example.com, password: TestPassword123!)
  const testCustomerPassword = hashSync('TestPassword123!', 12)
  await prisma.user.upsert({
    where: { email: 'test@example.com' },
    update: { role: Role.CUSTOMER, name: 'Test Customer' },
    create: {
      email: 'test@example.com',
      name: 'Test Customer',
      passwordHash: testCustomerPassword,
      role: Role.CUSTOMER,
      country: 'SO',
      locale: Locale.en,
      emailVerified: new Date(),
    },
  })

  // Test customer for Kenya (email: test-ke@example.com, password: TestPassword123!)
  const testKenyaPassword = hashSync('TestPassword123!', 12)
  await prisma.user.upsert({
    where: { email: 'test-ke@example.com' },
    update: { role: Role.CUSTOMER, name: 'Test Kenya' },
    create: {
      email: 'test-ke@example.com',
      name: 'Test Kenya',
      passwordHash: testKenyaPassword,
      role: Role.CUSTOMER,
      country: 'KE',
      locale: Locale.en,
      emailVerified: new Date(),
    },
  })
}

async function seedCoupons(): Promise<void> {
  const inSixMonths = new Date()
  inSixMonths.setMonth(inSixMonths.getMonth() + 6)

  await prisma.coupon.upsert({
    where: { code: 'WELCOME10' },
    update: { isActive: true },
    create: {
      code: 'WELCOME10',
      type: CouponType.PERCENT,
      value: '10.00',
      minOrderUsd: '50.00',
      maxUses: 1000,
      expiresAt: inSixMonths,
    },
  })

  await prisma.coupon.upsert({
    where: { code: 'HURBAD25' },
    update: { isActive: true },
    create: {
      code: 'HURBAD25',
      type: CouponType.FIXED,
      value: '25.00',
      minOrderUsd: '250.00',
      maxUses: 200,
      expiresAt: inSixMonths,
    },
  })
}

async function main(): Promise<void> {
  console.log('Seeding categories and products…')
  await seedCategoriesAndProducts()

  console.log('Seeding admin user…')
  await seedAdminUser()

  console.log('Seeding test users…')
  await seedTestUsers()

  console.log('Seeding coupons…')
  await seedCoupons()

  const [categories, products, images, coupons] = await Promise.all([
    prisma.category.count(),
    prisma.product.count(),
    prisma.productImage.count(),
    prisma.coupon.count(),
  ])

  console.log(
    `Seed complete: ${categories} categories, ${products} products, ${images} images, ${coupons} coupons.`
  )
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
