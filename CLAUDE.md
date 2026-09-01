<div dir="rtl" style="text-align: right;">

# إلغاء الأوردرات يدويًا (`Order-Cancel`)

![version](https://img.shields.io/badge/version-v1.0.0-blue)

**بتعمل إيه:** خدمة العملاء بتلغي أوردر قبل الشحن من غير ما تدخل داشبورد شوبيفاي، مع فرض شروط تمنع الإلغاء في الحالة أو الوقت الغلط.
**مين بيستخدمها:** خدمة العملاء (CS)
**الإصدار:** Worker `v2.1.0` · الواجهة `v1.0.1`   ← الاتنين مستقلين، طبيعي يختلفوا

## الروابط

```
الواجهة    : https://ecommoda-dev.github.io/Order-Cancel/
الـ Worker : https://order-cancel-worker.ecommoda-dev.workers.dev
اسم الـ Worker في الداشبورد: order-cancel-worker     ← لازم يطابق name في wrangler.toml
```

⚠️ **الاسم `orders-cancel-worker` (بـ s) غلط ومنتشر** — مذكور كده في
`ecommoda-constants` §11 بند 10 وكان مكتوب في تشينجلوج الواجهة. الاسم الحقيقي
في الداشبورد **`order-cancel-worker`** (اتأكد من `workers_list` يوم 01-09-2026).
أي `wrangler.toml` بالاسم الغلط = **Worker شبح** (فخ §7 التاني في سكيل النقل).

## الـ Endpoints

| `?action=` | بيعمل إيه |
|---|---|
| `lookup_order` | بحث بالرقم/`#`الرقم/رابط الأدمن + قائمة أسباب الإلغاء الحية |
| `cancel_order` | تنفيذ الإلغاء + restock + كتابة السبب + تحقق بعدي من `cancelledAt` |
| `diag` | فحص صلاحيات شوبيفاي (`write_orders` · `read_returns` · `write_returns`) |
| `get_config` | رقم نسخة الـ Worker — الواجهة بتقارنه بنسختها |
| `get_employees` | قائمة الموظفين النشطين — شاشة الدخول |
| `check_employee` · `register_pin` · `verify_employee` · `log_logout` | Universal D1 Auth |
| `get_logs` | سجل العمليات |

## D1

```
tool  : order_cancel
type  : cancel · cancel_failed · login · logout
```

> 🔴 **`cancel_failed` مش مسجّل في `ecommoda-constants` §7** — الجدول هناك
> بيقول `cancel · login · logout` بس. القيمة دي موجودة في الكود المنشور من
> **v1.0.3** (يعني بتتكتب في D1 فعلاً من زمان)، فدي مخالفة قديمة لقاعدة
> "التسجيل قبل أول `writeLog`" مش مخالفة جديدة. **محتاجة تتضاف في
> `ecommoda-constants` §7** — بند مفتوح تحت.

## المضبوط فعليًا في الداشبورد

> اللي **متظبط بالفعل** — مش اللي المفروض يكون. لسه محتاج تأكيد بالعين
> بعد أول ربط.

```
Bindings : DB → ecommoda-dev-logs
Secrets  : WORKER_SECRET · CLIENT_ID · CLIENT_SECRET
Vars     : SHOP_DOMAIN                      ← من [vars] في wrangler.toml
Build watch paths : * (الافتراضي — ما اتضيّقتش لسه)
```

**تصنيف الـ `env.*` (سكيل النقل §4-أ-٢):**

| المتغيّر | التصنيف | إزاي نتأكد |
|---|---|---|
| `WORKER_SECRET` · `CLIENT_ID` · `CLIENT_SECRET` | سر | قيمته مستحيلة القراءة — من مصدر أحمد |
| `SHOP_DOMAIN` | var بيرمي لو غاب | غيابه بيدّي `"error code: 1003" is not valid JSON` |
| — | var ليه fallback | **مفيش ولا واحد** ✅ يعني مفيش خطر أرقام غلط بصمت |

## CORS

`ALLOWED_ORIGINS` صارمة — `https://ecommoda-dev.github.io` بس. الأداة **بتكتب
وبتلغي أوردرات** (Option B). الدومين المهجور `ecommoda24.github.io` كان موجود
في v1.0.3 و**اتشال** — ده بيقفل جزء من `ecommoda-constants` §11 بند 10.

## خط الأساس بعد النقل

```
مفيش خط أساس — الأداة عمرها ما اشتغلت بواجهة (الـ Worker اتنشر لوحده والـ HTML
ما اتنشرش أبدًا). بند ١٠ في قائمة التحقق **مفتوح بوعي**: أول تشغيل ناجح
(بحث أوردر + إلغاء واحد تجريبي) هو اللي هيكتب خط الأساس هنا.
```

## فخاخ الأداة دي

- 🔴 **الـ Worker كان ناقصه `get_employees` تمامًا** لحد v2.1.0. الواجهة
  بتناديه في `loadEmployeesList()`، والـ Worker كان بيرد 404 → **مفيش موظف
  يقدر يدخل**. لو حصل rollback لأي نسخة قبل v2.1.0، الأداة بتتعطّل بالكامل
  مع إن كل حاجة تانية سليمة.
- ⚠️ **زرار "⚠️ نسخة الـ Worker مختلفة" هيفضل ظاهر على طول.** `checkWorkerVersion()`
  بتقارن `TOOL_VERSION` بتاع الواجهة (`v1.0.1`) برقم الـ Worker (`2.1.0`) وبتطلب
  تطابق حرفي — بس سكيل النقل §12 بتقول إن اختلاف الرقمين **وضع طبيعي**. بند
  مفتوح تحت.
- ⚠️ **`REASON_ENUM_MAP` تخمين مش مؤكَّد.** تصنيف الـ 14 سبب على enum شوبيفاي
  (`CUSTOMER`/`STAFF`/`INVENTORY`/`FRAUD`/`OTHER`) اتكتب اجتهادًا. أي قيمة مش
  في الجدول بترجع `OTHER` (آمن)، لكن التصنيف نفسه محتاج مراجعة.
- ⚠️ **قائمة الأسباب بتتقرا لايف من شوبيفاي** (`custom.cancel_manual_reason`
  choices). لو تعريف الميتافيلد اتمسح أو اتغيّر، `lookup_order` بيرجّع **502**
  ويوقف العملية — ده مقصود، مش عطل.
- ⚠️ **الإلغاء لا رجعة فيه.** `orderCancel` بترجّع `job` غير متزامن، فالأداة
  بتعيد قراءة الأوردر وتتأكد من `cancelledAt` قبل ما تقول "تم". لو ما اتأكدش،
  بترجّع `confirmed:false` والواجهة بتعرض ⚠️ أصفر مش ✓ أخضر.

## استرجاع النسخ القديمة

```
مفيش نسخ مرقّمة في الريبو — الريبو اتعمل نضيف من أول commit،
والواجهة اتنشرت لأول مرة هنا.
نسخة الـ Worker القديمة (v1.0.3) اللي كانت منشورة يدويًا على كلاودفلير
مش محفوظة في git — اتسحبت عبر MCP يوم 01-09-2026 للمقارنة بس.
```

## بصمة المهارات

| المهارة | الإصدار وقت آخر تعديل |
|---|---|
| ecommoda-worker-builder | v1.1.0 |
| ecommoda-html-builder | v2.2.0 |
| ecommoda-constants | v1.4.1 |
| shopify-graphql-helper | v1.0.0 |
| ecommoda-order-lifecycle | v1.1.0 |

آخر مطابقة: 01-09-2026 · `index.js` v2.1.0 · `index.html` v1.0.1
🔴 معلّقة: — لا شيء

## مسائل مفتوحة

1. **`cancel_failed` يتسجّل في `ecommoda-constants` §7** — القيمة بتتكتب في D1
   من v1.0.3 وهي مش في الجدول.
2. **مراجعة `REASON_ENUM_MAP`** — تصنيف الـ 14 سبب على enum شوبيفاي.
3. **قرار في زرار اختلاف النسخة** — يا إما يتشال، يا إما يتحوّل لفحص "الـ Worker
   أقدم من الحد الأدنى اللي الواجهة محتاجاه" بدل التطابق الحرفي.
4. **تضييق Build watch paths** على `index.js` + `wrangler.toml` (سكيل النقل
   §13-ب) — مش متعمل، والافتراضي `*` معناه إن أي تعديل واجهة بينشر الـ Worker
   من غير داعي.
5. **خط الأساس** — يتكتب بعد أول تشغيل ناجح.

آخر تحديث: 01-09-2026 — 09:15

</div>
