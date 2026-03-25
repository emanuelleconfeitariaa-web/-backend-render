

require("dotenv").config();


const express = require("express");
const crypto = require("crypto");
const cors = require("cors");
const { connectDB } = require("./db");
const Category = require("./models/Category");
const Product = require("./models/Product");
const Setting = require("./models/Setting");
const Order = require("./models/Order");
const Client = require("./models/Client");
const app = express();
app.use(express.json({ limit: "10mb" }));

app.use(cors({
  origin: (origin, cb) => {
    const allowed = [
      "https://backend-render-9s32.onrender.com",
      "https://emanuelleconfeitariaa-web.github.io",
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:3210",
      "http://127.0.0.1:3210",
      "null"
    ];

    if (!origin) return cb(null, true);
    if (allowed.includes(origin)) return cb(null, true);

    const dynamicAllowed =
      origin.includes("aistudio.google.com") ||
      origin.includes("googleusercontent.com") ||
      origin.includes(".run.app");

    if (dynamicAllowed) return cb(null, true);

    return cb(new Error("Not allowed by CORS: " + origin));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

function nowIso(){ return new Date().toISOString(); }

function normPhone(v){
  const s = String(v||"").replace(/\D/g,"");
  // mantém com 55 se vier, senão deixa como está
  return s;
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


shipping_mode: "fixed",
geoapify_api_key: "",
delivery_origin_address: "",
delivery_origin_lat: "",
delivery_origin_lon: "",
shipping_by_km: [],
shipping_max_km: 0,
shipping_out_of_area_mode: "block",
shipping_fallback_price: 0,



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


function buildSettings(raw){
  const safeObj = (v) =>
    (v && typeof v === "object" && !Array.isArray(v)) ? v : {};

  const s = safeObj(raw);

  return {
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

let settings = buildSettings({});

function normalizeShippingRules(raw){
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .map(x => ({
      max_km: Number(x?.max_km || 0),
      price: Number(x?.price || 0)
    }))
    .filter(x => x.max_km > 0 && x.price >= 0)
    .sort((a, b) => a.max_km - b.max_km);
}

function resolveShippingRule(distanceKm, settings){
  const rules = normalizeShippingRules(settings?.shipping_by_km || []);
  for(const rule of rules){
    if(distanceKm <= rule.max_km){
      return {
        ok: true,
        shipping_price: Number(rule.price || 0),
        matched_rule: rule
      };
    }
  }

  const maxKm = Number(settings?.shipping_max_km || 0);
  const outMode = String(settings?.shipping_out_of_area_mode || "block");
  const fallback = Number(settings?.shipping_fallback_price || 0);

  if(maxKm > 0 && distanceKm > maxKm){
    if(outMode === "fallback"){
      return {
        ok: true,
        shipping_price: fallback,
        matched_rule: null,
        used_fallback: true
      };
    }

    return {
      ok: false,
      error: "Fora da área de entrega"
    };
  }

  if(outMode === "fallback"){
    return {
      ok: true,
      shipping_price: fallback,
      matched_rule: null,
      used_fallback: true
    };
  }

  return {
    ok: false,
    error: "Não foi possível encontrar uma faixa de entrega para essa distância"
  };
}


async function geoapifyGeocode(address, apiKey){
  const text = String(address || "").trim();
  if(!text) throw new Error("Endereço vazio.");

  const url =
    "https://api.geoapify.com/v1/geocode/search?" +
    new URLSearchParams({
      text,
      format: "json",
      limit: "1",
      apiKey
    }).toString();

  const resp = await fetch(url);
  if(!resp.ok){
    throw new Error("Falha ao geocodificar endereço.");
  }

  const data = await resp.json();
  const first = data?.results?.[0];
  if(!first){
    throw new Error("Endereço não encontrado.");
  }

  return {
    lat: Number(first.lat),
    lon: Number(first.lon),
    formatted: first.formatted || text
  };
}




async function geoapifyRouteDistanceKm(originLat, originLon, destLat, destLon, apiKey){
  const url = "https://api.geoapify.com/v1/routematrix?apiKey=" + encodeURIComponent(apiKey);

  const body = {
    mode: "drive",
    sources: [
      { location: [Number(originLon), Number(originLat)] }
    ],
    targets: [
      { location: [Number(destLon), Number(destLat)] }
    ]
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if(!resp.ok){
    throw new Error("Falha ao calcular rota.");
  }

  const data = await resp.json();

  const distanceMeters =
    data?.sources_to_targets?.[0]?.[0]?.distance ??
    data?.results?.[0]?.distance ??
    null;

  if(distanceMeters === null || !isFinite(Number(distanceMeters))){
    throw new Error("Não foi possível calcular a distância.");
  }

  return Number(distanceMeters) / 1000;
}



// ====== HELPERS ======
function toId(v){ return String(v); }



async function readSettingsFromMongo() {
  const docs = await Setting.find();
  const out = {};
  for (const doc of docs) {
    out[doc.key] = doc.value;
  }
  return out;
}

async function writeSettingsToMongo(obj) {
  const entries = Object.entries(obj || {});
  for (const [key, value] of entries) {
    await Setting.findOneAndUpdate(
      { key },
      { key, value },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );
  }
}

function deepMergeSettings(CUR, IN) {
  const safeObj = (v) => (v && typeof v === "object" && !Array.isArray(v)) ? v : {};

  return {
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

    shipping_by_km: Array.isArray(IN.shipping_by_km)
      ? IN.shipping_by_km
      : (CUR.shipping_by_km || []),

    shipping_mode: (IN.shipping_mode || CUR.shipping_mode || "fixed"),
  };
}



function parseAddressText(addressText){
  const txt = String(addressText || "").trim();
  return {
    street: txt,
    number: "",
    neighborhood: "",
    city: "",
    complement: "",
    zip: ""
  };
}

async function upsertClientFromOrder(order) {
  const phone = normPhone(order.customer_phone || "");
  if (!phone) return;

  const existing = await Client.findOne({ phone });

  const nextData = {
    name: String(order.customer_name || "").trim() || "Sem nome",
    phone,
    email: "",
    notes: ""
  };

  const addressObj = parseAddressText(order.address || "");

  if (existing) {
    await Client.findByIdAndUpdate(existing._id, {
      ...nextData,
      address: {
        ...(existing.address || {}),
        street: addressObj.street || (existing.address?.street || "")
      }
    });
    return;
  }

  await Client.create({
    ...nextData,
    address: addressObj,
    coupons: []
  });
}





function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signAdminToken(payload) {
  const secret = process.env.ADMIN_TOKEN_SECRET;
  if (!secret) throw new Error("ADMIN_TOKEN_SECRET não definida");

  const data = base64url(JSON.stringify(payload));
  const sig = crypto
    .createHmac("sha256", secret)
    .update(data)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${data}.${sig}`;
}

function verifyAdminToken(token) {
  try {
    const secret = process.env.ADMIN_TOKEN_SECRET;
    if (!secret || !token || !token.includes(".")) return null;

    const [data, sig] = token.split(".");
    const expected = crypto
      .createHmac("sha256", secret)
      .update(data)
      .digest("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    if (sig !== expected) return null;

    const payload = JSON.parse(Buffer.from(data, "base64").toString("utf8"));
    if (!payload || !payload.exp || Date.now() > payload.exp) return null;

    return payload;
  } catch {
    return null;
  }
}

function requireAdminAuth(req, res, next) {
  const auth = String(req.headers.authorization || "");
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const payload = verifyAdminToken(token);

  if (!payload) {
    return res.status(401).json({ ok: false, error: "Não autorizado" });
  }

  req.admin = payload;
  next();
}


app.get("/favicon.ico", (req,res)=> res.status(204).end());

// ====== HEALTH ======
app.get("/health", (_req, res) => res.json({ ok: true }));
// ====== ADMIN RESET (ZERAR DADOS PARA VENDER PARA OUTRO CLIENTE) ======
app.post("/api/admin/reset", async (req, res) => {
  try {
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

    if (resetOrders) {
      await Order.deleteMany({});
      cleared.orders = true;
    }

    if (resetClients) {
      await Client.deleteMany({});
      cleared.clients = true;
    }

    if (resetProducts) {
      await Product.deleteMany({});
      cleared.products = true;
    }

    if (resetCategories) {
      await Category.deleteMany({});
      cleared.categories = true;
    }

    if (resetSettings) {
      await Setting.deleteMany({});
      await writeSettingsToMongo(defaultSettings);
      settings = buildSettings(defaultSettings);
      cleared.settings = true;
    }

    res.json({ ok: true, cleared });
  } catch (e) {
    console.error("admin reset error:", e);
    res.status(500).json({ ok:false, error:"Erro ao resetar dados" });
  }
});


app.post("/api/admin/login", async (req, res) => {
  try {
    const password = String(req.body?.password || "");
    const expected = String(process.env.ADMIN_PASSWORD || "");

    if (!expected) {
      return res.status(500).json({ ok: false, error: "ADMIN_PASSWORD não configurada" });
    }

    if (password !== expected) {
      return res.status(401).json({ ok: false, error: "Senha inválida" });
    }

    const token = signAdminToken({
      role: "admin",
      exp: Date.now() + 1000 * 60 * 60 * 24 * 7
    });

    res.json({ ok: true, token });
  } catch (e) {
    console.error("admin login error:", e);
    res.status(500).json({ ok: false, error: "Erro no login do admin" });
  }
});



app.post("/api/shipping/geocode-origin", async (req, res) => {
  try {
    const body = req.body || {};
    const address = String(body.address || "").trim();
    const apiKey = String(body.apiKey || "").trim();

    if(!address){
      return res.status(400).json({ ok:false, error:"Endereço da loja não informado." });
    }

    if(!apiKey){
      return res.status(400).json({ ok:false, error:"Geoapify API Key não informada." });
    }

    const geo = await geoapifyGeocode(address, apiKey);

    return res.json({
      ok: true,
      lat: Number(geo.lat),
      lon: Number(geo.lon),
      formatted: geo.formatted || address
    });
  } catch (e) {
    return res.status(400).json({
      ok: false,
      error: String(e?.message || e)
    });
  }
});






app.post("/api/shipping/quote", async (req, res) => {
  try {
    const settings = buildSettings(await readSettingsFromMongo());
    const body = req.body || {};

    const shippingMode = String(settings?.shipping_mode || "fixed");

    if (shippingMode === "fixed") {
      const fixed = Number(settings?.default_shipping || 0);
      return res.json({
        ok: true,
        mode: "fixed",
        distance_km: null,
        shipping_price: fixed,
        matched_rule: null
      });
    }

    const apiKey = String(settings?.geoapify_api_key || "").trim();
    const originAddress = String(settings?.delivery_origin_address || "").trim();
    const originLat = Number(settings?.delivery_origin_lat || 0);
    const originLon = Number(settings?.delivery_origin_lon || 0);

    const customerAddress = String(body.address || "").trim();
    const customerLat = Number(body.lat || 0);
    const customerLon = Number(body.lon || 0);

    if(!apiKey){
      return res.status(400).json({ ok:false, error:"Geoapify API Key não configurada." });
    }

    let sourceLat = originLat;
    let sourceLon = originLon;

    if(!(sourceLat && sourceLon)){
      if(!originAddress){
        return res.status(400).json({ ok:false, error:"Origem da loja não configurada." });
      }

      const originGeo = await geoapifyGeocode(originAddress, apiKey);
      sourceLat = originGeo.lat;
      sourceLon = originGeo.lon;
    }

let destLat = 0;
let destLon = 0;

if(customerLat && customerLon){
  destLat = customerLat;
  destLon = customerLon;
} else {
  const customerAddress = String(o.address || "").trim();

  if(!customerAddress){
    return res.status(400).json({ ok:false, error:"Endereço de entrega não informado." });
  }

  const destGeo = await geoapifyGeocode(customerAddress, apiKey);
  destLat = destGeo.lat;
  destLon = destGeo.lon;
}

distance_km = await geoapifyRouteDistanceKm(
  sourceLat,
  sourceLon,
  destLat,
  destLon,
  apiKey
);

    const ruleResult = resolveShippingRule(distanceKm, settings);

    if(!ruleResult.ok){
      return res.status(400).json({
        ok: false,
        error: ruleResult.error,
        distance_km: distanceKm
      });
    }

    return res.json({
      ok: true,
      mode: "by_km",
      distance_km: Number(distanceKm.toFixed(2)),
      shipping_price: Number(ruleResult.shipping_price || 0),
      matched_rule: ruleResult.matched_rule || null,
      used_fallback: !!ruleResult.used_fallback,
      destination: destinationText
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: String(e?.message || e)
    });
  }
});



// ====== SETTINGS ======
app.get("/api/settings", async (_req, res) => {
  try {
    const raw = await readSettingsFromMongo();
    const full = buildSettings(raw);

    const publicSettings = {
      shop_name: full.shop_name,
      shop_tagline: full.shop_tagline,
      whatsapp_number: full.whatsapp_number,
      google_reviews_url: full.google_reviews_url,
      address_base: full.address_base,
      logo_url: full.logo_url,
      store_url: full.store_url,
      preview_whatsapp_url: full.preview_whatsapp_url,
      instagram_url: full.instagram_url,
      theme: full.theme,
      store_ui: full.store_ui,
      shipping_mode: full.shipping_mode,
      shipping_by_km: full.shipping_by_km,
      shipping_max_km: full.shipping_max_km,
      shipping_out_of_area_mode: full.shipping_out_of_area_mode,
      shipping_fallback_price: full.shipping_fallback_price,
      default_shipping: full.default_shipping,
      business_hours: full.business_hours
    };

    return res.json({ ok: true, settings: publicSettings });
  } catch (e) {
    console.error("get public settings error:", e);
    return res.status(500).json({ ok: false, error: "Erro ao carregar settings" });
  }
});


// ===== SETTINGS (UPSERT / MERGE) =====
app.post("/api/settings", requireAdminAuth, async (req, res) => {
  try {
    const incoming = req.body || {};
    const cur = await readSettingsFromMongo();

    const merged = deepMergeSettings(cur, incoming);

    await writeSettingsToMongo(merged);

    settings = buildSettings(merged);

    console.log("SALVOU SETTINGS NO MONGO");
    console.log("NOME:", merged.shop_name);
    console.log("DEFAULT SHIPPING:", merged.default_shipping);
    console.log("PREVIEW URL:", merged.preview_whatsapp_url);
    console.log("BUSINESS HOURS:", JSON.stringify(merged.business_hours, null, 2));

    return res.json({ ok: true, settings: merged });
  } catch (e) {
    console.error("save settings error:", e);
    return res.status(500).json({ ok: false, error: "Erro ao salvar settings" });
  }
});



app.get("/api/admin/settings", requireAdminAuth, async (_req, res) => {
  try {
    const raw = await readSettingsFromMongo();
    const full = buildSettings(raw);
    return res.json({ ok: true, settings: full });
  } catch (e) {
    console.error("get admin settings error:", e);
    return res.status(500).json({ ok: false, error: "Erro ao carregar settings do admin" });
  }
});




// ====== CATEGORIES ======
app.get("/api/categories", async (req, res) => {
  try {
    const list = await Category.find().sort({ sort_order: 1, name: 1 });
    res.json(list);
  } catch (err) {
    console.error("Erro ao listar categorias:", err);
    res.status(500).json({ error: "Erro ao listar categorias" });
  }
});


app.post("/api/categories/bulk", async (req, res) => {
  try {
    const arr = req.body;
    if (!Array.isArray(arr)) {
      return res.status(400).json({ ok:false, error:"Envie um array de categorias" });
    }

    await Category.deleteMany({});
    const inserted = await Category.insertMany(arr);

    res.json({ ok:true, count: inserted.length });
  } catch (e) {
    console.error("bulk categories error:", e);
    res.status(500).json({ ok:false, error:"Erro ao importar categorias" });
  }
});




app.post("/api/categories", async (req, res) => {
  try {
    const body = req.body || {};

    const category = await Category.create({
      name: String(body.name || "").trim(),
      slug: String(body.slug || "").trim(),
      active: body.active !== false,
      sort_order: Number(body.sort_order || 0)
    });

    res.status(201).json(category);
  } catch (err) {
    console.error("Erro ao criar categoria:", err);
    res.status(500).json({ error: "Erro ao criar categoria" });
  }
});

app.put("/api/categories/:id", async (req, res) => {
  try {
    const body = req.body || {};

    const category = await Category.findByIdAndUpdate(
      req.params.id,
      {
        name: String(body.name || "").trim(),
        slug: String(body.slug || "").trim(),
        active: body.active !== false,
        sort_order: Number(body.sort_order || 0)
      },
      { new: true, runValidators: true }
    );

    if (!category) {
      return res.status(404).json({ error: "Categoria não encontrada" });
    }

    res.json(category);
  } catch (err) {
    console.error("Erro ao atualizar categoria:", err);
    res.status(500).json({ error: "Erro ao atualizar categoria" });
  }
});

app.delete("/api/categories/:id", async (req, res) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);

    if (!category) {
      return res.status(404).json({ error: "Categoria não encontrada" });
    }

    const removedName = String(category.name || "").trim();

    const result = await Product.deleteMany({
      category: removedName
    });

    res.json({
      ok: true,
      deleted_category_id: req.params.id,
      deleted_category_name: removedName,
      deleted_products: result.deletedCount || 0
    });
  } catch (err) {
    console.error("Erro ao excluir categoria:", err);
    res.status(500).json({ error: "Erro ao excluir categoria" });
  }
});


// ====== PRODUCTS ======
app.get("/api/products", async (req, res) => {
  try {
    const list = await Product.find().sort({ sort_order: 1, name: 1 });
    res.json(list);
  } catch (err) {
    console.error("Erro ao listar produtos:", err);
    res.status(500).json({ error: "Erro ao listar produtos" });
  }
});



// ✅ BULK (sobrescreve tudo)
app.post("/api/products/bulk", async (req, res) => {
  try {
    const arr = req.body;
    if (!Array.isArray(arr)) {
      return res.status(400).json({ ok:false, error:"Envie um array de produtos" });
    }

    await Product.deleteMany({});
    const inserted = await Product.insertMany(arr);

    res.json({ ok:true, count: inserted.length });
  } catch (e) {
    console.error("bulk products error:", e);
    res.status(500).json({ ok:false, error:"Erro ao importar produtos" });
  }
});



app.post("/api/products", async (req, res) => {
  try {
    const body = req.body || {};
    const categoryName = String(body.category || "").trim();

    const product = await Product.create({
      name: String(body.name || "").trim(),
      price: Number(body.price || 0),

      category: categoryName,
      subcategory: String(body.subcategory || "").trim(),
      description: String(body.description || ""),

      featured: !!body.featured,

      stock_enabled: body.stock_enabled !== false,
      stock_qty: Number(body.stock_qty || 0),
      low_stock_alert: Number(body.low_stock_alert || 5),

      paused: !!body.paused,

      image_url: String(body.image_url || ""),
      images: Array.isArray(body.images) ? body.images : [],

      addons: Array.isArray(body.addons) ? body.addons : [],

      flavors: Array.isArray(body.flavors)
      ? body.flavors.map(x => String(x || "").trim()).filter(Boolean)
      : [],

      discount_percent: Number(body.discount_percent || 0),

      sort_order: Number(body.sort_order || 0),
      active: body.active !== false,

      category_id: body.category_id || null
    });

    if (categoryName) {
      const exists = await Category.findOne({
        name: { $regex: new RegExp("^" + categoryName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i") }
      });

      if (!exists) {
        await Category.create({
          name: categoryName,
          slug: "",
          active: true,
          sort_order: 0
        });
      }
    }

    res.status(201).json(product);
  } catch (err) {
    console.error("Erro ao criar produto:", err);
    res.status(500).json({ error: "Erro ao criar produto" });
  }
});


app.put("/api/products/:id", async (req, res) => {
  try {
    const body = req.body || {};
    const categoryName = String(body.category || "").trim();

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      {
        name: String(body.name || "").trim(),
        price: Number(body.price || 0),
        category: categoryName,
        subcategory: String(body.subcategory || "").trim(),
        description: String(body.description || ""),
        featured: !!body.featured,
        stock_enabled: body.stock_enabled !== false,
        stock_qty: Number(body.stock_qty || 0),
        low_stock_alert: Number(body.low_stock_alert || 5),
        paused: !!body.paused,
        image_url: String(body.image_url || ""),
        images: Array.isArray(body.images) ? body.images : [],
        addons: Array.isArray(body.addons) ? body.addons : [],
        flavors: Array.isArray(body.flavors)
         ? body.flavors.map(x => String(x || "").trim()).filter(Boolean)
         : [],

        discount_percent: Number(body.discount_percent || 0),

        sort_order: Number(body.sort_order || 0),
        active: body.active !== false,

        category_id: body.category_id || null
      },
      { new: true, runValidators: true }
    );

    if (!product) {
      return res.status(404).json({ error: "Produto não encontrado" });
    }

    if (categoryName) {
      const exists = await Category.findOne({
        name: { $regex: new RegExp("^" + categoryName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i") }
      });

      if (!exists) {
        await Category.create({
          name: categoryName,
          slug: "",
          active: true,
          sort_order: 0
        });
      }
    }

    res.json(product);
  } catch (err) {
    console.error("Erro ao atualizar produto:", err);
    res.status(500).json({ error: "Erro ao atualizar produto" });
  }
});


app.delete("/api/products/:id", async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);

    if (!product) {
      return res.status(404).json({ error: "Produto não encontrado" });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("Erro ao excluir produto:", err);
    res.status(500).json({ error: "Erro ao excluir produto" });
  }
});

// ====== CLIENTS ======


app.post("/api/clients/bulk", async (req, res) => {
  try {
    const arr = req.body;
    if (!Array.isArray(arr)) {
      return res.status(400).json({ ok: false, error: "Envie um array de clientes" });
    }

    await Client.deleteMany({});
    const inserted = await Client.insertMany(arr);

    res.json({ ok: true, count: inserted.length });
  } catch (e) {
    console.error("bulk clients error:", e);
    res.status(500).json({ ok: false, error: "Erro ao importar clientes" });
  }
});





app.get("/api/clients", async (_req, res) => {
  try {
    const list = await Client.find().sort({ createdAt: -1 });
    res.json(list);
  } catch (e) {
    console.error("get clients error:", e);
    res.status(500).json({ ok: false, error: "Erro ao listar clientes" });
  }
});


app.get("/api/clients/by-phone", async (req, res) => {
  try {
    const phone = normPhone(req.query.phone || "");
    const all = await Client.find();
    const client = all.find(c => normPhone(c.phone) === phone) || null;
    if (!phone) {
      return res.status(400).json({ ok: false, error: "Telefone obrigatório" });
    }

    

    if (!client) {
      return res.json({ ok: true, client: null });
    }

    res.json({ ok: true, client });
  } catch (e) {
    console.error("client by phone error:", e);
    res.status(500).json({ ok: false, error: "Erro ao buscar cliente por telefone" });
  }
});



app.get("/api/clients/benefits", async (req, res) => {
  try {
    const phone = normPhone(req.query.phone || "");
    if (!phone) return res.status(400).json({ ok:false, error:"phone obrigatório" });

    const c = await Client.findOne({ phone });

    if (!c) {
      return res.json({ ok:true, found:false, phone, coupons:[], best:null });
    }

    const cps = Array.isArray(c.coupons)
      ? c.coupons.filter(cp => cp && cp.active !== false && !cp.used && Number(cp.uses_left ?? 1) > 0)
      : [];

    let best = null;
    for (const cp of cps) {
      if (!best) { best = cp; continue; }
      if (cp.type === "FREE_SHIPPING" && best.type !== "FREE_SHIPPING") { best = cp; continue; }
      if (best.type === "FREE_SHIPPING") continue;
      const curVal = Number(cp.value || 0);
      const bestVal = Number(best.value || 0);
      if (curVal > bestVal) best = cp;
    }

    res.json({ ok:true, found:true, phone, coupons:cps, best });
  } catch (e) {
    console.error("client benefits error:", e);
    res.status(500).json({ ok:false, error:"Erro ao buscar benefícios do cliente" });
  }
});

app.post("/api/clients", async (req, res) => {
  try {
    const body = req.body || {};
    const rawAddress = body.address;

    const addressObj =
      typeof rawAddress === "string"
        ? {
            street: String(rawAddress || "").trim(),
            number: "",
            neighborhood: "",
            city: "",
            complement: "",
            zip: ""
          }
        : {
            street: String(rawAddress?.street || ""),
            number: String(rawAddress?.number || ""),
            neighborhood: String(rawAddress?.neighborhood || ""),
            city: String(rawAddress?.city || ""),
            complement: String(rawAddress?.complement || ""),
            zip: String(rawAddress?.zip || "")
          };

    const client = await Client.create({
      name: String(body.name || "").trim(),
      phone: normPhone(body.phone || ""),
      email: String(body.email || "").trim(),
      notes: String(body.notes || ""),
      address: addressObj,
      coupons: Array.isArray(body.coupons) ? body.coupons : []
    });

    res.status(201).json(client);
  } catch (e) {
    console.error("create client error:", e);
    res.status(500).json({ ok: false, error: "Erro ao criar cliente" });
  }
});


app.put("/api/clients/:id", async (req, res) => {
  try {
    const body = req.body || {};
    const rawAddress = body.address;

    const addressObj =
      typeof rawAddress === "string"
        ? {
            street: String(rawAddress || "").trim(),
            number: "",
            neighborhood: "",
            city: "",
            complement: "",
            zip: ""
          }
        : {
            street: String(rawAddress?.street || ""),
            number: String(rawAddress?.number || ""),
            neighborhood: String(rawAddress?.neighborhood || ""),
            city: String(rawAddress?.city || ""),
            complement: String(rawAddress?.complement || ""),
            zip: String(rawAddress?.zip || "")
          };

    const client = await Client.findByIdAndUpdate(
      req.params.id,
      {
        name: String(body.name || "").trim(),
        phone: normPhone(body.phone || ""),
        email: String(body.email || "").trim(),
        notes: String(body.notes || ""),
        address: addressObj,
        coupons: Array.isArray(body.coupons) ? body.coupons : []
      },
      { new: true, runValidators: true }
    );

    if (!client) {
      return res.status(404).json({ ok: false, error: "Cliente não encontrado" });
    }

    res.json(client);
  } catch (e) {
    console.error("update client error:", e);
    res.status(500).json({ ok: false, error: "Erro ao atualizar cliente" });
  }
});


app.delete("/api/clients/:id", async (req, res) => {
  try {
    const client = await Client.findByIdAndDelete(req.params.id);

    if (!client) {
      return res.status(404).json({ ok: false, error: "Cliente não encontrado" });
    }

    res.json({ ok: true });
  } catch (e) {
    console.error("delete client error:", e);
    res.status(500).json({ ok: false, error: "Erro ao excluir cliente" });
  }
});


// coupons: add/remove
app.post("/api/clients/:id/coupons", async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ ok:false, error:"Cliente não encontrado" });

    const b = req.body || {};
    const type = String(b.type || "").toUpperCase();
    const value = Number(b.value || 0);
    const label = String(b.label || "").trim();

    if (!["FREE_SHIPPING","PERCENT","VALUE"].includes(type)) {
      return res.status(400).json({ ok:false, error:"Tipo inválido" });
    }

    if (type !== "FREE_SHIPPING" && !(value > 0)) {
      return res.status(400).json({ ok:false, error:"Valor inválido" });
    }

    const coupon = {
      id: Date.now().toString() + Math.floor(Math.random() * 1000),
      type,
      value: type === "FREE_SHIPPING" ? 0 : value,
      label: label || (type === "FREE_SHIPPING" ? "Frete grátis" : (type === "PERCENT" ? `${value}% OFF` : `R$ ${value} OFF`)),
      uses_left: 1,
      used: false,
      active: (b.active !== undefined ? !!b.active : true),
      created_at: nowIso()
    };

    const arr = Array.isArray(client.coupons) ? client.coupons : [];
    arr.push(coupon);

    client.coupons = arr;
    await client.save();

    res.json({ ok:true, coupon, client });
  } catch (e) {
    console.error("add coupon error:", e);
    res.status(500).json({ ok:false, error:"Erro ao adicionar cupom" });
  }
});

app.delete("/api/clients/:id/coupons/:couponId", async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ ok:false, error:"Cliente não encontrado" });

    const cId = String(req.params.couponId);
    const arr = Array.isArray(client.coupons) ? client.coupons : [];
    const before = arr.length;

    client.coupons = arr.filter(x => String(x.id) !== cId);
    const removed = before - client.coupons.length;

    await client.save();

    res.json({ ok:true, removed });
  } catch (e) {
    console.error("delete coupon error:", e);
    res.status(500).json({ ok:false, error:"Erro ao remover cupom" });
  }
});

// ====== ORDERS ======
app.get("/api/orders", async (_req, res) => {
  try {
    const list = await Order.find().sort({ created_at: -1 });
    res.json(list);
  } catch (e) {
    console.error("get orders error:", e);
    res.status(500).json({ ok: false, error: "Erro ao listar pedidos" });
  }
});

app.get("/api/orders/by-phone", async (req, res) => {
  try {
const phone = normPhone(req.query.phone || "");
const all = await Order.find().sort({ created_at: -1 });
const list = all.filter(o => normPhone(o.customer_phone) === phone);
    if (!phone) return res.status(400).json({ ok: false, error: "Telefone obrigatório" });

   

    res.json({ ok: true, phone, orders: list });
  } catch (e) {
    console.error("orders by phone error:", e);
    res.status(500).json({ ok: false, error: "Erro ao buscar pedidos por telefone" });
  }
});


app.post("/api/orders/bulk", async (req, res) => {
  try {
    const arr = req.body;
    if (!Array.isArray(arr)) {
      return res.status(400).json({ ok: false, error: "Envie um array de pedidos" });
    }

    await Order.deleteMany({});
    const inserted = await Order.insertMany(arr);

    res.json({ ok: true, count: inserted.length });
  } catch (e) {
    console.error("bulk orders error:", e);
    res.status(500).json({ ok: false, error: "Erro ao importar pedidos" });
  }
});




app.post("/api/orders", async (req, res) => {
  try {
    const products = await Product.find();
    const clients = await Client.find();
    const settingsNow = buildSettings(await readSettingsFromMongo());
    const o = req.body || {};
    const items = Array.isArray(o.items) ? o.items : [];

    // baixa de estoque automática
    for (const it of items) {
      const prod = products.find(p => toId(p.id) === toId(it.product_id));
      if (!prod) continue;

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

    for (const prod of products) {
 await Product.findByIdAndUpdate(prod._id, {
    stock_qty: Number(prod.stock_qty || 0),
    paused: !!prod.paused
  });
}


    const subtotal = items.reduce((acc,it)=> acc + (Number(it.price||0) * Number(it.qty||0)), 0);

    const orderType = String(o.type || "RETIRADA").toUpperCase();
    const isDelivery = orderType === "ENTREGA";

    // ===== REVALIDAÇÃO DE FRETE NO BACKEND =====
    let shipping = 0;
    let distance_km = null;

if(isDelivery){
  const shippingMode = String(settingsNow?.shipping_mode || "fixed");

  if(shippingMode === "fixed"){
    shipping = Number(settingsNow?.default_shipping || 0);
  } else {
    try{
      const apiKey = String(settingsNow?.geoapify_api_key || "").trim();
      const originAddress = String(settingsNow?.delivery_origin_address || "").trim();
      const originLat = Number(settingsNow?.delivery_origin_lat || 0);
      const originLon = Number(settingsNow?.delivery_origin_lon || 0);
      const customerAddress = String(o.address || "").trim();

      if(customerAddress && apiKey){
        let sourceLat = originLat;
        let sourceLon = originLon;

        if(!(sourceLat && sourceLon) && originAddress){
          const originGeo = await geoapifyGeocode(originAddress, apiKey);
          sourceLat = originGeo.lat;
          sourceLon = originGeo.lon;
        }

        if(sourceLat && sourceLon){
          const destGeo = await geoapifyGeocode(customerAddress, apiKey);
          distance_km = await geoapifyRouteDistanceKm(
            sourceLat,
            sourceLon,
            destGeo.lat,
            destGeo.lon,
            apiKey
          );

          const ruleResult = resolveShippingRule(distance_km, settingsNow);

          if(ruleResult.ok){
            shipping = Number(ruleResult.shipping_price || 0);
          } else {
            shipping = Number(o.shipping || 0);
          }
        } else {
          shipping = Number(o.shipping || 0);
        }
      } else {
        shipping = Number(o.shipping || 0);
      }
    }catch(e){
      console.error("Falha ao calcular frete automático:", e);
      shipping = Number(o.shipping || 0);
      distance_km = null;
    }
  }
}

    // desconto enviado pelo checkout (opcional)
    let discount = Number(o.discount || 0);

    // cupom automático por telefone
    let coupon_applied = null;
    const phoneNorm = normPhone(o.customer_phone || "");

    if(phoneNorm){
      const c = clients.find(x => normPhone(x.phone) === phoneNorm);

      const cps = (c && Array.isArray(c.coupons))
        ? c.coupons.filter(cp =>
            cp &&
            cp.active !== false &&
            !cp.used &&
            Number(cp.uses_left ?? 1) > 0
          )
        : [];

      const reqCouponId =
        (o.coupon_applied && o.coupon_applied.id) ||
        o.coupon_id ||
        o.couponId ||
        null;

      let best = null;

      if(reqCouponId){
        best = cps.find(cp => String(cp.id) === String(reqCouponId)) || null;
      }

      if(!best){
        for(const cp of cps){
          if(!best) { best = cp; continue; }
          if(cp.type === "FREE_SHIPPING" && best.type !== "FREE_SHIPPING"){ best = cp; continue; }
          if(best.type === "FREE_SHIPPING") continue;
          if(Number(cp.value||0) > Number(best.value||0)) best = cp;
        }
      }

      if(best){
        coupon_applied = { id: best.id, type: best.type, value: best.value, label: best.label || "" };

        if(discount <= 0){
          if(best.type === "FREE_SHIPPING"){
            discount = Math.min(shipping, shipping);
          }else if(best.type === "PERCENT"){
            discount = subtotal * (Number(best.value||0)/100);
          }else if(best.type === "VALUE"){
            discount = Number(best.value||0);
          }
        }

        best.used = true;
        best.uses_left = 0;
        best.active = false;

      if (c && c._id) {
      await Client.findByIdAndUpdate(c._id, { coupons: c.coupons || [] });
                      }

      }
    }

    discount = Math.max(0, Math.min(Number(discount||0), subtotal + shipping));
    const total = Math.max(0, subtotal + shipping - discount);

const order = await Order.create({
  created_at: nowIso(),
  status: "NOVO",
  paid: false,
  paid_at: null,

  type: orderType,
  customer_name: o.customer_name || "",
  customer_phone: o.customer_phone || "",
  address: o.address || "",
  location: o.location || null,
  payment: o.payment || "",
  notes: o.notes || "",

  scheduled_for: o.scheduled_for || null,

  need_nfce: !!o.need_nfce,
  cpf: o.cpf || "",

  distance_km: distance_km !== null ? Number(distance_km.toFixed(2)) : null,
  shipping,
  discount,
  coupon_applied,
  subtotal,
  total,
  items
});

await upsertClientFromOrder(order);

return res.json({ ok: true, order });




  } catch (e) {
    console.error("create order error:", e);
    return res.status(500).json({ ok:false, error: String(e?.message || e) });
  }
});

const VALID_STATUS = ["NOVO","ACEITO","RECUSADO","CONCLUIDO","CANCELADO"];

app.put("/api/orders/:id/status", async (req, res) => {
  try {
    const status = String((req.body || {}).status || "").toUpperCase();

    if (!VALID_STATUS.includes(status)) {
      return res.status(400).json({ ok: false, error: "Status inválido" });
    }

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ ok: false, error: "Pedido não encontrado" });
    }

    res.json({ ok: true, order });
  } catch (e) {
    console.error("update order status error:", e);
    res.status(500).json({ ok: false, error: "Erro ao atualizar status" });
  }
});


// marcar como pago + concluir
app.put("/api/orders/:id/pay", async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      {
        paid: true,
        paid_at: nowIso(),
        status: "CONCLUIDO"
      },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ ok: false, error: "Pedido não encontrado" });
    }

    res.json({ ok: true, order });
  } catch (e) {
    console.error("pay order error:", e);
    res.status(500).json({ ok: false, error: "Erro ao marcar pedido como pago" });
  }
});


// ====== SERVER START/STOP ======
let httpServer;

async function start() {
  if (httpServer) return;

  await connectDB();

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
