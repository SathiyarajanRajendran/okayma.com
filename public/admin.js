/* Admin console — moderation queue and member management.
   Every view is built with DOM APIs, never innerHTML, so member-supplied text
   can never become markup. */

(function () {
  "use strict";

  var ideaPage = 1;
  var userPage = 1;
  var searchTimer = null;

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

  function notice(message, tone) {
    var box = $("admin-notice");
    box.textContent = message || "";
    box.setAttribute("data-tone", tone || "success");
    show(box, Boolean(message));
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

  function formatDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    return isNaN(d)
      ? "—"
      : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function statusTag(status, label) {
    var tag = el("span", "tag", label || status);
    tag.setAttribute("data-status", status);
    return tag;
  }

  /* Sign-in --------------------------------------------------------------- */

  function wireLogin() {
    var form = $("login-form");
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var box = $("login-notice");
      show(box, false);

      var button = $("login-submit");
      button.disabled = true;
      button.classList.add("is-busy");
      button.setAttribute("aria-busy", "true");

      api("/api/admin/login", {
        method: "POST",
        body: { email: $("login-email").value, password: $("login-password").value },
      })
        .then(function (result) {
          if (result.ok) {
            $("login-password").value = "";
            openConsole();
            return;
          }
          box.textContent = result.data.error || "Sign-in failed.";
          box.setAttribute("data-tone", "error");
          show(box, true);
          $("login-password").focus();
        })
        .catch(function () {
          box.textContent = "Could not reach the server.";
          box.setAttribute("data-tone", "error");
          show(box, true);
        })
        .finally(function () {
          button.disabled = false;
          button.classList.remove("is-busy");
          button.removeAttribute("aria-busy");
        });
    });

    $("admin-signout").addEventListener("click", function () {
      api("/api/admin/logout", { method: "POST", body: {} }).then(function () {
        show($("console"), false);
        show($("login-shell"), true);
        $("login-email").focus();
      });
    });
  }

  // A 401 anywhere means the session lapsed; drop back to the sign-in screen.
  function guard(result) {
    if (result.status === 401) {
      show($("console"), false);
      show($("login-shell"), true);
      return false;
    }
    return result.ok;
  }

  /* Stats ----------------------------------------------------------------- */

  function loadStats() {
    return api("/api/admin/stats").then(function (result) {
      if (!guard(result)) return;
      var grid = $("stats");
      grid.textContent = "";

      // The accent stripe draws the eye to the queue that needs working.
      [
        ["Awaiting review", result.data.ideas.pending, "attention"],
        ["Published ideas", result.data.ideas.approved, "good"],
        ["Active members", result.data.users.active, "good"],
        ["Unconfirmed", result.data.users.pending, null],
        ["Suspended", result.data.users.suspended, "warn"],
      ].forEach(function (row) {
        var card = el("div", "stat");
        // Zero needs no accent: an empty queue is not something to flag.
        if (row[2] && row[1] > 0) card.setAttribute("data-accent", row[2]);
        card.append(el("strong", null, String(row[1])), el("span", null, row[0]));
        grid.append(card);
      });
    });
  }

  /* Ideas ----------------------------------------------------------------- */

  function decide(id, status, notify) {
    return api("/api/admin/ideas/" + encodeURIComponent(id), {
      method: "PATCH",
      body: { status: status, notify: notify },
    }).then(function (result) {
      if (!guard(result)) {
        notice(result.data.error || "That change did not save.", "error");
        return;
      }
      notice(
        status === "approved"
          ? "Published." + (result.data.notified ? " The author has been emailed." : "")
          : status === "rejected"
          ? "Marked as not published." + (result.data.notified ? " The author has been emailed." : "")
          : "Moved back to the review queue.",
        "success"
      );
      loadIdeas();
      loadStats();
    });
  }

  function removeIdea(id, title) {
    if (!window.confirm('Permanently delete "' + title + '"? This cannot be undone.')) return;
    api("/api/admin/ideas/" + encodeURIComponent(id), { method: "DELETE" }).then(function (result) {
      if (!guard(result)) {
        notice(result.data.error || "That idea could not be deleted.", "error");
        return;
      }
      notice("Idea deleted.", "info");
      loadIdeas();
      loadStats();
    });
  }

  function renderIdeas(payload) {
    var wrap = $("idea-results");
    wrap.textContent = "";

    $("idea-count").textContent = payload.total
      ? payload.total + (payload.total === 1 ? " idea" : " ideas") + " found"
      : "";

    if (!payload.ideas.length) {
      var blank = el("div", "empty");
      blank.append(
        el("strong", null, "Nothing to review"),
        el("p", null, "No ideas match these filters.")
      );
      wrap.append(blank);
      show($("idea-pager"), false);
      return;
    }

    payload.ideas.forEach(function (idea) {
      var card = el("div", "admin-idea");
      card.append(el("h3", null, idea.title));

      var meta = el("div", "idea-meta flush");
      meta.append(
        statusTag(
          idea.status,
          idea.status === "approved"
            ? "Published"
            : idea.status === "rejected"
            ? "Not published"
            : "Awaiting review"
        ),
        el("span", "idea-author", idea.author.name),
        el("span", null, idea.author.title),
        el("span", null, idea.author.email),
        el("span", null, formatDate(idea.createdAt))
      );
      card.append(meta);
      card.append(el("p", "body", idea.description));

      var actions = el("div", "stack");

      if (idea.status !== "approved") {
        var approve = el("button", "button primary small", "Publish");
        approve.type = "button";
        approve.addEventListener("click", function () {
          decide(idea.id, "approved", true);
        });
        actions.append(approve);
      }

      if (idea.status !== "rejected") {
        var reject = el("button", "button quiet small", "Do not publish");
        reject.type = "button";
        reject.addEventListener("click", function () {
          decide(idea.id, "rejected", true);
        });
        actions.append(reject);
      }

      if (idea.status !== "pending") {
        var reopen = el("button", "button quiet small", "Back to review");
        reopen.type = "button";
        reopen.addEventListener("click", function () {
          decide(idea.id, "pending", false);
        });
        actions.append(reopen);
      }

      var del = el("button", "button quiet small", "Delete");
      del.type = "button";
      del.addEventListener("click", function () {
        removeIdea(idea.id, idea.title);
      });
      actions.append(del);

      card.append(actions);
      wrap.append(card);
    });

    show($("idea-pager"), payload.hasMore || payload.page > 1);
    $("idea-prev").disabled = payload.page <= 1;
    $("idea-next").disabled = !payload.hasMore;
  }

  function loadIdeas() {
    var query = new URLSearchParams({
      q: $("idea-search").value,
      status: $("idea-status").value,
      page: String(ideaPage),
    });
    return api("/api/admin/ideas?" + query).then(function (result) {
      if (!guard(result)) return;
      renderIdeas(result.data);
    });
  }

  /* Members --------------------------------------------------------------- */

  function setUserStatus(id, status, name) {
    if (
      status === "suspended" &&
      !window.confirm("Suspend " + name + "? They are signed out immediately and cannot post.")
    ) {
      return;
    }
    api("/api/admin/users/" + encodeURIComponent(id), {
      method: "PATCH",
      body: { status: status },
    }).then(function (result) {
      if (!guard(result)) {
        notice(result.data.error || "That change did not save.", "error");
        return;
      }
      notice(status === "suspended" ? name + " is suspended." : name + " is active.", "success");
      loadUsers();
      loadStats();
    });
  }

  function removeUser(id, name) {
    if (
      !window.confirm(
        "Permanently delete " + name + " and every idea they posted? This cannot be undone."
      )
    ) {
      return;
    }
    api("/api/admin/users/" + encodeURIComponent(id), { method: "DELETE" }).then(function (result) {
      if (!guard(result)) {
        notice(result.data.error || "That member could not be deleted.", "error");
        return;
      }
      notice(name + " has been deleted.", "info");
      loadUsers();
      loadStats();
      loadIdeas();
    });
  }

  function renderUsers(payload) {
    var body = $("user-rows");
    body.textContent = "";

    $("user-count").textContent = payload.total
      ? payload.total + (payload.total === 1 ? " member" : " members") + " found"
      : "";

    if (!payload.users.length) {
      var row = el("tr");
      var cell = el("td", "muted", "No members match these filters.");
      cell.colSpan = 6;
      row.append(cell);
      body.append(row);
      show($("user-pager"), false);
      return;
    }

    payload.users.forEach(function (user) {
      var name = user.firstName + " " + user.lastName;
      var row = el("tr");

      var who = el("td");
      who.append(el("strong", null, name), el("div", "muted", user.title));
      row.append(who);

      var contact = el("td");
      contact.append(el("div", null, user.email), el("div", "muted nowrap", user.phone));
      row.append(contact);

      var status = el("td");
      status.append(
        statusTag(
          user.status,
          user.status === "active"
            ? "Active"
            : user.status === "suspended"
            ? "Suspended"
            : "Unconfirmed"
        )
      );
      row.append(status);

      row.append(el("td", "nowrap", user.approvedCount + " of " + user.ideaCount + " live"));
      row.append(el("td", "nowrap", formatDate(user.createdAt)));

      var actions = el("td");
      var stack = el("div", "stack");

      if (user.status === "suspended") {
        var restore = el("button", "button quiet small", "Reactivate");
        restore.type = "button";
        restore.addEventListener("click", function () {
          setUserStatus(user.id, "active", name);
        });
        stack.append(restore);
      } else if (user.status === "active") {
        var suspend = el("button", "button quiet small", "Suspend");
        suspend.type = "button";
        suspend.addEventListener("click", function () {
          setUserStatus(user.id, "suspended", name);
        });
        stack.append(suspend);
      }

      var del = el("button", "button quiet small", "Delete");
      del.type = "button";
      del.addEventListener("click", function () {
        removeUser(user.id, name);
      });
      stack.append(del);

      actions.append(stack);
      row.append(actions);
      body.append(row);
    });

    show($("user-pager"), payload.hasMore || payload.page > 1);
    $("user-prev").disabled = payload.page <= 1;
    $("user-next").disabled = !payload.hasMore;
  }

  function loadUsers() {
    var query = new URLSearchParams({
      q: $("user-search").value,
      status: $("user-status").value,
      sort: $("user-sort").value,
      page: String(userPage),
    });
    return api("/api/admin/users?" + query).then(function (result) {
      if (!guard(result)) return;
      renderUsers(result.data);
    });
  }

  /* Wiring ---------------------------------------------------------------- */

  function debounce(fn) {
    return function () {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(fn, 250);
    };
  }

  function selectTab(which) {
    var ideas = which === "ideas";
    $("tab-ideas").setAttribute("aria-selected", String(ideas));
    $("tab-users").setAttribute("aria-selected", String(!ideas));
    show($("panel-ideas"), ideas);
    show($("panel-users"), !ideas);
    notice("");
    if (ideas) loadIdeas();
    else loadUsers();
  }

  function wireConsole() {
    $("tab-ideas").addEventListener("click", function () {
      selectTab("ideas");
    });
    $("tab-users").addEventListener("click", function () {
      selectTab("users");
    });

    $("idea-search").addEventListener(
      "input",
      debounce(function () {
        ideaPage = 1;
        loadIdeas();
      })
    );
    $("idea-status").addEventListener("change", function () {
      ideaPage = 1;
      loadIdeas();
    });
    $("idea-prev").addEventListener("click", function () {
      if (ideaPage > 1) {
        ideaPage -= 1;
        loadIdeas();
      }
    });
    $("idea-next").addEventListener("click", function () {
      ideaPage += 1;
      loadIdeas();
    });

    $("user-search").addEventListener(
      "input",
      debounce(function () {
        userPage = 1;
        loadUsers();
      })
    );
    ["user-status", "user-sort"].forEach(function (id) {
      $(id).addEventListener("change", function () {
        userPage = 1;
        loadUsers();
      });
    });
    $("user-prev").addEventListener("click", function () {
      if (userPage > 1) {
        userPage -= 1;
        loadUsers();
      }
    });
    $("user-next").addEventListener("click", function () {
      userPage += 1;
      loadUsers();
    });
  }

  function openConsole() {
    show($("login-shell"), false);
    show($("console"), true);
    loadStats();
    selectTab("ideas");
  }

  // Ask the server whether the admin cookie is still good before showing
  // anything; the console never renders on client-side trust alone.
  api("/api/admin/session").then(function (result) {
    if (result.ok && result.data.admin) openConsole();
    else {
      show($("login-shell"), true);
      $("login-email").focus();
    }
  });

  wireLogin();
  wireConsole();
})();
