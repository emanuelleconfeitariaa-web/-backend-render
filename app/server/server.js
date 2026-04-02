

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
app.use(express.json({ limit: "35mb" }));
app.use(express.urlencoded({ extended: true, limit: "35mb" }));

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

    if (!origin || allowed.includes(origin)) return cb(null, true);
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



async function brasilApiCepLookup(cep){
  const cleanCep = String(cep || "").replace(/\D+/g, "");
  if(cleanCep.length !== 8){
    throw new Error("CEP inválido.");
  }

  const url = "https://brasilapi.com.br/api/cep/v2/" + encodeURIComponent(cleanCep);
  const resp = await fetch(url);

  if(!resp.ok){
    throw new Error("Falha ao consultar CEP.");
  }

  const data = await resp.json();

  return {
    cep: cleanCep,
    street: String(data.street || "").trim(),
    neighborhood: String(data.neighborhood || "").trim(),
    city: String(data.city || "").trim(),
    state: String(data.state || "").trim(),
    lat: Number(data.location?.coordinates?.latitude || 0),
    lon: Number(data.location?.coordinates?.longitude || 0)
  };
}

function extractCep(text){
  const m = String(text || "").match(/\b\d{5}-?\d{3}\b/);
  return m ? m[0].replace(/\D+/g, "") : "";
}

function mountAddressFromCepData(cepData, number, complement){
  const parts = [
    cepData.street,
    number,
    cepData.neighborhood,
    cepData.city,
    cepData.state,
    cepData.cep
  ].map(v => String(v || "").trim()).filter(Boolean);

  if(complement){
    parts.splice(2, 0, String(complement).trim());
  }

  return parts.join(", ");
}


function splitBrazilAddressParts(address){
  const text = String(address || "").trim();
  const cep = extractCep(text);

  const noCep = text.replace(/\b\d{5}-?\d{3}\b/g, "").replace(/\s+/g, " ").trim();
  const parts = noCep.split(",").map(s => s.trim()).filter(Boolean);

  // tentativa simples:
  // rua, numero, bairro, cidade, estado
  let street = "";
  let city = "";
  let state = "";

  if(parts.length >= 1) street = parts[0];
  if(parts.length >= 2 && /\d+/.test(parts[1])) street += " " + parts[1];
  if(parts.length >= 4) city = parts[parts.length - 2];
  if(parts.length >= 5) state = parts[parts.length - 1];

  // fallback comum para endereços curtos: "Paripueira, AL, 57935-000"
  if(!city && parts.length >= 1) city = parts[0];
  if(!state && parts.length >= 2) state = parts[1];

  return { street, city, state, postalcode: cep };
}

async function nominatimGeocode(address){
  const text = String(address || "").trim();
  if(!text) throw new Error("Endereço vazio.");

  const parts = splitBrazilAddressParts(text);

  const params = new URLSearchParams({
    format: "jsonv2",
    limit: "1",
    addressdetails: "1",
    countrycodes: "br",
    country: "Brasil"
  });

  // usa busca estruturada quando possível
  if(parts.street) params.set("street", parts.street);
  if(parts.city) params.set("city", parts.city);
  if(parts.state) params.set("state", parts.state);
  if(parts.postalcode) params.set("postalcode", parts.postalcode);

  // se não conseguiu estruturar nada útil, cai para busca livre
  const hasStructured =
    parts.street || parts.city || parts.state || parts.postalcode;

  if(!hasStructured){
    params.set("q", text);
  }

  const url = "https://nominatim.openstreetmap.org/search?" + params.toString();

  const resp = await fetch(url, {
    headers: {
      "User-Agent": "EmanuelleConfeitaria/1.0 (delivery lookup)",
      "Accept": "application/json"
    }
  });

  if(!resp.ok){
    throw new Error("Falha ao geocodificar endereço.");
  }

  const data = await resp.json();
  const first = Array.isArray(data) ? data[0] : null;

  if(!first){
    throw new Error("Endereço não encontrado.");
  }

  return {
    lat: Number(first.lat),
    lon: Number(first.lon),
    formatted: String(first.display_name || text)
  };
}
function addressLooksDetailed(address){
  const text = String(address || "").trim();

  // considera "detalhado" se tiver número ou rua/avenida/travessa/etc
  return (
    /\d/.test(text) ||
    /\b(rua|r\.|avenida|av\.|travessa|tv\.|alameda|rodovia|estrada|praça|praca)\b/i.test(text)
  );
}

async function geocodeBrazilAddress(address){
  const text = String(address || "").trim();
  if(!text) throw new Error("Endereço vazio.");

  const cep = extractCep(text);
  const hasDetailedAddress = addressLooksDetailed(text);

  // PRIORIDADE 1:
  // se o cliente digitou rua/número/endereço mais completo,
  // tenta primeiro geocodificar o texto completo
  if(hasDetailedAddress){
    try{
      return await nominatimGeocode(text);
    }catch(_err){
      // continua para fallback por CEP
    }
  }

  // PRIORIDADE 2:
  // se houver CEP, usa BrasilAPI e depois busca estruturada
  if(cep){
    try{
      const cepData = await brasilApiCepLookup(cep);

      // monta um endereço mais rico com o que foi digitado + dados do CEP
      const parts = splitBrazilAddressParts(text);

      const streetFromText = String(parts.street || "").trim();
      const cityFromText = String(parts.city || "").trim();
      const stateFromText = String(parts.state || "").trim();

      const street = streetFromText || String(cepData.street || "").trim();
      const city = cityFromText || String(cepData.city || "").trim();
      const state = stateFromText || String(cepData.state || "").trim();

      const params = new URLSearchParams({
        format: "jsonv2",
        limit: "1",
        addressdetails: "1",
        countrycodes: "br",
        country: "Brasil"
      });

      if(street) params.set("street", street);
      if(city) params.set("city", city);
      if(state) params.set("state", state);
      if(cepData.cep) params.set("postalcode", cepData.cep);

      const resp = await fetch(
        "https://nominatim.openstreetmap.org/search?" + params.toString(),
        {
          headers: {
            "User-Agent": "EmanuelleConfeitaria/1.0 (delivery lookup)",
            "Accept": "application/json"
          }
        }
      );

      if(resp.ok){
        const data = await resp.json();
        const first = Array.isArray(data) ? data[0] : null;

        if(first){
          return {
            lat: Number(first.lat),
            lon: Number(first.lon),
            formatted: String(first.display_name || text)
          };
        }
      }

      // PRIORIDADE 3:
      // só usa a coordenada aproximada do CEP como último fallback
      if(cepData.lat && cepData.lon){
        return {
          lat: cepData.lat,
          lon: cepData.lon,
          formatted: [
            cepData.street,
            cepData.neighborhood,
            cepData.city,
            cepData.state,
            cepData.cep
          ].filter(Boolean).join(", ")
        };
      }
    }catch(_err){
      // continua para fallback final abaixo
    }
  }

  // FALLBACK FINAL:
  // tenta texto livre/estruturado do que foi digitado
  return await nominatimGeocode(text);
}

async function osrmRouteDistanceKm(originLat, originLon, destLat, destLon){
  const coords =
    `${Number(originLon)},${Number(originLat)};${Number(destLon)},${Number(destLat)}`;

  const url =
    "https://router.project-osrm.org/route/v1/driving/" +
    coords +
    "?" +
    new URLSearchParams({
      overview: "false",
      alternatives: "false",
      steps: "false"
    }).toString();

  const resp = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "EmanuelleConfeitaria/1.0 (delivery route)"
    }
  });

  if(!resp.ok){
    throw new Error("Falha ao calcular rota.");
  }

  const data = await resp.json();
  const distanceMeters = data?.routes?.[0]?.distance;

  if(!isFinite(Number(distanceMeters))){
    throw new Error("Não foi possível calcular a distância.");
  }

  return Number(distanceMeters) / 1000;
}




function buildGoogleMapsSearchUrl(address){
  const q = String(address || "").trim();
  if(!q) return "";
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);
}

function buildGoogleMapsCoordsUrl(lat, lng){
  const nLat = Number(lat);
  const nLng = Number(lng);
  if(!isFinite(nLat) || !isFinite(nLng)) return "";
  return `https://www.google.com/maps?q=${nLat},${nLng}`;
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



async function upsertClientFromOrder(order) {
  const phone = String(order.customer_phone || "").trim();
  if (!phone) return;

  const name = String(order.customer_name || "").trim() || "Sem nome";
  const rawAddress = String(order.address || "").trim();

  const nextAddress = {
    street: rawAddress,
    number: "",
    neighborhood: "",
    city: "",
    complement: "",
    zip: ""
  };

  const existing = await Client.findOne({ phone });

  if (existing) {
    const update = {
      name,
      phone
    };

    // só atualiza endereço se o pedido trouxe endereço
    if (rawAddress) {
      update.address = nextAddress;
    }

    await Client.findByIdAndUpdate(existing._id, update);
    return;
  }

  await Client.create({
    name,
    phone,
    email: "",
    notes: "",
    address: rawAddress ? nextAddress : {
      street: "",
      number: "",
      neighborhood: "",
      city: "",
      complement: "",
      zip: ""
    },
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

    if(!address){
      return res.status(400).json({ ok:false, error:"Endereço da loja não informado." });
    }

    const geo = await geocodeBrazilAddress(address);

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
    const settingsNow = buildSettings(await readSettingsFromMongo());
    const body = req.body || {};

    const shippingMode = String(settingsNow?.shipping_mode || "fixed");

    if (shippingMode === "fixed") {
      const fixed = Number(settingsNow?.default_shipping || 0);
      return res.json({
        ok: true,
        mode: "fixed",
        distance_km: null,
        shipping_price: fixed,
        matched_rule: null
      });
    }

    const originAddress = String(settingsNow?.delivery_origin_address || "").trim();
    let sourceLat = Number(settingsNow?.delivery_origin_lat || 0);
    let sourceLon = Number(settingsNow?.delivery_origin_lon || 0);

const customerAddress = String(body.address || "").trim();

const customerLat = Number(
  body.lat ||
  body.location?.lat ||
  0
);

const customerLon = Number(
  body.lon ||
  body.lng ||
  body.location?.lon ||
  body.location?.lng ||
  0
);

    if(!(sourceLat && sourceLon)){
      if(!originAddress){
        return res.status(400).json({ ok:false, error:"Origem da loja não configurada." });
      }

      const originGeo = await geocodeBrazilAddress(originAddress);
      sourceLat = Number(originGeo.lat || 0);
      sourceLon = Number(originGeo.lon || 0);
    }

    let destLat = 0;
    let destLon = 0;
    let destinationText = customerAddress;

if(customerLat && customerLon){
  destLat = customerLat;
  destLon = customerLon;
}else{
  if(!customerAddress){
    return res.status(400).json({ ok:false, error:"Endereço de entrega não informado." });
  }

  const destGeo = await geocodeBrazilAddress(customerAddress);
  destLat = Number(destGeo.lat || 0);
  destLon = Number(destGeo.lon || 0);
      destinationText = String(destGeo.formatted || customerAddress);
    }

    const distanceKm = await osrmRouteDistanceKm(
      sourceLat,
      sourceLon,
      destLat,
      destLon
    );

    const ruleResult = resolveShippingRule(distanceKm, settingsNow);

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
      pix_label: full.pix_label,
      pix_key: full.pix_key,
      payment_pix_key: full.payment_pix_key,
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
    const fields =
      "name price category subcategory description featured stock_enabled stock_qty low_stock_alert paused active discount_percent addons flavors image_url images sort_order";

    const docs = await Product.find({}, fields).sort({ sort_order: 1, name: 1 });

    const list = docs.map((doc) => {
      const p = doc.toJSON();

      p.images = Array.isArray(p.images)
        ? p.images.map(x => String(x || "").trim()).filter(Boolean).slice(0, 2)
        : [];

      p.image_url = String(p.image_url || "").trim();

      if (!p.image_url && p.images.length) {
        p.image_url = p.images[0];
      }

      return p;
    });

    res.json(list);
  } catch (err) {
    console.error("Erro ao listar produtos:", err);
    res.status(500).json({ error: "Erro ao listar produtos" });
  }
});



app.get("/api/products/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ error: "Produto não encontrado" });
    }

    res.json(product);
  } catch (err) {
    console.error("Erro ao buscar produto:", err);
    res.status(500).json({ error: "Erro ao buscar produto" });
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

    const client = await Client.create({
      name: String(body.name || "").trim(),
      phone: String(body.phone || "").trim(),
      email: String(body.email || "").trim(),
      notes: String(body.notes || ""),
      address: {
        street: String(body.address?.street || ""),
        number: String(body.address?.number || ""),
        neighborhood: String(body.address?.neighborhood || ""),
        city: String(body.address?.city || ""),
        complement: String(body.address?.complement || ""),
        zip: String(body.address?.zip || "")
      },
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

    const client = await Client.findByIdAndUpdate(
      req.params.id,
      {
        name: String(body.name || "").trim(),
        phone: String(body.phone || "").trim(),
        email: String(body.email || "").trim(),
        notes: String(body.notes || ""),
        address: {
          street: String(body.address?.street || ""),
          number: String(body.address?.number || ""),
          neighborhood: String(body.address?.neighborhood || ""),
          city: String(body.address?.city || ""),
          complement: String(body.address?.complement || ""),
          zip: String(body.address?.zip || "")
        },
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

const deliveryAddress = {
  zip: String(o.delivery_address?.zip || "").trim(),
  street: String(o.delivery_address?.street || "").trim(),
  number: String(o.delivery_address?.number || "").trim(),
  complement: String(o.delivery_address?.complement || "").trim(),
  neighborhood: String(o.delivery_address?.neighborhood || "").trim(),
  city: String(o.delivery_address?.city || "").trim(),
  state: String(o.delivery_address?.state || "").trim()
};

let finalLocation = null;
let addressLabel = String(o.address || "").trim();
let mapUrl = String(o.map_url || "").trim();

// ===== REVALIDAÇÃO DE FRETE NO BACKEND =====
let shipping = 0;
let distance_km = null;

    if(isDelivery){
      const shippingMode = String(settingsNow?.shipping_mode || "fixed");

      if(shippingMode === "fixed"){
        shipping = Number(settingsNow?.default_shipping || 0);
      } else {
        const apiKey = String(settingsNow?.geoapify_api_key || "").trim();
        const originAddress = String(settingsNow?.delivery_origin_address || "").trim();
        const originLat = Number(settingsNow?.delivery_origin_lat || 0);
        const originLon = Number(settingsNow?.delivery_origin_lon || 0);
        const customerAddress = String(o.address || "").trim();

        if(!customerAddress){
          return res.status(400).json({ ok:false, error:"Endereço de entrega não informado." });
        }


const reqLat = Number(
  o.location?.lat ??
  o.location?.latitude ??
  null
);

const reqLng = Number(
  o.location?.lng ??
  o.location?.lon ??
  o.location?.longitude ??
  null
);

if(isFinite(reqLat) && isFinite(reqLng)){
  finalLocation = {
    lat: reqLat,
    lng: reqLng
  };
  addressLabel = customerAddress || addressLabel;
  mapUrl = buildGoogleMapsCoordsUrl(reqLat, reqLng);
}


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

        const destGeo = await geoapifyGeocode(customerAddress, apiKey);
        distance_km = await geoapifyRouteDistanceKm(
          sourceLat,
          sourceLon,
          destGeo.lat,
          destGeo.lon,
          apiKey
        );

        const ruleResult = resolveShippingRule(distance_km, settingsNow);

        if(!ruleResult.ok){
          return res.status(400).json({
            ok: false,
            error: ruleResult.error,
            distance_km: Number(distance_km.toFixed(2))
          });
        }

        shipping = Number(ruleResult.shipping_price || 0);
      }

if(!finalLocation){
  try{
    const destGeoFallback = await geocodeBrazilAddress(customerAddress);
    finalLocation = {
      lat: Number(destGeoFallback.lat),
      lng: Number(destGeoFallback.lon)
    };
    addressLabel = String(destGeoFallback.formatted || customerAddress || "").trim();
    mapUrl = buildGoogleMapsCoordsUrl(finalLocation.lat, finalLocation.lng);
  }catch(_e){
    if(!mapUrl){
      mapUrl = buildGoogleMapsSearchUrl(customerAddress);
    }
    if(!addressLabel){
      addressLabel = customerAddress;
    }
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
  delivery_address: deliveryAddress,
  location: finalLocation ? {
    lat: Number(finalLocation.lat),
    lng: Number(finalLocation.lng)
  } : {
    lat: null,
    lng: null
  },
  map_url: mapUrl || "",
  address_label: addressLabel || "",
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

const VALID_STATUS = ["NOVO", "ACEITO", "SAIU_PARA_ENTREGA", "RECUSADO", "CANCELADO", "CONCLUIDO"];

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
