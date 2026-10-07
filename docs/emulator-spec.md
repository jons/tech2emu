# Tech2 emulator specification (draft)

This document specifies what an emulator has to provide to run Tech2 PCMCIA card software. It is based on how Tech2Win does it. It is a starting point, not a finished spec: each statement is marked with how well it is supported.

| Mark | Meaning |
|---|---|
| **Confirmed** | Read directly from Tech2Win's code or seen in all relevant card images |
| **Likely** | Strongly suggested by the evidence, but not traced end to end |
| **Open** | Not known yet |

The card file format itself is described in [images/README.md](../images/README.md).

## 1. Sources

| Source | What it is |
|---|---|
| `emulator/emulator SAAB.exe.bin` (+ Ghidra `.xml` export) | **The Tech2Win emulator.** 32-bit Windows, built from `t2_emulator\Release\emulator.pdb`. All code addresses in this document refer to this file (image base 0x400000). |
| `Tech2Win-2.336.exe` (+ IDA `.asm`, Ghidra `.gzf`/`.xml`) | The Tech2Win **installer/launcher** (`Tech2WinSetup.pdb`). It copies `pcmcia\*.bin` images and writes registry keys under `SOFTWARE\GM\TECH2Win`. It contains no emulation code. |
| `emulator_en_GB.dll.xml` | English UI resource DLL for the emulator. |
| `images/tech2_card_saab_nao_v9.250_en.bin`, `images/tech2win_card_gm_nao_v33.004_en.bin` | Cards built for Tech2Win. These are the reference inputs. |
| `images/tech2_card_saab_v44.000_en.bin` | A card for the real handheld. Tech2Win rejects it (see 3.3). It is still useful because it contains the original pSOS+ kernel. |

The emulator's source file names survive in its log messages and show how it is organised:

| Area | Source files | Code range |
|---|---|---|
| CPU | `CPU\cpu32.c`, `qsm.c`, `sim.c`, `tpu.c`, `signals.c`, `trap_spy.c` | 0x407891–0x420F70 |
| Tech2 board | `Tech2\t2e_bus.c`, `t2e_rom.c`, `t2e_ram.c`, `t2e_pcmcia.c`, `t2e_pcmcia_0.c`, `t2e_pcmcia_1.c`, `t2e_ata.c`, `t2e_ata_fat16.c`, `t2e_display.c`, `t2e_keyboard.c`, `t2e_mux.c`, `t2e_rtc.c`, `t2e_sipo.c`, `t2e_dlc.c`, `t2e_uart2uart.c`, `t2e_uart2candi.c`, `t2e_sysinfo_log.c` | 0x42E3FB–0x453CF6 |
| HLE operating system | `pSOS\psos.c`, `task.c`, `queue.c`, `semaphore.c`, `region.c`, `timer.c`, `event.c`, `phile.c` | 0x49514D–0x49C64E |
| Vehicle interface | `CANdi\*.c`, `J2534\*.c` (CAN, Class 2, KW2000, KW81/82, …), MVCI PDU API | 0x4212ED–0x42C55B and 0x456D26–0x461175 |
| Other | `Security\security.c`, `VSP\vsp.c`, `AddOns\*.c` (data display, DTC display, ATA capture) | 0x492D16–0x4A380B |

## 2. Inputs

| Input | Size | Purpose | Status |
|---|---|---|---|
| PCMCIA card image (config key `PCMCIA_image_file`) | 10 MB or 32 MB | The card in slot 0 | Confirmed |
| `eprom.bin` | exactly 256 KB (0x40000) | The Tech2's internal flash (see 4.2) | Confirmed. The file is rejected if its size is wrong. |
| `candi.bin` | ? | CANdi module firmware | Open |
| `emulator.rtc`, `emulator.lic`, `emulator.sec`, `data\emulator.key`, `emulator.card`, `emulator.dta`, `emulator.cd` | ? | Clock state, licensing, and saved state | Open. Licensing is outside the scope of this spec. |

These files sit under a `tech2dir` working directory.

## 3. Loading the card

The loader is `0x44B0B0` (`t2e_pcmcia.c`).

### 3.1 Size

**Confirmed.** The image must be the configured card size. A larger file is rejected ("does not have the size (%dMB) expected"), and so is a short read. Only 10 MB and 32 MB cards are supported (`0x44C540`: "the card size (%d MB) is not supported").

### 3.2 Header

**Confirmed.** If the image starts with `"T2  "`, the loader reads two fields and logs them as `Software Stringno: %d - Version: %0.3f`:

| Offset | Type | Field |
|---|---|---|
| 0x04 | u32 BE | Software string number |
| 0x0A | f32 BE | Version |

### 3.3 Whitelist

**Confirmed.** `0x44B900` checks the string number against a zero-terminated table of 48 values at `0x50DDA8`. The check is skipped only when bit 0x10 of `[0x5371C8]` is set, which looks like a development mode.

If the number isn't listed, the emulator:
1. logs "Unidentifiable Software detected"
2. shows an error dialog
3. **fills the whole card buffer with 0xFF**
4. returns error 0x11

| Card | String number | Accepted |
|---|---|---|
| SAAB NAO 9.250 | 0x40000336 | Yes |
| GM NAO 33.004 | 0x40000336 | Yes |
| SAAB v44 (handheld) | 0x00000975 | **No** |

The full list is in [parsers/tech2card.js](../parsers/tech2card.js) (`TECH2WIN_STRINGNOS`).

### 3.4 Expiry

**Confirmed.** `0x44AD70` checks a built-in table at `0x50DD68`. Each record is `{u32 stringNo, f32 minVersion, f32 maxVersion, u32 expiry YYYYMMDD}`, and the date is compared with today's date. There are only three records (string numbers 0x950E, 0x916E and 0x9206, all expiring in 2016), so neither reference card is affected.

The card's own `expire.dat` (GM card) isn't used by this check. **Open:** whether the 68k firmware reads it.

### 3.5 Directory changes on load

**Confirmed.** The loader looks up `T2_FC.DIR` in the card directory (`0x44B6D0`, case-insensitive). If found, it marks the entry deleted by setting the first name byte to 0x00 and pointing it at 0x2FFFFE with size 0. None of the reference cards has this entry.

### 3.6 Other load steps

**Open:**
- `0x49A130(card, size)` is also called during load.
- The emulator keeps a registry file of "all PCMCIA images run on this computer" (`0x44BA40`).

## 4. Memory map (68332, 24-bit address bus)

### 4.1 Address decoding

**Confirmed.** The CPU-level read path is `0x41D3A0` (16-bit reads; other widths are similar):

1. If the address matches the internal standby RAM base/mask (`[0x50D3B4]`/`[0x5372C8]`), it goes to the on-chip 2 KB RAM (`0x41C7D0`).
2. If the address is below the module-register base `[0x50D3BC]`, it goes to the Tech2 board bus (`0x42FA10`).
3. Otherwise it goes to the on-chip modules at MODMAP (`[0x50D3B8]`):

| Address | Module |
|---|---|
| MODMAP \| 0x7FFA00 | SIM |
| MODMAP \| 0x7FFB00 | RAM control |
| MODMAP \| 0x7FFC00–0x7FFDFF | QSM |
| MODMAP \| 0x7FFE00–0x7FFFFF | TPU |

The board bus `0x42FA10` decodes on `addr >> 20`. 16-bit accesses to odd addresses go to `0x42F740` and return 0 (probably an address-error report).

The device names for the two slot windows are **Likely**. The windows go through function pointers that are set at start-up, and their targets haven't been traced. The slot numbering comes from the emulator's messages ("No Flash card in slot 1 allowed" when an ATA card is in use).

| 68k address | Device | Emulator code | Status |
|---|---|---|---|
| 0x000000–0x03FFFF | Internal flash, 256 KB (`eprom.bin`) | `t2e_rom.c` read `0x44DF30` | Confirmed |
| 0x040000–0x0FFFFF | Unmapped | `0x42F5F0` | Confirmed |
| 0x100000–0x1FFFFF | RAM, 1 MB | `t2e_ram.c` `0x44D920` | Confirmed |
| 0x200000–0x2FFFFF | **PCMCIA slot 0** (flash card), 1 MB bank window | function pointer `[0x5656F0]` → `t2e_pcmcia_0.c` | Confirmed |
| 0x300000–0x3FFFFF | **PCMCIA slot 1**: ATA card if one is inserted, otherwise a flash card, through the same bank window | `0x42E430` (ATA) / `[0x565710]` → `t2e_pcmcia_1.c` | Confirmed |
| 0x400000–0x4FFFFF | Unmapped | `0x42F5F0` | Confirmed |
| 0x500000–0x50000F | UART | `0x452CC0` / `0x453C20` (`t2e_uart2uart.c`) | Likely |
| 0x600000–0x6000FF | Multiplexer | `0x44AB40` (`t2e_mux.c`) | Confirmed |
| 0x600100–0x6001FF | Card status register (read-only, see 4.4) | inline in `0x42FA10` | Confirmed |
| 0x600200–0x6002FF | SIPO1 (write) | `0x44F1D0` (`t2e_sipo.c`) | Confirmed |
| 0x600300–0x6003FF | VPP (programming voltage) control (write; values 3–7) | inline | Confirmed |
| 0x600400–0x6004FF | SIPO0 (write) | `0x44F1A0` | Confirmed |
| 0x600500–0x6005FF | Read: `0x448B20`, probably the keyboard. Writes are ignored. | | Likely |
| 0x600600–0x6006FF | **Card bank register** (read/write, 8-bit) | `[0x50D74E]` | Confirmed |
| 0x700000–0x7007FF | Display controller | `0x437840` / `0x437940` (`t2e_display.c`) | Confirmed |

Memory buffers keep 68k byte order: the byte at 68k address *a* is at `buffer[a]`.

### 4.2 Internal flash (`eprom.bin`)

**Confirmed.** The ROM loader (`0x44DD00`) reads `eprom.bin` and logs one 16-bit sum per partition as `T2FLASH: BVCO=…`. The sums are only logged, never checked. The partitions match the card's four ROM files:

| Partition | ROM range | Card file | File size |
|---|---|---|---|
| **B**oot | 0x00000–0x03FFF | `boot.dwn` | 0x4000 |
| **V**CI init | 0x04000–0x05FFF | `vci_init.dwn` | 0x1FF8 |
| ops**C**hk | 0x06000–0x07FFF | `opschk.dwn` | 0x1FF8 |
| **O**psys | 0x08000–0x3FFFF | `opsys.dwn` | 0x37FE8 |

**Confirmed:** `boot.dwn` starts with a 68k reset vector table. The initial SSP is 0x00103954 (in RAM) and the initial PC is 0x00000500 (in the boot partition).

**Likely:** an emulator can build `eprom.bin` by placing each file at the start of its partition and padding with 0xFF. This also means `eprom.bin` must match the card, because the two Tech2Win cards carry different `opsys.dwn` builds (Nov 2010 and Jul 2012). The `0xFFF`-low stored checksum of `opsys.dwn` on Tech2Win cards doesn't matter here, because the emulator doesn't verify it. The flash supports Intel-style erase and program commands with a protected boot partition, and Tech2Win saves ("rescues") the image back to disk, so the 68k firmware may also reprogram it.

### 4.3 Card window and bank register

**Confirmed** (`0x42FA95`, `0x430E07`). A write to 0x6006xx stores a byte in the bank register and remaps the window (`0x4302D0`). Accesses in the slot windows are translated as:

```
card_offset = (addr & ~0x3F00000) | ((bank_reg << 18) & 0x3F00000)
```

So to read card bank *n* (1 MB), the 68k writes `n << 2` to 0x600600 and accesses 0x200000 + offset. This is the same addressing the card directory uses: `offset = bank × 0x100000 + (addr − 0x200000)`. Bank register bits 1–0 are unused.

### 4.4 Card status register (0x600100, 16-bit read)

**Likely.** The register is assembled from slot state:

| Bits | Meaning |
|---|---|
| 0x3000 | Set when slot 0 has no card |
| 0xC000 | Set when slot 1 has neither a flash card nor an ATA card |
| 0x0200 | Flag from `0x44C6A0` (slot 0) |
| 0x0040 | Flag from `0x44D550` (slot 1) |

**Open:** what the last two flags mean (ready or write-protect).

### 4.5 Flash card behaviour

**Confirmed** (`t2e_pcmcia_0.c`, `t2e_pcmcia_1.c`). The flash cards are emulated as Intel-style command-set flash:
- **Reads** work in a read-array state.
- **Erase and program** need a confirm command and the programming voltage (VPP, register 0x600300) switched on. Writing while the card is in read mode is an error.
- **Block size** is 128 KB for 10 MB cards and 256 KB for 32 MB cards.
- **Card identification strings** are `UNITY DIGITAL 32MB FLASH CARD SERIES II+` and `MR032FLF14PCG 32MB FLASH CARD SERIES SV+`.
- **Writes to the attribute memory (AMP) area** aren't implemented.

## 5. CPU

**Confirmed** (`CPU\cpu32.c`). Tech2Win interprets the CPU32 instruction set of the Motorola 68332. It also models the on-chip SIM, QSM and TPU.

| Not implemented | Behaviour |
|---|---|
| `BKPT`, `RESET`, `LPSTOP` | Logged as missing |
| `BGND` | Treated as an illegal instruction |
| `MOVEP`, `TBL*` | Implemented but flagged "not yet completely tested" |
| Odd A7 | Triggers a reset |

Emulated register file:

| Host address | Register |
|---|---|
| 0x50D230–0x50D24C | D0–D7 (u32, host byte order) |
| 0x50D250–0x50D26C | A0–A7 (A7 = active stack pointer) |
| 0x50D270 | Another stack pointer, probably the inactive USP/SSP (Likely) |
| 0x50D274 | SR (u16; the S bit 0x2000 is checked for privileged instructions) |
| 0xEFEB08 | PC (getter `0x418050`, setter `0x4183B0`) |
| 0xEFEAF8 | Current opcode word |
| 0xFBF160 | Cycle counter (u64) |

## 6. Operating system: high-level emulation of pSOS+

### 6.1 Background

The Tech2 runs **pSOS+ 68K** (Integrated Systems) with the **pHILE+** filesystem. On the handheld card (v44) the kernel is inside `opsys.dwn` (`PSOS+ S68010 V2.0.E`, `pHILE+/68K V3.1.0`). In both Tech2Win cards that code has been **removed** from `opsys.dwn` (about 83 KB of zeros). Tech2Win **reimplements the kernel and filesystem in the PC program** and intercepts the system calls. When HLE is disabled and the 68k code makes a pSOS call, Tech2Win aborts with "No calls to original pSOS allowed."

An emulator that runs the Tech2Win cards **must provide these services itself**.

### 6.2 Finding the pSOS entry

**Confirmed** (`0x418794`). The emulator searches the ROM for this 28-byte signature:

```
06FF A284 0000 398C 4E4B 4E75 4E4C 4E75 4E4D 0001 0000 0000 0000 0000
                    TRAP#11 RTS TRAP#12 RTS TRAP#13
```

When it finds it, it stores:
- `[0x537230]` ← the big-endian u32 just before the signature. That value is **0x00100044** in all three cards (a RAM address).
- `[0x50D288]` ← the signature's ROM offset + 0x1C.

If the signature isn't found, it logs "PSOS start position not found!" and resets. The search seems to run when execution first enters the opsys partition (a 0x8000 ≤ x < 0x40000 range check comes just before it; Likely).

The signature is at `opsys.dwn` + 0xA2AA in v44 and + 0xAA12 in both Tech2Win cards, which is ROM 0x12A12 for the Tech2Win cards. In the Tech2Win cards, the bytes after it are zeros.

### 6.3 Trap interception

**Confirmed** (`0x40FB35`, the TRAP instruction handler):

| Trap | When HLE is on | When HLE is off |
|---|---|---|
| `TRAP #11` | Service dispatcher `0x496470`. Also logged by `trap_spy.c`. | Fatal ("No calls to original pSOS allowed") |
| `TRAP #13` | `0x496A40`: return from interrupt. If the interrupt mask (SR bits 8–10) is 0 and a reschedule is pending, it switches tasks. | Fatal |
| Any other trap (#12, #14, …) | A normal 68k exception through the vector table | Same |

### 6.4 Calling convention

**Confirmed:**
- The service code is in **D0**.
- Arguments are on the **68k stack**, starting at SP+4, as big-endian values. The handlers read them with 16-bit bus reads.
- The result goes back in **D0** (`0x418320`).
- Each case also calls `0x407300` with a cycle cost, but in this build that function is a plain `ret`, so the costs have no effect.

### 6.5 Service codes

**Confirmed:** the codes and the source file each handler belongs to. **Likely:** the pSOS+ call names. Each group has exactly as many codes as the matching pSOS+ service family, but the order within a group isn't verified. Unlisted codes in 0x01–0x41 log "Unknown psos trap number".

| Codes | Module | Handlers | Likely pSOS+ family |
|---|---|---|---|
| 0x01–0x0B | task.c | 0x49AB20, 0x49AD30, 0x49B3C0, 0x49B010, 0x49ABF0, 0x49B4D0, 0x49B0F0, 0x49B1C0, 0x49AE10, 0x49AC90, 0x49B280 | `t_create`, `t_ident`, `t_start`, `t_restart`, `t_delete`, `t_suspend`, `t_resume`, `t_setpri`, `t_mode`, `t_setreg`, `t_getreg` (11) |
| 0x0C | Probably task.c (the handler sits between semaphore.c and task.c) | 0x49A870 | Open |
| 0x0E–0x12 | region.c | 0x4993B0, 0x499C20, 0x499630, 0x499B70, 0x49A0C0 | `rn_create`, `rn_ident`, `rn_delete`, `rn_getseg`, `rn_retseg` (5) |
| 0x24–0x2A | queue.c | 0x498990, 0x498BC0, 0x498B60, 0x498F60, 0x499130, 0x498830, 0x498D30 | `q_create`, `q_ident`, `q_delete`, `q_receive`, `q_send`, `q_urgent`, `q_broadcast` (7) |
| 0x2C–0x2D | event.c | 0x4953A0, 0x4951E0 | `ev_send`, `ev_receive` (2) |
| 0x33–0x37 | semaphore.c | 0x49A320, 0x49A4D0, 0x49A450, 0x49A780, 0x49A830 | `sm_create`, `sm_ident`, `sm_delete`, `sm_p`, `sm_v` (5) |
| 0x39–0x3C, 0x3E, 0x40, 0x41 | timer.c | 0x49BED0, 0x49BE90, 0x49BD80, 0x49C6E0, 0x49BBA0, 0x49BA90, 0x49BCE0 | `tm_*` (7 of the 9 slots in 0x39–0x41) |
| 0x204, 0x208, 0x20A, 0x20C–0x210, 0x214, 0x21C, 0x221, 0x222 | phile.c | 0x495970, 0x495480, 0x4957B0, 0x4953C0, 0x495630, 0x495820, 0x4956E0, 0x4959D0, 0x495420, 0x4955B0, 0x4958F0, 0x495530 | pHILE+ file calls (12) |

Codes 0x0D, 0x13–0x23, 0x2B, 0x2E–0x32, 0x38, 0x3D and 0x3F aren't implemented. The software on the Tech2Win cards must therefore not use pSOS+ partitions, signals/ASRs and the like.

**Open:** what the code-to-call mapping is inside each group. Two ways to settle it: read the v44 card's original pSOS+ dispatch table, which still has the kernel, or match each handler's argument count against the pSOS+ API.

### 6.6 Filesystem

**Open:** how the pHILE+ handlers map file names to card data.
- The card directory is the obvious candidate: the emulator already has a case-insensitive lookup for it (`0x44B6D0`), and its UI can list the "TECH2 directory" with checksums and deleted files.
- ATA cards in slot 1 use FAT16 (`t2e_ata_fat16.c`).
- pHILE errors are logged from `0x495DF8`–`0x496456`, which is the place to start.

## 7. Building an emulator

A suggested order:

1. **Card loader.** Check the size, header and whitelist, and build the directory index. ([tech2card.js](../parsers/tech2card.js) already shows each step.)
2. **`eprom.bin`.** Build it from the card's four ROM files (4.2).
3. **CPU32 core** with the memory map in section 4: flash at 0, RAM at 0x100000, the banked card window at 0x200000, I/O at 0x600000, display at 0x700000.
4. **Reset.** Load the vectors from ROM 0 and run `boot.dwn`.
5. **pSOS+ HLE.** Find the signature (6.2), intercept TRAP #11/#13, and implement the service codes the cards actually call. Log every code first to see which ones are used.
6. **pHILE+ HLE** on top of the card directory.
7. **Peripherals,** in the order the firmware needs them: display, keyboard, timers (TPU/SIM), serial (QSM), then the vehicle interfaces.

## 8. Open questions

- **Header field at 0x08:** 0x0028 on the handheld card, 0x0032 on both Tech2Win cards.
- **`opsys.dwn` checksum:** on both Tech2Win cards the stored value is exactly 0x0FFF below the byte sum, while on v44 it matches. It isn't checked by the emulator. Does the 68k boot code check it?
- **`expire.dat` checksum:** on the GM card the stored value is 0x030B above the byte sum. It probably gets rewritten at run time.
- **pSOS+ call names** within each group (6.5), and the argument layout of each call.
- **pHILE+ mapping** to the card directory (6.6).
- **`candi.bin`:** what it holds, and the CANdi interface (`t2e_uart2candi.c`).
- **Load steps** done by `0x49A130` and the image registry (3.6).
