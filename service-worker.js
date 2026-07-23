// --- Service Worker لتطبيق سجل الحضور والغياب ---
// الهدف: تخزين كل ملفات التطبيق محلياً بالجهاز بعد أول تحميل، حتى يعمل التطبيق بالكامل بدون اتصال إنترنت بعد ذلك.

// رقم نسخة الكاش - مهم جداً: كل مرة تحدّث الكود وترفع نسخة جديدة، يجب تغيير هذا الرقم
// (مثلاً v1 -> v2) حتى يكتشف التطبيق وجود تحديث ويحمّل النسخة الجديدة.
const CACHE_VERSION = "v40";
const CACHE_NAME = "attendance-app-" + CACHE_VERSION;

// قائمة كل الملفات الأساسية المطلوبة لعمل التطبيق بدون نت
const FILES_TO_CACHE = [
  "./index.html",
  "./manifest.json",
  "./icon-72.png",
  "./icon-96.png",
  "./icon-128.png",
  "./icon-144.png",
  "./icon-152.png",
  "./icon-192.png",
  "./icon-384.png",
  "./icon-512.png",
  "./icon-512-maskable.png",
  // مكتبة SheetJS المستخدمة لتصدير/استيراد ملفات الإكسل (محمّلة من شبكة خارجية بالكود الأصلي)
  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
  // مكتبتا html2canvas وjsPDF المستخدمتان لتوليد ملفات PDF مباشرة من محتوى الصفحة
  "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"
];

// --- مرحلة التثبيت: تحميل وتخزين كل الملفات الأساسية بالكاش ---
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // نخزن كل ملف لحاله بدل addAll، حتى لو فشل ملف واحد (مثلاً مكتبة خارجية بسبب بطء النت)
      // لا يوقف تخزين بقية الملفات الأساسية (index.html, manifest, الأيقونات...)
      return Promise.all(
        FILES_TO_CACHE.map(function (url) {
          return cache.add(url).catch(function (err) {
            console.log("فشل تخزين الملف (تم تجاهله):", url, err);
          });
        })
      );
    })
  );
  self.skipWaiting(); // تفعيل النسخة الجديدة من service worker فوراً دون انتظار إغلاق كل النوافذ المفتوحة
});

// --- مرحلة التفعيل: حذف أي نسخ كاش قديمة لا تطابق النسخة الحالية ---
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function (name) {
            return name !== CACHE_NAME; // حذف كل الأسماء غير النسخة الحالية
          })
          .map(function (name) {
            return caches.delete(name);
          })
      );
    })
  );
  self.clients.claim(); // التحكم فوراً بكل الصفحات المفتوحة بدون الحاجة لإعادة تحميل
});

// --- مرحلة الجلب: محاولة الإرجاع من الكاش أولاً (للعمل بدون نت)، مع تحديث الكاش بصمت بالخلفية لو كان النت متاحاً ---
self.addEventListener("fetch", function (event) {
  // نتجاهل الطلبات غير GET (مثل أي إرسال بيانات لاحقاً، لا ينطبق حالياً لكن للسلامة)
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then(function (cachedResponse) {
      // نحاول تحديث الكاش بالخلفية إن كان هناك اتصال، دون التأثير على سرعة الاستجابة الحالية
      var fetchPromise = fetch(event.request)
        .then(function (networkResponse) {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(event.request, networkResponse.clone());
            });
          }
          return networkResponse;
        })
        .catch(function () {
          // فشل الاتصال (لا يوجد نت) - لا بأس، سنعتمد على الكاش المخزن مسبقاً إن وجد
          return null;
        });

      // إن وجدت نسخة بالكاش، أرجعها فوراً (سرعة + عمل بدون نت)
      // وإن لم توجد، ننتظر نتيجة الشبكة
      return cachedResponse || fetchPromise;
    })
  );
});
