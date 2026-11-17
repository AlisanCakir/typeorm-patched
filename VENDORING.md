# typeorm 0.3.99 — EtechLog vendored build

Bu repo **upstream typeorm değildir.** `typeorm@0.3.20`'nin npm'de yayınlanmış
derlenmiş paketinin, üç güvenlik açığı elle kapatılmış bir kopyasıdır.

## Neden

EtechLog mobil uygulaması typeorm 0.3.20 kullanıyor. 0.3.26+ sürümlerine
yükseltmek React Native Windows tarafında beyaz ekran hatasına yol açtığı için
yükseltme yapılamadı. Bunun yerine güvenlik düzeltmeleri bu sürüme geri
taşındı.

## Upstream'den farklar

| # | Açık | Upstream düzeltmesi | Burada |
|---|---|---|---|
| 1 | `UpdateQueryBuilder` / `SoftDeleteQueryBuilder` `orderBy`/`addOrderBy` blind SQL injection (CVSS 8.6) | 0.3.29 (`1b66c44`), 1.0.0 (`93eec63`) | `order`/`nulls` için `SelectQueryBuilder` ile aynı allowlist doğrulaması eklendi |
| 2 | `repository.save` / `repository.update` SQL injection — mysql2 `stringifyObjects` varsayılanı `false` | 0.3.26 | `MysqlDriver.createConnectionOptions` artık `stringifyObjects: true` veriyor |
| 3 | `migration:generate` template literal kod enjeksiyonu (RCE) | — | Üretilen SQL'de `\` ve `${` de kaçırılıyor, sadece backtick değil |

Değiştirilen dosyalar (her biri hem kök CommonJS build'inde hem `browser/` ESM
build'inde — React Native `browser` alanı üzerinden `browser/` build'ini
yükler, dolayısıyla ikisi de gerekli):

```
query-builder/UpdateQueryBuilder.js          browser/query-builder/UpdateQueryBuilder.js
query-builder/SoftDeleteQueryBuilder.js      browser/query-builder/SoftDeleteQueryBuilder.js
driver/mysql/MysqlDriver.js                  browser/driver/mysql/MysqlDriver.js
commands/MigrationGenerateCommand.js         (browser build'inde commands/ yok)
```

Ayrıca `package.json`: `version` `0.3.20` → `0.3.99`, `scripts` kaldırıldı
(yayınlanmış pakette kaynak yok, build script'leri anlamsız).
**Paket adı bilinçli olarak `typeorm` bırakıldı** — böylece uygulamadaki
import'ların hiçbiri değişmek zorunda kalmıyor.

`0.3.99` sürümü upstream'de mevcut değildir; bu paketin vendored olduğunu
belirtmek ve üç advisory'nin etkilenen aralıklarının (`<0.3.26`, `<0.3.29`)
dışında kalmak için seçilmiştir.

## Bakım — ÖNEMLİ

Bu paket `typeorm` adını taşıdığı ve sürümü sahte olduğu için **hiçbir SCA
aracı bu bağımlılık için yeni typeorm açıklarını bildirmeyecektir.** Yeni
typeorm advisory'lerini manuel takip etmek gerekir:

https://github.com/typeorm/typeorm/security/advisories

Asıl çözüm, RN Windows beyaz ekran sorununu çözüp upstream 0.3.29+ veya 1.0.0'a
geçmektir. Bu repo geçici bir çözümdür.

## Yeniden üretme

```sh
npm pack typeorm@0.3.20 && tar xf typeorm-0.3.20.tgz
node apply-typeorm-fixes.js ./package
```

`apply-typeorm-fixes.js` her hedef metnin tam olarak beklenen sayıda geçtiğini
doğrular; upstream dosyalar değişmişse hata verip durur.
