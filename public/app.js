function normalize(s){ return (s || "").toLowerCase().trim(); }

function applyFilters() {
  const q = normalize(document.getElementById("q").value);
  const sev = normalize(document.getElementById("sev").value);
  const tag = normalize(document.getElementById("tag").value);

  const cards = Array.from(document.querySelectorAll(".card"));
  let visible = 0;

  cards.forEach(card => {
    const title = normalize(card.dataset.title);
    const summary = normalize(card.dataset.summary);
    const severity = normalize(card.dataset.severity);
    const tags = normalize(card.dataset.tags);

    const matchQ = !q || title.includes(q) || summary.includes(q) || tags.includes(q);
    const matchSev = !sev || severity === sev;
    const matchTag = !tag || tags.split(",").map(x => x.trim()).includes(tag);

    const ok = matchQ && matchSev && matchTag;
    card.style.display = ok ? "" : "none";
    if (ok) visible++;
  });

  document.getElementById("count").textContent = `${visible} noticia(s) mostrada(s)`;
}

document.addEventListener("DOMContentLoaded", () => {
  ["q", "sev", "tag"].forEach(id => {
    document.getElementById(id).addEventListener("input", applyFilters);
    document.getElementById(id).addEventListener("change", applyFilters);
  });

  document.getElementById("btnReset").addEventListener("click", () => {
    document.getElementById("q").value = "";
    document.getElementById("sev").value = "";
    document.getElementById("tag").value = "";
    applyFilters();
  });

  applyFilters();
});