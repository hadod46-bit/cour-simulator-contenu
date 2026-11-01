/* Moteur de la base juridique de Cour Simulator, partagé par la page (navigateur) et le serveur local (Node).
   - charge les données de data/ (catalogue + articles) et construit un index BM25 bilingue (FR + AR) ;
   - recherche, lecture d'un article, catalogue des codes ;
   - définit les deux outils donnés à Claude : chercher_articles et lire_article. */
(function (racine) {
  const M = { codes: null, arts: [], index: null, parRef: null };

  const STOP_FR = new Set("le la les de des du un une et en au aux a à par pour sur dans est sont ou que qui ne pas son sa ses ce cette ces il elle ils elles se leur leurs l d qu s n y être avoir été lorsque dont tout toute tous".split(" "));
  const STOP_AR = new Set("في من على إلى الى عن أن ان أو او التي الذي الذين هذا هذه ذلك تلك كل ما لا لم مع بين بعد قبل عند كان كانت يكون تكون هو هي".split(" "));

  function jetons(txt) {
    const t = String(txt).toLowerCase();
    const out = [];
    const fr = t.normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z0-9]{2,}/g) || [];
    for (let w of fr) { if (STOP_FR.has(w)) continue; if (w.length > 4) w = w.replace(/(s|x)$/, ""); out.push(w); }
    const ar = t.replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").match(/[ء-ي]{2,}/g) || [];
    for (let w of ar) {
      if (STOP_AR.has(w)) continue;
      if (w.length > 4) w = w.replace(/^(وال|بال|فال|كال|لل|ال)/, "");
      if (w.length > 4) w = w.replace(/^[وف]/, "");
      out.push(w);
    }
    return out;
  }

  const refCle = (cle, article, annexe) => `${cle}|${String(article ?? "").toLowerCase()}|${annexe ? 1 : 0}`;

  // lireJson(chemin) -> Promise<objet> : fetch dans le navigateur, fs dans Node.
  async function charger(lireJson) {
    const codes = await lireJson("data/codes.json");
    const lots = await Promise.all(Array.from({ length: codes.fichiers }, (_, i) => lireJson(`data/articles-${i + 1}.json`)));
    M.codes = codes.codes;
    M.arts = lots.flat().map(([cle, article, annexe, page, texte]) => ({ cle, article, annexe, page, texte }));
    // Index BM25 : jeton -> [n° article, fréquence, n° article, fréquence, …]
    const idx = new Map(), longueurs = new Float32Array(M.arts.length);
    M.arts.forEach((a, i) => {
      const tf = new Map();
      for (const j of jetons(a.texte)) tf.set(j, (tf.get(j) || 0) + 1);
      longueurs[i] = [...tf.values()].reduce((s, v) => s + v, 0);
      for (const [j, f] of tf) { let l = idx.get(j); if (!l) idx.set(j, l = []); l.push(i, f); }
    });
    M.index = { idx, longueurs, moy: longueurs.reduce((s, v) => s + v, 0) / longueurs.length };
    M.parRef = new Map(M.arts.map((a, i) => [refCle(a.cle, a.article, a.annexe), i]));
    return M;
  }

  function rechercher(requete, { code = null, max = 8 } = {}) {
    const { idx, longueurs, moy } = M.index, N = M.arts.length, k1 = 1.4, b = 0.75;
    const scores = new Map();
    for (const j of new Set(jetons(requete))) {
      const l = idx.get(j); if (!l) continue;
      const df = l.length / 2, idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      for (let p = 0; p < l.length; p += 2) {
        const i = l[p], f = l[p + 1];
        if (code && M.arts[i].cle !== code) continue;
        scores.set(i, (scores.get(i) || 0) + idf * f * (k1 + 1) / (f + k1 * (1 - b + b * longueurs[i] / moy)));
      }
    }
    return [...scores].sort((x, y) => y[1] - x[1]).slice(0, max).map(([i]) => M.arts[i]);
  }

  function normCode(c) {
    if (!c) return null;
    const s = String(c).trim();
    if (M.codes[s]) return s;
    const u = s.toUpperCase().replace(/\s+/g, "");
    if (M.codes[u]) return u;
    const alias = { DAHIRDESOBLIGATIONSETCONTRATS: "DOC", COC: "DOC", CODEDECOMMERCE: "CCOM", CC: "CCOM", CODEPENAL: "CP",
      CODEDEPROCEDUREPENALE: "CPP", CODEDEPROCEDURECIVILE: "CPC", CODEDUTRAVAIL: "CT", CONSTITUTION: "CONST", CODEDELAFAMILLE: "CF" };
    const sans = u.normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (alias[sans]) return alias[sans];
    const m = /^LOI?N?°?(\d+)[-.](\d+)$/.exec(sans); if (m && M.codes[`L${m[1]}-${m[2]}`]) return `L${m[1]}-${m[2]}`;
    const t = Object.entries(M.codes).find(([, v]) => v.titre.toLowerCase() === s.toLowerCase());
    return t ? t[0] : null;
  }
  function normArticle(a) {
    let s = String(a ?? "").toLowerCase().replace(/^(article|art\.?|المادة|الفصل)\s*/i, "").trim();
    if (s === "premier" || s === "1er") s = "1";
    return s.replace(/\s*[.\-]\s*/g, "-").replace(/\s+/g, " ");
  }
  function trouverArticle(code, article) {
    const cle = normCode(code); if (!cle) return null;
    const n = normArticle(article);
    const i = M.parRef.get(refCle(cle, n, 0)) ?? M.parRef.get(refCle(cle, n, 1));
    return i == null ? null : M.arts[i];
  }
  const nomCourt = cle => M.codes?.[cle] ? (M.codes[cle].principal ? cle : M.codes[cle].titre.slice(0, 50)) : cle;

  function catalogue() {
    return Object.entries(M.codes).filter(([, v]) => v.principal)
      .map(([k, v]) => `${k} : ${v.titre} [${v.langue}${v.version ? ", version " + v.version : ""}${v.statut && !/^en vigueur$/.test(v.statut) ? ", " + v.statut : ""}]`).join("\n");
  }

  // Outils au format { name, description, inputSchema, execute(input) } ; trace(message) signale la progression.
  function outils(trace = () => {}) {
    return [
      {
        name: "chercher_articles",
        description: "Recherche plein texte dans la base des textes juridiques marocains (articles en français et en arabe). Renvoie jusqu'à 8 articles {code, article, langue, statut, extrait}. Interroge en français ET en arabe pour couvrir les textes arabes (ex. « garde à vue » puis « الحراسة النظرية »).",
        inputSchema: { type: "object", properties: { requete: { type: "string", description: "mots-clés juridiques, en français ou en arabe" }, code: { type: "string", description: "clé du code pour limiter la recherche (facultatif), ex. DOC, CPP" } }, required: ["requete"] },
        execute: async ({ requete, code }) => {
          const cle = code ? normCode(code) : null;
          trace(`recherche « ${String(requete).slice(0, 60)} »${cle ? " dans " + nomCourt(cle) : ""}`);
          return rechercher(String(requete), { code: cle }).map(a => ({ code: a.cle, article: a.article, annexe: !!a.annexe, langue: M.codes[a.cle].langue,
            statut: M.codes[a.cle].statut || "", titre_texte: M.codes[a.cle].titre.slice(0, 80), extrait: a.texte.slice(0, 380) }));
        },
      },
      {
        name: "lire_article",
        description: "Lit le texte exact d'un article dans la base : {code, article, langue, statut, version, texte}. À utiliser pour vérifier un article avant de le citer. code = clé (DOC, CCOM, CP, CPP, CPC, CT, CGI, CONST, L38-15…), article = numéro (« 259 », « 40-1 », « 1 »).",
        inputSchema: { type: "object", properties: { code: { type: "string" }, article: { type: "string" } }, required: ["code", "article"] },
        execute: async ({ code, article }) => {
          const cle = normCode(code);
          trace(`lecture de l'article ${article} ${cle ? nomCourt(cle) : code}`);
          if (!cle) throw new Error(`Code inconnu « ${code} ». Clés disponibles : ${Object.keys(M.codes).filter(k => M.codes[k].principal).join(", ")}`);
          const a = trouverArticle(cle, article);
          if (!a) throw new Error(`Article ${article} introuvable dans ${cle}. Vérifie le numéro avec chercher_articles.`);
          const c = M.codes[cle];
          return { code: cle, article: a.article, langue: c.langue, statut: c.statut || "", version: c.version || "", titre_texte: c.titre, texte: a.texte.slice(0, 3500) };
        },
      },
    ];
  }

  Object.assign(M, { jetons, charger, rechercher, normCode, normArticle, trouverArticle, nomCourt, catalogue, outils });
  if (typeof module !== "undefined" && module.exports) module.exports = M;
  else racine.Moteur = M;
})(typeof globalThis !== "undefined" ? globalThis : this);
