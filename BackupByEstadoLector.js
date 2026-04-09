(async function () {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const STATUS_PAGES = [
    { key: 'watch', label: 'Leído', url: 'https://lectormanga.nakamasweb.com/profile/watch/true' },
    { key: 'pending', label: 'Pendiente', url: 'https://lectormanga.nakamasweb.com/profile/pending/true' },
    { key: 'follow', label: 'Siguiendo', url: 'https://lectormanga.nakamasweb.com/profile/follow/true' },
    { key: 'wish', label: 'Favorito', url: 'https://lectormanga.nakamasweb.com/profile/wish/true' },
    { key: 'have', label: 'Lo tengo', url: 'https://lectormanga.nakamasweb.com/profile/have/true' },
    { key: 'abandoned', label: 'Abandonado', url: 'https://lectormanga.nakamasweb.com/profile/abandoned/true' }
  ];

  const WAIT_ON_BLOCK_MIN = 90000;
  const WAIT_ON_BLOCK_MAX = 120000;
  const MAX_RETRIES = 3;

  // ===== MODO PRUEBA =====
  const LIMIT_TEST_MODE = false;
  const LIMIT_PER_STATUS = 10;

  const finalResult = [];
  const seenByStatus = new Set();

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function getHumanDelayMs() {
    const roll = Math.random();
    let seconds;

    if (roll < 0.5) seconds = 3;
    else if (roll < 0.65) seconds = 2;
    else if (roll < 0.8) seconds = 4;
    else if (roll < 0.9) seconds = 1;
    else seconds = 5;

    return seconds * 1000;
  }

  function getBlockDelayMs() {
    return randomInt(WAIT_ON_BLOCK_MIN, WAIT_ON_BLOCK_MAX);
  }

  function clean(text) {
    return (text || '')
      .replace(/\s+/g, ' ')
      .replace(/\u00a0/g, ' ')
      .trim();
  }

  function getInternalCode(url) {
    const m = url.match(/\/library\/[^/]+\/(\d+)\//i);
    return m ? m[1] : null;
  }

  function getTipoFromUrl(url) {
    const m = url.match(/\/library\/([^/]+)\/\d+\/[^/]+/i);
    return m ? m[1].toLowerCase() : null;
  }

  function getSlugFromUrl(url) {
    try {
      const parts = new URL(url).pathname.split('/').filter(Boolean);
      return parts[parts.length - 1] || null;
    } catch {
      return null;
    }
  }

  async function fetchDoc(url) {
    const res = await fetch(url, { credentials: 'include' });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} en ${url}`);
    }

    const html = await res.text();

    if (!html || html.length < 500) {
      throw new Error(`HTML vacío o incompleto en ${url}`);
    }

    return new DOMParser().parseFromString(html, 'text/html');
  }

  async function withRetries(label, fn) {
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
      try {
        return await fn();
      } catch (err) {
        attempt++;
        console.warn(`❌ ${label} | intento ${attempt}:`, err);

        if (attempt >= MAX_RETRIES) {
          throw err;
        }

        const waitMs = getBlockDelayMs();
        console.log(`⏸️ Esperando ${(waitMs / 1000).toFixed(0)}s antes de reintentar ${label}...`);
        await sleep(waitMs);
      }
    }
  }

  function getNextPageUrl(doc) {
    return doc.querySelector('a[rel="next"]')?.href || null;
  }

  function extractLibraryItems(doc) {
    const anchors = [...doc.querySelectorAll('a[href*="/library/"]')];
    const items = [];
    const seen = new Set();

    for (const a of anchors) {
      const href = a.href;
      if (!href || seen.has(href)) continue;
      if (!/\/library\/[^/]+\/\d+\/[^/]+/i.test(href)) continue;

      seen.add(href);

      let nombre =
        clean(a.getAttribute('title')) ||
        clean(a.textContent);

      if (!nombre) {
        nombre = getSlugFromUrl(href)?.replace(/-/g, ' ') || href;
      }

      items.push({
        nombre,
        url: href
      });
    }

    return items;
  }

  function getViewAllUrl(url) {
    const u = new URL(url);
    u.searchParams.set('orderDir', 'ASC');
    return u.href;
  }

  function parseChapterNumber(text) {
    const raw = clean(text);
    const match = raw.match(/Cap[ií]tulo\s+(\d+(?:\.\d+)?)/i);
    if (!match) return null;

    const numeroTexto = match[1];
    const numero = parseFloat(numeroTexto);
    if (Number.isNaN(numero)) return null;

    return { numeroTexto, numero, raw };
  }

  function parseChapters(doc) {
    const chapters = [];
    const containers = [
      doc.querySelector('#chapters'),
      doc.querySelector('#chapters-collapsed')
    ].filter(Boolean);

    for (const container of containers) {
      const rows = [...container.querySelectorAll(':scope > .row')];

      for (const row of rows) {
        const h4Nodes = [...row.querySelectorAll('h4')];
        const titleH4 = h4Nodes.find(h4 =>
          /Cap[ií]tulo/i.test(clean(h4.getAttribute('title') || h4.textContent))
        );

        if (!titleH4) continue;

        const parsed = parseChapterNumber(titleH4.getAttribute('title') || titleH4.textContent);
        if (!parsed) continue;

        const icon = row.querySelector('span.chapter-viewed-icon');

        const leido = !!(
          icon &&
          icon.classList.contains('fa-eye') &&
          !icon.classList.contains('fa-eye-slash') &&
          icon.classList.contains('text-primary')
        );

        const noLeido = !!(
          icon &&
          icon.classList.contains('fa-eye-slash')
        );

        chapters.push({
          numeroTexto: parsed.numeroTexto,
          numero: parsed.numero,
          tituloCompleto: parsed.raw,
          leido,
          noLeido,
          chapterId: icon?.getAttribute('data-chapter') || null
        });
      }
    }

    const uniqueMap = new Map();

    for (const ch of chapters) {
      const key = ch.chapterId || ch.numeroTexto;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, ch);
      }
    }

    return [...uniqueMap.values()].sort((a, b) => b.numero - a.numero);
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  function getMainContainer(doc) {
    return doc.querySelector('body .container');
  }

  function getBookName(doc, fallbackUrl) {
    const h1 = doc.querySelector('h1.text-dark');
    if (h1) {
      const clone = h1.cloneNode(true);
      clone.querySelectorAll('small').forEach(x => x.remove());
      const text = clean(clone.textContent);
      if (text) return text;
    }

    const titleMeta =
      clean(doc.querySelector('meta[property="og:title"]')?.getAttribute('content')) ||
      clean(doc.querySelector('title')?.textContent);

    if (titleMeta) {
      return titleMeta
        .replace(/\s*\|\s*LectorManga.*$/i, '')
        .trim();
    }

    return getSlugFromUrl(fallbackUrl)?.replace(/-/g, ' ') || fallbackUrl;
  }

  function getBookDescription(doc) {
    const container = getMainContainer(doc);
    if (!container) return null;

    const rows = [...container.querySelectorAll('.row')];

    for (const row of rows) {
      const p = row.querySelector('.col-12.mt-2 p, .col-12 p');
      const text = clean(p?.textContent);
      if (text) return text;
    }

    return null;
  }

  function getBookType(doc, itemUrl) {
    const h5s = [...doc.querySelectorAll('h5')];

    for (const h5 of h5s) {
      const label = clean(h5.childNodes[0]?.textContent || h5.textContent);
      if (/^Tipo\s*:/i.test(label)) {
        const spanText = clean(h5.querySelector('span')?.textContent);
        if (spanText) return spanText;
      }
    }

    const tipoRuta = getTipoFromUrl(itemUrl);
    return tipoRuta ? tipoRuta.toUpperCase() : null;
  }

  function getBookStatus(doc) {
    const h5s = [...doc.querySelectorAll('h5')];

    for (const h5 of h5s) {
      const label = clean(h5.childNodes[0]?.textContent || h5.textContent);
      if (/^Estado\s*:/i.test(label)) {
        const spanText = clean(h5.querySelector('span')?.textContent);
        if (spanText) return spanText;
      }
    }

    return null;
  }

  function getGenres(doc) {
    const h5s = [...doc.querySelectorAll('h5')];
    let genresHeader = null;

    for (const h5 of h5s) {
      if (/^G[eé]neros\s*:?/i.test(clean(h5.textContent))) {
        genresHeader = h5;
        break;
      }
    }

    if (!genresHeader) {
      return [...doc.querySelectorAll('a.badge.badge-primary.badge-pill')]
        .map(x => clean(x.textContent))
        .filter(Boolean);
    }

    const generos = [];
    let node = genresHeader.nextElementSibling;

    while (node) {
      if (node.matches('h5')) break;

      if (node.matches('a.badge.badge-primary.badge-pill')) {
        const txt = clean(node.textContent);
        if (txt) generos.push(txt);
      }

      node = node.nextElementSibling;
    }

    return generos;
  }

  async function processItem(item, statusInfo) {
    const itemUrl = item.url;
    const doc = await withRetries(`cargar obra ${itemUrl}`, () => fetchDoc(itemUrl));

    const nombre = getBookName(doc, itemUrl) || item.nombre || null;
    const descripcion = getBookDescription(doc);
    const tipoRuta = getTipoFromUrl(itemUrl);
    const tipoFicha = getBookType(doc, itemUrl);
    const estadoPublicacion = getBookStatus(doc);
    const generos = getGenres(doc);

    const chaptersDoc = await withRetries(
      `cargar capítulos ${itemUrl}`,
      () => fetchDoc(getViewAllUrl(itemUrl))
    );

    const chapters = parseChapters(chaptersDoc);

    let capituloActual = null;
    let capituloMaximo = null;
    let progresoPorcentaje = null;
    let totalCapitulosDetectados = chapters.length;

    if (chapters.length) {
      const nums = chapters
        .map(c => c.numero)
        .filter(n => typeof n === 'number' && !Number.isNaN(n));

      if (nums.length) {
        capituloMaximo = Math.max(...nums).toFixed(2);
      }

      const leidos = chapters
        .filter(c => c.leido)
        .map(c => c.numero)
        .filter(n => typeof n === 'number' && !Number.isNaN(n));

      if (leidos.length) {
        const maxLeido = Math.max(...leidos);
        capituloActual = maxLeido.toFixed(2);

        if (capituloMaximo !== null && parseFloat(capituloMaximo) > 0) {
          progresoPorcentaje = round2((maxLeido / parseFloat(capituloMaximo)) * 100);
        }
      }
    }

    return {
      clasificacion: statusInfo.label,
      estadoKey: statusInfo.key,
      nombre,
      descripcion,
      url: itemUrl,
      tipoRuta,
      tipoFicha,
      generos,
      estadoPublicacion,
      codigoInterno: getInternalCode(itemUrl),
      capituloActual,
      capituloMaximo,
      progresoPorcentaje,
      totalCapitulosDetectados
    };
  }

  async function collectItemsForStatus(statusInfo) {
    const items = [];
    let currentUrl = statusInfo.url;
    let page = 1;

    while (currentUrl) {
      const doc = await withRetries(
        `cargar estado ${statusInfo.key} página ${page}`,
        () => fetchDoc(currentUrl)
      );

      const pageItems = extractLibraryItems(doc);
      console.log(`📚 ${statusInfo.label} | página ${page} | obras encontradas: ${pageItems.length}`);

      for (const item of pageItems) {
        const key = `${statusInfo.key}__${item.url}`;
        if (seenByStatus.has(key)) continue;

        seenByStatus.add(key);
        items.push(item);

        if (LIMIT_TEST_MODE && items.length >= LIMIT_PER_STATUS) {
          console.log(`🧪 Límite de prueba alcanzado en ${statusInfo.label}: ${LIMIT_PER_STATUS} obras.`);
          return items;
        }
      }

      const nextUrl = getNextPageUrl(doc);
      if (!nextUrl || nextUrl === currentUrl) break;

      currentUrl = nextUrl;
      page++;

      const waitMs = getHumanDelayMs();
      console.log(`⏳ Esperando ${(waitMs / 1000).toFixed(0)}s antes de la siguiente página de ${statusInfo.label}...`);
      await sleep(waitMs);
    }

    return items;
  }

  for (let s = 0; s < STATUS_PAGES.length; s++) {
    const statusInfo = STATUS_PAGES[s];
    console.log(`🗂️ [${s + 1}/${STATUS_PAGES.length}] Procesando estado: ${statusInfo.label}`);

    let items = [];
    try {
      items = await collectItemsForStatus(statusInfo);
    } catch (err) {
      console.warn(`⚠️ No se pudo recorrer el estado ${statusInfo.label}`, err);
      continue;
    }

    console.log(`🎯 Total de obras en ${statusInfo.label}: ${items.length}`);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      try {
        console.log(`📖 [${i + 1}/${items.length}] ${item.url}`);
        const data = await processItem(item, statusInfo);
        finalResult.push(data);

        console.log(
          `✅ ${data.nombre} | ${data.tipoFicha || data.tipoRuta} | Actual: ${data.capituloActual} | Máx: ${data.capituloMaximo} | ${data.progresoPorcentaje}% | Caps detectados: ${data.totalCapitulosDetectados}`
        );
      } catch (err) {
        console.warn(`❌ Error procesando obra ${item.url}`, err);

        finalResult.push({
          clasificacion: statusInfo.label,
          estadoKey: statusInfo.key,
          nombre: item.nombre || null,
          descripcion: null,
          url: item.url,
          tipoRuta: getTipoFromUrl(item.url),
          tipoFicha: null,
          generos: [],
          estadoPublicacion: null,
          codigoInterno: getInternalCode(item.url),
          capituloActual: null,
          capituloMaximo: null,
          progresoPorcentaje: null,
          totalCapitulosDetectados: 0,
          error: String(err)
        });
      }

      if (i < items.length - 1) {
        const waitMs = getHumanDelayMs();
        console.log(`⏳ Esperando ${(waitMs / 1000).toFixed(0)}s entre obras...`);
        await sleep(waitMs);
      }
    }
  }

  console.table(finalResult);

  const blob = new Blob([JSON.stringify(finalResult, null, 2)], {
    type: 'application/json'
  });

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = LIMIT_TEST_MODE
    ? `lectormanga-backup-prueba-${LIMIT_PER_STATUS}-por-estado.json`
    : 'lectormanga-backup-por-estados-true.json';
  a.click();

  console.log(`🎉 Terminado. Registros generados: ${finalResult.length}`);
})();
