      /* =============== 52 · zip export (store-only, file:// safe) =============== */
      /* Pure JS ZIP writer, no compression, no deps, no fetch, no modules.
         Exposes zipFrames(files) -> Blob and exportZip() for state.frames. */
      var ZIP_CRC_TABLE = null;
      function zipCrcTable() {
            if (ZIP_CRC_TABLE) return ZIP_CRC_TABLE;
            var t = new Uint32Array(256);
            for (var n = 0; n < 256; n++) {
                  var c = n;
                  for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
                  t[n] = c >>> 0;
            }
            ZIP_CRC_TABLE = t;
            return t;
      }
      function zipCrc32(u8) {
            var t = zipCrcTable();
            var c = 0xFFFFFFFF;
            for (var i = 0; i < u8.length; i++) c = t[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
            return (c ^ 0xFFFFFFFF) >>> 0;
      }
      function zipDosNow() {
            var d = new Date();
            var time = (((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() >> 1) & 31)) & 0xFFFF;
            var date = ((((Math.max(1980, d.getFullYear()) - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31)) & 0xFFFF;
            return { time: time, date: date };
      }
      function zipU16LE(v) {
            var b = new Uint8Array(2);
            b[0] = v & 0xFF;
            b[1] = (v >> 8) & 0xFF;
            return b;
      }
      function zipU32LE(v) {
            var b = new Uint8Array(4);
            b[0] = v & 0xFF;
            b[1] = (v >> 8) & 0xFF;
            b[2] = (v >> 16) & 0xFF;
            b[3] = (v >>> 24) & 0xFF;
            return b;
      }
      function zipConcat(parts) {
            var total = 0;
            for (var i = 0; i < parts.length; i++) total += parts[i].length;
            var out = new Uint8Array(total);
            var off = 0;
            for (var j = 0; j < parts.length; j++) {
                  out.set(parts[j], off);
                  off += parts[j].length;
            }
            return out;
      }
      function zipFrames(files) {
            var enc = new TextEncoder();
            var dos = zipDosNow();
            var chunks = [];
            var central = [];
            var offset = 0;
            var centralSize = 0;
            (files || []).forEach(function (f) {
                  var nameB = enc.encode(String(f.name || "frame.png"));
                  var data = f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data || 0);
                  var crc = zipCrc32(data);
                  var lh = zipConcat([
                        zipU32LE(0x04034B50),
                        zipU16LE(20),
                        zipU16LE(0x0800),
                        zipU16LE(0),
                        zipU16LE(dos.time),
                        zipU16LE(dos.date),
                        zipU32LE(crc),
                        zipU32LE(data.length),
                        zipU32LE(data.length),
                        zipU16LE(nameB.length),
                        zipU16LE(0)
                  ]);
                  chunks.push(lh, nameB, data);
                  var ch = zipConcat([
                        zipU32LE(0x02014B50),
                        zipU16LE(20),
                        zipU16LE(20),
                        zipU16LE(0x0800),
                        zipU16LE(0),
                        zipU16LE(dos.time),
                        zipU16LE(dos.date),
                        zipU32LE(crc),
                        zipU32LE(data.length),
                        zipU32LE(data.length),
                        zipU16LE(nameB.length),
                        zipU16LE(0),
                        zipU16LE(0),
                        zipU16LE(0),
                        zipU16LE(0),
                        zipU32LE(0),
                        zipU32LE(offset)
                  ]);
                  central.push(ch, nameB);
                  centralSize += ch.length + nameB.length;
                  offset += lh.length + nameB.length + data.length;
            });
            var centralStart = offset;
            var count = (files || []).length;
            var end = zipConcat([
                  zipU32LE(0x06054B50),
                  zipU16LE(0),
                  zipU16LE(0),
                  zipU16LE(count),
                  zipU16LE(count),
                  zipU32LE(centralSize),
                  zipU32LE(centralStart),
                  zipU16LE(0)
            ]);
            var body = chunks.concat(central);
            body.push(end);
            return new Blob(body, { type: "application/zip" });
      }
      function zipUniquePng(raw, used) {
            var base = (typeof sanitizeFileName === "function" ? sanitizeFileName(raw) : String(raw == null ? "" : raw).trim().replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64)) || "frame";
            var name = base + ".png";
            if (!used[name]) {
                  used[name] = 1;
                  return name;
            }
            var n = 2;
            while (used[base + "_" + n + ".png"]) n++;
            name = base + "_" + n + ".png";
            used[name] = 1;
            return name;
      }
      function zipCanvasToU8(cv) {
            return new Promise(function (res, rej) {
                  cv.toBlob(function (b) {
                        if (!b) {
                              rej(new Error("toBlob failed"));
                              return;
                        }
                        b.arrayBuffer().then(function (ab) {
                              res(new Uint8Array(ab));
                        }, rej);
                  }, "image/png");
            });
      }
      function exportZip() {
            if (!window.state || !state.frames || !state.frames.length) {
                  if (typeof toast === "function") toast("No frames to export", "warn");
                  return Promise.resolve(null);
            }
            var list = state.frames.filter(function (f) { return f && f.canvas; });
            if (!list.length) {
                  if (typeof toast === "function") toast("No frames to export", "warn");
                  return Promise.resolve(null);
            }
            var used = {};
            var names = list.map(function (f) { return zipUniquePng(f.name, used); });
            return Promise.all(list.map(function (f) { return zipCanvasToU8(f.canvas); })).then(function (datas) {
                  var files = datas.map(function (data, i) { return { name: names[i], data: data }; });
                  var blob = zipFrames(files);
                  if (typeof downloadBlob === "function") downloadBlob(blob, "frames.zip");
                  if (typeof toast === "function") toast("ZIP exported · " + files.length + " frames");
                  return blob;
            }).catch(function () {
                  if (typeof toast === "function") toast("ZIP export failed", "err");
                  return null;
            });
      }
      function wireZipExport() {
            var b = document.getElementById("exportZip");
            if (b && !b.dataset.zipWired) {
                  b.dataset.zipWired = "1";
                  b.addEventListener("click", function () { exportZip(); });
            }
      }
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wireZipExport);
      else wireZipExport();
