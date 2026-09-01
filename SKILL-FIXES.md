<div dir="rtl" style="text-align: right;">

# إصلاحات مطلوبة في المهارات — مستخرَجة من `Order-Cancel`

![version](https://img.shields.io/badge/version-v1.1.0-blue)

الملف ده **مدخلات لجلسة تعديل مهارات**، مش توثيق للأداة. كل بند هنا طلع من
شغل فعلي على `Order-Cancel` يوم 01-09-2026، ومعاه **دليل مقاس** مش رأي.

> **الحالة:** ده البند الوحيد المفتوح على `Order-Cancel` (01-09-2026) — كل
> باقي المسائل اتقفلت. البندان ٣ و٤ كانوا مسجّلين في `CLAUDE.md` لوحدهم
> واتنقلوا هنا عشان مايتكرروش في مكانين.
>
> ⚠️ **اقرا `ecommoda-skill-versioning` قبل ما تنفّذ أي بند.** كل تعديل لازم
> يطلع بـ bump في `SKILL.md` + بند مصنَّف في `references/CHANGELOG.md` بتاع
> المهارة. تسليم من غير الاتنين = تسليم ناقص.

**التصنيفات المقترحة هنا اجتهاد** — قاعدة الحسم من المهارة نفسها:
*لو أداة قديمة فضلت زي ما هي، هي دلوقتي بتعمل حاجة **غلط** ولا بس **مش
بتستفيد**؟* غلط = MAJOR/🔴 · مش بتستفيد = MINOR/🟡 · صفر أثر = PATCH/⚪.

---

## ملخّص

| # | المهارة | البند | المستوى | التصنيف |
|---|---|---|---|---|
| ١ | `ecommoda-worker-builder` | التحقق بعد ميوتيشن غير متزامنة لازم **يستنى**، مش يقرا فورًا | MAJOR | 🔴 كاسر |
| ٢ | `ecommoda-html-builder` | تصدير الـ Log Tab بيتقص عند السقف **في السكوت** | MAJOR | 🔴 كاسر |
| ٣ | `ecommoda-worker-builder` | دوال السجل تقبل **قوايم** فلاتر (تعارض مع معيار الجداول) | MINOR | 🟡 مُستحسن |
| ٤ | `ecommoda-constants` | `cancel_failed` ناقصة من صف `order_cancel` في §7 | PATCH | ⚪ تحريري |
| ٥ | `ecommoda-constants` | `metafields_change` بقى ليه كاتب تاني | PATCH | ⚪ تحريري |
| ٦ | `ecommoda-order-lifecycle` | `PARTIALLY_FULFILLED` بيتصنّف `CANCELLED` نضيف — **اقتراح فجوة** | MINOR | 🟡 (لو اتقبل) |

---

## ١. 🔴 `ecommoda-worker-builder` — التحقق بعد ميوتيشن غير متزامنة لازم يستنى

**المكان:** Step 5A ③ · `references/anti-patterns.md`
**يخص:** أي Worker بينادي ميوتيشن بترجّع `job` — `orderCancel` أوضح مثال.

### النص الحالي وإيه اللي ناقصه

Step 5A ③ بيقول:

> `orderCancel` بترجّع `job { id }` — الرد بيوصل قبل ما العملية تخلص. أي أداة
> بتقول "تم" لازم تعمل تحقق لاحق.

**"تحقق لاحق" مش كافية.** `Order-Cancel` **كانت مطبّقة البند ده حرفيًا** من
v2.0.0: بتعيد قراءة الأوردر وتتأكد من `cancelledAt` قبل ما تقول "تم". ومع ذلك
كانت غلط — لأنها بتقرا **فورًا**، والـ Job لسه ما اشتغلش.

### الدليل المقاس (D1 + شوبيفاي، أوردر `#53033`)

```
07:51:25Z      الميتافيلد اتكتب → الميوتيشن اتقبلت فعلاً
07:51:26.084Z  الـ Worker قرا الأوردر، لقى cancelledAt = null، سجّل confirmed:false
07:51:27Z      شوبيفاي سجّلت cancelledAt
               ↑ التأكيد كان على بُعد ثانية واحدة من لحظة الاستسلام
```

### الأثر — وده الجزء المهم

مش إن التحذير بيظهر أحيانًا. **كل إلغاء ناجح كان بيظهر أصفر "لسه مش مؤكَّد"**،
لأن القراءة الفورية بتفشل دايمًا تقريبًا. يعني الحالة الاستثنائية بقت الحالة
الافتراضية — والموظف بيتعوّد يتجاهل الأصفر، فلما يحصل إلغاء **فعلًا** مش
مؤكَّد، مفيش إشارة.

> ده **نفس نمط** البند اللي `ecommoda-html-builder` v4.0.0 صنّفه 🔴: إشارة
> بتولّع غلط دايمًا = حماية وهمية، وأسوأ من مفيش حماية.

### التعديل المقترح

استبدل "تحقق لاحق" بنمط **انتظار بـ backoff متصاعد + فحص الـ Job نفسه**،
وبتوقف أول ما التأكيد يحصل — مفيش نوم ثابت غير مشروط:

```javascript
// §SHARED::waitForJobConfirmation — النمط المعتمد لأي ميوتيشن بترجّع Job
const VERIFY_DELAYS_MS = [400, 700, 1100, 1600, 2200];   // ≈6 ثوانٍ بحد أقصى

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// بترجّع true/false، أو null لو معرفناش (فشل الاستعلام نفسه) — والفرق مهم:
// null معناها "كمّل واقرا المورد"، مش "الـ Job لسه شغال".
async function isJobDone(env, token, jobId) {
  try {
    const data = await shopifyGQL(env, token,
      `query JobStatus($id: ID!) { job(id: $id) { id done } }`, { id: jobId }, 'jobStatus');
    const done = data?.data?.job?.done;
    return typeof done === 'boolean' ? done : null;
  } catch { return null; }
}

async function waitForJobConfirmation(env, token, jobId, readResource, isConfirmed) {
  let jobDone = null, waitedMs = 0, attempts = 0, resource = null;
  for (const delay of VERIFY_DELAYS_MS) {
    await sleep(delay); waitedMs += delay; attempts++;
    if (jobId && jobDone !== true) {
      jobDone = await isJobDone(env, token, jobId);
      if (jobDone === false) continue;          // لسه شغال — ماتضيّعش نداء
    }
    resource = await readResource();
    if (isConfirmed(resource)) return { confirmed: true, jobDone: true, attempts, waitedMs, resource };
  }
  return { confirmed: false, jobDone, attempts, waitedMs, resource };
}
```

**وقاعدة مصاحبة لازم تتكتب صراحةً:** انتهاء المهلة من غير تأكيد =
**"ما قدرناش نتأكد"** (`warning`)، مش "تم" ومش "فشل". ويترجع للواجهة
`{ jobDone, attempts, waitedMs }` عشان الحالة الصفرا تبقى قابلة للتشخيص بعدين
بدل ما تكون مجرد "مش عارفين".

### النطاق

أي Worker فيه قراءة تحقق **فورية** بعد ميوتيشن غير متزامنة. الفحص:

```bash
grep -n -A3 "orderCancel\|job { id" index.js | grep -n "await get\|await read"
# لو القراءة من غير أي sleep/انتظار بينها وبين الميوتيشن → البند ده ينطبق
```

---

## ٢. 🔴 `ecommoda-html-builder` — تصدير الـ Log Tab بيتقص في السكوت

**المكان:** Step 6 (Log Filter Model v2) · `templates/23_log-tab.html`
**يخص:** أي أداة فيها Log Tab بتصدير XLSX — يعني كل الأدوات المبنية على النموذج.

### المشكلة

المعيار بيحدد `get_logs_export` بسقف **2000 صف**، وده صح. اللي ناقص إن
المعيار **مابيفرضش** إن الواجهة تقول إن الملف اتقص.

النتيجة العملية في أي أداة سجلها بيعدّي 2000 صف: الموظف يفلتر، يضغط تصدير،
والأداة تقوله **"تم تصدير 2000 عملية ✓"** — علامة صح خضرا على **ملف ناقص**،
وهو فاكره كامل. لو الملف ده راح لتقرير أو مراجعة مالية، الفرق مابيبانش.

ده نفس عيلة الفشل اللي Step 3C كلها متكتبة عشانها: **نتيجة خضرا على فعل ما تمّش
بالكامل.**

### التعديل المقترح — جزءان

**(أ) الـ Worker يرجّع الحقيقة مع النتيجة** (يتكتب في
`ecommoda-worker-builder` → `references/shared-functions.md` كمان):

```javascript
const LOG_EXPORT_MAX = 2000;

if (action === 'get_logs_export') {
  const params = { tool: TOOL_NAME, /* ...الفلاتر */ };
  const [entries, total] = await Promise.all([
    getLogsExport(env.DB, params),
    getLogsCount(env.DB, params),      // العدّ الحقيقي جنب الصفوف
  ]);
  return json({ ok: true, entries, cap: LOG_EXPORT_MAX, total,
                truncated: total > LOG_EXPORT_MAX }, 200, request);
}
```

**(ب) الواجهة تحذّر ببانر ثابت — مش توست بيختفي:**

```javascript
const truncated = data.truncated === true || (data.cap && rows.length >= data.cap);
if (truncated) {
  warn.innerHTML = `⚠️ <b>التصدير اتقص</b> — الملف فيه ${rows.length.toLocaleString('en-US')} صف`
    + (data.total != null ? ` من أصل <b>${data.total.toLocaleString('en-US')}</b> مطابقين للفلاتر` : '')
    + `. ضيّق الفترة أو الفلاتر وصدّر على دفعات.`;
  warn.style.display = '';
  showToast(`⚠️ التصدير اتقص عند ${rows.length.toLocaleString('en-US')} صف — الملف مش كامل`, 'error', 7000);
} else {
  showToast(`تم تصدير ${rows.length.toLocaleString('en-US')} عملية ✓`, 'success');
}
```

**قواعد لازم تتكتب مع الكود:**

- التحذير **بانر ثابت فوق الجدول**، مش توست — التوست بيختفي والملف بيفضل ناقص.
- الرقمين (المصدَّر / الإجمالي) **يتقالوا صراحةً**، مش "الملف ممكن يكون ناقص".
- السقف **يرجع من الـ Worker** (`cap`) — ممنوع الواجهة تكتب `2000` عندها،
  وإلا يتغيّر في مكان ويفضل قديم في التاني.
- البانر **يتمسح مع أي تغيير في الفلاتر** — تحذير قديم على فلاتر جديدة تضليل.

### فحص آلي مقترح لـ Step 9

```bash
grep -c "truncated\|data.cap" "$FILE"     # لازم ≥1 لو فيه تصدير Log Tab
grep -n "تم تصدير" "$FILE"                # راجع: لازم تكون في فرع else مش دايمًا
```

---

## ٣. 🟡 `ecommoda-worker-builder` — دوال السجل تقبل قوايم فلاتر

**المكان:** `references/shared-functions.md` (`getLogs` · `getLogsCount` · `getLogsExport`) · Step 6
**يخص:** أي أداة فيها Log Tab مبني على `data-table-standard`.

### التعارض

| المهارة | القاعدة |
|---|---|
| `ecommoda-html-builder` → `data-table-standard.md` بند ٢١ | في أي شاشة فيها جدول، **كل** الفلاتر multi-select — ممنوع `<select>` قيمة واحدة **حتى لو القائمة ٣ عناصر** |
| `ecommoda-worker-builder` → `shared-functions.md` | `getLogs(db, { employee, ... })` — **موظف واحد** → `AND employee = ?` |

الواجهة مطلوب منها تسمح باختيار أكتر من موظف، والـ Worker مايعرفش يستقبل غير
واحد. **مفيش طريقة تنفّذ المعيارين الاتنين مع بعض** بالشكل الحالي.

### ليه الحل الظاهري (فلترة في المتصفح) غلط

الصفحة بتجيب ١٠٠ صف. لو الفلترة client-side:

- **"النتائج"** بتعدّ الصفحة بس مش القاعدة → **رقم كاذب على الشاشة**
- **الصفحة التانية** بتيجي من السيرفر **من غير فلترة**
- **التصدير** بينزّل غير المفلتر

وكل ده **من غير أي رسالة**. الأداة تبان شغالة وبتدي أرقام غلط — وده بالظبط
اللي Log Filter Model v2 اتكتب عشان يمنعه.

### التعديل المقترح — إضافة متوافقة رجوعيًا

باراميترز **اختيارية**؛ من غيرها السلوك مطابق للنسخة الحالية بالحرف:

```javascript
// بنّاء شرط واحد بتستخدمه التلات دوال — مفيش SQL مكرر
function buildLogFilterSQL({ tool, employees, types, search, dateFrom, dateTo }) {
  let sql = "SELECT_PLACEHOLDER FROM logs WHERE type NOT IN ('login','logout')";
  const b = [];
  if (tool) { sql += ' AND tool = ?'; b.push(tool); }
  if (Array.isArray(employees) && employees.length) {
    sql += ` AND employee IN (${employees.map(() => '?').join(',')})`; b.push(...employees);
  }
  if (Array.isArray(types) && types.length) {
    sql += ` AND type IN (${types.map(() => '?').join(',')})`; b.push(...types);
  }
  if (search) { sql += ' AND (order_name LIKE ? OR notes LIKE ?)'; b.push(`%${search}%`, `%${search}%`); }
  if (dateFrom) { sql += ' AND substr(timestamp, 1, 10) >= ?'; b.push(dateFrom); }
  if (dateTo)   { sql += ' AND substr(timestamp, 1, 10) <= ?'; b.push(dateTo); }
  return { sql, b };
}
```

والـ endpoints بتقرا القوايم من الـ query string (`employees=a,b` · `types=x,y`).

**قاعدة لازم تتكتب مع التعديل:** حدود `dateFrom`/`dateTo` بتتقارن بـ
`timestamp` المخزّن (**UTC**)، والعرض بتوقيت القاهرة (UTC+3) — فرق التلات
ساعات ممكن يحط عملية بعد ٩ مساءً بتوقيت القاهرة في يوم UTC اللي بعده. مقبول
لفلتر بالأيام، **بس لازم يتكتب** وإلا يتكتشف كباج بعدين.

### ليه ده مش تفصيلة شكلية

`§SHARED` مكتوب فوقه **"copy verbatim — never modify"**. طالما الامتداد عايش
في أداة واحدة بس، أي حد يفتح المهارة وينسخ الكتلة "زي ما القاعدة بتقول"
**هيشيل الفلاتر من غير ما يقصد** — مفيش error ولا build فاشل، تاب السجل يفضل
شغّال والفلاتر تتضرب في السكوت. فعل صحيح ظاهريًا بينتج عطل صامت.

**التنفيذ الحالي للمراجعة:** `Order-Cancel` → `index.js` v2.7.0،
`buildLogFilterSQL` + `logParamsFrom`.

---

## ٤. ⚪ `ecommoda-constants` — `cancel_failed` ناقصة من §7

**المكان:** §7، صف `Order Cancel`
**يخص:** لا شيء في الكود المنشور — الجدول هو اللي ناقص.

```diff
- | Order Cancel | `order_cancel` | `cancel` · `login` · `logout` |
+ | Order Cancel | `order_cancel` | `cancel` · `cancel_failed` · `login` · `logout` |
```

`cancel_failed` بتتكتب في D1 من **v1.0.3** (النسخة اللي كانت منشورة يدويًا على
كلاودفلير)، يعني دي مخالفة **قديمة** لقاعدة "التسجيل قبل أول `writeLog`" مش
مخالفة جديدة. متأكَّدة بـ `grep` على كل `writeLog(` في `index.js`.

> نفس شكل بند `constants` v1.4.1 (استكمال `type` لـ `employees_admin` من ٥ لـ ١٠)
> واللي اتصنّف ⚪ — الجدول كان ناقص، مش غلط.

---

## ٥. ⚪ `ecommoda-constants` — `metafields_change` بقى ليه كاتب تاني

**المكان:** §7، صف `Metafields Change Log` (ملحوظة تحت الجدول)
**يخص:** لا شيء في الكود المنشور — بس أي جرد مستقبلي هيغلط من غيرها.

من `Order-Cancel` v2.6.0، الأداة بتكتب صف تحت
`tool = 'metafields_change'` / `type = 'update'` مع كل تحديث لحالة S1 —
تنفيذًا لـ `ecommoda-order-lifecycle` قاعدة 9. القيمتين مسجّلتين بالفعل فمفيش
مخالفة، **بس** الجدول شكله بيوحي إن الكاتب الوحيد هو أداة الـ Metafields
Change Log. يتكتب سطر إن الأدوات التانية بتكتب فيه كمان، وإن الإسناد لأداة
معيّنة بيبقى من `extra.source`.

---

## ٦. 🟡 `ecommoda-order-lifecycle` — اقتراح فجوة: `PARTIALLY_FULFILLED`

> ⚠️ **ده اقتراح فجوة مش عطل متأكَّد.** المهارة Step 6 بتقول ترفع الفجوة لما
> المهمة تقع فيها فعلاً — وهي وقعت فينا وإحنا بنحدد حالات الشحن المسموح
> الإلغاء فيها. **القرار لأحمد**، والاقتراح ده مايتنفّذش من غير موافقته.

**المكان:** Step 4 (`classifyOrder`) · قاعدة 2 · `references/known-gaps.md`

### الملاحظة

```javascript
if (order.cancelledAt) {
  return order.displayFulfillmentStatus === 'FULFILLED' ? 'RTO' : 'CANCELLED';
}
```

الشرط بيسأل عن `FULFILLED` **بالظبط**، فأي حاجة تانية بتروح `CANCELLED`.
يعني أوردر **`PARTIALLY_FULFILLED`** اتلغى — جزء من البضاعة اتشحن فعلاً
وطالع برّه المخزن — بيتصنّف **`CANCELLED` نضيف**، وكأنه مات في المخزن.

الفرق التجاري حقيقي: البضاعة اللي اتحركت لازم ترجع، وده حدث زي الـ RTO
بالظبط (وقاعدة 6 بتقول RTO وresale-return حدثين ماليين مختلفين — فده تالت).

### ليه ده أخطر من `FULFILLED`

`FULFILLED` بيتمسك صح ويروح `RTO`. `PARTIALLY_FULFILLED` **بيعدّي ساكت** في
دلو الأوردرات النضيفة — يعني الحدث بيختفي من تقارير الـ RTO خالص بدل ما يتحط
في الدلو الغلط ويبان.

### أسئلة محتاجة قرار قبل أي تعديل

1. هل الحالة دي بتحصل أصلاً في المتجر؟ (جرد 01-09-2026: **صفر** أوردر
   `ON_HOLD` وصفر `SCHEDULED`؛ `PARTIALLY_FULFILLED` **ما اتجردتش لوحدها**.)
2. لو بتحصل: تروح `RTO`، ولا دلو تالت، ولا تتوسم `PARTIAL_CANCEL` وتتساب
   مكانها؟ (قاعدة 13: **علّم، ماتحركش** — تحريك دلاء بيغيّر أرقام تاريخية.)

**الجرد قبل أي قرار:**

```graphql
{ orders(first: 50, query: "fulfillment_status:partial status:cancelled") {
    nodes { name cancelledAt displayFulfillmentStatus } } }
```

---

## مصادر الأدلة

| البند | المصدر |
|---|---|
| ١ · التوقيت بالثانية | D1 (`tool = order_cancel`, 01-09-2026) + شوبيفاي `#53033` |
| ٢ · سقف التصدير | كود `Order-Cancel` — `LOG_EXPORT_MAX` واتجرّب في متصفح فعلي بـ 3,500 صف |
| ٣ · التعارض | `data-table-standard.md` بند ٢١ مقابل `shared-functions.md` |
| ٤ · `cancel_failed` | `grep` على كل `writeLog(` في `index.js` |
| ٦ · `PARTIALLY_FULFILLED` | قراءة `classifyOrder` في `ecommoda-order-lifecycle` Step 4 |

آخر تحديث: 01-09-2026 — 22:00

</div>
