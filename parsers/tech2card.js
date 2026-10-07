/**
 * Binary File Viewer parser for GM/SAAB Tech2 PCMCIA card images.
 * https://github.com/maziac/binary-file-viewer
 *
 * Format reference: images/README.md and docs/emulator-spec.md.
 *
 * Layout (all big-endian):
 *   0x0000  header, 0x18 bytes
 *             char  magic[4]     "T2  "
 *             u32   stringNo     software string number (Tech2Win whitelists these)
 *             u16   unknown
 *             f32   version      e.g. 44.0, 9.25, 33.004
 *             u8    tag[10]      text such as "NAO", padded with spaces or 0xFF
 *   0x0018  directory, 38-byte entries; ends at the first entry whose first
 *           byte is 0xFF (or at offset 0x1FFDA). A first byte of 0x00 marks a
 *           deleted entry.
 *             char  name[14]     space padded, compared case-insensitively
 *             u16   bank         1 MB flash bank
 *             u32   addr         address in the 0x200000-0x2FFFFF bank window
 *             u32   size
 *             u16   checksum     16-bit sum of all file bytes
 *             u8    pad[12]      0xFF
 *   File data lives at  bank * 0x100000 + (addr - 0x200000).
 */

registerFileType((fileExt, filePath, fileData) => {
	if (fileData.getFileSize() < 0x18)
		return false;
	const magic = fileData.getBytesAt(0, 4);
	return String.fromCharCode(...magic) === 'T2  ';
});

registerParser(() => {
	const HEADER_SIZE = 0x18;
	const ENTRY_SIZE = 38;
	const DIR_LIMIT = 0x1FFDA;	// emulator stops scanning here
	const BANK_SIZE = 0x100000;
	const BANK_WINDOW = 0x200000;
	const MB = 0x100000;

	// Software string numbers accepted by Tech2Win 2.336 (emulator SAAB.exe, table at 0x50DDA8).
	const TECH2WIN_STRINGNOS = [
		0x40000532, 0xB5B6, 0xB195, 0x6CC4, 0xE1D6, 0x9A43, 0xCB22, 0xCB21, 0x916E, 0x7728,
		0xD61A, 0x7751, 0x9206, 0xD619, 0x7726, 0x92B4, 0x950A, 0xD618, 0x775D, 0x775E,
		0xD61B, 0x3597, 0x5BA5, 0x772C, 0x950C, 0x950D, 0x01FC, 0x1FDD, 0xACD7, 0x758C,
		0x40000336, 0x40000341, 0x4000033F, 0x46A1, 0xB193, 0xB191, 0xB192, 0xD16D, 0xD16F, 0xD16E,
		0x1FDE, 0x7724, 0x950E, 0xC825, 0xD617, 0x5A32, 0x5A33, 0x12FBA0,
	];

	// Internal 256 KB flash (Tech2Win: eprom.bin), built from these card files.
	const ROM_LAYOUT = [
		{ name: 'boot.dwn', start: 0x00000, size: 0x04000, label: 'B' },
		{ name: 'vci_init.dwn', start: 0x04000, size: 0x02000, label: 'V' },
		{ name: 'opschk.dwn', start: 0x06000, size: 0x02000, label: 'C' },
		{ name: 'opsys.dwn', start: 0x08000, size: 0x38000, label: 'O' },
	];

	const hex = (v, digits) => '0x' + v.toString(16).toUpperCase().padStart(digits, '0');

	const describe = (name) => {
		const lower = name.toLowerCase();
		if (lower.includes('font'))
			return 'font';
		const rom = ROM_LAYOUT.find(r => r.name === lower);
		if (rom)
			return '68k code, ROM ' + hex(rom.start, 5);
		const ext = lower.split('.').pop();
		switch (ext) {
			case 'dwn': return '68k code';
			case 'ext': return 'data / script';
			case 'sps':
			case 'mem':
			case 'prt': return 'reserved storage';
			default: return '';
		}
	};

	const bytesToFloat = (bytes) => {
		const view = new DataView(new ArrayBuffer(4));
		bytes.forEach((b, i) => view.setUint8(i, b));
		return view.getFloat32(0, false);
	};

	const printable = (bytes) => bytes
		.filter(b => b >= 0x20 && b < 0x7F)
		.map(b => String.fromCharCode(b))
		.join('').trim();

	setEndianness('big');
	setOffset(0);
	const fileSize = getRemainingSize();

	// --- Header ---
	setOffset(4);
	read(4);
	const stringNo = getNumberValue();
	setOffset(0x0A);
	read(4);
	const version = bytesToFloat(getData());
	setOffset(0x0E);
	read(10);
	const tag = printable(getData());

	setOffset(0);
	read(HEADER_SIZE);
	addRow('Header', 'v' + version.toFixed(3), 'string no ' + hex(stringNo, 8) + (tag ? ', "' + tag + '"' : ''));
	addDetails(() => {
		read(4);
		addRow('Magic', getStringValue());
		read(4);
		addRow('String number', getHexValue(), 'software string number');
		read(2);
		addRow('Unknown', getHexValue(), '0x28 on the handheld card, 0x32 on Tech2Win cards');
		read(4);
		addRow('Version', version.toFixed(3), 'big-endian float32');
		read(10);
		addRow('Tag', getHexValue(), tag ? '"' + tag + '"' : 'padding');
	}, false);

	// --- Tech2Win compatibility ---
	const sizeOk = fileSize === 10 * MB || fileSize === 32 * MB;
	const listed = TECH2WIN_STRINGNOS.includes(stringNo);
	setOffset(4);
	read(4);
	addRow('Tech2Win 2.336', (listed && sizeOk) ? 'accepted' : 'rejected',
		(listed ? 'string number whitelisted' : 'string number not whitelisted ("Unidentifiable Software")')
		+ ', ' + (sizeOk ? (fileSize / MB) + ' MB card' : 'size is not 10 or 32 MB'));

	// --- Collect directory entries ---
	const entries = [];
	let off = HEADER_SIZE;
	while (off < DIR_LIMIT && off + ENTRY_SIZE <= fileSize) {
		setOffset(off);
		read(1);
		const first = getNumberValue();
		if (first === 0xFF)
			break;
		setOffset(off);
		read(14);
		const name = getStringValue().replace(/\0/g, ' ').trim();
		read(2);
		const bank = getNumberValue();
		read(4);
		const addr = getNumberValue();
		read(4);
		const size = getNumberValue();
		read(2);
		const checksum = getNumberValue();
		const phys = bank * BANK_SIZE + (addr - BANK_WINDOW);
		entries.push({ name, bank, addr, size, checksum, phys, dirOffset: off, deleted: first === 0x00 });
		off += ENTRY_SIZE;
	}
	const dirSize = off - HEADER_SIZE;
	const live = entries.filter(e => !e.deleted);
	const findEntry = (name) => live.find(e => e.name.toLowerCase() === name);

	// Entries that share card space with an earlier entry
	for (const e of live) {
		const other = live.find(o => o !== e && o.size > 0 && e.size > 0
			&& o.phys < e.phys + e.size && e.phys < o.phys + o.size && live.indexOf(o) < live.indexOf(e));
		if (other)
			e.overlaps = other.name;
	}

	// --- Directory table ---
	setOffset(HEADER_SIZE);
	read(dirSize);
	const deletedCount = entries.length - live.length;
	addRow('Directory', live.length + ' entries' + (deletedCount ? ', ' + deletedCount + ' deleted' : ''));
	addDetails(() => {
		for (const e of entries) {
			read(ENTRY_SIZE);
			addRow(e.deleted ? '(deleted) ' + e.name : e.name, hex(e.phys, 7), 'bank ' + e.bank + ', ' + e.size + ' bytes');
			addDetails(() => {
				read(14);
				addRow('Name', getStringValue());
				read(2);
				addRow('Bank', getDecimalValue());
				read(4);
				addRow('Address', getHexValue(), 'physical ' + hex(e.phys, 7));
				read(4);
				addRow('Size', getDecimalValue());
				read(2);
				addRow('Checksum', getHexValue());
				read(12);
				addRow('Padding', getHexValue());
			}, false);
		}
	}, true);

	// --- File contents ---
	const checksumStatus = (e, sum) => {
		if (e.checksum === 0xFFFF && sum !== 0xFFFF)
			return 'unchecked';
		if (sum === e.checksum)
			return 'checksum OK';
		const lower = e.name.toLowerCase();
		if (lower === 'opsys.dwn' && ((sum - e.checksum) & 0xFFFF) === 0x0FFF)
			return 'checksum 0x0FFF low (known Tech2Win opsys quirk)';
		return 'checksum BAD (' + hex(sum, 4) + ')';
	};

	setOffset(HEADER_SIZE + dirSize);
	read(0);
	addRow('Files', '', 'contents at their physical offsets');
	addDetails(() => {
		for (const e of live) {
			if (e.phys < 0 || e.phys + e.size > fileSize) {
				setOffset(HEADER_SIZE);
				read(0);
				addRow(e.name, '', 'out of range: ' + hex(e.phys, 7));
				continue;
			}
			setOffset(e.phys);
			read(e.size);
			let sum = 0;
			for (const b of getData())
				sum = (sum + b) & 0xFFFF;
			const notes = [describe(e.name), checksumStatus(e, sum)];
			if (e.overlaps)
				notes.push('overlaps ' + e.overlaps);
			addRow(e.name, e.size + ' bytes', notes.filter(n => n).join(', '));
			addDetails(() => {
				read(e.size);
				addMemDump();
			}, false);
		}
	}, true);

	// --- Internal flash (eprom.bin) ---
	setOffset(0);
	read(0);
	const romFiles = ROM_LAYOUT.map(r => ({ r, e: findEntry(r.name) }));
	addRow('Internal flash', romFiles.every(x => x.e) ? '256 KB' : 'incomplete',
		'eprom.bin layout built from the card\'s ROM files');
	addDetails(() => {
		for (const { r, e } of romFiles) {
			if (!e) {
				setOffset(0);
				read(0);
				addRow(r.label + ' ' + hex(r.start, 5), r.name, 'missing from card');
				continue;
			}
			setOffset(e.phys);
			read(e.size);
			const fits = e.size <= r.size;
			addRow(r.label + ' ' + hex(r.start, 5) + '-' + hex(r.start + r.size - 1, 5), r.name,
				e.size + ' of ' + r.size + ' bytes' + (fits ? '' : ' - TOO LARGE'));
			addDetails(() => {
				read(e.size);
				addMemDump();
			}, false);
		}
	}, false);

	// --- Raw banks ---
	setOffset(0);
	read(0);
	addRow('Banks', Math.ceil(fileSize / BANK_SIZE) + ' x 1 MB', 'raw flash');
	addDetails(() => {
		for (let b = 0; b * BANK_SIZE < fileSize; b++) {
			const start = b * BANK_SIZE;
			setOffset(start);
			read(Math.min(BANK_SIZE, fileSize - start));
			addRow('Bank ' + b, hex(start, 7), 'bank register value ' + hex(b << 2, 2));
			addDetails(() => {
				read(Math.min(BANK_SIZE, fileSize - start));
				addMemDump();
			}, false);
		}
	}, false);
});
