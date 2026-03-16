require("dotenv").config();

const fs = require("fs");
const path = require("path");

const { connectDB } = require("../db");

const Category = require("../models/Category");
const Product = require("../models/Product");
const Client = require("../models/Client");
const Order = require("../models/Order");
const Setting = require("../models/Setting");

function readJsonFile(fileName, fallback) {
  try {
    const filePath = path.join(__dirname, "..", "data", fileName);
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    console.error(`Erro lendo ${fileName}:`, e);
    return fallback;
  }
}

async function importSettings() {
  const settings = readJsonFile("settings.json", {});
  const entries = Object.entries(settings || {});

  if (!entries.length) {
    console.log("Nenhum settings.json para importar.");
    return;
  }

  for (const [key, value] of entries) {
    await Setting.findOneAndUpdate(
      { key },
      { key, value },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  console.log(`Settings importados: ${entries.length}`);
}

async function importCategories() {
  const categories = readJsonFile("categories.json", []);
  if (!Array.isArray(categories) || !categories.length) {
    console.log("Nenhuma categoria para importar.");
    return;
  }

  for (const c of categories) {
    await Category.create({
      name: String(c.name || "").trim(),
      slug: String(c.slug || "").trim(),
      active: c.active !== false,
      sort_order: Number(c.sort_order || 0)
    });
  }

  console.log(`Categorias importadas: ${categories.length}`);
}

async function importProducts() {
  const products = readJsonFile("products.json", []);
  if (!Array.isArray(products) || !products.length) {
    console.log("Nenhum produto para importar.");
    return;
  }

  for (const p of products) {
    await Product.create({
      name: String(p.name || "").trim(),
      price: Number(p.price || 0),

      category: String(p.category || "").trim(),
      subcategory: String(p.subcategory || "").trim(),
      description: String(p.description || ""),

      featured: !!p.featured,

      stock_enabled: p.stock_enabled !== false,
      stock_qty: Number(p.stock_qty || 0),
      low_stock_alert: Number(p.low_stock_alert || 5),

      paused: !!p.paused,

      image_url: String(p.image_url || ""),
      images: Array.isArray(p.images) ? p.images : [],

      addons: Array.isArray(p.addons) ? p.addons : [],
      discount_percent: Number(p.discount_percent || 0),

      sort_order: Number(p.sort_order || 0),
      active: p.active !== false,

      category_id: p.category_id || null
    });
  }

  console.log(`Produtos importados: ${products.length}`);
}

async function importClients() {
  const clients = readJsonFile("clients.json", []);
  if (!Array.isArray(clients) || !clients.length) {
    console.log("Nenhum cliente para importar.");
    return;
  }

  for (const c of clients) {
    await Client.create({
      name: String(c.name || "").trim() || "Sem nome",
      phone: String(c.phone || "").trim(),
      email: String(c.email || "").trim(),
      notes: String(c.notes || ""),
      address: {
        street: String(c.address?.street || ""),
        number: String(c.address?.number || ""),
        neighborhood: String(c.address?.neighborhood || ""),
        city: String(c.address?.city || ""),
        complement: String(c.address?.complement || ""),
        zip: String(c.address?.zip || "")
      },
      coupons: Array.isArray(c.coupons) ? c.coupons : []
    });
  }

  console.log(`Clientes importados: ${clients.length}`);
}

async function importOrders() {
  const orders = readJsonFile("orders.json", []);
  if (!Array.isArray(orders) || !orders.length) {
    console.log("Nenhum pedido para importar.");
    return;
  }

  for (const o of orders) {
    await Order.create({
      created_at: o.created_at ? new Date(o.created_at) : new Date(),

      status: String(o.status || "NOVO").toUpperCase(),
      paid: !!o.paid,
      paid_at: o.paid_at ? new Date(o.paid_at) : null,

      type: String(o.type || "RETIRADA").toUpperCase(),
      customer_name: String(o.customer_name || ""),
      customer_phone: String(o.customer_phone || ""),
      address: String(o.address || ""),

      payment: String(o.payment || ""),
      notes: String(o.notes || ""),

      scheduled_for: o.scheduled_for || null,
      need_nfce: !!o.need_nfce,
      cpf: String(o.cpf || ""),

      distance_km: typeof o.distance_km === "number" ? o.distance_km : null,

      shipping: Number(o.shipping || 0),
      discount: Number(o.discount || 0),
      subtotal: Number(o.subtotal || 0),
      total: Number(o.total || 0),

      coupon_applied: o.coupon_applied || null,
      items: Array.isArray(o.items) ? o.items : []
    });
  }

  console.log(`Pedidos importados: ${orders.length}`);
}

async function run() {
  await connectDB();

  console.log("Conectado. Limpando coleções antes da importação...");

  await Setting.deleteMany({});
  await Category.deleteMany({});
  await Product.deleteMany({});
  await Client.deleteMany({});
  await Order.deleteMany({});

  await importSettings();
  await importCategories();
  await importProducts();
  await importClients();
  await importOrders();

  console.log("Importação concluída com sucesso.");
  process.exit(0);
}

run().catch((e) => {
  console.error("Erro na importação:", e);
  process.exit(1);
});
