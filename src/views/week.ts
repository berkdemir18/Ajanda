import { api } from "../core/api";
import {
  GUNLER_KISA,
  bugunMu,
  gunBasi,
  gunEkle,
  gunSonu,
  haftaBasi,
  haftaGunu,
  rfc3339,
  saat,
  ymd,
} from "../core/date";
import { state, takvimRengi, tariheGit, yukle } from "../core/store";
import type { Occurrence } from "../core/types";
import { h } from "../ui/dom";
import { ikon } from "../ui/icons";
import { olayDuzenleyici } from "../ui/editor";
import { tost } from "../ui/toast";

const SAAT_YUK = 54; // --saat-yuk ile aynı
const ADIM_DK = 15;
const OLUK = 62; // --oluk ile aynı

/** Görünüm yeniden çizilse de saat ızgarasının kaydırma konumu korunur. */
let sonKaydirma: number | null = null;

interface Yerlesim {
  o: Occurrence;
  sutun: number;
  toplam: number;
}

/** Çakışan olayları yan yana yerleştirir (küme → sütun ataması). */
function yerlestir(liste: Occurrence[]): Yerlesim[] {
  const sirali = [...liste].sort(
    (a, b) =>
      a.start.getTime() - b.start.getTime() ||
      b.end.getTime() - a.end.getTime(),
  );
  const out: Yerlesim[] = [];
  let kume: Occurrence[] = [];
  let kumeSon = 0;

  const bosalt = () => {
    if (!kume.length) return;
    const sutunlar: Occurrence[][] = [];
    for (const o of kume) {
      let kondu = false;
      for (const s of sutunlar) {
        if (s[s.length - 1].end.getTime() <= o.start.getTime()) {
          s.push(o);
          kondu = true;
          break;
        }
      }
      if (!kondu) sutunlar.push([o]);
    }
    sutunlar.forEach((s, i) =>
      s.forEach((o) => out.push({ o, sutun: i, toplam: sutunlar.length })),
    );
    kume = [];
    kumeSon = 0;
  };

  for (const o of sirali) {
    if (kume.length && o.start.getTime() >= kumeSon) bosalt();
    kume.push(o);
    kumeSon = Math.max(kumeSon, o.end.getTime());
  }
  bosalt();
  return out;
}

function dakikaKonum(d: Date, gun: Date): number {
  const fark = (d.getTime() - gunBasi(gun).getTime()) / 60000;
  return Math.max(0, Math.min(24 * 60, fark));
}

function yuvarla(dk: number): number {
  return Math.round(dk / ADIM_DK) * ADIM_DK;
}

/** Tekrarlı olayların başındaki küçük döngü işareti. */
function tekrarIsareti(): SVGSVGElement {
  const i = ikon("tekrar", 11);
  i.classList.add("tekrar-isareti");
  return i;
}

/** Görünen günlerdeki en erken zamanlı etkinliğin saati (yoksa 8). */
function gununIlkSaatleri(gunler: Date[]): number[] {
  const bas = gunBasi(gunler[0]).getTime();
  const bit = gunSonu(gunler[gunler.length - 1]).getTime();
  const saatler = state.occurrences
    .filter(
      (o) =>
        !o.event.allDay &&
        o.end.getTime() >= bas &&
        o.start.getTime() <= bit,
    )
    .map((o) => o.start.getHours());
  return saatler.length ? saatler : [8];
}

function saatMetni(dk: number): string {
  const h1 = Math.floor(dk / 60) % 24;
  const m = dk % 60;
  return `${String(h1).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function haftaGorunumu(gunSayisi: 1 | 7): HTMLElement {
  const ilk = gunSayisi === 1 ? gunBasi(state.anchor) : haftaBasi(state.anchor);
  const gunler = Array.from({ length: gunSayisi }, (_, i) => gunEkle(ilk, i));
  const sutunlar = `56px repeat(${gunSayisi}, minmax(0, 1fr))`;

  // ---------- üst başlıklar
  const ust = h(
    "div",
    { sinif: "hafta-ust", stil: { gridTemplateColumns: sutunlar } },
    h("div", { sinif: "kose" }),
    ...gunler.map((g) =>
      h(
        "div",
        {
          sinif: `gun-basligi ${bugunMu(g) ? "bugun" : ""} ${
            haftaGunu(g) >= 5 ? "hafta-sonu" : ""
          }`,
          tikla: () => {
            state.view = "gun";
            localStorage.setItem("view", "gun");
            tariheGit(g);
          },
        },
        h("div", { sinif: "ad", metin: GUNLER_KISA[haftaGunu(g)] }),
        h("div", { sinif: "sayi", metin: String(g.getDate()) }),
      ),
    ),
  );

  // ---------- tüm gün şeridi
  const serit = h("div", {
    sinif: "tumgun",
    stil: { gridTemplateColumns: sutunlar },
  });
  serit.append(h("div", { sinif: "etiket", metin: "Tüm gün" }));
  for (const g of gunler) {
    const hucre = h("div", {
      sinif: "tumgun-hucre",
      ondblclick: () =>
        olayDuzenleyici({ start: g, end: g, allDay: true }),
    });
    const tumGunler = state.occurrences.filter(
      (o) =>
        o.event.allDay &&
        o.end.getTime() >= gunBasi(g).getTime() &&
        o.start.getTime() <= gunSonu(g).getTime(),
    );
    for (const o of tumGunler) {
      hucre.append(
        h("div", {
          sinif: `serit-olay ${o.event.done ? "bitti" : ""}`,
          stil: { "--renk": takvimRengi(o.event) },
          metin: o.event.title,
          attr: { title: o.event.title },
          tikla: (e: MouseEvent) => {
            e.stopPropagation();
            olayDuzenleyici({ event: o.event });
          },
        }),
      );
    }
    serit.append(hucre);
  }

  // ---------- saat ızgarası
  const izgara = h("div", {
    sinif: "izgara",
    stil: { gridTemplateColumns: sutunlar, minHeight: `${24 * SAAT_YUK}px` },
  });

  const oluk = h("div", { sinif: "oluk" });
  for (let s = 0; s < 24; s++) {
    oluk.append(
      h(
        "div",
        { sinif: "oluk-hucre" },
        s === 0
          ? null
          : h("span", {
              sinif: "oluk-etiket",
              metin: `${String(s).padStart(2, "0")}:00`,
            }),
      ),
    );
  }
  // "Şimdi" saatini oluğun içinde, çizginin tam hizasında taşı.
  const bugunVar = gunler.some((g) => bugunMu(g));
  const simdiY = (dakikaKonum(new Date(), new Date()) / 60) * SAAT_YUK;
  if (bugunVar) {
    oluk.append(
      h("div", {
        sinif: "simdi-etiket",
        metin: saat(new Date()),
        stil: { top: `${simdiY}px` },
      }),
    );
  }
  izgara.append(oluk);

  const sar = h("div", { sinif: "izgara-sar" }, izgara);

  for (const g of gunler) {
    const sutun = h("div", {
      sinif: `gun-sutun ${bugunMu(g) ? "bugun" : ""} ${
        haftaGunu(g) >= 5 ? "hafta-sonu" : ""
      }`,
    });
    for (let s = 0; s < 24; s++) {
      // Gecenin ölü saatleri geri çekilir; göz kendiliğinden güne düşer.
      const sessiz = s < 6 || s >= 23;
      sutun.append(h("div", { sinif: `saat-cizgi ${sessiz ? "sessiz" : ""}` }));
    }

    // şimdi çizgisi
    if (bugunMu(g)) {
      const simdi = new Date();
      const y = (dakikaKonum(simdi, g) / 60) * SAAT_YUK;
      sutun.append(h("div", { sinif: "simdi-cizgi", stil: { top: `${y}px` } }));
    }

    const gununOlaylari = state.occurrences.filter(
      (o) =>
        !o.event.allDay &&
        o.end.getTime() > gunBasi(g).getTime() &&
        o.start.getTime() < gunSonu(g).getTime(),
    );

    for (const { o, sutun: c, toplam } of yerlestir(gununOlaylari)) {
      const basDk = dakikaKonum(o.start, g);
      const bitDk = dakikaKonum(o.end, g);
      const yuk = Math.max(17, ((bitDk - basDk) / 60) * SAAT_YUK - 2);
      const genislik = 100 / toplam;
      const gecmis = o.end.getTime() < Date.now();

      const kutu = h(
        "div",
        {
          sinif: `olay ${yuk < 34 ? "kisa" : ""} ${o.event.done ? "bitti" : ""} ${
            gecmis ? "gecmis" : ""
          }`,
          stil: {
            "--renk": takvimRengi(o.event),
            top: `${(basDk / 60) * SAAT_YUK}px`,
            height: `${yuk}px`,
            left: `calc(${c * genislik}% + 2px)`,
            width: `calc(${genislik}% - 4px)`,
          },
          attr: { title: `${saat(o.start)}–${saat(o.end)} ${o.event.title}` },
        },
        h(
          "div",
          { sinif: "ad" },
          o.repeated ? tekrarIsareti() : null,
          o.event.title || "(başlıksız)",
        ),
        h("div", {
          sinif: "alt",
          metin: o.event.location
            ? `${saat(o.start)} · ${o.event.location}`
            : `${saat(o.start)} – ${saat(o.end)}`,
        }),
        o.repeated ? null : h("div", { sinif: "tutamac" }),
      );

      surukleBagla(kutu, o, g, sar);
      sutun.append(kutu);
    }

    izgara.append(sutun);
  }

  // Rozet oluktaki hâliyle, çizgi ise bugünün sütununda duruyor. Izgaranın
  // tamamını kat eden soluk hat ikisini gözde tek bir nesne hâline getiriyor.
  const bugunIndex = gunler.findIndex((g) => bugunMu(g));
  if (bugunIndex >= 0) {
    // Bağlayıcı yalnızca oluktan bugünün sütununa kadar uzanır. Izgaranın
    // tamamını kat etseydi bugün olmayan günlerde de "şimdi" iddia ederdi.
    izgara.append(
      h("div", {
        sinif: "simdi-hat",
        stil: {
          top: `${simdiY}px`,
          right: `calc((100% - ${OLUK}px) * ${gunSayisi - bugunIndex} / ${gunSayisi})`,
        },
      }),
    );
  }

  // boş alana sürükleyerek etkinlik oluşturma
  bosAlanBagla(izgara, gunler, sar);

  // Açılıştaki tek yazılı an: "şimdi" çizgisi bir kez soldan uzayarak gelir.
  // Yalnız oturumun ilk çiziminde; dakikalık tazelemede tekrarlamaz.
  if (bugunVar && sonKaydirma === null) {
    izgara.classList.add("acilis");
    setTimeout(() => izgara.classList.remove("acilis"), 1000);
  }

  // Izgara dakikada bir yeniden çiziliyor ("şimdi" çizgisi için); kaydırma
  // konumu korunmazsa kullanıcı her dakika başa fırlatılıyordu.
  // Konumlanma tamamlanmadan gelen scroll olayi 0 kaydedip varsayilan
  // konumu eziyordu; once yerles, sonra dinlemeye basla.
  let yerlesti = false;
  sar.addEventListener("scroll", () => {
    if (yerlesti) sonKaydirma = sar.scrollTop;
  });
  queueMicrotask(() => {
    if (sonKaydirma !== null) {
      sar.scrollTop = sonKaydirma;
    } else {
      // Uygulama "bugün ne var" sorusunu cevaplamak için açılıyor: günün ilk
      // etkinliğinden bir saat önceden başla, ama şimdiyi de dışarıda bırakma.
      // Sabit bir "şimdi eksi 2 saat" akşam saatlerinde günün başını kesiyordu.
      const ilkOlay = Math.min(
        ...gununIlkSaatleri(gunler),
        bugunVar ? new Date().getHours() : 24,
      );
      const hedef = Math.max(0, Math.min(ilkOlay - 1, 22));
      sar.scrollTop = hedef * SAAT_YUK;
      // Alt sınıra dayanırsa konum saat çizgisine oturmalı; yoksa ekranın
      // tepesinde başlığı kesilmiş bir blok kalıyor.
      sar.scrollTop = Math.floor(sar.scrollTop / SAAT_YUK) * SAAT_YUK;
    }
    yerlesti = true;
  });

  return h("div", { sinif: "hafta" }, ust, serit, sar);
}

// ------------------------------------------------------------ etkileşimler

function sutunGenisligi(izgara: HTMLElement, gunSayisi: number): number {
  return (izgara.clientWidth - 56) / gunSayisi;
}

function bosAlanBagla(
  izgara: HTMLElement,
  gunler: Date[],
  sar: HTMLElement,
): void {
  izgara.addEventListener("mousedown", (e) => {
    const hedef = e.target as HTMLElement;
    if (!hedef.classList.contains("gun-sutun") && !hedef.classList.contains("saat-cizgi"))
      return;
    if (e.button !== 0) return;

    const kutu = izgara.getBoundingClientRect();
    const gw = sutunGenisligi(izgara, gunler.length);
    const gunIndex = Math.max(
      0,
      Math.min(gunler.length - 1, Math.floor((e.clientX - kutu.left - 56) / gw)),
    );
    const y0 = e.clientY - kutu.top;
    const basDk = yuvarla((y0 / SAAT_YUK) * 60);

    const hayalet = h("div", { sinif: "secim-hayalet" });
    izgara.append(hayalet);
    let bitDk = basDk + 30;

    const ciz = () => {
      const a = Math.min(basDk, bitDk);
      const b = Math.max(basDk, bitDk);
      hayalet.style.top = `${(a / 60) * SAAT_YUK}px`;
      hayalet.style.height = `${Math.max(14, ((b - a) / 60) * SAAT_YUK)}px`;
      hayalet.style.left = `${56 + gunIndex * gw + 2}px`;
      hayalet.style.width = `${gw - 6}px`;
      hayalet.textContent = `${saatMetni(a)} – ${saatMetni(b)}`;
    };
    ciz();

    const hareket = (ev: MouseEvent) => {
      const y = ev.clientY - izgara.getBoundingClientRect().top;
      bitDk = Math.max(ADIM_DK, Math.min(24 * 60, yuvarla((y / SAAT_YUK) * 60)));
      ciz();
      // kenara gelince kaydır
      const sarKutu = sar.getBoundingClientRect();
      if (ev.clientY > sarKutu.bottom - 24) sar.scrollTop += 10;
      if (ev.clientY < sarKutu.top + 24) sar.scrollTop -= 10;
    };

    const birak = () => {
      document.removeEventListener("mousemove", hareket);
      document.removeEventListener("mouseup", birak);
      hayalet.remove();
      const a = Math.min(basDk, bitDk);
      const b = Math.max(basDk, bitDk === basDk ? basDk + 60 : bitDk);
      const gun = gunler[gunIndex];
      const bas = new Date(gun);
      bas.setHours(Math.floor(a / 60), a % 60, 0, 0);
      const bit = new Date(gun);
      bit.setHours(Math.floor(b / 60), b % 60, 0, 0);
      olayDuzenleyici({ start: bas, end: bit });
    };

    document.addEventListener("mousemove", hareket);
    document.addEventListener("mouseup", birak);
    e.preventDefault();
  });
}

function surukleBagla(
  kutu: HTMLElement,
  o: Occurrence,
  gun: Date,
  sar: HTMLElement,
): void {
  let surukledi = false;

  kutu.addEventListener("click", (e) => {
    e.stopPropagation();
    if (surukledi) {
      surukledi = false;
      return;
    }
    olayDuzenleyici({ event: o.event });
  });

  if (o.repeated) return; // tekrarlarda sürükleme yok: ana kaydı bozar

  kutu.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const boyutlandir = (e.target as HTMLElement).classList.contains("tutamac");
    const baslangicY = e.clientY;
    const ilkTop = parseFloat(kutu.style.top);
    const ilkYuk = parseFloat(kutu.style.height);
    const sureDk = (o.end.getTime() - o.start.getTime()) / 60000;
    let kaymaDk = 0;

    const hareket = (ev: MouseEvent) => {
      const dy = ev.clientY - baslangicY;
      if (!surukledi && Math.abs(dy) < 4) return;
      surukledi = true;
      kutu.classList.add("tasiniyor");
      kaymaDk = yuvarla((dy / SAAT_YUK) * 60);
      if (boyutlandir) {
        const yeniYuk = Math.max(
          (ADIM_DK / 60) * SAAT_YUK,
          ilkYuk + (kaymaDk / 60) * SAAT_YUK,
        );
        kutu.style.height = `${yeniYuk}px`;
      } else {
        kutu.style.top = `${Math.max(0, ilkTop + (kaymaDk / 60) * SAAT_YUK)}px`;
      }
      const sarKutu = sar.getBoundingClientRect();
      if (ev.clientY > sarKutu.bottom - 20) sar.scrollTop += 8;
      if (ev.clientY < sarKutu.top + 20) sar.scrollTop -= 8;
    };

    const birak = async () => {
      document.removeEventListener("mousemove", hareket);
      document.removeEventListener("mouseup", birakSar);
      kutu.classList.remove("tasiniyor");
      if (!surukledi || kaymaDk === 0) return;

      const yeniBas = boyutlandir
        ? new Date(o.start)
        : new Date(o.start.getTime() + kaymaDk * 60000);
      const yeniBit = boyutlandir
        ? new Date(
            o.start.getTime() +
              Math.max(ADIM_DK, sureDk + kaymaDk) * 60000,
          )
        : new Date(yeniBas.getTime() + sureDk * 60000);

      try {
        await api.saveEvent({
          id: o.event.id,
          calendarId: o.event.calendarId,
          title: o.event.title,
          description: o.event.description,
          location: o.event.location,
          startAt: rfc3339(yeniBas),
          endAt: rfc3339(yeniBit),
          allDay: false,
          rrule: o.event.rrule,
          color: o.event.color,
          reminderMin: o.event.reminderMin,
          done: o.event.done,
        });
        await yukle();
        tost(
          `${o.event.title} → ${ymd(yeniBas) === ymd(gun) ? "" : ymd(yeniBas) + " "}${saat(
            yeniBas,
          )}`,
          "iyi",
          1800,
        );
      } catch (err) {
        tost(`Taşınamadı: ${err}`, "hata");
        await yukle();
      }
    };

    const birakSar = () => void birak();
    document.addEventListener("mousemove", hareket);
    document.addEventListener("mouseup", birakSar);
    e.preventDefault();
  });
}
