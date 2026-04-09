(async function () {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const START_URL = 'https://zonatmo.nakamasweb.com/profile/lists';
  const WAIT_BETWEEN_LIST_PAGES = 3000;
  const WAIT_BETWEEN_LISTS = 5000;
  const WAIT_BETWEEN_MANGAS = 5000;
  const WAIT_ON_BLOCK = 120000;
  const MAX_RETRIES = 3;

  const finalResult = [];
  const seenListUrls = new Set();
  const seenMangaByList = new Set();

  function clean(text) {
    return (text || '')
      .replace(/\s+/g, ' ')
      .replace(/\u00a0/g, ' ')
      .trim();
  }

  function cleanListName(text) {
    return clean(text)
      .replace(/\.list-thumbnail-\d+::before.*?\}\s*/i, '')
      .replace(/\bPrivada\b/gi, '')
      .replace(/\bPública\b/gi, '')
      .replace(/\s+\d+\s*$/, '')
      .trim();
  }

  function getPageNumber(url) {
    const u = new URL(url);
    return parseInt(u.searchParams.get('page') || '1', 10);
  }

  function getInternalCode(url) {
    const m = url.match(/\/library\/manga\/(\d+)\//i);
    return m ? m[1] : null;
  }

  async function fetchDoc(url) {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);

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

        if (attempt >= MAX_RETRIES) throw err;

        console.log(`⏸️ Esperando 2 minutos antes de reintentar ${label}...`);
        await sleep(WAIT_ON_BLOCK);
      }
    }
  }

  function getNextPageUrl(doc) {
    return doc.querySelector('a[rel="next"]')?.href || null;
  }

  function extractListsFromPage(doc, currentUrl) {
    const links = [...doc.querySelectorAll('a[href*="/lists/"]')];
    const found = [];

    for (const a of links) {
      const href = a.href;
      if (!/\/lists\/\d+\//i.test(href)) continue;

      let nombre =
        cleanListName(a.getAttribute('title')) ||
        cleanListName(a.querySelector('h4,h5,h6,strong')?.textContent) ||
        cleanListName(a.textContent);

      if (!nombre) {
        nombre = href.split('/').pop().replace(/-/g, ' ');
      }

      found.push({
        nombre,
        url: href,
        pagina: getPageNumber(currentUrl)
      });
    }

    const unique = [];
    const seen = new Set();

    for (const item of found) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      unique.push(item);
    }

    return unique;
  }

  async function collectAllLists() {
    const allLists = [];
    let currentUrl = START_URL;

    while (currentUrl) {
      const doc = await withRetries(`cargar página de listas ${currentUrl}`, () => fetchDoc(currentUrl));

      const lists = extractListsFromPage(doc, currentUrl);
      for (const list of lists) {
        if (seenListUrls.has(list.url)) continue;
        seenListUrls.add(list.url);
        allLists.push(list);
      }

      console.log(`📚 Página de listas ${getPageNumber(currentUrl)} procesada | total listas acumuladas: ${allLists.length}`);

      const nextUrl = getNextPageUrl(doc);
      if (!nextUrl || nextUrl === currentUrl) break;

      currentUrl = nextUrl;
      await sleep(WAIT_BETWEEN_LIST_PAGES);
    }

    return allLists;
  }

  function extractMangasFromList(doc) {
    const anchors = [...doc.querySelectorAll('a[href*="/library/manga/"]')];
    const mangas = [];
    const seen = new Set();

    for (const a of anchors) {
      const href = a.href;
      if (!href || seen.has(href)) continue;
      seen.add(href);

      let nombre =
        clean(a.getAttribute('title')) ||
        clean(a.querySelector('.element-title, .book-title, h4, h5, h6, strong')?.textContent) ||
        clean(a.textContent);

      nombre = nombre
        .replace(/\.book-thumbnail-\d+::before.*?\}\s*/i, '')
        .replace(/\bMANGA\b/gi, '')
        .replace(/\bMANHWA\b/gi, '')
        .replace(/\bMANHUA\b/gi, '')
        .replace(/\bNOVELA\b/gi, '')
        .replace(/\bShounen\b|\bSeinen\b|\bShoujo\b|\bJosei\b/gi, '')
        .replace(/^\d+(\.\d+)?/, '')
        .trim();

      if (!nombre) {
        nombre = href.split('/').pop().replace(/-/g, ' ');
      }

      mangas.push({
        nombre,
        url: href
      });
    }

    return mangas;
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

  async function processManga(mangaUrl, listName) {
    const doc = await withRetries(`cargar manga ${mangaUrl}`, () => fetchDoc(mangaUrl));

    const nombre =
      clean(doc.querySelector('.element-title')?.childNodes?.[0]?.textContent) ||
      clean(doc.querySelector('.element-title')?.textContent) ||
      mangaUrl.split('/').pop();

    const tipo = clean(doc.querySelector('.book-type')?.textContent) || null;
    const demografia = clean(doc.querySelector('.demography')?.textContent) || null;
    const estado = clean(doc.querySelector('.book-status')?.textContent) || null;

    const generos = [...doc.querySelectorAll('a.badge.badge-primary')]
      .map(x => clean(x.textContent))
      .filter(Boolean);

    const chaptersDoc = await withRetries(`cargar capítulos ${mangaUrl}`, () => fetchDoc(getViewAllUrl(mangaUrl)));
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
      lista: listName,
      nombre,
      url: mangaUrl,
      tipo,
      demografia,
      generos,
      estado,
      codigoInterno: getInternalCode(mangaUrl),
      capituloActual,
      capituloMaximo,
      progresoPorcentaje
    };
  }

  const allLists = await collectAllLists();
  console.log(`🎯 Total de listas encontradas: ${allLists.length}`);

  for (let i = 0; i < allLists.length; i++) {
    const list = allLists[i];

    console.log(`🗂️ [${i + 1}/${allLists.length}] Procesando lista: ${list.nombre}`);

    let listDoc;
    try {
      listDoc = await withRetries(`cargar lista ${list.url}`, () => fetchDoc(list.url));
    } catch (err) {
      console.warn(`⚠️ No se pudo cargar la lista ${list.nombre}`, err);
      continue;
    }

    const mangas = extractMangasFromList(listDoc);
    console.log(`📘 Mangas encontrados en "${list.nombre}": ${mangas.length}`);

    for (let j = 0; j < mangas.length; j++) {
      const manga = mangas[j];
      const key = `${list.url}__${manga.url}`;

      if (seenMangaByList.has(key)) continue;
      seenMangaByList.add(key);

      try {
        console.log(`   📖 [${j + 1}/${mangas.length}] ${manga.url}`);
        const data = await processManga(manga.url, list.nombre);
        finalResult.push(data);

        console.log(
          `   ✅ ${data.nombre} | Actual: ${data.capituloActual} | Máx: ${data.capituloMaximo} | ${data.progresoPorcentaje}%`
        );
      } catch (err) {
        console.warn(`   ❌ Error procesando manga ${manga.url}`, err);
        finalResult.push({
          lista: list.nombre,
          nombre: manga.nombre || null,
          url: manga.url,
          tipo: null,
          demografia: null,
          generos: [],
          estado: null,
          codigoInterno: getInternalCode(manga.url),
          capituloActual: null,
          capituloMaximo: null,
          progresoPorcentaje: null,
          error: String(err)
        });
      }

      if (j < mangas.length - 1) {
        console.log(`   ⏳ Esperando ${WAIT_BETWEEN_MANGAS / 1000}s entre mangas...`);
        await sleep(WAIT_BETWEEN_MANGAS);
      }
    }

    if (i < allLists.length - 1) {
      console.log(`⏳ Esperando ${WAIT_BETWEEN_LISTS / 1000}s entre listas...`);
      await sleep(WAIT_BETWEEN_LISTS);
    }
  }

  console.table(finalResult);

  const blob = new Blob([JSON.stringify(finalResult, null, 2)], {
    type: 'application/json'
  });

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'zonatmo-backup-final-parcial.json';
  a.click();

  console.log(`🎉 Terminado. Registros generados: ${finalResult.length}`);
})();
