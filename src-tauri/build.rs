fn main() {
    let os = std::env::var("CARGO_CFG_TARGET_OS").unwrap();
    println!("cargo:rerun-if-changed=native");
    let mut build = cc::Build::new();
    match os.as_str() {
        "macos" => {
            build.file("native/macos.m").flag("-fobjc-arc");
            for framework in ["AppKit", "CoreGraphics", "IOKit"] {
                println!("cargo:rustc-link-lib=framework={framework}");
            }
        }
        "windows" => {
            build.file("native/windows.c");
            for lib in ["hid", "user32", "comctl32"] {
                println!("cargo:rustc-link-lib={lib}");
            }
        }
        "linux" => {
            build.file("native/linux.c");
            println!("cargo:rustc-link-lib=udev");
        }
        _ => panic!("Unsupported target"),
    }
    build.compile("ink_input");
    tauri_build::build()
}
