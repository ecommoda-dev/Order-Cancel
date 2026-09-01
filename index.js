// ══════════════════════════════════════════════════════
// EcomModa — Order Cancel Tool Worker
// TOOL_VERSION: v2.2.0  (كان v2.0.0 مسوّدة · المنشور على كلاودفلير كان v1.0.3)
// skills: worker-builder v1.1.0 · html-builder v2.2.0 · constants v1.4.1 ·
//         shopify-graphql-helper v1.0.0 · order-lifecycle v1.1.0 — 01-09-2026
//
// CHANGELOG v2.2.0:
//   🟡 [تغيير] REASON_ENUM_MAP اتشال بالكامل. كل إلغاء بيترفع لشوبيفاي بـ
//       OTHER — الحالي وأي سبب جديد. قرار أحمد 01-09-2026.
//       الدافع: التصنيف كان تقارير خشنة بس، وكان بيحمل فخ صامت (أي سبب
//       جديد على شوبيفاي بيقع على OTHER من غير خطأ ولا تحذير). شيل الجدول
//       بيشيل الفخ من أصله ويخلي السلوك متوقع دايمًا.
//       ⚠️ الأثر: تقرير أسباب الإلغاء في شوبيفاي بقى كله "Other" بلا تقسيم.
//       أي تحليل للأسباب مصدره custom.cancel_manual_reason أو D1.
//
// CHANGELOG v2.1.1:
//   🟡 [تغيير] REASON_ENUM_MAP اتراجع واتأكد من أحمد (01-09-2026) — بقى
//       تصنيف مُقرّ مش تخمين. الأسماء الـ14 اتقارنت بالقائمة الحية على
//       شوبيفاي وطابقت حرفيًا (نفس النص ونفس الترتيب، صفر اختلاف).
//       التعديلات: "لا يوجد سبب" OTHER→CUSTOMER · "رقم غير صحيح"
//       STAFF→CUSTOMER · "المنتج غير أصلي" OTHER→CUSTOMER · "أوردر مكرر
//       وتم دمجه" STAFF→OTHER. مفيش STAFF ولا DECLINED مستخدمين خالص —
//       DECLINED معناها في شوبيفاي "الدفع اترفض" وده مستحيل هنا لأن
//       الأداة بتشتغل على PENDING (COD ملهاش تحصيل).
//
// CHANGELOG v2.1.0 (أول نشر من git):
//   🔴 [إصلاح] endpoint `get_employees` كان **ناقص تمامًا** — الواجهة بتناديه
//       في loadEmployeesList() عشان تملا قائمة الموظفين في شاشة الدخول، والـ
//       Worker كان بيرد "Not found" (404). النتيجة: مفيش موظف يقدر يسجّل دخول
//       والأداة كانت هتطلع لايف معطّلة بالكامل. اتضاف بالنسخة الحرفية من
//       ecommoda-worker-builder → references/auth-endpoints.md.
//   🟡 [إصلاح] writeLog جوه verify_employee و log_logout بقى في try/catch
//       محلي وبيرجّع logged:false بدل ما فشل D1 يرمي 500 عام ويمنع دخول
//       نجح فعلاً (auth-endpoints.md §D1 Write-Failure Handling).
//   ⚪ [تغيير] رقم النسخة بقى const WORKER_VERSION واحد بدل نصّين مكرّرين
//       في handleDiag و handleGetConfig.
//
// CHANGELOG v2.0.0 (تغيير كاسر — مسوّدة، ما اتنشرتش):
//   🔴 [جديد] قائمة أسباب الإلغاء بقت بتتقرا لايف من ميتافيلد شوبيفاي
//       (custom.cancel_manual_reason choices) بدل قائمة مخترعة في الكود.
//   🔴 [إصلاح] تحقق فعلي بعد orderCancel: بنعيد قراءة الأوردر ونتأكد
//       إن cancelledAt اتسجّل قبل ما نقول "تم" — النسخة القديمة كانت
//       بترجع نجاح بمجرد استلام job من غير تأكيد.
//   🟡 [إصلاح] shopifyGQL اتبدّلت بالنسخة الكاملة (retry + معالجة أخطاء
//       شاملة) بدل نسخة v1.0.3 اللي كانت resp.json() مباشرة.
//   🟡 [إصلاح] ALLOWED_ORIGINS اتنضّفت من ecommoda24.github.io القديم.
//   🟡 [جديد] دعم إدخال رابط الأوردر الكامل من داشبورد شوبيفاي (مش رقم/اسم بس).
//   ⚪ [تغيير] ?action=diag و ?action=get_config اتضافوا.
//   🟡 [جديد] shippingAddress بقت بترجع مع الأوردر (اسم/عنوان/مدينة/محافظة/
//       كود بريدي/دولة/تليفون) — عشان واجهة الأداة تقدر تعرض تفاصيل العنوان.
//
// ⚠️ manual_status المسموح فضل New Order/Confirmed/Ready (زي ما كان) —
//     أحمد قرر نسيبه زي ما هو، مش New Order بس.
// ⚠️ سبب الإلغاء المرفوع لشوبيفاي ثابت OTHER دايمًا — شوف v2.2.0 فوق.
// ══════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════
// §CONSTANTS
// ══════════════════════════════════════════════════════
const TOOL_NAME = "order_cancel";
const WORKER_VERSION = "2.2.0";
const API_VERSION = "2026-01";

const ALLOWED_ORIGINS = [
  "https://ecommoda-dev.github.io",
];

const ALLOWED_MANUAL_STATUS = new Set(["New Order", "Confirmed", "Ready"]);
const ALLOWED_FINANCIAL_STATUS = new Set(["PENDING"]);

// كل الإلغاءات بتترفع لشوبيفاي بسبب واحد ثابت: OTHER.
// قرار أحمد 01-09-2026 — جدول التصنيف (REASON_ENUM_MAP) اتشال بالكامل.
// السبب التجاري الحقيقي بيتكتب كامل بالعربي في custom.cancel_manual_reason
// وفي سجل D1، وهما مصدر أي تحليل لأسباب الإلغاء — مش تقارير شوبيفاي.
const SHOPIFY_CANCEL_REASON = "OTHER";

// ══════════════════════════════════════════════════════
// §CORS
// ══════════════════════════════════════════════════════
function getCORS(request) {
  const origin = request.headers.get("Origin") || "";
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin || ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
  };
}

// ══════════════════════════════════════════════════════
// §HELPERS
// ══════════════════════════════════════════════════════
function json(body, status = 200, request = null) {
  const cors = request ? getCORS(request) : {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...(cors || {}), "Content-Type": "application/json; charset=utf-8" },
  });
}

function badRequest(message, request) {
  return json({ ok: false, error: message }, 400, request);
}

// ══════════════════════════════════════════════════════
// §SHARED — copy verbatim — never modify
// ══════════════════════════════════════════════════════
async function verifyEmployee(db, username, pin) {
  const row = await db.prepare(
    "SELECT display_name, is_active FROM employees WHERE username = ? AND pin = ?"
  ).bind(username, pin).first();
  if (!row) return null;
  if (!row.is_active) throw new Error("الحساب موقوف — تواصل مع المسؤول");
  db.prepare("UPDATE employees SET last_login = ? WHERE username = ?")
    .bind(new Date().toISOString(), username).run().catch(() => {});
  return row.display_name;
}

async function checkEmployee(db, username) {
  const row = await db.prepare(
    "SELECT is_active, pin FROM employees WHERE username = ?"
  ).bind(username).first();
  if (!row) return { exists: false, hasPin: false, isActive: false };
  return { exists: true, hasPin: !!row.pin, isActive: !!row.is_active };
}

async function registerPin(db, username, pin) {
  const row = await db.prepare(
    "SELECT pin, is_active FROM employees WHERE username = ?"
  ).bind(username).first();
  if (!row) throw new Error("اسم المستخدم غير موجود");
  if (!row.is_active) throw new Error("الحساب موقوف — تواصل مع المسؤول");
  if (row.pin) throw new Error("هذا المستخدم مسجّل بالفعل — تواصل مع المسؤول لإعادة الضبط");
  await db.prepare("UPDATE employees SET pin = ? WHERE username = ?").bind(pin, username).run();
  return true;
}

async function writeLog(db, entry) {
  await db.prepare(`
    INSERT INTO logs
      (timestamp, tool, type, employee, order_id, order_name,
       sku, product_title, delta, value_before, value_after, notes, extra)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    entry.timestamp ?? new Date().toISOString(),
    entry.tool, entry.type, entry.employee ?? null,
    entry.orderId ?? null, entry.orderName ?? null,
    entry.sku ?? null, entry.productTitle ?? null,
    entry.delta ?? null, entry.valueBefore ?? null, entry.valueAfter ?? null,
    entry.notes ?? null, entry.extra ? JSON.stringify(entry.extra) : null
  ).run();
}

async function getLogs(db, { tool = null, employee = null, type = null, search = null, limit = 200, offset = 0 } = {}) {
  let sql = "SELECT * FROM logs WHERE 1=1";
  const b = [];
  if (tool) { sql += " AND tool = ?"; b.push(tool); }
  if (employee) { sql += " AND employee = ?"; b.push(employee); }
  if (type) { sql += " AND type = ?"; b.push(type); }
  if (search) {
    sql += " AND (sku LIKE ? OR product_title LIKE ? OR order_name LIKE ? OR notes LIKE ?)";
    b.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  sql += " ORDER BY timestamp DESC LIMIT ? OFFSET ?";
  b.push(Math.min(Number(limit) || 200, 500), Number(offset) || 0);
  return (await db.prepare(sql).bind(...b).all()).results;
}

// ══════════════════════════════════════════════════════
// §SHOPIFY
// ══════════════════════════════════════════════════════
async function getAccessToken(env) {
  const resp = await fetch(`https://${env.SHOP_DOMAIN}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.CLIENT_ID,
      client_secret: env.CLIENT_SECRET,
      grant_type: "client_credentials",
    }),
  });
  if (!resp.ok) throw new Error(`OAuth failed: ${resp.status}`);
  const data = await resp.json();
  if (!data.access_token) throw new Error("No access_token in OAuth response");
  return data.access_token;
}

// النسخة الكاملة — بترمي على HTTP status و data.errors والرد الفاضي،
// وبتعمل retry على THROTTLED/429/5xx. راجع shopify-graphql-helper Step 1.
async function shopifyGQL(env, token, query, variables = {}, opName = "shopify") {
  const MAX_ATTEMPTS = 3;
  let lastErr = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let resp, text;
    try {
      resp = await fetch(`https://${env.SHOP_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
        body: JSON.stringify({ query, variables }),
      });
      text = await resp.text();
    } catch (e) {
      lastErr = new Error(`${opName}: network failure — ${e.message}`);
      if (attempt < MAX_ATTEMPTS) { await new Promise(r => setTimeout(r, 400 * attempt)); continue; }
      throw lastErr;
    }

    if (!resp.ok) {
      const retriable = resp.status === 429 || resp.status >= 500;
      lastErr = new Error(`${opName}: Shopify HTTP ${resp.status} — ${text.slice(0, 180)}`);
      if (retriable && attempt < MAX_ATTEMPTS) { await new Promise(r => setTimeout(r, 700 * attempt)); continue; }
      throw lastErr;
    }

    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error(`${opName}: non-JSON response — ${text.slice(0, 180)}`); }

    if (Array.isArray(data.errors) && data.errors.length) {
      const codes = data.errors.map(e => e?.extensions?.code).filter(Boolean);
      lastErr = new Error(
        `${opName}: ${data.errors.map(e => e.message).join(" | ")}` +
        (codes.length ? ` [${codes.join(",")}]` : "")
      );
      if (codes.includes("THROTTLED") && attempt < MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, 1200 * attempt)); continue;
      }
      throw lastErr;
    }

    if (!data.data) throw new Error(`${opName}: response has no data — ${text.slice(0, 180)}`);
    return data;
  }
  throw lastErr || new Error(`${opName}: unknown failure`);
}

function normalizeOrderName(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  const cleaned = raw.replace(/\s+/g, "");
  return cleaned.startsWith("#") ? cleaned : `#${cleaned}`;
}

function numericOrderIdFromGid(gid) {
  return String(gid || "").split("/").pop() || null;
}

function moneyText(set) {
  const amount = set?.shopMoney?.amount;
  const currency = set?.shopMoney?.currencyCode;
  if (amount == null || !currency) return "";
  return `${Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

// ─── §CANCEL::parseOrderInput ───
// يقبل: "12345" / "#12345" / رابط Admin كامل (…/orders/12345 أو …/orders/#12345)
function parseOrderInput(raw) {
  const val = String(raw || "").trim();
  if (!val) return null;

  const urlMatch = val.match(/\/orders\/(#?\d+)/i);
  if (urlMatch) {
    const seg = urlMatch[1].replace(/^#/, "");
    return { type: "id", value: seg };
  }
  if (/^https?:\/\//i.test(val)) return null; // رابط مش متعرّف عليه

  return { type: "name", value: normalizeOrderName(val) };
}

function mapOrderNode(order) {
  const manualStatus = order?.manualStatus?.value || "";
  const cancelManualReason = order?.cancelManualReason?.value || "";
  const openReturns = (order?.returns?.nodes || []).filter(
    r => !["CANCELED", "DECLINED", "CLOSED"].includes(r.status)
  );

  return {
    id: order.id,
    numericId: numericOrderIdFromGid(order.id),
    name: order.name,
    createdAt: order.createdAt,
    cancelledAt: order.cancelledAt,
    closed: !!order.closed,
    displayFinancialStatus: order.displayFinancialStatus || "",
    displayFulfillmentStatus: order.displayFulfillmentStatus || "",
    totalPrice: moneyText(order.totalPriceSet),
    totalOutstanding: moneyText(order.totalOutstandingSet),
    customerName: order.customer?.displayName || order.shippingAddress?.name || "",
    customerPhone: order.customer?.phone || order.shippingAddress?.phone || order.phone || "",
    shippingAddress: order.shippingAddress ? {
      name: order.shippingAddress.name || "",
      address1: order.shippingAddress.address1 || "",
      address2: order.shippingAddress.address2 || "",
      city: order.shippingAddress.city || "",
      province: order.shippingAddress.province || "",
      zip: order.shippingAddress.zip || "",
      country: order.shippingAddress.country || "",
      phone: order.shippingAddress.phone || "",
    } : null,
    manualStatus,
    cancelManualReason,
    canCancelByManualStatus: ALLOWED_MANUAL_STATUS.has(manualStatus),
    canCancelByFinancialStatus: ALLOWED_FINANCIAL_STATUS.has(order.displayFinancialStatus),
    hasOpenReturn: openReturns.length > 0,
    alreadyCancelled: !!order.cancelledAt,
    fulfillmentsCount: Array.isArray(order.fulfillments) ? order.fulfillments.length : 0,
  };
}

const ORDER_FIELDS = `
  id
  name
  createdAt
  cancelledAt
  closed
  displayFinancialStatus
  displayFulfillmentStatus
  phone
  totalPriceSet { shopMoney { amount currencyCode } }
  totalOutstandingSet { shopMoney { amount currencyCode } }
  customer { displayName phone }
  shippingAddress {
    name address1 address2 city province zip country phone
  }
  manualStatus: metafield(namespace: "custom", key: "manual_status") { value type }
  cancelManualReason: metafield(namespace: "custom", key: "cancel_manual_reason") { value type }
  fulfillments(first: 10) { id status displayStatus }
  returns(first: 5) { nodes { status } }
`;

async function findOrderByName(env, token, orderName) {
  const query = `query FindOrder($q: String!) {
    orders(first: 1, query: $q) { edges { node { ${ORDER_FIELDS} } } }
  }`;
  const data = await shopifyGQL(env, token, query, { q: `name:${orderName}` }, "findOrderByName");
  const node = data?.data?.orders?.edges?.[0]?.node;
  return node ? mapOrderNode(node) : null;
}

async function getOrderById(env, token, orderId) {
  const query = `query GetOrder($id: ID!) {
    order: node(id: $id) { ... on Order { ${ORDER_FIELDS} } }
  }`;
  const data = await shopifyGQL(env, token, query, { id: orderId }, "getOrderById");
  const node = data?.data?.order;
  return node ? mapOrderNode(node) : null;
}

// ─── §CANCEL::fetchCancelReasons ───
// بيقرا choices اللايف من تعريف الميتافيلد على شوبيفاي — مصدر الحقيقة الوحيد.
async function fetchCancelReasons(env, token) {
  const query = `query CancelReasonDef {
    metafieldDefinitions(first: 1, ownerType: ORDER, namespace: "custom", key: "cancel_manual_reason") {
      nodes { validations { name value } }
    }
  }`;
  const data = await shopifyGQL(env, token, query, {}, "fetchCancelReasons");
  const def = data?.data?.metafieldDefinitions?.nodes?.[0];
  const choicesRaw = def?.validations?.find(v => v.name === "choices")?.value;
  if (!choicesRaw) throw new Error("تعريف ميتافيلد custom.cancel_manual_reason مش موجود أو مالوش choices");
  try {
    const list = JSON.parse(choicesRaw);
    if (!Array.isArray(list) || !list.length) throw new Error("empty");
    return list;
  } catch {
    throw new Error("فشل قراءة قائمة أسباب الإلغاء من شوبيفاي — الصيغة مش JSON صالح");
  }
}

// ─── §CANCEL::cancelOrderInShopify ───
async function cancelOrderInShopify(env, token, { orderId, notifyCustomer, restock, shopifyReason, staffNote }) {
  const mutation = `mutation OrderCancel(
    $orderId: ID!, $notifyCustomer: Boolean,
    $refundMethod: OrderCancelRefundMethodInput!,
    $restock: Boolean!, $reason: OrderCancelReason!, $staffNote: String
  ) {
    orderCancel(
      orderId: $orderId, notifyCustomer: $notifyCustomer,
      refundMethod: $refundMethod, restock: $restock,
      reason: $reason, staffNote: $staffNote
    ) {
      job { id done }
      orderCancelUserErrors { field message code }
      userErrors { field message }
    }
  }`;

  const variables = {
    orderId,
    notifyCustomer: !!notifyCustomer,
    // COD-آمن: مفيش transaction مقبوضة أصلاً (financial_status = PENDING) —
    // فمفيش حاجة نرجّعها على وسيلة الدفع الأصلية.
    refundMethod: { originalPaymentMethodsRefund: false },
    restock: !!restock,
    reason: shopifyReason,
    staffNote,
  };

  const data = await shopifyGQL(env, token, mutation, variables, "orderCancel");
  const payload = data?.data?.orderCancel;
  const errors = [...(payload?.orderCancelUserErrors || []), ...(payload?.userErrors || [])];
  if (errors.length) throw new Error(errors.map(e => `${e.code ? e.code + ": " : ""}${e.message}`).join(" | "));

  // Step 1B ③ — job.id لوحده مش دليل كافي. لازم نتأكد إن الـ job اتقبل على الأقل.
  if (!payload?.job?.id) throw new Error("orderCancel: شوبيفاي ما رجّعتش job — العملية مش مؤكَّدة");
  return payload.job;
}

async function writeCancelReasonMetafield(env, token, orderId, reasonLabel) {
  const mutation = `mutation SetCancelReason($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id namespace key value type updatedAt }
      userErrors { field message code }
    }
  }`;
  const variables = {
    metafields: [{
      ownerId: orderId, namespace: "custom", key: "cancel_manual_reason",
      type: "single_line_text_field", value: reasonLabel,
    }],
  };
  const data = await shopifyGQL(env, token, mutation, variables, "writeCancelReasonMetafield");
  const payload = data?.data?.metafieldsSet;
  if (payload?.userErrors?.length) {
    throw new Error(payload.userErrors.map(e => `${e.code ? e.code + ": " : ""}${e.message}`).join(" | "));
  }
  const mf = payload?.metafields?.[0];
  if (!mf || mf.value !== reasonLabel) {
    throw new Error("metafieldsSet: القيمة المكتوبة ما اتأكدتش تطابق السبب المُختار");
  }
  return mf;
}

// ══════════════════════════════════════════════════════
// §CANCEL — route handlers
// ══════════════════════════════════════════════════════

// ─── §CANCEL::handleLookupOrder ───
async function handleLookupOrder(request, env) {
  const url = new URL(request.url);
  const orderInput = url.searchParams.get("order") || "";
  const parsed = parseOrderInput(orderInput);
  if (!parsed) return badRequest("اكتب رقم الأوردر، أو #الرقم، أو رابط الأوردر من داشبورد شوبيفاي", request);

  const token = await getAccessToken(env);

  let order = null;
  if (parsed.type === "id") {
    order = await getOrderById(env, token, `gid://shopify/Order/${parsed.value}`);
  } else {
    order = await findOrderByName(env, token, parsed.value);
  }
  if (!order) return json({ ok: false, error: `لم يتم العثور على الأوردر` }, 404, request);

  let cancelReasons = [];
  try {
    cancelReasons = await fetchCancelReasons(env, token);
  } catch (e) {
    // فشل قراءة القائمة الحية = خطأ يوقف العملية، مش يرجع لقائمة قديمة مختلفة
    return json({ ok: false, error: `تعذّر قراءة قائمة أسباب الإلغاء من شوبيفاي: ${e.message}` }, 502, request);
  }

  return json({
    ok: true,
    order,
    allowedManualStatuses: Array.from(ALLOWED_MANUAL_STATUS),
    allowedFinancialStatuses: Array.from(ALLOWED_FINANCIAL_STATUS),
    cancelReasons, // array of strings — مش object زي القديم
  }, 200, request);
}

// ─── §CANCEL::handleCancelOrder ───
async function handleCancelOrder(request, env) {
  const body = await request.json().catch(() => null);
  if (!body) return badRequest("Body غير صالح", request);

  const { orderId, reasonLabel, restock = true, notifyCustomer = false, employee } = body;

  if (!employee) return badRequest("بيانات الموظف ناقصة — اعمل Login مرة أخرى", request);
  if (!orderId || !String(orderId).startsWith("gid://shopify/Order/")) {
    return badRequest("Order ID غير صالح", request);
  }
  if (!reasonLabel) return badRequest("سبب الإلغاء غير مُختار", request);

  const token = await getAccessToken(env);

  // تحقق من القائمة الحية وقت الإلغاء — مش وقت الـ lookup فقط (تجنّب فرق التوقيت)
  const liveReasons = await fetchCancelReasons(env, token);
  if (!liveReasons.includes(reasonLabel)) {
    return badRequest(`سبب الإلغاء "${reasonLabel}" مش موجود في القائمة الحالية على شوبيفاي`, request);
  }

  const orderBefore = await getOrderById(env, token, orderId);
  if (!orderBefore) return json({ ok: false, error: "الأوردر غير موجود" }, 404, request);

  if (orderBefore.alreadyCancelled) {
    return badRequest(`الأوردر ${orderBefore.name} ملغي بالفعل`, request);
  }
  if (!ALLOWED_MANUAL_STATUS.has(orderBefore.manualStatus)) {
    return badRequest(
      `غير مسموح بإلغاء الأوردر لأن manual_status = "${orderBefore.manualStatus || "فارغ"}". المسموح: New Order / Confirmed / Ready`,
      request
    );
  }
  if (!ALLOWED_FINANCIAL_STATUS.has(orderBefore.displayFinancialStatus)) {
    return badRequest(
      `غير مسموح بإلغاء الأوردر لأن financial status = "${orderBefore.displayFinancialStatus || "فارغ"}". المسموح فقط: PENDING`,
      request
    );
  }
  // دفاع إضافي — عمليًا مستحيل يحصل على أوردر لسه ما اتوصلش لـ Delivered،
  // لكن شوبيفاي نفسها كمان بترفض orderCancel لو فيه return شغّال.
  if (orderBefore.hasOpenReturn) {
    return badRequest(`الأوردر ${orderBefore.name} عليه طلب استرجاع/استبدال مفتوح`, request);
  }

  const shopifyReason = SHOPIFY_CANCEL_REASON;
  const staffNote = `Cancelled from EcomModa Order Cancel Tool by ${employee}. Manual reason: ${reasonLabel}`.slice(0, 255);

  let job = null, metafield = null, confirmed = false;

  try {
    job = await cancelOrderInShopify(env, token, { orderId, notifyCustomer, restock, shopifyReason, staffNote });
    metafield = await writeCancelReasonMetafield(env, token, orderId, reasonLabel);

    // تحقق فعلي بعد التنفيذ — مش بس نشوف إن الـ job اتقبل
    const verify = await getOrderById(env, token, orderId);
    confirmed = !!verify?.cancelledAt;

    await writeLog(env.DB, {
      tool: TOOL_NAME, type: "cancel", employee,
      orderId: orderBefore.numericId, orderName: orderBefore.name,
      notes: `تم إلغاء الأوردر — السبب: ${reasonLabel}${confirmed ? "" : " (لسه مش مؤكَّد من شوبيفاي)"}`,
      extra: {
        orderGid: orderId, manualStatusBefore: orderBefore.manualStatus,
        reasonLabel, shopifyReason, restock: !!restock, notifyCustomer: !!notifyCustomer,
        job, metafield, confirmed,
      },
    });

    return json({
      ok: true,
      message: confirmed
        ? `تم إلغاء الأوردر ${orderBefore.name} وتأكيده`
        : `تم إرسال طلب إلغاء الأوردر ${orderBefore.name} — لسه قيد التأكيد من شوبيفاي`,
      confirmed, order: orderBefore, job, metafield,
    }, 200, request);

  } catch (err) {
    await writeLog(env.DB, {
      tool: TOOL_NAME, type: "cancel_failed", employee,
      orderId: orderBefore.numericId, orderName: orderBefore.name,
      notes: `فشل إلغاء الأوردر — ${err.message}`,
      extra: {
        orderGid: orderId, manualStatusBefore: orderBefore.manualStatus,
        reasonLabel, shopifyReason, restock: !!restock, notifyCustomer: !!notifyCustomer,
        error: err.message,
      },
    }).catch(() => {});
    return json({ ok: false, error: err.message }, 500, request);
  }
}

async function handleGetLogs(request, env) {
  const url = new URL(request.url);
  const logs = await getLogs(env.DB, {
    tool: TOOL_NAME,
    employee: url.searchParams.get("employee") || null,
    type: url.searchParams.get("type") || null,
    search: url.searchParams.get("search") || null,
    limit: Number(url.searchParams.get("limit") || 100),
    offset: Number(url.searchParams.get("offset") || 0),
  });
  return json({ ok: true, logs }, 200, request);
}

async function handleDiag(request, env) {
  try {
    const token = await getAccessToken(env);
    const data = await shopifyGQL(env, token, `{ currentAppInstallation { accessScopes { handle } } }`, {}, "diag");
    const scopes = (data?.data?.currentAppInstallation?.accessScopes || []).map(s => s.handle);
    return json({
      ok: true,
      tool: TOOL_NAME, version: WORKER_VERSION,
      hasWriteOrders: scopes.includes("write_orders"),
      hasReadReturns: scopes.includes("read_returns"),
      hasWriteReturns: scopes.includes("write_returns"),
    }, 200, request);
  } catch (e) {
    return json({ ok: false, error: e.message }, 500, request);
  }
}

function handleGetConfig(request) {
  return json({
    ok: true,
    tool: TOOL_NAME, version: WORKER_VERSION,
    allowedOrigins: ALLOWED_ORIGINS,
    allowedManualStatuses: Array.from(ALLOWED_MANUAL_STATUS),
    allowedFinancialStatuses: Array.from(ALLOWED_FINANCIAL_STATUS),
  }, 200, request);
}

// ══════════════════════════════════════════════════════
// §HANDLER
// ══════════════════════════════════════════════════════
export default {
  async fetch(request, env) {
    const cors = getCORS(request);

    if (request.method === "OPTIONS") {
      if (!cors) return new Response("Forbidden origin", { status: 403 });
      return new Response(null, { status: 204, headers: cors });
    }
    if (!cors) return new Response("Forbidden origin", { status: 403 });

    const auth = request.headers.get("Authorization");
    if (!auth || auth !== `Bearer ${env.WORKER_SECRET}`) {
      return json({ ok: false, error: "Unauthorized" }, 401, request);
    }

    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "";

    try {
      // ─── §AUTH ────────────────────────────────────────────
      if (action === "check_employee") {
        const username = url.searchParams.get("username");
        const result = await checkEmployee(env.DB, username);
        return json({ ok: true, ...result }, 200, request);
      }
      if (action === "register_pin") {
        if (request.method !== "POST") return badRequest("register_pin يجب أن يكون POST", request);
        const { username, pin } = await request.json();
        await registerPin(env.DB, username, pin);
        return json({ ok: true }, 200, request);
      }
      if (action === "verify_employee") {
        if (request.method !== "POST") return badRequest("verify_employee يجب أن يكون POST", request);
        const { username, pin } = await request.json();
        const displayName = await verifyEmployee(env.DB, username, pin);
        if (!displayName) return json({ ok: false, error: "PIN خطأ" }, 401, request);
        // الدخول نجح فعلاً — فشل الكتابة في D1 يرجع logged:false، مش 500 يمنع الدخول
        let logged = true;
        try {
          await writeLog(env.DB, { tool: TOOL_NAME, type: "login", employee: username, notes: `دخول: ${displayName}` });
        } catch { logged = false; }
        return json({ ok: true, displayName, logged }, 200, request);
      }
      if (action === "log_logout") {
        const username = url.searchParams.get("username");
        let logged = true;
        try {
          await writeLog(env.DB, { tool: TOOL_NAME, type: "logout", employee: username, notes: `خروج: ${username?.replace(/_/g, " ") || ""}` });
        } catch { logged = false; }
        return json({ ok: true, logged }, 200, request);
      }
      // ⭐ get_employees — الواجهة بتملا بيه قائمة الدخول. غيابه = مفيش دخول خالص.
      // نسخة حرفية من ecommoda-worker-builder → references/auth-endpoints.md
      if (action === "get_employees") {
        const { results } = await env.DB.prepare(
          "SELECT username, display_name FROM employees WHERE is_active = 1 ORDER BY display_name"
        ).all();
        return json({ ok: true, employees: results }, 200, request);
      }
      // ──────────────────────────────────────────────────────

      // ─── §CANCEL ──────────────────────────────────────────
      if (action === "lookup_order") return await handleLookupOrder(request, env);
      if (action === "cancel_order") {
        if (request.method !== "POST") return badRequest("cancel_order يجب أن يكون POST", request);
        return await handleCancelOrder(request, env);
      }
      if (action === "diag") return await handleDiag(request, env);
      if (action === "get_config") return handleGetConfig(request);
      // ──────────────────────────────────────────────────────

      // ─── §LOG-ENDPOINTS ───────────────────────────────────
      if (action === "get_logs") return await handleGetLogs(request, env);
      // ──────────────────────────────────────────────────────

      return json({ ok: false, error: "Not found" }, 404, request);
    } catch (err) {
      return json({ ok: false, error: err.message }, 500, request);
    }
  },
};
