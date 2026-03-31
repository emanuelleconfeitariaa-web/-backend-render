const API = (() => {
  const host = window.location.hostname;
  const protocol = window.location.protocol;

  if (
    protocol === "file:" ||
    host === "127.0.0.1" ||
    host === "localhost" ||
    host === ""
  ) {
    return "http://127.0.0.1:3210";
  }

  return "https://backend-render-9s32.onrender.com";
})();

const $ = (id)=>document.getElementById(id);
const IS_PDV = new URLSearchParams(window.location.search).get("pdv") === "1";

let SETTINGS = null;
let PRODUCTS = [];
let ACTIVE_CATEGORY = "";
let IS_AUTO_SCROLLING = false;
let SEARCH = "";
let FILTER_SORT = "DEFAULT";
let FILTER_SHOW = "ALL";
let DYNAMIC_SHIPPING = null;
let FEATURED_CATS = new Set();
let SHIPPING_QUOTE_TIMER = null;
let CUSTOMER_GEO = null; // { lat, lon }

function setVal(id, v){
  const el = document.getElementById(id);
  if(el) el.value = v;
}

function setText(id, v){
  const el = document.getElementById(id);
  if(el) el.textContent = v;
}




function renderModalFlavors(p){
  const wrap = $("prodFlavorWrap");
  const list = $("prodFlavorList");
  if(!wrap || !list) return;

  const flavors = Array.isArray(p?.flavors) ? p.flavors.map(x => String(x || "").trim()).filter(Boolean) : [];

  if(!flavors.length){
    wrap.style.display = "none";
    list.innerHTML = "";
    MODAL_FLAVOR = "";
    return;
  }

  wrap.style.display = "block";

  list.innerHTML = flavors.map((flavor, i) => `
    <label style="
      display:flex; align-items:center; gap:10px;
      padding: 8px 12px;
      border:1px solid rgba(0,0,0,.18);
      border-radius:8px;
      background: rgba(255,255,255,.18);
      font-size: 13px;
      font-weight: 600;
      cursor:pointer;
    ">
      <input type="radio" name="prodFlavor" value="${escapeAttr(flavor)}" ${i === 0 ? "checked" : ""}>
      <span>${escapeHtml(flavor)}</span>
    </label>
  `).join("");

  MODAL_FLAVOR = flavors[0] || "";

  list.querySelectorAll('input[name="prodFlavor"]').forEach(inp=>{
    inp.addEventListener("change", ()=>{
      if(inp.checked){
        MODAL_FLAVOR = String(inp.value || "").trim();
      }
    });
  });
}



function productFlavorLabel(flavor){
  const f = String(flavor || "").trim();
  return f ? ` • Sabor: ${f}` : "";
}

async function loadCategories(){
  try{
    const res = await fetch(API + "/api/categories");
    const cats = await res.json();
    FEATURED_CATS = new Set((cats||[])
      .filter(c => !!c.featured)
      .map(c => String(c.name||"").trim())
    );
  } catch(e){
    FEATURED_CATS = new Set();
  }
}


let CART = []; // {product_id, name, price, qty}
// modal produto
let MODAL_PRODUCT = null;
let MODAL_QTY = 1;
let MODAL_ADDONS = [];  
let MODAL_FLAVOR = "";    
let __modalBasePrice = 0;   

function sendCartToPDV(){
  const subtotal = CART.reduce((acc,it)=> acc + (Number(it.price||0) * Number(it.qty||0)), 0);

  const payload = {
    type: "PDV_CART",
    cart: CART.map(it => ({
      product_id: it.product_id,
      name: it.name,
      price: Number(it.price || 0),
      qty: Math.max(1, Number(it.qty || 1)),
      addons: Array.isArray(it.addons) ? it.addons : []
    })),
    subtotal,
    total: subtotal
  };

  window.parent.postMessage(payload, "*");
}

function normDiscountPercent(v){
  const n = Number(v);
  if(!isFinite(n) || n <= 0) return 0;
  if(n >= 99) return 99;
  return Math.round(n);
}


// ===== Ícones oficiais (embutidos) =====
const ICONS = {
  whatsapp: `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <path fill="#25D366" d="M32 2C15.5 2 2.1 15.4 2.1 31.9c0 5.8 1.7 11.3 4.6 16.1L3 62l14.5-3.6c4.4 2.4 9.4 3.7 14.5 3.7 16.5 0 29.9-13.4 29.9-29.9C61.9 15.4 48.5 2 32 2z"/>
  <path fill="#FFFFFF" d="M48.2 37.6c-.9-.5-5.3-2.6-6.1-2.9-.8-.3-1.4-.5-2 .5-.6.9-2.3 2.9-2.8 3.5-.5.6-1 .7-1.9.2-.9-.5-3.7-1.4-7.1-4.4-2.6-2.3-4.4-5.1-4.9-6-.5-.9-.1-1.4.4-1.9.4-.4.9-1 .1-1.7.6-.7.9-1.2 1.3-2 .4-.8.2-1.5-.1-2.1-.3-.5-2-4.9-2.8-6.7-.8-1.8-1.6-1.5-2.2-1.5h-1.9c-.7 0-1.7.3-2.6 1.3-.9 1-3.4 3.3-3.4 8.1s3.5 9.4 4 10.1c.5.7 6.9 10.5 16.8 14.8 2.3 1 4.1 1.6 5.5 2 2.3.7 4.5.6 6.2.4 1.9-.3 5.3-2.2 6.1-4.3.8-2.1.8-3.9.6-4.3-.3-.5-.8-.7-1.7-1.1z"/>
</svg>
`)}`,

  instagram: `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="ig" x1="12" y1="52" x2="52" y2="12" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FEDA75"/>
      <stop offset="0.35" stop-color="#FA7E1E"/>
      <stop offset="0.55" stop-color="#D62976"/>
      <stop offset="0.75" stop-color="#962FBF"/>
      <stop offset="1" stop-color="#4F5BD5"/>
    </linearGradient>
  </defs>
  <rect x="10" y="10" width="44" height="44" rx="12" fill="url(#ig)"/>
  <rect x="19" y="19" width="26" height="26" rx="13" fill="none" stroke="#fff" stroke-width="4"/>
  <circle cx="44.5" cy="19.5" r="2.8" fill="#fff"/>
</svg>
`)}`,
};



function getDiscountPercent(p){
  // aceita vários nomes (caso o admin/backend esteja salvando diferente)
  return normDiscountPercent(
    (p && (p.discount_percent ?? p.discountPercent ?? p.discount ?? p.desconto ?? 0))
  );
}

function discountedPrice(price, discountPercent){
  const p = Number(price || 0);
  const d = normDiscountPercent(discountPercent);
  if(!d) return p;
  return Math.round(p * (1 - d/100) * 100) / 100;
}





async function useExactLocation(){
  const geoMsg = $("geoMsg");
  if(geoMsg){
    geoMsg.style.display = "block";
    geoMsg.textContent = "Solicitando sua localização...";
  }

  if(!navigator.geolocation){
    if(geoMsg){
      geoMsg.textContent = "Seu navegador não suporta localização.";
    }
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      CUSTOMER_GEO = {
        lat: Number(pos.coords.latitude),
        lon: Number(pos.coords.longitude)
      };

      if(geoMsg){
        geoMsg.textContent = "Localização capturada com sucesso.";
      }

      if(String($("type")?.value || "") === "ENTREGA"){
        await quoteShippingByAddress();
      }
    },
    (err) => {
      CUSTOMER_GEO = null;

      let msg = "Não foi possível obter sua localização.";
      if(err && err.code === 1) msg = "Permissão de localização negada.";
      if(err && err.code === 2) msg = "Localização indisponível.";
      if(err && err.code === 3) msg = "Tempo esgotado ao obter localização.";

      if(geoMsg){
        geoMsg.style.display = "block";
        geoMsg.textContent = msg;
      }
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );
}






function openProdModal(p){
  MODAL_PRODUCT = p;
  MODAL_QTY = 1;

  $("prodTitle").textContent = p.name || "Produto";
  $("prodCat").textContent = [p.category, p.subcategory].filter(Boolean).join(" • ") || "";

  const desc = (p.description || "").trim();
  $("prodDesc").textContent = desc || "Sem descrição.";

  __modalBasePrice = Number(p.price || 0);
    MODAL_ADDONS = [];
    renderModalAddons(p);
    MODAL_FLAVOR = "";
    renderModalFlavors(p);

      // ===== DESCONTO no MODAL =====
  const disc = normDiscountPercent(p.discount_percent);
  const oldBase = Number(p.price || 0);

  const badgeEl = $("prodDiscountBadge");
  const oldEl = $("prodOldPrice");

  if(disc && oldBase > 0){
    if(badgeEl){
      badgeEl.style.display = "inline-flex";
      badgeEl.textContent = `-${disc}%`;
    }
    if(oldEl){
      oldEl.style.display = "block";
      oldEl.textContent = `de ${money(oldBase)}`;
    }
  } else {
    if(badgeEl){
      badgeEl.style.display = "none";
      badgeEl.textContent = "";
    }
    if(oldEl){
      oldEl.style.display = "none";
      oldEl.textContent = "";
    }
  }
    popModal($("prodBack") || document.querySelector(".modalBackdrop.open") || document.querySelector(".modalBackdrop"));
    updateModalPrice();


  // imagem
const imgs = getProductImages(p);
const gallery = $("prodGallery");
const noImg = $("prodNoImg");

if(gallery){
  if(imgs.length){
    gallery.innerHTML = imgs.map((src, i) => `
      <div class="prodSlide">
        <img src="${src}" alt="${escapeAttr((p.name || "Produto") + " " + (i + 1))}">
      </div>
    `).join("");
    gallery.style.display = "flex";
    if(noImg) noImg.style.display = "none";
  }else{
    gallery.innerHTML = "";
    gallery.style.display = "none";
    if(noImg) noImg.style.display = "block";
  }
}

  // estoque
  if(p.stock_enabled){
    const st = Number(p.stock_qty||0);
    $("prodStock").textContent = (st<=0) ? "Indisponível" : `Disponível: ${st}`;
  } else {
    $("prodStock").textContent = "";
  }

  $("prodQty").textContent = String(MODAL_QTY);

  $("prodBack").classList.add("open");
}

function closeProdModal(){
  $("prodBack").classList.remove("open");
  MODAL_PRODUCT = null;
  MODAL_ADDONS = [];
  __modalBasePrice = 0;
}



function addToCart(p, qty, addons, flavor){
  qty = Number(qty||0);
  if(!p || qty<=0) return;

  const lineFlavor = String(flavor || "").trim();
  const lineAddons = Array.isArray(addons) ? addons.map(a=>({
    id: String(a.id ?? ""),
    name: String(a.name ?? ""),
    price: Number(a.price ?? 0)
  })) : [];

  const lineId = makeLineId(p.id, lineAddons, lineFlavor);

  // estoque: soma TODAS as linhas do mesmo produto (com/sem adicionais)
  const currentQtyProduct = CART
    .filter(it => String(it.product_id) === String(p.id))
    .reduce((a,it)=> a + Number(it.qty||0), 0);

  if(p.stock_enabled){
    const max = Number(p.stock_qty||0);
    if(currentQtyProduct + qty > max){
      toast("Sem estoque suficiente.");
      return false;
    }
  }

  const existing = CART.find(it => String(it.line_id || it.product_id) === String(lineId));

  const disc = normDiscountPercent(p.discount_percent);
  const base = discountedPrice(Number(p.price||0), disc);
  const unit = base + addonsTotal(lineAddons);

  const nameLine = (p.name || "Produto") + productFlavorLabel(lineFlavor) + addonsLabel(lineAddons);

  if(existing){
    existing.qty = Number(existing.qty||0) + qty;
  }else{
    CART.push({
      line_id: lineId,
      product_id: p.id,
      name: nameLine,
      price: unit,
      qty,
      addons: lineAddons,
      flavor: lineFlavor,
    });
  }

  renderCart();
  toast("Adicionado ✅");
  return true;
}

    function money(n){ return Number(n||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}); }
    function phoneOnly(s){ return (s||"").replace(/\D/g,""); }

    function toast(msg){
      const t = $("toast");
      t.textContent = msg;
      t.style.display = "block";
      clearTimeout(toast._t);
      toast._t = setTimeout(()=> t.style.display="none", 2400);
    }

    function escapeHtml(s){
      return String(s||"")
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");
    }

function getCategoryIcon(cat){
  const c = String(cat || "").toLowerCase().trim();

  if (c.includes("bolo")) return "🎂";
  if (c.includes("salgad")) return "🥟";
  if (c.includes("milk")) return "🥤";
  if (c.includes("shake")) return "🥤";
  if (c.includes("doce")) return "🍬";
  if (c.includes("torta")) return "🥧";
  if (c.includes("bebida")) return "🥤";
  if (c.includes("brigadeiro")) return "🍫";
  if (c.includes("cookie")) return "🍪";
  if (c.includes("cupcake")) return "🧁";

  return "🧁";
}



let __catScrollTicking = false;

function getCategoryProbeY(){
  const bar = $("catsBar");
  if(!bar) return 20;
  const rect = bar.getBoundingClientRect();
  return rect.bottom + 10; // logo abaixo da barra sticky
}



let scrollSpyTicking = false;

function updateActiveCategoryFromScroll() {
  if (IS_AUTO_SCROLLING) return;

  const frame = document.querySelector(".frame");
  const bar = document.getElementById("catsBar");
  if(!frame || !bar) return;

  const frameRect = frame.getBoundingClientRect();
  const barRect = bar.getBoundingClientRect();
  const threshold = barRect.bottom - frameRect.top + 8;

  const sections = document.querySelectorAll(".catBlock[data-cat-section]");
  let currentCat = null;

  sections.forEach(sec => {
    const secTop = sec.offsetTop - frame.scrollTop;
    const secBottom = secTop + sec.offsetHeight;

    if (secTop <= threshold && secBottom > threshold) {
      currentCat = sec.getAttribute("data-cat-section");
    }
  });

  if (currentCat && currentCat !== ACTIVE_CATEGORY) {
    setActiveCategoryChip(currentCat, false);
  }
}

function syncActiveCategoryDuringAutoScroll() {
  updateActiveCategoryFromScroll();
}




// Escuta a rolagem do dedo na tela e atualiza a barrinha
const frameEl = document.querySelector(".frame");

frameEl?.addEventListener("scroll", () => {
  if (!scrollSpyTicking) {
    requestAnimationFrame(() => {
      updateActiveCategoryFromScroll();
      scrollSpyTicking = false;
    });
    scrollSpyTicking = true;
  }
}, { passive: true });


    function escapeAttr(s){ return escapeHtml(s).replaceAll("\n"," "); }

      function addonsTotal(addons){
  return (addons||[]).reduce((a,x)=> a + Number(x.price||0), 0);
}

function makeLineId(productId, addons, flavor){
  const ids = (addons||[]).map(a=>String(a.id)).sort().join(",");
  const fl = String(flavor || "").trim();
  return `${String(productId)}|${fl}|${ids}`;
}

function addonsLabel(addons){
  const a = (addons||[]).map(x=>x?.name).filter(Boolean);
  return a.length ? ` (+ ${a.join(", ")})` : "";
}

function readCheckedAddonsFromModal(){
  const box = $("prodAddonsList");
  if(!box) return [];
  return [...box.querySelectorAll("input[type=checkbox][data-addon]:checked")].map(inp=>{
    const raw = inp.getAttribute("data-addon") || "{}";
    try { return JSON.parse(raw); } catch { return null; }
  }).filter(Boolean);
}

function renderModalAddons(p){  
  const wrap = $("prodAddonsWrap");
  const list = $("prodAddonsList");
  if(!wrap || !list) return;

  const addons = Array.isArray(p?.addons) ? p.addons : [];
  if(!addons.length){
    wrap.style.display = "none";
    list.innerHTML = "";
    MODAL_ADDONS = [];
    return;
  }

  wrap.style.display = "block";

  // deixa os adicionais como "tags" em grade (quebra linha)
    list.style.display = "flex";
    list.style.flexWrap = "wrap";
    list.style.gap = "10px";


  list.innerHTML = addons.map(a=>{
    const id = String(a.id ?? "");
    const name = String(a.name ?? "Adicional");
    const price = Number(a.price ?? 0);

    const payload = escapeAttr(JSON.stringify({ id, name, price }));
    const checked = MODAL_ADDONS.some(x => String(x.id) === id);

return `
  <label style="
    display:flex; align-items:center; gap:10px;
    padding: 8px 12px;
    border:1px solid rgba(0,0,0,.18);
    border-radius:6px;
    background: rgba(255,255,255,.18);
    font-size: 13px;
    font-weight: 600;
    width: fit-content;
  ">
    <input type="checkbox" data-addon="${payload}" ${checked ? "checked" : ""}
      style="width:14px;height:14px;margin:0;">
    <span>${escapeHtml(name)}</span>
    ${price ? `<span style="font-weight:700;opacity:.85;">(+${money(price)})</span>` : ``}
  </label>
`;

  }).join("");

  // evento único (change) no container
  list.onchange = ()=>{
    MODAL_ADDONS = readCheckedAddonsFromModal();
    updateModalPrice();
  };

  // reset seleção ao abrir
  MODAL_ADDONS = [];
}

function updateModalPrice(){
  const qty = Number(MODAL_QTY || 1);
  const add = addonsTotal(MODAL_ADDONS);
  const disc = normDiscountPercent(MODAL_PRODUCT?.discount_percent);
  const base = discountedPrice(Number(__modalBasePrice || 0), disc);
  const unit = base + add;

  const total = unit * qty;

  const priceEl = $("prodPrice");
  if(priceEl) priceEl.textContent = money(total);

  const qEl = $("prodQty");
  if(qEl) qEl.textContent = String(qty);
}


    function isOpenNow(){
      const bh = SETTINGS?.business_hours;
      if(!bh?.enabled) return { ok:true };

      const tz = bh.timezone || "America/Maceio";
      const now = new Date();
      const weekday = new Intl.DateTimeFormat("pt-BR",{timeZone:tz,weekday:"short"}).format(now).toLowerCase();
      const map = {"seg.":"seg","ter.":"ter","qua.":"qua","qui.":"qui","sex.":"sex","sáb.":"sab","sab.":"sab","dom.":"dom"};
      const key = map[weekday] || "seg";
      const day = bh.days?.[key];
      if(!day || !day.enabled) return { ok:false };

      const hhmm = new Intl.DateTimeFormat("pt-BR",{timeZone:tz,hour:"2-digit",minute:"2-digit",hour12:false}).format(now);
      const cur = hhmm.replace(":","");
      const open = String(day.open||"08:00").replace(":","");
      const close = String(day.close||"18:00").replace(":","");
      return { ok: cur>=open && cur<=close };
    }

      function applyTheme(){
      const th = SETTINGS?.theme || {};
      const ui = SETTINGS?.store_ui || {};


      // ===== Modal Informação: cores =====
const im = SETTINGS?.store_ui?.info_modal || {};
document.documentElement.style.setProperty("--info-bg", im.bg || "#ffffff");
document.documentElement.style.setProperty("--info-text", im.text || "#1f1f1f");
document.documentElement.style.setProperty("--info-border", im.border || "#e9e9e9");
document.documentElement.style.setProperty("--info-today-bg", im.today_bg || "#e8f1ff");


 // ✅ cor do "modal/área dos produtos"
document.documentElement.style.setProperty(
  "--productsBg",
  ui.products_bg || "rgba(255,255,255,.40)"
);

      document.documentElement.style.setProperty("--bannerText", ui.text_banner || "#ffffff");
      document.documentElement.style.setProperty("--storeText",  ui.text_main   || "#2b1b17");
      document.documentElement.style.setProperty("--modalText",  ui.text_modal  || "#2b1b17");
      document.documentElement.style.setProperty("--cartText",   ui.text_cart   || "#2b1b17");


      document.documentElement.style.setProperty("--primary", th.primary || "#7a4a3e");
      document.documentElement.style.setProperty("--secondary", th.secondary || "#d9a5b2");
      document.documentElement.style.setProperty("--soft", th.soft || "#f4d4d7");
      document.documentElement.style.setProperty("--bg", th.bg || "#f6ebe5");
      
      document.documentElement.style.setProperty("--panelsBg", ui.panels_bg || "#f6ebe5");

      document.documentElement.style.setProperty("--pageBg", ui.page_bg || "#f4d4d7");
      document.documentElement.style.setProperty("--bannerBg", ui.banner_bg || (th.primary || "#7a4a3e"));
      document.documentElement.style.setProperty("--bannerHeight", (ui.banner_height || 104) + "px");

      document.documentElement.style.setProperty("--logoSize", (ui.logo_size || 56) + "px");

      // banner image
const useImg = (ui.banner_use_image !== false);
const img = ui.banner_image_dataurl || null;
const dim = (ui.banner_dim !== undefined) ? Number(ui.banner_dim) : 0.50;

document.documentElement.style.setProperty("--bannerDim", String(dim));

if(useImg && img){
  document.documentElement.style.setProperty("--bannerImg", `url(${img})`);
} else {
  document.documentElement.style.removeProperty("--bannerImg");
}

      $("shopName").textContent = SETTINGS.shop_name || "Emanuelle Confeitaria";
      $("shopTag").textContent  = SETTINGS.shop_tagline || "Retirada ou Entrega • Pedido vai pro WhatsApp";
      $("logo").src = ui.logo_image_dataurl || SETTINGS.logo_url || "../assets/logo.png";
      $("ratingTxt").textContent = String(ui.rating || "4.9");

      const open = isOpenNow();
      if(open.ok){
        $("statusTxt").textContent = "Aberto";
        $("statusPill").querySelector(".dot").style.background = "#5dff92";
      }else{
        $("statusTxt").textContent = "Fechado";
        $("statusPill").querySelector(".dot").style.background = "#ff6a6a";
      }

      // mostra/oculta busca
      $("toolsBar").style.display = (ui.show_search === false) ? "none" : "flex";
    }




function getProductImages(p){
  const arr = Array.isArray(p?.images)
    ? p.images.map(x => String(x || "").trim()).filter(Boolean).slice(0, 2)
    : [];

  if(arr.length) return arr;

  const one = String(p?.image_url || "").trim();
  return one ? [one] : [];
}



async function loadSettings(){
  const res = await fetch(API + "/api/settings");
  const data = await res.json().catch(()=> ({}));
  SETTINGS = (data && data.settings) ? data.settings : data;

  applyTheme();
  applyReviewsLink();

  const ig = document.getElementById("igBtn");
  if(ig){
    const url = (SETTINGS?.instagram_url || "").trim() || ig.getAttribute("href") || "https://instagram.com/";
    ig.setAttribute("href", url);
  }
}
function applyReviewsLink(){
  const btn = document.getElementById("reviewsBtn");
  if(!btn) return;

  const currentHref = (btn.getAttribute("href") || "").trim();
  if(currentHref && currentHref !== "#"){
    btn.style.display = "inline-flex";
    return;
  }

  const url = String(
    SETTINGS?.google_reviews_url ||
    SETTINGS?.google_review_url ||
    SETTINGS?.reviews_url ||
    ""
  ).trim();

  if(url){
    btn.href = url;
    btn.target = "_blank";
    btn.rel = "noopener";
    btn.style.display = "inline-flex";
  }else{
    btn.style.display = "inline-flex";
  }
}


async function loadProducts(){
  const res = await fetch(API + "/api/products");
  const arr = await res.json();

  const map = new Map();

  (arr || []).forEach((p, i) => {
    const key = String(p.id ?? p._id ?? "").trim();

    if(key){
      map.set(key, { ...p, id: key });
    }else{
      map.set("idx_" + i, { ...p, id: "idx_" + i });
    }
  });

  PRODUCTS = [...map.values()];
}
function setActiveCategoryChip(cat, smooth = true){
  ACTIVE_CATEGORY = cat || "";

  const bar = document.getElementById("catsBar");
  if(!bar) return;

  const chips = [...bar.querySelectorAll(".catChip")];
  let activeEl = null;

  chips.forEach(el => {
    const isActive = (el.dataset.cat === ACTIVE_CATEGORY);
    el.classList.toggle("active", isActive);
    if(isActive) activeEl = el;
  });

  setActiveCategorySection(ACTIVE_CATEGORY);

  if(activeEl){
    const targetLeft =
      activeEl.offsetLeft - (bar.clientWidth / 2) + (activeEl.clientWidth / 2);

    bar.scrollTo({
      left: Math.max(0, targetLeft),
      behavior: smooth ? "smooth" : "auto"
    });
  }
}



function setActiveCategorySection(cat){
  const blocks = document.querySelectorAll(".catBlock[data-cat-section]");
  blocks.forEach(block => {
    const isActive = block.getAttribute("data-cat-section") === String(cat || "");
    block.classList.toggle("isActive", isActive);
  });
}



function scrollToCategory(cat){
  const frame = document.querySelector(".frame");
  const bar = document.getElementById("catsBar");
  const target = document.querySelector(`.catBlock[data-cat-section="${CSS.escape(cat)}"]`);

  if(!frame || !bar || !target) return;

  IS_AUTO_SCROLLING = true;
  setActiveCategoryChip(cat, true);

  const frameRect = frame.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();

  const headerOffset = bar.offsetHeight + 10;

  const top =
    frame.scrollTop +
    (targetRect.top - frameRect.top) -
    headerOffset;

  frame.scrollTo({
    top,
    behavior: "smooth"
  });

  clearTimeout(scrollToCategory._t);
  scrollToCategory._t = setTimeout(() => {
    IS_AUTO_SCROLLING = false;
    updateActiveCategoryFromScroll();
  }, 500);
}

function buildCategories(){
  const cats = Array.from(new Set(PRODUCTS.map(p => (p.category||"").trim()).filter(Boolean)));

  cats.sort((a,b)=>{
    const af = FEATURED_CATS.has(String(a).trim()) ? 0 : 1;
    const bf = FEATURED_CATS.has(String(b).trim()) ? 0 : 1;
    if(af !== bf) return af - bf;
    return String(a).localeCompare(String(b), "pt-BR");
  });

  const bar = $("catsBar");
  if(!bar) return;

  if(!ACTIVE_CATEGORY || !cats.includes(ACTIVE_CATEGORY)){
    ACTIVE_CATEGORY = cats[0] || "";
  }

  bar.innerHTML = cats.map((c)=>`
    <div class="catChip ${c===ACTIVE_CATEGORY ? "active" : ""}" data-cat="${escapeAttr(c)}">
      ${escapeHtml(c)}
    </div>
  `).join("");

  bar.querySelectorAll(".catChip").forEach(ch=>{
    ch.addEventListener("click", ()=>{
      const cat = ch.dataset.cat;
      setActiveCategoryChip(cat, true);
      scrollToCategory(cat);
    });
  });

  setActiveCategoryChip(ACTIVE_CATEGORY, false);
}

function filteredProducts(){
  let list = PRODUCTS.slice();

  // busca
  if(SEARCH){
    const q = SEARCH.toLowerCase();
    list = list.filter(p =>
      String(p.name||"").toLowerCase().includes(q) ||
      String(p.description||"").toLowerCase().includes(q) ||
      String(p.subcategory||"").toLowerCase().includes(q) ||
      String(p.category||"").toLowerCase().includes(q)
    );
  }

  // show mode
  if(FILTER_SHOW === "FEATURED"){
    list = list.filter(p => !!p.featured);
  } else if(FILTER_SHOW === "IN_STOCK"){
    list = list.filter(p => !(p.stock_enabled && Number(p.stock_qty||0) <= 0));
  }

  // ordenação
  list.sort((a,b)=>{
    const fb = (b.featured ? 1 : 0) - (a.featured ? 1 : 0);
    if(fb) return fb;

    if(FILTER_SORT === "PRICE_ASC"){
      return Number(a.price||0) - Number(b.price||0);
    } else if(FILTER_SORT === "PRICE_DESC"){
      return Number(b.price||0) - Number(a.price||0);
    } else {
      return String(a.name||"").localeCompare(String(b.name||""), "pt-BR");
    }
  });

  return list;
}

    function groupBySubcategory(list){
      const map = new Map();
      for(const p of list){
        const sub = (p.subcategory||"").trim() || "Itens";
        if(!map.has(sub)) map.set(sub, []);
        map.get(sub).push(p);
      }
      return Array.from(map.entries()).sort((a,b)=> a[0].localeCompare(b[0], "pt-BR"));
    }


        function renderFeaturedCategories(cats){
  const wrap = document.getElementById("featuredCatsWrap");
  const bar  = document.getElementById("featuredCatsBar");
  if(!wrap || !bar) return;

  const featured = (cats||[]).filter(c => FEATURED_CATS.has(String(c).trim()));

  if(!featured.length){
    wrap.style.display = "none";
    bar.innerHTML = "";
    return;
  }

  wrap.style.display = "block";
  bar.innerHTML = featured.map(c => `
    <div class="catChip ${c===ACTIVE_CATEGORY ? "active" : ""}" data-cat="${escapeAttr(c)}">
      ⭐ ${escapeHtml(c)}
    </div>
  `).join("");

  // clique nos destaques usa o MESMO comportamento dos chips normais
    bar.querySelectorAll("[data-cat]").forEach(el=>{
    el.addEventListener("click", ()=>{
      ACTIVE_CATEGORY = el.dataset.cat;
      renderCategories();   // re-render chips normais
      renderProducts();     // atualiza produtos
      // re-render dos destaques (pra atualizar classe active)
      renderFeaturedCategories(cats);
    });
  });
}



  function productCard(p){
  const desc = (p.description||"").trim();
  const out = p.stock_enabled && Number(p.stock_qty||0) <= 0;
  const imgs = getProductImages(p);
  const cover = imgs[0] || "";
  const hasImg = !!cover;

  const disc = normDiscountPercent(p.discount_percent);
  const oldPrice = Number(p.price || 0);                 // preço original
  const newPrice = discountedPrice(oldPrice, disc);      // preço com desconto

  return `
    <div class="card">
      ${disc ? `<div class="discBadge">-${disc}%</div>` : ``}

      <div class="left">
        <div class="pName">${escapeHtml(p.name || "Produto")}</div>
        ${desc ? `<div class="pDesc">${escapeHtml(desc)}</div>` : ``}

        <div class="pPrice">
          ${disc ? `<span class="oldPrice">${money(oldPrice)}</span>` : ``}
          ${money(newPrice)}
        </div>

        ${
          p.stock_enabled
            ? (out
                ? `<div class="badgeOut red">Indisponível</div>`
                : `<div class="badgeOut">Estoque: ${Number(p.stock_qty||0)}</div>`
              )
            : ``
        }
      </div>

      <div class="thumb">
        ${
          hasImg
            ? `<img src="${cover}" alt="${escapeAttr(p.name||"Produto")}">`
            : `<div class="noimg">Sem foto</div>`
        }
      </div>

      <button class="plus" data-add="${escapeAttr(p.id)}" ${out ? "disabled":""}>+</button>
    </div>
  `;
}


    function renderFeatured(list){
      const ui = SETTINGS?.store_ui || {};
      if(ui.show_featured === false) return "";

     const featured = (list||[]).filter(p => !!p.featured);
      if(!featured.length) return "";


      // Olá Click: destaques aparecem antes (como uma seção)
      return `
        <div class="subcatTitle">Destaques</div>
        <div class="grid">
          ${featured.map(productCard).join("")}
        </div>
      `;
    }

function render(){
  const list = filteredProducts();
  const content = $("content");

  if(!list.length){
    content.innerHTML = `<div class="mutedTxt" style="padding:12px">Nenhum produto encontrado.</div>`;
    return;
  }

  animateSwap(content);

  const categories = Array.from(
    new Set(list.map(p => String(p.category || "").trim()).filter(Boolean))
  ).sort((a,b)=> a.localeCompare(b, "pt-BR"));

  content.innerHTML = categories.map(cat => {
    const catItems = list.filter(p => String(p.category || "").trim() === cat);

    const grouped = groupBySubcategory(catItems);

return `
  <div class="catBlock" data-cat-section="${escapeAttr(cat)}">
  <div class="catTitle" data-cat-title="${escapeAttr(cat)}">
    <span class="catTitleChip">
      <span class="catTitleIcon">${getCategoryIcon(cat)}</span>${escapeHtml(cat)}
    </span>
  </div>
    ${grouped.map(([sub, items]) => {
          const sorted = items.slice().sort((a,b)=>{
            if(FILTER_SORT === "PRICE_ASC"){
              return Number(a.price||0) - Number(b.price||0);
            } else if(FILTER_SORT === "PRICE_DESC"){
              return Number(b.price||0) - Number(a.price||0);
            } else {
              return String(a.name||"").localeCompare(String(b.name||""), "pt-BR");
            }
          });

          return `
            <div class="subcatTitle">${escapeHtml(sub)}</div>
            <div class="grid">
              ${sorted.map(productCard).join("")}
            </div>
          `;
        }).join("")}
      </div>
    `;
  }).join("");



content.querySelectorAll("[data-cat-title]").forEach(el=>{
  el.addEventListener("click", ()=>{
    const cat = el.getAttribute("data-cat-title") || "";
    if(!cat) return;

    setActiveCategoryChip(cat, true);
    setActiveCategorySection(cat);
    scrollToCategory(cat);
  });
});



  content.querySelectorAll("[data-add]").forEach(btn=>{
    btn.addEventListener("click", (e)=>{
      e.stopPropagation();
      const id = String(btn.dataset.add);
      const p = PRODUCTS.find(x => String(x.id) === id);
      if(!p) return;
      if(p.stock_enabled && Number(p.stock_qty||0) <= 0){
        toast("Produto indisponível.");
        return;
      }
      const hasFlavors = Array.isArray(p.flavors) && p.flavors.some(x => String(x || "").trim());

if(hasFlavors){
  openProdModal(p);
  return;
}

addToCart(p, 1, [], "");

      const card = btn.closest(".card");
      const img = card ? (card.querySelector(".thumb img") || card.querySelector("img")) : null;
      const cartBtnEl = document.querySelector("#cartBarBtn") || document.querySelector("#closeDrawer");
      flyToCart(img || btn, cartBtnEl);

      bump(btn, "bump", 140);
      const cartBtn = document.querySelector("#cartBarBtn");
      bump(cartBtn, "cartPulse", 360);
    });
  });

  content.querySelectorAll(".card").forEach(card=>{
    card.addEventListener("click", ()=>{
      const addBtn = card.querySelector("[data-add]");
      if(!addBtn) return;
      const id = String(addBtn.dataset.add);
      const p = PRODUCTS.find(x => String(x.id) === id);
      if(!p) return;
      openProdModal(p);
    });
  });

setActiveCategorySection(ACTIVE_CATEGORY);
}



function scheduleShippingQuote(delay = 700){
  clearTimeout(SHIPPING_QUOTE_TIMER);

  SHIPPING_QUOTE_TIMER = setTimeout(async ()=>{
    if(String($("type")?.value || "") === "ENTREGA"){
      await quoteShippingByAddress();
    }
  }, delay);
}



async function quoteShippingByAddress(){
  const msg = $("shippingMsg");
  const type = String($("type")?.value || "RETIRADA");
  const address = String($("addr")?.value || "").trim();

  if(type !== "ENTREGA"){
    DYNAMIC_SHIPPING = 0;
    if(msg){
      msg.textContent = "Retirada: sem frete.";
      msg.style.display = "block";
    }
    renderCart();
    return;
  }

  if(!CUSTOMER_GEO && !address){
    DYNAMIC_SHIPPING = null;
    if(msg){
      msg.textContent = "Informe o endereço ou use sua localização para calcular o frete.";
      msg.style.display = "block";
    }
    renderCart();
    return;
  }

  if(msg){
    msg.textContent = "Calculando frete...";
    msg.style.display = "block";
  }

  try{
    const payload = CUSTOMER_GEO
      ? { lat: CUSTOMER_GEO.lat, lon: CUSTOMER_GEO.lon }
      : { address };

    const res = await fetch(API + "/api/shipping/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(()=>null);

    if(!res.ok || !data?.ok){
      DYNAMIC_SHIPPING = null;

      if(msg){
        const err = (data && data.error) ? data.error : "Não foi possível calcular o frete.";
        msg.textContent = err;
        msg.style.display = "block";
      }

      renderCart();
      return;
    }

    DYNAMIC_SHIPPING = Number(data.shipping_price || 0);

    if(msg){
      const km = Number(data.distance_km || 0);
      msg.textContent = `Frete: ${money(DYNAMIC_SHIPPING)} • Distância estimada: ${km.toFixed(2)} km`;
      msg.style.display = "block";
    }

    renderCart();
  }catch(e){
    DYNAMIC_SHIPPING = null;

    if(msg){
      msg.textContent = "Erro ao calcular frete.";
      msg.style.display = "block";
    }

    renderCart();
  }
}





function cartTotals(){
  const DEFAULT_SHIP = Number(SETTINGS?.default_shipping || 0);
  const subtotal = CART.reduce((a,it)=> a + Number(it.qty||0)*Number(it.price||0), 0);

  const type = String($("type")?.value || "RETIRADA");
  const isDelivery = (type === "ENTREGA");

  let shipping = 0;

  if(isDelivery){
    if(DYNAMIC_SHIPPING !== null && DYNAMIC_SHIPPING !== undefined){
      shipping = Number(DYNAMIC_SHIPPING || 0);
    }else{
      shipping = Number(DEFAULT_SHIP || 0);
    }
  }

  const total = subtotal + shipping;
  return { subtotal, shipping, total };
}
    function renderCart(){
     const cartCountEl = $("cartCount");
  if(cartCountEl) cartCountEl.textContent = String(CART.reduce((a,it)=>a+Number(it.qty||0),0));

      const list = $("cartList");

      if(!CART.length){
        list.innerHTML = `<div class="mutedTxt">Carrinho vazio.</div>`;
      }else{
        list.innerHTML = CART.map(it=>`
          <div class="cItem">
            <div>
              <b>${escapeHtml(it.name)}</b>
              <div class="mutedTxt">${it.qty}x • ${money(it.price)} = ${money(it.qty*it.price)}</div>
            </div>
            <div class="qty">
              <button class="qbtn" data-dec="${escapeAttr(it.line_id || it.product_id)}">-</button>
              <b>${it.qty}</b>
              <button class="qbtn" data-inc="${escapeAttr(it.line_id || it.product_id)}">+</button>
            </div>
          </div>
        `).join("");

        list.querySelectorAll("[data-inc]").forEach(b=>{
          b.addEventListener("click", ()=>{
            const id = String(b.dataset.inc);
            const idx = CART.findIndex(x=> String(x.line_id || x.product_id)===id);
            if(idx<0) return;

              const pid = String(CART[idx].product_id);
              const p = PRODUCTS.find(x=> String(x.id)===pid);

            if(p?.stock_enabled){
              const max = Number(p.stock_qty||0);

              const currentQtyProduct = CART
              .filter(it => String(it.product_id) === pid)
              .reduce((a,it)=> a + Number(it.qty||0), 0);

             if(currentQtyProduct + 1 > max){
             toast("Sem estoque suficiente.");
             return;
              }
            }

            CART[idx].qty += 1;
            renderCart();
          });
        });

        list.querySelectorAll("[data-dec]").forEach(b=>{
          b.addEventListener("click", ()=>{
            const id = String(b.dataset.dec);
            const idx = CART.findIndex(x=> String(x.line_id || x.product_id)===id);
            if(idx<0) return;
            CART[idx].qty -= 1;
            if(CART[idx].qty <= 0) CART.splice(idx,1);
            renderCart();
          });
        });
      }

      const t = cartTotals();
      $("sub").textContent = money(t.subtotal);
      $("ship").textContent = money(t.shipping);
      $("tot").textContent = money(t.total);

             // ===== Barra fixa do carrinho (rodapé) =====
      const bar = $("cartBar");
      if(bar){
        const qty = CART.reduce((a,it)=> a + Number(it.qty||0), 0);

        const itemsEl = $("cartBarItems");
        const totalEl = $("cartBarTotal");

        if(itemsEl) itemsEl.textContent = (qty === 1 ? "1 produto" : `${qty} produtos`);
        if(totalEl) totalEl.textContent = money(t.total);

        bar.style.display = (qty > 0 ? "block" : "none");
      }


    }

function hideCartBar(){
  const bar = document.getElementById("cartBar");
  if (bar) bar.style.display = "none";
}

function showCartBar(){
  const bar = document.getElementById("cartBar");
  if (!bar) return;

  const qty = CART.reduce((a,it)=> a + Number(it.qty||0), 0);
  bar.style.display = (qty > 0) ? "block" : "none";
}

function openDrawer(){
  document.getElementById("drawer")?.classList.add("open");
  hideCartBar();
}

function closeDrawer(){
  document.getElementById("drawer")?.classList.remove("open");
  showCartBar();
}

    
    function nextOpenSuggestion(){
      const bh = SETTINGS?.business_hours;
      if(!bh?.enabled) return null;
      const days = bh.days || {};
      const keys = ["dom","seg","ter","qua","qui","sex","sab"];
      const now = new Date();
      for(let i=0;i<14;i++){
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate()+i);
        const key = keys[d.getDay()];
        const day = days[key];
        if(!day || !day.enabled) continue;

        const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
        let timeStr = String(day.open||"09:00");

        if(i===0){
          const hh = String(now.getHours()).padStart(2,"0");
          const mm = String(now.getMinutes()).padStart(2,"0");
          const cur = Number(hh+mm);
          const open = Number(String(day.open||"08:00").replace(":",""));
          const close = Number(String(day.close||"18:00").replace(":",""));
          if(cur < open) timeStr = String(day.open||"09:00");
          else if(cur > close) continue;
          else{
            const plus = new Date(now.getTime()+30*60000);
            const ph = String(plus.getHours()).padStart(2,"0");
            const pm = String(plus.getMinutes()).padStart(2,"0");
            const p = Number(ph+pm);
            timeStr = (p < open) ? String(day.open||"09:00") : `${ph}:${pm}`;
          }
        }

        return { date: dateStr, time: timeStr };
      }
      return null;
    }

function openModal(){
  hideCartBar();
  $("modalBack").classList.add("open");
  DYNAMIC_SHIPPING = null;
  try{
    const bh = SETTINGS?.business_hours;
    const openNow = isOpenNow();
    const allowSchedule = !!(bh && bh.allow_schedule !== false);
    const box = $("scheduleBox");
    if(box){
      if(bh?.enabled && !openNow.ok && allowSchedule){
        box.style.display = "block";
        const sug = nextOpenSuggestion();
        if(sug){
          $("schDate").value = sug.date;
          $("schTime").value = sug.time;
        }
      }else{
        box.style.display = "none";
      }
    }
  }catch(e){}

setTimeout(()=>{
  if(String($("type")?.value || "") === "ENTREGA"){
    quoteShippingByAddress();
  }else{
    renderCart();
  }
}, 0);


}
function closeModal(){
  $("modalBack").classList.remove("open");
}

    function fmtDateTimePtBR(iso){
  try{
    const d = new Date(iso);
    if(!iso || isNaN(d.getTime())) return "";
    const dd = String(d.getDate()).padStart(2,"0");
    const mm = String(d.getMonth()+1).padStart(2,"0");
    const yy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2,"0");
    const mi = String(d.getMinutes()).padStart(2,"0");
    return `${dd}/${mm}/${yy} • ${hh}:${mi}`;
  }catch{ return ""; }
}

function normalizeServiceLabel(t){
  const s = String(t||"").toUpperCase();
  if(s === "ENTREGA" || s === "DELIVERY") return "Delivery";
  if(s === "RETIRADA") return "Retirada";
  return t || "Delivery";
}

function paymentStatusLabel(order){
  // tenta inferir status "Pago / Não pago"
  const st = String(order.payment_status||order.paymentState||"").toUpperCase();
  if(st.includes("PAGO")) return "Pago";
  if(st.includes("NAO") || st.includes("NÃO")) return "Não pago";
  if(st === "PAID") return "Pago";
  if(st === "UNPAID") return "Não pago";
  // fallback: se tiver order.paid boolean
  if(order.paid === true) return "Pago";
  if(order.paid === false) return "Não pago";
  return "Não pago";
}

function paymentMethodLabel(order){
  return order.payment_method || order.paymentMethod || order.payment || "—";
}

function buildPreviewLink(order){
  // URL pública para o preview do WhatsApp (GitHub Pages)
  const base = (SETTINGS && (SETTINGS.preview_whatsapp_url || SETTINGS.preview_url || SETTINGS.whatsapp_preview_url)) || "";
  if(!base) return "";
  const clean = String(base).replace(/\/+$/,"");
  // aceita que base já seja a página completa (pedido.html) ou uma pasta
  const isHtml = clean.toLowerCase().endsWith(".html");
  return isHtml
    ? `${clean}?id=${encodeURIComponent(order.id)}`
    : `${clean}/pedido.html?id=${encodeURIComponent(order.id)}`;
}

function storeUrlLabel(){
  const s = (SETTINGS && (SETTINGS.store_url || SETTINGS.storeUrl)) || "";
  if(s) return s;
  // evita mostrar file:/// no WhatsApp
  return "https://seu-site.com";
}

function whatsappMessage(order){
  const items = Array.isArray(order.items) ? order.items : [];
  const created = fmtDateTimePtBR(order.created_at) || "";
  const service = normalizeServiceLabel(order.type);
  const name = order.customer_name || "-";
  const phone = order.customer_phone || "-";
  const addr = order.address || "-";
  const notes = order.observations || order.notes || order.customer_notes || "";

  const lines = [];
  lines.push(`🍰 *Venho de ${storeUrlLabel()}*`);
  lines.push(`📌 *Pedido:* #${order.id}`);
  if(created) lines.push(`🕒 ${created}`);
  if(order.scheduled_for) lines.push(`📅 *Agendado para:* ${order.scheduled_for}`);
  lines.push("");
  lines.push(`*Tipo de serviço:* ${service}`);
  lines.push("");
  lines.push(`*Nome:* ${name}`);
  lines.push(`*Telefone:* ${phone}`);
  if(service.toLowerCase() === "delivery" || String(order.type||"").toUpperCase()==="ENTREGA"){
    lines.push(`*Endereço:* ${addr}`);
  }
  if(notes){
    lines.push(`*Observações:* ${notes}`);
  }
  lines.push("");
  lines.push("🧁 *Produtos*");
  for(const it of items){
    const qty = Number(it.qty||0);
    const nm = it.name || it.product_name || "Item";
    const price = Number(it.price||0);
    // formato: x1 Cenoura — R$ 12,70
    lines.push(`x${qty} ${nm} — ${money(price)}`);
  }
  lines.push("");
  lines.push(`Subtotal: ${money(order.subtotal||0)}`);
  lines.push(`Delivery: ${money(order.shipping||0)}`);
  lines.push(`*Total: ${money(order.total||0)}*`);
  lines.push("");
  lines.push("💳 *Pagamento*");
  lines.push(`Status: ${paymentStatusLabel(order)}`);
  lines.push(`Forma: ${paymentMethodLabel(order)}`);

  return lines.join("\n");
}


    async function sendOrder(){
      if(!CART.length) return alert("Carrinho vazio.");

      const name = $("cName").value.trim();
      const phone = phoneOnly($("cPhone").value.trim());
      const type = $("type").value;
      const address = type==="ENTREGA" ? $("addr").value.trim() : "";
      const payment = $("pay").value;
      const notes = $("notes").value.trim();
      const need_nfce = $("needNfce").checked;
      const cpf = $("cpf").value.trim();

      const openNow = isOpenNow();
      const bh = SETTINGS?.business_hours;
      const allowSchedule = !!(bh && bh.allow_schedule !== false);

      // Se a loja estiver fechada e controle de horário estiver ativo:
      // - se permitir agendamento, exige data/hora
      // - se não permitir, bloqueia finalizar pedido
      let scheduled_for = null;
      const schedVisible = $("scheduleBox") && $("scheduleBox").style.display !== "none";
      if(bh?.enabled && !openNow.ok){
        if(!allowSchedule){
          return alert("A loja está fechada no momento. Volte no horário de atendimento.");
        }
        if(schedVisible){
          const d = $("schDate").value;
          const t = $("schTime").value;
          if(!d || !t) return alert("Escolha data e hora para agendar o pedido.");
          scheduled_for = `${d} ${t}`;
        }
      }


      if(type === "ENTREGA" && DYNAMIC_SHIPPING === null){
       return alert("Informe um endereço válido para calcular o frete.");
        }
      if(!name) return alert("Informe seu nome.");
      if(!phone) return alert("Informe seu WhatsApp.");
      if(type==="ENTREGA" && !address) return alert("Informe o endereço.");
      if(need_nfce && !cpf) return alert("Informe o CPF para NFC-e.");

const items = CART.map(it=>({
  product_id: it.product_id,
  name: it.name,
  price: Number(it.price||0),
  qty: Number(it.qty||0),
  flavor: String(it.flavor || ""),
  addons: Array.isArray(it.addons) ? it.addons : []
}));

      const t = cartTotals();

const payload = {
  type, // "ENTREGA" ou "RETIRADA"
  customer_name: name,
  customer_phone: phone,
  address: (type === "ENTREGA") ? address : "", // garante vazio se retirada
  payment,
  notes,
  need_nfce,
  cpf,
  scheduled_for,
  shipping: Number(t.shipping || 0),
  subtotal: Number(t.subtotal || 0),
  total: Number(t.total || 0),
  customer_location: CUSTOMER_GEO ? {
  lat: Number(CUSTOMER_GEO.lat),
  lon: Number(CUSTOMER_GEO.lon)
} : null,
  items
};

const res = await fetch(API + "/api/orders", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload)
});

      const data = await res.json().catch(()=>null);
      if(!res.ok){
        alert((data && data.error) ? data.error : "Erro ao salvar pedido.");
        return;
      }

      
      const preview = buildPreviewLink(data.order);
      const bodyMsg = whatsappMessage(data.order);
      const msg = preview ? `${preview}

${bodyMsg}` : bodyMsg;

      const to = phoneOnly(SETTINGS.whatsapp_number || "");
      const url = to
        ? `https://wa.me/${to}?text=${encodeURIComponent(msg)}`
        : `https://wa.me/?text=${encodeURIComponent(msg)}`;

      window.open(url, "_blank");

      CART = [];
      renderCart();
      closeModal();
      closeDrawer();
      toast("Pedido enviado ✅");
    }



function openHoursModal(){
  const back = document.getElementById("hoursModal");
  if(!back) return;

  back.style.display = "flex";
  back.classList.add("open");

  renderHoursModal();
}

function closeHoursModal(){
  const back = document.getElementById("hoursModal");
  if(!back) return;
  back.classList.remove("open");
  back.style.display = "none";
}

function formatDayHours(d){
  if(!d || !d.enabled) return "Fechado";
  const op = d.open || "--:--";
  const cl = d.close || "--:--";
  return `${op} – ${cl}`;
}

function renderHoursModal(){
  const body = document.getElementById("hoursModalBody");
  if(!body) return;

  const bh = SETTINGS?.business_hours;
  if(!bh || bh.enabled === false){
    body.innerHTML = `<div class="mutedTxt">Horários não configurados.</div>`;
    return;
  }

  const days = (bh && bh.days) ? bh.days : {};
  const labels = [
    ["seg", "Segunda"],
    ["ter", "Terça"],
    ["qua", "Quarta"],
    ["qui", "Quinta"],
    ["sex", "Sexta"],
    ["sab", "Sábado"],
    ["dom", "Domingo"]
  ];

  body.innerHTML = `
    <div class="mutedTxt" style="margin-bottom:10px;">
      Clique fora para fechar.
    </div>
    ${labels.map(([k, name])=>{
      const text = formatDayHours(days[k]);
      return `
        <div class="dayRow">
          <div class="dayName">${name}</div>
          <div class="dayTime">${text}</div>
        </div>
      `;
    }).join("")}
  `;
}





function isShopOpenNowFromPill(){
  const txt = (document.getElementById("statusTxt")?.textContent || "").toLowerCase();
  // usa o que você já mostra na UI
  if(txt.includes("aberto")) return true;
  if(txt.includes("fechado")) return false;
  return null;
}

function formatHoursText(d){
  if(!d || !d.enabled) return "Fechado";
  const op = d.open || "--:--";
  const cl = d.close || "--:--";
  return `${op} - ${cl}`;
}

function getTodayKey(){
  // JS: 0=domingo...6=sábado
  const wd = new Date().getDay();
  return ["dom","seg","ter","qua","qui","sex","sab"][wd];
}

function renderInfoModal(){
  const body = document.getElementById("infoBody");
  if(!body) return;

  const openNow = isShopOpenNowFromPill();
  const pillClass = (openNow === true) ? "open" : "closed";
  const pillText  = (openNow === true) ? "Aberto" : "Fechado";

  const shopName = SETTINGS?.shop_name || "Loja";
  const address  = SETTINGS?.address_base || "";
  const rating   = SETTINGS?.store_ui?.rating || document.getElementById("ratingTxt")?.textContent || "4.9";
  const igUrl    = SETTINGS?.instagram_url || document.getElementById("igBtn")?.href || "";
  const logoSrc  = SETTINGS?.store_ui?.logo_image_dataurl || document.getElementById("logo")?.src || "";

  const bh = SETTINGS?.business_hours || {};
  const days = bh.days || {};
  const todayKey = getTodayKey();

  const labels = [
    ["dom","Domingo"],
    ["seg","Segunda-feira"],
    ["ter","Terça-feira"],
    ["qua","Quarta-feira"],
    ["qui","Quinta-feira"],
    ["sex","Sexta-feira"],
    ["sab","Sábado"]
  ];


  const waIcon = new URL("../assets/whatsapp.svg", window.location.href).href;
  const igIcon = new URL("../assets/instagram.svg", window.location.href).href;

  body.innerHTML = `
    <div class="infoStatusRow">
      <span class="infoPill ${pillClass}">
        <span class="infoDot"></span>
        ${pillText}
      </span>
    </div>

<div class="infoShopRow">
  <div class="infoShopName">${escapeHtml(shopName)}</div>
  ${logoSrc ? `<img class="infoLogo" src="${escapeAttr(logoSrc)}" alt="Logo">` : ``}
</div>

<div class="imActions">
  <button class="imBtn" id="infoWhatsBtn" title="WhatsApp" aria-label="WhatsApp">
  <img class="imIconImg" src="${ICONS.whatsapp}" alt="WhatsApp">
</button>

<button class="imBtn" id="infoIgBtn" title="Instagram" aria-label="Instagram">
  <img class="imIconImg" src="${ICONS.instagram}" alt="Instagram">
</button>

<button class="imRating" id="infoReviewsBtn" type="button">
  ⭐ <span>${escapeHtml(String(rating))}</span>
</button>

  <button class="imBtn" id="infoShareBtn" title="Compartilhar" aria-label="Compartilhar">↗</button>
</div>

    <div class="infoSection">
      <h4>Endereço</h4>
      <div class="infoRow">
        <div>📍</div>
        <div class="muted">${escapeHtml(address || "Não informado")}</div>
      </div>
    </div>

    <div class="infoSection">
      <h4>Tipos de serviço</h4>

      <div class="infoServiceCard">
        <div class="infoServiceLeft">
          <div class="infoServiceName">Delivery</div>
          <div class="infoServiceNote">Frete padrão: ${money(Number(SETTINGS?.default_shipping || 0))}</div>
        </div>
        <div class="infoCheck">✓</div>
      </div>

      <div class="infoServiceCard">
        <div class="infoServiceLeft">
          <div class="infoServiceName">Retirada</div>
          <div class="infoServiceNote">Sem taxa de entrega</div>
        </div>
        <div class="infoCheck">✓</div>
      </div>
    </div>

    <div class="infoSection">
      <h4>Horário de funcionamento</h4>
      <div class="infoHoursList">
        ${
          (bh.enabled === false)
          ? `<div class="mutedTxt">Horários não configurados.</div>`
          : labels.map(([k, name])=>{
              const text = formatHoursText(days[k]);
              const todayClass = (k === todayKey) ? "today" : "";
              return `
                <div class="infoDay ${todayClass}">
                  <div>${name}</div>
                  <div class="infoDayRight">
                    <span class="infoClock">🕒</span>
                    <span>${escapeHtml(text)}</span>
                  </div>
                </div>
              `;
            }).join("")
        }
      </div>
    </div>
  `;


const revUrl = (SETTINGS?.google_reviews_url || "").trim();
document.getElementById("infoReviewsBtn")?.addEventListener("click", ()=>{
  if(revUrl) window.open(revUrl, "_blank", "noopener");
});



  // ações
  document.getElementById("infoIgBtn")?.addEventListener("click", ()=>{
    if(igUrl) window.open(igUrl, "_blank");
  });

  document.getElementById("infoShareBtn")?.addEventListener("click", async ()=>{
    // tenta copiar store_url, senão copia a URL atual
    const link = (SETTINGS?.store_url || window.location.href || "").trim();
    try{
      await navigator.clipboard.writeText(link);
      toast("Link copiado ✅");
    }catch(e){
      toast("Não consegui copiar o link.");
    }
  });

  document.getElementById("infoWhatsBtn")?.addEventListener("click", ()=>{
    const to = phoneOnly(SETTINGS?.whatsapp_number || "");
    const msg = `Olá! Vim pela loja ${shopName}.`;
    const url = to ? `https://wa.me/${to}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  });
}

function openInfoModal(){
  const back = document.getElementById("infoModal");
  if(!back) return;
  back.style.display = "flex";
  renderInfoModal();
}

function closeInfoModal(){
  const back = document.getElementById("infoModal");
  if(!back) return;
  back.style.display = "none";
}

// clique no "ABERTO/FECHADO"
document.getElementById("statusPill")?.addEventListener("click", openInfoModal);

// fechar
document.getElementById("closeInfoModal")?.addEventListener("click", closeInfoModal);
document.getElementById("infoModal")?.addEventListener("click", (e)=>{
  if(e.target && e.target.id === "infoModal") closeInfoModal();
});



// clique no pill "ABERTO"
document.getElementById("statusPill")?.addEventListener("click", openHoursModal);

// fechar
document.getElementById("closeHoursModal")?.addEventListener("click", closeHoursModal);
document.getElementById("hoursModal")?.addEventListener("click", (e)=>{
  if(e.target && e.target.id === "hoursModal") closeHoursModal();
});


    document.addEventListener("DOMContentLoaded", async ()=>{
      await loadSettings();
      await loadProducts();
      await loadCategories();
      await loadSettings();
      applyReviewsLink();
      buildCategories();
      render();
      renderCart();


     $("q")?.addEventListener("input", ()=>{
        SEARCH = $("q").value.trim();
        render();
      });

      $("scrollTopBtn")?.addEventListener("click", ()=>{
        window.scrollTo({ top: 0, behavior:"smooth" });
      });
// botão da barra "Veja meu pedido"
const cartBtn = document.getElementById("cartBarBtn");
if(cartBtn){
  cartBtn.addEventListener("click", (e)=>{
    e.preventDefault();
    openDrawer(); // usa sua função
  });
}

    if (IS_PDV) {
    const btn = document.getElementById("checkoutBtn");
    if (btn) {
      btn.textContent = "Voltar ao PDV";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        if (!CART.length) {
          alert("Carrinho vazio.");
          return;
        }

      sendCartToPDV();
    }, true); // capture=true
  }
}

document.getElementById("closeDrawer")?.addEventListener("click", closeDrawer);
});    




$("checkoutBtn").addEventListener("click", ()=>{
  if(!CART.length) return alert("Carrinho vazio.");
  hideCartBar();
  openModal();
  setTimeout(()=>{ $("type")?.dispatchEvent(new Event("change")); }, 0);
});

      $("clearBtn").addEventListener("click", ()=>{
        CART = [];
        renderCart();
        toast("Carrinho limpo ✅");
      });


      $("closeModal").addEventListener("click", closeModal);
      $("cancelModal").addEventListener("click", closeModal);

$("type")?.addEventListener("change", async ()=>{
  const type = $("type").value;

  const addrBox = $("addrBox");
  if(addrBox) addrBox.style.display = (type === "ENTREGA") ? "block" : "none";

  clearTimeout(SHIPPING_QUOTE_TIMER);

  if(type === "ENTREGA"){
    DYNAMIC_SHIPPING = null;
    await quoteShippingByAddress();
  } else {
    DYNAMIC_SHIPPING = 0;
    const msg = $("shippingMsg");
    if(msg){
      msg.textContent = "Retirada: sem frete.";
      msg.style.display = "block";
    }
    renderCart();
  }
});



$("addr")?.addEventListener("input", ()=>{
  CUSTOMER_GEO = null;

  const geoMsg = $("geoMsg");
  if(geoMsg){
    geoMsg.style.display = "none";
    geoMsg.textContent = "";
  }

  if(String($("type")?.value || "") === "ENTREGA"){
    scheduleShippingQuote(900);
  }
});

$("addr")?.addEventListener("blur", async ()=>{
  clearTimeout(SHIPPING_QUOTE_TIMER);
  if(String($("type")?.value || "") === "ENTREGA"){
    await quoteShippingByAddress();
  }
});



      $("needNfce").addEventListener("change", ()=>{
        $("cpfBox").style.display = $("needNfce").checked ? "block" : "none";
      });

      $("sendOrder").addEventListener("click", sendOrder);

      $("modalBack").addEventListener("click", (e)=>{
        if(e.target === $("modalBack")) closeModal();
      });
      const openFilter = ()=> $("filterBack").classList.add("open");
      const closeFilter = ()=> $("filterBack").classList.remove("open");

$("filterBtn").addEventListener("click", openFilter);
$("closeFilter").addEventListener("click", closeFilter);
$("useLocationBtn")?.addEventListener("click", useExactLocation);
$("filterBack").addEventListener("click", (e)=>{
  if(e.target === $("filterBack")) closeFilter();
});

$("applyFilter").addEventListener("click", ()=>{
  FILTER_SORT = $("sortMode").value;
  FILTER_SHOW = $("showMode").value;
  closeFilter();
  render();
});

$("resetFilter").addEventListener("click", ()=>{
  $("sortMode").value = "DEFAULT";
  $("showMode").value = "ALL";
  FILTER_SORT = "DEFAULT";
  FILTER_SHOW = "ALL";
  closeFilter();
  render();
});

// modal produto
$("closeProd").addEventListener("click", closeProdModal);
$("prodBack").addEventListener("click", (e)=>{
  if(e.target === $("prodBack")) closeProdModal();
});

$("prodMinus").addEventListener("click", ()=>{
  if(!MODAL_PRODUCT) return;
  MODAL_QTY = Math.max(1, MODAL_QTY - 1);
  $("prodQty").textContent = String(MODAL_QTY);
});

$("prodPlus").addEventListener("click", ()=>{
  if(!MODAL_PRODUCT) return;

  // respeita estoque
  if(MODAL_PRODUCT.stock_enabled){
    const max = Number(MODAL_PRODUCT.stock_qty||0);
    MODAL_QTY = Math.min(max > 0 ? max : 1, MODAL_QTY + 1);
  } else {
    MODAL_QTY += 1;
  }
  $("prodQty").textContent = String(MODAL_QTY);
});

$("addFromModal").addEventListener("click", ()=>{
  if(!MODAL_PRODUCT) return;

  const hasFlavors = Array.isArray(MODAL_PRODUCT.flavors) && MODAL_PRODUCT.flavors.some(x => String(x || "").trim());
  if(hasFlavors && !String(MODAL_FLAVOR || "").trim()){
    toast("Escolha o sabor.");
    return;
  }

  addToCart(MODAL_PRODUCT, MODAL_QTY, MODAL_ADDONS, MODAL_FLAVOR);
});

$("addAndClose").addEventListener("click", ()=>{
  if(!MODAL_PRODUCT) return;

  const hasFlavors = Array.isArray(MODAL_PRODUCT.flavors) && MODAL_PRODUCT.flavors.some(x => String(x || "").trim());
  if(hasFlavors && !String(MODAL_FLAVOR || "").trim()){
    toast("Escolha o sabor.");
    return;
  }

  const ok = addToCart(MODAL_PRODUCT, MODAL_QTY, MODAL_ADDONS, MODAL_FLAVOR);
  if(ok) closeProdModal();
});

$("goCart").addEventListener("click", ()=>{
  closeProdModal();
  openDrawer();
});



// ===== Animation helpers =====
function animateSwap(el){
  if(!el) return;
  el.classList.remove("productsEnter","productsExit");
  el.classList.add("productsExit");
  // na troca de categoria, dá tempo do exit e entra de novo
  setTimeout(()=>{
    el.classList.remove("productsExit");
    el.classList.add("productsEnter");
    setTimeout(()=> el.classList.remove("productsEnter"), 260);
  }, 140);
}

function bump(el, cls="bump", ms=140){
  if(!el) return;
  el.classList.remove(cls);
  // força reflow pra re-aplicar animação mesmo em cliques rápidos
  void el.offsetWidth;
  el.classList.add(cls);
  setTimeout(()=> el.classList.remove(cls), ms);
}

function popModal(modalEl){
  if(!modalEl) return;
  modalEl.classList.remove("modalPop");
  void modalEl.offsetWidth;
  modalEl.classList.add("modalPop");
  setTimeout(()=> modalEl.classList.remove("modalPop"), 260);
}


function flyToCart(fromEl, toEl){
  try{
    if(!fromEl || !toEl) return;

    const r1 = fromEl.getBoundingClientRect();
    const r2 = toEl.getBoundingClientRect();

    // cria uma “cópia visual” (imagem do produto)
    let clone;
    if(fromEl.tagName && fromEl.tagName.toLowerCase() === "img"){
      clone = fromEl.cloneNode(true);
    } else {
      // fallback: um quadradinho caso não tenha imagem
      clone = document.createElement("div");
      clone.style.background = "rgba(122,74,62,.18)";
    }

    clone.classList.add("flyImg");

    // tamanho inicial
    const w = Math.max(42, Math.min(88, r1.width));
    const h = Math.max(42, Math.min(88, r1.height));

    clone.style.width = w + "px";
    clone.style.height = h + "px";

    // posição inicial (centro do elemento origem)
    const startX = r1.left + r1.width/2 - w/2;
    const startY = r1.top + r1.height/2 - h/2;

    // destino (centro do botão do carrinho)
    const endX = r2.left + r2.width/2 - w/2;
    const endY = r2.top + r2.height/2 - h/2;

    clone.style.left = startX + "px";
    clone.style.top  = startY + "px";
    clone.style.opacity = "1";
    clone.style.transform = "translate3d(0,0,0) scale(1)";

    document.body.appendChild(clone);

    // anima com transition
    const dx = endX - startX;
    const dy = endY - startY;

    requestAnimationFrame(()=>{
      clone.style.transition =
        "transform 520ms cubic-bezier(.22,1,.36,1), opacity 520ms cubic-bezier(.22,1,.36,1)";
      clone.style.opacity = "0.12";
      clone.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(.35)`;
    });

    // remove no fim
    setTimeout(()=> clone.remove(), 560);
  } catch(_e){
    // se der qualquer erro, não quebra o app
  }
}
