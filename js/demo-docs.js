// Data pura-pura untuk MODE DEMO saja. Tidak ditulis ke Supabase dan tidak mengubah aturan akses.
// Tanggal dihitung dari hari ini supaya papan kerja tetap terasa hidup saat prototipe dibuka.

const pad = (n) => String(n).padStart(2, '0');
const iso = (offset = 0) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const at = (offset, hh = 10, mm = 0) => `${iso(offset)}T${pad(hh)}:${pad(mm)}:00`;
const woCode = (plate, day) => {
  const [y, m, dd] = day.split('-');
  return `${String(plate).toUpperCase().replace(/[^A-Z0-9]/g, '')}|${dd}-${m}-${y}`;
};

const ORDER = {
  bodyworks: ['cuci', 'bongkar', 'las', 'dempul', 'epoxy', 'sppf', 'cat', 'pc', 'rakit', 'finishing', 'qc'],
  ppf: ['cuci', 'bongkar', 'prepd', 'pasang', 'rakit', 'detailing', 'coating', 'finishing', 'qc'],
  coating: ['innerfender', 'engine', 'clay', 'exterior', 'interior', 'pc', 'coating', 'finishing', 'qc'],
  vendor: ['lepas', 'kirim', 'kerja', 'terima', 'qc', 'pasang'],
};

function stages(div, current) {
  const keys = ORDER[div];
  const cut = current ? keys.indexOf(current) : keys.length;
  const out = {};
  keys.forEach((k, i) => {
    out[k] = i < cut
      ? { s: 'done', at: at(-6 + Math.min(i, 5), 9 + (i % 6), 10), by: i % 2 ? 'kd1' : 'kb1' }
      : { s: 'todo' };
  });
  return out;
}

function doc(coll, id, data, unit_id) {
  return { coll, id, unit_id: unit_id || null, data, version: 1, updated_at: at(0, 8, 40) };
}

const dayIn = iso(-9);
const porschePlate = 'B 1234 RMD';
const porscheWo = woCode(porschePlate, dayIn);

const jobs = [
  {
    id: 'job-bsd-porsche', unit: 'rmoda-bsd',
    data: {
      no: 'WT-1048', plate: porschePlate, car: 'Porsche 911 Carrera', color: 'GT Silver', year: '2022',
      customer: 'Andi Wijaya', phone: '0812-3400-1122', loc: 'BSD', inDate: dayIn, target: iso(-2), target0: iso(-1),
      priority: 'TINGGI', divs: ['ppf'], stages: { ppf: stages('ppf', 'pasang') },
      woNo: porscheWo, note: 'Full body. Customer minta ujung rocker ikut ditutup.',
      woItems: [{ t: 'PPF full body', div: 'ppf' }, { t: 'PPF rocker panel', div: 'ppf' }],
      revs: { r1: { status: 'open', itemT: 'Ujung bemper kanan', note: 'Ada gelembung kecil setelah pasang', div: 'ppf', sumber: 'qc', at: at(-1, 14, 20), by: 'kd1' } },
      log: { l1: { at: at(-9, 9, 12), by: 'sa1', t: 'Mobil masuk, work order dibuat' }, l2: { at: at(-2, 16, 5), by: 'kb1', t: 'Target dimajukan karena antrian booth' } },
    },
  },
  {
    id: 'job-bsd-alphard', unit: 'rmoda-bsd',
    data: {
      no: 'WT-1051', plate: 'B 7781 KX', car: 'Toyota Alphard', color: 'Putih', year: '2021',
      customer: 'PT Sinar Jaya', phone: '0813-8800-2211', loc: 'BSD', inDate: iso(-6), target: iso(5),
      divs: ['bodyworks'], stages: { bodyworks: stages('bodyworks', 'cat') },
      woNo: woCode('B 7781 KX', iso(-6)),
      woItems: [{ t: 'Repaint pintu kiri', div: 'bodyworks' }, { t: 'Dempul fender', div: 'bodyworks' }],
      log: { l1: { at: at(-6, 11, 0), by: 'sa1', t: 'Mobil masuk dari asuransi' } },
    },
  },
  {
    id: 'job-lgk-bmw', unit: 'rmoda-legok',
    data: {
      no: 'WT-1054', plate: 'B 2209 LPK', car: 'BMW X5', color: 'Black Sapphire', year: '2023',
      customer: 'Lina Hartono', phone: '0817-5521-0091', loc: 'Legok', inDate: iso(-3),
      divs: ['coating'], stages: { coating: stages('coating', 'exterior') },
      woNo: woCode('B 2209 LPK', iso(-3)), perluCekSA: true, note: 'Target belum diisi Kepala Bengkel. Divisi menunggu cek SA.',
      log: { l1: { at: at(-3, 10, 40), by: 'sa2', t: 'Mobil masuk untuk coating maintenance' } },
    },
  },
  {
    id: 'job-mks-merc', unit: 'rmoda-mks',
    data: {
      no: 'WT-1039', plate: 'DD 1902 XX', car: 'Mercedes-Benz E 300', color: 'Obsidian', year: '2020',
      customer: 'Yusuf Rahman', phone: '0821-7700-3344', loc: 'Makassar', inDate: iso(-12), target: iso(-1),
      divs: ['ppf', 'coating'], stages: { ppf: stages('ppf', null), coating: stages('coating', 'coating') },
      woNo: woCode('DD 1902 XX', iso(-12)),
      log: { l1: { at: at(-12, 8, 50), by: 'sa3', t: 'Mobil masuk' } },
    },
  },
  {
    id: 'job-bsd-civic', unit: 'rmoda-bsd',
    data: {
      no: 'WT-1056', plate: 'B 4410 FR', car: 'Honda Civic RS', color: 'Abu', year: '2024',
      customer: 'Maya Putri', phone: '0812-9000-1188', loc: 'BSD', inDate: iso(-4), target: iso(6),
      divs: ['vendor'], stages: { vendor: stages('vendor', 'kerja') }, vendorName: 'Cahaya Kaca',
      woNo: woCode('B 4410 FR', iso(-4)), note: 'Kaca depan di vendor.',
      log: { l1: { at: at(-3, 15, 0), by: 'kb1', t: 'Kaca dikirim ke vendor' } },
    },
  },
  {
    id: 'job-lgk-cayenne', unit: 'rmoda-legok',
    data: {
      no: 'WT-1033', plate: 'B 9012 PO', car: 'Porsche Cayenne', color: 'Kreide', year: '2019',
      customer: 'Hendra Kusuma', phone: '0818-3330-2210', loc: 'Legok', inDate: iso(-11), target: iso(-3),
      divs: ['bodyworks'], stages: { bodyworks: stages('bodyworks', null) },
      woNo: woCode('B 9012 PO', iso(-11)), note: 'Semua tahap selesai. Menunggu serah terima.',
      log: { l1: { at: at(-1, 17, 10), by: 'kb1', t: 'QC selesai, mobil siap diserahkan' } },
    },
  },
  {
    id: 'job-mks-ioniq', unit: 'rmoda-mks',
    data: {
      no: 'WT-1028', plate: 'DD 4411 EV', car: 'Hyundai Ioniq 5', color: 'Digital Teal', year: '2023',
      customer: 'Nadia Karim', phone: '0852-1100-9090', loc: 'Makassar', inDate: iso(-14), target: iso(-7),
      divs: ['coating'], stages: { coating: stages('coating', null) },
      woNo: woCode('DD 4411 EV', iso(-14)),
      log: { l1: { at: at(-5, 13, 20), by: 'sa3', t: 'Diserahkan ke customer' } },
    },
  },
  {
    id: 'job-bsd-audi', unit: 'rmoda-bsd',
    data: {
      no: 'WT-1058', plate: 'B 1560 QZ', car: 'Audi Q7', color: 'Navarra Blue', year: '2021',
      customer: 'Kevin Tan', phone: '0812-4455-7788', loc: 'BSD', inDate: iso(-2), target: iso(8),
      divs: ['coating'], stages: { coating: stages('coating', 'clay') },
      woNo: woCode('B 1560 QZ', iso(-2)),
      log: { l1: { at: at(-2, 9, 30), by: 'sa1', t: 'Mobil masuk, cuci awal selesai' } },
    },
  },
  {
    id: 'job-lgk-hrv', unit: 'rmoda-legok',
    data: {
      no: 'WT-1052', plate: 'B 3304 HG', car: 'Honda HR-V', color: 'Merah', year: '2022',
      customer: 'Sinta Dewi', phone: '0878-2211-4455', loc: 'Legok', inDate: iso(-7), target: iso(2),
      priority: 'SEDANG', divs: ['bodyworks'], stages: { bodyworks: stages('bodyworks', 'dempul') },
      woNo: woCode('B 3304 HG', iso(-7)),
      revs: {
        r2: { status: 'fixed', itemT: 'Panel belakang', note: 'Dempul masih bergelombang, sudah dikerjakan ulang', div: 'bodyworks', sumber: 'qc', at: at(-1, 11, 15), by: 'kd1' },
        r3: { status: 'open', itemT: 'Pintu kanan', note: 'Masih belang setelah cat', div: 'bodyworks', sumber: 'komplain', at: at(-5, 9, 0), by: 'kd2' },
      },
      log: { l1: { at: at(-7, 14, 0), by: 'sa2', t: 'Mobil masuk untuk ketok pintu' } },
    },
  },
  {
    id: 'job-mks-fortuner', unit: 'rmoda-mks',
    data: {
      no: 'WT-1055', plate: 'DD 8820 FF', car: 'Toyota Fortuner', color: 'Hitam', year: '2020',
      customer: 'Arman Saleh', phone: '0813-4040-1212', loc: 'Makassar', inDate: iso(-4), target: iso(3),
      divs: ['ppf'], stages: { ppf: stages('ppf', 'bongkar') },
      woNo: woCode('DD 8820 FF', iso(-4)),
      log: { l1: { at: at(-4, 10, 5), by: 'sa3', t: 'Mobil masuk, paket PPF kap dan bemper' } },
    },
  },
];

const WORK = [
  doc('config', 'team', {
    members: {
      sa1: { role: 'sa', name: 'Kenny', loc: 'BSD' },
      sa2: { role: 'sa', name: 'Michael', loc: 'Legok' },
      sa3: { role: 'sa', name: 'Gabriel', loc: 'Makassar' },
      kb1: { role: 'kabeng', name: 'Raka Pratama', loc: 'BSD' },
      kd1: { role: 'kadiv', name: 'Dimas Ardi', div: 'ppf', loc: 'BSD' },
      kd2: { role: 'kadiv', name: 'Fajar', div: 'bodyworks', loc: 'Legok' },
    },
  }, 'rmoda-bsd'),
  doc('config', 'profiles', { names: {} }, 'rmoda-bsd'),
  doc('people', 'sa1', { name: 'Kenny', joinedAt: '2023-02-01' }, 'rmoda-bsd'),
  doc('people', 'kb1', { name: 'Raka Pratama', joinedAt: '2022-06-01' }, 'rmoda-bsd'),
  doc('people', 'kd1', { name: 'Dimas Ardi', joinedAt: '2023-08-14' }, 'rmoda-bsd'),
  doc('handover', 'h-ioniq', { wtJob: 'job-mks-ioniq', serah: iso(-5), batal: false, woCode: woCode('DD 4411 EV', iso(-14)) }, 'rmoda-mks'),
  ...jobs.map((j) => doc('jobs', j.id, j.data, j.unit)),
];

const SA = [
  doc('trx', 'trx-porsche', {
    kepada: 'Andi Wijaya', telp: '081234001122', lokasi: 'BSD', sa: 'Kenny', pic: 'Kenny',
    kend: { merk: 'Porsche', tipe: '911 Carrera', warna: 'GT Silver', plat: porschePlate },
    items: [
      { nama: 'PPF Full Body', qty: 1, harga: 28500000, div: 'ppf' },
      { nama: 'PPF Rocker Panel', qty: 1, harga: 2800000, div: 'ppf' },
    ],
    bayar: [{ jenis: 'Uang Muka', jumlah: 10000000, tgl: dayIn, metode: 'Transfer', inv: 'RMD008.11.26', rek: 'BCA 727 RMODA', buktiNama: 'dp-porsche.jpg' }],
    dp: [{ no: 'RMD008.11.26', tgl: dayIn, jumlah: 10000000 }],
    est: { no: 'SQ-11-014', tgl: dayIn },
    wo: { tglTerima: dayIn },
    dibuat: at(-9, 9, 5), diubah: at(-1, 15, 0), wtJob: 'job-bsd-porsche',
    keterangan: 'Full body. Tambahan rocker menunggu konfirmasi.',
  }, 'rmoda-bsd'),
  doc('trx', 'trx-bmw', {
    kepada: 'Lina Hartono', telp: '081755210091', lokasi: 'Legok', sa: 'Michael',
    kend: { merk: 'BMW', tipe: 'X5', warna: 'Black Sapphire', plat: 'B 2209 LPK' },
    items: [{ nama: 'Coating Maintenance', qty: 1, harga: 4500000, div: 'coating' }],
    bayar: [], est: { no: 'SQ-11-021', tgl: iso(-3) },
    dibuat: at(-3, 10, 20), diubah: at(-3, 10, 20), wtJob: 'job-lgk-bmw',
  }, 'rmoda-legok'),
  doc('trx', 'trx-alphard', {
    kepada: 'PT Sinar Jaya', telp: '081388002211', lokasi: 'BSD', sa: 'Kenny',
    kend: { merk: 'Toyota', tipe: 'Alphard', warna: 'Putih', plat: 'B 7781 KX' },
    items: [{ nama: 'Repaint Pintu Kiri', qty: 1, harga: 6500000, div: 'bodyworks' }, { nama: 'Dempul Fender', qty: 1, harga: 1800000, div: 'bodyworks' }],
    bayar: [{ jenis: 'Uang Muka', jumlah: 3000000, tgl: iso(-6), metode: 'Transfer' }, { jenis: 'Pelunasan', jumlah: 2000000, tgl: iso(-2), metode: 'Transfer' }],
    est: { no: 'SQ-11-018', tgl: iso(-6) },
    wo: { tglTerima: iso(-6) },
    fak: { no: 'INV-11-077', tgl: iso(-2) },
    dibuat: at(-6, 11, 0), diubah: at(-2, 16, 0), wtJob: 'job-bsd-alphard',
  }, 'rmoda-bsd'),
  doc('trx', 'trx-ioniq', {
    kepada: 'Nadia Karim', telp: '085211009090', lokasi: 'Makassar', sa: 'Gabriel',
    kend: { merk: 'Hyundai', tipe: 'Ioniq 5', warna: 'Digital Teal', plat: 'DD 4411 EV' },
    items: [{ nama: 'Coating Maintenance', qty: 1, harga: 4200000, div: 'coating' }],
    bayar: [{ jenis: 'Pelunasan', jumlah: 4200000, tgl: iso(-5), metode: 'QRIS' }],
    est: { no: 'SQ-10-088', tgl: iso(-14) },
    wo: { tglTerima: iso(-14) },
    fak: { no: 'INV-11-061', tgl: iso(-6) },
    serah: iso(-5),
    dibuat: at(-14, 8, 40), diubah: at(-5, 13, 20), wtJob: 'job-mks-ioniq',
  }, 'rmoda-mks'),
  doc('trx', 'trx-garage', {
    kepada: 'Garage One (contoh uji)', telp: '081800011122', lokasi: 'BSD', sa: 'Kenny',
    kend: { merk: 'Toyota', tipe: 'Land Cruiser', warna: 'Putih', plat: 'B 1814 DEMO' },
    items: [{ nama: 'Cat Repair panel', qty: 1, harga: 50000000, div: '' }, { nama: 'SPPF - Velg', qty: 1, harga: 15000000, div: 'vendor', vendor: 'Velg Jaya' }],
    bayar: [
      { id: 'pay-g1', jenis: 'DP 1', jumlah: 35000000, tgl: '2026-09-28', metode: 'Transfer', inv: 'RMD042.11.26', rek: 'BCA 727 RMODA', buktiNama: 'dp-dobel.jpg' },
      { id: 'pay-g2', jenis: 'Pelunasan', jumlah: 60000000, tgl: iso(-2), metode: 'Transfer', inv: 'RMD099.11.26', rek: 'BCA 727 RMODA', buktiNama: 'lunas-contoh.jpg' },
    ],
    est: { no: 'SQ.2026.09.00040', tgl: '2026-09-28' },
    so: { no: 'SO.2026.09.00040', tgl: '2026-09-28' },
    wo: { tglTerima: '2026-09-28' },
    woTgl: '2026-09-28',
    fak: { no: 'RMD099.11.26', tgl: iso(-2) },
    dp: [{ no: 'RMD042.11.26', tgl: '2026-09-28', jumlah: 35000000 }],
    dibuat: at(-40, 9, 0), diubah: at(-2, 11, 0),
    keterangan: 'Contoh salinan angka dobel. Bukan data mobil sungguhan.',
  }, 'rmoda-bsd'),
  doc('trx', 'trx-cayenne', {
    kepada: 'Hendra Kusuma', telp: '081833302210', lokasi: 'Legok', sa: 'Michael',
    kend: { merk: 'Porsche', tipe: 'Cayenne', warna: 'Kreide', plat: 'B 9012 PO' },
    items: [{ nama: 'Repaint bumper belakang', qty: 1, harga: 7200000, div: 'bodyworks' }],
    bayar: [{ id: 'pay-cay', jenis: 'Pelunasan', jumlah: 7200000, tgl: iso(-2), metode: 'Transfer', rek: 'BCA 727 RMODA', inv: 'RMD014.11.26', buktiNama: 'bukti-cayenne.jpg' }],
    est: { no: 'SQ.2026.11.00012', tgl: iso(-11) },
    so: { no: 'SO.2026.11.00008', tgl: iso(-11) },
    wo: { tglTerima: iso(-11) },
    fak: { no: 'RMD014.11.26', tgl: iso(-2) },
    dibuat: at(-11, 9, 0), diubah: at(-1, 17, 0), wtJob: 'job-lgk-cayenne',
  }, 'rmoda-legok'),
  doc('katalog', 'k-ppf', { kode: 'PPF-FB', nama: 'PPF Full Body', kategori: 'PPF', jenis: 'SVC', harga: 28500000, manual: true }, 'rmoda-bsd'),
  doc('katalog', 'k-rep', { kode: 'CAT-RP', nama: 'Repaint per panel', kategori: 'Repaint', jenis: 'SVC', harga: 2500000, manual: true }, 'rmoda-bsd'),
  doc('pengaturan', 'umum', {
    saList: ['Kenny', 'Michael', 'Gabriel'], lokasi: ['BSD', 'Legok', 'Makassar'], mulaiSQ: {}, mulaiSO: {}, mulaiRMD: {},
    ketFaktur: 'Keberatan apapun terhadap validitas faktur ini harus dilakukan dalam waktu tujuh (7) hari sejak tanggal faktur ini. Jika tidak, faktur ini dianggap diterima sebagai benar.\nPembayaran transfer ke Bank BCA No Rek. 5495888727 a.n. PT RMODA STUDIO INDONESIA. Barang yang dijual tidak bisa dikembalikan.',
    ketFakturLok: { BSD: '', Legok: '', Makassar: 'Keberatan apapun terhadap validitas faktur ini harus dilakukan dalam waktu tujuh (7) hari sejak tanggal faktur ini. Jika tidak, faktur ini dianggap diterima sebagai benar.\nPembayaran transfer ke Bank BCA No Rek. 5495277701 a.n. REDJEKI STUDIO MAKASSAR. Barang yang dijual tidak bisa dikembalikan.' },
    kop: {
      BSD: 'JL. Pahlawan Seribu Ruko Komersial\nBSD, Kav. 9, Lengkong Karya\nSerpong Utara\nKota Tangerang Selatan, Banten 15117',
      Legok: 'Legok, Kabupaten Tangerang\nBanten',
      Makassar: 'Makassar, Sulawesi Selatan',
    },
  }, 'rmoda-bsd'),
  doc('konf', 'konf-18', {
    no: 18, status: 'menunggu', kategori: 'Pengerjaan',
    q: 'Customer minta tambahan rocker panel. Lanjut sekarang atau tunggu DP tambahan?',
    wo: porscheWo, dibuat: at(-1, 16, 10),
  }, 'rmoda-bsd'),
  doc('konf', 'konf-17', {
    no: 17, status: 'dijawab', kategori: 'Warna',
    q: 'Warna cat pintu kiri Alphard disamakan dengan fender?',
    jawab: 'Ya, samakan dengan panel sebelah. Jangan keluar dari kode warna asuransi.', jawabOleh: 'Raka',
    wo: woCode('B 7781 KX', iso(-6)), dibuat: at(-4, 9, 0), waktuJawab: at(-4, 11, 20),
  }, 'rmoda-bsd'),
];

const CRM = [
  doc('config', 'app', { months: 6, sas: ['Kenny', 'Michael', 'Gabriel'], staff: { Kenny: { loc: 'BSD' }, Michael: { loc: 'Legok' }, Gabriel: { loc: 'Makassar' } } }, 'rmoda-bsd'),
  doc('customers', 'c-andi', { name: 'Andi Wijaya', phone: '6281234001122', sa: 'Kenny' }, 'rmoda-bsd'),
  doc('customers', 'c-yusuf', { name: 'Yusuf Rahman', phone: '6282177003344', sa: 'Gabriel' }, 'rmoda-mks'),
  doc('customers', 'c-hendra', { name: 'Hendra Kusuma', phone: '6281833302210', sa: 'Michael' }, 'rmoda-legok'),
  doc('customers', 'c-kevin', { name: 'Kevin Tan', phone: '6281244557788', sa: 'Kenny' }, 'rmoda-bsd'),
  doc('jobs', 'cj-andi', { custId: 'c-andi', plate: porschePlate, date: iso(-200), product: 'skin-elite', sa: 'Kenny', loc: 'BSD', certName: 'Andi Wijaya' }, 'rmoda-bsd'),
  doc('jobs', 'cj-yusuf', { custId: 'c-yusuf', plate: 'DD 1902 XX', date: iso(-190), product: 'pro', sa: 'Gabriel', loc: 'Makassar', certName: 'Yusuf Rahman' }, 'rmoda-mks'),
  doc('jobs', 'cj-hendra', { custId: 'c-hendra', plate: 'B 9012 PO', date: iso(-160), product: 'skin-hybrid', sa: 'Michael', loc: 'Legok', certName: 'Hendra Kusuma' }, 'rmoda-legok'),
  doc('jobs', 'cj-kevin', { custId: 'c-kevin', plate: 'B 1560 QZ', date: iso(-20), product: 'fr', sa: 'Kenny', loc: 'BSD', certName: 'Kevin Tan' }, 'rmoda-bsd'),
];

const SETORAN = [
  doc('upload', 'up-wo', { jenis: 'WO', status: 'Baru', cabang: 'BSD', tanggal: iso(0), waktu: Date.now() - 3600e3, catatan: 'WO Alphard asuransi', files: [{ nama: 'wo-alphard.jpg' }], penyetorId: 'sa1' }, 'rmoda-bsd'),
  doc('upload', 'up-nota', { jenis: 'NOTA', status: 'Baru', cabang: 'Legok', tanggal: iso(-1), waktu: Date.now() - 86400e3, catatan: 'Nota film PPF', files: [{ nama: 'nota-film.jpg' }], penyetorId: 'sa2', bayar: { st: 'belum', jt: iso(-3) } }, 'rmoda-legok'),
  doc('upload', 'up-bayar', { jenis: 'BAYAR', status: 'Diunduh', cabang: 'Makassar', tanggal: iso(-2), waktu: Date.now() - 2 * 86400e3, catatan: 'Bukti DP Ioniq', files: [{ nama: 'dp.jpg' }], penyetorId: 'sa3' }, 'rmoda-mks'),
  doc('konfirmasi', 'sk1', { status: 'Menunggu jawaban', lokasi: 'Makassar', pertanyaan: 'Stok coating menipis, boleh order 4 botol?', dari: 'Gudang', waktu: Date.now() - 7200e3 }, 'rmoda-mks'),
];

const HRD = [
  doc('karyawan', 'e1', { nama: 'Sari Dewi', lokasi: 'BSD', divisi: 'PPF', status: 'Aktif', posisi: 'Teknisi', tglMasukISO: '2024-02-12' }, 'rmoda-bsd'),
  doc('karyawan', 'e2', { nama: 'Budi Santoso', lokasi: 'Legok', divisi: 'Coating', status: 'Aktif', posisi: 'Teknisi', tglMasukISO: '2023-08-01' }, 'rmoda-legok'),
  doc('karyawan', 'e3', { nama: 'Citra Amalia', lokasi: 'Makassar', divisi: 'Admin', status: 'Training', posisi: 'Admin', tglMasukISO: iso(-40), catatan: 'training 3 bulan' }, 'rmoda-mks'),
  doc('karyawan', 'e4', { nama: 'Raka Pratama', lokasi: 'BSD', divisi: 'Bengkel', status: 'Aktif', posisi: 'Kepala Bengkel', tglMasukISO: '2022-06-01' }, 'rmoda-bsd'),
  doc('rekrutmen', 'req1', { status: 'Dibuka', jumlah: 2, posisi: 'Teknisi PPF', divisi: 'PPF', lokasi: 'BSD' }, 'rmoda-bsd'),
  doc('kasbon', 'e2', { arsip: false, entries: [{ jenis: 'Kasbon', jumlah: 1500000, tgl: iso(-30) }, { jenis: 'Bayar', jumlah: 500000, tgl: iso(-10) }] }, 'rmoda-legok'),
];

const PROFLEX = [
  doc('products', 'pf-elite', { sku: 'PF-ELITE', name: 'Proflex Elite Gloss', min: 8, opening: 3, unit: 'roll', active: true, createdAt: at(-40, 9, 0) }, 'proflex'),
  doc('products', 'pf-matte', { sku: 'PF-MATTE', name: 'Proflex Pro-Matte', min: 6, opening: 22, unit: 'roll', active: true, createdAt: at(-40, 9, 0) }, 'proflex'),
  doc('products', 'pf-hybrid', { sku: 'PF-HYB', name: 'Proflex Hybrid', min: 4, opening: 0, unit: 'roll', active: true, createdAt: at(-20, 9, 0) }, 'proflex'),
  doc('customers', 'pc1', { name: 'RMODA BSD', phone: '0811000111' }, 'proflex'),
  doc('invoices', 'pi1', {
    no: 'INV/PFX/11-014', date: iso(-12), due: iso(-4), custName: 'RMODA BSD', void: false, createdAt: at(-12, 11, 0),
    items: [{ pid: 'pf-elite', qty: 2, price: 4500000, disc: 0 }],
    payments: [{ amount: 2000000, date: iso(-11), method: 'Transfer' }],
  }, 'proflex'),
  doc('invoices', 'pi2', {
    no: 'INV/PFX/11-019', date: iso(-3), due: iso(7), custName: 'Studio Selatan', void: false, createdAt: at(-3, 14, 0),
    items: [{ pid: 'pf-matte', qty: 1, price: 3900000, disc: 0 }],
    payments: [],
  }, 'proflex'),
];

const EXPC = [
  doc('products', 'xp1', { sku: 'CQ-PRO', name: 'C.Quartz Professional 30ml', min: 12, opening: 4, unit: 'botol', active: true, openingKind: 'own', createdAt: at(-30, 9, 0) }, 'expc'),
  doc('products', 'xp2', { sku: 'RELOAD', name: 'Reload 2.0', min: 10, opening: 0, unit: 'botol', active: true, openingKind: 'own', createdAt: at(-30, 9, 0) }, 'expc'),
  doc('products', 'xp3', { sku: 'IRON', name: 'Iron Remover', min: 8, opening: 15, unit: 'botol', active: true, openingKind: 'own', createdAt: at(-30, 9, 0) }, 'expc'),
  doc('invoices', 'xi1', {
    no: 'EX-11-088', date: iso(-8), due: iso(-2), custName: 'Studio Utara', void: false, createdAt: at(-8, 10, 0),
    items: [{ pid: 'xp1', qty: 2, price: 850000, disc: 0 }], payments: [],
  }, 'expc'),
  doc('customers', 'xc1', { name: 'Studio Utara', phone: '081290001111' }, 'expc'),
  doc('aca_services', 'as1', { name: 'Kelas Detailing Dasar', code: 'ACA-01', price: 3500000, active: true, cat: 'Kelas', createdAt: at(-60, 9, 0) }, 'expc'),
  doc('aca_services', 'as2', { name: 'Kelas Paint Correction', code: 'ACA-04', price: 6500000, active: true, cat: 'Kelas', createdAt: at(-40, 9, 0) }, 'expc'),
  doc('aca_customers', 'ac1', { name: 'Raka Wirawan', phone: '081200011122' }, 'expc'),
  doc('aca_customers', 'ac2', { name: 'Intan Putri', phone: '081300022233' }, 'expc'),
  doc('aca_invoices', 'ai1', {
    no: 'ACA-11-006', date: iso(-10), due: iso(-3), custName: 'Raka Wirawan', void: false, createdAt: at(-10, 9, 0),
    items: [{ sid: 'as1', qty: 1, price: 3500000, disc: 0 }],
    payments: [{ amount: 1500000, date: iso(-10) }],
  }, 'expc'),
];

const DOCS = { work: WORK, sa: SA, crm: CRM, setoran: SETORAN, hrd: HRD, proflex: PROFLEX, expc: EXPC };
const SAMPLE_KEY = 'rmoda-portal-sample-docs';
const SOURCE_KEY = 'rmoda-portal-source';

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function sample() {
  if (sample.cache) return sample.cache;
  try {
    const raw = localStorage.getItem(SAMPLE_KEY);
    if (raw) { sample.cache = JSON.parse(raw); return sample.cache; }
  } catch (e) {}
  sample.cache = clone(DOCS);
  return sample.cache;
}
function persist() { try { localStorage.setItem(SAMPLE_KEY, JSON.stringify(sample())); } catch (e) {} }

export function demoDocs(app, coll) {
  const all = sample()[app] || [];
  const rows = coll ? all.filter((d) => d.coll === coll) : all;
  return rows.map((d) => clone(d));
}

export function demoSaveDoc(app, coll, id, data, unit) {
  const all = sample()[app] || (sample()[app] = []);
  let row = all.find((d) => d.coll === coll && d.id === id);
  const now = new Date().toISOString();
  if (!row) { row = { coll, id, unit_id: unit || null, data, version: 1, updated_at: now }; all.push(row); }
  else { row.data = data; row.updated_at = now; if (unit) row.unit_id = unit; }
  persist();
  return clone(row);
}

export function demoSources() {
  try { return { work: false, sa: false, ...(JSON.parse(localStorage.getItem(SOURCE_KEY) || '{}')) }; }
  catch (e) { return { work: false, sa: false }; }
}
export function demoSetSource(app, on) {
  const s = demoSources();
  s[app] = !!on;
  localStorage.setItem(SOURCE_KEY, JSON.stringify(s));
  return s;
}

export function demoSyncAt() {
  return at(0, 8, 40);
}
