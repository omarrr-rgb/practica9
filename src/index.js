const path = require("path");
const crypto = require("crypto");
const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const session = require("express-session");
const bcrypt = require("bcryptjs");

// En esta práctica el arreglo funciona como almacenamiento temporal.
// Reiniciar Node restaura los datos originales de src/data/news.js.
const news = require("./data/news");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PROD = NODE_ENV === "production";
const DEMO_SECRET = "solo-para-clase-cambia-este-secreto";
const SESSION_SECRET = process.env.SESSION_SECRET || DEMO_SECRET;
const TRUST_PROXY_HOPS = Number(process.env.TRUST_PROXY_HOPS || 0);

if (IS_PROD && SESSION_SECRET === DEMO_SECRET) {
  throw new Error("SESSION_SECRET es obligatorio en producción");
}

// 0) Hardening básico
// Reduce fingerprinting. No vuelve invisible a Express ni sustituye otros controles.
app.disable("x-powered-by");

// Solo debe habilitarse cuando realmente existe un proxy inverso conocido.
if (Number.isInteger(TRUST_PROXY_HOPS) && TRUST_PROXY_HOPS > 0) {
  app.set("trust proxy", TRUST_PROXY_HOPS);
}

// 1) Logging del lado servidor
// Morgan registra método, ruta, estado y tiempo; no debe registrar contraseñas.
app.use(morgan(IS_PROD ? "combined" : "dev"));

// 2) Headers de seguridad + CSP
// CSP reduce el impacto de ciertos XSS, pero no reemplaza la validación ni el escape.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'"],
        "style-src": ["'self'"],
        "img-src": ["'self'", "data:"],
        "object-src": ["'none'"],
        "base-uri": ["'self'"],
        "frame-ancestors": ["'none'"],
        "form-action": ["'self'"]
      }
    },
    referrerPolicy: { policy: "no-referrer" }
  })
);

// 3) Parsers con límites para reducir abuso de memoria por cuerpos demasiado grandes.
// Estos límites no controlan el tamaño de los parámetros de la URL; se validan aparte.
app.use(express.urlencoded({ extended: false, limit: "20kb" }));
app.use(express.json({ limit: "50kb" }));

// 4) Sesiones
app.use(
  session({
    name: "cybernews.sid",
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: IS_PROD,
      maxAge: 1000 * 60 * 15,
      path: "/"
    }
  })
);

// MemoryStore es suficiente para la práctica, no para producción: no escala y pierde
// sesiones al reiniciar. En producción se usaría Redis, una BD u otro store compatible.

// 5) Rate limiting
// Se publica primero el contenido estático para no contar CSS/JS como llamadas al API.
app.use(express.static(path.join(__dirname, "..", "public")));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { ok: false, error: "Demasiadas solicitudes al API. Intenta más tarde." }
});

const loginLimiter = rateLimit({
  windowMs: 2 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: "Demasiados intentos de inicio de sesión. Intenta más tarde."
});

app.use("/api", apiLimiter);

// 6) Motor de vistas
app.set("views", path.join(__dirname, "..", "views"));
app.set("view engine", "ejs");

// 7) Usuario de demostración. El password se almacena como hash, no como texto plano.
// En una aplicación real el usuario y su hash vivirían en una base de datos.
const demoUsers = [
  {
    username: "admin",
    role: "admin",
    passwordHash: bcrypt.hashSync("P@ssw0rd!", 10)
  }
];

const ALLOWED_SEVERITIES = new Set(["low", "medium", "high", "critical"]);

function generateCsrf(req) {
  if (!req.session.csrf) {
    req.session.csrf = crypto.randomBytes(32).toString("hex");
  }
  return req.session.csrf;
}

function isValidCsrf(req) {
  const received = String(req.get("x-csrf-token") || req.body?.csrf || "");
  const expected = String(req.session?.csrf || "");
  if (!received || !expected) return false;

  const receivedBuffer = Buffer.from(received, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return (
    receivedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

function requireAuthPage(req, res, next) {
  if (req.session?.user) return next();
  return res.redirect("/login");
}

function requireAdminApi(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ ok: false, error: "Autenticación requerida" });
  }
  if (req.session.user.role !== "admin") {
    return res.status(403).json({ ok: false, error: "Rol insuficiente" });
  }
  return next();
}

function requireCsrfApi(req, res, next) {
  if (!isValidCsrf(req)) {
    return res.status(403).json({ ok: false, error: "CSRF inválido" });
  }
  return next();
}

function cleanText(value, maxLength) {
  if (Array.isArray(value)) return "";
  return String(value ?? "").trim().slice(0, maxLength);
}

function parseId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function validateNewsInput(body, { partial = false } = {}) {
  const input = body && typeof body === "object" ? body : {};
  const output = {};
  const errors = [];
  const has = field => Object.prototype.hasOwnProperty.call(input, field);

  function shouldValidate(field) {
    return !partial || has(field);
  }

  if (shouldValidate("title")) {
    output.title = cleanText(input.title, 120);
    if (output.title.length < 5) errors.push("title debe tener entre 5 y 120 caracteres");
  }

  if (shouldValidate("summary")) {
    output.summary = cleanText(input.summary, 500);
    if (output.summary.length < 10) errors.push("summary debe tener entre 10 y 500 caracteres");
  }

  if (shouldValidate("severity")) {
    output.severity = cleanText(input.severity, 20).toLowerCase();
    if (!ALLOWED_SEVERITIES.has(output.severity)) errors.push("severity no permitida");
  }

  if (shouldValidate("source")) {
    output.source = cleanText(input.source, 80);
    if (!output.source) errors.push("source es obligatorio");
  }

  if (shouldValidate("date")) {
    output.date = cleanText(input.date, 10);
    if (!isValidDate(output.date)) errors.push("date debe usar el formato AAAA-MM-DD");
  }

  if (shouldValidate("url")) {
    const rawUrl = cleanText(input.url, 500);
    output.url = normalizeUrl(rawUrl);
    if (!output.url) errors.push("url debe ser HTTP o HTTPS válida");
  }

  if (shouldValidate("tags")) {
    const rawTags = Array.isArray(input.tags)
      ? input.tags
      : cleanText(input.tags, 200).split(",");
    output.tags = [...new Set(rawTags.map(tag => cleanText(tag, 30).toLowerCase()).filter(Boolean))];
    if (output.tags.length < 1 || output.tags.length > 5) {
      errors.push("tags debe contener entre 1 y 5 elementos");
    }
    if (output.tags.some(tag => !/^[a-z0-9-]+$/.test(tag))) {
      errors.push("cada tag sólo puede contener letras minúsculas, números y guiones");
    }
  }

  if (partial && Object.keys(output).length === 0) {
    errors.push("no se recibió ningún campo permitido");
  }

  return { value: output, errors };
}

function nextNewsId() {
  return news.reduce((max, item) => Math.max(max, item.id), 0) + 1;
}

// 8) Rutas de lectura
app.get("/", (req, res) => {
  const sorted = [...news].sort((a, b) => (a.date < b.date ? 1 : -1));
  const user = req.session.user || null;
  res.render("index", {
    news: sorted,
    user,
    csrf: user ? generateCsrf(req) : null
  });
});

app.get("/api/news", (req, res) => {
  const q = cleanText(req.query.q, 80).toLowerCase();
  const tag = cleanText(req.query.tag, 30).toLowerCase();
  const severity = cleanText(req.query.severity, 20).toLowerCase();

  if (severity && !ALLOWED_SEVERITIES.has(severity)) {
    return res.status(400).json({ ok: false, error: "severity inválida" });
  }
  if (tag && !/^[a-z0-9-]+$/.test(tag)) {
    return res.status(400).json({ ok: false, error: "tag inválido" });
  }

  let data = [...news];
  if (severity) data = data.filter(item => item.severity === severity);
  if (tag) data = data.filter(item => item.tags.includes(tag));
  if (q) {
    data = data.filter(item =>
      `${item.title} ${item.summary} ${item.tags.join(" ")}`.toLowerCase().includes(q)
    );
  }

  data.sort((a, b) => (a.date < b.date ? 1 : -1));
  return res.json({ ok: true, count: data.length, data });
});

app.get("/api/news/:id", (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "id inválido" });

  const item = news.find(entry => entry.id === id);
  if (!item) return res.status(404).json({ ok: false, error: "Noticia no encontrada" });
  return res.json({ ok: true, data: item });
});

app.get("/health", (req, res) => res.json({ status: "up" }));

// 9) Login y sesión
app.get("/login", (req, res) => {
  if (req.session.user) return res.redirect("/dashboard");
  return res.render("login", { csrf: generateCsrf(req), error: null });
});

app.post("/login", loginLimiter, (req, res) => {
  if (!isValidCsrf(req)) {
    return res.status(400).render("login", {
      csrf: generateCsrf(req),
      error: "Solicitud inválida. Recarga la página e intenta nuevamente."
    });
  }

  const username = cleanText(req.body.username, 50);
  const password = cleanText(req.body.password, 100);
  if (!username || !password) {
    return res.status(400).render("login", {
      csrf: generateCsrf(req),
      error: "Usuario o contraseña incorrectos."
    });
  }

  const user = demoUsers.find(entry => entry.username === username);
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).render("login", {
      csrf: generateCsrf(req),
      error: "Usuario o contraseña incorrectos."
    });
  }

  // Se cambia el identificador de sesión después de autenticar para reducir session fixation.
  return req.session.regenerate(error => {
    if (error) return res.status(500).send("No fue posible iniciar la sesión");
    req.session.user = { username: user.username, role: user.role };
    req.session.csrf = null;
    return res.redirect("/dashboard");
  });
});

app.get("/dashboard", requireAuthPage, (req, res) => {
  return res.render("dashboard", {
    user: req.session.user,
    csrf: generateCsrf(req)
  });
});

// Logout usa POST porque cambia el estado de la sesión y también valida CSRF.
app.post("/logout", requireAuthPage, (req, res) => {
  if (!isValidCsrf(req)) return res.status(403).send("CSRF inválido");
  return req.session.destroy(() => {
    res.clearCookie("cybernews.sid", { path: "/" });
    return res.redirect("/");
  });
});

// 10) CRUD protegido: autenticación + rol admin + CSRF + validación de entrada.
app.post("/api/news", requireAdminApi, requireCsrfApi, (req, res) => {
  const result = validateNewsInput(req.body);
  if (result.errors.length) {
    return res.status(400).json({ ok: false, errors: result.errors });
  }

  const item = { id: nextNewsId(), ...result.value };
  news.push(item);
  return res.status(201).json({ ok: true, data: item });
});

app.patch("/api/news/:id", requireAdminApi, requireCsrfApi, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "id inválido" });

  const index = news.findIndex(item => item.id === id);
  if (index === -1) return res.status(404).json({ ok: false, error: "Noticia no encontrada" });

  const result = validateNewsInput(req.body, { partial: true });
  if (result.errors.length) {
    return res.status(400).json({ ok: false, errors: result.errors });
  }

  news[index] = { ...news[index], ...result.value, id };
  return res.json({ ok: true, data: news[index] });
});

app.delete("/api/news/:id", requireAdminApi, requireCsrfApi, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "id inválido" });

  const index = news.findIndex(item => item.id === id);
  if (index === -1) return res.status(404).json({ ok: false, error: "Noticia no encontrada" });

  news.splice(index, 1);
  return res.status(204).send();
});

// 11) 404 y error handler al final de todas las rutas.
app.use((req, res) => {
  return res.status(404).json({ ok: false, error: "Not Found" });
});

app.use((err, req, res, next) => {
  console.error("ERROR:", err.stack || err);
  return res.status(500).json({ ok: false, error: "Internal Server Error" });
});

// Permite probar la aplicación con un puerto temporal sin arrancarla al importarla.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`CyberNews CRUD listening on ${PORT} (${NODE_ENV})`);
  });
}

module.exports = app;
