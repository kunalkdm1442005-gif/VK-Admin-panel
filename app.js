/* VK Nutrition — Admin Panel logic. Vanilla JS, no build step. */
const { SUPABASE_URL, SUPABASE_ANON_KEY, STORAGE_BUCKET } = window.VK_ADMIN_CONFIG;
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

let currentUser = null;
let isAdmin = false;
let allProducts = [];
let pendingImages = []; // { url, isPrimary } for the form currently open
let editingProductId = null; // null = adding new

/* ---------------- Toasts ---------------- */
function toast(msg, isError = false) {
  const el = document.createElement("div");
  el.className = "toast" + (isError ? " error" : "");
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

/* ---------------- Router ---------------- */
function showPage(route) {
  ["dashboard", "products", "product-form"].forEach((r) => {
    $(`#page-${r}`).classList.toggle("hidden", r !== route);
  });
  $$("nav button[data-route]").forEach((b) => b.classList.toggle("active", b.dataset.route === route && !b.dataset.new));
  if (route === "dashboard") loadDashboard();
  if (route === "products") loadProducts();
}

$$("[data-route]").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.new) resetForm();
    showPage(btn.dataset.route);
  });
});

/* ---------------- Auth ---------------- */
async function checkAdminAccess(user) {
  const { data, error } = await sb.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (error) {
    console.error(error);
    return false;
  }
  return !!data;
}

async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) await onSignedIn(session.user);
  else showLogin();
}

async function onSignedIn(user) {
  const admin = await checkAdminAccess(user);
  if (!admin) {
    await sb.auth.signOut();
    showLogin("This account isn't authorized for the admin panel. Contact the shop owner.");
    return;
  }
  currentUser = user;
  isAdmin = true;
  $("#currentUserEmail").textContent = user.email;
  $("#view-login").classList.add("hidden");
  $("#view-app").classList.remove("hidden");
  showPage("dashboard");
}

function showLogin(errorMsg) {
  $("#view-app").classList.add("hidden");
  $("#view-login").classList.remove("hidden");
  $("#loginError").textContent = errorMsg || "";
}

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#loginBtn");
  btn.disabled = true;
  $("#loginError").textContent = "";
  const email = $("#loginEmail").value.trim();
  const password = $("#loginPassword").value;
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  btn.disabled = false;
  if (error) {
    $("#loginError").textContent = "Incorrect email or password.";
    return;
  }
  await onSignedIn(data.user);
});

$("#logoutBtn").addEventListener("click", async () => {
  await sb.auth.signOut();
  currentUser = null;
  isAdmin = false;
  showLogin();
});

/* ---------------- Dashboard ---------------- */
async function loadDashboard() {
  const { data, error } = await sb.from("products").select("*").order("updated_at", { ascending: false });
  if (error) { toast("Failed to load dashboard: " + error.message, true); return; }
  allProducts = data || [];
  $("#statTotal").textContent = allProducts.length;
  $("#statActive").textContent = allProducts.filter((p) => p.status === "active").length;
  $("#statOOS").textContent = allProducts.filter((p) => p.status === "out_of_stock").length;
  $("#statHidden").textContent = allProducts.filter((p) => p.status === "hidden").length;

  const recent = allProducts.slice(0, 6);
  $("#recentTableBody").innerHTML = recent.map((p) => `
    <tr>
      <td>${escapeHtml(p.name)}</td>
      <td>${escapeHtml(p.category)}</td>
      <td>₹${Number(p.price).toLocaleString("en-IN")}</td>
      <td>${timeAgo(p.updated_at)}</td>
    </tr>`).join("") || `<tr><td colspan="4" class="page-sub">No products yet.</td></tr>`;
}

/* ---------------- Products list ---------------- */
async function loadProducts() {
  const { data, error } = await sb.from("products").select("*").order("updated_at", { ascending: false });
  if (error) { toast("Failed to load products: " + error.message, true); return; }
  allProducts = data || [];
  populateCategoryFilter();
  renderProductsTable();
}

function populateCategoryFilter() {
  const cats = Array.from(new Set(allProducts.map((p) => p.category))).sort();
  const sel = $("#categoryFilter");
  const current = sel.value;
  sel.innerHTML = `<option value="">All categories</option>` + cats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  sel.value = current;
  $("#categoryOptions").innerHTML = cats.map((c) => `<option value="${escapeHtml(c)}">`).join("");
}

let currentView = "grid";

$("#viewGridBtn").addEventListener("click", () => setView("grid"));
$("#viewListBtn").addEventListener("click", () => setView("list"));

function setView(view) {
  currentView = view;
  $("#viewGridBtn").classList.toggle("active", view === "grid");
  $("#viewListBtn").classList.toggle("active", view === "list");
  $("#productsGridView").classList.toggle("hidden", view !== "grid");
  $("#productsListView").classList.toggle("hidden", view !== "list");
  renderProductsTable();
}

function getFilteredProducts() {
  const q = $("#searchInput").value.trim().toLowerCase();
  const cat = $("#categoryFilter").value;
  const status = $("#statusFilter").value;
  return allProducts.filter((p) => {
    const matchesQ = !q || p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q);
    const matchesCat = !cat || p.category === cat;
    const matchesStatus = !status || p.status === status;
    return matchesQ && matchesCat && matchesStatus;
  });
}

function renderProductsTable() {
  const filtered = getFilteredProducts();

  if (currentView === "grid") {
    $("#productsGridEmpty").classList.toggle("hidden", filtered.length !== 0);
    $("#productsGrid").innerHTML = filtered.map((p) => `
      <div class="product-card">
        <div class="thumb">
          ${p.images?.[0] ? `<img src="${escapeHtml(p.images[0])}" alt="" onerror="this.parentElement.innerHTML='<span class=&quot;no-image&quot;>No image</span>'">` : `<span class="no-image">No image</span>`}
        </div>
        <div class="info">
          <span class="name">${escapeHtml(p.name)}</span>
          <span class="cat">${escapeHtml(p.category)}</span>
          <span class="price">₹${Number(p.discount_price ?? p.price).toLocaleString("en-IN")}</span>
          <span class="badge badge-${p.status}">${statusLabel(p.status)}</span>
          <div class="row-actions">
            <button data-edit="${escapeHtml(p.id)}">Edit</button>
            <button class="danger" data-delete="${escapeHtml(p.id)}">Delete</button>
          </div>
        </div>
      </div>`).join("");
    return;
  }

  $("#productsEmpty").classList.toggle("hidden", filtered.length !== 0);
  $("#productsTableBody").innerHTML = filtered.map((p) => `
    <tr>
      <td class="prod-cell">
        <img src="${escapeHtml(p.images?.[0] || '')}" alt="" onerror="this.style.visibility='hidden'">
        <span>${escapeHtml(p.name)}</span>
      </td>
      <td>${escapeHtml(p.category)}</td>
      <td>${p.discount_price ? `<s style="color:#999">₹${Number(p.price).toLocaleString("en-IN")}</s> ₹${Number(p.discount_price).toLocaleString("en-IN")}` : `₹${Number(p.price).toLocaleString("en-IN")}`}</td>
      <td>${p.stock}</td>
      <td><span class="badge badge-${p.status}">${statusLabel(p.status)}</span></td>
      <td>${timeAgo(p.updated_at)}</td>
      <td class="row-actions">
        <button data-edit="${escapeHtml(p.id)}">Edit</button>
        <button class="danger" data-delete="${escapeHtml(p.id)}">Delete</button>
      </td>
    </tr>`).join("");
}

function statusLabel(s) { return s === "active" ? "Active" : s === "out_of_stock" ? "Out of stock" : "Hidden"; }

["searchInput", "categoryFilter", "statusFilter"].forEach((id) => {
  $(`#${id}`).addEventListener("input", renderProductsTable);
  $(`#${id}`).addEventListener("change", renderProductsTable);
});

document.body.addEventListener("click", (e) => {
  const editId = e.target.dataset.edit;
  const delId = e.target.dataset.delete;
  if (editId) openEditForm(editId);
  if (delId) confirmDelete(delId);
});

/* ---------------- Delete ---------------- */
function confirmDelete(id) {
  const product = allProducts.find((p) => p.id === id);
  $("#confirmTitle").textContent = "Delete this product?";
  $("#confirmBody").textContent = `"${product?.name || id}" will be permanently removed and will disappear from the website immediately.`;
  $("#confirmModal").classList.remove("hidden");
  $("#confirmOk").onclick = async () => {
    $("#confirmModal").classList.add("hidden");
    const { error } = await sb.from("products").delete().eq("id", id);
    if (error) { toast("Delete failed: " + error.message, true); return; }
    toast("Product deleted.");
    loadProducts();
  };
}
$("#confirmCancel").addEventListener("click", () => $("#confirmModal").classList.add("hidden"));

/* ---------------- Add / Edit form ---------------- */
function resetForm() {
  editingProductId = null;
  pendingImages = [];
  $("#formTitle").textContent = "Add Product";
  $("#productForm").reset();
  $("#pf_id").disabled = false;
  $("#pf_status").value = "active";
  $("#deleteProductBtn").classList.add("hidden");
  $("#formError").textContent = "";
  renderHighlightRows([""]);
  renderImageList();
}

function openEditForm(id) {
  const p = allProducts.find((prod) => prod.id === id);
  if (!p) return;
  editingProductId = id;
  $("#formTitle").textContent = "Edit Product";
  $("#pf_originalId").value = p.id;
  $("#pf_id").value = p.id;
  $("#pf_id").disabled = true; // keep IDs stable once created
  $("#pf_name").value = p.name;
  $("#pf_category").value = p.category;
  $("#pf_pack").value = p.pack || "";
  $("#pf_price").value = p.price;
  $("#pf_discount_price").value = p.discount_price || "";
  $("#pf_stock").value = p.stock;
  $("#pf_status").value = p.status;
  $("#pf_description").value = p.description || "";
  $("#deleteProductBtn").classList.remove("hidden");
  $("#formError").textContent = "";
  renderHighlightRows(p.highlights?.length ? p.highlights : [""]);
  pendingImages = (p.images || []).map((url, i) => ({ url, isPrimary: i === 0 }));
  renderImageList();
  showPage("product-form");
}

/* Highlights (dynamic bullet list) */
function renderHighlightRows(values) {
  $("#highlightsList").innerHTML = values.map((v, i) => `
    <div class="highlight-row">
      <input type="text" value="${escapeAttr(v)}" placeholder="e.g. 24g protein per serving" data-highlight-idx="${i}">
      <button type="button" data-remove-highlight="${i}">×</button>
    </div>`).join("");
}
$("#addHighlightBtn").addEventListener("click", () => {
  const rows = $$("#highlightsList input").map((i) => i.value);
  rows.push("");
  renderHighlightRows(rows);
});
$("#highlightsList").addEventListener("click", (e) => {
  if (e.target.dataset.removeHighlight !== undefined) {
    const rows = $$("#highlightsList input").map((i) => i.value);
    rows.splice(Number(e.target.dataset.removeHighlight), 1);
    renderHighlightRows(rows.length ? rows : [""]);
  }
});

/* Images */
function renderImageList() {
  $("#imageList").innerHTML = pendingImages.map((img, i) => `
    <div class="image-thumb ${img.isPrimary ? "is-primary" : ""}">
      <img src="${escapeAttr(img.url)}">
      ${img.isPrimary ? '<div class="primary-tag">Primary</div>' : `<button type="button" class="make-primary" data-primary="${i}">Set primary</button>`}
      <button type="button" class="remove-img" data-remove-image="${i}">×</button>
    </div>`).join("");
}
$("#imageList").addEventListener("click", (e) => {
  if (e.target.dataset.removeImage !== undefined) {
    pendingImages.splice(Number(e.target.dataset.removeImage), 1);
    if (pendingImages.length && !pendingImages.some((i) => i.isPrimary)) pendingImages[0].isPrimary = true;
    renderImageList();
  }
  if (e.target.dataset.primary !== undefined) {
    pendingImages.forEach((img, i) => (img.isPrimary = i === Number(e.target.dataset.primary)));
    renderImageList();
  }
});

$("#pf_imageFile").addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  toast(`Uploading ${files.length} image(s)…`);
  for (const file of files) {
    try {
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${sanitizeFilename(file.name)}`;
      const { error: upErr } = await sb.storage.from(STORAGE_BUCKET).upload(path, file, { cacheControl: "3600", upsert: false });
      if (upErr) throw upErr;
      const { data } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(path);
      pendingImages.push({ url: data.publicUrl, isPrimary: pendingImages.length === 0 });
    } catch (err) {
      toast("Image upload failed: " + err.message, true);
    }
  }
  renderImageList();
  e.target.value = "";
});

/* Save (insert or update) */
$("#productForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#saveProductBtn");
  $("#formError").textContent = "";

  const id = $("#pf_id").value.trim();
  const idPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  if (!idPattern.test(id)) {
    $("#formError").textContent = "Product ID must be lowercase letters, numbers, and hyphens only (e.g. whey-protein-1kg).";
    return;
  }

  const highlights = $$("#highlightsList input").map((i) => i.value.trim()).filter(Boolean);
  const images = orderedImageUrls();
  const price = Number($("#pf_price").value);
  const discountRaw = $("#pf_discount_price").value;
  const discount_price = discountRaw === "" ? null : Number(discountRaw);

  if (discount_price !== null && discount_price >= price) {
    $("#formError").textContent = "Discount price should be lower than the regular price.";
    return;
  }

  const payload = {
    id,
    name: $("#pf_name").value.trim(),
    category: $("#pf_category").value.trim(),
    pack: $("#pf_pack").value.trim(),
    price,
    discount_price,
    stock: Number($("#pf_stock").value),
    status: $("#pf_status").value,
    description: $("#pf_description").value.trim(),
    highlights,
    images,
    updated_by: currentUser.id,
  };

  btn.disabled = true;
  let error;
  if (editingProductId) {
    ({ error } = await sb.from("products").update(payload).eq("id", editingProductId));
  } else {
    payload.created_by = currentUser.id;
    ({ error } = await sb.from("products").insert(payload));
  }
  btn.disabled = false;

  if (error) {
    $("#formError").textContent = error.code === "23505"
      ? "A product with this ID already exists. Choose a different ID."
      : "Save failed: " + error.message;
    return;
  }

  toast(editingProductId ? "Product updated — live on the website now." : "Product added — live on the website now.");
  showPage("products");
});

function orderedImageUrls() {
  const primary = pendingImages.find((i) => i.isPrimary);
  const rest = pendingImages.filter((i) => i !== primary);
  return [primary, ...rest].filter(Boolean).map((i) => i.url);
}

$("#deleteProductBtn").addEventListener("click", () => {
  if (editingProductId) confirmDelete(editingProductId);
});

/* ---------------- Utilities ---------------- */
function escapeHtml(v) {
  return String(v ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
}
function escapeAttr(v) { return escapeHtml(v); }
function sanitizeFilename(name) { return name.replace(/[^a-zA-Z0-9.\-_]/g, "_"); }
function timeAgo(iso) {
  if (!iso) return "–";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

boot();
