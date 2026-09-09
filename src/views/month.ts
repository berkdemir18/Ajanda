import {
  GUNLER_KISA,
  ayGridBasi,
  bugunMu,
  gunBasi,
  gunEkle,
  gunSonu,
  haftaGunu,
  saat,
} from "../core/date";
import { state, takvimRengi, tariheGit } from "../core/store";
import type { Occurrence } from "../core/types";
import { h } from "../ui/dom";
import { ikon, renkDiski } from "../ui/icons";
import { olayDuzenleyici } from "../ui/editor";
import { gunPaneli } from "./daypanel";

const SATIR = 6;

/** Tekrarlı olayların başındaki küçük döngü işareti. */
function tekrarIsareti(): SVGSVGElement {
  const i = ikon("tekrar", 11);
  i.classList.add("tekrar-isareti");
  return i;
}
const SERIT_YUK = 19;

/** Bir haftaya düşen, birden çok günü kaplayan olay. */
interface Serit {
  o: Occurrence;
  ilk: number; // 0-6, hafta içindeki başlangıç sütunu
  son: number; // 0-6, dahil
  solAcik: boolean; // önceki haftadan devam ediyor
  sagAcik: boolean; // sonraki haftaya taşıyor
  kulvar: number;
}

function gunFarki(a: Date, b: Date): number {
  return Math.round((gunBasi(b).getTime() - gunBasi(a).getTime()) / 86400000);
}

/** Şerit adayı mı: tüm gün olayı ya da birden fazla güne yayılan olay. */
function seritMi(o: Occurrence): boolean {
  return o.event.allDay || gunFarki(o.start, o.end) >= 1;
}

/** Haftaya düşen şeritleri kulvarlara dizer (üst üste binmesinler). */
function seritleriDiz(haftaBas: Date, liste: Occurrence[]): Serit[] {
  const haftaSon = gunSonu(gunEkle(haftaBas, 6));
  const adaylar = liste
    .filter(
      (o) =>
        seritMi(o) &&
        o.end.getTime() >= haftaBas.getTime() &&
        o.start.getTime() <= haftaSon.getTime(),
    )
    .sort(
      (a, b) =>
        a.start.getTime() - b.start.getTime() ||
        b.end.getTime() - a.end.getTime(),
    );

  const dolu: boolean[][] = []; // kulvar → 7 gün
  const out: Serit[] = [];

  for (const o of adaylar) {
    const ilk = Math.max(0, gunFarki(haftaBas, o.start));
    const son = Math.min(6, gunFarki(haftaBas, o.end));
    let kulvar = 0;
    for (;;) {
      if (!dolu[kulvar]) dolu[kulvar] = new Array(7).fill(false);
      const uygun = dolu[kulvar].slice(ilk, son + 1).every((x) => !x);
      if (uygun) {
        for (let i = ilk; i <= son; i++) dolu[kulvar][i] = true;
        break;
      }
      kulvar++;
    }
    out.push({
      o,
      ilk,
      son,
      solAcik: o.start.getTime() < haftaBas.getTime(),
      sagAcik: o.end.getTime() > haftaSon.getTime(),
      kulvar,
    });
  }
  return out;
}

export function ayGorunumu(): HTMLElement {
  const ilkGun = ayGridBasi(state.anchor);
  const buAy = state.anchor.getMonth();

  const basliklar = h(
    "div",
    { sinif: "ay-basliklar" },
    ...GUNLER_KISA.map((g) => h("div", { metin: g })),
  );

  const govde = h("div", {
    sinif: "ay-govde",
    stil: { gridTemplateRows: `repeat(${SATIR}, minmax(0, 1fr))` },
  });

  for (let hafta = 0; hafta < SATIR; hafta++) {
    const haftaBas = gunEkle(ilkGun, hafta * 7);
    const seritler = seritleriDiz(haftaBas, state.occurrences);
    const kulvarSayisi = seritler.reduce((m, s) => Math.max(m, s.kulvar + 1), 0);
    const ayrilan = kulvarSayisi * SERIT_YUK;

    const satir = h("div", { sinif: "ay-hafta" });

    // --- günler
    for (let i = 0; i < 7; i++) {
      const gun = gunEkle(haftaBas, i);
      const dis = gun.getMonth() !== buAy;

      const tekGunlukler = state.occurrences
        .filter(
          (o) =>
            !seritMi(o) &&
            o.end.getTime() >= gunBasi(gun).getTime() &&
            o.start.getTime() <= gunSonu(gun).getTime(),
        )
        .sort((a, b) => a.start.getTime() - b.start.getTime());

      const hepsi = [
        ...seritler.filter((s) => i >= s.ilk && i <= s.son).map((s) => s.o),
        ...tekGunlukler,
      ];

      const hucre = h("div", {
        sinif: `ay-hucre ${dis ? "dis" : ""} ${bugunMu(gun) ? "bugun" : ""}`,
        ondblclick: (e: MouseEvent) => {
          if ((e.target as HTMLElement).closest(".ay-olay, .ay-serit")) return;
          const b = new Date(gun);
          b.setHours(9, 0, 0, 0);
          olayDuzenleyici({ start: b, end: new Date(b.getTime() + 3600000) });
        },
      });

      hucre.append(h("div", { sinif: "gun-no", metin: String(gun.getDate()) }));
      // Şeritler mutlak konumlu; hücrede onlara yer ayır.
      if (ayrilan) {
        hucre.append(h("div", { stil: { height: `${ayrilan}px`, flex: "none" } }));
      }

      const sinir = Math.max(1, 4 - kulvarSayisi);
      for (const o of tekGunlukler.slice(0, sinir)) hucre.append(ayOlayi(o, gun));

      const kalan = tekGunlukler.length - sinir;
      if (kalan > 0) {
        hucre.append(
          h("div", {
            sinif: "daha",
            metin: `+${kalan} daha`,
            tikla: (e: MouseEvent) => {
              e.stopPropagation();
              gunPaneli(gun, hepsi);
            },
          }),
        );
      }

      hucre.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).closest(".ay-olay, .daha, .ay-serit")) return;
        tariheGit(gun);
      });

      satir.append(hucre);
    }

    // --- şeritler (hücrelerin üstünde, sütunları aşarak)
    if (seritler.length) {
      const katman = h("div", { sinif: "ay-seritler" });
      for (const s of seritler) {
        const sol = (s.ilk / 7) * 100;
        const gen = ((s.son - s.ilk + 1) / 7) * 100;
        // Haftaya taşan uçlar kenara yaslanır ki şerit kesintisiz görünsün.
        const solBosluk = s.solAcik ? 0 : 4;
        const sagBosluk = s.sagAcik ? 0 : 4;
        katman.append(
          h(
            "div",
            {
              sinif: `ay-serit ${s.solAcik ? "sol-acik" : ""} ${
                s.sagAcik ? "sag-acik" : ""
              } ${s.o.event.done ? "bitti" : ""}`,
              stil: {
                "--renk": takvimRengi(s.o.event),
                left: `calc(${sol}% + ${solBosluk}px)`,
                width: `calc(${gen}% - ${solBosluk + sagBosluk}px)`,
                top: `${28 + s.kulvar * SERIT_YUK}px`,
              },
              attr: { title: s.o.event.title },
              tikla: (e: MouseEvent) => {
                e.stopPropagation();
                olayDuzenleyici({ event: s.o.event });
              },
            },
            s.o.repeated ? tekrarIsareti() : null,
            s.o.event.allDay
              ? ""
              : `${saat(s.o.start)} `,
            s.o.event.title || "(başlıksız)",
          ),
        );
      }
      satir.append(katman);
    }

    govde.append(satir);
  }

  return h("div", { sinif: "ay" }, basliklar, govde);
}

export function ayOlayi(o: Occurrence, gun: Date): HTMLElement {
  const gecmis = o.end.getTime() < Date.now();
  return h(
    "div",
    {
      sinif: `ay-olay ${o.event.done ? "bitti" : ""}`,
      stil: { "--renk": takvimRengi(o.event), opacity: gecmis ? "0.62" : "" },
      attr: {
        title: `${o.event.title}${o.event.location ? " · " + o.event.location : ""}`,
      },
      tikla: (e: MouseEvent) => {
        e.stopPropagation();
        olayDuzenleyici({ event: o.event });
      },
    },
    renkDiski(takvimRengi(o.event), 7),
    o.start.getTime() < gunBasi(gun).getTime()
      ? null
      : h("span", { sinif: "saat", metin: saat(o.start) }),
    h(
      "span",
      { sinif: "ad" },
      o.repeated ? tekrarIsareti() : null,
      o.event.title || "(başlıksız)",
    ),
  );
}

/** Kenar çubuğundaki mini ay. */
export function miniAy(
  odak: Date,
  secili: Date,
  sec: (d: Date) => void,
  ayDegis: (n: number) => void,
): HTMLElement {
  const ilk = ayGridBasi(odak);
  const doluGunler = new Set(
    state.occurrences.map((o) => gunBasi(o.start).toDateString()),
  );

  const grid = h(
    "div",
    { sinif: "mini-grid" },
    ...GUNLER_KISA.map((g) => h("div", { sinif: "bas", metin: g[0] })),
  );

  for (let i = 0; i < 42; i++) {
    const g = gunEkle(ilk, i);
    const dis = g.getMonth() !== odak.getMonth();
    grid.append(
      h(
        "div",
        {
          sinif: `mini-gun ${dis ? "dis" : ""} ${
            g.toDateString() === secili.toDateString() ? "secili" : ""
          } ${bugunMu(g) ? "bugun" : ""}`,
          metin: String(g.getDate()),
          tikla: () => sec(g),
        },
        doluGunler.has(g.toDateString()) ? h("span", { sinif: "nokta" }) : null,
      ),
    );
  }

  return h(
    "div",
    { sinif: "mini" },
    h(
      "div",
      { sinif: "mini-ust" },
      h("button", { metin: "‹", tikla: () => ayDegis(-1) }),
      h("span", {
        metin: odak.toLocaleDateString("tr-TR", { month: "long", year: "numeric" }),
      }),
      h("button", { metin: "›", tikla: () => ayDegis(1) }),
    ),
    grid,
  );
}

export function haftaSonuMu(d: Date): boolean {
  return haftaGunu(d) >= 5;
}
