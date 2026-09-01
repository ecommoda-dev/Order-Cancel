// ══════════════════════════════════════════════════════
// EcomModa — Order Cancel Tool Worker
// TOOL_VERSION: v2.6.0  (كان v2.0.0 مسوّدة · المنشور على كلاودفلير كان v1.0.3)
// skills: worker-builder v1.1.0 · html-builder v3.0.0 · constants v1.4.1 ·
//         shopify-graphql-helper v1.0.0 · order-lifecycle v1.1.0 — 01-09-2026
//
// CHANGELOG v2.6.0:
//   🟡 [جديد] الأداة بقت بتكتب حالة الأوردر S1 (custom.manual_status) =
//       "Cancelled" مع كل إلغاء — أكشن جديد بطلب أحمد 01-09-2026.
//       النوع متأكَّد من التعريف الحي (single_line_text_field) و"Cancelled"
//       موجودة حرفيًا في الـ choices. الانتقال بيتفحص الأول
//       (order-lifecycle قاعدة 10) وبيترفض ويتسجّل لو غير شرعي — مايتكتبش
//       في السكوت. الميوتيشن بتعدّي التلات فحوصات (Step 5A ②).
//       ⚠️ بتتكتب **بعد التأكيد بس**: لو الإلغاء لسه مش مؤكَّد ما بنكتبش
//       الحالة — "S1 = Cancelled" لازم توصف إلغاء حصل فعلاً. (الـ Flow
//       الحالي بيكتبها كمان بعد ~15 ثانية، فالحالة مش هتضيع.)
//   🟡 [جديد] صف D1 تاني مع كل تغيير حالة: tool = 'metafields_change' /
//       type = 'update' بالقيمة قبل وبعد (order-lifecycle قاعدة 9). السجل ده
//       هو المصدر الوحيد لأي KPI عن زمن الدورة أو عدد المحاولات.
//   🔴 [إصلاح] فشل الكتابة في D1 كان بيتحوّل لـ "فشل الإلغاء" (500) والأوردر
//       اتلغى فعلاً — كذب على فعل لا رجعة فيه. دلوقتي في try/catch محلي
//       وبيرجّع logged:false + logError زي ما Step 5A ⑦ بيفرض.
//   🟡 [جديد] actions[] بتتملي أول بأول وبترجع في الرد وفي extra — الواجهة
//       بتعرض "ما تم فعليًا" منها (html-builder Step 3C). وبترجع كمان في حالة
//       الفشل، عشان يبان اللي تم قبل ما يقع.
//   ⚪ [جديد] الرد بيشيل status ("success" | "warning" | "error") صراحةً بدل
//       ما الواجهة تشتقه.
//
// CHANGELOG v2.5.0:
//   🟡 [جديد] get_logs_count و get_logs_export — التلاتة اللي معيار الـ Log Tab
//       بيفرضهم بقوا موجودين. get_logs اتحدّث للنسخة القياسية: استبعاد
//       login/logout في SQL (كان مش موجود خالص) وسقف 100 صف للصفحة بدل 500.
//   🟡 [جديد] فلاتر السجل بقت بتاخد قوايم: employees / types + dateFrom/dateTo —
//       امتداد مقصود على النسخة القياسية عشان الفلاتر multi-select اللي
//       data-table-standard بيفرضها. من غير الامتداد ده الفلترة كانت هتبقى
//       client-side على الصفحة الحالية، وعدّاد "النتائج" والترقيم يكدبوا.
//   ⚪ [جديد] extra.result في صفوف D1 ("success" | "warning" | "error") — عمود
//       "النتيجة" في تاب السجل بيقراه (html-builder Step 3C). الصفوف الأقدم
//       من النسخة دي مالهاش الحقل، والواجهة بتعرضها "—" مش "✓".
//
// CHANGELOG v2.4.0:
//   🔴 [إصلاح] "لسه قيد التأكيد" كانت بتظهر على إلغاء ناجح ١٠٠% تقريبًا في كل
//       مرة. التحقق البعدي كان موجود من v2.0.0 بس **من غير أي انتظار**: بيقرا
//       الأوردر تاني بعد أجزاء من الثانية من الميوتيشن، و orderCancel ميوتيشن
//       غير متزامنة (بترجّع Job وشوبيفاي بتنفّذ بعدين) — فـ cancelledAt يبقى
//       لسه null والأداة تقول "مش مؤكَّد" وهي مش عارفة.
//       دلوقتي waitForCancelConfirmation بتستنى الـ Job نفسه (job(id){done})
//       بـ backoff متصاعد 400→2200ms (≈٦ ثوانٍ بحد أقصى) وبتوقف أول ما
//       cancelledAt يتأكد — مفيش نوم ثابت غير مشروط.
//       ⚠️ الحالة الصفراء لسه ليها معنى: لو عدّت الـ٦ ثوانٍ من غير تأكيد،
//       دي "ما قدرناش نتأكد" مش "تم" ومش "فشل" — والواجهة بتدي زرار تحقق يدوي.
//   ⚪ [جديد] رد cancel_order بيشيل verify { jobDone, attempts, waitedMs }
//       وبيتسجّل في extra في D1 — عشان لو الحالة الصفراء رجعت نبقى عارفين
//       استنينا قد إيه وإن كان الـ Job خلص ولا لأ.
//
// CHANGELOG v2.3.0:
//   🔴 [إصلاح] البحث برقم الأوردر الطويل (Order ID زي 7186861523266) كان
//       بيرجّع "لم يتم العثور على الأوردر". parseOrderInput كانت بتعتبر أي رقم
//       مجرّد **اسم أوردر** وتدوّر بـ name:#7186861523266 — والرابط الكامل بس
//       هو اللي كان بيشتغل لأن الـ regex بتاعه بيستخرج الـ ID صراحةً. دلوقتي
//       الدالة بترجّع **قايمة محاولات مرتّبة** (ID الأول لو الرقم ≥ 10 خانات،
//       الاسم الأول لو أقصر) والـ handler بيجرّبهم بالترتيب.
//   🔴 [جديد] شرط رابع للإلغاء: displayFulfillmentStatus لازم UNFULFILLED.
//       قبل كده الأداة كانت بتقرا الحقل ومش بتستخدمه خالص، فأوردر متشحن
//       (Ready + Fulfilled — وضع شرعي حسب order-lifecycle قاعدة 5) كان ينفع
//       يتلغي منها، والنتيجة بتتصنّف RTO في كل تقارير الستاك مش إلغاء
//       (order-lifecycle قاعدة 2). الشرط بيتفحص في lookup_order وتاني في
//       cancel_order قبل التنفيذ.
//   🟡 [جديد] إقرار إبلاغ الشحن/المخزن (warehouseNotified) إلزامي لما
//       manual_status = Confirmed أو Ready. الواجهة بتعرضه كـ checkbox في نافذة
//       التأكيد وبتقفل زرار التنفيذ من غيره، والـ Worker بيرفض الطلب لو الإقرار
//       ناقص (دفاع تاني، نفس منطق إعادة فحص manual_status). القيمة بتتسجّل في
//       extra في D1 مع fulfillmentStatusBefore.
//   ⚪ [جديد] financialStatusAr / fulfillmentStatusAr — ترجمة الحالات للعربي
//       عشان الواجهة تعرضها في الـ chips من غير ما تخترع قاموس تاني.
//   ⚪ [جديد] lookup_order بيرجّع matchedBy ("id" | "name").
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
const WORKER_VERSION = "2.6.0";
const API_VERSION = "2026-01";

const ALLOWED_ORIGINS = [
  "https://ecommoda-dev.github.io",
];

const ALLOWED_MANUAL_STATUS = new Set(["New Order", "Confirmed", "Ready"]);
const ALLOWED_FINANCIAL_STATUS = new Set(["PENDING"]);

// شرط رابع — الأوردر لازم يكون لسه ما اتشحنش.
// السبب مش شكلي: ecommoda-order-lifecycle قاعدة 2 بتقول إن
//   cancelledAt ≠ null + displayFulfillmentStatus = UNFULFILLED → CANCELLED
//   cancelledAt ≠ null + displayFulfillmentStatus = FULFILLED   → RTO
// يعني إلغاء أوردر متشحن بيتحوّل في كل تقارير الستاك لـ RTO مش إلغاء، وده رقم
// تاني تمامًا (بضاعة اتحركت وراجعة، مش أوردر مات في المخزن). وقاعدة 5 بتقول إن
// Ready + Fulfilled وضع شرعي (محاولة تسليم مُعادة) — يعني manual_status لوحده
// مش كافي يمنع الحالة دي. الشرط ده هو اللي بيمنعها.
const ALLOWED_FULFILLMENT_STATUS = new Set(["UNFULFILLED"]);

// الحالات اللي الأوردر فيها بيبقى اتأكد أو اتجهّز في المخزن — الإلغاء فيها لازم
// يكون مسبوق بإبلاغ مسئول الشحن/المخزن. New Order لسه ما وصلش لحد.
const WAREHOUSE_ACK_STATUSES = new Set(["Confirmed", "Ready"]);

// الحالات المسموحة بالعربي — الواجهة بتعرضها في الـ chips وفي أسباب الرفض
const FINANCIAL_STATUS_AR = {
  PENDING:             "غير مدفوع",
  AUTHORIZED:          "محجوز",
  PARTIALLY_PAID:      "مدفوع جزئيًا",
  PAID:                "مدفوع",
  PARTIALLY_REFUNDED:  "مسترجع جزئيًا",
  REFUNDED:            "مسترجع بالكامل",
  VOIDED:              "ملغي",
  EXPIRED:             "منتهي",
};

const FULFILLMENT_STATUS_AR = {
  UNFULFILLED:         "لم يتم الشحن",
  PARTIALLY_FULFILLED: "تم شحن جزء منه",
  FULFILLED:           "تم الشحن",
  RESTOCKED:           "رجع للمخزن",
  ON_HOLD:             "موقوف مؤقتًا",
  SCHEDULED:           "مجدول للشحن",
  IN_PROGRESS:         "جارٍ التجهيز للشحن",
  OPEN:                "مفتوح",
  PENDING_FULFILLMENT: "في انتظار الشحن",
};

// كل الإلغاءات بتترفع لشوبيفاي بسبب واحد ثابت: OTHER.
// قرار أحمد 01-09-2026 — جدول التصنيف (REASON_ENUM_MAP) اتشال بالكامل.
// السبب التجاري الحقيقي بيتكتب كامل بالعربي في custom.cancel_manual_reason
// وفي سجل D1، وهما مصدر أي تحليل لأسباب الإلغاء — مش تقارير شوبيفاي.
const SHOPIFY_CANCEL_REASON = "OTHER";

// ── حالة الأوردر S1 (custom.manual_status) ──
// النوع متأكَّد من التعريف الحي على شوبيفاي 01-09-2026: single_line_text_field،
// و"Cancelled" موجودة حرفيًا في قائمة الـ choices. metafieldsSet بترفض الكتابة
// كلها لو الـ type مش مطابق بالحرف.
const S1_METAFIELD = { namespace: "custom", key: "manual_status", type: "single_line_text_field" };
const S1_CANCELLED = "Cancelled";

// ecommoda-order-lifecycle قاعدة 10: أي Worker بيكتب manual_status لازم يتحقق
// من شرعية الانتقال الأول ويرفض ويسجّل القفزات غير الشرعية — مايكتبش في السكوت.
// المصدر: references/state-machines.md §جدول الانتقالات (الحالات اللي منها
// الانتقال لـ Cancelled شرعي).
const CAN_TRANSITION_TO_CANCELLED = new Set([
  "New Order", "WhatsApp-Confirmed", "WhatsApp-CANCELLED",
  "Confirmed", "Confirmed + Edit", "Pending Edit", "Ready",
]);

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

/**
 * Fetch logs from D1 with server-side filtering + pagination.
 * login/logout excluded server-side via SQL — NOT client-side. Max 100/page.
 * ⚠️ Do NOT use for XLSX export — use getLogsExport().
 *
 * ⚠️ امتداد مقصود على النسخة القياسية في ecommoda-worker-builder →
 * references/shared-functions.md: الباراميترز `employees` (قايمة) و`types`
 * (قايمة) و`dateFrom`/`dateTo` **إضافية واختيارية**، والسلوك من غيرها مطابق
 * حرفيًا للنسخة القياسية. السبب: معيار data-table-standard بيفرض إن كل فلاتر
 * أي جدول تبقى multi-select، والنسخة القياسية بتاخد `employee` واحد بس —
 * فالفلترة كانت هتضطر تبقى client-side على الصفحة الحالية، وده بيخلي عدّاد
 * "النتائج" وترقيم الصفحات يكدبوا. الامتداد ده مرشّح يترفع للمهارة نفسها.
 */
function buildLogFilterSQL({ tool, employees, types, search, dateFrom, dateTo }) {
  let sql = "SELECT_PLACEHOLDER FROM logs WHERE type NOT IN ('login','logout')";
  const b = [];
  if (tool) { sql += " AND tool = ?"; b.push(tool); }
  if (Array.isArray(employees) && employees.length) {
    sql += ` AND employee IN (${employees.map(() => "?").join(",")})`;
    b.push(...employees);
  }
  if (Array.isArray(types) && types.length) {
    sql += ` AND type IN (${types.map(() => "?").join(",")})`;
    b.push(...types);
  }
  if (search) {
    sql += " AND (order_name LIKE ? OR notes LIKE ?)";
    b.push(`%${search}%`, `%${search}%`);
  }
  // التاريخ نص ISO في العمود — المقارنة بأول 10 حروف (YYYY-MM-DD).
  // ⚠️ الحدود بتوقيت UTC زي ما هي مخزّنة، والعرض بتوقيت القاهرة (UTC+3) —
  // فرق ٣ ساعات ممكن يخلي عملية بعد ٩ مساءً بتوقيت القاهرة تقع في يوم UTC
  // اللي بعده. مقبول لفلتر بالأيام، ومكتوب هنا عشان مايتكتشفش كباج بعدين.
  if (dateFrom) { sql += " AND substr(timestamp, 1, 10) >= ?"; b.push(dateFrom); }
  if (dateTo)   { sql += " AND substr(timestamp, 1, 10) <= ?"; b.push(dateTo); }
  return { sql, b };
}

async function getLogs(db, { tool = null, employees = null, types = null, search = null,
                             dateFrom = null, dateTo = null, limit = 100, offset = 0 } = {}) {
  const { sql, b } = buildLogFilterSQL({ tool, employees, types, search, dateFrom, dateTo });
  const q = sql.replace("SELECT_PLACEHOLDER", "SELECT *") + " ORDER BY timestamp DESC LIMIT ? OFFSET ?";
  b.push(Math.min(Number(limit) || 100, 100), Math.max(Number(offset) || 0, 0));
  return (await db.prepare(q).bind(...b).all()).results;
}

/** عدد الصفوف المطابقة للفلتر — للترقيم. نفس الفلاتر بالظبط، من غير data. */
async function getLogsCount(db, { tool = null, employees = null, types = null, search = null,
                                  dateFrom = null, dateTo = null } = {}) {
  const { sql, b } = buildLogFilterSQL({ tool, employees, types, search, dateFrom, dateTo });
  const row = await db.prepare(sql.replace("SELECT_PLACEHOLDER", "SELECT COUNT(*) as total")).bind(...b).first();
  return row?.total ?? 0;
}

/** كل الصفوف المطابقة للتصدير — لحد 2000 صف. ممنوع استخدام getLogs للتصدير. */
async function getLogsExport(db, { tool = null, employees = null, types = null, search = null,
                                   dateFrom = null, dateTo = null } = {}) {
  const { sql, b } = buildLogFilterSQL({ tool, employees, types, search, dateFrom, dateTo });
  const q = sql.replace("SELECT_PLACEHOLDER", "SELECT *") + " ORDER BY timestamp DESC LIMIT 2000";
  return (await db.prepare(q).bind(...b).all()).results;
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
// بيرجّع **قايمة محاولات مرتّبة** — مش محاولة واحدة.
// السبب: "53032" و"7186861523266" الاتنين أرقام مجرّدة، بس الأول اسم أوردر
// والتاني Order ID. الفارق الوحيد المتاح قبل ما نسأل شوبيفاي هو الطول، فبنرتّب
// المحاولات بالأرجح وبنجرّب التانية لو الأولى ما لقتش — مفيش تخمين صامت ومفيش
// إدخال صحيح بيرجع "لم يتم العثور على الأوردر".
//   بيقبل: 12345 · #12345 · 7186861523266 · رابط أدمن كامل (…/orders/7186861523266)
const ORDER_ID_MIN_DIGITS = 10;   // أسماء الأوردرات هنا 5 أرقام · الـ IDs 13

function parseOrderInput(raw) {
  const val = String(raw || "").trim();
  if (!val) return null;

  // رابط أدمن — الرقم اللي بعد /orders/ هو الـ ID دايمًا، مفيش لبس
  const urlMatch = val.match(/\/orders\/(#?\d+)/i);
  if (urlMatch) {
    return { input: val, candidates: [{ type: "id", value: urlMatch[1].replace(/^#/, "") }] };
  }
  if (/^https?:\/\//i.test(val)) return null; // رابط مش متعرّف عليه

  const cleaned = val.replace(/\s+/g, "");

  // الـ # تصريح صريح إن ده اسم أوردر — مش محتاج تخمين
  if (cleaned.startsWith("#")) {
    return { input: val, candidates: [{ type: "name", value: normalizeOrderName(cleaned) }] };
  }

  if (/^\d+$/.test(cleaned)) {
    const asId   = { type: "id",   value: cleaned };
    const asName = { type: "name", value: normalizeOrderName(cleaned) };
    return {
      input: val,
      candidates: cleaned.length >= ORDER_ID_MIN_DIGITS ? [asId, asName] : [asName, asId],
    };
  }

  return { input: val, candidates: [{ type: "name", value: normalizeOrderName(cleaned) }] };
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
    canCancelByFulfillmentStatus: ALLOWED_FULFILLMENT_STATUS.has(order.displayFulfillmentStatus),
    financialStatusAr: FINANCIAL_STATUS_AR[order.displayFinancialStatus] || "",
    fulfillmentStatusAr: FULFILLMENT_STATUS_AR[order.displayFulfillmentStatus] || "",
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

// ─── §CANCEL::writeManualStatusCancelled ───
// بتكتب custom.manual_status = "Cancelled" بعد ما الإلغاء يتأكد.
// بتتحقق من شرعية الانتقال الأول (قاعدة 10)، وبتعدّي التلات فحوصات بتاعة أي
// ميوتيشن (worker-builder Step 5A ②): خطأ علوي → userErrors → تأكيد الـ payload.
async function writeManualStatusCancelled(env, token, orderId, statusBefore) {
  if (statusBefore === S1_CANCELLED) {
    return { skipped: true, reason: "الحالة كانت Cancelled بالفعل", statusBefore };
  }
  if (!CAN_TRANSITION_TO_CANCELLED.has(statusBefore)) {
    // مايتكتبش في السكوت — يترفض ويترجع بسبب واضح يتسجّل في D1
    return { skipped: true, reason: `انتقال غير شرعي: "${statusBefore || "فارغ"}" → "${S1_CANCELLED}"`, statusBefore };
  }

  const mutation = `mutation SetManualStatus($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id namespace key value type updatedAt }
      userErrors { field message code }
    }
  }`;
  const variables = {
    metafields: [{
      ownerId: orderId,
      namespace: S1_METAFIELD.namespace,
      key: S1_METAFIELD.key,
      type: S1_METAFIELD.type,
      value: S1_CANCELLED,
    }],
  };

  const data = await shopifyGQL(env, token, mutation, variables, "setManualStatus");
  const payload = data?.data?.metafieldsSet;
  const errs = payload?.userErrors || [];
  if (errs.length) {
    throw new Error("setManualStatus: " + errs.map(e => `${e.code ? e.code + ": " : ""}${e.message}`).join(" | "));
  }
  const written = payload?.metafields?.[0];
  // الفحص التالت — userErrors فاضية معناها "مفيش اعتراض" مش "اتنفّذت"
  if (!written?.id || written.value !== S1_CANCELLED) {
    throw new Error("setManualStatus: شوبيفاي ما أكّدتش كتابة الحالة");
  }
  return { skipped: false, statusBefore, statusAfter: S1_CANCELLED, metafield: written };
}

// ─── §CANCEL::waitForCancelConfirmation ───
// orderCancel ميوتيشن **غير متزامنة**: شوبيفاي بترجّع Job وبتنفّذ الإلغاء بعدين.
// النسخة القديمة كانت بتقرا الأوردر تاني **فورًا** (بعد أجزاء من الثانية) —
// فـ cancelledAt يبقى لسه null دايمًا تقريبًا والأداة تقول "لسه قيد التأكيد"
// على إلغاء ناجح ١٠٠%. التحقق كان موجود بس من غير صبر.
//
// الحل: نستنى الـ Job يخلص فعلاً بـ backoff متصاعد، وبعدين نقرا الأوردر.
// مفيش نوم ثابت غير مشروط — الحلقة بتقف أول ما cancelledAt يتأكد.
const CANCEL_VERIFY_DELAYS_MS = [400, 700, 1100, 1600, 2200];   // ≈ 6 ثوانٍ بحد أقصى

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// بترجّع true/false، أو null لو معرفناش (فشل الاستعلام نفسه) — والفرق مهم:
// null معناها "كمّل واقرا الأوردر"، مش "الـ job لسه شغال".
async function isJobDone(env, token, jobId) {
  try {
    const data = await shopifyGQL(
      env, token,
      `query JobStatus($id: ID!) { job(id: $id) { id done } }`,
      { id: jobId }, "jobStatus"
    );
    const done = data?.data?.job?.done;
    return typeof done === "boolean" ? done : null;
  } catch (e) {
    return null;
  }
}

async function waitForCancelConfirmation(env, token, orderId, jobId) {
  let jobDone = null, waitedMs = 0, attempts = 0, order = null;

  for (const delay of CANCEL_VERIFY_DELAYS_MS) {
    await sleep(delay);
    waitedMs += delay;
    attempts++;

    // لسه الـ job شغال؟ ماتضيّعش نداء على قراءة الأوردر
    if (jobId && jobDone !== true) {
      jobDone = await isJobDone(env, token, jobId);
      if (jobDone === false) continue;
    }

    order = await getOrderById(env, token, orderId);
    if (order?.cancelledAt) {
      return { confirmed: true, jobDone: true, attempts, waitedMs, order };
    }
  }

  return { confirmed: false, jobDone, attempts, waitedMs, order };
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

  // بنجرّب المحاولات بالترتيب — أول واحدة بترجّع أوردر هي اللي بتتعرض.
  // ما بنوقفش عند أول فشل: "7186861523266" ممكن يكون ID، و"53032" ممكن يكون اسم،
  // والاتنين أرقام مجرّدة شكلًا.
  let order = null, matchedBy = null;
  for (const cand of parsed.candidates) {
    order = cand.type === "id"
      ? await getOrderById(env, token, `gid://shopify/Order/${cand.value}`)
      : await findOrderByName(env, token, cand.value);
    if (order) { matchedBy = cand.type; break; }
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
    matchedBy, // "id" | "name" — إزاي الأداة لقت الأوردر من اللي المستخدم كتبه
    allowedManualStatuses: Array.from(ALLOWED_MANUAL_STATUS),
    allowedFinancialStatuses: Array.from(ALLOWED_FINANCIAL_STATUS),
    allowedFulfillmentStatuses: Array.from(ALLOWED_FULFILLMENT_STATUS),
    cancelReasons, // array of strings — مش object زي القديم
  }, 200, request);
}

// ─── §CANCEL::handleCancelOrder ───
async function handleCancelOrder(request, env) {
  const body = await request.json().catch(() => null);
  if (!body) return badRequest("Body غير صالح", request);

  const { orderId, reasonLabel, restock = true, notifyCustomer = false, employee,
          warehouseNotified = false } = body;

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
  if (!ALLOWED_FULFILLMENT_STATUS.has(orderBefore.displayFulfillmentStatus)) {
    return badRequest(
      `غير مسموح بإلغاء الأوردر لأن حالة الشحن = "${orderBefore.displayFulfillmentStatus || "فارغ"}". ` +
      `المسموح فقط: UNFULFILLED — الأوردر اللي اتشحن فعلاً إلغاؤه بيتسجّل RTO مش إلغاء ` +
      `(ecommoda-order-lifecycle قاعدة 2)`,
      request
    );
  }
  // Confirmed / Ready = الأوردر اتأكد أو اتجهّز في المخزن فعلاً. الإلغاء من غير
  // إبلاغ مسئول الشحن/المخزن بيسيب قطعة متجهّزة تتشحن بعد الإلغاء. الواجهة بتمنعها
  // بـ checkbox، والفحص ده هو الدفاع التاني — نفس منطق فحص manual_status فوق.
  if (WAREHOUSE_ACK_STATUSES.has(orderBefore.manualStatus) && !warehouseNotified) {
    return badRequest(
      `الأوردر في حالة "${orderBefore.manualStatus}" — لازم تأكيد إبلاغ مسئول الشحن/المخزن قبل الإلغاء`,
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

  let job = null, metafield = null, confirmed = false, verify = null, s1 = null;
  // ⚠️ المصفوفة دي بتتملي **أول بأول** مش في الآخر (worker-builder Step 5A ⑤):
  // مسار الإلغاء لا رجعة فيه، فأوردر اتلغى وفشلت كتابة حالته لازم يبان في
  // السجل إنه اتلغى فعلاً — مش "ما حصلش حاجة".
  const actions = [];

  try {
    job = await cancelOrderInShopify(env, token, { orderId, notifyCustomer, restock, shopifyReason, staffNote });
    actions.push(restock ? "إلغاء الأوردر على شوبيفاي + استرجاع المخزون" : "إلغاء الأوردر على شوبيفاي");

    metafield = await writeCancelReasonMetafield(env, token, orderId, reasonLabel);
    actions.push(`كتابة سبب الإلغاء: ${reasonLabel}`);

    // تحقق فعلي بعد التنفيذ — بانتظار الـ Job، مش قراءة فورية
    verify = await waitForCancelConfirmation(env, token, orderId, job?.id);
    confirmed = verify.confirmed;
    if (confirmed) actions.push("تأكيد الإلغاء من شوبيفاي (cancelledAt)");

    // ── حالة الأوردر S1 → Cancelled ──
    // بتتكتب **بعد التأكيد بس**: "S1 = Cancelled" لازم توصف إلغاء حصل فعلاً،
    // ولو كتبناها على إلغاء لسه مش مؤكَّد ممكن نوسم أوردر لسه حي.
    if (confirmed) {
      try {
        s1 = await writeManualStatusCancelled(env, token, orderId, orderBefore.manualStatus);
        actions.push(s1.skipped
          ? `حالة الأوردر S1 ما اتغيّرتش — ${s1.reason}`
          : `تحديث حالة الأوردر S1: "${s1.statusBefore || "فارغ"}" → "${S1_CANCELLED}"`);
      } catch (e) {
        // فشل كتابة الحالة **مايلغيش** إن الأوردر اتلغى فعلاً — يتسجّل ويتعرض
        s1 = { failed: true, error: e.message, statusBefore: orderBefore.manualStatus };
        actions.push(`⚠️ فشل تحديث حالة الأوردر S1 — ${e.message}`);
      }
    } else {
      s1 = { skipped: true, reason: "الإلغاء لسه مش مؤكَّد من شوبيفاي", statusBefore: orderBefore.manualStatus };
      actions.push("حالة الأوردر S1 ما اتغيّرتش — الإلغاء لسه مش مؤكَّد");
    }

    const status = confirmed ? (s1?.failed ? "warning" : "success") : "warning";

    // ⚠️ فشل D1 مايتحوّلش لفشل العملية (Step 5A ⑦) — الأوردر اتلغى فعلاً،
    // فبنرجّع logged:false عشان الواجهة تحذّر بدل ما نقول "فشل الإلغاء" كذبًا.
    let logged = true, logError = null;
    try {
      await writeLog(env.DB, {
        tool: TOOL_NAME, type: "cancel", employee,
        orderId: orderBefore.numericId, orderName: orderBefore.name,
        notes: `تم إلغاء الأوردر — السبب: ${reasonLabel}${confirmed ? "" : " (لسه مش مؤكَّد من شوبيفاي)"}`,
        extra: {
          orderGid: orderId, manualStatusBefore: orderBefore.manualStatus,
          reasonLabel, shopifyReason, restock: !!restock, notifyCustomer: !!notifyCustomer,
          warehouseNotified: !!warehouseNotified,
          fulfillmentStatusBefore: orderBefore.displayFulfillmentStatus,
          job, metafield, confirmed, s1, actions,
          result: status,   // Step 3C — عمود النتيجة في تاب السجل
          verify: verify && { jobDone: verify.jobDone, attempts: verify.attempts, waitedMs: verify.waitedMs },
        },
      });

      // ecommoda-order-lifecycle قاعدة 9 + Step 5B قاعدة 3: كل تغيير حالة
      // يتسجّل تحت tool = 'metafields_change' / type = 'update' بالقيمة قبل وبعد.
      // السجل ده هو **المصدر الوحيد** لأي KPI عن زمن الدورة أو عدد المحاولات —
      // كتابة ناقصة = فجوة دائمة في الأرقام دي.
      if (s1 && !s1.skipped && !s1.failed) {
        await writeLog(env.DB, {
          tool: "metafields_change", type: "update", employee,
          orderId: orderBefore.numericId, orderName: orderBefore.name,
          valueBefore: s1.statusBefore || null, valueAfter: S1_CANCELLED,
          notes: `custom.manual_status: "${s1.statusBefore || "فارغ"}" → "${S1_CANCELLED}" (من أداة إلغاء الأوردرات)`,
          extra: { orderGid: orderId, source: TOOL_NAME, reasonLabel, metafield: s1.metafield },
        });
      }
    } catch (e) {
      logged = false; logError = e.message;
    }

    return json({
      ok: true,
      status,
      confirmed, logged, logError, actions,
      message: confirmed
        ? `تم إلغاء الأوردر ${orderBefore.name} وتأكيده`
        : `تم إرسال طلب إلغاء الأوردر ${orderBefore.name} — شوبيفاي ما أكّدتش الإلغاء خلال ` +
          `${Math.round((verify?.waitedMs || 0) / 1000)} ثوانٍ. الإلغاء غالبًا هيكمل لوحده — اضغط "تحقق الآن"`,
      order: orderBefore, job, metafield, s1,
      verify: verify && { jobDone: verify.jobDone, attempts: verify.attempts, waitedMs: verify.waitedMs },
    }, 200, request);

  } catch (err) {
    await writeLog(env.DB, {
      tool: TOOL_NAME, type: "cancel_failed", employee,
      orderId: orderBefore.numericId, orderName: orderBefore.name,
      notes: `فشل إلغاء الأوردر — ${err.message}`,
      extra: {
        orderGid: orderId, manualStatusBefore: orderBefore.manualStatus,
        reasonLabel, shopifyReason, restock: !!restock, notifyCustomer: !!notifyCustomer,
        warehouseNotified: !!warehouseNotified,
        fulfillmentStatusBefore: orderBefore.displayFulfillmentStatus,
        result: "error",   // Step 3C
        actions,           // اللي تم فعلاً قبل الفشل — مش قايمة فاضية
        error: err.message,
      },
    }).catch(() => {});
    return json({ ok: false, status: "error", actions, error: err.message }, 500, request);
  }
}

// ─── §LOG-ENDPOINTS::logParams ───
function logParamsFrom(url) {
  const list = k => (url.searchParams.get(k) || "").split(",").map(v => v.trim()).filter(Boolean);
  return {
    tool: TOOL_NAME,
    employees: list("employees"),
    types: list("types"),
    search: url.searchParams.get("search") || null,
    dateFrom: url.searchParams.get("dateFrom") || null,
    dateTo: url.searchParams.get("dateTo") || null,
  };
}

async function handleGetLogs(request, env) {
  const url = new URL(request.url);
  const entries = await getLogs(env.DB, {
    ...logParamsFrom(url),
    limit: Number(url.searchParams.get("limit") || 100),
    offset: Number(url.searchParams.get("offset") || 0),
  });
  return json({ ok: true, entries }, 200, request);
}

async function handleGetLogsCount(request, env) {
  const url = new URL(request.url);
  const total = await getLogsCount(env.DB, logParamsFrom(url));
  return json({ ok: true, total }, 200, request);
}

async function handleGetLogsExport(request, env) {
  const url = new URL(request.url);
  const entries = await getLogsExport(env.DB, logParamsFrom(url));
  return json({ ok: true, entries }, 200, request);
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
    allowedFulfillmentStatuses: Array.from(ALLOWED_FULFILLMENT_STATUS),
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
      if (action === "get_logs_count") return await handleGetLogsCount(request, env);
      if (action === "get_logs_export") return await handleGetLogsExport(request, env);
      // ──────────────────────────────────────────────────────

      return json({ ok: false, error: "Not found" }, 404, request);
    } catch (err) {
      return json({ ok: false, error: err.message }, 500, request);
    }
  },
};
