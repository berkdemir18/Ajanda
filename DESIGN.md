# Design

Ajanda'nın görsel sistemi. Bu dosya **kurulmuş olanı** anlatır, niyeti değil;
kaynak `src/styles/app.css` ve `src/ui/icons.ts`.

## Konum

Kategori kanonu, dümdüz oynanmış, yüksek işçilikle. Yerleşim tanıdıktır
(Google Takvim düzeni) — fark tipografi, hizalama, renk ekonomisi ve durum
ayrıntılarından gelir. Kullanıcının seçimi: "saf kanon, karakter işçilikten
gelsin". Cila çubuğu: Spotify/Discord'un sıcak koyu yüzeyi + Things 3 /
Fantastical'ın ölçülü boşluğu.

## Renk ekonomisi (sistemin çekirdeği)

Arayüz kromu **renksizdir**. Ekranda görünen her renk bir bilgi taşır:

1. **Takvim renkleri** — içeriğin kaynağını söyler.
2. **Tek sıcak sinyal** (`--simdi`) — yalnız "şimdi" ve birincil eylem.

Başka renk yoktur. Durum renkleri (`--iyi/--uyari/--hata`) yalnız senkron
durumu ve "yapıldı" işareti içindir.

### Yüzey rampası — sıcak nötr, mavi-siyah değil

Uygulama akşam, masa lambası altında, kısa süreli açılır. Zemin bu sahneden
türetilmiştir; basamaklar gözle ayrılacak kadar açıktır (ray, üst çubuk ve
ızgara tek düzlem gibi okunmamalı).

| Belirteç | Koyu | Açık |
|---|---|---|
| `--zemin` | `#141210` | `#f6f3ee` |
| `--panel` | `#1c1815` | `#ffffff` |
| `--yuzey` | `#241f1a` | `#fbf8f4` |
| `--yuzey-2` | `#2e2822` | `#ece6dd` |
| `--cizgi` | `rgba(246,238,228,.075)` | `rgba(30,22,14,.085)` |
| `--cizgi-2` | `rgba(246,238,228,.15)` | `rgba(30,22,14,.17)` |
| `--ink` | `#f3efe9` | `#1b1815` |
| `--ink-2` | `#a9a29a` | `#5c554d` |
| `--ink-3` | `#8a8279` | `#736c64` |
| `--simdi` | `#ff6a3d` | `#cf3c14` |

`--ink-3` her iki temada da AA'yı geçecek şekilde **ölçülerek** seçildi
(koyu 4.83:1, açık 4.68:1 kendi zemininde). Göz kararı değer yok.

### Takvim paleti

Yetkili palet arka uçtadır (`src-tauri/src/sync.rs` → `PALET`) ve
`src/ui/editor.ts` → `RENKLER` ile birebir aynıdır. Google'dan gelen rastgele
renkler ağırlıklı RGB mesafesiyle bu on renge yaslanır; ekranda iki komşu mavi
değil, ayrılan aileler durur.

`#ff6a3d` `#f0a03c` `#d6c24c` `#7db86e` `#4fb6a8`
`#58a8ea` `#7f8cf2` `#a87cea` `#ea71a2` `#bc8568`

### Olay kutusu — renk üç kanalda

Bir olay, takvim rengini **gövde + kenar + başlık ucu** olmak üzere üç kanalda
taşır. Yan şerit (`border-left` > 1px) **kullanılmaz**: dedektör onu
"AI arayüzünün en tanınabilir işareti" olarak veriyor ve kullanıcının birinci
kırmızı çizgisi tam olarak bu.

| Durum | Gövde | Kenar | Yazı |
|---|---|---|---|
| normal (koyu) | renk %27 | renk %42 | renk %20 → `--ink` |
| normal (açık) | renk %40 | renk %62 | renk %34 → `--ink` |
| geçmiş (koyu) | renk %16 | renk %24 | renk %14 → `--ink-2` |
| geçmiş (açık) | renk %24 | renk %40 | renk %22 → `--ink-2` |

Geçmiş olaylar **opaklıkla soldurulmaz** — kaba opaklık rengi de silip
başlıkları grileştiriyordu. Geri çekilme, üç kanalın da sönük bir kademesiyle
yapılır; kimlik hayatta kalır.

## Tipografi

**Wix Madefor Text** (SIL OFL, `src/fonts/`, yerel paketli — uygulama
çevrimdışı da doğru görünür). Küçük boyutta okunmak için çizilmiş, sıcak
humanist bir grotesk. Sistem yüzü kullanılmaz.

Ölçek: 10px/700/0.075em versal (bölüm etiketleri) · 11–12.5px (gövde, olay) ·
13px (temel) · 15px (üst çubuk başlığı, ay hücresi gün numarası) · 22px
(hafta başlığı gün numarası) · 26px (program görünümü gün numarası).

Bütün saat ve tarih rakamları `tabular-nums`. Sütunlar birbirinden bir piksel
kaymaz.

## Izgara ve kafes

- Saat yüksekliği **54px** (`--saat-yuk`). TypeScript'teki `SAAT_YUK` ile bu
  değer **aynı olmak zorunda**; ayrıldıklarında bloklar saat çizgilerinden
  saat başına kayıyor (bir kez yaşandı, 52/54).
- Oluk 62px, ray 244px (1180px altında 214px), üst çubuk 52px.
- Yalnız tam saat çizgisi çizilir; yarım saat çizgisi yok.
- Gecenin ölü saatleri (00–06, 23+) hafifçe geri çekilir.
- Yarıçap: 6px (olay) · 9px (kontrol, girdi) · 14px (pencere).

## "Şimdi" — ekrandaki tek yazılı an

Sıcak sinyal rengiyle 2px çizgi, **yalnız bugünün sütununda**, sol ucunda
nokta. Saatini kendi taşır: oluktaki rozet. İkisini tek nesne yapan şey,
oluktan bugünün sütununa kadar uzanan %26'lık soluk bağlayıcı hattır — daha
ileri gitmez, çünkü bugün olmayan bir günde "şimdi" iddia edemez.

Açılışta bir kez: çizgi soldan uzar (560ms), rozet yerine oturur (460ms,
90ms gecikmeli). Başka giriş animasyonu yoktur. Tüm geçişler görünür bir
varsayılandan üstel yavaşlamayla: `cubic-bezier(.16,1,.3,1)`, 110/200ms.

## İkonlar

Elle çizilmiş SVG seti (`src/ui/icons.ts`): 24×24 kutu, 1.7 kalınlık, yuvarlak
uç ve birleşim, dolgusuz, `currentColor`. **Emoji ya da unicode glif
kullanılmaz.** Renkli nokta gerektiğinde `renkDiski()`.

## Marka

"A" harfi ve ortasından geçip iki yandan taşan çizgi — arayüzdeki "şimdi"
çizgisinin ta kendisi. Gün, adın içinden geçer.

- Arayüzde: **kapsız, tek renk** (`--simdi`), 22px.
- Uygulama ikonu: aynı geometri, düz turuncu yuvarlatılmış karo üzerinde beyaz
  (`src-tauri/icons/`). Gradyan ve sahte iç parlaklık **yok**; taklit malzeme
  makine yapımı tasarımın en güvenilir işareti.
- Geometri iki yerde birebir aynıdır; biri değişirse diğeri de değişmeli.

## Çizmediğimiz yüzeyler

Seçim rengi, imleç, kaydırma çubuğu, odak halkası ve tabular rakamlar
paletten türetilir. Tarayıcı varsayılanı hiçbir yerde bırakılmaz.

## Uyarlama

1180px altında ray daralır; 1000px altında ray üste biner (uygulamanın en
küçük pencere genişliği 940px, telefon görünümü yoktur). `prefers-reduced-motion`
altında tüm animasyon ve geçişler kapanır.
