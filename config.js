// Edit this file to add, remove or rename galleries.
// Optional per tab: hover: "text" is shown in place of the tab name while the pointer is over it
// (keep it fairly short so it doesn't run into the neighbouring tabs).
window.SITE = {
  minPhotoHeight: 420, // the enlarged photo never scales below this height; the rest is reached by scrolling
  maxRequests: 100, // safety limit on feed pages fetched per account (100 posts each)
  api: "https://public.api.bsky.app",
  tabs: [
    { name: "-|~|+",      handle: "verladams.bsky.social" },
    { name: "Liminal",    handle: "va-liminal.bsky.social", hover: "photography" },
    { name: "Subliminal", handle: "va-subliminal.bsky.social" },
    { name: "Sublime",    handle: "va-sublime.bsky.social" }
  ]
};
