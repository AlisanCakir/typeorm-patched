#!/usr/bin/env node
/**
 * typeorm 0.3.20 -> 0.3.99 vendored güvenlik yamaları.
 *
 * Kullanım: node apply-typeorm-fixes.js /path/to/package
 *
 * Her değişiklik, hedef metnin dosyada TAM OLARAK beklenen sayıda geçmesini
 * şart koşar. Geçmezse script hata verip hiçbir şey yazmadan çıkar.
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.argv[2];
if (!ROOT) {
    console.error("Kullanım: node apply-typeorm-fixes.js <paket-dizini>");
    process.exit(1);
}

let changed = 0;

/** Bir dosyada old -> new değişimini, tam `count` kez geçtiğini doğrulayarak yapar. */
function patch(relPath, old, nw, count) {
    const file = path.join(ROOT, relPath);
    const before = fs.readFileSync(file, "utf8");
    const hits = before.split(old).length - 1;
    if (hits !== count) {
        throw new Error(
            `${relPath}: beklenen ${count} eşleşme, bulunan ${hits}\n--- aranan ---\n${old}`,
        );
    }
    fs.writeFileSync(file, before.split(old).join(nw));
    console.log(`  ✓ ${relPath} (${count} nokta)`);
    changed += count;
}

// ---------------------------------------------------------------------------
// FIX 1 — GHSA: UpdateQueryBuilder / SoftDeleteQueryBuilder blind SQL injection
//
// orderBy/addOrderBy, `order` parametresini doğrulamadan SQL'e birleştiriyor.
// SelectQueryBuilder'daki mevcut doğrulamanın aynısını ekliyoruz.
// Upstream düzeltmesi: 0.3.29 (1b66c44) / 1.0.0 (93eec63)
// ---------------------------------------------------------------------------

const GUARD_CJS = (fn) => `    ${fn}(sort, order = "ASC", nulls) {
        if (order !== undefined && order !== "ASC" && order !== "DESC")
            throw new error_1.TypeORMError(\`${fn} "order" can accept only "ASC" and "DESC" values.\`);
        if (nulls !== undefined &&
            nulls !== "NULLS FIRST" &&
            nulls !== "NULLS LAST")
            throw new error_1.TypeORMError(\`${fn} "nulls" can accept only "NULLS FIRST" and "NULLS LAST" values.\`);`;

const GUARD_ESM = (fn) => `    ${fn}(sort, order = "ASC", nulls) {
        if (order !== undefined && order !== "ASC" && order !== "DESC")
            throw new TypeORMError(\`${fn} "order" can accept only "ASC" and "DESC" values.\`);
        if (nulls !== undefined &&
            nulls !== "NULLS FIRST" &&
            nulls !== "NULLS LAST")
            throw new TypeORMError(\`${fn} "nulls" can accept only "NULLS FIRST" and "NULLS LAST" values.\`);`;

console.log("FIX 1: UpdateQueryBuilder / SoftDeleteQueryBuilder orderBy allowlist");
for (const builder of ["UpdateQueryBuilder", "SoftDeleteQueryBuilder"]) {
    for (const fn of ["orderBy", "addOrderBy"]) {
        const sig = `    ${fn}(sort, order = "ASC", nulls) {`;
        // CommonJS build (Node / Jest)
        patch(`query-builder/${builder}.js`, sig, GUARD_CJS(fn), 1);
        // ESM browser build -- React Native'in GERÇEKTEN yüklediği build
        patch(`browser/query-builder/${builder}.js`, sig, GUARD_ESM(fn), 1);
    }
}

// ---------------------------------------------------------------------------
// FIX 2 — GHSA: mysql/mysql2 sqlstring `stringifyObjects` varsayılanı false
//
// Nesne değerleri `objectToValues` ile kolon ataması olarak yorumlanıyor ve
// saldırgan ekstra kolon enjekte edebiliyor. Sürücüye güvenli varsayılanı
// açıkça veriyoruz. Upstream düzeltmesi: 0.3.26
// ---------------------------------------------------------------------------

console.log("FIX 2: MysqlDriver stringifyObjects güvenli varsayılanı");
const MYSQL_OLD = `        return Object.assign({}, {
            charset: options.charset,`;
const MYSQL_NEW = `        return Object.assign({}, {
            // Güvenlik: sqlstring'in nesne değerleri kolon atamasına çevirmesini
            // engeller (SQL injection). Bilinçli olarak ezmek isteyen
            // \`extra.stringifyObjects\` ile ezebilir.
            stringifyObjects: true,
            charset: options.charset,`;
patch("driver/mysql/MysqlDriver.js", MYSQL_OLD, MYSQL_NEW, 1);
patch("browser/driver/mysql/MysqlDriver.js", MYSQL_OLD, MYSQL_NEW, 1);

// ---------------------------------------------------------------------------
// FIX 3 — GHSA: migration:generate template literal kod enjeksiyonu (RCE)
//
// Üretilen migration dosyasında SQL, JS template literal'ı içine gömülüyor ve
// yalnızca backtick kaçırılıyor; `${...}` canlı interpolasyon olarak kalıyor.
// Ters bölü ve `${` de kaçırılmalı. (browser build'inde commands/ yok.)
// ---------------------------------------------------------------------------

console.log("FIX 3: MigrationGenerateCommand template literal kaçışı");
const TPL_OLD = '.replace(new RegExp("`", "g"), "\\\\`")';
const TPL_NEW =
    '.replace(/\\\\/g, "\\\\\\\\").replace(/`/g, "\\\\`").replace(/\\$\\{/g, "\\\\${")';
patch("commands/MigrationGenerateCommand.js", TPL_OLD, TPL_NEW, 2);

// ---------------------------------------------------------------------------
// package.json — sürümü vendored sürüme çek. İsim `typeorm` olarak KALIR,
// böylece uygulamadaki import'ların hiçbiri değişmez.
// ---------------------------------------------------------------------------

console.log("package.json sürümü");
const pkgPath = path.join(ROOT, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
if (pkg.name !== "typeorm") throw new Error(`beklenmeyen paket adı: ${pkg.name}`);
if (pkg.version !== "0.3.20") throw new Error(`beklenmeyen sürüm: ${pkg.version}`);
pkg.version = "0.3.99";
// Yayınlanmış pakette kaynak yok; build/test script'leri git kurulumunda
// çalışmaya kalkmasın.
delete pkg.scripts;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
console.log("  ✓ version 0.3.20 -> 0.3.99, scripts kaldırıldı");

console.log(`\nToplam ${changed} kod noktası yamalandı.`);
