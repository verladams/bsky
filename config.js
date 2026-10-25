// Edit this file to add, remove or rename galleries.
// hover: "text" is shown in place of the tab name while the pointer is over it
// (keep it short so it doesn't run into the neighbouring tabs).
window.SITE = {
  minPhotoHeight: 420, // the enlarged photo never scales below this height; the rest is reached by scrolling
  maxRequests: 100, // safety limit on feed pages fetched per account (100 posts each)
  slideInterval: 5000,     // home page slide show: how long each photo stays (ms)
  slideFade: 1500,         // ... and how long the fade between photos takes (ms)
  api: "https://public.api.bsky.app",
  tabs: [
    { name: "-|~|+",      handle: "verladams.bsky.social",      hover: "BASE" },
    { name: "Liminal",    handle: "va-liminal.bsky.social", hover: "PHOTOGRAPHY" },
    { name: "Subliminal", handle: "va-subliminal.bsky.social", hover: "ART" },
    { name: "Sublime",    handle: "va-sublime.bsky.social",    hover: "PHOTOGRAPHY" }
  ]
};
