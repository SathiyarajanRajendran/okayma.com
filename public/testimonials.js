/* Testimonials — the published wall, and the submission form beneath it.
   No inline script, so the page keeps a strict script-src 'self' CSP, and
   every view is built with DOM APIs rather than innerHTML so a submitter's
   words can never become markup. */

(function () {
  "use strict";

  var WORD_MIN = 30;
  var WORD_MAX = 400;
  var page = 1;

  function $(id) {
    return document.getElementById(id);
  }

  function show(el, visible) {
    if (el) el.hidden = !visible;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function api(path, options) {
    var settings = options || {};
    return fetch(path, {
      method: settings.method || "GET",
      headers: settings.body ? { "Content-Type": "application/json" } : undefined,
      body: settings.body ? JSON.stringify(settings.body) : undefined,
      credentials: "same-origin",
    }).then(function (response) {
      return response
        .json()
        .catch(function () {
          return {};
        })
        .then(function (data) {
          return { ok: response.ok, status: response.status, data: data };
        });
    });
  }

  function busy(button, isBusy) {
    if (!button) return;
    button.disabled = isBusy;
    button.classList.toggle("is-busy", isBusy);
    if (isBusy) button.setAttribute("aria-busy", "true");
    else button.removeAttribute("aria-busy");
  }

  function formValues(form) {
    var out = {};
    new FormData(form).forEach(function (value, key) {
      out[key] = typeof value === "string" ? value : "";
    });
    return out;
  }

  function formatDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    return isNaN(d)
      ? ""
      : d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  }

  function countWords(text) {
    var trimmed = String(text || "").trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }

  function notice(el_, message, tone) {
    if (!el_) return;
    el_.textContent = message || "";
    el_.setAttribute("data-tone", tone || "success");
    show(el_, Boolean(message));
  }

  function clearErrors(form) {
    form.querySelectorAll(".field-error").forEach(function (p) {
      p.textContent = "";
    });
    form.querySelectorAll("[aria-invalid]").forEach(function (input) {
      input.removeAttribute("aria-invalid");
    });
  }

  function applyFieldErrors(fields, form) {
    if (!fields) return;
    var first = null;
    Object.keys(fields).forEach(function (name) {
      var target = $("err-t-" + name);
      if (target) target.textContent = fields[name];
      var input = form.querySelector('[name="' + name + '"]');
      if (input) {
        input.setAttribute("aria-invalid", "true");
        if (!first) first = input;
      }
    });
    if (first) first.focus();
  }

  /* The wall ------------------------------------------------------------- */

  function renderWall(payload) {
    var list = $("wall-list");
    var state = $("wall-state");
    list.textContent = "";
    show($("wall-skeleton"), false);

    if (!payload.testimonials.length) {
      show(list, false);
      show($("wall-pager"), page > 1);
      state.textContent = "";
      state.append(
        el("strong", null, page > 1 ? "Nothing further back" : "No testimonials yet"),
        el(
          "p",
          null,
          page > 1
            ? "There are no older testimonials on this page."
            : "The first one could be yours — the form is just below."
        )
      );
      show(state, true);
      $("wall-status").textContent = "No testimonials to show.";
      return;
    }

    payload.testimonials.forEach(function (t) {
      var article = el("article", "testimonial reveal");

      var meta = el("div", "testimonial-meta");
      meta.append(el("p", "testimonial-name", t.name));
      if (t.role) meta.append(el("p", "testimonial-role", t.role));
      if (t.organisation) meta.append(el("p", "testimonial-org", t.organisation));
      if (t.relationship) meta.append(el("p", "testimonial-context", t.relationship));

      if (t.publishedAt) {
        var dateP = el("p", "testimonial-date");
        var time = el("time", null, formatDate(t.publishedAt));
        time.setAttribute("datetime", t.publishedAt);
        dateP.append(time);
        meta.append(dateP);
      }

      var quote = el("blockquote", "testimonial-body");
      // Paragraphs survive as paragraphs; the text itself is set via
      // textContent, so nothing a submitter writes is ever parsed as HTML.
      String(t.body)
        .split(/\n{2,}/)
        .forEach(function (para) {
          if (para.trim()) quote.append(el("p", null, para.trim()));
        });

      article.append(meta, quote);
      list.append(article);
    });

    show(state, false);
    show(list, true);
    show($("wall-pager"), payload.hasMore || page > 1);
    $("wall-prev").disabled = page <= 1;
    $("wall-next").disabled = !payload.hasMore;
    $("wall-count").textContent = "Page " + page;
    $("wall-status").textContent = payload.testimonials.length + " testimonials shown.";

    if (typeof window.okaymaReveal === "function") window.okaymaReveal(list);
  }

  function loadWall() {
    return api("/api/testimonials?page=" + page).then(function (result) {
      show($("wall-skeleton"), false);
      if (!result.ok) {
        var state = $("wall-state");
        state.textContent = "";
        state.append(
          el("strong", null, "Could not load testimonials"),
          el("p", null, "Please refresh the page and try again.")
        );
        show(state, true);
        return;
      }
      renderWall(result.data);

      // Only meaningful on the first page; beyond that the count would be
      // the page size rather than the total.
      if (page === 1) {
        var n = result.data.testimonials.length;
        $("stat-testimonials").textContent = result.data.hasMore ? n + "+" : String(n);
      }
    });
  }

  function wirePager() {
    $("wall-prev").addEventListener("click", function () {
      if (page > 1) {
        page -= 1;
        loadWall();
        $("wall-list").scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
    $("wall-next").addEventListener("click", function () {
      page += 1;
      loadWall();
      $("wall-list").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  /* Confirmation redirects ------------------------------------------------ */

  var CONFIRM_MESSAGES = {
    ok: [
      "Thank you — your testimonial is confirmed and now with Sathiya for review. You will hear when it is published.",
      "success",
    ],
    already: ["That testimonial was already confirmed. Nothing more to do.", "success"],
    expired: [
      "That confirmation link has expired. Links last 24 hours — please submit the form again below.",
      "error",
    ],
    invalid: [
      "That confirmation link is not valid. Please submit the form again below.",
      "error",
    ],
  };

  function handleConfirmRedirect() {
    var params = new URLSearchParams(window.location.search);
    var key = params.get("confirm");
    if (!key || !CONFIRM_MESSAGES[key]) return;

    var entry = CONFIRM_MESSAGES[key];
    notice($("confirm-notice"), entry[0], entry[1]);

    // Drop the parameter so a refresh does not replay the message.
    var url = new URL(window.location.href);
    url.searchParams.delete("confirm");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);

    $("confirm-notice").scrollIntoView({ block: "center", behavior: "smooth" });
  }

  /* Submission ------------------------------------------------------------ */

  function wireCounter() {
    var field = $("t-body");
    var counter = $("t-words");
    var label = $("t-words-label");
    if (!field) return;

    field.addEventListener("input", function () {
      var words = countWords(field.value);
      counter.textContent = String(words);
      if (words === 0) label.textContent = "At least " + WORD_MIN + " words.";
      else if (words < WORD_MIN) label.textContent = WORD_MIN - words + " more to go.";
      else if (words > WORD_MAX) label.textContent = words - WORD_MAX + " over the limit.";
      else label.textContent = "Good length.";
      counter.parentNode.classList.toggle("is-over", words > WORD_MAX);
    });
  }

  function wireForm() {
    var form = $("write-form");
    if (!form) return;

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      clearErrors(form);
      notice($("write-notice"), "");

      var button = $("write-submit");
      busy(button, true);

      api("/api/testimonials", { method: "POST", body: formValues(form) })
        .then(function (result) {
          if (result.ok) {
            form.reset();
            $("t-words").textContent = "0";
            $("t-words-label").textContent = "At least " + WORD_MIN + " words.";
            notice(
              $("write-notice"),
              result.data.message ||
                "Thank you. Check your inbox for the confirmation link.",
              "success"
            );
            return;
          }
          if (result.data.fields) applyFieldErrors(result.data.fields, form);
          notice(
            $("write-notice"),
            result.data.error || "Something went wrong. Please try again.",
            "error"
          );
        })
        .catch(function () {
          notice($("write-notice"), "Network error. Please try again.", "error");
        })
        .finally(function () {
          busy(button, false);
        });
    });
  }

  handleConfirmRedirect();
  wirePager();
  wireCounter();
  wireForm();
  loadWall();
})();
