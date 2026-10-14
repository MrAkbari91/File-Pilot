# Privacy and file safety

FilePilot does not upload file contents, paths, names, thumbnails, settings, or usage analytics.
Core operation is offline. npm dependency installation and release builds require network access;
the installed application does not include an updater or a cloud integration.

The SQLite index contains filenames, paths, metadata, operation records, and duplicate membership.
It is **not encrypted**. Protect your OS account and backups. JSON exports also contain paths. Image
thumbnail cache entries are in memory only and limited to 100 images.

## Folder authorization

Only explicitly selected canonical roots may be indexed. Whole-disk roots and overlapping roots are
rejected. Removing a root revokes access and deletes its index/rules, but leaves files and history.
The scanner skips links/junctions, unusual filesystem entries, configured exclusions, and unsupported
depths. Source and destination components are checked before file operations.

Windows comparison paths use lowercase; POSIX paths retain their case. Original canonical paths are
preserved. Conservative conflict checks can skip case-distinct names on case-sensitive Windows
directories. Per-volume case/Unicode behavior is not fully detected yet.

## Moves and undo

Previews do not modify files. Apply uses the server-held plan, obtains native approval, rechecks source
identity/size/mtime, and hashes content. Existing destinations are never overwritten. Same-volume
publication uses an exclusive hard link, followed by verification and source unlink. If hard links
are unavailable or the destination is on a different volume, it uses exclusive copy, verifies
SHA-256, and only then removes the source.

This deliberately avoids Node's overwrite-capable `rename()`. It is not a single atomic rename.
Filesystems, antivirus software, open files, and abrupt shutdowns can leave two copies. A failed
operation after publication retains the destination for inspection; automatic cleanup could delete
data replaced by another process. Journal entries explain interrupted/failed operations.

Cancellation stops between complete file moves. It can interrupt traversal/hashing, but the current
published copy must be verified before a move finishes. Native copy itself is not interruptible.

Undo accepts only a successful, unreversed move record with a saved content hash. The original path
must be free, the destination must be unchanged, and the original root must remain authorized.
Trash actions cannot be undone from FilePilot. Changed or interrupted moves require manual review.

Path/identity checks reduce races but cannot eliminate all time-of-check/time-of-use races with a
hostile process changing directory entries. Do not organize actively changing system/application
folders. Filesystem permissions and independent backups remain important.

## Duplicate interpretation

- **Exact**: size candidates plus streaming SHA-256, with identity checks before and after reading.
- **Name**: normalized matching filenames, platform-default case behavior; not duplicate proof.
- **Pixels**: orientation-normalized sRGB RGBA pixels and dimensions, hashed after decoding.
- **Similar**: 64-bit horizontal dHash with a configurable Hamming threshold. Every group member
  matches its representative, but not necessarily each other. The score describes hash agreement,
  not a probability or a guarantee. Flat/unrelated images can share the same perceptual hash.

PNG and lossless WebP can preserve pixels exactly. JPEG conversions and resizing usually change pixels,
so they appear only as perceptual candidates. Sharp's decoder determines actual supported formats.
GIF/TIFF use the first frame/page. Decodes are capped at 25 megapixels. Corrupt/unsupported images are
reported; BMP/HEIC/AVIF support is not promised for every platform/build.

Trash is offered only for exact groups, after native confirmation. It retains and rehashes at least
one copy and revalidates each selected source. There is no permanent-delete fallback. Multiple hard
links to the same inode are not counted as separate reclaimable copies. Estimates use file lengths,
not filesystem-allocated blocks. Reclaim estimates for name/perceptual matches are zero.
