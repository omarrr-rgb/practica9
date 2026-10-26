const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const app = require("../src/index");

test("CyberNews responde y aplica controles básicos", async t => {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  }));

  const base = `http://127.0.0.1:${server.address().port}`;

  const home = await fetch(`${base}/`);
  assert.equal(home.status, 200, "la página principal debe responder 200");
  assert.equal(home.headers.get("x-content-type-options"), "nosniff", "Helmet debe agregar este encabezado");

  const newsResponse = await fetch(`${base}/api/news`);
  assert.equal(newsResponse.status, 200, "la API de lectura debe responder 200");
  const news = await newsResponse.json();
  assert.equal(news.ok, true);
  assert.ok(Array.isArray(news.data), "la API debe devolver un arreglo de noticias");

  const dashboard = await fetch(`${base}/dashboard`, { redirect: "manual" });
  assert.equal(dashboard.status, 302, "el dashboard sin sesión debe redirigir");
  assert.equal(dashboard.headers.get("location"), "/login");
});
