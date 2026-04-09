(async function () {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const STATUS_PAGES = [
    { key: 'watch', label: 'Leido', url: 'https://zonatmo.nakamasweb.com/items_pending/watch' },
    { key: 'pending', label: 'Pendiente', url: 'https://zonatmo.nakamasweb.com/items_pending/pending' },
    { key: 'follow', label: 'Siguiendo', url: 'https://zonatmo.nakamasweb.com/items_pending/follow' },
    { key: 'wish', label: 'Favorito', url: 'https://zonatmo.nakamasweb.com/items_pending/wish' },
    { key: 'have', label: 'Lo tengo', url: 'https://zonatmo.nakamasweb.com/items_pending/have' },
    { key: 'abandoned', label: 'Abandonado', url: 'https://zonatmo.nakamasweb.com/items_pending/abandoned' }
  ];

  const WAIT_ON_BLOCK_MIN = 90000;   // 90s
  const WAIT_ON_BLOCK_MAX = 120000;  // 120s
  const MAX_RETRIES = 3;

  const finalResult = [];
  const seenByStatus = new Set();

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // Espera humana: 1-5 seg, priorizando 3 seg
  function getHumanDelayMs() {
    const roll = Math.random();
    let seconds;

    if (roll < 0.5) {
      seconds = 3; // 50%
    } else if (roll < 0.65) {
      seconds = 2; // 15%
    } else if (roll < 0.8) {
      seconds = 4; // 15%
    } else if (roll < 0.9) {
      seconds = 1; // 10%
    } else {
      seconds = 5; // 10%
    }

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

      // Aceptar cualquier ficha real tipo /library/<tipo>/<id>/<slug>
      if (!/\/library\/[^/]+\/\d+\/[^/]+/i.test(href)) continue;

      seen.add(href);

      let nombre =
        clean(a.getAttribute('title')) ||
        clean(a.querySelector('.element-title, .book-title, h4, h5, h6, strong')?.textContent) ||
        clean(a.textContent);

      nombre = nombre
        .replace(/\.book-thumbnail-\d+::before.*?\}\s*/i, '')
        .replace(/\bMANGA\b|\bMANHWA\b|\bMANHUA\b|\bNOVELA\b|\bONE SHOT\b/gi, '')
        .replace(/\bShounen\b|\bSeinen\b|\bShoujo\b|\bJosei\b/gi, '')
        .replace(/^\d+(\.\d+)?/, '')
        .trim();

      if (!nombre) {
        nombre = href.split('/').pop().replace(/-/g, ' ');
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

  function parseChapters(doc) {
    const rows = [...doc.querySelectorAll('li, .list-group-item, .upload-link')];
    const chapters = [];

    for (const row of rows) {
      const txt = clean(row.textContent);
      const match = txt.match(/Cap[ií]tulo\s+(\d+(?:\.\d+)?)/i);
      if (!match) continue;

      const numeroTexto = match[1];
      const numero = parseFloat(numeroTexto);
      if (Number.isNaN(numero)) continue;

      const viewed = row.querySelector('span.chapter-viewed-icon.viewed');
      const notViewed = row.querySelector('span.chapter-viewed-icon:not(.viewed)');

      chapters.push({
        numeroTexto,
        numero,
        leido: !!viewed,
        noLeido: !!notViewed
      });
    }

    const uniqueMap = new Map();
    for (const ch of chapters) {
      if (!uniqueMap.has(ch.numeroTexto)) {
        uniqueMap.set(ch.numeroTexto, ch);
      }
    }

    return [...uniqueMap.values()];
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  async function processManga(itemUrl, statusInfo) {
    const doc = await withRetries(`cargar obra ${itemUrl}`, () => fetchDoc(itemUrl));

    const nombre =
      clean(doc.querySelector('.element-title')?.childNodes?.[0]?.textContent) ||
      clean(doc.querySelector('.element-title')?.textContent) ||
      itemUrl.split('/').pop();

    const descripcion = clean(doc.querySelector('.element-description')?.textContent) || null;

    const tipoRuta = getTipoFromUrl(itemUrl);
    const tipoFicha = clean(doc.querySelector('.book-type')?.textContent) || null;
    const demografia = clean(doc.querySelector('.demography')?.textContent) || null;
    const estadoPublicacion = clean(doc.querySelector('.book-status')?.textContent) || null;

    const generos = [...doc.querySelectorAll('a.badge.badge-primary')]
      .map(x => clean(x.textContent))
      .filter(Boolean);

    const chaptersDoc = await withRetries(
      `cargar capítulos ${itemUrl}`,
      () => fetchDoc(getViewAllUrl(itemUrl))
    );

    const chapters = parseChapters(chaptersDoc);

    let capituloActual = null;
    let capituloMaximo = null;
    let progresoPorcentaje = null;

    if (chapters.length) {
      const nums = chapters.map(c => c.numero);
      capituloMaximo = Math.max(...nums).toFixed(2);

      const leidos = chapters.filter(c => c.leido).map(c => c.numero);
      if (leidos.length) {
        const maxLeido = Math.max(...leidos);
        capituloActual = maxLeido.toFixed(2);
        progresoPorcentaje = round2((maxLeido / parseFloat(capituloMaximo)) * 100);
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
      demografia,
      generos,
      estadoPublicacion,
      codigoInterno: getInternalCode(itemUrl),
      capituloActual,
      capituloMaximo,
      progresoPorcentaje
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
        console.log(`   📖 [${i + 1}/${items.length}] ${item.url}`);
        const data = await processManga(item.url, statusInfo);
        finalResult.push(data);

        console.log(
          `   ✅ ${data.nombre} | ${data.tipoRuta} | Actual: ${data.capituloActual} | Máx: ${data.capituloMaximo} | ${data.progresoPorcentaje}%`
        );
      } catch (err) {
        console.warn(`   ❌ Error procesando obra ${item.url}`, err);

        finalResult.push({
          clasificacion: statusInfo.label,
          estadoKey: statusInfo.key,
          nombre: item.nombre || null,
          descripcion: null,
          url: item.url,
          tipoRuta: getTipoFromUrl(item.url),
          tipoFicha: null,
          demografia: null,
          generos: [],
          estadoPublicacion: null,
          codigoInterno: getInternalCode(item.url),
          capituloActual: null,
          capituloMaximo: null,
          progresoPorcentaje: null,
          error: String(err)
        });
      }

      if (i < items.length - 1) {
        const waitMs = getHumanDelayMs();
        console.log(`   ⏳ Esperando ${(waitMs / 1000).toFixed(0)}s entre obras...`);
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
  a.download = 'zonatmo-backup-por-estados-completo.json';
  a.click();

  console.log(`🎉 Terminado. Registros generados: ${finalResult.length}`);
})();
