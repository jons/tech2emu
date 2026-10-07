# Card images

| Image | Built for | Size | String no. | Version | Files | Accepted by Tech2Win 2.336 |
|---|---|---|---|---|---|---|
| [tech2win_card_gm_nao_v33.004_en.bin](tech2win_card_gm_nao_v33.004_en.bin) | Tech2Win | 32 MB | 0x40000336 | 33.004 | 50 | Yes |
| [tech2_card_saab_nao_v9.250_en.bin](tech2_card_saab_nao_v9.250_en.bin) | Tech2Win | 32 MB | 0x40000336 | 9.250 | 75 | Yes |
| [tech2_card_saab_v44.000_en.bin](tech2_card_saab_v44.000_en.bin) | Real Tech2 handheld | 10 MB | 0x00000975 | 44.000 | 45 | **No**. Its string number isn't on the whitelist. |

**The two NAO cards are the reference images for the emulator.** They are what `emulator SAAB.exe` runs. The v44 card is still useful for comparison, because it contains the original pSOS+ kernel that the Tech2Win builds remove. See [the operating system section](#operating-system-psos-is-removed-in-tech2win-builds).

All three cards use the same format, described in the next section. How Tech2Win loads and runs a card is in [docs/emulator-spec.md](../docs/emulator-spec.md). You can browse any of the images in VS Code with [parsers/tech2card.js](../parsers/tech2card.js) (see [parsers/README.md](../parsers/README.md)).

## Card format

Big-endian throughout. No encryption or compression. Unused space is 0xFF (erased flash).

```
0x000000  Header (0x18 bytes)
0x000018  Directory (38-byte entries; may use up to 0x1FFDA)
0x01FF00  info.inf (on all three cards)
   ...    File data, spread across 1 MB banks
```

### Header (0x00–0x17)

| Offset | Type | Field | v44 | SAAB NAO | GM NAO |
|---|---|---|---|---|---|
| 0x00 | `char[4]` | Magic `"T2  "` | | | |
| 0x04 | `u32` | Software string number | `0x00000975` | `0x40000336` | `0x40000336` |
| 0x08 | `u16` | Unknown | `0x0028` | `0x0032` | `0x0032` |
| 0x0A | `f32` | Version | 44.0 | 9.25 | 33.004 |
| 0x0E | `u8[10]` | Tag text, padded | spaces + `0x17` | `0xFF` × 10 | `"NAO"` + `0xFF` × 7 |

Tech2Win reads the string number and version when it loads a card. It logs them as "Software Stringno: %d - Version: %0.3f" and rejects any string number not on its built-in whitelist (see the [emulator spec](../docs/emulator-spec.md#33-whitelist)).

### Directory entry (38 bytes)

| Offset | Type | Field |
|---|---|---|
| 0x00 | `char[14]` | File name in 8.3 form, padded with spaces. Compared case-insensitively. |
| 0x0E | `u16` | Bank number (1 MB each) |
| 0x10 | `u32` | Address inside the bank window, 0x200000–0x2FFFFF |
| 0x14 | `u32` | Size in bytes |
| 0x18 | `u16` | Checksum: sum of all file bytes, mod 0x10000 |
| 0x1A | `u8[12]` | Padding, 0xFF |

These rules come from Tech2Win's own directory lookup:
- **End of directory:** the first entry whose first byte is **0xFF**, or offset 0x1FFDA.
- **Deleted entry:** a first byte of **0x00**. Tech2Win marks entries deleted this way. For example, it deletes any `T2_FC.DIR` entry when it loads a card. None of the three cards has deleted entries.
- **Case:** names are matched case-insensitively. The GM card mixes upper and lower case (`SCENS.DWN`, `t3apps.dwn`).

### Address mapping

```
file offset = bank * 0x100000 + (addr - 0x200000)
```

The Tech2 sees the card one 1 MB bank at a time, through a window at 68k address 0x200000. Writing `bank << 2` to the bank register at 0x600600 selects the bank. Directory addresses are addresses inside that window, so the bank number is needed to find a file in the dump.

### Checksums

Every file with data passes its checksum, with two exceptions on the Tech2Win cards:

| File | Card | Stored | Calculated | Notes |
|---|---|---|---|---|
| `opsys.dwn` | SAAB NAO | `0x08D1` | `0x18D0` | Exactly 0x0FFF low on both Tech2Win cards. The cause is unknown. |
| `opsys.dwn` | GM NAO | `0x0277` | `0x1276` | Same 0x0FFF gap |
| `expire.dat` | GM NAO | `0x43DA` | `0x40CF` | Probably rewritten after the card was built |

Tech2Win doesn't check these checksums when it loads a card or `eprom.bin`.

Reserved areas (`*.SPS`, `*.MEM`, `*.PRT`, `SAABDTC.NFO`, `SSA_DATA`) store a checksum of `0xFFFF` and are usually empty. Some overlap other entries:
- `T3COMMON.MEM` covers `VIT1.SPS`, `VIT2.SPS` and `UTILITY.SPS` on both SAAB cards.
- On the GM card, `CALIBRAT0.SPS` sits on the same space as `vinproc.ext`.

### ROM files

Four `.dwn` files aren't run from the card. They form the Tech2's **internal 256 KB flash** (Tech2Win's `eprom.bin`), mapped at 68k address 0:

| ROM range | File | Size | Notes |
|---|---|---|---|
| 0x00000–0x03FFF | `boot.dwn` | 16,384 | Starts with the reset vectors: SSP = 0x00103954, PC = 0x00000500. String "TECH 2 BOOT". |
| 0x04000–0x05FFF | `vci_init.dwn` | 8,184 | "TECH 2 VCI INIT" |
| 0x06000–0x07FFF | `opschk.dwn` | 8,184 | "TECH 2 OPSYSCHK" |
| 0x08000–0x3FFFF | `opsys.dwn` | 229,352 | Operating system |

Tech2Win checksums `eprom.bin` in exactly these four partitions (its log line is labelled "BVCO": Boot, VCI, Check, Opsys). On the card, the four files sit together at the end of bank 7 (0x7C0000–0x7FFFE0), with 0xFF filling the gaps. `boot.dwn` and `opschk.dwn` are byte-for-byte identical on all three cards.

## Operating system: pSOS+ is removed in Tech2Win builds

| | v44 (handheld) | SAAB NAO (Tech2Win) | GM NAO (Tech2Win) |
|---|---|---|---|
| `opsys.dwn` build | Oct 05 2001 | Nov 11 2010 | Jul 12 2012 |
| Compiler runtime | SDS 4.00 (1982–1994) | Wind River 4.05 (1982–2000) | Wind River 4.05 |
| pSOS+ kernel (`PSOS+ S68010 V2.0.E`) | Present | **Removed** | **Removed** |
| pHILE+ filesystem (`pHILE+/68K V3.1.0`) | Present | **Removed** | **Removed** |
| PREP/C+ runtime (`V1.3.0`) | Present | **Removed** | **Removed** |
| Zero bytes in `opsys.dwn` | 96,213 | 178,259 | 178,262 |
| pSOS system-call stub | at +0xA2AA, followed by kernel code | at +0xAA12, followed by zeros | at +0xAA12, followed by zeros |

All three builds keep the same small system-call stub:

```
0010 0044 | 06FF A284 0000 398C 4E4B 4E75 4E4C 4E75 4E4D 0001 ...
                                TRAP#11 RTS TRAP#12 RTS TRAP#13
```

In the Tech2Win builds, about 83 KB after the stub is zeroed. On the SAAB card that's three blocks: 0x00AA26–0x00E39A, 0x00FB94–0x01DC44 and 0x01DD2C–0x02425F. In v44 those places hold the kernel and filesystem.

**This is confirmed in the emulator code.** Tech2Win finds the stub by its byte signature, then handles `TRAP #11` (pSOS+ and pHILE+ calls, keyed on D0) and `TRAP #13` (return from interrupt) itself, in the PC program. It refuses to run the original kernel ("No calls to original pSOS allowed"). The service codes and calling convention are documented in the [emulator spec](../docs/emulator-spec.md#6-operating-system-high-level-emulation-of-psos).

The SAAB and GM Tech2Win `opsys.dwn` builds differ in 603 bytes. `eprom.bin` must be built from the same card it runs with.

## tech2_card_saab_v44.000_en.bin

A SAAB card for the real handheld, software 44.000, English. It is 10 MB with 10 banks, and all 40 files with data pass their checksums. Tech2Win rejects it: string number 0x975 isn't whitelisted, so Tech2Win would report "Unidentifiable Software" and blank the card.

| File | Bank | Offset in image | Size | Contents |
|---|---|---|---|---|
| **ROM files** (see [above](#rom-files)) | | | | |
| `boot.dwn` | 7 | 0x7F7FE8 | 16,384 | Boot loader |
| `vci_init.dwn` | 7 | 0x7FBFE8 | 8,184 | VCI initialisation, `VCIINIT.DWN V3.0N` (Nov 20 2000) |
| `opschk.dwn` | 7 | 0x7FDFE8 | 8,184 | OS check |
| `opsys.dwn` | 7 | 0x7C0000 | 229,352 | Operating system, with pSOS+ |
| **Other code (68k)** | | | | |
| `api.dwn` | 7 | 0x780000 | 219,428 | Shared API library |
| `t1apps.dwn` | 1 | 0x100000 | 101,896 | Application code |
| `t3apps.dwn` | 5 | 0x500000 | 491,570 | Application code, `Release 5.000` |
| `scens.dwn` | 2 | 0x200000 | 250,234 | Scenario code |
| `scenconv.dwn` | 1 | 0x1A0000 | 32,376 | Scenario conversion |
| `dispconv.dwn` | 1 | 0x11F000 | 3,312 | Display conversion |
| `ecutable.dwn` | 1 | 0x180000 | 20 | Small table |
| **Scripts and diagnostic data** | | | | |
| `scrcode.ext` | 3 | 0x340000 | 39,580 | Script bytecode (likely) |
| `scrindex.ext` | 3 | 0x3C0000 | 1,728 | Script index |
| `script.ini` | 3 | 0x3C9000 | 326 | Script settings, plain text (e.g. "Debugger Enable") |
| `scrdbg*.ext` | 3 | 0x3E4000–0x3FF800 | 56–2,608 | Script debug tables |
| `actscr_t.ext` | 3 | 0x3C4000 | 1,090 | |
| `datastrm.ext` | 3 | 0x300000 | 63,182 | Data stream definitions |
| `datadisp.ext` | 1 | 0x120000 | 75,980 | Data display definitions |
| `dispconv.ext` | 4 | 0x400000 | 32,294 | Display conversion tables |
| `screens.ext` | 0 | 0x020000 | 38,372 | Screen definitions |
| `scenlst1.ext` | 1 | 0x160000 | 4,478 | Scenario list |
| `pstructs.ext` | 2 | 0x2E8400 | 1,360 | |
| `sev.ext` | 2 | 0x2F0000 | 6,432 | |
| `cpid.ext` | 0 | 0x0C0000 | 9,374 | |
| `ecu.ext` | 0 | 0x0D0000 | 94 | |
| `fffr.ext` | 7 | 0x740000 | 2,310 | |
| `vinproc.ext` | 0 | 0x060000 | 42,600 | VIN decoding (contains the VIN character set) |
| `ci.dat` / `ci.idx` | 2 | 0x2EAC00 / 0x2EFC00 | 3,998 / 435 | Placeholders ("Dummy Data for CodeIndex") |
| **Strings and UI** | | | | |
| `strngsen.ext` | 6 | 0x660000 | 80,670 | English strings |
| `strhdren.ext` | 6 | 0x600000 | 70,954 | English string headers |
| `docen.ext` | 4 | 0x480000 | 101,640 | English help text |
| `graphics.ext` | 7 | 0x760000 | 24,118 | Bitmaps |
| `1252font.dwn` | 7 | 0x700000 | 4,096 | Font for code page 1252 |
| **Metadata** | | | | |
| `info.inf` | 0 | 0x01FF00 | 24 | `u16 1, u16 1, u16 length`, then "SAAB Automobile AB" |
| `candiapp.blk` | 0 | 0x040000 | 41,906 | "CANdi Application", dated 09/21/01 |
| **Reserved storage (empty)** | | | | |
| `VIT1.SPS`, `VIT2.SPS`, `UTILITY.SPS` | 8 | 0x8E0000–0x8FFFFF | 4K / 4K / 120K | |
| `T3COMMON.MEM` | 8 | 0x8E0000 | 131,072 | Overlaps the three `.SPS` areas |
| `CALIBRAT.SPS` | 9 | 0x900000 | 1,048,576 | All of bank 9 |

The `.dwn` files contain common 68k instructions such as `48E7` (MOVEM.L), `4E75` (RTS), `4E71` (NOP) and `4E4E` (TRAP #14). The `.ext` files are tables or bytecode.

## tech2_card_saab_nao_v9.250_en.bin

A SAAB NAO card for Tech2Win, software 9.250, English. It is 32 MB, with data up to 0x1284D7C, and has 75 directory entries (0x18–0xB39). 53 of the 54 files with data pass their checksums. The exception is `opsys.dwn` (see [Checksums](#checksums)).

### Code files compared with v44

| File | v44 | SAAB NAO 9.250 |
|---|---|---|
| `boot.dwn`, `opschk.dwn`, `1252font.dwn`, `ecutable.dwn`, `info.inf` | | Identical to v44 |
| `opsys.dwn` | With pSOS+ | Rebuilt without pSOS+ (see [above](#operating-system-psos-is-removed-in-tech2win-builds)). Most absolute addresses move by about 0x760. |
| `vci_init.dwn` | `V3.0N`, Nov 20 2000 | `VCIINIT.DWN V3.2N`, Sep 24 2003, plus `Tech 2 POST Ver 6.2` |
| `api.dwn` | 219,428 bytes | 254,558 bytes. Has `*** MONITOR STARTED @ 57.6K ***` and a CVS path `tech2develop/tech2dev/core/source/api/nav/NavCmn.c` (2010). |
| `t3apps.dwn` | 491,570 bytes | 987,376 bytes, includes `winlocks.c` |
| `scens.dwn` | 250,234 bytes | 371,012 bytes, `canscen.c Revision 1.199` |
| `sps.dwn` | | **New**: 158,936 bytes of 68k code in bank 8 |
| `t2cfg.dwn` | | **New**: 8 bytes in bank 0 (`0483 0C00 0807 FFFF`) |

### Data files compared with v44

- **Script bytecode is split.** v44's `scrcode.ext` becomes `scrcode0.ext` (261,166 bytes), `scrcode1.ext` (127,920 bytes) and `scrcode.gbl` (32 bytes). `scrcode0.ext` begins with the same bytes as v44's `scrcode.ext` (`F0D1 0298 0101 2010`).
- **Script source is included.** `scrdbgli.ext` holds plain-text script source with line numbers (`5403 script int IdTask( SCENLISTNAME ScenLST, ...`). `scrdbgsi.ext` and `scrdbgvi.ext` hold symbol and variable names.
- **New data files:** `epid.ext`, `ddepid.ext`, `devdynm.ext`, `devschp.ext`, `tableapp.ext`, `scenmsg.ext`, `dtc95.ext`, and `saabeoln.ext` (817 KB).
- **Renamed or removed:** `pstructs.ext` becomes `pstruct1.ext` + `pstrthdr.ext`. `ci.dat` and `ci.idx` are gone.
- **Bigger string files:** `strngsen.ext` is 549 KB, `strhdren.ext` 495 KB and `docen.ext` 396 KB. `docen.ext` and `strngsen.ext` sit in banks 16–17.
- **More reserved storage:** `CALIBRAT0–3.SPS` (banks 9–12), `REPORT_0–7.PRT` and `REP_*.PRT` (banks 19–20), `SAABDTC.NFO` and `SSA_DATA` (bank 15).
- `candiapp.blk` is dated 04/19/05.

## tech2win_card_gm_nao_v33.004_en.bin

A GM North American Operations card for Tech2Win, software 33.004, English. It is 32 MB, with files spread up to bank 31, and has 50 directory entries (0x18–0x783). 42 of the 44 files with data pass their checksums; the exceptions are `opsys.dwn` and `expire.dat` (see [Checksums](#checksums)). It has the same string number as the SAAB NAO card, 0x40000336, and is the only card with a header tag (`"NAO"`).

### Compared with the SAAB NAO card

| | |
|---|---|
| Identical files | `boot.dwn`, `vci_init.dwn`, `opschk.dwn`, `1252font.dwn`, `candiapp.blk` |
| `opsys.dwn` | Another Tech2Win build (Jul 12 2012). 603 bytes differ from the SAAB build. pSOS+ is removed the same way, with the stub at the same offset. Contains `ata_drvr.c`, `GLOBMEM.C`, `core_ops.c`. |
| `api.dwn` | 254,708 bytes, `NavCmn.c 1.54 Apr 27 2009` |
| `t3apps2.dwn` | **New**: 510,276 bytes of 68k code (`c:\pilot\072520121145am\apps2\*.c`) |
| `t1apps.dwn` | 178,226 bytes (snapshot / replay code) |
| `scens.dwn`, `scenconv.dwn` | Much larger: 885,888 and 521,976 bytes |
| Data files | Much larger GM databases. `EPID.EXT` (1,024,006 bytes), `DATADISP.EXT`, `vinproc.ext`, `SCENMSG.EXT` and `datastrm.ext` are each 0.5–1 MB. `PSTRUCT1–5.EXT` and `EPID1.EXT` are new. |
| Scripts | **None.** No `scrcode*`, `scrindex`, `script.ini` or `scrdbg*` files, so the GM software doesn't use the script interpreter. |
| No SAAB files | No `saabeoln.ext`, `dtc95.ext`, `SAABDTC.NFO`, `SSA_DATA` or `*.PRT` report areas |
| New files | `expire.dat` (72 bytes at 0x1FFB8: `0704 07DF 001E 0000`, then 0xFF), `nonsps.ext`, `CALIBRAT0–5.SPS` |
| `t2cfg.dwn` | `0483 0C10 0807 FFFF` (SAAB: `0483 0C00 0807 FFFF`) |
| `info.inf` | "North American Operations" |

`expire.dat` might be a date (07 04 2015, as `u8, u8, u16`) and a 30-day period (`0x001E`). That is unconfirmed. Tech2Win's own expiry check uses a built-in table, not this file.

## Open questions

- **Header 0x08:** what the field means (0x28 on the handheld card, 0x32 on Tech2Win cards).
- **`opsys.dwn` checksum:** why it is exactly 0x0FFF low on both Tech2Win cards.
- **Load addresses for non-ROM code:** where `api.dwn`, `t1apps.dwn`, `t3apps*.dwn`, `scens.dwn` and the others are loaded or run from. They are either run from the card window or copied to RAM.
- **Script bytecode:** the format of `scrcode*.ext` on the SAAB cards. The plain-text source in `scrdbgli.ext` can be lined up with it.
- **`expire.dat` and `t2cfg.dwn`:** what their contents mean.
