extern crate rustc_version;
use rustc_version::{version_meta, Channel};

fn main() {
    println!("cargo:rustc-check-cfg=cfg(RUSTC_WITH_SPECIALIZATION)");
    println!("cargo:rustc-check-cfg=cfg(RUSTC_WITHOUT_SPECIALIZATION)");
    println!("cargo:rustc-check-cfg=cfg(target_os, values(\"aeko\", \"AEKO\", \"solana\"))");

    match version_meta().unwrap().channel {
        Channel::Stable | Channel::Beta => {
            println!("cargo:rustc-cfg=RUSTC_WITHOUT_SPECIALIZATION");
        }
        Channel::Nightly | Channel::Dev => {
            println!("cargo:rustc-cfg=RUSTC_WITH_SPECIALIZATION");
        }
    }
}
