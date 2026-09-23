# کتابخانه المنتور + فیگما (مرجع تبدیل)

منبع‌ها: [Elementor Data Structure](https://developers.elementor.com/docs/data-structure/)، سورس `elementor/includes/widgets`، [Figma REST files](https://developers.figma.com/docs/rest-api/files/)، [Figma node types](https://developers.figma.com/docs/rest-api/file-node-types/)، [Figma Plugin nodes](https://www.figma.com/plugin-docs/api/nodes/).

---

## ۱) المنتور — قالب JSON نسخه 0.4

ایمپورت از مسیر: قالب‌ها → قالب‌های ذخیره‌شده → وارد کردن قالب.

```json
{
  "title": "نام قالب",
  "type": "page",
  "version": "0.4",
  "page_settings": [],
  "content": []
}
```

| کلید | قانون |
|---|---|
| `type` | `page` / `post` / `header` / `footer` / `error-404` / `popup` |
| `page_settings` | خالی = `[]` ؛ پر = object (نه آرایه) |
| `content` | آرایهٔ المان‌های سطح بالا |

Paste در بوم (فرمت کلیپ‌بورد، جدا از فایل قالب):

```json
{ "type": "elementor", "elements": [ /* همان content */ ] }
```

ذخیره در وردپرس: `_elementor_data` داخل `wp_postmeta`. قالب export همان JSON بالا است.

### المان عمومی

```json
{
  "id": "6af611eb",
  "elType": "container",
  "isInner": false,
  "settings": {},
  "elements": []
}
```

- `id`: ۸ کاراکتر hex (بدون `#`).
- `settings` خالی = `[]` یا `{}`؛ پر = object.
- ویجت‌ها اضافه دارند: `"elType": "widget"` + `"widgetType": "heading"`.
- ویجت تو در تو (tabs/accordion/menu) هم `elements` دارند.

### چیدمان مدرن (پیشنهادی) — Flexbox Container

`elType: "container"` می‌تواند ویجت یا کانتینر تو در تو بگیرد.

کلیدهای مهم `settings`:

| کلید | مقادیر / شکل |
|---|---|
| `content_width` | `full` / `boxed` |
| `flex_direction` | `row` / `column` (+ `row-reverse` / `column-reverse`) |
| `flex_wrap` | `wrap` / `nowrap` |
| `justify_content` | `flex-start` / `center` / `flex-end` / `space-between` / `space-around` / `space-evenly` |
| `align_items` | `flex-start` / `center` / `flex-end` / `stretch` |
| `flex_gap` | `{ unit, size, column, row, isLinked }` یا اسلایدر قدیمی `{ unit, size }` |
| `gap` | در نسخه‌های جدیدتر گاهی جدا |
| `width` / `height` / `min_height` / `custom_height` | `{ unit: "px"|"%"|"vh"|"vw", size }` |
| `overflow` | `default` / `hidden` / `auto` |
| `html_tag` | `div` / `section` / `header` / `footer` / `main` / `article` / `aside` / `nav` |
| `boxed_width` | عرض محتوای boxed |
| `padding` / `margin` | `{ unit, top, right, bottom, left, isLinked }` |
| `background_background` | `classic` / `gradient` / `video` / `slideshow` |
| `background_color` | `#RRGGBB` |
| `background_image` | `{ url, id }` |
| `background_position` / `background_size` / `background_repeat` | رشته |
| `background_overlay_background` + `background_overlay_color` | overlay |
| `border_border` | `solid` / `dashed` / `dotted` / `double` / `none` |
| `border_width` / `border_radius` | dimensions |
| `border_color` | hex |
| `box_shadow_box_shadow` | گروه سایه |
| `_css_classes` | کلاس‌های HTML (Free) |
| `css_classes` | گاهی همین |

Grid Container: `container_type: "grid"` + `grid_columns_grid` / `grid_rows_grid` / `grid_gaps`.

### چیدمان قدیمی — Section / Column

```
section → column[] → widget[]
```

- `elType: "section"` — `layout`: `boxed`/`full_width`، `stretch_section`: `section-stretched`، `content_width`، `gap`.
- `elType: "column"` — `_column_size` عدد ۱–۱۰۰ (۱۲ ستونی: ۵۰ یعنی ۶/۱۲).
- Inner section: `isInner: true`.

برای خروجی جدید **container** را ترجیح بده؛ section فقط اگر کاربر «سازگاری قدیمی» بخواهد.

### ریسپانسیو

پسوند روی همان کلید داخل `settings`:

- دسکتاپ: `padding`
- تبلت: `padding_tablet`
- موبایل: `padding_mobile`
- سفارشی: `_widescreen` `_laptop` `_tablet_extra` `_mobile_extra`

اگر فقط یک دستگاه ست شود، بقیه از دسکتاپ ارث می‌برند.

### Repeater

آرایهٔ object؛ هر آیتم `_id` یکتا دارد (سلکتور CSS: `elementor-repeater-item-{{_id}}`).

نمونه icon-list:

```json
"icon_list": [
  { "_id": "a1b2c3d4", "text": "آیتم", "selected_icon": { "value": "fas fa-check", "library": "fa-solid" } }
]
```

لینک:

```json
"link": { "url": "https://…", "is_external": "on", "nofollow": "on", "custom_attributes": "" }
```

آیکون:

```json
"selected_icon": { "value": "fas fa-star", "library": "fa-solid" }
```

تصویر:

```json
"image": { "url": "https://…/pic.jpg", "id": 0, "alt": "", "source": "url" }
```

تایپوگرافی سفارشی (باید `typography_typography: "custom"` باشد وگرنه بقیه نادیده گرفته می‌شوند):

- `typography_font_family`, `typography_font_size` `{unit,size}`, `typography_font_weight`, `typography_line_height`, `typography_letter_spacing`, `typography_word_spacing`, `typography_text_transform`, `typography_font_style`

اسلایدر: `{ "unit": "px", "size": 16, "sizes": [] }`

### Global / Kit

رنگ و فونت سراسری در Kit ذخیره می‌شود، نه در صفحه. ارجاع:

```json
"__globals__": {
  "title_color": "globals/colors?id=primary",
  "typography_typography": "globals/typography?id=primary"
}
```

id داخلی: `primary` `secondary` `text` `accent`. برای تبدیل HTML/Figma معمولاً مقدار واقعی بنویس، نه global — مگر Kit هم export شود.

### Advanced (همهٔ ویجت‌ها — `common-base`)

پیشوند `_` برای کنترل‌های مشترک ویجت:

| کلید | معنی |
|---|---|
| `_margin` `_padding` | فاصله |
| `_element_width` | `inherit` / `auto` / `initial` + `_element_custom_width` |
| `_flex_size` / `_flex_grow` / `_flex_shrink` / `_flex_order` | فلکس فرزند |
| `_align_self` | |
| `_z_index` | |
| `_element_id` | HTML id |
| `_css_classes` | کلاس |
| `_background_background` `_background_color` | پس‌زمینه ویجت |
| `_border_border` `_border_width` `_border_color` `_border_radius` | |
| `_box_shadow_box_shadow` | |
| `custom_css` | **Pro** — در خروجی Free نگذار |
| `_animation` `_animation_delay` | انیمیشن ورودی |
| `_transform_*` | چرخش/جابه‌جایی |
| `hide_desktop` `hide_tablet` `hide_mobile` | `hidden-*` |

برای کانتینر/سکشن معمولاً بدون `_`: `padding`, `margin`, `z_index`, `animation`.

---

## ۲) ویجت‌های Core (Free) — `widgetType` و کلید محتوا

منبع: `github.com/elementor/elementor/includes/widgets`.

### محتوا

| widgetType | کلیدهای اصلی |
|---|---|
| `heading` | `title`, `header_size` (`h1`–`h6`/`div`/`span`/`p`), `link`, `align`, `title_color`, `typography_*`, `blend_mode`, `size` (قدیمی) |
| `text-editor` | `editor` (HTML وردپرس), `align`, `text_color`, `typography_*` |
| `image` | `image` `{id,url}`, `image_size`, `align`, `caption`, `link_to` (`none`/`file`/`custom`), `link`, `width`, `height`, `opacity`, `border_radius`, `_padding` |
| `video` | `video_type` (`youtube`/`vimeo`/`dailymotion`/`videopress`/`hosted`), `youtube_url` / `vimeo_url` / `hosted_url`, `autoplay`, `mute`, `loop`, `image_overlay` |
| `button` | `text`, `link`, `button_type` (`default`/`info`/`success`/`warning`/`danger`), `align`, `size`, `selected_icon`, `icon_align`, `button_text_color`, `background_color`, `border_radius`, `button_id` |
| `divider` | `style` (`solid`/`double`/`dotted`/`dashed`), `weight`, `color`, `width`, `align`, `gap` |
| `spacer` | `space` `{unit,size}` |
| `google_maps` | `address`, `zoom` |
| `icon` | `selected_icon`, `view` (`default`/`stacked`/`framed`), `shape`, `link`, `align`, `primary_color`, `size` |
| `star-rating` / `rating` | `rating`, `star_style`, `title` |
| `alert` | `alert_type`, `alert_title`, `alert_description`, `show_dismiss` |
| `html` | `html` — اسکریپت/SVG/فرم پیچیده اینجا |
| `shortcode` | `shortcode` |
| `sidebar` | `sidebar` |
| `menu-anchor` | `anchor` |
| `read-more` | `link` |
| `text-path` | متن روی مسیر SVG |

### ساختار / جعبه

| widgetType | کلیدها |
|---|---|
| `icon-box` | `selected_icon`, `title_text`, `description_text`, `link`, `position` (`left`/`top`/`right`), `title_size` |
| `image-box` | `image`, `title_text`, `description_text`, `link`, `position` |
| `icon-list` | repeater `icon_list` → `text`, `selected_icon`, `link` |
| `counter` | `starting_number`, `ending_number`, `prefix`, `suffix`, `duration`, `title` |
| `progress` | `title`, `percent`, `display_percentage`, `inner_text` |
| `testimonial` | `testimonial_content`, `testimonial_image`, `testimonial_name`, `testimonial_job` |
| `accordion` | repeater `tabs` → `tab_title`, `tab_content` (قدیمی؛ متن HTML) |
| `toggle` | مشابه accordion |
| `tabs` | repeater `tabs` |
| `nested-accordion` / `nested-tabs` | `elType:widget` + `elements` کانتینر برای هر پنل (نیاز به experiment container) |
| `image-carousel` | `carousel` گالری، `slides_to_show`, `navigation` |
| `image-gallery` | `gallery` `{id,url}[]` |
| `social-icons` | repeater `social_icon_list` |
| `audio` | SoundCloud `link` |
| `inner-section` | فقط در ساختار قدیمی |

### Pro (در خروجی Free نساز مگر کاربر Pro دارد)

`form`, `slides`, `nav-menu`, `price-table`, `price-list`, `countdown`, `gallery` (pro), `login`, `animated-headline`, `hotspot`, `blockquote`, `call-to-action`, `media-carousel`, `testimonial-carousel`, `flip-box`, `theme-post-content`, Woo widgets، `custom_css`، Theme Builder، Popup.

برای فرم/جدول/SVG پیچیده → ویجت `html`.

---

## ۳) فیگما — دو API

### REST (خواندنی — مناسب تبدیل فایل)

Base: `https://api.figma.com`

Auth: هدر `X-Figma-Token: <PAT>` یا `Authorization: Bearer <oauth>`  
Scope لازم: `file_content:read` (+ `file_dev_resources:read` اختیاری).

کلید فایل از URL: `https://www.figma.com/design/:file_key/:name?node-id=12-34`  
`node-id` در URL با `-` است؛ در API با `:` → `12:34`.

| Endpoint | کار |
|---|---|
| `GET /v1/files/:key` | کل درخت `document` |
| `GET /v1/files/:key/nodes?ids=1:2,1:3` | زیر درخت |
| `GET /v1/images/:key?ids=…&format=png\|jpg\|svg\|pdf&scale=1..4` | رندر لایه → URL موقت |
| `GET /v1/files/:key/images` | image fills (hash → URL) |
| query `depth` | عمق پیمایش |
| query `geometry=paths` | path برداری |
| query `version` | نسخهٔ مشخص فایل |

REST **نمی‌نویسد** داخل فایل (پر کردن لایه از بیرون ممکن نیست). برای تبدیل فقط خواندن کافی است.

پاسخ فایل:

```
{
  name, lastModified, thumbnailUrl, version, schemaVersion,
  document: DOCUMENT,
  components: { nodeId: meta },
  componentSets: {…},
  styles: {…}
}
```

درخت: `DOCUMENT` → `CANVAS` (صفحه) → لایه‌ها.

### Plugin API (داخل فیگما — خواندن/نوشتن زنده)

`figma.currentPage`, `figma.root`, `node.type`, mixins (`ChildrenMixin`, `AutoLayoutMixin`, …).  
برای اپ آفلاین ویندوز ما REST مناسب‌تر است مگر پلاگین جدا بسازیم.

---

## ۴) انواع نود فیگما (REST `type`)

| type | معنی برای تبدیل |
|---|---|
| `DOCUMENT` | ریشه |
| `CANVAS` | یک Page |
| `SECTION` | بخش بورد (معمولاً نادیده یا فریم‌های داخلش) |
| `FRAME` / `COMPONENT` / `INSTANCE` / `COMPONENT_SET` | کانتینر المنتور |
| `GROUP` / `TRANSFORM_GROUP` | کانتینر بدون auto-layout یا flatten |
| `TEXT` | heading یا text-editor |
| `RECTANGLE` / `ELLIPSE` / `LINE` / `STAR` / `REGULAR_POLYGON` / `VECTOR` / `BOOLEAN_OPERATION` | اگر fill تصویری → image؛ اگر دکمه/پس‌زمینه → تنظیمات کانتینر؛ وگرنه SVG در `html` یا export PNG |
| `TABLE` / `TABLE_CELL` | html table یا html widget |
| `SLICE` | فقط export |
| `EMBED` / `LINK_UNFURL` / `WIDGET` / `MEDIA` | html / video |
| `CONNECTOR` `STICKY` `SHAPE_WITH_TEXT` `STAMP` `WASHI_TAPE` | وایت‌بورد — معمولاً skip |

خواص جهانی: `id`, `name`, `visible`, `type`, `rotation`, `boundVariables`, `pluginData`.

### FRAME / auto-layout (مهم‌ترین بخش)

- `layoutMode`: `NONE` | `HORIZONTAL` | `VERTICAL` | `GRID`
- `layoutWrap`: `NO_WRAP` | `WRAP`
- `layoutSizingHorizontal/Vertical`: `FIXED` | `HUG` | `FILL`
- `primaryAxisAlignItems`: `MIN` `CENTER` `MAX` `SPACE_BETWEEN`
- `counterAxisAlignItems`: `MIN` `CENTER` `MAX` `BASELINE`
- `paddingLeft/Right/Top/Bottom`, `itemSpacing`, `counterAxisSpacing`
- `clipsContent` → overflow hidden
- `layoutPositioning` فرزند: `AUTO` | `ABSOLUTE`
- `minWidth` `maxWidth` `minHeight` `maxHeight`
- `fills[]` `strokes[]` `strokeWeight` `strokeAlign` (`INSIDE`/`OUTSIDE`/`CENTER`)
- `cornerRadius` یا `rectangleCornerRadii[4]` (TL, TR, BR, BL)
- `effects[]`: `DROP_SHADOW` `INNER_SHADOW` `LAYER_BLUR` `BACKGROUND_BLUR`
- `opacity`, `blendMode`, `absoluteBoundingBox` `{x,y,width,height}`
- `constraints` برای absolute: `LEFT/RIGHT/CENTER/LEFT_RIGHT/SCALE` × vertical مشابه

GRID: `gridRowCount` `gridColumnCount` `gridRowGap` `gridColumnGap` `gridRowSpan` `gridColumnSpan` …

### TEXT

- `characters` متن خام
- `style` (کل لایه) + `characterStyleOverrides` + `styleOverrideTable` برای rich text
- `style.fontFamily` `fontPostScriptName` `fontWeight` `fontSize` `lineHeightPx` / `lineHeightPercent` / `lineHeightUnit`
- `letterSpacing`, `textAlignHorizontal` (`LEFT`/`CENTER`/`RIGHT`/`JUSTIFIED`)
- `textAlignVertical`, `textCase` (`UPPER`/`LOWER`/`TITLE`/`ORIGINAL`)
- `textDecoration` `UNDERLINE` / `STRIKETHROUGH`
- `fills` رنگ متن (rgba 0–1)

### Paint

```
{ type: "SOLID", color: {r,g,b,a}, opacity, visible, blendMode }
{ type: "IMAGE", scaleMode: "FILL"|"FIT"|"CROP"|"TILE", imageRef, … }
{ type: "GRADIENT_LINEAR"|"GRADIENT_RADIAL"|"GRADIENT_ANGULAR"|"GRADIENT_DIAMOND", gradientStops, gradientHandlePositions }
```

رنگ فیگما 0–1 است → `#RRGGBB`: `hex = Math.round(c*255)`.

Image fills: `GET /v1/files/:key/images` بعد `imageRef` را به URL نگاشت کن؛ یا لایه را با `/v1/images` رندر کن.

---

## ۵) نگاشت فیگما → المنتور (قانون تبدیل)

هدف: فریم صفحه (معمولاً Desktop 1440 یا فریم به نام صفحه) → قالب `type:page` `version:0.4`.

| فیگما | المنتور |
|---|---|
| FRAME `layoutMode=VERTICAL` | container `flex_direction: column` |
| FRAME `HORIZONTAL` | container `flex_direction: row` |
| FRAME `GRID` | container `container_type: grid` |
| FRAME `NONE` (absolute) | container با فرزندان `_position: absolute` + offset — یا html اگر شلوغ |
| `itemSpacing` | `flex_gap.size` |
| padding* | `padding.{top,right,bottom,left}` px |
| `primaryAxisAlignItems` MIN/CENTER/MAX/SPACE_BETWEEN | `justify_content` flex-start/center/flex-end/space-between |
| `counterAxisAlignItems` | `align_items` |
| `layoutWrap=WRAP` | `flex_wrap: wrap` |
| child `FILL` افقی در ستون | `_element_width: inherit` + width 100% یا `flex_grow` |
| child `HUG` | auto |
| `cornerRadius` | `border_radius` |
| SOLID fill روی فریم | `background_background: classic` + `background_color` |
| IMAGE fill روی فریم | `background_image.url` |
| GRADIENT fill | `background_background: gradient` + stopها |
| DROP_SHADOW | `box_shadow_box_shadow` |
| TEXT fontSize≥ ~20 یا نام Heading/H1–H6 | `heading` (`header_size` از نام لایه یا وزن) |
| TEXT معمولی | `text-editor` (`editor` با `<p>` یا spanهای رنگ) |
| RECTANGLE/VECTOR با IMAGE fill | `image` |
| فریم شبیه دکمه (متن + radius + fill + onClick/prototype) | `button` |
| INSTANCE از کامپوننت Button/Input | ویجت متناظر یا html |
| VECTOR/BOOLEAN پیچیده | export SVG → `html` یا PNG → `image` |
| `visible=false` | حذف یا `hide_desktop` |
| `rotation` | `_transform_rotate` |
| Auto-layout gap منفی | margin منفی |
| Variables / styles | رنگ/تایپ واقعی resolve شده (نه token خام) مگر Kit بسازیم |
| Prototype interactions | لینک `link.url` اگر `transitionNodeID` به URL/frame نام‌دار باشد؛ وگرنه نادیده |

قوانین عملی:

1. فقط فریم‌های «صفحه» را تبدیل کن (نه کل صفحهٔ کانواس پر از کامپوننت).
2. INSTANCE را از `components`/`componentSets` بشناس؛ اگر Button/Heading/Icon از دیزاین‌سیستم است، ویجت بومی بساز.
3. تصویر را با `/v1/images` بکش و در JSON به‌صورت URL بگذار (کاربر بعداً در رسانه وردپرس آپلود می‌کند) یا ZIP جدا.
4. CSS جدا مثل HTML2Elementor فعلی: کلاس از `name` لایهٔ slug + فایل CSS برای چیزهایی که کنترل Free ندارد (blur پیچیده، چند fill، mask).
5. عمق کانتینر را محدود کن (۳–۴ سطح)؛ گروه‌های بی‌معنی را flatten کن.
6. Free-compatible: بدون `custom_css`، بدون ویجت Pro.

---

## ۶) وضعیت نسخه ۱.۶.۰

فهرست به‌روز ویجت‌ها، محدودیت‌ها و آزمون‌ها در [یادداشت انتشار](RELEASE-v1.6.0.md) آمده است. Grid از کلیدهای واقعی کنترل گروهی Core استفاده می‌کند: `grid_columns_grid` و `grid_rows_grid` با `unit: fr` یا `custom`، و `grid_gaps`.

اسکریپت HTML در خروجی حفظ می‌شود ولی در پیش‌نمایش اجرا نمی‌شود.

---

## ۷) مسیر پیشنهادی فیگما در همین برنامه

1. ورودی: لینک فیگما + Personal Access Token (آفلاین: JSON export فایل که کاربر ذخیره کرده).
2. انتخاب فریم صفحه.
3. پیمایش درخت با قوانین بخش ۵.
4. همان خروجی فعلی: `name.json` + `name.css` + پیش‌نمایش زنده.
5. بدون وابستگی به پلاگین فیگما در نسخهٔ اول (فقط REST یا JSON دانلودشده).
