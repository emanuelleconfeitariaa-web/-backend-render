
    const API = (() => {
  const host = window.location.hostname;

  if (
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
    let ACTIVE_CATEGORY = "Todos";
    let TARGET_SCROLL_CATEGORY = null;
    let CAT_OBSERVER = null;
    let SEARCH = "";
    let FILTER_SORT = "DEFAULT";
    let FILTER_SHOW = "ALL";


    let CART = []; // {product_id, name, price, qty}
    // modal produto
let MODAL_PRODUCT = null;
let MODAL_QTY = 1;

function openProdModal(p){
  MODAL_PRODUCT = p;
  MODAL_QTY = 1;

  $("prodTitle").textContent = p.name || "Produto";
  $("prodCat").textContent = [p.category, p.subcategory].filter(Boolean).join(" • ") || "";

  const desc = (p.description || "").trim();
  $("prodDesc").textContent = desc || "Sem descrição.";

  $("prodPrice").textContent = money(p.price);

  // imagem
  if(p.image_url){
    $("prodImg").src = p.image_url;
    $("prodImg").style.display = "block";
    $("prodNoImg").style.display = "none";
  } else {
    $("prodImg").style.display = "none";
    $("prodNoImg").style.display = "block";
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
}

function addToCart(p, qty){
  qty = Number(qty||0);
  if(!p || qty<=0) return;

  // respeita estoque
  const existing = CART.find(it => String(it.product_id) === String(p.id));
  const currentQty = existing ? Number(existing.qty||0) : 0;

  if(p.stock_enabled){
    const max = Number(p.stock_qty||0);
    if(currentQty + qty > max){
      toast("Sem estoque suficiente.");
      return false;
    }
  }

  if(existing){
    existing.qty = currentQty + qty;
  }else{
    CART.push({ product_id: p.id, name: p.name, price: Number(p.price||0), qty });
  }

  renderCart();
  toast("Adicionado ✅");
  return true;
}

    function money(n){ return Number(n||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}); }
    function phoneOnly(s){ return (s||"").replace(/\\D/g,""); }

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
    function escapeAttr(s){ return escapeHtml(s).replaceAll("\\n"," "); }


    function slugify(s){
      return String(s||"")
        .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g,"-")
        .replace(/(^-|-$)/g,"");
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

      document.documentElement.style.setProperty("--primary", th.primary || "#7a4a3e");
      document.documentElement.style.setProperty("--secondary", th.secondary || "#d9a5b2");
      document.documentElement.style.setProperty("--soft", th.soft || "#f4d4d7");
      document.documentElement.style.setProperty("--bg", th.bg || "#f6ebe5");

      document.documentElement.style.setProperty("--pageBg", ui.page_bg || "#f4d4d7");
      document.documentElement.style.setProperty("--bannerBg", ui.banner_bg || (th.primary || "#7a4a3e"));
      document.documentElement.style.setProperty("--bannerHeight", (ui.banner_height || 104) + "px");
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
      $("shopAddr").textContent = SETTINGS.address_base || "";
      $("shopTag").textContent  = SETTINGS.shop_tagline || "Retirada ou Entrega • Pedido vai pro WhatsApp";
      $("logo").src = SETTINGS.logo_url || "../assets/logo.png";
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

    async function loadSettings(){
      const res = await fetch(API + "/api/settings");
      SETTINGS = await res.json();
      applyTheme();
    }

    async function loadProducts(){
      const res = await fetch(API + "/api/products");
      PRODUCTS = await res.json();
    }

    
    function enableHScrollDrag(el){
      let isDown = false;
      let startX = 0;
      let startScrollLeft = 0;
      let moved = false;

      el.addEventListener("pointerdown", (e)=>{
        // only primary button/finger
        if(e.button !== undefined && e.button !== 0) return;
        isDown = true;
        moved = false;
        el.dataset.dragging = "0";
        startX = e.clientX;
        startScrollLeft = el.scrollLeft;
        try{ el.setPointerCapture(e.pointerId); }catch(_){}
        el.style.cursor = "grabbing";
      });

      el.addEventListener("pointermove", (e)=>{
        if(!isDown) return;
        const dx = e.clientX - startX;
        if(Math.abs(dx) > 6) moved = true;
        el.scrollLeft = startScrollLeft - dx;
      });

      const end = ()=>{
        if(!isDown) return;
        isDown = false;
        el.style.cursor = "grab";
      };

      el.addEventListener("pointerup", ()=>{
        if(moved){
          el.dataset.dragging = "1";
          // volta para 0 depois de um tick (evita clique acidental)
          setTimeout(()=>{ el.dataset.dragging = "0"; }, 120);
        }
        end();
      });

      el.addEventListener("pointercancel", end);
      el.addEventListener("pointerleave", end);
    }

function buildCategories(){
      const cats = Array.from(new Set(PRODUCTS.map(p => (p.category||"").trim()).filter(Boolean)));
      const list = ["Todos", ...cats];

      const bar = $("catsBar");
      bar.innerHTML = list.map((c,idx)=>`
        <div class="catChip ${idx===0?"active":""}" data-cat="${escapeAttr(c)}">${escapeHtml(c)}</div>
      `).join("");

      // slider/arraste horizontal (Olá Click)
      enableHScrollDrag(bar);

      bar.querySelectorAll(".catChip").forEach(ch=>{
        ch.addEventListener("click", ()=>{
          // se o usuário estava arrastando o slider, ignora o clique
          if(bar.dataset.dragging === "1") return;

          setActiveChip(ch.dataset.cat, true);


          ACTIVE_CATEGORY = ch.dataset.cat;
          TARGET_SCROLL_CATEGORY = (ACTIVE_CATEGORY && ACTIVE_CATEGORY !== "Todos") ? ACTIVE_CATEGORY : null;
          render();
          if(!TARGET_SCROLL_CATEGORY){
            window.scrollTo({ top: 0, behavior:"smooth" });
          }
        });
      });
    }

    function filteredProducts(){
  let list = PRODUCTS.slice();

  // busca
  if(SEARCH){
    const q = SEARCH.toLowerCase();
    list = list.filter(p =>
      String(p.name||"").toLowerCase().includes(q) ||
      String(p.description||"").toLowerCase().includes(q) ||
      String(p.subcategory||"").toLowerCase().includes(q)
    );
  }

  // show mode
  if(FILTER_SHOW === "FEATURED"){
    list = list.filter(p => !!p.featured);
  } else if(FILTER_SHOW === "IN_STOCK"){
    list = list.filter(p => !(p.stock_enabled && Number(p.stock_qty||0) <= 0));
  }

  // sort
  if(FILTER_SORT === "PRICE_ASC"){
    list.sort((a,b)=> Number(a.price||0) - Number(b.price||0));
  } else if(FILTER_SORT === "PRICE_DESC"){
    list.sort((a,b)=> Number(b.price||0) - Number(a.price||0));
  } else if(FILTER_SORT === "NAME_ASC"){
    list.sort((a,b)=> String(a.name||"").localeCompare(String(b.name||""), "pt-BR"));
  }

  return list;
}

    function groupByCategory(list){
      const map = new Map();
      for(const p of list){
        const cat = (p.category||"").trim() || "Produtos";
        if(!map.has(cat)) map.set(cat, []);
        map.get(cat).push(p);
      }
      return Array.from(map.entries()).sort((a,b)=> a[0].localeCompare(b[0], "pt-BR"));
    }

    function setActiveChip(cat, center=true){
      const bar = $("catsBar");
      if(!bar) return;
      const chips = bar.querySelectorAll(".catChip");
      chips.forEach(x=>x.classList.remove("active"));
      const target = Array.from(chips).find(x => String(x.dataset.cat) === String(cat));
      if(target){
        target.classList.add("active");
        if(center){
          try{ target.scrollIntoView({ behavior:"smooth", inline:"center", block:"nearest" }); }catch(_){}
        }
      }
    }

    function setupCategoryObserver(){
      try{ CAT_OBSERVER?.disconnect?.(); }catch(_){}
      CAT_OBSERVER = null;

      const content = $("content");
      const secs = content ? content.querySelectorAll(".catSection") : [];
      if(!secs || !secs.length) return;

      CAT_OBSERVER = new IntersectionObserver((entries)=>{
        let best = null;
        for(const e of entries){
          if(!e.isIntersecting) continue;
          if(!best || e.intersectionRatio > best.intersectionRatio) best = e;
        }
        if(best){
          const cat = best.target.dataset.cat;
          if(cat && cat !== ACTIVE_CATEGORY){
            ACTIVE_CATEGORY = cat;
            setActiveChip(cat, false);
          }
        } else {
          // se estiver muito no topo, volta para "Todos"
          if(window.scrollY < 160 && ACTIVE_CATEGORY !== "Todos"){
            ACTIVE_CATEGORY = "Todos";
            setActiveChip("Todos", false);
          }
        }
      }, { root:null, threshold:[0.2,0.35,0.5,0.65], rootMargin:"-20% 0px -70% 0px" });

      secs.forEach(s=> CAT_OBSERVER.observe(s));
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

    function productCard(p){
      const desc = (p.description||"").trim();
      const out = p.stock_enabled && Number(p.stock_qty||0) <= 0;
      const hasImg = !!p.image_url;

      return `
        <div class="card">
          <div class="left">
            <div class="pName">${escapeHtml(p.name || "Produto")}</div>
            ${desc ? `<div class="pDesc">${escapeHtml(desc)}</div>` : ``}
            <div class="pPrice">${money(p.price)}</div>
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
                ? `<img src="${p.image_url}" alt="${escapeAttr(p.name||"Produto")}">`
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

      const featured = list.filter(p => !!p.featured);
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

      const groupedCats = groupByCategory(list);

      // monta HTML (destaques + categorias + subcategorias)
      content.innerHTML =
        renderFeatured(list) +
        groupedCats.map(([cat, catItems])=>{
          const grouped = groupBySubcategory(catItems);

          return `
            <div class="catSection" data-cat="${escapeAttr(cat)}" id="catsec-${slugify(cat)}">
              <div class="catTitle">${escapeHtml(cat)}</div>
              ${grouped.map(([sub, items])=>{
                const sorted = items.slice().sort((a,b)=>{
                  const af = a.featured ? 0 : 1;
                  const bf = b.featured ? 0 : 1;
                  if(af !== bf) return af - bf;
                  return String(a.name||"").localeCompare(String(b.name||""), "pt-BR");
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

      // wire dos botões +
 // botão + adiciona 1
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

    addToCart(p, 1);
  });
});

// clicar no card abre modal (igual Olá Click)
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

      // observer para destacar categoria ao rolar
      setupCategoryObserver();

      // se usuário clicou em uma categoria, rola até a seção dela
      if(TARGET_SCROLL_CATEGORY){
        const targetId = "catsec-" + slugify(TARGET_SCROLL_CATEGORY);
        const el = document.getElementById(targetId);
        if(el){
          requestAnimationFrame(()=> el.scrollIntoView({ behavior:"smooth", block:"start" }));
        }
        TARGET_SCROLL_CATEGORY = null;
      }

    }

    function cartTotals(){
      const subtotal = CART.reduce((a,it)=> a + (Number(it.price||0)*Number(it.qty||0)), 0);
      const shipping = 0; // próxima etapa: rota
      const total = subtotal + shipping;
      return { subtotal, shipping, total };
    }

    function renderCart(){
      $("cartCount").textContent = String(CART.reduce((a,it)=>a+Number(it.qty||0),0));
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
              <button class="qbtn" data-dec="${escapeAttr(it.product_id)}">-</button>
              <b>${it.qty}</b>
              <button class="qbtn" data-inc="${escapeAttr(it.product_id)}">+</button>
            </div>
          </div>
        `).join("");

        list.querySelectorAll("[data-inc]").forEach(b=>{
          b.addEventListener("click", ()=>{
            const id = String(b.dataset.inc);
            const idx = CART.findIndex(x=> String(x.product_id)===id);
            if(idx<0) return;

            const p = PRODUCTS.find(x=> String(x.id)===id);
            if(p?.stock_enabled){
              const max = Number(p.stock_qty||0);
              if(CART[idx].qty + 1 > max){
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
            const idx = CART.findIndex(x=> String(x.product_id)===id);
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
    }

    function openDrawer(){ $("drawer").classList.add("open"); }
    function closeDrawer(){ $("drawer").classList.remove("open"); }

    function openModal(){ $("modalBack").classList.add("open"); }
    function closeModal(){ $("modalBack").classList.remove("open"); }

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

      if(!name) return alert("Informe seu nome.");
      if(!phone) return alert("Informe seu WhatsApp.");
      if(type==="ENTREGA" && !address) return alert("Informe o endereço.");
      if(need_nfce && !cpf) return alert("Informe o CPF para NFC-e.");

      const items = CART.map(it=>({
        product_id: it.product_id,
        name: it.name,
        price: Number(it.price||0),
        qty: Number(it.qty||0),
      }));

      const t = cartTotals();

      const payload = {
        type,
        customer_name: name,
        customer_phone: phone,
        address,
        payment,
        notes,
        need_nfce,
        cpf,
        shipping: t.shipping,
        subtotal: t.subtotal,
        total: t.total,
        items
      };

      const res = await fetch(API + "/api/orders", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
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

    document.addEventListener("DOMContentLoaded", async ()=>{
      await loadSettings();
      await loadProducts();

      buildCategories();
      render();
      renderCart();

      $("q").addEventListener("input", ()=>{
        SEARCH = $("q").value.trim();
        render();
      });

      $("scrollTopBtn").addEventListener("click", ()=>{
        window.scrollTo({ top: 0, behavior:"smooth" });
      });

      $("cartFab").addEventListener("click", openDrawer);
      $("closeDrawer").addEventListener("click", closeDrawer);

      $("checkoutBtn").addEventListener("click", ()=>{
        if(!CART.length) return alert("Carrinho vazio.");
        openModal();
      });

      $("clearBtn").addEventListener("click", ()=>{
        CART = [];
        renderCart();
        toast("Carrinho limpo ✅");
      });

      $("infoBtn").addEventListener("click", ()=>{
        const addr = SETTINGS.address_base ? `📍 ${SETTINGS.address_base}` : "";
        alert(`${SETTINGS.shop_name || "Emanuelle Confeitaria"}\\n${addr}\\n\\nPedidos via WhatsApp.`);
      });

      $("closeModal").addEventListener("click", closeModal);
      $("cancelModal").addEventListener("click", closeModal);

      $("type").addEventListener("change", ()=>{
        $("addrBox").style.display = ($("type").value === "ENTREGA") ? "block" : "none";
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
  addToCart(MODAL_PRODUCT, MODAL_QTY);
});

$("addAndClose").addEventListener("click", ()=>{
  if(!MODAL_PRODUCT) return;
  const ok = addToCart(MODAL_PRODUCT, MODAL_QTY);
  if(ok) closeProdModal();
});

$("goCart").addEventListener("click", ()=>{
  closeProdModal();
  openDrawer();
});

    });
  
  