fn main() {
    println!("cargo:rustc-check-cfg=cfg(target_os, values(\"aeko\", \"AEKO\", \"solana\"))");
}
