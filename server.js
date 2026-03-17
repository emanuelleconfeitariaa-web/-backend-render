const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
app.use(express.json({ limit: "10mb" }));

app.use(cors({
  origin: (origin, cb) => {
    const allowed = [
      "https://emanuelleconfeitariaa-web.github.io",
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:3210",
      "http://127.0.0.1:3210",
      "null"
    ];

    if (!origin || allowed.includes(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS: " + origin));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));


// ====== DATA (JSON) ======
const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const PRODUCTS_FILE   = path.join(DATA_DIR, "products.json");
const ORDERS_FILE     = path.join(DATA_DIR, "orders.json");
const SETTINGS_FILE   = path.join(DATA_DIR, "settings.json");
const CLIENTS_FILE    = path.join(DATA_DIR, "clients.json");
const CATEGORIES_FILE = path.join(DATA_DIR, "categories.json");

function readJson(file, def) {
  try {
    if (!fs.existsSync(file)) return def;
    const raw = fs.readFileSync(file, "utf-8");
    return JSON.parse(raw || "null") ?? def;
  } catch (e) {
    return def;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

function nowIso(){ return new Date().toISOString(); }

function normPhone(v){
  const s = String(v||"").replace(/\D/g,"");
  // mantém com 55 se vier, senão deixa como está
  return s;
}

// ====== PRODUCT HELPERS ======
function normDiscountPercent(v){
  const n = Number(v||0);
  if(!isFinite(n) || n < 0) return 0;
  return Math.min(100, Math.round(n));
}
function normalizeAddons(raw){
  if(!Array.isArray(raw)) return [];
  const out = [];
  for(const a of raw){
    if(!a) continue;
    const id = String(a.id ?? "").trim() || (Date.now().toString() + Math.floor(Math.random()*1000));
    const name = String(a.name ?? "").trim();
    const price = Number(a.price ?? 0);
    if(!name) continue;
    out.push({ id, name, price: (isFinite(price) ? price : 0) });
  }
  return out;
}


// ====== ADDONS (Adicionais de produto) ======
function normalizeAddons(input){
  const arr = Array.isArray(input) ? input : [];
  return arr
    .map(a=>({
      id: String(a && a.id ? a.id : (Date.now().toString() + Math.floor(Math.random()*1000))),
      name: String(a && a.name ? a.name : "").trim(),
      price: Number(a && a.price !== undefined ? a.price : 0)
    }))
    .filter(a => a.name && Number.isFinite(a.price) && a.price >= 0);
}


// ====== DEFAULT SETTINGS ======
 const defaultSettings = {
  shop_name: "Emanuelle Confeitaria",
  shop_tagline: "Retirada ou Entrega • Pedido vai pro WhatsApp",
  // coloque aqui o número que vai receber os pedidos no WhatsApp: 55 + DDD + número
  whatsapp_number: "5582SEUNUMEROAQUI",
  google_reviews_url: "",
  address_base: "Paripueira - AL",
  logo_url: "../assets/logo.png",

  // som de notificação no admin (DataURL/base64)
  notify_sound_dataurl: null,

  // URL pública da sua loja (ex: https://seu-site.com) — aparece no texto do WhatsApp
  store_url: "",

  // URL pública do preview do WhatsApp (ex: https://SEU_USUARIO.github.io/emanuele-preview/preview-whatsapp/pedido.html)
  // essa página tem as OG metas + share.png para aparecer como “cartão” no WhatsApp
  preview_whatsapp_url: "",

  theme: {
    primary: "#7a4a3e",
    secondary: "#d9a5b2",
    soft: "#f4d4d7",
    bg: "#f6ebe5",
  },

  store_ui: {
    page_bg: "#f4d4d7",
    banner_bg: "#7a4a3e",
    banner_height: 104,
    rating: "4.9",
    show_search: true,
    show_featured: true,
    banner_use_image: true,
    banner_image_dataurl: null,
    banner_dim: 0.5,

    text_banner: "#ffffff",
    text_main: "#2b1b17",
    text_modal: "#2b1b17",
    text_cart: "#2b1b17",
  },

  // Personalização do Admin (separado da loja)
  admin_ui: {
    use_bg_image: false,
    bg_image_dataurl: null,
    bg_opacity: 0.35,
    bg_blur: 8,
    bg_dim: 0.35,
    theme: null
  },

  business_hours: {
    enabled: false,
    allow_schedule: false,
    timezone: "America/Maceio",
    days: {
      seg: { enabled: true, open: "08:00", close: "18:00" },
      ter: { enabled: true, open: "08:00", close: "18:00" },
      qua: { enabled: true, open: "08:00", close: "18:00" },
      qui: { enabled: true, open: "08:00", close: "18:00" },
      sex: { enabled: true, open: "08:00", close: "18:00" },
      sab: { enabled: true, open: "08:00", close: "18:00" },
      dom: { enabled: false, open: "08:00", close: "18:00" },
    }
  }
};

// ====== LOAD ======
let products = readJson(PRODUCTS_FILE, []);
products = (products||[]).map(p=>({ ...p, addons: normalizeAddons(p.addons) }));
let orders   = readJson(ORDERS_FILE, []);
let settings = readJson(SETTINGS_FILE, defaultSettings);
let clients  = readJson(CLIENTS_FILE, []);
let categories = readJson(CATEGORIES_FILE, []);

// se settings vazio, garante default
if (!settings || typeof settings !== "object") settings = defaultSettings;
     settings = {
  ...defaultSettings,
  ...settings,
  theme: { ...defaultSettings.theme, ...(settings.theme||{}) },
  store_ui: { ...defaultSettings.store_ui, ...(settings.store_ui||{}) },
  admin_ui: {
    ...defaultSettings.admin_ui,
    ...(settings.admin_ui||{}),
    theme: (settings.admin_ui && settings.admin_ui.theme) ? settings.admin_ui.theme : defaultSettings.admin_ui.theme
  },
  business_hours: {
    ...defaultSettings.business_hours,
    ...(settings.business_hours || {}),
    days: {
      ...defaultSettings.business_hours.days,
      ...((settings.business_hours || {}).days || {})
    }
  }
};


// ===============================
// ✅ RELOAD FROM DISK (anti-cache)
// ===============================
function buildSettings(raw){
  let s = (raw && typeof raw === "object") ? raw : {};
  return {
    ...defaultSettings,
    ...s,
    theme: { ...defaultSettings.theme, ...(s.theme||{}) },
    store_ui: { ...defaultSettings.store_ui, ...(s.store_ui||{}) },
    admin_ui: {
      ...defaultSettings.admin_ui,
      ...(s.admin_ui||{}),
      theme: (s.admin_ui && s.admin_ui.theme) ? s.admin_ui.theme : defaultSettings.admin_ui.theme
    },
    business_hours: {
      ...defaultSettings.business_hours,
      ...(s.business_hours || {}),
      days: {
        ...defaultSettings.business_hours.days,
        ...((s.business_hours || {}).days || {})
      }
    }
  };
}

function reloadProductsFromDisk(){
  const arr = readJson(PRODUCTS_FILE, []);
  products = Array.isArray(arr) ? arr : [];
  products = products.map(p => ({ ...p, addons: normalizeAddons(p.addons) }));
}

function reloadOrdersFromDisk(){
  const arr = readJson(ORDERS_FILE, []);
  orders = Array.isArray(arr) ? arr : [];
}

function reloadClientsFromDisk(){
  const arr = readJson(CLIENTS_FILE, []);
  clients = Array.isArray(arr) ? arr : [];
}

function reloadCategoriesFromDisk(){
  const arr = readJson(CATEGORIES_FILE, []);
  categories = Array.isArray(arr) ? arr : [];
}

function reloadSettingsFromDisk(){
  const raw = readJson(SETTINGS_FILE, {}); // ✅ SEMPRE o SETTINGS_FILE (data/settings.json)

  const safeObj = (v) =>
    (v && typeof v === "object" && !Array.isArray(v)) ? v : {};

  const s = safeObj(raw);

  settings = {
    ...defaultSettings,
    ...s,

    theme: {
      ...safeObj(defaultSettings.theme),
      ...safeObj(s.theme),
    },

    store_ui: {
      ...safeObj(defaultSettings.store_ui),
      ...safeObj(s.store_ui),
    },

    admin_ui: {
      ...safeObj(defaultSettings.admin_ui),
      ...safeObj(s.admin_ui),

      // ✅ theme pode ser null — então protege
      theme: {
        ...safeObj(safeObj(defaultSettings.admin_ui).theme),
        ...safeObj(safeObj(s.admin_ui).theme),
      }
    },

    business_hours: {
      ...safeObj(defaultSettings.business_hours),
      ...safeObj(s.business_hours),
      days: {
        ...safeObj(safeObj(defaultSettings.business_hours).days),
        ...safeObj(safeObj(s.business_hours).days),
      }
    }
  };
}


// ====== HELPERS ======
function toId(v){ return String(v); }

function normalizeAddons(addons){
  if(!Array.isArray(addons)) return [];
  return addons
    .map(a => ({
      id: String(a?.id || "").trim() || ("a_" + Math.random().toString(36).slice(2,10)),
      name: String(a?.name || a?.label || "").trim(),
      price: Number(a?.price ?? a?.value ?? 0)
    }))
    .filter(a => a.name)
    .slice(0, 30);
}

function ensureCategoryExists(name){
  const n = String(name || "").trim();
  if(!n) return;

  reloadCategoriesFromDisk();

  const exists = categories.some(
    c => String(c.name || "").trim().toLowerCase() === n.toLowerCase()
  );

  if(exists) return;

  const cat = {
    id: Date.now().toString() + Math.floor(Math.random()*1000),
    name: n,
    featured: false,
    created_at: nowIso()
  };

  categories.push(cat);
  writeJson(CATEGORIES_FILE, categories);
}

function upsertClientFromOrder(order){
  const phone = normPhone(order.customer_phone || "");
  if(!phone) return;

  const name = String(order.customer_name||"").trim();
  const address = String(order.address||"").trim();

  let c = clients.find(x => normPhone(x.phone) === phone);
  if(!c){
    c = {
      id: Date.now().toString() + Math.floor(Math.random()*1000),
      name: name || "Cliente",
      phone,
      address,
      created_at: nowIso(),
      updated_at: nowIso(),
      coupons: []
    };
    clients.push(c);
  }else{
    // atualiza se vier info melhor
    if(name) c.name = name;
    if(address) c.address = address;
    c.updated_at = nowIso();
  }
  writeJson(CLIENTS_FILE, clients);
}

app.get("/favicon.ico", (req,res)=> res.status(204).end());

// ====== HEALTH ======
app.get("/health", (_req, res) => res.json({ ok: true }));
// ====== ADMIN RESET (ZERAR DADOS PARA VENDER PARA OUTRO CLIENTE) ======
// POST /api/admin/reset
// body:
// {
//   reset_orders: true/false,
//   reset_clients: true/false,
//   reset_products: true/false,
//   reset_categories: true/false,
//   reset_settings: true/false
// }
app.post("/api/admin/reset", (req, res) => {
  const b = req.body || {};

  const resetOrders = !!b.reset_orders;
  const resetClients = !!b.reset_clients;
  const resetProducts = !!b.reset_products;
  const resetCategories = !!b.reset_categories;
  const resetSettings = !!b.reset_settings;

  const cleared = {
    orders: false,
    clients: false,
    products: false,
    categories: false,
    settings: false
  };

  // pedidos
  if (resetOrders) {
    orders = [];
    writeJson(ORDERS_FILE, orders);
    cleared.orders = true;
  }

  // clientes
  if (resetClients) {
    clients = [];
    writeJson(CLIENTS_FILE, clients);
    cleared.clients = true;
  }

  // produtos
  if (resetProducts) {
    products = [];
    writeJson(PRODUCTS_FILE, products);
    cleared.products = true;
  }

  // categorias
  if (resetCategories) {
    categories = [];
    writeJson(CATEGORIES_FILE, categories);
    cleared.categories = true;
  }

  // configurações
  if (resetSettings) {
    settings = JSON.parse(JSON.stringify(defaultSettings));
    writeJson(SETTINGS_FILE, settings);
    cleared.settings = true;
  }

  res.json({ ok: true, cleared });
});

// ====== SETTINGS ======
app.get("/api/settings", (_req, res) => {
  reloadSettingsFromDisk();
  return res.json({ ok: true, settings });
});

// ===== SETTINGS (UPSERT / MERGE) =====
app.post("/api/settings", (req, res) => {
  try {
    const incoming = req.body || {};

    const cur = readJson(SETTINGS_FILE, {}); // seu helper readJson
    const safeObj = (v) => (v && typeof v === "object" && !Array.isArray(v)) ? v : {};

    const CUR = safeObj(cur);
    const IN  = safeObj(incoming);

    // merge “profundo” nos blocos importantes
    const merged = {
      ...CUR,
      ...IN,

      business_hours: {
        ...safeObj(CUR.business_hours),
        ...safeObj(IN.business_hours),
        days: {
          ...safeObj(safeObj(CUR.business_hours).days),
          ...safeObj(safeObj(IN.business_hours).days),
        }
      },

      theme: {
        ...safeObj(CUR.theme),
        ...safeObj(IN.theme),
      },

      store_ui: {
        ...safeObj(CUR.store_ui),
        ...safeObj(IN.store_ui),
        info_modal: {
          ...safeObj(safeObj(CUR.store_ui).info_modal),
          ...safeObj(safeObj(IN.store_ui).info_modal),
        }
      },

      admin_ui: {
        ...safeObj(CUR.admin_ui),
        ...safeObj(IN.admin_ui),
        theme: {
          ...safeObj(safeObj(CUR.admin_ui).theme),
          ...safeObj(safeObj(IN.admin_ui).theme),
        }
      },

      // frete por km
      shipping_by_km: Array.isArray(IN.shipping_by_km) ? IN.shipping_by_km : (CUR.shipping_by_km || []),
      shipping_mode: (IN.shipping_mode || CUR.shipping_mode || "fixed"),
    };

    writeJson(SETTINGS_FILE, merged);// seu helper writeJson

    console.log("SALVOU SETTINGS EM:", SETTINGS_FILE);
    console.log("NOME:", merged.shop_name);

    settings = buildSettings(merged);
    return res.json({ ok: true, settings: merged });
  } catch (e) {
    console.error("save settings error:", e);
    return res.status(500).json({ error: "Erro ao salvar settings" });
  }
});

// ====== CATEGORIES ======
app.get("/api/categories", (_req, res) => {
  reloadCategoriesFromDisk(); // ✅
  const list = categories.slice().sort((a,b)=>{
    const fb = (b.featured ? 1 : 0) - (a.featured ? 1 : 0);
    if(fb) return fb;
    return String(a.name||"").localeCompare(String(b.name||""), "pt-BR");
  });
  res.json(list);
});


app.post("/api/categories/bulk", (req, res) => {
  const arr = req.body;
  if(!Array.isArray(arr)) return res.status(400).json({ ok:false, error:"Envie um array de categorias" });
  categories = arr;
  writeJson(CATEGORIES_FILE, categories);
  res.json({ ok:true, count: categories.length });
});




app.post("/api/categories", (req, res) => {
  const body = req.body || {};
  const name = String(body.name || "").trim();
  if(!name) return res.status(400).json({ ok:false, error:"Nome da categoria é obrigatório" });

  const exists = categories.some(c => String(c.name||"").toLowerCase() === name.toLowerCase());
  if(exists) return res.status(400).json({ ok:false, error:"Categoria já existe" });

  const cat = {
    id: Date.now().toString() + Math.floor(Math.random()*1000),
    name,
    featured: !!body.featured, // ✅ AQUI
    created_at: nowIso()
  };

  categories.push(cat);
  writeJson(CATEGORIES_FILE, categories);
  res.json({ ok:true, category: cat });
});

app.put("/api/categories/:id", (req, res) => {
  const id = toId(req.params.id);
  const idx = categories.findIndex(c => toId(c.id) === id);
  if(idx < 0) return res.status(404).json({ ok:false, error:"Categoria não encontrada" });

  const body = req.body || {};

  const newName = String(body.name || "").trim();
  if(!newName) return res.status(400).json({ ok:false, error:"Novo nome é obrigatório" });

  const oldName = String(categories[idx].name||"");

  categories[idx].name = newName;

  // ✅ salva destaque da categoria
  if("featured" in body) categories[idx].featured = !!body.featured;

  writeJson(CATEGORIES_FILE, categories);

  // atualiza produtos que usam o nome antigo
  let changed = 0;
  products = products.map(p=>{
    if(String(p.category||"") === oldName){
      changed++;
      return { ...p, category: newName };
    }
    return p;
  });
  if(changed) writeJson(PRODUCTS_FILE, products);

  res.json({ ok:true, category: categories[idx], products_changed: changed });
});

app.delete("/api/categories/:id", (req, res) => {
  try {
    const id = toId(req.params.id);

    reloadCategoriesFromDisk();
    reloadProductsFromDisk();

    const idx = categories.findIndex(c => toId(c.id) === id);

    if (idx < 0) {
      return res.status(404).json({ ok:false, error:"Categoria não encontrada" });
    }

    const removed = categories[idx];
    const removedName = String(removed?.name || "").trim();

    categories.splice(idx, 1);
    writeJson(CATEGORIES_FILE, categories);

    const before = products.length;

    products = products.filter(p => {
      const productCategory = String(p.category || "").trim();
      return productCategory !== removedName;
    });

    writeJson(PRODUCTS_FILE, products);

    const removedCount = before - products.length;

    return res.json({
      ok: true,
      deleted_category_id: id,
      deleted_category_name: removedName,
      deleted_products: removedCount
    });
  } catch (e) {
    console.error("delete category error:", e);
    return res.status(500).json({ ok:false, error:String(e?.message || e) });
  }
});


// ====== PRODUCTS ======
app.get("/api/products", (_req, res) => {
   reloadProductsFromDisk(); // ✅
  const out = products.map(p=>{
    const paused = !!p.paused;
    if(paused){
      return { ...p, paused:true, stock_enabled:true, stock_qty:0 };
    }
    return { ...p, paused:false };
  });
  res.json(out);
});



// ✅ BULK (sobrescreve tudo)
app.post("/api/products/bulk", (req, res) => {
  const arr = req.body;
  if(!Array.isArray(arr)) return res.status(400).json({ ok:false, error:"Envie um array de produtos" });
  products = arr;
  writeJson(PRODUCTS_FILE, products);
  res.json({ ok:true, count: products.length });
});



  app.post("/api/products", (req, res) => {
  const p = req.body || {};
  const cat = String(p.category || "").trim();

  const prod = {
    id: Date.now().toString() + Math.floor(Math.random()*1000),
    name: p.name || "Produto",
    category: cat,
    subcategory: p.subcategory || "",
    description: p.description || "",
    price: Number(p.price || 0),
    image_url: p.image_url || "",
    featured: !!p.featured,
    paused: !!p.paused, // ✅ NOVO
    stock_enabled: p.stock_enabled !== undefined ? !!p.stock_enabled : false,
    stock_qty: Number(p.stock_qty || 0),
    low_stock_alert: Number(p.low_stock_alert || 5),
    addons: normalizeAddons(p.addons),
    discount_percent: normDiscountPercent(p.discount_percent),


  };

  products.push(prod);
  writeJson(PRODUCTS_FILE, products);

  if(cat) ensureCategoryExists(cat);

  res.json({ ok:true, product: prod });
});

app.put("/api/products/:id", (req, res) => {
  const id = toId(req.params.id);
  const idx = products.findIndex(p => toId(p.id) === id);
  if (idx < 0) return res.status(404).json({ ok:false, error:"Produto não encontrado" });

  const body = req.body || {};
  const cur = products[idx];

  const nextCat = (body.category !== undefined ? String(body.category||"").trim() : cur.category);

  const updated = {
    ...cur,
    name: (body.name ?? cur.name),
    category: nextCat,
    subcategory: (body.subcategory ?? cur.subcategory),
    description: (body.description ?? cur.description),
    price: (body.price !== undefined ? Number(body.price) : cur.price),
    discount_percent: (body.discount_percent !== undefined
       ? normDiscountPercent(body.discount_percent)
      : (cur.discount_percent ?? 0)
    ),
    addons: (body.addons !== undefined
      ? normalizeAddons(body.addons)
      : (cur.addons || [])
    ),

     
    image_url: (body.image_url !== undefined ? String(body.image_url) : cur.image_url),
    featured: (body.featured !== undefined ? !!body.featured : cur.featured),
    paused: (body.paused !== undefined ? !!body.paused : !!cur.paused),
    stock_enabled: (body.stock_enabled !== undefined ? !!body.stock_enabled : cur.stock_enabled),
    stock_qty: (body.stock_qty !== undefined ? Number(body.stock_qty) : cur.stock_qty),
    low_stock_alert: (body.low_stock_alert !== undefined ? Number(body.low_stock_alert) : cur.low_stock_alert),
    addons: (body.addons !== undefined ? normalizeAddons(body.addons) : (cur.addons || [])),
    

  };

  products[idx] = updated;
  writeJson(PRODUCTS_FILE, products);

  if(updated.category) ensureCategoryExists(updated.category);

  res.json({ ok:true, product: updated });
});

app.delete("/api/products/:id", (req, res) => {
  const id = toId(req.params.id);
  const idx = products.findIndex(p => toId(p.id) === id);
  if (idx < 0) return res.status(404).json({ ok:false, error:"Produto não encontrado" });
  const removed = products.splice(idx,1)[0];
  writeJson(PRODUCTS_FILE, products);
  res.json({ ok:true, removed });
});

// ====== CLIENTS ======


app.post("/api/clients/bulk", (req, res) => {
  const arr = req.body;
  if(!Array.isArray(arr)) return res.status(400).json({ ok:false, error:"Envie um array de clientes" });
  clients = arr;
  writeJson(CLIENTS_FILE, clients);
  res.json({ ok:true, count: clients.length });
});




app.get("/api/clients", (req, res) => {
  reloadClientsFromDisk(); // ✅
  const q = String(req.query.q||"").trim().toLowerCase();
  let list = clients.slice();
  if(q){
    list = list.filter(c=>{
      const name = String(c.name||"").toLowerCase();
      const phone = String(c.phone||"").toLowerCase();
      const addr = String(c.address||"").toLowerCase();
      return name.includes(q) || phone.includes(q) || addr.includes(q);
    });
  }
  list.sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),"pt-BR"));
  res.json(list);
});

app.get("/api/clients/by-phone", (req, res) => {
  reloadClientsFromDisk(); // ✅
  const phone = normPhone(req.query.phone || "");
  if(!phone) return res.status(400).json({ ok:false, error:"phone obrigatório" });
  const c = clients.find(x=>normPhone(x.phone)===phone);
  if(!c) return res.json({ ok:false, found:false });
  res.json({ ok:true, found:true, client:c });
});


app.get("/api/clients/benefits", (req, res) => {
   reloadClientsFromDisk(); // ✅
  const phone = normPhone(req.query.phone || "");
  if(!phone) return res.status(400).json({ ok:false, error:"phone obrigatório" });

  const c = clients.find(x=>normPhone(x.phone)===phone);
  if(!c) return res.json({ ok:true, found:false, phone, coupons:[], best:null });

  const cps = Array.isArray(c.coupons)
  ? c.coupons.filter(cp => cp && cp.active !== false && !cp.used && Number(cp.uses_left ?? 1) > 0)
  : [];
  // pega o "melhor" cupom: FREE_SHIPPING tem prioridade, senão maior desconto
  let best = null;
  for(const cp of cps){
    if(!best) { best = cp; continue; }
    if(cp.type === "FREE_SHIPPING" && best.type !== "FREE_SHIPPING"){ best = cp; continue; }
    if(best.type === "FREE_SHIPPING") continue;
    const curVal = Number(cp.value||0);
    const bestVal = Number(best.value||0);
    if(curVal > bestVal) best = cp;
  }

  res.json({ ok:true, found:true, phone, coupons:cps, best });
});

app.post("/api/clients", (req, res) => {
  const b = req.body || {};
  const phone = normPhone(b.phone || "");
  const name = String(b.name||"").trim();
  const address = String(b.address||"").trim();

  if(!phone) return res.status(400).json({ ok:false, error:"Telefone é obrigatório" });
  if(!name) return res.status(400).json({ ok:false, error:"Nome é obrigatório" });

  const exists = clients.find(x=>normPhone(x.phone)===phone);
  if(exists) return res.status(400).json({ ok:false, error:"Já existe cliente com esse telefone" });

  const c = { id: Date.now().toString()+Math.floor(Math.random()*1000), name, phone, address, created_at: nowIso(), updated_at: nowIso(), coupons: [] };
  clients.push(c);
  writeJson(CLIENTS_FILE, clients);
  res.json({ ok:true, client:c });
});

app.put("/api/clients/:id", (req, res) => {
  const id = toId(req.params.id);
  const idx = clients.findIndex(c=>toId(c.id)===id);
  if(idx < 0) return res.status(404).json({ ok:false, error:"Cliente não encontrado" });

  const b = req.body||{};
  if(b.name !== undefined) clients[idx].name = String(b.name||"").trim() || clients[idx].name;
  if(b.phone !== undefined) clients[idx].phone = normPhone(b.phone||"") || clients[idx].phone;
  if(b.address !== undefined) clients[idx].address = String(b.address||"").trim();
  clients[idx].updated_at = nowIso();

  writeJson(CLIENTS_FILE, clients);
  res.json({ ok:true, client: clients[idx] });
});

app.delete("/api/clients/:id", (req, res) => {
  const id = toId(req.params.id);
  const idx = clients.findIndex(c=>toId(c.id)===id);
  if(idx < 0) return res.status(404).json({ ok:false, error:"Cliente não encontrado" });
  const removed = clients.splice(idx,1)[0];
  writeJson(CLIENTS_FILE, clients);
  res.json({ ok:true, removed });
});

// coupons: add/remove
app.post("/api/clients/:id/coupons", (req, res) => {
  const id = toId(req.params.id);
  const idx = clients.findIndex(c=>toId(c.id)===id);
  if(idx < 0) return res.status(404).json({ ok:false, error:"Cliente não encontrado" });

  const b = req.body||{};
  const type = String(b.type||"").toUpperCase(); // FREE_SHIPPING | PERCENT | VALUE
  const value = Number(b.value || 0);
  const label = String(b.label||"").trim();
  if(!["FREE_SHIPPING","PERCENT","VALUE"].includes(type)) return res.status(400).json({ ok:false, error:"Tipo inválido" });
  if(type !== "FREE_SHIPPING" && !(value > 0)) return res.status(400).json({ ok:false, error:"Valor inválido" });

  const coupon = {
  id: Date.now().toString()+Math.floor(Math.random()*1000),
  type,
  value: type==="FREE_SHIPPING" ? 0 : value,
  label: label || (type==="FREE_SHIPPING" ? "Frete grátis" : (type==="PERCENT" ? `${value}% OFF` : `R$ ${value} OFF`)),

  // ✅ cupom de uso único (sempre 1 vez)
  uses_left: 1,
  used: false,

  active: (b.active !== undefined ? !!b.active : true),
  created_at: nowIso()
};


  const arr = Array.isArray(clients[idx].coupons) ? clients[idx].coupons : [];
  arr.push(coupon);
  clients[idx].coupons = arr;
  clients[idx].updated_at = nowIso();
  writeJson(CLIENTS_FILE, clients);

  res.json({ ok:true, coupon, client: clients[idx] });
});

app.delete("/api/clients/:id/coupons/:couponId", (req, res) => {
  const id = toId(req.params.id);
  const idx = clients.findIndex(c=>toId(c.id)===id);
  if(idx < 0) return res.status(404).json({ ok:false, error:"Cliente não encontrado" });

  const cId = toId(req.params.couponId);
  const arr = Array.isArray(clients[idx].coupons) ? clients[idx].coupons : [];
  const before = arr.length;
  clients[idx].coupons = arr.filter(x=>toId(x.id)!==cId);
  const removed = before - clients[idx].coupons.length;
  clients[idx].updated_at = nowIso();
  writeJson(CLIENTS_FILE, clients);

  res.json({ ok:true, removed });
});

// ====== ORDERS ======
app.get("/api/orders", (_req, res) => {
  reloadOrdersFromDisk(); // ✅
  res.json(orders.slice().reverse());
});

app.get("/api/orders/by-phone", (req, res) => {
  reloadOrdersFromDisk(); // ✅
  const phone = String(req.query.phone || "").trim();
  if(!phone) return res.status(400).json({ ok:false, error:"Telefone obrigatório" });
  const list = orders
    .filter(o => String(o.customer_phone||"").trim() === phone)
    .slice()
    .sort((a,b)=> (Date.parse(b.created_at||"")||0) - (Date.parse(a.created_at||"")||0));
  res.json({ ok:true, phone, orders: list });
});

app.post("/api/orders/bulk", (req, res) => {
  const arr = req.body;
  if(!Array.isArray(arr)) return res.status(400).json({ ok:false, error:"Envie um array de pedidos" });
  orders = arr;
  writeJson(ORDERS_FILE, orders);
  res.json({ ok:true, count: orders.length });
});



app.post("/api/orders", (req, res) => {

  reloadProductsFromDisk(); // ✅ importante
  reloadClientsFromDisk();  // ✅ importante
  reloadOrdersFromDisk();   // ✅ opcional, mas bom

  const o = req.body || {};
  const items = Array.isArray(o.items) ? o.items : [];

  // baixa de estoque automática
  for (const it of items) {
    const prod = products.find(p => toId(p.id) === toId(it.product_id));
    if (!prod) continue;

    // se pausado, não vende
    if(!!prod.paused){
      return res.status(400).json({ ok:false, error:`Produto em pausa (esgotado): ${prod.name}` });
    }

    if (prod.stock_enabled) {
      const qty = Number(it.qty || 0);
      const current = Number(prod.stock_qty || 0);

      if (current < qty) {
        return res.status(400).json({ ok:false, error:`Estoque insuficiente para: ${prod.name}. Disponível: ${current}` });
      }
      prod.stock_qty = current - qty;
    }
  }

  writeJson(PRODUCTS_FILE, products);

  const subtotal = items.reduce((acc,it)=> acc + (Number(it.price||0) * Number(it.qty||0)), 0);

  // frete informado pelo checkout (ou 0)
  let shipping = Number(o.shipping || 0);

  // desconto enviado pelo checkout (opcional)
  let discount = Number(o.discount || 0);

  // ✅ Cupom automático por telefone (se existir no cadastro do cliente)
  // Regra: só aplica se o checkout NÃO tiver mandado desconto manual,
  // e se o pedido tiver telefone.
  let coupon_applied = null;
  const phoneNorm = normPhone(o.customer_phone || "");

  if(phoneNorm){
    const c = clients.find(x => normPhone(x.phone) === phoneNorm);

    // cupons elegíveis (não usados)
    const cps = (c && Array.isArray(c.coupons))
      ? c.coupons.filter(cp =>
          cp &&
          cp.active !== false &&
          !cp.used &&
          Number(cp.uses_left ?? 1) > 0
        )
      : [];

    // se o front mandou qual cupom aplicou, consome esse cupom
    const reqCouponId =
      (o.coupon_applied && o.coupon_applied.id) ||
      o.coupon_id ||
      o.couponId ||
      null;

    let best = null;

    if(reqCouponId){
      best = cps.find(cp => String(cp.id) === String(reqCouponId)) || null;
    }

    // se não veio id, escolhe o melhor (FREE_SHIPPING prioridade, senão maior value)
    if(!best){
      for(const cp of cps){
        if(!best) { best = cp; continue; }
        if(cp.type === "FREE_SHIPPING" && best.type !== "FREE_SHIPPING"){ best = cp; continue; }
        if(best.type === "FREE_SHIPPING") continue;
        if(Number(cp.value||0) > Number(best.value||0)) best = cp;
      }
    }

    if(best){
      // registra no pedido
      coupon_applied = { id: best.id, type: best.type, value: best.value, label: best.label || "" };

      // só calcula desconto aqui se o front NÃO mandou desconto
      if(discount <= 0){
        if(best.type === "FREE_SHIPPING"){
          discount = Math.min(shipping, shipping); // zera frete via desconto
        }else if(best.type === "PERCENT"){
          discount = subtotal * (Number(best.value||0)/100);
        }else if(best.type === "VALUE"){
          discount = Number(best.value||0);
        }
      }

      // ✅ CONSOME (uso único): marca como usado e esconde
      best.used = true;
      best.uses_left = 0;
      best.active = false;

      // persiste no clients.json
      writeJson(CLIENTS_FILE, clients);
    }
  }

  // trava desconto para não passar do total
  discount = Math.max(0, Math.min(Number(discount||0), subtotal + shipping));
  const total = Math.max(0, subtotal + shipping - discount);

  const order = {
    id: Date.now().toString() + Math.floor(Math.random()*1000),
    created_at: nowIso(),
    status: "NOVO", // NOVO / ACEITO / RECUSADO / CONCLUIDO / CANCELADO
    paid: false,
    paid_at: null,

    type: o.type || "RETIRADA",
    customer_name: o.customer_name || "",
    customer_phone: o.customer_phone || "",
    address: o.address || "",
    payment: o.payment || "",
    notes: o.notes || "",

    scheduled_for: o.scheduled_for || null,

    need_nfce: !!o.need_nfce,
    cpf: o.cpf || "",

    distance_km: o.distance_km ?? null,
    shipping,
    discount,
    coupon_applied,
    subtotal,
    total,
    items
  };

  orders.push(order);
  writeJson(ORDERS_FILE, orders);

  // auto-cadastro de cliente
  upsertClientFromOrder(order);

  res.json({ ok:true, order });
});

const VALID_STATUS = ["NOVO","ACEITO","RECUSADO","CONCLUIDO","CANCELADO"];

app.put("/api/orders/:id/status", (req, res) => {
  const id = toId(req.params.id);
  const idx = orders.findIndex(o => toId(o.id) === id);
  if (idx < 0) return res.status(404).json({ ok:false, error:"Pedido não encontrado" });

  const status = String((req.body||{}).status || "").toUpperCase();
  if (!VALID_STATUS.includes(status)) {
    return res.status(400).json({ ok:false, error:"Status inválido" });
  }

  orders[idx].status = status;
  // se marcar como CONCLUIDO via status, não força paid. (o botão de pago usa /pay)
  writeJson(ORDERS_FILE, orders);
  res.json({ ok:true, order: orders[idx] });
});

// marcar como pago + concluir
app.put("/api/orders/:id/pay", (req, res) => {
  const id = toId(req.params.id);
  const idx = orders.findIndex(o => toId(o.id) === id);
  if (idx < 0) return res.status(404).json({ ok:false, error:"Pedido não encontrado" });

  orders[idx].paid = true;
  orders[idx].paid_at = nowIso();
  orders[idx].status = "CONCLUIDO";

  writeJson(ORDERS_FILE, orders);
  res.json({ ok:true, order: orders[idx] });
});

// ====== SERVER START/STOP ======
let httpServer;

async function start() {
  if (httpServer) return;

  const HOST = "0.0.0.0";
  const PORT = Number(process.env.PORT || 3210);

  return new Promise((resolve, reject) => {
    httpServer = app.listen(PORT, HOST, () => {
      console.log("API em http://" + HOST + ":" + PORT);
      resolve();
    });

    httpServer.on("error", (err) => {
      reject(err);
    });
  });
}

async function stop() {
  if (!httpServer) return;

  return new Promise((resolve, reject) => {
    httpServer.close((err) => {
      if (err) return reject(err);
      httpServer = null;
      resolve();
    });
  });
}

if (require.main === module) {
  start().catch((err) => {
    console.error("Erro ao iniciar servidor:", err);
    process.exit(1);
  });
}

module.exports = { start, stop };