# المنتور Core و Pro — معماری، ارتباط، اجرا

منابع: سورس GPL هسته (`elementor/includes/plugin.php` نسخهٔ ۴.۴)، [مستندات Addon](https://developers.elementor.com/docs/addons/addon-example/)، [Managers](https://developers.elementor.com/docs/managers/)، [Dynamic Tags](https://developers.elementor.com/docs/dynamic-tags/)، [Theme Locations](https://developers.elementor.com/docs/themes/registering-locations).

---

## ۱) دو افزونهٔ جدا، یک موتور

| | **Elementor (Core)** | **Elementor Pro** |
|---|---|---|
| پوشه | `wp-content/plugins/elementor/` | `wp-content/plugins/elementor-pro/` |
| لایسنس | GPL — رایگان روی wordpress.org | تجاری؛ **بدون Core کار نمی‌کند** |
| کلاس اصلی | `\Elementor\Plugin` | `\ElementorPro\Plugin` |
| کار | ادیتور، کانتینر، ویجت‌های پایه، ذخیره JSON، رندر فرانت | ویجت/داکیومنت/تگ داینامیک/فرم/پاپ‌آپ/Theme Builder روی همان API |

Pro **جایگزین** Core نیست. مثل هر addon دیگر به هوک‌های Core وصل می‌شود.

هدر Pro معمولاً:

```
Requires Plugins: elementor
Elementor tested up to: x.x.x
```

اگر Core نباشد، Pro فقط اخطار ادمین می‌دهد و خارج می‌شود.

---

## ۲) ترتیب بوت (ارتباط واقعی)

```
WordPress
  plugins_loaded
    ├─ elementor.php
    │    PHP/WP version OK؟
    │    require includes/plugin.php
    │    \Elementor\Plugin::instance()     ← singleton
    │    do_action('elementor/loaded')     ← «هسته زنده است»
    │
    └─ elementor-pro.php  (و هر addon دیگر)
         did_action('elementor/loaded') ؟  وگرنه notice و return
         نسخهٔ ELEMENTOR_VERSION کافی است؟
         \ElementorPro\Plugin::instance()
         add_action('elementor/init', …)

  elementor/init                         ← هسته آمادهٔ ثبت قطعات
    Pro/addon اینجا ویجت، کنترل، داکیومنت، تگ ثبت می‌کند

  elementor/widgets/register
  elementor/controls/register
  elementor/documents/register
  elementor/dynamic_tags/register
  elementor/elements/categories_registered
  elementor/frontend/after_register_scripts
  elementor/editor/after_enqueue_scripts
```

چک استاندارد (همان الگوی رسمی addon و همان کاری که Pro می‌کند):

```php
if ( ! did_action( 'elementor/loaded' ) ) {
    // Elementor نصب/فعال نیست
    return false;
}
if ( ! version_compare( ELEMENTOR_VERSION, '3.20.0', '>=' ) ) {
    return false;
}
add_action( 'elementor/init', [ $this, 'init' ] );
```

دسترسی به هسته از داخل Pro:

```php
\Elementor\Plugin::$instance                    // همهٔ مدیرها
\ElementorPro\Plugin::elementor()               // همان instance هسته
\ElementorPro\Plugin::instance()->modules_manager
```

---

## ۳) مغز Core — `\Elementor\Plugin::$instance`

مدیرهای مهم (از `includes/plugin.php`):

| پراپرتی | نقش |
|---|---|
| `widgets_manager` | ثبت/حذف ویجت |
| `controls_manager` | کنترل‌های پنل (TEXT, COLOR, SLIDER, REPEATER, …) |
| `elements_manager` | section / column / container + دسته‌ها |
| `documents` | نوع سند: page, post, kit، و آنچه Pro اضافه می‌کند |
| `dynamic_tags` | زیرساخت تگ داینامیک (تگ‌های واقعی عمدتاً Pro) |
| `kits_manager` | Site Settings / رنگ و فونت سراسری (Kit = یک پست خاص) |
| `editor` | بوم ادیتور (iframe + پنل) |
| `preview` | پیش‌نمایش داخل iframe |
| `frontend` | پارس JSON و `render()` ویجت‌ها در سایت |
| `db` | خواندن/نوشتن `_elementor_data` |
| `templates_manager` | کتابخانه قالب (لوکال + کلود) |
| `experiments` | Container، nested، optimized markup، Atomic |
| `breakpoints` | desktop / tablet / mobile + extra |
| `modules_manager` | ماژول‌های خود Core |
| `ajax` / data_manager | ذخیره ادیتور، کتابخانه، …

ثبت ویجت (روش فعلی، نه `register_widget_type` قدیمی):

```php
add_action( 'elementor/widgets/register', function( $widgets_manager ) {
    $widgets_manager->register( new \My\Widget() );
});
```

---

## ۴) داده کجا زندگی می‌کند (هر دو افزونه یک فرمت)

پست/برگه/قالب = پست وردپرس + متا:

| meta key | محتوا |
|---|---|
| `_elementor_edit_mode` | `builder` |
| `_elementor_data` | JSON المان‌ها (همان `content` قالب 0.4) |
| `_elementor_page_settings` | page_settings |
| `_elementor_version` | نسخهٔ دیتا |
| `_elementor_css` | وضعیت CSS تولیدشده |
| `_elementor_template_type` | روی CPT `elementor_library`: `page`, `section`, `container`, `header`, `footer`, `single`, `archive`, `popup`, `error-404`, `loop-item`, `product`, `kit`, … |

رندر فرانت:

1. `the_content` یا Theme Location
2. `Plugin::$instance->frontend->get_builder_content( $post_id )`
3. JSON خوانده می‌شود → درخت المان
4. برای هر ویجت کلاس `widgetType` پیدا می‌شود → `render()`
5. CSS جدا در `uploads/elementor/css/post-{id}.css`

ادیتور (JS):

- `window.elementor` — مدل Backbone المان‌ها، ذخیره Ajax
- `window.elementorFrontend` — هندلر فرانت (و پیش‌نمایش)
- Pro: `window.elementorPro` (ادیتور) و `window.elementorProFrontend` (فرانت)

مثال پاپ‌آپ Pro:

```js
elementorProFrontend.modules.popup.showPopup({ id: 123 });
```

ارتباط JS هم hook است: `elementorFrontend.hooks.addAction('frontend/element_ready/widget-name.default', …)`.

---

## ۵) Pro چه چیزی روی Core سوار می‌کند

Pro یک **Modules_Manager** داخلی دارد. هر ماژول معمولاً:

- ویجت ثبت می‌کند
- یا نوع Document ثبت می‌کند
- یا کنترل/تگ/اسکریپت ادیتور

### Theme Builder (مهم‌ترین تفاوت)

Core فقط محتوای برگه/پست را می‌سازد. Pro سندهای `header` / `footer` / `single` / `archive` / `error-404` را ثبت می‌کند.

قالب وردپرس باید Location بدهد:

```php
add_action( 'elementor/theme/register_locations', function( $m ) {
    $m->register_all_core_location(); // یا header/footer جدا
});
```

در `header.php`:

```php
if ( ! function_exists( 'elementor_theme_do_location' ) || ! elementor_theme_do_location( 'header' ) ) {
    // هدر خود قالب
}
```

شرایط نمایش (کل سایت / Singular / Archive / Woo) در آپشن `elementor_pro_theme_builder_conditions` ذخیره می‌شود. هنگام `wp` Pro چک می‌کند کدام قالب برنده است و محتوا را تزریق می‌کند.

Hello Elementor این locationها را از قبل دارد.

### Popup

سند `type: popup` + تنظیمات در `page_settings` (عرض، overlay، انیمیشن، جلوگیری از اسکرول). Triggers جدا. به صفحه با `add_popup_to_location` چسبانده می‌شود.

### Forms

ویجت `form` با repeater فیلدها. ارسال Ajax به endpoint Pro → ذخیره در CPT/دیتابیس فرم‌ها + اکشن (ایمیل، webhook، Mailchimp، …). بدون Pro این ویجت در JSON بی‌کلاس می‌ماند (صفحه خالی/ارور ویجت گم‌شده).

### Dynamic Tags

زیرساخت در Core است؛ تگ‌های آماده (Post Title، ACF، Site Logo، Woo Price، …) در Pro ثبت می‌شوند با:

```php
add_action( 'elementor/dynamic_tags/register', function( $manager ) {
    $manager->register( new My_Tag() );
});
```

در JSON کنترل به‌جای مقدار ثابت می‌تواند شیء داینامیک داشته باشد؛ رندر Pro مقدار را از پست جاری می‌کشد. برای تبدیل HTML/Figma ما معمولاً مقدار استاتیک می‌نویسیم.

### بقیهٔ ماژول‌های رایج Pro

| ماژول | widgetType / اثر |
|---|---|
| Nav Menu | `nav-menu` |
| Posts / Portfolio / Loop Grid | `posts`, `loop-grid`, `loop-carousel` |
| Slides / Media Carousel | `slides`, `media-carousel` |
| Price Table / List | `price-table`, `price-list` |
| Countdown, Gallery, Share Buttons | `countdown`, `gallery`, `share-buttons` |
| Login, Search | `login`, `search-form` / `search` |
| Theme elements | `theme-site-logo`, `theme-site-title`, `theme-post-title`, `theme-post-content`, `theme-post-excerpt`, `theme-post-featured-image`, `archive-posts`, `archive-title` |
| Woo | `woocommerce-products`, `woocommerce-product-title`, `woocommerce-product-price`, `woocommerce-product-add-to-cart`, `woocommerce-cart`, `woocommerce-checkout`, … |
| Custom CSS | کلید `custom_css` روی هر المان — **فقط Pro رندر می‌کند** |
| Motion FX / Sticky | تنظیمات extra روی Advanced |
| Global Widget | نمونهٔ ذخیره و reuse |
| Custom Fonts / Icons | Assets Manager |
| Display Conditions | نمایش شرطی ویجت |
| Connect / License | OAuth به my.elementor.com — قالب ابری و آپدیت |

لایسنس: بدون اتصال حساب، خیلی از قابلیت‌ها (کتابخانه ابری، آپدیت) قفل می‌شود؛ ویجت‌های محلی معمولاً اگر فایل Pro موجود باشد هنوز رندر می‌شوند (بسته به نسخه).

---

## ۶) ویجت گم‌شده یعنی چه

اگر JSON شامل `"widgetType": "form"` باشد و Pro فعال نباشد، Core کلاس را پیدا نمی‌کند → در ادیتور «ویجت وجود ندارد» و در فرانت خروجی خالی/جایگزین. برای HTML2Elementor:

- خروجی **Free-safe**: فقط widgetTypeهای Core
- خروجی **Pro**: form / nav-menu / posts / custom_css فقط اگر کاربر بگوید سایت Pro دارد

---

## ۷) ارتباط با برنامهٔ ما (HTML → JSON)

ما افزونه را داخل وردپرس اجرا نمی‌کنیم. ما **همان JSON** را می‌سازیم که Core/Pro بعداً می‌خوانند.

```
HTML/Figma  →  HTML2Elementor  →  name.json (version 0.4)
                                    ↓
                         Import Templates در وردپرس
                                    ↓
                    Core (و در صورت وجود Pro) رندر
```

دانستن معماری افزونه‌ها برای این است که:

1. `widgetType` و کلید `settings` دقیقاً همان `add_control()` سورس باشد
2. `elType` و Document `type` درست باشد
3. چیزی که فقط Pro دارد را بی‌جهت در قالب Free نگذاریم

---

## ۸) آیا باید افزونه آپلود شود؟

| فایل | لازم؟ |
|---|---|
| **Elementor Core** | نه برای اجرا. سورس GPL روی GitHub/wordpress.org هست؛ ویجت‌های Free را از آنجا خواندم. اگر خواستی zip رسمی `elementor.latest.zip` را بگذار تا با نسخهٔ دقیق تو هم‌خوان شود. |
| **Elementor Pro** | برای دیدن `register_controls()` ویجت‌های Pro (form فیلدها، nav-menu، posts query، loop-grid) **مفید است**. فقط نسخهٔ **خریداری‌شدهٔ قانونی** خودت. نال/کرک نفرست. داخل خروجی ویندوز کپی نمی‌شود؛ فقط برای استخراج کلید JSON. |
| قالب JSON اکسپورت‌شده از یک سایت Pro | جایگزین خوب: یک هدر، یک فرم، یک پست‌لیست را از المنتور Export کن و همان `.json` را بفرست — بدون نیاز به کل افزونه. |

حداقلِ مفید اگر Pro می‌فرستی: پوشهٔ `elementor-pro/modules/` (widgets + documents). کل zip هم قابل قبول است.
