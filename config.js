// Edit this file to add, remove or rename galleries.
window.SITE = {
  imagesPerPage: 32,
  minPhotoHeight: 420, // the enlarged photo never scales below this height; the rest is reached by scrolling
  poolSize: 200, // each page shows a random 32 from an account's most recent photos
  api: "https://public.api.bsky.app",
  tabs: [
    { name: "-|~|+",      handle: "verladams.bsky.social" },
    { name: "Liminal",    handle: "va-liminal.bsky.social" },
    { name: "Subliminal", handle: "va-subliminal.bsky.social" },
    { name: "Sublime",    handle: "va-sublime.bsky.social" }
  ]
};
