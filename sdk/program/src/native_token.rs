//! Definitions for the native AEKO token and its fractional lamports.

#![allow(clippy::arithmetic_side_effects)]

/// There are 10^9 lamports in one AEKO
pub const LAMPORTS_PER_AEKO: u64 = 1_000_000_000;

#[deprecated(since = "2.0.0", note = "Please use LAMPORTS_PER_AEKO instead")]
pub const LAMPORTS_PER_AEKO: u64 = LAMPORTS_PER_AEKO;

/// Approximately convert fractional native tokens (lamports) into native tokens (AEKO)
pub fn lamports_to_aeko(lamports: u64) -> f64 {
    lamports as f64 / LAMPORTS_PER_AEKO as f64
}

#[deprecated(since = "2.0.0", note = "Please use lamports_to_aeko instead")]
pub fn lamports_to_aeko(lamports: u64) -> f64 {
    lamports_to_aeko(lamports)
}

/// Approximately convert native tokens (AEKO) into fractional native tokens (lamports)
pub fn aeko_to_lamports(sol: f64) -> u64 {
    (sol * LAMPORTS_PER_AEKO as f64) as u64
}

#[deprecated(since = "2.0.0", note = "Please use aeko_to_lamports instead")]
pub fn aeko_to_lamports(sol: f64) -> u64 {
    aeko_to_lamports(sol)
}

use std::fmt::{Debug, Display, Formatter, Result};
pub struct Aeko(pub u64);

#[deprecated(since = "2.0.0", note = "Please use Aeko instead")]
pub type Sol = Aeko;

impl Aeko {
    fn write_in_aeko(&self, f: &mut Formatter) -> Result {
        write!(
            f,
            "AEKO {}.{:09}",
            self.0 / LAMPORTS_PER_AEKO,
            self.0 % LAMPORTS_PER_AEKO
        )
    }
}

impl Display for Aeko {
    fn fmt(&self, f: &mut Formatter) -> Result {
        self.write_in_aeko(f)
    }
}

impl Debug for Aeko {
    fn fmt(&self, f: &mut Formatter) -> Result {
        self.write_in_aeko(f)
    }
}
