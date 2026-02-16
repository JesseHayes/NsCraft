//Everytime new images are added include them in cache and bump name

const CACHE_NAME = "nscraft-cache-v4";
const urlsToCache = [
    "./",
    "./index.html",
    "./app.js",
    "./data.json",
    "./manifest.json",
    "./icon-192.png",
    "./icon-512.png",
    "./images/wood.jpg",
    "./images/charcoal.jpg",
    "./images/spruce_resin.jpg",
    "./images/spruce_glue.jpg",
    ",/data/mineral_occurences.json",
    "./images/map-icons/red-star.png",
    "./images/map-icons/blue-star.png"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(urlsToCache);
        })
    );
});

self.addEventListener("fetch", event => {
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request);
        })
    );
});