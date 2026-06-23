// commit-and-tag-version custom updater: marketplace.json carries its version
// nested at `plugins[0].version`, so the default JSON updater (top-level
// `version`) can't see it. Keep this in sync with the version-files rule in
// AGENTS.md (package.json + plugin.json + marketplace.json move together).
module.exports.readVersion = (contents) => JSON.parse(contents).plugins[0].version;

module.exports.writeVersion = (contents, version) => {
  const json = JSON.parse(contents);
  json.plugins[0].version = version;
  return `${JSON.stringify(json, null, 2)}\n`;
};
