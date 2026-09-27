import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const root = new URL("../public/", import.meta.url);
for (const [directory, manifestFile, field] of [
  ["brain-atlas", "manifest.json", "exportSha256"],
  ["flybody", "checksums.json", "sha256"],
]) {
  const manifest = JSON.parse(
    await readFile(new URL(`data/${directory}/${manifestFile}`, root), "utf8"),
  );
  for (const [name, digest] of Object.entries(manifest[field])) {
    const bytes = await readFile(new URL(`data/${directory}/${name}`, root));
    if (createHash("sha256").update(bytes).digest("hex") !== digest)
      throw Error(`Asset checksum mismatch: ${directory}/${name}`);
  }
}
console.log("Anatomical asset hashes verified.");
const repo = new URL("../", import.meta.url);
const chromium = JSON.parse(
  await readFile(new URL("vendor/chromium/manifest.json", repo), "utf8"),
);
for (const [path, hash] of Object.entries(chromium.sha256))
  if (
    createHash("sha256")
      .update(await readFile(new URL(path, repo)))
      .digest("hex") !== hash
  )
    throw Error(`Chromium checksum mismatch: ${path}`);
const circuit = JSON.parse(
  await readFile(new URL("data/connectome/manifest.json", root), "utf8"),
);
for (const path of [
  "src/data/connectome.json",
  "public/data/connectome/graph.json",
])
  if (
    createHash("sha256")
      .update(await readFile(new URL(path, repo)))
      .digest("hex") !== circuit.graphSha256
  )
    throw Error(`Circuit checksum mismatch: ${path}`);
console.log("Pinned Chromium and measured connectome graph hashes verified.");
