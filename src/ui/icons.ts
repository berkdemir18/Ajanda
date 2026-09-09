/**
 * Ajanda ikon seti — elle çizilmiş, tek gramaj.
 *
 * Kural: 24×24 kutu, 1.7 kalınlık, yuvarlak uç ve birleşim, dolgu yok,
 * renk `currentColor`. Emoji ya da unicode glif kullanılmaz; hepsi aynı
 * kalemden çıkmış görünmek zorunda.
 */

const YOLLAR: Record<string, string> = {
  // gezinme
  sol: `<path d="M14.5 5.5 8 12l6.5 6.5"/>`,
  sag: `<path d="M9.5 5.5 16 12l-6.5 6.5"/>`,
  asagi: `<path d="M5.5 9.5 12 16l6.5-6.5"/>`,
  yukari: `<path d="M18.5 14.5 12 8l-6.5 6.5"/>`,

  // eylemler
  arti: `<path d="M12 5v14M5 12h14"/>`,
  onay: `<path d="M4.5 12.5 9.5 17.5 19.5 7"/>`,
  kapat: `<path d="M6 6l12 12M18 6L6 18"/>`,
  ara: `<circle cx="10.75" cy="10.75" r="6.25"/><path d="M15.5 15.5 20 20"/>`,
  cop: `<path d="M4.5 6.5h15M9 6.5V4.8a1.3 1.3 0 0 1 1.3-1.3h3.4A1.3 1.3 0 0 1 15 4.8v1.7"/>
        <path d="M6.5 6.5 7.4 19a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12.5"/>
        <path d="M10.3 10v6.6M13.7 10v6.6"/>`,

  // durum ve nesneler
  senkron: `<path d="M20 12a8 8 0 0 1-13.8 5.5"/><path d="M4 12a8 8 0 0 1 13.8-5.5"/>
            <path d="M17.5 2.8v3.9h-3.9"/><path d="M6.5 21.2v-3.9h3.9"/>`,
  ayar: `<path d="M5 7.5h6M15.5 7.5H19"/><path d="M5 16.5h3.5M13 16.5h6"/>
         <circle cx="13.2" cy="7.5" r="2.2"/><circle cx="10.8" cy="16.5" r="2.2"/>`,
  tekrar: `<path d="M4.5 9.5a4 4 0 0 1 4-4h11"/><path d="M16.5 2.6l3 2.9-3 2.9"/>
           <path d="M19.5 14.5a4 4 0 0 1-4 4h-11"/><path d="M7.5 21.4l-3-2.9 3-2.9"/>`,
  zil: `<path d="M18 9.2a6 6 0 1 0-12 0c0 5-2 6.3-2 6.3h16s-2-1.3-2-6.3Z"/>
        <path d="M13.7 19.2a2 2 0 0 1-3.4 0"/>`,
  saat: `<circle cx="12" cy="12" r="8.25"/><path d="M12 7.2V12l3.2 2"/>`,
  yer: `<path d="M19 10.2c0 5-7 11-7 11s-7-6-7-11a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2.6"/>`,
  takvim: `<rect x="3.75" y="5.25" width="16.5" height="15" rx="2.5"/>
           <path d="M3.75 10h16.5M8.5 3.5v3.4M15.5 3.5v3.4"/>`,
  gunes: `<circle cx="12" cy="12" r="4.2"/>
          <path d="M12 3.2v2M12 18.8v2M3.2 12h2M18.8 12h2M5.8 5.8l1.4 1.4M16.8 16.8l1.4 1.4M18.2 5.8l-1.4 1.4M7.2 16.8l-1.4 1.4"/>`,
  ay: `<path d="M20 14.2A8.4 8.4 0 0 1 9.8 4 8.4 8.4 0 1 0 20 14.2Z"/>`,
  uyari: `<path d="M12 4.8 2.9 20h18.2L12 4.8Z"/><path d="M12 10.2v4.4M12 17.4h.01"/>`,
  bulut: `<path d="M7.2 18.5a4.2 4.2 0 0 1-.4-8.4 5.6 5.6 0 0 1 10.8-1 3.9 3.9 0 0 1 .3 7.7"/>
          <path d="M12 12.4v8M9.2 17.6 12 20.4l2.8-2.8"/>`,
  kesik: `<path d="M4.2 4.2 19.8 19.8"/>
          <path d="M7.2 18.5a4.2 4.2 0 0 1-.4-8.4 5.6 5.6 0 0 1 2-3.3"/>
          <path d="M10.6 5.5a5.6 5.6 0 0 1 7 4.6 3.9 3.9 0 0 1 .3 7.7"/>`,
  disari: `<path d="M13.5 4.5H19.5V10.5"/><path d="M19.5 4.5 11 13"/>
           <path d="M18 14v4.5a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2H11"/>`,
};

export type IkonAdi = keyof typeof YOLLAR;

/** İstenen ikonu SVG öğesi olarak üretir. */
export function ikon(ad: string, boyut = 18): SVGSVGElement {
  const yol = YOLLAR[ad];
  if (!yol) throw new Error(`ikon yok: ${ad}`);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(boyut));
  svg.setAttribute("height", String(boyut));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.7");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("ikon");
  svg.innerHTML = yol;
  return svg;
}

/**
 * Uygulama markası: "A" harfi ve ortasından geçip iki yandan taşan çizgi —
 * arayüzdeki "şimdi" çizgisinin ta kendisi. Gün, adın içinden geçer.
 *
 * Arayüzde kapsız ve tek renk kullanılır; yuvarlatılmış turuncu karo yalnız
 * uygulama ikonudur (`src-tauri/icons/`). Geometri iki yerde birebir aynıdır.
 */
export function logo(boyut = 24): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(boyut));
  svg.setAttribute("height", String(boyut));
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("logo");
  svg.innerHTML = `
    <path d="M10.72 4.5H12L9.72 19.7H7Z" fill="currentColor"/>
    <path d="M12 4.5h1.28L17 19.7h-2.72Z" fill="currentColor"/>
    <rect x="3.9" y="13.6" width="16.2" height="1.7" rx="0.85" fill="currentColor"/>`;
  return svg;
}

/** Doldurulmuş küçük rozet/nokta için: takvim rengini taşıyan disk. */
export function renkDiski(renk: string, boyut = 10): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 10 10");
  svg.setAttribute("width", String(boyut));
  svg.setAttribute("height", String(boyut));
  svg.classList.add("ikon", "disk");
  svg.innerHTML = `<circle cx="5" cy="5" r="4" fill="${renk}"/>`;
  return svg;
}
