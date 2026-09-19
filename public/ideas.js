/* Ideas board — registration, passwordless sign-in, and idea submission.
   No inline script anywhere, so the page keeps a strict script-src 'self' CSP.
   Every view is built with DOM APIs, never innerHTML, so member-supplied text
   can never become markup. */

(function () {
  "use strict";

  var WORD_MIN = 25;
  var WORD_TARGET = 75;
  var WORD_MAX = 100;
  var page = 1;
  var stageLabels = {};

  function loadStages() {
    return api("/api/stages")
      .then(function (result) {
        if (!result.ok || !result.data.stages) return;
        result.data.stages.forEach(function (stage) {
          stageLabels[stage.key] = stage.label;
        });
      })
      .catch(function () {
        /* The badge is an enhancement; the board reads fine without it. */
      });
  }

  function $(id) {
    return document.getElementById(id);
  }

  function show(el, visible) {
    if (el) el.hidden = !visible;
  }

  function notice(message, tone) {
    var el = $("account-notice");
    el.textContent = message || "";
    el.setAttribute("data-tone", tone || "success");
    show(el, Boolean(message));
    if (message) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function clearErrors(scopeId) {
    var node = $(scopeId);
    if (!node) return;
    node.querySelectorAll(".field-error").forEach(function (p) {
      p.textContent = "";
    });
    node.querySelectorAll("[aria-invalid]").forEach(function (input) {
      input.removeAttribute("aria-invalid");
    });
  }

  // Maps the server's { fields: { email: "…" } } onto the matching inputs.
  function applyFieldErrors(fields, prefix, form) {
    if (!fields) return;
    var first = null;
    Object.keys(fields).forEach(function (name) {
      var target = $(prefix + name);
      if (target) target.textContent = fields[name];
      var input = form.querySelector('[name="' + name + '"]');
      if (input) {
        input.setAttribute("aria-invalid", "true");
        if (!first) first = input;
      }
    });
    if (first) first.focus();
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

  // Keeps the label in place and swaps in a spinner, so the button never
  // changes width mid-submit.
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

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  /* Public board ---------------------------------------------------------- */

  function renderBoard(payload) {
    var list = $("board-list");
    var state = $("board-state");
    list.textContent = "";

    show($("board-skeleton"), false);

    if (!payload.ideas.length) {
      show(list, false);
      show($("board-pager"), false);
      state.textContent = "";
      if (page > 1) {
        state.append(el("strong", null, "Nothing further back"), el("p", null, "There are no older ideas on this page."));
      } else {
        state.append(
          el("strong", null, "No ideas published yet"),
          el("p", null, "The board is open. Yours could be the first.")
        );
      }
      show(state, true);
      $("board-status").textContent = "No ideas to show.";
      return;
    }

    payload.ideas.forEach(function (idea) {
      var item = el("li", "idea-card reveal");

      item.append(el("h3", null, idea.title), el("p", null, idea.description));

      if (idea.stage && stageLabels[idea.stage]) {
        var badge = el("span", "stage-badge", stageLabels[idea.stage]);
        badge.setAttribute("data-stage", idea.stage);
        badge.title = "Current stage";
        item.append(badge);
      }

      var meta = el("div", "idea-meta");
      meta.append(
        el("span", "idea-author", idea.author),
        el("span", null, idea.authorTitle),
        el("span", null, formatDate(idea.createdAt))
      );
      item.append(meta);
      list.append(item);
    });

    show(state, false);
    show(list, true);
    show($("board-pager"), payload.hasMore || page > 1);
    $("board-prev").disabled = page <= 1;
    $("board-next").disabled = !payload.hasMore;
    $("board-count").textContent = "Page " + page;
    $("board-status").textContent = payload.ideas.length + " ideas shown.";

    if (typeof window.okaymaReveal === "function") window.okaymaReveal(list);
  }

  function loadBoard() {
    return api("/api/ideas?page=" + page)
      .then(function (result) {
        if (!result.ok) {
          show($("board-skeleton"), false);
          show($("board-list"), false);
          var state = $("board-state");
          state.textContent = "";
          state.append(
            el("strong", null, "The board could not be loaded"),
            el("p", null, "Please refresh the page and try again.")
          );
          show(state, true);
          return;
        }
        renderBoard(result.data);
        if (page === 1) {
          var n = result.data.ideas.length;
          $("stat-published").textContent = result.data.hasMore ? n + "+" : String(n);
        }
      })
      .catch(function () {
        show($("board-skeleton"), false);
      });
  }

  /* Account state --------------------------------------------------------- */

  function showSignedOut(mode) {
    show($("view-post"), false);
    show($("mine-panel"), false);
    show($("view-register"), mode !== "signin");
    show($("view-signin"), mode === "signin");
  }

  function showSignedIn(user) {
    show($("view-register"), false);
    show($("view-signin"), false);
    show($("view-post"), true);
    $("post-greeting").textContent =
      "Welcome back, " + user.firstName + ". Every idea is reviewed before it appears on the board.";
    $("post-email").textContent = user.email;
    loadMine();
  }

  function refreshAccount() {
    return api("/api/me").then(function (result) {
      if (result.ok && result.data.user) {
        showSignedIn(result.data.user);
        return result.data.user;
      }
      showSignedOut("register");
      return null;
    });
  }

  function loadMine() {
    return api("/api/ideas/mine").then(function (result) {
      if (!result.ok) return;
      var list = $("mine-list");
      list.textContent = "";

      if (!result.data.ideas.length) {
        show($("mine-panel"), false);
        return;
      }

      result.data.ideas.forEach(function (idea) {
        var item = el("li", "idea-card");
        item.append(el("h3", null, idea.title));

        var meta = el("div", "idea-meta");
        var tag = el(
          "span",
          "tag",
          idea.status === "approved"
            ? "Published"
            : idea.status === "rejected"
            ? "Not published"
            : "In review"
        );
        tag.setAttribute("data-status", idea.status);

        meta.append(tag, el("span", null, "Submitted " + formatDate(idea.createdAt)));
        item.append(meta);
        list.append(item);
      });

      show($("mine-panel"), true);
    });
  }

  /* Wiring ---------------------------------------------------------------- */

  function wireRegister() {
    var form = $("register-form");
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      clearErrors("view-register");
      notice("");
      busy($("register-submit"), true);

      api("/api/register", { method: "POST", body: formValues(form) })
        .then(function (result) {
          if (result.ok) {
            form.reset();
            notice(result.data.message, "success");
            return;
          }
          applyFieldErrors(result.data.fields, "err-", form);
          notice(result.data.error || "Something went wrong. Please try again.", "error");
        })
        .catch(function () {
          notice("Could not reach the server. Please check your connection.", "error");
        })
        .finally(function () {
          busy($("register-submit"), false);
        });
    });
  }

  function wireSignIn() {
    var form = $("signin-form");
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      clearErrors("view-signin");
      notice("");
      busy($("signin-submit"), true);

      api("/api/login", { method: "POST", body: formValues(form) })
        .then(function (result) {
          if (result.ok) {
            form.reset();
            notice(result.data.message, "success");
            return;
          }
          if (result.data.fields && result.data.fields.email) {
            $("err-signin-email").textContent = result.data.fields.email;
            $("signin-email").setAttribute("aria-invalid", "true");
          }
          notice(result.data.error || "Something went wrong. Please try again.", "error");
        })
        .catch(function () {
          notice("Could not reach the server. Please check your connection.", "error");
        })
        .finally(function () {
          busy($("signin-submit"), false);
        });
    });
  }

  // The bare number never conveyed how close 75 words was. The track fills
  // toward the maximum with a marker at the target, so the writer can aim.
  function updateMeter(words) {
    var state = words < WORD_MIN ? "under" : words > WORD_MAX ? "over" : "ok";
    var pct = Math.min(100, (words / WORD_MAX) * 100);

    $("meter-fill").style.width = pct + "%";
    $("meter-track").setAttribute("data-state", state);

    var counter = $("idea-count");
    counter.textContent = String(words);
    counter.setAttribute("data-state", state);

    $("idea-count-label").textContent =
      state === "under"
        ? "words. At least " + WORD_MIN + " needed, " + WORD_TARGET + " is the sweet spot."
        : state === "over"
        ? "words. That is past the " + WORD_MAX + "-word limit."
        : "words. Comfortably in range.";
  }

  function wireIdeaForm() {
    var form = $("idea-form");
    var description = $("idea-description");

    description.addEventListener("input", function () {
      updateMeter(countWords(description.value));
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      clearErrors("view-post");
      notice("");
      busy($("idea-submit"), true);

      api("/api/ideas", { method: "POST", body: formValues(form) })
        .then(function (result) {
          if (result.ok) {
            form.reset();
            updateMeter(0);
            notice(result.data.message, "success");
            loadMine();
            return;
          }
          if (result.status === 401) {
            notice(result.data.error, "error");
            refreshAccount();
            return;
          }
          applyFieldErrors(result.data.fields, "err-idea-", form);
          notice(result.data.error || "Something went wrong. Please try again.", "error");
        })
        .catch(function () {
          notice("Could not reach the server. Please check your connection.", "error");
        })
        .finally(function () {
          busy($("idea-submit"), false);
        });
    });
  }

  function wireNav() {
    $("to-signin").addEventListener("click", function () {
      notice("");
      clearErrors("view-signin");
      showSignedOut("signin");
      $("signin-email").focus();
    });

    $("to-register").addEventListener("click", function () {
      notice("");
      clearErrors("view-register");
      showSignedOut("register");
      $("reg-first").focus();
    });

    $("sign-out").addEventListener("click", function () {
      api("/api/logout", { method: "POST", body: {} }).then(function () {
        showSignedOut("register");
        notice("You are signed out.", "info");
      });
    });

    $("board-prev").addEventListener("click", function () {
      if (page > 1) {
        page -= 1;
        loadBoard();
        $("board-title").scrollIntoView({ block: "start", behavior: "smooth" });
      }
    });

    $("board-next").addEventListener("click", function () {
      page += 1;
      loadBoard();
      $("board-title").scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }

  // Messages carried back from the emailed links, via /api/verify and /api/auth.
  function handleAuthRedirect() {
    var params = new URLSearchParams(window.location.search);
    var state = params.get("auth");
    if (!state) return;

    if (state === "verified") {
      notice("Your email is confirmed and you are signed in. Share your first idea below.", "success");
    } else if (state === "signed-in") {
      notice("You are signed in.", "success");
    } else if (state === "invalid") {
      notice("That link has expired or has already been used. Please request a new one below.", "error");
    } else if (state === "suspended") {
      notice("That account cannot be used at the moment. Please get in touch.", "error");
    }

    // Drop the parameter so a refresh does not repeat the message.
    window.history.replaceState({}, "", window.location.pathname);
  }

  wireRegister();
  wireSignIn();
  wireIdeaForm();
  wireNav();
  handleAuthRedirect();
  refreshAccount();
  // Labels first, so the first paint already carries badges rather than
  // popping them in a moment later.
  loadStages().then(loadBoard);
})();
