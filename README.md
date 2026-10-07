# Tech2Win Reverse Engineering Project

## Project Overview
This repository contains reverse engineering analysis of the Tech2Win emulator software, specifically focused on enabling compatibility with SAAB NAO.BIN files. The goal is to create an emulator implementation that can properly load and execute SAAB diagnostic software through the Tech2 emulation environment.

## Background
Tech2Win is a PC-based emulation of the GM Tech2 diagnostic scanner tool. While officially supported for GM vehicles, this project aims to extend functionality to properly support SAAB diagnostic operations by understanding and reimplementing the emulation layer that processes the NAO.BIN firmware files.

## Project Goals
- Reverse engineer the Tech2Win emulator to understand its core architecture
- Document the flash binary format and memory mapping scheme
- Identify how the emulator initializes and executes code from the binary
- Develop a compatible emulation layer for SAAB-specific diagnostic operations
- Create a standalone implementation that can properly load and execute SAAB NAO.BIN files

## Repository Contents
- `analysis/`: Ghidra analysis exports and notes
- `docs/`: Documentation of findings, memory maps, and important structures
- `src/`: Any source code developed for the project (emulator implementation)

## Current Status
This project is in the initial reverse engineering phase. Key components being analyzed:
- Main executable structure and entry points
- Flash binary loading and parsing mechanisms
- Memory management and address translation
- Instruction decoding and execution loops
- Hardware peripheral emulation (particularly SAAB-specific peripherals)

## Tools Used
- Ghidra for static analysis and decompilation
- x64dbg for dynamic analysis and debugging
- Custom scripts for extracting and analyzing the NAO.BIN structure

## Legal Disclaimer
This project is for educational and research purposes only. All analysis is performed on legally obtained software. This project does not distribute any copyrighted code or binaries from the original Tech2Win software or SAAB NAO.BIN files. Users must legally own these files to make use of any findings or implementations from this project.

## Contributing
Contributions are welcome! If you have experience with:
- Reverse engineering
- Emulator development
- Automotive diagnostics (especially SAAB systems)
- Understanding of Tech2 or similar diagnostic tools

Please open an issue or pull request with your findings or contributions.

## Technical Details

- **[docs/emulator-spec.md](docs/emulator-spec.md)** is a draft specification of the emulator, based on `emulator/emulator SAAB.exe`. It covers:
  - the memory map, card bank switching and internal flash layout
  - card loading and validation
  - the CPU32 register file
  - how Tech2Win replaces the pSOS+ kernel, including its TRAP #11 service codes
  - key function addresses
- **[images/README.md](images/README.md)** covers the PCMCIA card image (NAO.BIN) format and the three reference cards.
- **[parsers/](parsers/)** has a Binary File Viewer parser for browsing card images in VS Code.

`Tech2Win-2.336.exe` is the Tech2Win **installer**, not the emulator. The emulation code is in `emulator/emulator SAAB.exe`.

## License
This project's original code and documentation are licensed under [appropriate license]

## Contact
For questions or collaboration, please open an issue in this repository.
