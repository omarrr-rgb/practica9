(() => {
  "use strict";

  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || "";
  const form = document.getElementById("newsForm");
  const status = document.getElementById("status");
  const list = document.getElementById("adminNews");
  const cancelEdit = document.getElementById("cancelEdit");
  const submitButton = document.getElementById("submitButton");
  const formTitle = document.getElementById("formTitle");
  const fields = {
    id: document.getElementById("newsId"),
    title: document.getElementById("title"),
    summary: document.getElementById("summary"),
    severity: document.getElementById("severity"),
    source: document.getElementById("source"),
    date: document.getElementById("date"),
    url: document.getElementById("url"),
    tags: document.getElementById("tags")
  };

  let newsById = new Map();

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle("status-error", isError);
  }

  async function apiRequest(url, options = {}) {
    const headers = { Accept: "application/json", ...(options.headers || {}) };
    if (options.body) headers["Content-Type"] = "application/json";
    if (options.method && options.method !== "GET") headers["X-CSRF-Token"] = csrf;

    const response = await fetch(url, { ...options, headers, credentials: "same-origin" });
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      const details = payload?.errors?.join("; ") || payload?.error || `HTTP ${response.status}`;
      throw new Error(details);
    }
    return payload;
  }

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function renderNews(items) {
    newsById = new Map(items.map(item => [String(item.id), item]));
    list.replaceChildren();

    if (!items.length) {
      list.append(makeElement("p", "empty", "No hay noticias registradas."));
      return;
    }

    items.forEach(item => {
      const article = makeElement("article", "card admin-card");
      const top = makeElement("div", "card-top");
      top.append(
        makeElement("span", `sev sev-${item.severity}`, item.severity.toUpperCase()),
        makeElement("span", "date", item.date)
      );

      const title = makeElement("h3", "card-title", item.title);
      const summary = makeElement("p", "card-summary", item.summary);
      const metadata = makeElement("p", "hint", `Fuente: ${item.source} · Tags: ${item.tags.join(", ")}`);
      const actions = makeElement("div", "actions");

      const edit = makeElement("button", "btn btn-secondary", "Editar");
      edit.type = "button";
      edit.dataset.action = "edit";
      edit.dataset.id = String(item.id);

      const remove = makeElement("button", "btn btn-danger", "Eliminar");
      remove.type = "button";
      remove.dataset.action = "delete";
      remove.dataset.id = String(item.id);

      actions.append(edit, remove);
      article.append(top, title, summary, metadata, actions);
      list.append(article);
    });
  }

  async function loadNews() {
    try {
      setStatus("Cargando...");
      const payload = await apiRequest("/api/news");
      renderNews(payload.data);
      setStatus(`${payload.count} noticia(s) cargada(s).`);
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  function resetForm() {
    form.reset();
    fields.id.value = "";
    formTitle.textContent = "Crear noticia";
    submitButton.textContent = "Crear noticia";
    cancelEdit.hidden = true;
  }

  function beginEdit(item) {
    fields.id.value = item.id;
    fields.title.value = item.title;
    fields.summary.value = item.summary;
    fields.severity.value = item.severity;
    fields.source.value = item.source;
    fields.date.value = item.date;
    fields.url.value = item.url;
    fields.tags.value = item.tags.join(", ");
    formTitle.textContent = `Editar noticia #${item.id}`;
    submitButton.textContent = "Guardar cambios";
    cancelEdit.hidden = false;
    fields.title.focus();
  }

  function formPayload() {
    return {
      title: fields.title.value,
      summary: fields.summary.value,
      severity: fields.severity.value,
      source: fields.source.value,
      date: fields.date.value,
      url: fields.url.value,
      tags: fields.tags.value
    };
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const id = fields.id.value;
    const method = id ? "PATCH" : "POST";
    const endpoint = id ? `/api/news/${encodeURIComponent(id)}` : "/api/news";

    try {
      setStatus(id ? "Actualizando..." : "Creando...");
      await apiRequest(endpoint, { method, body: JSON.stringify(formPayload()) });
      resetForm();
      await loadNews();
      setStatus(id ? "Noticia actualizada." : "Noticia creada.");
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  list.addEventListener("click", async event => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const item = newsById.get(button.dataset.id);
    if (!item) return;

    if (button.dataset.action === "edit") {
      beginEdit(item);
      return;
    }

    if (button.dataset.action === "delete") {
      if (!window.confirm(`¿Eliminar "${item.title}"?`)) return;
      try {
        setStatus("Eliminando...");
        await apiRequest(`/api/news/${encodeURIComponent(item.id)}`, { method: "DELETE" });
        if (fields.id.value === String(item.id)) resetForm();
        await loadNews();
        setStatus("Noticia eliminada.");
      } catch (error) {
        setStatus(error.message, true);
      }
    }
  });

  cancelEdit.addEventListener("click", resetForm);
  document.getElementById("refreshNews").addEventListener("click", loadNews);
  loadNews();
})();
