// Windows surumunde konsol penceresi acilmasin.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    ajanda_lib::run()
}
