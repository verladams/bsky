(function () {
  var cfg = window.SITE;
  var tabsEl = document.getElementById("tabs");
  var gridEl = document.getElementById("grid");
  var statusEl = document.getElementById("status");
  var lb = document.getElementById("lightbox");
  var lbImg = document.getElementById("lb-img");
  var lbLink = document.getElementById("lb-link");

  var photos = [];   // photos on the current page
  var current = 0;   // index shown in lightbox
  var renderToken = 0;

  function slug(tab) { return tab.handle.split(".")[0]; }

  // ---- tabs ----
  cfg.tabs.forEach(function (t) {
    var a = document.createElement("a");
    a.href = "#/" + slug(t);
    a.textContent = t.name;
    a.dataset.slug = slug(t);
    tabsEl.appendChild(a);
  });

  // ---- Bluesky fetching ----
  function postUrl(handle, uri) {
    return "https://bsky.app/profile/" + handle + "/post/" + uri.split("/").pop();
  }

  // Returns up to `limit` photos from one account's own (non-reply, non-repost) posts.
  async function fetchPhotos(handle, limit) {
    var out = [], seen = {}, cursor = "", pages = 0;
    while (out.length < limit && pages < 10) {
      var url = cfg.api + "/xrpc/app.bsky.feed.getAuthorFeed?actor=" + encodeURIComponent(handle) +
        "&filter=posts_no_replies&limit=50" + (cursor ? "&cursor=" + encodeURIComponent(cursor) : "");
      var res = await fetch(url);
      if (!res.ok) throw new Error("Bluesky returned " + res.status + " for " + handle);
      var data = await res.json();
      (data.feed || []).forEach(function (item) {
        var reposted = item.reason && item.reason.$type === "app.bsky.feed.defs#reasonRepost";
        if (item.reply && !reposted) return; // skip the account's own replies; reposts are included
        var post = item.post;
        if (!post.author) return;
        var embed = post.embed;
        if (embed && embed.$type === "app.bsky.embed.recordWithMedia#view") embed = embed.media;
        if (!embed || embed.$type !== "app.bsky.embed.images#view") return;
        embed.images.forEach(function (img) {
          if (seen[img.thumb]) return; // e.g. a pinned post that also appears in the timeline
          seen[img.thumb] = true;
          // Reposted photos link to the original author's post.
          out.push({
            thumb: img.thumb,
            full: img.fullsize,
            alt: img.alt || "",
            href: postUrl(post.author.handle, post.uri)
          });
        });
      });
      cursor = data.cursor;
      pages++;
      if (!cursor) break;
    }
    return out.slice(0, limit);
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // ---- rendering ----
  function draw(list) {
    photos = list;
    gridEl.textContent = "";
    list.forEach(function (p, i) {
      var b = document.createElement("button");
      b.className = "tile";
      b.type = "button";
      b.setAttribute("aria-label", p.alt || "Open photo " + (i + 1));
      var img = document.createElement("img");
      img.src = p.thumb;
      img.alt = p.alt;
      img.loading = "lazy";
      img.addEventListener("load", function () { img.classList.add("loaded"); });
      if (img.complete) img.classList.add("loaded");
      b.appendChild(img);
      b.addEventListener("click", function () { openLightbox(i); });
      gridEl.appendChild(b);
    });
  }

  async function route() {
    var token = ++renderToken;
    closeLightbox();
    var s = (location.hash.replace(/^#\/?/, "") || "");
    var tab = cfg.tabs.find(function (t) { return slug(t) === s; });

    Array.prototype.forEach.call(tabsEl.children, function (a) {
      a.classList.toggle("active", !!tab && a.dataset.slug === s);
    });
    document.title = tab ? "Verl Adams — " + tab.name : "Verl Adams";
    gridEl.textContent = "";
    statusEl.textContent = "Loading…";

    try {
      var list;
      if (tab) {
        list = await fetchPhotos(tab.handle, cfg.imagesPerPage);
      } else {
        // Home: pool photos from every account, shuffle, take a random 32.
        var results = await Promise.allSettled(cfg.tabs.map(function (t) {
          return fetchPhotos(t.handle, cfg.imagesPerPage);
        }));
        var pool = [];
        results.forEach(function (r) { if (r.status === "fulfilled") pool = pool.concat(r.value); });
        if (!pool.length) throw new Error("No photos could be loaded.");
        list = shuffle(pool).slice(0, cfg.imagesPerPage);
      }
      if (token !== renderToken) return; // user navigated away
      statusEl.textContent = list.length ? "" : "No photos yet.";
      draw(list);
    } catch (e) {
      if (token !== renderToken) return;
      statusEl.textContent = "Couldn’t load photos from Bluesky. Please try again later.";
      console.error(e);
    }
  }

  // ---- lightbox ----
  function show(i) {
    current = (i + photos.length) % photos.length;
    var p = photos[current];
    lbImg.src = p.full;
    lbImg.alt = p.alt;
    lbLink.href = p.href;
  }
  function openLightbox(i) {
    lb.hidden = false;
    document.body.style.overflow = "hidden";
    show(i);
  }
  function closeLightbox() {
    lb.hidden = true;
    lbImg.removeAttribute("src");
    document.body.style.overflow = "";
  }
  lb.querySelector(".lb-close").addEventListener("click", closeLightbox);
  // Name link: go home; close the viewer even when we're already on the home hash.
  lb.querySelector(".lb-name").addEventListener("click", closeLightbox);
  lb.querySelector(".lb-prev").addEventListener("click", function () { show(current - 1); });
  lb.querySelector(".lb-next").addEventListener("click", function () { show(current + 1); });
  // Clicking the empty backdrop closes; clicking the photo follows the link to bsky.app (new tab).
  lb.addEventListener("click", function (e) { if (e.target === lb) closeLightbox(); });
  document.addEventListener("keydown", function (e) {
    if (lb.hidden) return;
    if (e.key === "Escape") closeLightbox();
    else if (e.key === "ArrowLeft") show(current - 1);
    else if (e.key === "ArrowRight") show(current + 1);
  });
  var touchX = null;
  lb.addEventListener("touchstart", function (e) { touchX = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener("touchend", function (e) {
    if (touchX === null) return;
    var dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 50) show(current + (dx < 0 ? 1 : -1));
  });

  window.addEventListener("hashchange", route);
  route();
})();
