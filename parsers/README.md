# Parsers

Parsers for the [Binary File Viewer](https://github.com/maziac/binary-file-viewer) VS Code extension (`maziac.binary-file-viewer`).

| Parser | Opens |
|---|---|
| [tech2card.js](tech2card.js) | Tech2 PCMCIA card images: any file starting with the magic `T2  ` |

## Setup

1. Install the Binary File Viewer extension.
2. Tell the extension where the parsers are. This repo's [.vscode/settings.json](../.vscode/settings.json) already does this:

   ```json
   {
       "binary-file-viewer.parserFolders": [
           "C:\\work\\tech2emu\\parsers"
       ]
   }
   ```

   The path is absolute. If your clone is somewhere else, change it to match.
3. Reload the VS Code window.
4. Right-click a card image, e.g. [images/tech2win_card_gm_nao_v33.004_en.bin](../images/tech2win_card_gm_nao_v33.004_en.bin), and choose **Open With… → Binary File Viewer**.

## What tech2card.js shows

| Section | Contents |
|---|---|
| **Header** | Software string number, version, and tag text. Expand for the raw fields. |
| **Tech2Win 2.336** | Whether Tech2Win would accept the card. It checks the string number against Tech2Win's whitelist and that the card is 10 or 32 MB. |
| **Directory** | One row per entry, with its physical offset, bank and size. Deleted entries are labelled `(deleted)`. Expand an entry to see its fields. |
| **Files** | Each file at its physical location, with a type label, its checksum result, and any overlap with another entry. Expand a file to see a hex dump. |
| **Internal flash** | Where the four ROM files (`boot`, `vci_init`, `opschk`, `opsys`) go in the 256 KB internal flash (`eprom.bin`). |
| **Banks** | The raw 1 MB banks as hex dumps, each with the bank register value that selects it. |

Checksum results:

| Label | Meaning |
|---|---|
| `checksum OK` | The stored checksum matches |
| `checksum BAD (0x…)` | It doesn't; the calculated value is shown |
| `checksum 0x0FFF low (known Tech2Win opsys quirk)` | The gap seen in `opsys.dwn` on every Tech2Win card |
| `unchecked` | Reserved areas, whose stored checksum is `0xFFFF` |

The whitelist is copied from `emulator SAAB.exe` 2.336 (`TECH2WIN_STRINGNOS` in the parser). Other Tech2Win versions may accept different cards.

Hex dumps are generated only when you expand them, so large images stay responsive.

The card format is described in [images/README.md](../images/README.md), and how Tech2Win uses it in [docs/emulator-spec.md](../docs/emulator-spec.md).

## Writing or changing a parser

- The extension's API reference is its [help.md](https://github.com/maziac/binary-file-viewer/blob/main/assets/local/help/help.md).
- `read(n)` doesn't move the offset straight away. The offset moves forward at the start of the next `read`. To jump to a position, call `setOffset(x)` before `read(n)`.
- Inside a parser, `getData()` returns the bytes of the last `read` as an array of numbers. The checksum check uses it.
- Only some JavaScript built-ins are available in the parser sandbox (`Math`, `Array`, `ArrayBuffer`, `DataView`, `Map`, `JSON`, …). `Uint8Array` isn't one of them, so the version float is decoded with a `DataView`.
- Endianness defaults to little. `tech2card.js` calls `setEndianness('big')` because the card was written for a 68k CPU.
