fn main() {
    // tauri-build, ikon dosyalarini derleme betiginin girdisi olarak
    // bildirmiyor: ikonu degistirip yeniden derlediginde Cargo build.rs'i
    // atliyor ve exe eski ikonla kaliyor. Bir kez basimiza geldi (kurulu
    // uygulama uc surum eski ikonu tasiyordu). Klasoru elle bildiriyoruz.
    println!("cargo:rerun-if-changed=icons");
    for giris in std::fs::read_dir("icons").into_iter().flatten().flatten() {
        println!("cargo:rerun-if-changed={}", giris.path().display());
    }

    tauri_build::build()
}
