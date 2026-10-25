(function () {
  var cfg = window.SITE;
  var tabsEl = document.getElementById("tabs");
  var gridEl = document.getElementById("grid");
  var statusEl = document.getElementById("status");
  var lb = document.getElementById("lightbox");
  var lbImg = document.getElementById("lb-img");
  var lbPhoto = document.getElementById("lb-photo");

  var photos = [];   // photos on the current page
  var current = 0;   // index shown in lightbox
  var renderToken = 0;

  function slug(tab) { return tab.handle.split(".")[0]; }

  // ---- fixed header: keep the photos just below it, whatever height the tabs make it ----
  var pageHeader = document.querySelector("body > header");
  function syncHeader() { document.documentElement.style.setProperty("--head-h", pageHeader.offsetHeight + "px"); }
  if (window.ResizeObserver) new ResizeObserver(syncHeader).observe(pageHeader);
  window.addEventListener("resize", syncHeader);
  window.addEventListener("load", syncHeader);

  // ---- tabs ----
  var lbTabsEl = document.getElementById("lb-tabs"); // the viewer carries the same tabs
  // Tabs are grouped into two rows of equal size (first half / second half). On wide screens the
  // rows dissolve into one line; on narrow screens (see style.css) they stack as two rows.
  var perRow = Math.ceil(cfg.tabs.length / 2);
  [tabsEl, lbTabsEl].forEach(function (nav) {
    var row;
    cfg.tabs.forEach(function (t, i) {
      if (i % perRow === 0) {
        row = document.createElement("div");
        row.className = "tab-row";
        nav.appendChild(row);
      }
      var a = document.createElement("a");
      a.href = "#/" + slug(t);
      a.textContent = t.name;
      a.dataset.slug = slug(t);
      row.appendChild(a);
    });
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
        "&filter=posts_no_replies&limit=100" + (cursor ? "&cursor=" + encodeURIComponent(cursor) : "");
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
            href: postUrl(post.author.handle, post.uri),
            handle: post.author.handle,
            date: (post.record && post.record.createdAt) || post.indexedAt || "",
            likes: typeof post.likeCount === "number" ? post.likeCount : null,
            reposts: typeof post.repostCount === "number" ? post.repostCount : null,
            text: (post.record && post.record.text) || "",
            facets: (post.record && post.record.facets) || []
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

    [tabsEl, lbTabsEl].forEach(function (nav) {
      Array.prototype.forEach.call(nav.querySelectorAll("a"), function (a) {
        a.classList.toggle("active", !!tab && a.dataset.slug === s);
      });
    });
    document.title = tab ? "Verl Adams — " + tab.name : "Verl Adams";
    gridEl.textContent = "";
    statusEl.textContent = "Loading…";

    try {
      var list;
      if (tab) {
        // Draw from the account's recent photos and show a random selection.
        list = shuffle(await fetchPhotos(tab.handle, cfg.poolSize)).slice(0, cfg.imagesPerPage);
      } else {
        // Home: pool photos from every account, shuffle, take a random 32.
        var results = await Promise.allSettled(cfg.tabs.map(function (t) {
          return fetchPhotos(t.handle, cfg.poolSize);
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
  var lbFig = document.getElementById("lb-fig");
  var lbCap = document.getElementById("lb-cap");

  var TAG_RE = /#[\p{L}][\p{L}\p{N}_]*/gu;
  // "(🚫AI)" marks a photo as not AI-generated; dropping only the emoji would flip its meaning, so remove the whole note.
  var NO_AI_RE = /\(?\s*\u{1F6AB}\uFE0F?\s*AI(?![\p{L}\p{N}])\s*\)?/giu;
  // Emoji (and the joiners/modifiers that go with them); (c) (R) and TM are kept.
  var EMOJI_RE = /(?![\u00a9\u00ae\u2122])\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|[\ufe0e\ufe0f\u200d\u20e3]/gu;

  // Caption text: emoji removed; hashtags at the very end removed; hashtags inside the
  // sentence keep their word but lose the "#". Links in the text stay clickable.
  function captionNodes(text, facets) {
    var bytes = new TextEncoder().encode(text), dec = new TextDecoder();
    var segs = [];
    function addText(s) {
      var last = 0, m;
      TAG_RE.lastIndex = 0;
      while ((m = TAG_RE.exec(s))) { // hashtags posted without a facet
        if (m.index > last) segs.push({ t: "text", s: s.slice(last, m.index) });
        segs.push({ t: "tag", s: m[0] });
        last = m.index + m[0].length;
      }
      if (last < s.length) segs.push({ t: "text", s: s.slice(last) });
    }
    var pos = 0;
    facets.slice().sort(function (x, y) { return x.index.byteStart - y.index.byteStart; }).forEach(function (f) {
      if (f.index.byteStart < pos) return;
      addText(dec.decode(bytes.slice(pos, f.index.byteStart)));
      var piece = dec.decode(bytes.slice(f.index.byteStart, f.index.byteEnd));
      var feat = (f.features || [])[0] || {};
      if (feat.$type === "app.bsky.richtext.facet#link") segs.push({ t: "link", s: piece, href: feat.uri });
      else if (feat.$type === "app.bsky.richtext.facet#mention") segs.push({ t: "link", s: piece, href: "https://bsky.app/profile/" + feat.did });
      else if (feat.$type === "app.bsky.richtext.facet#tag") segs.push({ t: "tag", s: piece });
      else addText(piece);
      pos = f.index.byteEnd;
    });
    addText(dec.decode(bytes.slice(pos)));

    // Drop the trailing run of hashtags (and the blank space around them).
    while (segs.length && (segs[segs.length - 1].t === "tag" || (segs[segs.length - 1].t === "text" && !segs[segs.length - 1].s.trim()))) segs.pop();
    // Remaining hashtags are mid-sentence: keep the word, lose the "#".
    var merged = [];
    segs.forEach(function (g) {
      if (g.t === "tag") g = { t: "text", s: g.s.replace(/^#/, "") };
      var last = merged[merged.length - 1];
      if (g.t === "text" && last && last.t === "text") last.s += g.s; else merged.push(g);
    });

    var frag = document.createDocumentFragment();
    merged.forEach(function (g, i) {
      if (g.t === "link") {
        var a = document.createElement("a");
        a.href = g.href; a.textContent = g.s; a.target = "_blank"; a.rel = "noopener noreferrer";
        frag.appendChild(a);
        return;
      }
      var s = g.s.replace(NO_AI_RE, " ").replace(EMOJI_RE, "").replace(/\(\s*\)/g, "").replace(/\s+/g, " ");
      if (i === 0) s = s.replace(/^\s+/, "");
      if (i === merged.length - 1) s = s.replace(/\s+$/, "");
      if (s) frag.appendChild(document.createTextNode(s));
    });
    return frag;
  }

  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  }

  function sepEl() { var s = document.createElement("span"); s.className = "sep"; s.textContent = "\u00b7"; return s; }
  function linkEl(label, href) {
    var a = document.createElement("a");
    a.href = href; a.textContent = label; a.target = "_blank"; a.rel = "noopener noreferrer";
    return a;
  }

  // Heart and repost icons, as used on Bluesky (Material Design icons, Apache 2.0), followed by the count.
  var HEART = "M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z";
  var REPOST = "M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z";
  var compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
  function statEl(path, n, noun) {
    var s = document.createElement("span");
    s.className = "stat";
    s.title = n.toLocaleString("en-US") + " " + noun + (n === 1 ? "" : "s");
    s.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="' + path + '"/></svg>';
    s.appendChild(document.createTextNode(compact.format(n)));
    return s;
  }

  function buildCaption(p) {
    lbCap.textContent = "";
    var when = formatDate(p.date);
    if (when) {
      var d = document.createElement("div");
      d.className = "lb-date";
      d.appendChild(document.createTextNode("Posted: " + when));
      if (p.likes !== null) d.appendChild(statEl(HEART, p.likes, "like"));
      if (p.reposts !== null) d.appendChild(statEl(REPOST, p.reposts, "repost"));
      lbCap.appendChild(d);
    }
    var body = document.createElement("div");
    body.appendChild(captionNodes(p.text, p.facets));
    var first = body.firstChild, last = body.lastChild;
    if (first && first.nodeType === 3) first.nodeValue = first.nodeValue.replace(/^\s+/, "");
    if (last && last.nodeType === 3) last.nodeValue = last.nodeValue.replace(/\s+$/, "");
    if (body.firstChild) body.appendChild(document.createTextNode(" "));
    body.appendChild(linkEl("@" + p.handle, "https://bsky.app/profile/" + p.handle));
    body.appendChild(sepEl());
    body.appendChild(linkEl("View post", p.href));
    lbCap.appendChild(body);
  }

  var photoMid = 0, keepScroll = null;
  function placeArrows() {
    var sc = document.getElementById("lb-scroll");
    var y = Math.max(70, Math.min(photoMid - sc.scrollTop, sc.clientHeight - 70));
    document.getElementById("lb-stage").style.setProperty("--arrow-y", y + "px");
  }
  document.getElementById("lb-scroll").addEventListener("scroll", placeArrows, { passive: true });

  // Size the photo to fit the window, and make the caption exactly as wide as the photo.
  // Only the "Posted:" line is kept on screen with the photo; the caption text below it is
  // reached by scrolling, so the photo never has to shrink to make room for it.
  function fit() {
    if (lb.hidden || !lbImg.naturalWidth) return;
    var stage = document.getElementById("lb-stage");
    var scroller = document.getElementById("lb-scroll");
    var cs = getComputedStyle(scroller);
    var availW = scroller.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var headH = scroller.querySelector("header").offsetHeight;
    var availH = scroller.clientHeight - headH - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    var nw = lbImg.naturalWidth, nh = lbImg.naturalHeight;
    var ccs = getComputedStyle(lbCap);
    var capGap = parseFloat(ccs.marginTop);
    var line = parseFloat(ccs.lineHeight) || parseFloat(ccs.fontSize) * 1.7;
    var dateEl = lbCap.querySelector(".lb-date");
    var reserve = dateEl ? dateEl.offsetHeight : line;
    // Fit the window, but never below the minimum height (width still wins on narrow screens);
    // a photo taller than the window is reached by scrolling.
    var fitH = (availH - capGap - reserve) / nh;
    var s = Math.min(availW / nw, Math.max(fitH, cfg.minPhotoHeight / nh), 1);
    var w = Math.floor(nw * s), h = Math.floor(nh * s);
    lbFig.style.width = w + "px";
    lbImg.style.width = w + "px";
    lbImg.style.height = h + "px";
    // The photo stays pinned just under the header so a narrower window shrinks it upward;
    // the arrows sit at the photo's vertical midpoint.
    lbFig.style.marginTop = "0";
    // The arrows follow the photo's midpoint as the page scrolls, staying within view.
    photoMid = headH + parseFloat(cs.paddingTop) + h / 2;
    if (keepScroll !== null) { scroller.scrollTop = keepScroll; keepScroll = null; } // same scroll position on the next photo
    placeArrows();
    lbFig.style.visibility = "visible";
  }
  lbImg.addEventListener("load", fit);
  window.addEventListener("resize", fit);

  function show(i) {
    current = (i + photos.length) % photos.length;
    var p = photos[current];
    lbFig.style.visibility = "hidden";
    keepScroll = document.getElementById("lb-scroll").scrollTop; // restored once the new photo is sized
    buildCaption(p);
    lbImg.alt = p.alt;
    if (lbImg.getAttribute("src") === p.full && lbImg.complete && lbImg.naturalWidth) fit();
    else lbImg.src = p.full;
  }
  function openLightbox(i) {
    lb.hidden = false;
    document.body.style.overflow = "hidden";
    document.getElementById("lb-scroll").scrollTop = 0; // a fresh viewer always starts at the top
    show(i);
  }
  function closeLightbox() {
    lb.hidden = true;
    lbImg.removeAttribute("src");
    document.body.style.overflow = "";
  }
  lbPhoto.addEventListener("click", function () { show(current + 1); });
  lb.querySelector(".lb-close").addEventListener("click", closeLightbox);
  // Name link: go home; close the viewer even when we're already on the home hash.
  lb.querySelector("header").addEventListener("click", function (e) { if (e.target.closest("a")) closeLightbox(); });
  lb.querySelector(".lb-prev").addEventListener("click", function () { show(current - 1); });
  lb.querySelector(".lb-next").addEventListener("click", function () { show(current + 1); });
  // Clicking the empty backdrop closes; clicking the photo follows the link to bsky.app (new tab).
  lb.addEventListener("click", function (e) { if (e.target === lb || e.target.id === "lb-stage" || e.target.id === "lb-scroll") closeLightbox(); });
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
